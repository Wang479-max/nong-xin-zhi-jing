import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const foundationMigrationPath = fileURLToPath(
  new URL('../../server/saas/db/migrations/001_saas_foundation.sql', import.meta.url),
);
const emailIdentityMigrationPath = fileURLToPath(
  new URL('../../server/saas/db/migrations/002_email_identity.sql', import.meta.url),
);

describe('email identity PostgreSQL migration', () => {
  it('migrates collision-prone legacy identities into unique unverified emails', async () => {
    const database = new PGlite();
    try {
      await database.exec(await readFile(foundationMigrationPath, 'utf8'));
      await database.query(
        `INSERT INTO users (id, normalized_username, platform_role, created_at, updated_at)
         VALUES
           ('user-a', 'foo', 'user', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
           ('user-b', 'foo@legacy.invalid', 'user', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
           ('user-c', 'foo@bar', 'user', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
           ('user-d', 'grower@example.com', 'user', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')`,
      );

      await database.exec(await readFile(emailIdentityMigrationPath, 'utf8'));

      const result = await database.query<{
        id: string;
        normalized_username: string;
        normalized_email: string;
        email_verified_at: Date | null;
      }>(
        `SELECT id, normalized_username, normalized_email, email_verified_at
         FROM users
         ORDER BY id`,
      );
      expect(result.rows.map(({ normalized_username }) => normalized_username)).toEqual([
        'foo',
        'foo@legacy.invalid',
        'foo@bar',
        'grower@example.com',
      ]);
      expect(result.rows.map(({ normalized_email }) => normalized_email)).toEqual([
        'legacy+1@legacy.invalid',
        'legacy+2@legacy.invalid',
        'legacy+3@legacy.invalid',
        'grower@example.com',
      ]);
      expect(new Set(result.rows.map(({ normalized_email }) => normalized_email)).size).toBe(result.rows.length);
      expect(result.rows.every(({ normalized_email }) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized_email))).toBe(true);
      expect(result.rows.every(({ email_verified_at }) => email_verified_at === null)).toBe(true);

      await expect(database.query(
        `INSERT INTO users
           (id, normalized_username, normalized_email, display_name, email_verified_at,
            account_status, platform_role, created_at, updated_at)
         VALUES
           ('duplicate-email', 'duplicate-email', 'grower@example.com', 'duplicate', NULL,
            'active', 'user', now(), now())`,
      )).rejects.toThrow();
      await expect(database.query(
        `INSERT INTO users
           (id, normalized_username, normalized_email, display_name, email_verified_at,
            account_status, platform_role, created_at, updated_at)
         VALUES
           ('invalid-status', 'invalid-status', 'invalid-status@example.com', 'invalid status', NULL,
            'pending', 'user', now(), now())`,
      )).rejects.toThrow();
    } finally {
      await database.close();
    }
  }, 30_000);
});
