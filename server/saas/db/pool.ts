import { Pool, type PoolConfig } from 'pg';

export interface DatabaseConfig {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  ssl?: false | { rejectUnauthorized: boolean };
}

const integerSetting = (
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
};

export function loadDatabaseConfig(environment: Record<string, string | undefined> = process.env): DatabaseConfig {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use a PostgreSQL protocol.');
  }
  if (!url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error('DATABASE_URL must identify a PostgreSQL host and database.');
  }

  const sslMode = environment.DATABASE_SSL_MODE?.trim().toLowerCase();
  let ssl: DatabaseConfig['ssl'];
  if (sslMode === undefined || sslMode === '') ssl = undefined;
  else if (sslMode === 'disable') ssl = false;
  else if (sslMode === 'require' || sslMode === 'verify-full') ssl = { rejectUnauthorized: true };
  else if (sslMode === 'no-verify') ssl = { rejectUnauthorized: false };
  else throw new Error('DATABASE_SSL_MODE must be disable, require, verify-full, or no-verify.');

  return {
    connectionString,
    max: integerSetting(environment.DATABASE_POOL_MAX, 10, 'DATABASE_POOL_MAX', 1, 100),
    connectionTimeoutMillis: integerSetting(
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
      'DATABASE_CONNECTION_TIMEOUT_MS',
      100,
      120_000,
    ),
    idleTimeoutMillis: integerSetting(
      environment.DATABASE_IDLE_TIMEOUT_MS,
      30_000,
      'DATABASE_IDLE_TIMEOUT_MS',
      1_000,
      600_000,
    ),
    ...(ssl === undefined ? {} : { ssl }),
  };
}

export function createDatabasePool(config: DatabaseConfig = loadDatabaseConfig()): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: config.max,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    allowExitOnIdle: false,
    ...(config.ssl === undefined ? {} : { ssl: config.ssl }),
  };
  return new Pool(poolConfig);
}
