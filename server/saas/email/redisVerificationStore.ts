import { randomUUID } from 'node:crypto';
import type {
  ReserveResult,
  VerificationCodeStore,
  VerificationConsumeResult,
  VerificationPurpose,
  VerificationStoreConfig,
} from './types';

export interface RedisEvalClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  quit(): Promise<unknown>;
}

const RESERVE_SCRIPT = `
local cooldown_ttl = redis.call('TTL', KEYS[3])
if cooldown_ttl > 0 then return {0, 'COOLDOWN', cooldown_ttl} end
local lock_ttl = redis.call('TTL', KEYS[2])
if lock_ttl > 0 then return {0, 'IN_PROGRESS', lock_ttl} end
local email_count = tonumber(redis.call('GET', KEYS[4]) or '0')
if email_count >= tonumber(ARGV[3]) then return {0, 'EMAIL_RATE_LIMITED', redis.call('TTL', KEYS[4])} end
local ip_count = tonumber(redis.call('GET', KEYS[5]) or '0')
if ip_count >= tonumber(ARGV[4]) then return {0, 'IP_RATE_LIMITED', redis.call('TTL', KEYS[5])} end
if not redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2], 'NX') then
  return {0, 'IN_PROGRESS', redis.call('TTL', KEYS[2])}
end
local reserved_email_count = redis.call('INCR', KEYS[4])
if reserved_email_count == 1 then redis.call('EXPIRE', KEYS[4], ARGV[5]) end
local reserved_ip_count = redis.call('INCR', KEYS[5])
if reserved_ip_count == 1 then redis.call('EXPIRE', KEYS[5], ARGV[5]) end
local payload = cjson.encode({id=ARGV[1], lockKey=KEYS[2], emailKey=KEYS[4], ipKey=KEYS[5]})
if not redis.call('SET', KEYS[1], payload, 'EX', ARGV[2], 'NX') then
  redis.call('DEL', KEYS[2])
  redis.call('DECR', KEYS[4])
  redis.call('DECR', KEYS[5])
  return {0, 'IN_PROGRESS', tonumber(ARGV[2])}
end
return {1, ARGV[1]}
`;

const COMMIT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw or redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return 0
end
local reservation = cjson.decode(raw)
if reservation.id ~= ARGV[1]
  or reservation.lockKey ~= KEYS[2] then return 0 end
redis.call('SET', KEYS[3], cjson.encode({hash=ARGV[2], attempts=0}), 'EX', ARGV[3])
redis.call('SET', KEYS[4], '1', 'EX', ARGV[4])
redis.call('DEL', KEYS[1], KEYS[2])
return 1
`;

const ABORT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local reservation = cjson.decode(raw)
if reservation.id ~= ARGV[1] then return 0 end
if redis.call('GET', reservation.lockKey) == ARGV[1] then redis.call('DEL', reservation.lockKey) end
local email_count = tonumber(redis.call('GET', reservation.emailKey) or '0')
if email_count > 0 then redis.call('DECR', reservation.emailKey) end
local ip_count = tonumber(redis.call('GET', reservation.ipKey) or '0')
if ip_count > 0 then redis.call('DECR', reservation.ipKey) end
redis.call('DEL', KEYS[1])
return 1
`;

