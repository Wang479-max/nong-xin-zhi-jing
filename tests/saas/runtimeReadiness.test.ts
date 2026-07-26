import { describe, expect, it, vi } from 'vitest';
import { createSaasRuntimeFromEnv } from '../../server/saas';
import type { VerificationMailer } from '../../server/saas/email/mailer';
import type { VerificationCodeStore } from '../../server/saas/email/types';

const ENV = {
  NODE_ENV: 'test',
  ACCESS_TOKEN_SECRET: 'runtime-readiness-secret-that-is-longer-than-thirty-two-characters',
  DATABASE_URL: 'postgresql://app:password@db.example.test/saas',
  PAYMENT_MODE: 'disabled',
};
const EMAIL_ENV = {
  REDIS_URL: 'redis://:redis-password@127.0.0.1:6379',
  EMAIL_VERIFICATION_HMAC_SECRET: 'email-code-hmac-secret-that-is-at-least-32-characters',
  SMTP_HOST: 'smtp.qq.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'sender@qq.com',
  SMTP_PASS: 'smtp-authorization-code',
  SMTP_FROM_NAME: '农芯智境',
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

  it('requires complete email verification configuration in production', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] }),
      end: vi.fn().mockResolvedValue(undefined),
    };

    await expect(createSaasRuntimeFromEnv({
      ...ENV,
      NODE_ENV: 'production',
    }, {
      createPool: () => pool as never,
    })).rejects.toThrow();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('connects Redis after database readiness and closes Redis before PostgreSQL', async () => {
    const events: string[] = [];
    const pool = {
      query: vi.fn(async () => {
        events.push('database-ready');
        return { rows: [{ ready: 1 }] };
      }),
      end: vi.fn(async () => {
        events.push('database-close');
      }),
    };
    const redis = {
      connect: vi.fn(async () => {
        events.push('redis-connect');
      }),
      eval: vi.fn(),
      quit: vi.fn(async () => {
        events.push('redis-close');
      }),
    };
    const mailer: VerificationMailer = { sendCode: vi.fn(async () => {}) };

    const runtime = await createSaasRuntimeFromEnv({
      ...ENV,
      ...EMAIL_ENV,
      NODE_ENV: 'production',
    }, {
      createPool: () => pool as never,
      createRedisClient: () => redis,
      verificationMailer: mailer,
    } as never);

    expect(events.slice(0, 2)).toEqual(['database-ready', 'redis-connect']);
    await runtime.close();
    await runtime.close();
    expect(events.slice(-2)).toEqual(['redis-close', 'database-close']);
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('sanitizes Redis readiness failures and closes partially initialized resources', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] }),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const redis = {
      connect: vi.fn().mockRejectedValue(
        new Error('redis://:secret-password@internal-host:6379 connection refused'),
      ),
      eval: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    await expect(createSaasRuntimeFromEnv({
      ...ENV,
      ...EMAIL_ENV,
      NODE_ENV: 'production',
    }, {
      createPool: () => pool as never,
      createRedisClient: () => redis,
      verificationMailer: { sendCode: vi.fn(async () => {}) },
    } as never)).rejects.toEqual(expect.objectContaining({
      message: 'Redis verification readiness check failed.',
    }));
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('closes an injected verification store before PostgreSQL', async () => {
    const events: string[] = [];
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] }),
      end: vi.fn(async () => {
        events.push('database-close');
      }),
    };
    const store = createVerificationStore(async () => {
      events.push('verification-close');
    });
    const mailer: VerificationMailer = { sendCode: vi.fn(async () => {}) };

    const runtime = await createSaasRuntimeFromEnv(ENV, {
      createPool: () => pool as never,
      verificationStore: store,
      verificationMailer: mailer,
    } as never);

    await runtime.close();
    expect(events).toEqual(['verification-close', 'database-close']);
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

function createVerificationStore(onClose: () => Promise<void>): VerificationCodeStore {
  return {
    reserve: vi.fn(async () => ({ allowed: true as const, reservationId: 'reservation-1' })),
    commit: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    consume: vi.fn(async () => 'MATCH' as const),
    close: vi.fn(onClose),
  };
}
