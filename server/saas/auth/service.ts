import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { ACCESS_TOKEN_TTL_SECONDS, type AuthConfig } from '../config';
import type { EmailVerificationService } from '../email/service';
import type { SaasRepository } from '../repository';
import type { MembershipRole, PlatformRole, UserContext } from '../types';

const PASSWORD_HASH_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = '$2b$12$k9bkNY.FeR0jFMFlLyKqvOZfipadpCtvJwQwBlr.H3ibUJVHIvMGO';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string()
  .min(12)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/\d/)
  .regex(/[^A-Za-z0-9]/);

const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  verificationCode: z.string().regex(/^\d{6}$/),
}).strict();

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
}).strict();

const passwordResetSchema = registrationSchema;

export type AuthErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'INVALID_ACCESS_TOKEN'
  | 'USERNAME_TAKEN'
  | 'EMAIL_TAKEN'
  | 'ACCOUNT_DISABLED';

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
  iat: number;
  exp: number;
}

export interface AuthSessionResult extends UserContext {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly repository: SaasRepository,
    private readonly config: AuthConfig,
    private readonly verificationService?: Pick<EmailVerificationService, 'consumeCode'>,
  ) {}

  async register(input: unknown): Promise<AuthSessionResult> {
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success || !this.verificationService) throw new AuthError('VALIDATION_ERROR');

    await this.verificationService.consumeCode({
      email: parsed.data.email,
      purpose: 'register',
      code: parsed.data.verificationCode,
    });
    const passwordHash = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_ROUNDS);
    try {
      const context = await this.repository.createUserWithOrganization({
        email: parsed.data.email,
        displayName: displayNameFromEmail(parsed.data.email),
        passwordHash,
        emailVerifiedAt: new Date().toISOString(),
      });
      return this.createSession(context);
    } catch (error) {
      if (isDomainError(error, 'EMAIL_TAKEN')) throw new AuthError('EMAIL_TAKEN');
      throw error;
    }
  }

  async login(input: unknown): Promise<AuthSessionResult> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new AuthError('INVALID_CREDENTIALS');

    const credential = await this.repository.findUserByEmail(parsed.data.email);
    const passwordHash = credential?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const validPassword = await bcrypt.compare(parsed.data.password, passwordHash);
    if (!credential || !validPassword) throw new AuthError('INVALID_CREDENTIALS');
    if (credential.user.accountStatus !== 'active') throw new AuthError('ACCOUNT_DISABLED');

    const context = await this.repository.findUserContext(credential.user.id);
    if (!context) throw new AuthError('INVALID_CREDENTIALS');
    if (context.user.accountStatus !== 'active') throw new AuthError('ACCOUNT_DISABLED');
    return this.createSession(context);
  }

  async resetPassword(input: unknown): Promise<void> {
    const parsed = passwordResetSchema.safeParse(input);
    if (!parsed.success || !this.verificationService) throw new AuthError('VALIDATION_ERROR');

    await this.verificationService.consumeCode({
      email: parsed.data.email,
      purpose: 'reset_password',
      code: parsed.data.verificationCode,
    });
    const passwordHash = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_ROUNDS);
    const credential = await this.repository.findUserByEmail(parsed.data.email);
    if (!credential) return;
    await this.repository.resetPasswordAndRevokeSessions({
      userId: credential.user.id,
      passwordHash,
      revokedAt: new Date().toISOString(),
    });
  }

  async refresh(refreshToken: unknown): Promise<AuthSessionResult> {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new AuthError('INVALID_REFRESH_TOKEN');
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.repository.findRefreshSession(tokenHash);
    const now = Date.now();
    const expiresAt = session ? Date.parse(session.expiresAt) : Number.NaN;
    if (!session || session.revokedAt !== null || !Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new AuthError('INVALID_REFRESH_TOKEN');
    }

    const context = await this.repository.findUserContext(session.userId);
    if (!context) throw new AuthError('INVALID_REFRESH_TOKEN');
    if (context.user.accountStatus !== 'active') throw new AuthError('ACCOUNT_DISABLED');

    const replacementRefreshToken = randomBytes(32).toString('base64url');
    const consumed = await this.repository.rotateRefreshSession(tokenHash, {
      tokenHash: hashRefreshToken(replacementRefreshToken),
      userId: context.user.id,
      expiresAt: new Date(now + this.config.refreshTokenTtlSeconds * 1_000).toISOString(),
      revokedAt: null,
    }, now);
    if (!consumed) throw new AuthError('INVALID_REFRESH_TOKEN');

    return this.sessionResult(context, replacementRefreshToken);
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

    return this.sessionResult(context, refreshToken);
  }

  private sessionResult(context: UserContext, refreshToken: string): AuthSessionResult {
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
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function displayNameFromEmail(email: string): string {
  return email.slice(0, email.lastIndexOf('@')).slice(0, 64);
}

function isDomainError(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function isAccessTokenClaims(value: string | JwtPayload): value is AccessTokenClaims {
  if (typeof value === 'string') return false;
  return typeof value.sub === 'string'
    && typeof value.org === 'string'
    && typeof value.iat === 'number'
    && Number.isFinite(value.iat)
    && typeof value.exp === 'number'
    && Number.isFinite(value.exp)
    && value.exp - value.iat === ACCESS_TOKEN_TTL_SECONDS
    && (value.platformRole === 'user' || value.platformRole === 'platform_admin')
    && (value.membershipRole === 'owner'
      || value.membershipRole === 'admin'
      || value.membershipRole === 'expert'
      || value.membershipRole === 'operator'
      || value.membershipRole === 'viewer');
}
