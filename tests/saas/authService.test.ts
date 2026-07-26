import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthConfig, loadAuthConfig } from '../../server/saas/config';
import { AuthService } from '../../server/saas/auth/service';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';
import type { EmailVerificationService } from '../../server/saas/email/service';

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
  const verification = {
    consumeCode: vi.fn(async () => {}),
  } satisfies Pick<EmailVerificationService, 'consumeCode'>;
  return {
    repo,
    verification,
    service: new AuthService(repo, authConfig(overrides), verification),
  };
};

const refreshHash = (token: string) => createHash('sha256').update(token).digest('hex');

afterEach(() => vi.useRealTimers());

describe('AuthService', () => {
  it('registers every public user as a normal owner and hashes the password', async () => {
    const { repo, service, verification } = createService();

    const result = await service.register({
      email: ' Grower@Example.COM ',
      password,
      verificationCode: '123456',
    });
    const stored = await repo.findUserByEmail('grower@example.com');

    expect(result.user).toMatchObject({
      username: 'grower@example.com',
      email: 'grower@example.com',
      displayName: 'grower',
      accountStatus: 'active',
      platformRole: 'user',
    });
    expect(result.membership.role).toBe('owner');
    expect(stored!.passwordHash).not.toBe(password);
    expect(bcrypt.getRounds(stored!.passwordHash)).toBe(12);
    expect(verification.consumeCode).toHaveBeenCalledWith({
      email: 'grower@example.com',
      purpose: 'register',
      code: '123456',
    });
  });

  it('normalizes email addresses before login', async () => {
    const { service } = createService();
    await register(service);

    await expect(service.login({ email: '  GROWER@EXAMPLE.COM  ', password })).resolves.toMatchObject({
      user: { email: 'grower@example.com' },
    });
  });

  it('rejects an invalid password without returning tokens', async () => {
    const { service } = createService();
    await register(service);

    await expect(service.login({ email: 'grower@example.com', password: 'WrongPass123!' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('uses the same invalid-credentials error for unknown email addresses', async () => {
    const { service } = createService();
    await register(service);

    const wrongPassword = service.login({ email: 'grower@example.com', password: 'WrongPass123!' });
    const unknownEmail = service.login({ email: 'missing@example.com', password });

    await expect(wrongPassword).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(unknownEmail).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects missing verification, weak passwords and public role-bearing registration input', async () => {
    const { service } = createService();

    await expect(service.register({ email: 'grower@example.com', password }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.register({ email: 'grower@example.com', password: 'password', verificationCode: '123456' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.register({
      email: 'grower@example.com',
      password,
      verificationCode: '123456',
      platformRole: 'platform_admin',
    } as never))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('normalizes duplicate email addresses and returns EMAIL_TAKEN', async () => {
    const { service } = createService();
    await register(service);

    await expect(service.register({
      email: ' GROWER@EXAMPLE.COM ',
      password,
      verificationCode: '654321',
    })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('rejects a disabled account even when its password is correct', async () => {
    const { repo, service } = createService();
    await register(service);
    const findUserByEmail = repo.findUserByEmail.bind(repo);
    vi.spyOn(repo, 'findUserByEmail').mockImplementation(async (email) => {
      const credential = await findUserByEmail(email);
      return credential
        ? { ...credential, user: { ...credential.user, accountStatus: 'disabled' } }
        : null;
    });

    await expect(service.login({ email: 'grower@example.com', password }))
      .rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('resets a verified email password and revokes every prior refresh session', async () => {
    const { repo, service, verification } = createService();
    const registered = await register(service);
    const secondSession = await service.login({ email: 'grower@example.com', password });
    const replacementPassword = 'NewStrongPass123!';

    await service.resetPassword({
      email: ' GROWER@EXAMPLE.COM ',
      password: replacementPassword,
      verificationCode: '654321',
    });

    expect(verification.consumeCode).toHaveBeenLastCalledWith({
      email: 'grower@example.com',
      purpose: 'reset_password',
      code: '654321',
    });
    await expect(service.login({ email: 'grower@example.com', password }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(service.login({ email: 'grower@example.com', password: replacementPassword }))
      .resolves.toMatchObject({ user: { email: 'grower@example.com' } });
    await expect(service.refresh(registered.refreshToken))
      .rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    await expect(service.refresh(secondSession.refreshToken))
      .rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(await repo.findUserByEmail('grower@example.com')).not.toBeNull();
  });

  it('issues a 15-minute HS256 access token with the exact authorization claims', async () => {
    const { service } = createService();
    const result = await register(service);
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
    const result = await register(service);
    const stored = await repo.findRefreshSession(refreshHash(result.refreshToken));

    expect(Buffer.from(result.refreshToken, 'base64url')).toHaveLength(32);
    expect(stored).toMatchObject({ tokenHash: refreshHash(result.refreshToken), userId: result.user.id, revokedAt: null });
    expect(stored!.tokenHash).not.toBe(result.refreshToken);
  });

  it('rotates refresh sessions and rejects reuse of the revoked token', async () => {
    const { repo, service } = createService();
    const registered = await register(service);

    const refreshed = await service.refresh(registered.refreshToken);

    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);
    expect(await repo.findRefreshSession(refreshHash(registered.refreshToken)))
      .toMatchObject({ revokedAt: expect.any(String) });
    expect(await repo.findRefreshSession(refreshHash(refreshed.refreshToken)))
      .toMatchObject({ revokedAt: null, userId: registered.user.id });
    await expect(service.refresh(registered.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('allows exactly one concurrent refresh-token rotation', async () => {
    const { service } = createService();
    const registered = await register(service);

    const results = await Promise.allSettled([
      service.refresh(registered.refreshToken),
      service.refresh(registered.refreshToken),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('rejects expired refresh sessions with a stable error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const { service } = createService({ refreshTokenTtlSeconds: 1 });
    const result = await register(service);
    vi.advanceTimersByTime(1_001);

    await expect(service.refresh(result.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('rejects refresh sessions with malformed expiry timestamps', async () => {
    const { repo, service } = createService();
    const result = await register(service);
    const tokenHash = refreshHash(result.refreshToken);
    const stored = await repo.findRefreshSession(tokenHash);
    await repo.saveRefreshSession({ ...stored!, expiresAt: 'not-a-date' });

    await expect(service.refresh(result.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('rejects a missing refresh token with the same stable error', async () => {
    const { service } = createService();

    await expect(service.refresh(undefined as never)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('revokes refresh sessions on idempotent logout without exposing token existence', async () => {
    const { service } = createService();
    const result = await register(service);

    await expect(service.logout(result.refreshToken)).resolves.toBeUndefined();
    await expect(service.logout(result.refreshToken)).resolves.toBeUndefined();
    await expect(service.logout('missing-token')).resolves.toBeUndefined();
    await expect(service.refresh(result.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('never returns a password hash in public session results', async () => {
    const { service } = createService();
    const result = await register(service);

    expect(result).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(await service.login({ email: 'grower@example.com', password })).not.toHaveProperty('passwordHash');
  });

  it('rejects access tokens without both timestamps or with a non-900-second lifetime', () => {
    const { service } = createService();
    const authorizationClaims = { sub: 'user_1', org: 'org_1', platformRole: 'user', membershipRole: 'owner' };
    const withoutTimestamps = jwt.sign(authorizationClaims, accessTokenSecret, { algorithm: 'HS256', noTimestamp: true });
    const withoutIssuedAt = jwt.sign(authorizationClaims, accessTokenSecret, {
      algorithm: 'HS256', noTimestamp: true, expiresIn: 900,
    });
    const withoutExpiry = jwt.sign(authorizationClaims, accessTokenSecret, { algorithm: 'HS256' });
    const shortLived = jwt.sign(authorizationClaims, accessTokenSecret, { algorithm: 'HS256', expiresIn: 60 });

    expect(() => service.verifyAccessToken(withoutTimestamps)).toThrow(expect.objectContaining({ code: 'INVALID_ACCESS_TOKEN' }));
    expect(() => service.verifyAccessToken(withoutIssuedAt)).toThrow(expect.objectContaining({ code: 'INVALID_ACCESS_TOKEN' }));
    expect(() => service.verifyAccessToken(withoutExpiry)).toThrow(expect.objectContaining({ code: 'INVALID_ACCESS_TOKEN' }));
    expect(() => service.verifyAccessToken(shortLived)).toThrow(expect.objectContaining({ code: 'INVALID_ACCESS_TOKEN' }));
  });
});

function register(service: AuthService) {
  return service.register({
    email: 'grower@example.com',
    password,
    verificationCode: '123456',
  });
}

describe('auth config', () => {
  it('rejects missing and short access-token secrets', () => {
    expect(() => loadAuthConfig({})).toThrow();
    expect(() => createAuthConfig({ accessTokenSecret: 'short' })).toThrow();
  });

  it('rejects access-token lifetimes other than fifteen minutes', () => {
    expect(() => createAuthConfig({ accessTokenSecret, accessTokenTtlSeconds: 899 })).toThrow();
  });
});