const CONSUME_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'EXPIRED' end
local code = cjson.decode(raw)
if code.hash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 'MATCH'
end
code.attempts = tonumber(code.attempts or 0) + 1
if code.attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return 'LOCKED'
end
redis.call('SET', KEYS[1], cjson.encode(code), 'KEEPTTL')
return 'MISMATCH'
`;

export class RedisVerificationCodeStore implements VerificationCodeStore {
  private closed = false;

  constructor(
    private readonly redis: RedisEvalClient,
    private readonly config: VerificationStoreConfig,
    private readonly createId: () => string = randomUUID,
  ) {}

  async reserve(input: {
    emailHash: string;
    ipHash: string;
    purpose: VerificationPurpose;
    nowMs: number;
  }): Promise<ReserveResult> {
    const reservationId = this.createId();
    const result = await this.redis.eval(RESERVE_SCRIPT, {
      keys: [
        this.reservationKey(reservationId),
        this.lockKey(input.purpose, input.emailHash),
        this.cooldownKey(input.purpose, input.emailHash),
        this.hourKey('email', input.nowMs, input.emailHash),
        this.hourKey('ip', input.nowMs, input.ipHash),
      ],
      arguments: [
        reservationId,
        String(this.config.reservationTtlSeconds),
        String(this.config.emailHourlyLimit),
        String(this.config.ipHourlyLimit),
        String(this.secondsUntilHourEnd(input.nowMs)),
      ],
    });
    if (!Array.isArray(result)) invalidResponse();
    if (Number(result[0]) === 1 && typeof result[1] === 'string') {
      return { allowed: true, reservationId: result[1] };
    }
    const reason = result[1];
    if (Number(result[0]) !== 0 || !isDeniedReason(reason)) invalidResponse();
    const retryAfterSeconds = Number(result[2]);
    if (!Number.isFinite(retryAfterSeconds)) invalidResponse();
    return { allowed: false, reason, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) };
  }

  async commit(input: {
    reservationId: string;
    emailHash: string;
    ipHash: string;
    purpose: VerificationPurpose;
    codeHash: string;
    nowMs: number;
  }): Promise<void> {
    const result = await this.redis.eval(COMMIT_SCRIPT, {
      keys: [
        this.reservationKey(input.reservationId),
        this.lockKey(input.purpose, input.emailHash),
        this.codeKey(input.purpose, input.emailHash),
        this.cooldownKey(input.purpose, input.emailHash),
      ],
      arguments: [
        input.reservationId,
        input.codeHash,
        String(this.config.codeTtlSeconds),
        String(this.config.resendCooldownSeconds),
      ],
    });
    if (Number(result) !== 1) throw new Error('Verification reservation is no longer valid.');
  }

  async abort(reservationId: string): Promise<void> {
    await this.redis.eval(ABORT_SCRIPT, {
      keys: [this.reservationKey(reservationId)],
      arguments: [reservationId],
    });
  }

  async consume(input: {
    emailHash: string;
    purpose: VerificationPurpose;
    candidateHash: string;
    nowMs: number;
  }): Promise<VerificationConsumeResult> {
    const result = await this.redis.eval(CONSUME_SCRIPT, {
      keys: [this.codeKey(input.purpose, input.emailHash)],
      arguments: [input.candidateHash, String(this.config.maxAttempts)],
    });
    if (result === 'MATCH' || result === 'MISMATCH' || result === 'LOCKED' || result === 'EXPIRED') return result;
    return invalidResponse();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.redis.quit();
  }

  private reservationKey(id: string): string {
    return `nxzj:verify:reservation:${id}`;
  }

  private lockKey(purpose: VerificationPurpose, emailHash: string): string {
    return `nxzj:verify:reservation-lock:${purpose}:${emailHash}`;
  }

  private codeKey(purpose: VerificationPurpose, emailHash: string): string {
    return `nxzj:verify:code:${purpose}:${emailHash}`;
  }

  private cooldownKey(purpose: VerificationPurpose, emailHash: string): string {
    return `nxzj:verify:cooldown:${purpose}:${emailHash}`;
  }

  private hourKey(kind: 'email' | 'ip', nowMs: number, hash: string): string {
    return `nxzj:verify:${kind}-hour:${Math.floor(nowMs / 3_600_000)}:${hash}`;
  }

  private secondsUntilHourEnd(nowMs: number): number {
    const hourEnd = (Math.floor(nowMs / 3_600_000) + 1) * 3_600_000;
    return Math.max(1, Math.ceil((hourEnd - nowMs) / 1_000));
  }
}

function isDeniedReason(value: unknown): value is Exclude<ReserveResult, { allowed: true }>['reason'] {
  return value === 'COOLDOWN'
    || value === 'IN_PROGRESS'
    || value === 'EMAIL_RATE_LIMITED'
    || value === 'IP_RATE_LIMITED';
}

function invalidResponse(): never {
  throw new Error('Invalid Redis verification response.');
}
