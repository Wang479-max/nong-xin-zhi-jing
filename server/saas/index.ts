import { randomBytes } from 'node:crypto';
import type { Router } from 'express';
import type { Pool } from 'pg';
import { createClient } from 'redis';
import { bootstrapPlatformAdmin } from './admin/bootstrap';
import { AuthService } from './auth/service';
import { BillingService, type BillingConfig } from './billing/service';
import { createAuthConfig } from './config';
import { createDatabasePool, loadDatabaseConfig, type DatabaseConfig } from './db/pool';
import { PgSaasRepository } from './db/pgRepository';
import { loadEmailConfig, type EmailConfig } from './email/config';
import {
  MailDeliveryError,
  createSmtpVerificationMailer,
  type VerificationMailer,
} from './email/mailer';
import { MemoryVerificationCodeStore } from './email/memoryVerificationStore';
import {
  RedisVerificationCodeStore,
  type RedisEvalClient,
} from './email/redisVerificationStore';
import { EmailVerificationService } from './email/service';
import type { VerificationCodeStore, VerificationStoreConfig } from './email/types';
import { EntitlementService } from './entitlements/service';
import { MemorySaasRepository } from './memoryRepository';
import type { SaasRepository } from './repository';
import { createSaasRouter } from './router';

export interface SaasRuntime {
  repository: SaasRepository;
  authService: AuthService;
  verificationService: EmailVerificationService;
  verificationStore: VerificationCodeStore;
  entitlementService: EntitlementService;
  billingService: BillingService;
  router: Router;
  paymentMode: BillingConfig['paymentMode'];
  close(): Promise<void>;
}

interface OwnedDatabasePool {
  query(config: { text: string; query_timeout: number }): Promise<unknown>;
  end(): Promise<void>;
}

export interface SaasRuntimeDependencies {
  createPool?: (config: DatabaseConfig) => OwnedDatabasePool;
  createRedisClient?: (url: string) => RedisRuntimeClient;
  verificationStore?: VerificationCodeStore;
  verificationMailer?: VerificationMailer;
}

const DATABASE_READINESS_TIMEOUT_MS = 5_000;
const RESERVATION_TTL_SECONDS = 30;

interface RedisRuntimeClient extends RedisEvalClient {
  connect(): Promise<unknown>;
  on?(event: 'error', listener: () => void): unknown;
}

class DatabaseReadinessError extends Error {
  constructor() {
    super('Database readiness check failed.');
    this.name = 'DatabaseReadinessError';
  }
}

class RedisVerificationReadinessError extends Error {
  constructor() {
    super('Redis verification readiness check failed.');
    this.name = 'RedisVerificationReadinessError';
  }
}

export async function createSaasRuntimeFromEnv(
  environment: Record<string, string | undefined> = process.env,
  dependencies: SaasRuntimeDependencies = {},
): Promise<SaasRuntime> {
  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase() || 'unspecified';
  const production = nodeEnvironment === 'production';
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production.');

  let accessTokenSecret = environment.ACCESS_TOKEN_SECRET?.trim();
  if (production && !accessTokenSecret) throw new Error('ACCESS_TOKEN_SECRET is required in production.');
  if (!accessTokenSecret) {
    accessTokenSecret = randomBytes(48).toString('base64url');
    console.warn('[SaaS] Using an ephemeral access-token secret; sessions will not survive restart.');
  }

  const authConfig = createAuthConfig({
    accessTokenSecret,
    accessTokenTtlSeconds: environment.ACCESS_TOKEN_TTL_SECONDS === undefined
      ? 15 * 60
      : Number(environment.ACCESS_TOKEN_TTL_SECONDS),
    refreshTokenTtlSeconds: environment.REFRESH_TOKEN_TTL_SECONDS === undefined
      ? 30 * 24 * 60 * 60
      : Number(environment.REFRESH_TOKEN_TTL_SECONDS),
  });
  const paymentMode = resolvePaymentMode(environment.PAYMENT_MODE, nodeEnvironment);
  const secureCookies = production || parseBoolean(environment.SAAS_COOKIE_SECURE, false);

  let pool: OwnedDatabasePool | undefined;
  let poolClosed = false;
  const closePool = async (): Promise<void> => {
    if (!pool || poolClosed) return;
    poolClosed = true;
    await pool.end();
  };
  let repository: SaasRepository;
  if (databaseUrl) {
    const databaseConfig = loadDatabaseConfig(environment);
    pool = dependencies.createPool?.(databaseConfig)
      ?? createDatabasePool(databaseConfig) as unknown as OwnedDatabasePool;
    repository = new PgSaasRepository(pool as unknown as Pool);
  } else {
    repository = new MemorySaasRepository();
  }

  let verificationStore: VerificationCodeStore | undefined;
  let runtimeClosed = false;
  const closeRuntimeResources = async (): Promise<void> => {
    if (runtimeClosed) return;
    runtimeClosed = true;
    let shutdownError: unknown;
    try {
      await verificationStore?.close();
    } catch (error) {
      shutdownError = error;
    }
    try {
      await closePool();
    } catch (error) {
      shutdownError ??= error;
    }
    if (shutdownError) throw shutdownError;
  };

  try {
    if (pool) await assertDatabaseReady(pool);

    const emailConfig = loadRuntimeEmailConfig(environment, production);
    verificationStore = dependencies.verificationStore
      ?? await createRuntimeVerificationStore(emailConfig, dependencies);
    const verificationMailer = dependencies.verificationMailer
      ?? (emailConfig
        ? createSmtpVerificationMailer({
          ...emailConfig.smtp,
          port: emailConfig.smtp.port as 465 | 587,
        })
        : unavailableVerificationMailer);
    const verificationSettings = emailConfig ?? developmentEmailSettings();
    const verificationService = new EmailVerificationService({
      store: verificationStore,
      mailer: verificationMailer,
      hmacSecret: verificationSettings.hmacSecret,
      codeTtlSeconds: verificationSettings.codeTtlSeconds,
      resendCooldownSeconds: verificationSettings.resendCooldownSeconds,
    });

    if (environment.ADMIN_EMAIL !== undefined && environment.ADMIN_PASSWORD !== undefined) {
      await bootstrapPlatformAdmin(repository, {
        email: environment.ADMIN_EMAIL,
        password: environment.ADMIN_PASSWORD,
        displayName: 'admin',
      });
    }

    const authService = new AuthService(repository, authConfig, verificationService);
    const entitlementService = new EntitlementService(repository);
    const billingService = new BillingService(repository, { paymentMode });
    const router = createSaasRouter({
      repository,
      authService,
      entitlementService,
      billingService,
      verificationService,
      refreshTokenTtlSeconds: authConfig.refreshTokenTtlSeconds,
      secureCookies,
    });
    return {
      repository,
      authService,
      verificationService,
      verificationStore,
      entitlementService,
      billingService,
      router,
      paymentMode,
      close: closeRuntimeResources,
    };
  } catch (error) {
    try {
      await closeRuntimeResources();
    } catch {
      // Preserve the sanitized startup error rather than leaking shutdown details.
    }
    throw error;
  }
}

