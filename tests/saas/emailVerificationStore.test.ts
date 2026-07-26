import { describe, expect, it } from 'vitest';
import { MemoryVerificationCodeStore } from '../../server/saas/email/memoryVerificationStore';
import { RedisVerificationCodeStore, type RedisEvalClient } from '../../server/saas/email/redisVerificationStore';
import type {
  VerificationCodeStore,
  VerificationStoreConfig,
  VerificationPurpose,
} from '../../server/saas/email/types';

const config: VerificationStoreConfig = {
  codeTtlSeconds: 300,
  resendCooldownSeconds: 60,
  emailHourlyLimit: 5,
  ipHourlyLimit: 20,
  maxAttempts: 5,
  reservationTtlSeconds: 30,
};
const START = Date.parse('2030-01-01T00:00:00.000Z');

describe('MemoryVerificationCodeStore', () => {
  it('reserves once and blocks a concurrent reservation for the same purpose and email', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const first = await reserve(store);
    const second = await reserve(store);

    expect(first).toMatchObject({ allowed: true, reservationId: expect.any(String) });
    expect(second).toEqual({ allowed: false, reason: 'IN_PROGRESS', retryAfterSeconds: 30 });
  });

  it('commits a code and enforces the resend cooldown', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const reservationId = await allowedReservation(store);
    await commit(store, reservationId);

    await expect(reserve(store, START + 1_000)).resolves.toEqual({
      allowed: false,
      reason: 'COOLDOWN',
      retryAfterSeconds: 59,
    });
    await expect(reserve(store, START + 60_000)).resolves.toMatchObject({ allowed: true });
  });

  it('limits successful sends by email within an hour', async () => {
    const store = new MemoryVerificationCodeStore(config);
    for (let index = 0; index < 5; index += 1) {
      const nowMs = START + index * 61_000;
      const reservationId = await allowedReservation(store, { nowMs });
      await commit(store, reservationId, { nowMs });
    }

    await expect(reserve(store, START + 5 * 61_000)).resolves.toEqual({
      allowed: false,
      reason: 'EMAIL_RATE_LIMITED',
      retryAfterSeconds: 3_295,
    });
  });

  it('limits successful sends by IP across different emails', async () => {
    const store = new MemoryVerificationCodeStore(config);
    for (let index = 0; index < 20; index += 1) {
      const emailHash = `email-${index}`;
      const reservationId = await allowedReservation(store, { emailHash });
      await commit(store, reservationId, { emailHash });
    }

    await expect(reserve(store, START, { emailHash: 'email-20' })).resolves.toEqual({
      allowed: false,
      reason: 'IP_RATE_LIMITED',
      retryAfterSeconds: 3_600,
    });
  });

  it('counts in-flight reservations so concurrent requests cannot bypass the IP limit', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const reservations: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      reservations.push(await allowedReservation(store, { emailHash: `email-${index}` }));
    }

    await expect(reserve(store, START, { emailHash: 'email-20' })).resolves.toEqual({
      allowed: false,
      reason: 'IP_RATE_LIMITED',
      retryAfterSeconds: 3_600,
    });

    await store.abort(reservations[0]);
    await expect(reserve(store, START, { emailHash: 'email-20' })).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('aborts only its reservation without creating cooldown or consuming capacity', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const reservationId = await allowedReservation(store);

    await store.abort(reservationId);

    await expect(reserve(store)).resolves.toMatchObject({ allowed: true });
  });

  it('returns mismatch and locks the fifth incorrect attempt', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const reservationId = await allowedReservation(store);
    await commit(store, reservationId);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(consume(store, 'wrong-code')).resolves.toBe('MISMATCH');
    }
    await expect(consume(store, 'wrong-code')).resolves.toBe('LOCKED');
    await expect(consume(store, 'code-hash')).resolves.toBe('EXPIRED');
  });

  it('consumes a matching code only once', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const reservationId = await allowedReservation(store);
    await commit(store, reservationId);

    await expect(consume(store, 'code-hash')).resolves.toBe('MATCH');
    await expect(consume(store, 'code-hash')).resolves.toBe('EXPIRED');
  });

  it('expires codes and isolates registration from password reset', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const reservationId = await allowedReservation(store);
    await commit(store, reservationId);

    await expect(consume(store, 'code-hash', START + 1_000, 'reset_password')).resolves.toBe('EXPIRED');
    await expect(consume(store, 'code-hash', START + 300_001)).resolves.toBe('EXPIRED');
  });

  it('does not let an old abort remove a newer reservation', async () => {
    const store = new MemoryVerificationCodeStore(config);
    const oldReservation = await allowedReservation(store);
    await store.abort(oldReservation);
    const newer = await allowedReservation(store);

    await store.abort(oldReservation);

    await expect(reserve(store)).resolves.toEqual({
      allowed: false,
      reason: 'IN_PROGRESS',
      retryAfterSeconds: 30,
    });
    expect(newer).not.toBe(oldReservation);
  });
});

