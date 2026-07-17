import { randomBytes } from 'node:crypto';
import type { Router } from 'express';
import type { Pool } from 'pg';
import { bootstrapPlatformAdmin } from './admin/bootstrap';
import { AuthService } from './auth/service';
import { BillingService, type BillingConfig } from './billing/service';
import { createAuthConfig } from './config';
import { createDatabasePool, loadDatabaseConfig } from './db/pool';
import { PgSaasRepository } from './db/pgRepository';
import { EntitlementService } from './entitlements/service';
import { MemorySaasRepository } from './memoryRepository';
import type { SaasRepository } from './repository';
import { createSaasRouter } from './router';

export interface SaasRuntime {
  repository: SaasRepository;
  authService: AuthService;
  entitlementService: EntitlementService;
  billingService: BillingService;
  router: Router;
  paymentMode: BillingConfig['paymentMode'];
  close(): Promise<void>;
}

export async function createSaasRuntimeFromEnv(
  environment: Record<string, string | undefined> = process.env,
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

  let pool: Pool | undefined;
  let repository: SaasRepository;
  if (databaseUrl) {
    pool = createDatabasePool(loadDatabaseConfig(environment));
    repository = new PgSaasRepository(pool);
  } else {
    repository = new MemorySaasRepository();
  }

  try {
    if (environment.ADMIN_USERNAME !== undefined && environment.ADMIN_PASSWORD !== undefined) {
      await bootstrapPlatformAdmin(repository, {
        username: environment.ADMIN_USERNAME,
        password: environment.ADMIN_PASSWORD,
      });
    }

    const authService = new AuthService(repository, authConfig);
    const entitlementService = new EntitlementService(repository);
    const billingService = new BillingService(repository, { paymentMode });
    const router = createSaasRouter({
      repository,
      authService,
      entitlementService,
      billingService,
      refreshTokenTtlSeconds: authConfig.refreshTokenTtlSeconds,
      secureCookies,
    });
    return {
      repository,
      authService,
      entitlementService,
      billingService,
      router,
      paymentMode,
      close: async () => {
        if (pool) await pool.end();
      },
    };
  } catch (error) {
    if (pool) await pool.end();
    throw error;
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
