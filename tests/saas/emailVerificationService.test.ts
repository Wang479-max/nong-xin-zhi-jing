import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  EmailVerificationError,
  EmailVerificationService,
} from '../../server/saas/email/service';
import type { VerificationMailer } from '../../server/saas/email/mailer';
import type {
  VerificationCodeStore,
  VerificationConsumeResult,
} from '../../server/saas/email/types';

const SECRET = 'email-code-hmac-secret-that-is-at-least-32-characters';
const NOW = Date.parse('2030-01-01T00:00:00.000Z');

describe('EmailVerificationService', () => {
  it('normalizes identity data, sends six digits and stores only HMAC values', async () => {
    const store = createStore();
    const mailer = createMailer();
    const service = createService(store, mailer);

    const result = await service.sendCode({
      email: ' Grower@Example.COM ',
      purpose: 'register',
      ip: ' 203.0.113.10 ',
    });

    expect(result).toEqual({
      accepted: true,
      retryAfterSeconds: 60,
      expiresInSeconds: 300,
    });
    expect(store.reserve).toHaveBeenCalledWith({
      emailHash: hmac('email\ngrower@example.com'),
      ipHash: hmac('ip\n203.0.113.10'),
      purpose: 'register',
      nowMs: NOW,
    });
    expect(mailer.sendCode).toHaveBeenCalledWith({
      email: 'grower@example.com',
      code: '123456',
      purpose: 'register',
    });
    expect(store.commit).toHaveBeenCalledWith({
      reservationId: 'reservation-1',
      emailHash: hmac('email\ngrower@example.com'),
      ipHash: hmac('ip\n203.0.113.10'),
      purpose: 'register',
      codeHash: hmac('register\ngrower@example.com\n123456'),
      nowMs: NOW,
    });
    expect(JSON.stringify(vi.mocked(store.commit).mock.calls)).not.toContain('"123456"');
    expect(JSON.stringify(vi.mocked(store.reserve).mock.calls)).not.toContain('grower@example.com');
  });

  it('consumes a matching code using the normalized email and purpose-specific HMAC', async () => {
    const store = createStore({ consumeResult: 'MATCH' });
    const service = createService(store, createMailer());

    await expect(service.consumeCode({
      email: ' Grower@Example.COM ',
      purpose: 'reset_password',
      code: '654321',
    })).resolves.toBeUndefined();

    expect(store.consume).toHaveBeenCalledWith({
      emailHash: hmac('email\ngrower@example.com'),
      purpose: 'reset_password',
      candidateHash: hmac('reset_password\ngrower@example.com\n654321'),
      nowMs: NOW,
    });
  });

  it.each([
    ['MISMATCH', 'INVALID_CODE'],
    ['EXPIRED', 'CODE_EXPIRED'],
    ['LOCKED', 'CODE_LOCKED'],
  ] as const)('maps %s consumption to %s', async (consumeResult, expectedCode) => {
    const service = createService(createStore({ consumeResult }), createMailer());

    await expect(service.consumeCode({
      email: 'grower@example.com',
      purpose: 'register',
      code: '123456',
    })).rejects.toMatchObject({ code: expectedCode });
  });

  it('aborts the reservation and returns a stable error when SMTP delivery fails', async () => {
    const store = createStore();
    const mailer = createMailer(new Error(
      'provider leaked grower@example.com, code 123456 and smtp-authorization-code',
    ));
    const service = createService(store, mailer);

    const attempt = service.sendCode({
      email: 'grower@example.com',
      purpose: 'register',
      ip: '203.0.113.10',
    });

    await expect(attempt).rejects.toEqual(expect.objectContaining({
      name: 'EmailVerificationError',
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message: 'EMAIL_DELIVERY_UNAVAILABLE',
    }));
    expect(store.abort).toHaveBeenCalledWith('reservation-1');
    const publicError = await attempt.catch((error: unknown) => error);
    expect(JSON.stringify(publicError)).not.toContain('grower@example.com');
    expect(JSON.stringify(publicError)).not.toContain('123456');
    expect(JSON.stringify(publicError)).not.toContain('smtp-authorization-code');
  });

  it('aborts and fails closed when committing the sent code is unavailable', async () => {
    const store = createStore({ commitError: new Error('Redis unavailable') });
    const service = createService(store, createMailer());

    await expect(service.sendCode({
      email: 'grower@example.com',
      purpose: 'register',
      ip: '203.0.113.10',
    })).rejects.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
    expect(store.abort).toHaveBeenCalledWith('reservation-1');
  });

  it.each([
    ['COOLDOWN', 42],
    ['IN_PROGRESS', 30],
    ['EMAIL_RATE_LIMITED', 3_000],
    ['IP_RATE_LIMITED', 2_000],
  ] as const)('propagates %s as a retryable rate limit', async (reason, retryAfterSeconds) => {
    const store = createStore({
      reserveResult: { allowed: false, reason, retryAfterSeconds },
    });
    const mailer = createMailer();
    const service = createService(store, mailer);

    await expect(service.sendCode({
      email: 'grower@example.com',
      purpose: 'register',
      ip: '203.0.113.10',
    })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      retryAfterSeconds,
    });
    expect(mailer.sendCode).not.toHaveBeenCalled();
  });

  it('maps storage failures to a fail-closed public error', async () => {
    const store = createStore({ reserveError: new Error('Redis credentials leaked') });
    const service = createService(store, createMailer());

    const attempt = service.sendCode({
      email: 'grower@example.com',
      purpose: 'register',
      ip: '203.0.113.10',
    });

    await expect(attempt).rejects.toMatchObject({
      code: 'VERIFICATION_UNAVAILABLE',
      message: 'VERIFICATION_UNAVAILABLE',
    });
    const publicError = await attempt.catch((error: unknown) => error);
    expect(JSON.stringify(publicError)).not.toContain('Redis credentials leaked');
  });

  it('rejects invalid email and code before contacting external services', async () => {
    const store = createStore();
    const mailer = createMailer();
    const service = createService(store, mailer);

    await expect(service.sendCode({
      email: 'not-an-email',
      purpose: 'register',
      ip: '203.0.113.10',
    })).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    await expect(service.consumeCode({
      email: 'grower@example.com',
      purpose: 'register',
      code: '12345',
    })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(store.reserve).not.toHaveBeenCalled();
    expect(store.consume).not.toHaveBeenCalled();
    expect(mailer.sendCode).not.toHaveBeenCalled();
  });

  it('rejects an unsupported verification purpose before contacting external services', async () => {
    const store = createStore();
    const mailer = createMailer();
    const service = createService(store, mailer);

    await expect(service.sendCode({
      email: 'grower@example.com',
      purpose: 'change_email',
      ip: '203.0.113.10',
    })).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    expect(store.reserve).not.toHaveBeenCalled();
    expect(mailer.sendCode).not.toHaveBeenCalled();
  });

  it('exposes only the approved stable error codes', () => {
    expect(new EmailVerificationError('INVALID_EMAIL')).toMatchObject({
      name: 'EmailVerificationError',
      code: 'INVALID_EMAIL',
      message: 'INVALID_EMAIL',
    });
  });
});

function createService(
  store: VerificationCodeStore,
  mailer: VerificationMailer,
): EmailVerificationService {
  return new EmailVerificationService({
    store,
    mailer,
    hmacSecret: SECRET,
    codeTtlSeconds: 300,
    resendCooldownSeconds: 60,
    generateCode: () => '123456',
    now: () => NOW,
  });
}

function createMailer(error?: Error): VerificationMailer {
  return {
    sendCode: vi.fn(async () => {
      if (error) throw error;
    }),
  };
}

function createStore(options: {
  reserveResult?: Awaited<ReturnType<VerificationCodeStore['reserve']>>;
  reserveError?: Error;
  commitError?: Error;
  consumeResult?: VerificationConsumeResult;
} = {}): VerificationCodeStore {
  return {
    reserve: vi.fn(async () => {
      if (options.reserveError) throw options.reserveError;
      return options.reserveResult ?? { allowed: true as const, reservationId: 'reservation-1' };
    }),
    commit: vi.fn(async () => {
      if (options.commitError) throw options.commitError;
    }),
    abort: vi.fn(async () => {}),
    consume: vi.fn(async () => options.consumeResult ?? 'MATCH'),
    close: vi.fn(async () => {}),
  };
}

function hmac(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex');
}
