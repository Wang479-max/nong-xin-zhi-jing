import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapPlatformAdmin } from '../../server/saas/admin/bootstrap';
import { createAccessAuthMiddleware, createFeatureGuard } from '../../server/saas/auth/middleware';
import { EntitlementService } from '../../server/saas/entitlements/service';
import { createSaasRuntimeFromEnv } from '../../server/saas';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';

const PASSWORD = 'StrongAdmin#12345';
const SECRET = 'runtime-access-token-secret-that-is-longer-than-thirty-two-characters';

describe('secure platform admin bootstrap', () => {
  it('creates and promotes a missing admin with a cost-12 hash and no refresh session', async () => {
    const repository = new MemorySaasRepository();

    const context = await bootstrapPlatformAdmin(repository, {
      email: ' Admin@Example.COM ',
      password: PASSWORD,
      displayName: 'admin',
    });
    const credential = await repository.findUserByEmail('admin@example.com');

    expect(context.user).toMatchObject({
      username: 'admin@example.com',
      email: 'admin@example.com',
      displayName: 'admin',
      accountStatus: 'active',
      platformRole: 'platform_admin',
    });
    expect(credential?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare(PASSWORD, credential!.passwordHash)).toBe(true);
  });

  it('requires the supplied password to match an existing credential before promotion', async () => {
    const repository = new MemorySaasRepository();
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const existing = await repository.createUserWithOrganization({
      email: 'existing-admin@example.com',
      displayName: 'Existing user',
      passwordHash,
      emailVerifiedAt: new Date().toISOString(),
    });

    await expect(bootstrapPlatformAdmin(repository, {
      email: 'existing-admin@example.com',
      password: 'WrongPassword#123',
      displayName: 'admin',
    }))
      .rejects.toMatchObject({ code: 'ADMIN_BOOTSTRAP_FAILED', message: 'Platform admin bootstrap failed.' });
    await expect(repository.findUserContext(existing.user.id)).resolves.toMatchObject({ user: { platformRole: 'user' } });
  });

  it('is idempotent for an existing administrator with the correct password', async () => {
    const repository = new MemorySaasRepository();

    const first = await bootstrapPlatformAdmin(repository, {
      email: 'admin@example.com', password: PASSWORD, displayName: 'admin',
    });
    const second = await bootstrapPlatformAdmin(repository, {
      email: 'admin@example.com', password: PASSWORD, displayName: 'admin',
    });

    expect(second.user.id).toBe(first.user.id);
    expect(second.user.platformRole).toBe('platform_admin');
  });

  it('normalizes the display name when promoting an existing account', async () => {
    const repository = new MemorySaasRepository();
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    await repository.createUserWithOrganization({
      email: 'admin@example.com',
      displayName: 'Existing grower',
      passwordHash,
      emailVerifiedAt: new Date().toISOString(),
    });

    const context = await bootstrapPlatformAdmin(repository, {
      email: 'admin@example.com',
      password: PASSWORD,
      displayName: 'admin',
    });

    expect(context.user).toMatchObject({
      email: 'admin@example.com',
      displayName: 'admin',
      platformRole: 'platform_admin',
    });
  });

  it('converges concurrent bootstrap attempts on one administrator', async () => {
    const repository = new MemorySaasRepository();

    const [first, second] = await Promise.all([
      bootstrapPlatformAdmin(repository, {
        email: 'race-admin@example.com', password: PASSWORD, displayName: 'admin',
      }),
      bootstrapPlatformAdmin(repository, {
        email: 'race-admin@example.com', password: PASSWORD, displayName: 'admin',
      }),
    ]);

    expect(first.user.id).toBe(second.user.id);
    await expect(repository.findUserByEmail('race-admin@example.com')).resolves.toMatchObject({
      user: { platformRole: 'platform_admin' },
    });
  });

  it('bootstraps only when both explicit environment credentials are present', async () => {
    const emailOnly = await createSaasRuntimeFromEnv({
      NODE_ENV: 'test', ACCESS_TOKEN_SECRET: SECRET, ADMIN_EMAIL: 'admin@example.com', PAYMENT_MODE: 'disabled',
    });
    const both = await createSaasRuntimeFromEnv({
      NODE_ENV: 'test',
      ACCESS_TOKEN_SECRET: SECRET,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: PASSWORD,
      PAYMENT_MODE: 'mock',
    });

    await expect(emailOnly.repository.findUserByEmail('admin@example.com')).resolves.toBeNull();
    await expect(both.authService.login({ email: 'admin@example.com', password: PASSWORD })).resolves.toMatchObject({
      user: { email: 'admin@example.com', displayName: 'admin', platformRole: 'platform_admin' },
    });
    await emailOnly.close();
    await both.close();
  });

  it('allows a bootstrapped administrator through every feature guard', async () => {
    const runtime = await createSaasRuntimeFromEnv({
      NODE_ENV: 'test',
      ACCESS_TOKEN_SECRET: SECRET,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: PASSWORD,
      PAYMENT_MODE: 'mock',
    });
    const session = await runtime.authService.login({ email: 'admin@example.com', password: PASSWORD });
    const app = express();
    app.get(
      '/private-control',
      createAccessAuthMiddleware(runtime),
      createFeatureGuard(runtime.entitlementService, 'device.control'),
      (_req, res) => res.json({ success: true, data: { allowed: true } }),
    );

    const response = await request(app).get('/private-control').set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    await runtime.close();
  });

  it('does not allow public registration to assign a platform role', async () => {
    const runtime = await createSaasRuntimeFromEnv({ NODE_ENV: 'test', ACCESS_TOKEN_SECRET: SECRET, PAYMENT_MODE: 'mock' });
    const app = express();
    app.use('/api/v1', runtime.router);

    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'self-admin@example.com',
      password: PASSWORD,
      verificationCode: '123456',
      platformRole: 'platform_admin',
      role: 'platform_admin',
    });

    expect(response.status).toBe(400);
    expect(await runtime.repository.findUserByEmail('self-admin@example.com')).toBeNull();
    await runtime.close();
  });

  it('requires production database and auth secret while development may generate an ephemeral secret', async () => {
    await expect(createSaasRuntimeFromEnv({ NODE_ENV: 'production', ACCESS_TOKEN_SECRET: SECRET }))
      .rejects.toThrow(/DATABASE_URL/);
    await expect(createSaasRuntimeFromEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://app:pass@db.example/saas' }))
      .rejects.toThrow(/ACCESS_TOKEN_SECRET/);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const runtime = await createSaasRuntimeFromEnv({ NODE_ENV: 'development' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ephemeral/i));
    expect(runtime.paymentMode).toBe('mock');
    await runtime.close();
    warn.mockRestore();
  });

  it('defaults payment to disabled unless development mode is explicit', async () => {
    const runtime = await createSaasRuntimeFromEnv({ ACCESS_TOKEN_SECRET: SECRET });

    expect(runtime.paymentMode).toBe('disabled');
    await runtime.close();
  });
});
