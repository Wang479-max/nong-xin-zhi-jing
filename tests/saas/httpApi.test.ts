import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../server/saas/auth/service';
import { createAccessAuthMiddleware, createFeatureGuard } from '../../server/saas/auth/middleware';
import { BillingService } from '../../server/saas/billing/service';
import { createAuthConfig } from '../../server/saas/config';
import { EmailVerificationError, type EmailVerificationService } from '../../server/saas/email/service';
import { EntitlementService } from '../../server/saas/entitlements/service';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';
import { createSaasRouter, SAAS_REFRESH_COOKIE_NAME } from '../../server/saas/router';

const SECRET = 'test-access-token-secret-that-is-longer-than-thirty-two-characters';
const PASSWORD = 'StrongPassword#123';

describe('versioned SaaS HTTP API', () => {
  it('accepts an email-code request without returning the code or exposing account existence', async () => {
    const { app, verificationService } = createTestApp();

    const response = await request(app)
      .post('/api/v1/auth/email-code')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ email: 'grower@example.com', purpose: 'register' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      success: true,
      data: { accepted: true, retryAfterSeconds: 60, expiresInSeconds: 300 },
    });
    expect(JSON.stringify(response.body)).not.toContain('123456');
    expect(verificationService.sendCode).toHaveBeenCalledWith({
      email: 'grower@example.com',
      purpose: 'register',
      ip: '203.0.113.10',
    });
  });

  it('registers a public owner, returns only public session data, and sets the refresh cookie', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/v1/auth/register').send({
      email: ' New.Farmer@Example.COM ',
      password: PASSWORD,
      verificationCode: '123456',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        user: {
          email: 'new.farmer@example.com',
          displayName: 'new.farmer',
          accountStatus: 'active',
          platformRole: 'user',
        },
        membership: { role: 'owner' },
        entitlement: { plan: 'free', features: ['monitoring.basic'] },
        accessToken: expect.any(String),
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|refreshToken/i);
    expect(response.headers['set-cookie']?.[0]).toEqual(expect.stringContaining(`${SAAS_REFRESH_COOKIE_NAME}=`));
    expect(response.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect(response.headers['set-cookie']?.[0]).toMatch(/SameSite=Lax/i);
    expect(response.headers['set-cookie']?.[0]).toMatch(/Path=\/api\/v1\/auth/i);
    expect(response.headers['set-cookie']?.[0]).toMatch(/Max-Age=3600/i);
    expect(response.headers['set-cookie']?.[0]).not.toMatch(/Secure/i);
  });

  it('maps duplicate registration to a stable conflict without leaking internals', async () => {
    const { app } = createTestApp();
    await request(app).post('/api/v1/auth/register').send({
      email: 'duplicate@example.com', password: PASSWORD, verificationCode: '123456',
    });

    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'DUPLICATE@EXAMPLE.COM', password: PASSWORD, verificationCode: '654321',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ success: false, error: { code: 'EMAIL_TAKEN', message: 'Email is already registered.' } });
    expect(JSON.stringify(response.body)).not.toMatch(/stack|sql|hash|jwt/i);
  });

  it('normalizes login and rejects wrong credentials with the same stable error', async () => {
    const { app } = createTestApp();
    await register(app, 'login-user');

    const login = await request(app).post('/api/v1/auth/login').send({
      email: ' LOGIN-USER@EXAMPLE.COM ', password: PASSWORD,
    });
    const wrong = await request(app).post('/api/v1/auth/login').send({
      email: 'login-user@example.com', password: 'wrong',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.email).toBe('login-user@example.com');
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  });

  it('resets a verified password without exposing whether an account exists', async () => {
    const { app } = createTestApp();
    await register(app, 'reset-user');

    const reset = await request(app).post('/api/v1/auth/password-reset').send({
      email: 'reset-user@example.com',
      password: 'NewStrongPassword#456',
      verificationCode: '654321',
    });
    const unknown = await request(app).post('/api/v1/auth/password-reset').send({
      email: 'unknown@example.com',
      password: 'NewStrongPassword#456',
      verificationCode: '654321',
    });
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'reset-user@example.com',
      password: 'NewStrongPassword#456',
    });

    expect(reset.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(reset.body).toEqual({ success: true, data: { reset: true } });
    expect(unknown.body).toEqual(reset.body);
    expect(login.status).toBe(200);
  });

  it('maps verification throttling to 429 with Retry-After', async () => {
    const { app, verificationService } = createTestApp();
    vi.mocked(verificationService.sendCode).mockRejectedValueOnce(
      new EmailVerificationError('TOO_MANY_REQUESTS', 42),
    );

    const response = await request(app).post('/api/v1/auth/email-code').send({
      email: 'grower@example.com',
      purpose: 'register',
    });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('42');
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many verification requests.',
        retryAfterSeconds: 42,
      },
    });
  });

  it.each([
    ['INVALID_EMAIL', 400],
    ['INVALID_CODE', 400],
    ['CODE_EXPIRED', 410],
    ['CODE_LOCKED', 429],
    ['EMAIL_DELIVERY_UNAVAILABLE', 503],
    ['VERIFICATION_UNAVAILABLE', 503],
  ] as const)('maps verification error %s to status %i', async (code, status) => {
    const { app, verificationService } = createTestApp();
    vi.mocked(verificationService.sendCode).mockRejectedValueOnce(new EmailVerificationError(code));

    const response = await request(app).post('/api/v1/auth/email-code').send({
      email: 'grower@example.com',
      purpose: 'register',
    });

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toMatch(/stack|smtp|redis|password/i);
  });

  it('rotates refresh cookies and rejects replay of the consumed cookie', async () => {
    const { app } = createTestApp();
    const registered = await registerResponse(app, 'rotate-user');
    const originalCookie = registered.headers['set-cookie'][0];

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalCookie);
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalCookie);

    expect(rotated.status).toBe(200);
    expect(rotated.headers['set-cookie'][0]).not.toBe(originalCookie);
    expect(rotated.body.data).toHaveProperty('accessToken');
    expect(rotated.body.data).not.toHaveProperty('refreshToken');
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns stable refresh errors for missing or malformed cookies', async () => {
    const { app } = createTestApp();

    const missing = await request(app).post('/api/v1/auth/refresh');
    const malformed = await request(app).post('/api/v1/auth/refresh').set('Cookie', `${SAAS_REFRESH_COOKIE_NAME}=%`);

    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('logs out idempotently, revokes the refresh token, and clears the same cookie path', async () => {
    const { app } = createTestApp();
    const registered = await registerResponse(app, 'logout-user');
    const cookie = registered.headers['set-cookie'][0];

    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    const logoutAgain = await request(app).post('/api/v1/auth/logout');
    const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(logout.status).toBe(200);
    expect(logoutAgain.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toMatch(new RegExp(`^${SAAS_REFRESH_COOKIE_NAME}=;`));
    expect(logout.headers['set-cookie'][0]).toMatch(/Path=\/api\/v1\/auth/i);
    expect(refresh.status).toBe(401);
  });

  it('requires exact bearer syntax and rejects tampered tokens', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'bearer-user');

    const missing = await request(app).get('/api/v1/me');
    const malformed = await request(app).get('/api/v1/me').set('Authorization', `bearer ${session.accessToken}`);
    const tampered = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}x`);

    for (const response of [missing, malformed, tampered]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_ACCESS_TOKEN');
    }
  });

  it('rejects validly signed tokens whose identity or role claims differ from current context', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'claim-user');
    const claims = jwt.decode(session.accessToken) as jwt.JwtPayload;
    const forged = jwt.sign({
      sub: claims.sub,
      org: claims.org,
      platformRole: 'platform_admin',
      membershipRole: 'owner',
    }, SECRET, { algorithm: 'HS256', expiresIn: 15 * 60 });

    const response = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects a repository context whose authoritative user id differs from the subject claim', async () => {
    const repository = new ExplodingContextRepository();
    const { app } = createTestApp('mock', repository);
    const session = await register(app, 'subject-user');
    repository.returnDifferentUser = true;

    const response = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('sanitizes unexpected authoritative-context failures instead of misreporting token validity', async () => {
    const repository = new ExplodingContextRepository();
    const { app } = createTestApp('mock', repository);
    const session = await register(app, 'context-error-user');
    repository.explode = true;

    const response = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
    expect(JSON.stringify(response.body)).not.toContain('database credential leaked');
  });

  it('returns authoritative profile, free entitlements, and authenticated catalog data', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'profile-user');
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const me = await request(app).get('/api/v1/me').set(auth);
    const entitlements = await request(app).get('/api/v1/entitlements').set(auth);
    const catalog = await request(app).get('/api/v1/catalog').set(auth);

    expect(me.body.data.user.email).toBe('profile-user@example.com');
    expect(entitlements.body.data).toMatchObject({ plan: 'free', limits: { aiMonthly: 5 } });
    expect(catalog.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'addon.ai.pro', amountFen: 9900 })]));
    expect((await request(app).get('/api/v1/catalog')).status).toBe(401);
  });

  it('creates a server-priced order and returns the same order for a repeated idempotent request', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'order-user');
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const first = await request(app).post('/api/v1/orders').set(auth).send({
      productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-one', amountFen: 1, status: 'paid', organizationId: 'other',
    });
    const second = await request(app).post('/api/v1/orders').set(auth).send({
      productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-one',
    });

    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ amountFen: 9900, currency: 'CNY', status: 'pending' });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('settles a tenant order in mock mode and grants AI entitlement', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'settle-user');
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    const order = await request(app).post('/api/v1/orders').set(auth).send({
      productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'settle-one',
    });

    const settlement = await request(app).post(`/api/v1/orders/${order.body.data.id}/mock-settle`).set(auth);

    expect(settlement.status).toBe(200);
    expect(settlement.body.data.order.status).toBe('paid');
    expect(settlement.body.data.entitlement.features).toEqual(expect.arrayContaining(['monitoring.basic', 'ai.diagnosis']));
  });

  it('returns a stable conflict when mock payment is disabled', async () => {
    const { app } = createTestApp('disabled');
    const session = await register(app, 'disabled-user');
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    const order = await request(app).post('/api/v1/orders').set(auth).send({
      productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'disabled-one',
    });

    const response = await request(app).post(`/api/v1/orders/${order.body.data.id}/mock-settle`).set(auth);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_MODE_DISABLED');
  });

  it('does not enumerate or settle another tenant order', async () => {
    const { app } = createTestApp();
    const buyer = await register(app, 'tenant-buyer');
    const outsider = await register(app, 'tenant-outsider');
    const order = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'tenant-order' });

    const response = await request(app).post(`/api/v1/orders/${order.body.data.id}/mock-settle`)
      .set('Authorization', `Bearer ${outsider.accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('lists only the authenticated membership organization orders newest first', async () => {
    const { app } = createTestApp();
    const buyer = await register(app, 'listing-buyer');
    const outsider = await register(app, 'listing-outsider');
    const buyerAuth = { Authorization: `Bearer ${buyer.accessToken}` };
    const outsiderAuth = { Authorization: `Bearer ${outsider.accessToken}` };
    await request(app).post('/api/v1/orders').set(buyerAuth)
      .send({ productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'buyer-first' });
    const newest = await request(app).post('/api/v1/orders').set(buyerAuth)
      .send({ productId: 'pro', quantity: 1, idempotencyKey: 'buyer-second' });
    await request(app).post('/api/v1/orders').set(outsiderAuth)
      .send({ productId: 'enterprise', quantity: 1, idempotencyKey: 'outsider-only' });

    const listed = await request(app).get('/api/v1/orders').set(buyerAuth);

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(2);
    expect(listed.body.data[0].id).toBe(newest.body.data.id);
    expect(listed.body.data.every((order: { organizationId: string }) => order.organizationId === buyer.organization.id)).toBe(true);
    expect(JSON.stringify(listed.body.data)).not.toContain(outsider.organization.id);
    expect((await request(app).get('/api/v1/orders')).status).toBe(401);
  });

  it('rejects malformed settlement identifiers before repository access', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'invalid-order-id-user');

    const response = await request(app).post('/api/v1/orders/not-a-uuid/mock-settle')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('denies an unentitled feature with exact upgrade data', async () => {
    const { app } = createTestApp();
    const session = await register(app, 'feature-user');

    const response = await request(app).get('/api/v1/private-ai')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'FEATURE_REQUIRED',
        message: 'This feature requires an upgrade.',
        feature: 'ai.diagnosis',
        upgradePath: '/market',
      },
    });
  });

  it('maps oversized and malformed JSON to stable errors without parser internals', async () => {
    const { app } = createTestApp();
    const oversized = await request(app).post('/api/v1/auth/register')
      .set('Content-Type', 'application/json')
      .send({ username: 'large-user', password: PASSWORD, padding: 'x'.repeat(70 * 1024) });
    const malformed = await request(app).post('/api/v1/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' } });
  });
});