describe('RedisVerificationCodeStore', () => {
  it('maps Lua reserve responses and uses only hashed identity keys', async () => {
    const redis = new ScriptedRedis([[1, 'reservation-1'], [0, 'COOLDOWN', 42]]);
    const store = new RedisVerificationCodeStore(redis, config, () => 'reservation-1');

    await expect(reserve(store)).resolves.toEqual({ allowed: true, reservationId: 'reservation-1' });
    await expect(reserve(store)).resolves.toEqual({
      allowed: false,
      reason: 'COOLDOWN',
      retryAfterSeconds: 42,
    });
    expect(redis.calls[0].keys.join(':')).toContain('email-hash');
    expect(redis.calls[0].keys.join(':')).toContain('ip-hash');
    expect(redis.calls[0].keys.join(':')).not.toContain('grower@example.com');
  });

  it('maps consume results and closes the client once', async () => {
    const redis = new ScriptedRedis(['MATCH', 'MISMATCH', 'LOCKED', 'EXPIRED']);
    const store = new RedisVerificationCodeStore(redis, config);

    await expect(consume(store, 'one')).resolves.toBe('MATCH');
    await expect(consume(store, 'two')).resolves.toBe('MISMATCH');
    await expect(consume(store, 'three')).resolves.toBe('LOCKED');
    await expect(consume(store, 'four')).resolves.toBe('EXPIRED');
    await store.close();
    await store.close();

    expect(redis.quitCalls).toBe(1);
  });

  it('commits an existing reservation without depending on the current hour bucket', async () => {
    const redis = new ScriptedRedis([[1, 'reservation-1'], 1]);
    const store = new RedisVerificationCodeStore(redis, config, () => 'reservation-1');
    const reservationId = await allowedReservation(store, { nowMs: START + 3_599_000 });

    await commit(store, reservationId, { nowMs: START + 3_601_000 });

    expect(redis.calls[1].keys).toHaveLength(4);
    expect(redis.calls[1].keys).toEqual(expect.arrayContaining([
      'nxzj:verify:reservation:reservation-1',
      'nxzj:verify:reservation-lock:register:email-hash',
      'nxzj:verify:code:register:email-hash',
      'nxzj:verify:cooldown:register:email-hash',
    ]));
  });

  it('rejects malformed Lua responses instead of failing open', async () => {
    const redis = new ScriptedRedis([[9, 'unexpected'], 'UNKNOWN']);
    const store = new RedisVerificationCodeStore(redis, config);

    await expect(reserve(store)).rejects.toThrow('Invalid Redis verification response.');
    await expect(consume(store, 'candidate')).rejects.toThrow('Invalid Redis verification response.');
  });
});

async function allowedReservation(
  store: VerificationCodeStore,
  overrides: Partial<Parameters<VerificationCodeStore['reserve']>[0]> = {},
): Promise<string> {
  const result = await reserve(store, overrides.nowMs ?? START, overrides);
  if ('reason' in result) throw new Error(`Expected reservation, got ${result.reason}.`);
  return result.reservationId;
}

function reserve(
  store: VerificationCodeStore,
  nowMs = START,
  overrides: Partial<Parameters<VerificationCodeStore['reserve']>[0]> = {},
) {
  return store.reserve({
    emailHash: 'email-hash',
    ipHash: 'ip-hash',
    purpose: 'register',
    nowMs,
    ...overrides,
  });
}

function commit(
  store: VerificationCodeStore,
  reservationId: string,
  overrides: Partial<Parameters<VerificationCodeStore['commit']>[0]> = {},
) {
  return store.commit({
    reservationId,
    emailHash: 'email-hash',
    ipHash: 'ip-hash',
    purpose: 'register',
    codeHash: 'code-hash',
    nowMs: START,
    ...overrides,
  });
}

function consume(
  store: VerificationCodeStore,
  candidateHash: string,
  nowMs = START + 1_000,
  purpose: VerificationPurpose = 'register',
) {
  return store.consume({
    emailHash: 'email-hash',
    purpose,
    candidateHash,
    nowMs,
  });
}

class ScriptedRedis implements RedisEvalClient {
  readonly calls: Array<{ script: string; keys: string[]; arguments: string[] }> = [];
  quitCalls = 0;

  constructor(private readonly responses: unknown[]) {}

  async eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown> {
    this.calls.push({ script, keys: [...options.keys], arguments: [...options.arguments] });
    return this.responses.shift();
  }

  async quit(): Promise<void> {
    this.quitCalls += 1;
  }
}
