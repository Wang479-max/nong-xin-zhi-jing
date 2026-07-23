import { describe, expect, it } from 'vitest';
import { createDatabasePool, loadDatabaseConfig } from '../../server/saas/db/pool';
import { discoverMigrations, runMigrations } from '../../server/saas/db/migrate';

describe('PostgreSQL database configuration', () => {
  it('requires an explicit PostgreSQL DATABASE_URL', () => {
    expect(() => loadDatabaseConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadDatabaseConfig({ DATABASE_URL: 'https://db.example.test/saas' })).toThrow(/PostgreSQL/);
  });

  it('parses bounded pool settings and explicit SSL mode', () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: 'postgresql://app:secret@db.example.test:5432/saas',
      DATABASE_SSL_MODE: 'require',
      DATABASE_POOL_MAX: '12',
      DATABASE_CONNECTION_TIMEOUT_MS: '3000',
      DATABASE_IDLE_TIMEOUT_MS: '15000',
    });

    expect(config).toMatchObject({
      connectionString: 'postgresql://app:secret@db.example.test:5432/saas',
      max: 12,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 15000,
      ssl: { rejectUnauthorized: true },
    });
    const pool = createDatabasePool(config);
    expect(pool.totalCount).toBe(0);
    void pool.end();
  });
});

describe('migration runner', () => {
  it('discovers versioned SQL migrations in deterministic order', async () => {
    const migrations = await discoverMigrations();

    expect(migrations.map(({ version, name }) => ({ version, name }))).toEqual([
      { version: 1, name: '001_saas_foundation.sql' },
      { version: 2, name: '002_email_identity.sql' },
    ]);
    expect(migrations[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('locks, applies each migration transactionally, records it, and unlocks', async () => {
    const client = new RecordingMigrationClient();
    await runMigrations({ connect: async () => client } as never);

    expect(client.commands).toEqual(expect.arrayContaining([
      'LOCK', 'CREATE_MIGRATIONS', 'LIST_MIGRATIONS', 'BEGIN', 'APPLY_SQL', 'RECORD_MIGRATION', 'COMMIT', 'UNLOCK', 'RELEASE',
    ]));
    expect(client.commands.indexOf('LOCK')).toBeLessThan(client.commands.indexOf('BEGIN'));
    expect(client.commands.indexOf('RECORD_MIGRATION')).toBeLessThan(client.commands.indexOf('COMMIT'));
    expect(client.commands.at(-2)).toBe('UNLOCK');
    expect(client.commands.at(-1)).toBe('RELEASE');
  });

  it('detects checksum drift without applying SQL and always unlocks', async () => {
    const client = new RecordingMigrationClient({ version: 1, name: '001_saas_foundation.sql', checksum: 'stale' });

    await expect(runMigrations({ connect: async () => client } as never)).rejects.toThrow(/checksum drift/i);
    expect(client.commands).not.toContain('APPLY_SQL');
    expect(client.commands.slice(-2)).toEqual(['UNLOCK', 'RELEASE']);
  });

  it('rejects an applied migration that has disappeared from disk', async () => {
    const client = new RecordingMigrationClient({ version: 999, name: '999_removed.sql', checksum: 'a'.repeat(64) });

    await expect(runMigrations({ connect: async () => client } as never)).rejects.toThrow(/missing from disk/i);
    expect(client.commands).not.toContain('APPLY_SQL');
    expect(client.commands.slice(-2)).toEqual(['UNLOCK', 'RELEASE']);
  });
});

class RecordingMigrationClient {
  readonly commands: string[] = [];

  constructor(private readonly applied?: { version: number; name: string; checksum: string }) {}

  async query(input: string | { text: string; values?: unknown[] }): Promise<{ rows: unknown[] }> {
    const text = typeof input === 'string' ? input : input.text;
    if (/pg_advisory_lock/.test(text)) this.commands.push('LOCK');
    else if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(text)) this.commands.push('CREATE_MIGRATIONS');
    else if (/SELECT version, name, checksum/.test(text)) {
      this.commands.push('LIST_MIGRATIONS');
      return { rows: this.applied ? [this.applied] : [] };
    } else if (text === 'BEGIN') this.commands.push('BEGIN');
    else if (text === 'COMMIT') this.commands.push('COMMIT');
    else if (text === 'ROLLBACK') this.commands.push('ROLLBACK');
    else if (/INSERT INTO schema_migrations/.test(text)) this.commands.push('RECORD_MIGRATION');
    else if (/pg_advisory_unlock/.test(text)) this.commands.push('UNLOCK');
    else this.commands.push('APPLY_SQL');
    return { rows: [] };
  }

  release(): void {
    this.commands.push('RELEASE');
  }
}