function createTestApp(
  paymentMode: 'mock' | 'disabled' = 'mock',
  repository: MemorySaasRepository = new MemorySaasRepository(),
) {
  const authConfig = createAuthConfig({
    accessTokenSecret: SECRET,
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlSeconds: 60 * 60,
  });
  const verificationService = {
    sendCode: vi.fn(async () => ({
      accepted: true as const,
      retryAfterSeconds: 60,
      expiresInSeconds: 300,
    })),
    consumeCode: vi.fn(async () => {}),
  } satisfies Pick<EmailVerificationService, 'sendCode' | 'consumeCode'>;
  const authService = new AuthService(repository, authConfig, verificationService);
  const entitlementService = new EntitlementService(repository);
  const billingService = new BillingService(repository, { paymentMode });
  const dependencies = {
    repository,
    authService,
    entitlementService,
    billingService,
    verificationService,
    refreshTokenTtlSeconds: authConfig.refreshTokenTtlSeconds,
    secureCookies: false,
  };
  const app = express();
  app.set('trust proxy', 1);
  app.get(
    '/api/v1/private-ai',
    createAccessAuthMiddleware({ repository, authService }),
    createFeatureGuard(entitlementService, 'ai.diagnosis'),
    (_req, res) => res.json({ success: true, data: { allowed: true } }),
  );
  app.use('/api/v1', createSaasRouter(dependencies));
  return { app, repository, authService, entitlementService, billingService, verificationService };
}

class ExplodingContextRepository extends MemorySaasRepository {
  explode = false;
  returnDifferentUser = false;

  override async findUserContext(userId: string) {
    if (this.explode) throw new Error('database credential leaked');
    const context = await super.findUserContext(userId);
    if (!context || !this.returnDifferentUser) return context;
    return {
      ...context,
      user: { ...context.user, id: 'different-user' },
      membership: { ...context.membership, userId: 'different-user' },
    };
  }
}

async function register(app: express.Express, username: string): Promise<{ accessToken: string; organization: { id: string } }> {
  const response = await registerResponse(app, username);
  expect(response.status).toBe(201);
  return response.body.data;
}

function registerResponse(app: express.Express, identity: string) {
  return request(app).post('/api/v1/auth/register').send({
    email: `${identity}@example.com`,
    password: PASSWORD,
    verificationCode: '123456',
  });
}
