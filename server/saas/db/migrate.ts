import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { createDatabasePool } from './pool';

const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_FILE = /^(\d{3,})_([a-z0-9_]+)\.sql$/i;
const ADVISORY_LOCK_ID = 1_936_126_681;

export interface Migration {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

interface MigrationPool {
  connect(): Promise<Pick<PoolClient, 'query' | 'release'>>;
}

interface AppliedMigrationRow {
  version: number;
  name: string;
  checksum: string;
}

export async function discoverMigrations(directory = DEFAULT_MIGRATIONS_DIRECTORY): Promise<Migration[]> {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  const versions = new Set<number>();
  const migrations: Migration[] = [];
  for (const name of names) {
    const match = name.match(MIGRATION_FILE);
    if (!match) continue;
    const version = Number(match[1]);
    if (versions.has(version)) throw new Error(`Duplicate migration version ${version}.`);
    versions.add(version);
    const sql = await readFile(resolve(directory, name), 'utf8');
    migrations.push({ version, name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return migrations.sort((left, right) => left.version - right.version || left.name.localeCompare(right.name, 'en'));
}

export async function runMigrations(pool: MigrationPool, directory = DEFAULT_MIGRATIONS_DIRECTORY): Promise<void> {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL CHECK (length(checksum) = 64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrations = await discoverMigrations(directory);
    const result = await client.query<AppliedMigrationRow>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    );
    const applied = new Map(result.rows.map((row) => [Number(row.version), row]));
    const discoveredVersions = new Set(migrations.map(({ version }) => version));
    for (const existing of applied.values()) {
      if (!discoveredVersions.has(Number(existing.version))) {
        throw new Error(`Applied migration version ${existing.version} is missing from disk.`);
      }
    }

    for (const migration of migrations) {
      const existing = applied.get(migration.version);
      if (existing) {
        if (existing.name !== migration.name || existing.checksum !== migration.checksum) {
          throw new Error(`Migration checksum drift detected for version ${migration.version}.`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migration.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the migration failure; lock release still runs in the outer finally.
        }
        throw error;
      }
    }
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

export function sanitizedMigrationError(error: unknown): string {
  if (!(error instanceof Error)) return 'Database migration failed.';
  const withoutUrls = error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url]');
  return withoutUrls.replace(/password\s*[=:]\s*[^\s,;]+/gi, 'password=[redacted]');
}

async function main(): Promise<void> {
  let pool: Pool | undefined;
  try {
    pool = createDatabasePool();
    await runMigrations(pool);
  } catch (error) {
    console.error(sanitizedMigrationError(error));
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

const isCliEntrypoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCliEntrypoint) void main();