function loadRuntimeEmailConfig(
  environment: Record<string, string | undefined>,
  production: boolean,
): EmailConfig | null {
  const names = [
    'REDIS_URL',
    'EMAIL_VERIFICATION_HMAC_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM_NAME',
  ];
  const configured = names.some((name) => environment[name] !== undefined);
  return production || configured ? loadEmailConfig(environment) : null;
}

async function createRuntimeVerificationStore(
  emailConfig: EmailConfig | null,
  dependencies: SaasRuntimeDependencies,
): Promise<VerificationCodeStore> {
  if (!emailConfig) {
    return new MemoryVerificationCodeStore(storeConfig(developmentEmailSettings()));
  }
  const redis = dependencies.createRedisClient?.(emailConfig.redisUrl)
    ?? createClient({ url: emailConfig.redisUrl }) as unknown as RedisRuntimeClient;
  redis.on?.('error', () => {
    console.error('[SaaS] Redis verification connection error.');
  });
  try {
    await redis.connect();
  } catch {
    try {
      await redis.quit();
    } catch {
      // The client may already be closed; keep the startup error sanitized.
    }
    throw new RedisVerificationReadinessError();
  }
  return new RedisVerificationCodeStore(redis, storeConfig(emailConfig));
}

function storeConfig(settings: {
  codeTtlSeconds: number;
  resendCooldownSeconds: number;
  emailHourlyLimit: number;
  ipHourlyLimit: number;
  maxAttempts: number;
}): VerificationStoreConfig {
  return {
    codeTtlSeconds: settings.codeTtlSeconds,
    resendCooldownSeconds: settings.resendCooldownSeconds,
    emailHourlyLimit: settings.emailHourlyLimit,
    ipHourlyLimit: settings.ipHourlyLimit,
    maxAttempts: settings.maxAttempts,
    reservationTtlSeconds: RESERVATION_TTL_SECONDS,
  };
}

function developmentEmailSettings() {
  return {
    hmacSecret: randomBytes(32).toString('hex'),
    codeTtlSeconds: 300,
    resendCooldownSeconds: 60,
    emailHourlyLimit: 5,
    ipHourlyLimit: 20,
    maxAttempts: 5,
  };
}

const unavailableVerificationMailer: VerificationMailer = {
  async sendCode() {
    throw new MailDeliveryError();
  },
};

async function assertDatabaseReady(pool: OwnedDatabasePool): Promise<void> {
  try {
    await pool.query({
      text: 'SELECT 1',
      query_timeout: DATABASE_READINESS_TIMEOUT_MS,
    });
  } catch {
    throw new DatabaseReadinessError();
  }
}

function resolvePaymentMode(value: string | undefined, nodeEnvironment: string): BillingConfig['paymentMode'] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'mock' || normalized === 'disabled') return normalized;
  if (normalized) throw new Error('PAYMENT_MODE must be mock or disabled.');
  return nodeEnvironment === 'development' ? 'mock' : 'disabled';
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  if (value.trim().toLowerCase() === 'true') return true;
  if (value.trim().toLowerCase() === 'false') return false;
  throw new Error('SAAS_COOKIE_SECURE must be true or false.');
}
