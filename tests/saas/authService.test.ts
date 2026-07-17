import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthConfig, loadAuthConfig } from '../../server/saas/config';
import { AuthService } from '../../server/saas/auth/service';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';

const accessTokenSecret = 'test-access-token-secret-that-is-at-least-32-characters';
const password = 'StrongPass123!';

const authConfig = (overrides: Record<string, unknown> = {}) =>
  createAuthConfig({
    accessTokenSecret,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
    ...overrides,
  });

const createService = (overrides: Record<string, unknown> = {}) => {
  const repo = new MemorySaasRepository();
  return { repo, service: new AuthService(repo, authConfig(overrides)) };
};

const refreshHash = (token: string) => createHash('sha256').update(token).digest('hex');

afterEach(() => vi.useRealTimers());

describe('AuthService', () => {
  it('registers every public user as a normal owner and hashes the password', async () => {
    const { repo, service } = createService();

    const result = await service.register({ username: ' Grower ', password });
    const stored = await repo.findUserByUsername('grower');

    expect(result.user).toMatchObject({ username: 'grower', platformRole: 'user' });
    expect(result.membership.role).toBe('owner');
    expect(stored!.passwordHash).not.toBe(password);
    expect(bcrypt.getRounds(stored!.passwordHash)).toBe(12);
  });

  it('normalizes usernames before login', async () => {
    const { service } = createService();
    await service.register({ username: 'Grower', password });

    await expect(service.login({ username: '  GROWER  ', password })).resolves.toMatchObject({
      user: { username: 'grower' },
    });
  });

  it('rejects an invalid password without returning tokens', async () => {
    const { service } = createService();
    await service.register({ username: 'grower', password });

    await expect(service.login({ username: 'grower', password: 'WrongPass123!' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('uses the same invalid-credentials error for unknown usernames', async () => {
    const { service } = createService();
    await service.register({ username: 'grower', password });

    const wrongPassword = service.login({ username: 'grower', password: 'WrongPass123!' });
    const unknownUsername = service.login({ username: 'missing', password });

    await expect(wrongPassword).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(unknownUsername).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects weak passwords and public role-bearing registration input with stable validation errors', async () => {
    const { service } = createService();

    await expect(service.register({ username: 'grower', password: 'password' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.register({ username: 'grower', password, platformRole: 'platform_admin' } as never))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('issues a 15-minute HS256 access token with the exact authorization claims', async () => {
    const { service } = createService();
    const result = await service.register({ username: 'grower', password });
    const claims = jwt.verify(result.accessToken, accessTokenSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;

    expect(claims).toMatchObject({
      sub: result.user.id,
      org: result.organization.id,
      platformRole: 'user',
      membershipRole: 'owner',
    });
    expect(claims.exp! - claims.iat!).toBe(15 * 60);
  });

  it('stores only a SHA-256 hash of a cryptographically sized refresh token', async () => {
    const { repo, service } = createService();
    const result = await service.register({ username: 'grower', password });
    const stored = await repo.findRefreshSession(refreshHash(result.refreshToken));

    expect(Buffer.from(result.refreshToken, 'base64url')).toHaveLength(32);
    expect(stored).toMatchObject({ tokenHash: refreshHash(result.refreshToken), userId: result.user.id, revokedAt: null });
    expect(stored!.tokenHash).not.toBe(result.refreshToken);
  });

  it('rotates refresh sessions and rejects reuse of the revoked token', async () => {
    const { repo, service } = createService();
    const registered = await service.register({ username: 'grower', password });

    const refreshed = await service.refresh(registered.refreshToken);

    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);
    expect(await repo.findRefreshSession(refreshHash(registered.refreshToken)))
      .toMatchObject({ revokedAt: expect.any(String) });
    expect(await repo.findRefreshSession(refreshHash(refreshed.refreshToken)))
      .toMatchObject({ revokedAt: null, userId: registered.user.id });
    await expect(service.refresh(registered.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('rejects expired refresh sessions with a stable error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const { service } = createService({ refreshTokenTtlSeconds: 1 });
    const result = await service.register({ username: 'grower', password });
    vi.advanceTimersByTime(1_001);

    await expect(service.refresh(result.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('rejects a missing refresh token with the same stable error', async () => {
    const { service } = createService();

    await expect(service.refresh(undefined as never)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('revokes refresh sessions on idempotent logout without exposing token existence', async () => {
    const { service } = createService();
    const result = await service.register({ username: 'grower', password });

    await expect(service.logout(result.refreshToken)).resolves.toBeUndefined();
    await expect(service.logout(result.refreshToken)).resolves.toBeUndefined();
    await expect(service.logout('missing-token')).resolves.toBeUndefined();
    await expect(service.refresh(result.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('never returns a password hash in public session results', async () => {
    const { service } = createService();
    const result = await service.register({ username: 'grower', password });

    expect(result).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(await service.login({ username: 'grower', password })).not.toHaveProperty('passwordHash');
  });
});

describe('auth config', () => {
  it('rejects missing and short access-token secrets', () => {
    expect(() => loadAuthConfig({})).toThrow();
    expect(() => createAuthConfig({ accessTokenSecret: 'short' })).toThrow();
  });

  it('rejects access-token lifetimes other than fifteen minutes', () => {
    expect(() => createAuthConfig({ accessTokenSecret, accessTokenTtlSeconds: 899 })).toThrow();
  });
});
