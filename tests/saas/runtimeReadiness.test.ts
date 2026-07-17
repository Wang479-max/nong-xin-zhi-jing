import { describe, expect, it, vi } from 'vitest';
import { createSaasRuntimeFromEnv } from '../../server/saas';

const ENV = {
  NODE_ENV: 'test',
  ACCESS_TOKEN_SECRET: 'runtime-readiness-secret-that-is-longer-than-thirty-two-characters',
  DATABASE_URL: 'postgresql://app:password@db.example.test/saas',
  PAYMENT_MODE: 'disabled',
};

describe('SaaS PostgreSQL runtime readiness', () => {
  it('checks PostgreSQL readiness before returning the runtime', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] }),
      end: vi.fn().mockResolvedValue(undefined),
    };

    const runtime = await createSaasRuntimeFromEnv(ENV, { createPool: () => pool as never });

    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      text: 'SELECT 1',
      query_timeout: expect.any(Number),
    }));
    expect(pool.end).not.toHaveBeenCalled();
    await runtime.close();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('rejects with a sanitized error and closes the pool when readiness fails', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('postgresql://secret@internal-host/private-db')),
      end: vi.fn().mockResolvedValue(undefined),
    };

    await expect(createSaasRuntimeFromEnv(ENV, { createPool: () => pool as never }))
      .rejects.toEqual(expect.objectContaining({ message: 'Database readiness check failed.' }));
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('initializes the SaaS runtime before the legacy health endpoint is mounted', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) => (
      readFile(new URL('../../server.ts', import.meta.url), 'utf8')
    ));

    expect(source.indexOf('await createSaasRuntimeFromEnv(process.env)')).toBeLessThan(
      source.indexOf("app.get('/api/health'"),
    );
  });
});
