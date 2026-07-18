import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createApiRateLimiter } from '../../server/saas/http/security';
import { legacyCommerceApiDisabled, legacyUserApiDisabled } from '../../server/saas/legacy';

describe('legacy API hardening', () => {
  it.each([
    ['post', '/api/user/security/2fa/enable'],
    ['post', '/api/user/security/2fa/disable'],
    ['get', '/api/user/profile?username=admin'],
    ['post', '/api/user/avatar'],
    ['post', '/api/user/profile'],
    ['post', '/api/user/security/password'],
    ['get', '/api/user/favorites?username=admin'],
    ['post', '/api/user/favorites'],
    ['delete', '/api/user/favorites/article-1?username=admin'],
  ] as const)('returns 410 for %s %s', async (method, path) => {
    const app = express();
    app.use(express.json());
    app.use('/api/user', legacyUserApiDisabled);

    const response = await request(app)[method](path).send({
      username: 'admin', oldPassword: 'unsafe', newPassword: 'unsafe-next', profileData: { password: 'injected' },
    });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'LEGACY_USER_API_DISABLED',
        message: 'Legacy user APIs are disabled. Use authenticated /api/v1 APIs.',
      },
    });
  });

  it('removes the username-trusting and plaintext-password legacy implementation from server source', async () => {
    const source = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');

    expect(source).toContain("app.use('/api/user', legacyUserApiDisabled)");
    expect(source).not.toMatch(/\.password\s*===\s*oldPassword/);
    expect(source).not.toMatch(/\.password\s*=\s*newPassword/);
    expect(source).not.toMatch(/users\[userIndex\]\s*=\s*\{\s*\.\.\.users\[userIndex\],\s*\.\.\.profileData/);
    expect(source).not.toMatch(/app\.(?:get|post|delete)\('\/api\/user/);
  });

  it('uses the versioned error envelope when the shared API rate limit is exceeded', async () => {
    const app = express();
    app.use('/api', createApiRateLimiter({ limit: 1, windowMs: 60_000 }));
    app.get('/api/v1/test', (_request, response) => response.json({ success: true, data: {} }));

    expect((await request(app).get('/api/v1/test')).status).toBe(200);
    const limited = await request(app).get('/api/v1/test');

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
    });
  });

  it('installs the extracted limiter before the versioned router', async () => {
    const source = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');

    expect(source.indexOf("app.use('/api', createApiRateLimiter")).toBeLessThan(
      source.indexOf("app.use('/api/v1', saasRuntime.router)"),
    );
  });

  it.each([
    ['get', '/api/store/catalog'],
    ['get', '/api/commerce/me?username=admin'],
    ['get', '/api/commerce/orders?username=admin'],
    ['get', '/api/commerce/demo'],
    ['post', '/api/commerce/demo'],
    ['post', '/api/commerce/orders'],
    ['post', '/api/payments/notify'],
  ] as const)('retires unauthenticated legacy commerce endpoint %s %s', async (method, path) => {
    const app = express();
    app.use(express.json());
    app.use(['/api/commerce', '/api/store', '/api/payments'], legacyCommerceApiDisabled);

    const response = await request(app)[method](path).send({
      username: 'admin', provider: 'mock', enabled: true, orderId: 'foreign-order',
    });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'LEGACY_COMMERCE_API_DISABLED',
        message: 'Legacy commerce APIs are disabled. Use /api/v1/catalog and /api/v1/orders.',
      },
    });
  });

  it('removes direct legacy commerce declarations and mutation helpers from server source', async () => {
    const source = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');

    expect(source).toContain("app.use(['/api/commerce', '/api/store', '/api/payments'], legacyCommerceApiDisabled)");
    expect(source).not.toMatch(/app\.(?:get|post|delete)\('\/api\/(?:commerce|store|payments)/);
    expect(source).not.toMatch(/createPaymentIntent|applyOrderEntitlement|settleOrder|commerceSettings/);
    expect(source).not.toMatch(/const\s+\{\s*username,\s*type,\s*provider/);
  });

  it('does not trust forwarded-for headers unless proxy trust is explicitly enabled', async () => {
    const app = express();
    app.use('/api', createApiRateLimiter({ limit: 1, windowMs: 60_000, maxBuckets: 10 }));
    app.get('/api/v1/test', (_request, response) => response.json({ success: true, data: {} }));

    expect((await request(app).get('/api/v1/test').set('X-Forwarded-For', '198.51.100.1')).status).toBe(200);
    expect((await request(app).get('/api/v1/test').set('X-Forwarded-For', '198.51.100.2')).status).toBe(429);
  });

  it('keeps distinct client buckets within the configured hard cap', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    const limiter = createApiRateLimiter({
      limit: 100,
      windowMs: 60_000,
      maxBuckets: 2,
      trustProxy: true,
    });
    app.use('/api', limiter);
    app.get('/api/v1/test', (_request, response) => response.json({ success: true, data: {} }));

    for (let index = 0; index < 25; index += 1) {
      await request(app).get('/api/v1/test').set('X-Forwarded-For', `198.51.100.${index + 1}`);
    }

    expect(limiter.bucketCount).toBeLessThanOrEqual(2);
  });

  it('uses Express-derived client IP only with explicit trusted-proxy configuration', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    app.use('/api', createApiRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxBuckets: 10,
      trustProxy: true,
    }));
    app.get('/api/v1/test', (_request, response) => response.json({ success: true, data: {} }));

    expect((await request(app).get('/api/v1/test').set('X-Forwarded-For', '198.51.100.1')).status).toBe(200);
    expect((await request(app).get('/api/v1/test').set('X-Forwarded-For', '198.51.100.2')).status).toBe(200);
    expect((await request(app).get('/api/v1/test').set('X-Forwarded-For', '198.51.100.1')).status).toBe(429);
  });

  it('configures server proxy trust and bucket bounds explicitly from environment', async () => {
    const source = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');

    expect(source).toContain('resolveTrustProxy(process.env)');
    expect(source).toContain("app.set('trust proxy', trustProxyMode)");
    expect(source).toContain('RATE_LIMIT_MAX_BUCKETS');
    expect(source).toMatch(/trustProxy:\s*trustProxyMode\s*!==\s*false/);
  });
});
