import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createApiRateLimiter } from '../../server/saas/http/security';
import { legacyUserApiDisabled } from '../../server/saas/legacy';

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
});
