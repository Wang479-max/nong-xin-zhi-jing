import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthConfig } from '../config';
import type { SaasRepository } from '../repository';
import type { MembershipRole, PlatformRole, UserContext } from '../types';

const PASSWORD_HASH_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = '$2b$12$k9bkNY.FeR0jFMFlLyKqvOZfipadpCtvJwQwBlr.H3ibUJVHIvMGO';

const usernameSchema = z.string()
  .transform((username) => username.trim().toLowerCase())
  .pipe(z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/));

const registrationSchema = z.object({
  username: usernameSchema,
  password: z.string()
    .min(12)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/\d/)
    .regex(/[^A-Za-z0-9]/),
}).strict();

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
}).strict();

export type AuthErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'INVALID_ACCESS_TOKEN'
  | 'USERNAME_TAKEN';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AccessTokenClaims {
  sub: string;
  org: string;
  platformRole: PlatformRole;
  membershipRole: MembershipRole;
}

export interface AuthSessionResult extends UserContext {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly repository: SaasRepository,
    private readonly config: AuthConfig,
  ) {}

  async register(input: unknown): Promise<AuthSessionResult> {
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success) throw new AuthError('VALIDATION_ERROR');

    const passwordHash = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_ROUNDS);
    try {
      const context = await this.repository.createUserWithOrganization({
        username: parsed.data.username,
        passwordHash,
      });
      return this.createSession(context);
    } catch (error) {
      if (isDomainError(error, 'USERNAME_TAKEN')) throw new AuthError('USERNAME_TAKEN');
      throw error;
    }
  }

  async login(input: unknown): Promise<AuthSessionResult> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new AuthError('INVALID_CREDENTIALS');

    const credential = await this.repository.findUserByUsername(parsed.data.username);
    const passwordHash = credential?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const validPassword = await bcrypt.compare(parsed.data.password, passwordHash);
    if (!credential || !validPassword) throw new AuthError('INVALID_CREDENTIALS');

    const context = await this.repository.findUserContext(credential.user.id);
    if (!context) throw new AuthError('INVALID_CREDENTIALS');
    return this.createSession(context);
  }

  async refresh(refreshToken: unknown): Promise<AuthSessionResult> {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new AuthError('INVALID_REFRESH_TOKEN');
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.repository.findRefreshSession(tokenHash);
    if (!session || session.revokedAt !== null || Date.parse(session.expiresAt) <= Date.now()) {
      throw new AuthError('INVALID_REFRESH_TOKEN');
    }

    const context = await this.repository.findUserContext(session.userId);
    if (!context) throw new AuthError('INVALID_REFRESH_TOKEN');

    await this.repository.revokeRefreshSession(tokenHash);
    return this.createSession(context);
  }

  async logout(refreshToken: unknown): Promise<void> {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) return;
    await this.repository.revokeRefreshSession(hashRefreshToken(refreshToken));
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const decoded = jwt.verify(token, this.config.accessTokenSecret, { algorithms: ['HS256'] });
      if (!isAccessTokenClaims(decoded)) throw new Error('Invalid claims.');
      return decoded;
    } catch {
      throw new AuthError('INVALID_ACCESS_TOKEN');
    }
  }

  private async createSession(context: UserContext): Promise<AuthSessionResult> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.repository.saveRefreshSession({
      tokenHash: hashRefreshToken(refreshToken),
      userId: context.user.id,
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1_000).toISOString(),
      revokedAt: null,
    });

    return {
      ...context,
      accessToken: this.signAccessToken(context),
      refreshToken,
    };
  }

  private signAccessToken(context: UserContext): string {
    return jwt.sign({
      sub: context.user.id,
      org: context.organization.id,
      platformRole: context.user.platformRole,
      membershipRole: context.membership.role,
    }, this.config.accessTokenSecret, {
      algorithm: 'HS256',
      expiresIn: this.config.accessTokenTtlSeconds,
    });
  }
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function isDomainError(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function isAccessTokenClaims(value: string | JwtPayload): value is AccessTokenClaims {
  if (typeof value === 'string') return false;
  return typeof value.sub === 'string'
    && typeof value.org === 'string'
    && (value.platformRole === 'user' || value.platformRole === 'platform_admin')
    && (value.membershipRole === 'owner'
      || value.membershipRole === 'admin'
      || value.membershipRole === 'expert'
      || value.membershipRole === 'operator'
      || value.membershipRole === 'viewer');
}
