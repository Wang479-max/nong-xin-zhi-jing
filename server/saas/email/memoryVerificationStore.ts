import { randomUUID } from 'node:crypto';
import type {
  ReserveResult,
  VerificationCodeStore,
  VerificationConsumeResult,
  VerificationPurpose,
  VerificationStoreConfig,
} from './types';

interface Reservation {
  id: string;
  emailHash: string;
  ipHash: string;
  purpose: VerificationPurpose;
  expiresAtMs: number;
}

interface StoredCode {
  hash: string;
  attempts: number;
  expiresAtMs: number;
}

interface Counter {
  count: number;
  expiresAtMs: number;
}

export class MemoryVerificationCodeStore implements VerificationCodeStore {
  private readonly reservations = new Map<string, Reservation>();
  private readonly reservationLocks = new Map<string, string>();
  private readonly codes = new Map<string, StoredCode>();
  private readonly cooldowns = new Map<string, number>();
  private readonly emailCounters = new Map<string, Counter>();
  private readonly ipCounters = new Map<string, Counter>();

  constructor(
    private readonly config: VerificationStoreConfig,
    private readonly createId: () => string = randomUUID,
  ) {}

  async reserve(input: {
    emailHash: string;
    ipHash: string;
    purpose: VerificationPurpose;
    nowMs: number;
  }): Promise<ReserveResult> {
    this.purge(input.nowMs);
    const identityKey = this.identityKey(input.purpose, input.emailHash);
    const cooldown = this.cooldowns.get(identityKey);
    if (cooldown !== undefined && cooldown > input.nowMs) {
      return this.denied('COOLDOWN', cooldown - input.nowMs);
    }

    const activeReservation = this.reservationLocks.get(identityKey);
    if (activeReservation) {
      const reservation = this.reservations.get(activeReservation);
      if (reservation && reservation.expiresAtMs > input.nowMs) {
        return this.denied('IN_PROGRESS', reservation.expiresAtMs - input.nowMs);
      }
    }

    const emailCounter = this.counter(this.emailCounters, this.hourKey(input.nowMs, input.emailHash), input.nowMs);
    if (emailCounter.count >= this.config.emailHourlyLimit) {
      return this.denied('EMAIL_RATE_LIMITED', emailCounter.expiresAtMs - input.nowMs);
    }
    const ipCounter = this.counter(this.ipCounters, this.hourKey(input.nowMs, input.ipHash), input.nowMs);
    if (ipCounter.count >= this.config.ipHourlyLimit) {
      return this.denied('IP_RATE_LIMITED', ipCounter.expiresAtMs - input.nowMs);
    }

    const reservationId = this.createId();
    this.increment(this.emailCounters, this.hourKey(input.nowMs, input.emailHash), input.nowMs);
    this.increment(this.ipCounters, this.hourKey(input.nowMs, input.ipHash), input.nowMs);
    this.reservations.set(reservationId, {
      id: reservationId,
      emailHash: input.emailHash,
      ipHash: input.ipHash,
      purpose: input.purpose,
      expiresAtMs: input.nowMs + this.config.reservationTtlSeconds * 1_000,
    });
    this.reservationLocks.set(identityKey, reservationId);
    return { allowed: true, reservationId };
  }

  async commit(input: {
    reservationId: string;
    emailHash: string;
    ipHash: string;
    purpose: VerificationPurpose;
    codeHash: string;
    nowMs: number;
  }): Promise<void> {
    this.purge(input.nowMs);
    const reservation = this.reservations.get(input.reservationId);
    if (!reservation
      || reservation.emailHash !== input.emailHash
      || reservation.ipHash !== input.ipHash
      || reservation.purpose !== input.purpose
      || reservation.expiresAtMs <= input.nowMs) {
      throw new Error('Verification reservation is no longer valid.');
    }

    const identityKey = this.identityKey(input.purpose, input.emailHash);
    if (this.reservationLocks.get(identityKey) !== input.reservationId) {
      throw new Error('Verification reservation is no longer valid.');
    }

    this.codes.set(identityKey, {
      hash: input.codeHash,
      attempts: 0,
      expiresAtMs: input.nowMs + this.config.codeTtlSeconds * 1_000,
    });
    this.cooldowns.set(identityKey, input.nowMs + this.config.resendCooldownSeconds * 1_000);
    this.reservations.delete(input.reservationId);
    this.reservationLocks.delete(identityKey);
  }

  async abort(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return;
    const identityKey = this.identityKey(reservation.purpose, reservation.emailHash);
    if (this.reservationLocks.get(identityKey) === reservationId) {
      this.reservationLocks.delete(identityKey);
    }
    this.decrement(this.emailCounters, this.hourKeyFromExpiry(reservation.expiresAtMs, reservation.emailHash));
    this.decrement(this.ipCounters, this.hourKeyFromExpiry(reservation.expiresAtMs, reservation.ipHash));
    this.reservations.delete(reservationId);
  }

  async consume(input: {
    emailHash: string;
    purpose: VerificationPurpose;
    candidateHash: string;
    nowMs: number;
  }): Promise<VerificationConsumeResult> {
    this.purge(input.nowMs);
    const key = this.identityKey(input.purpose, input.emailHash);
    const code = this.codes.get(key);
    if (!code || code.expiresAtMs <= input.nowMs) {
      this.codes.delete(key);
      return 'EXPIRED';
    }
    if (code.hash === input.candidateHash) {
      this.codes.delete(key);
      return 'MATCH';
    }
    code.attempts += 1;
    if (code.attempts >= this.config.maxAttempts) {
      this.codes.delete(key);
      return 'LOCKED';
    }
    return 'MISMATCH';
  }

  async close(): Promise<void> {}

  private identityKey(purpose: VerificationPurpose, emailHash: string): string {
    return `${purpose}:${emailHash}`;
  }

  private hourKey(nowMs: number, hash: string): string {
    return `${Math.floor(nowMs / 3_600_000)}:${hash}`;
  }

  private hourEnd(nowMs: number): number {
    return (Math.floor(nowMs / 3_600_000) + 1) * 3_600_000;
  }

  private counter(store: Map<string, Counter>, key: string, nowMs: number): Counter {
    const existing = store.get(key);
    if (existing && existing.expiresAtMs > nowMs) return existing;
    const created = { count: 0, expiresAtMs: this.hourEnd(nowMs) };
    store.set(key, created);
    return created;
  }

  private increment(store: Map<string, Counter>, key: string, nowMs: number): void {
    this.counter(store, key, nowMs).count += 1;
  }

  private decrement(store: Map<string, Counter>, key: string): void {
    const counter = store.get(key);
    if (!counter) return;
    counter.count = Math.max(0, counter.count - 1);
  }

  private hourKeyFromExpiry(reservationExpiryMs: number, hash: string): string {
    const reservedAtMs = reservationExpiryMs - this.config.reservationTtlSeconds * 1_000;
    return this.hourKey(reservedAtMs, hash);
  }

  private denied(
    reason: Exclude<ReserveResult, { allowed: true }>['reason'],
    remainingMs: number,
  ): ReserveResult {
    return { allowed: false, reason, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)) };
  }

  private purge(nowMs: number): void {
    for (const [id, reservation] of this.reservations) {
      if (reservation.expiresAtMs > nowMs) continue;
      this.reservations.delete(id);
      const identityKey = this.identityKey(reservation.purpose, reservation.emailHash);
      if (this.reservationLocks.get(identityKey) === id) this.reservationLocks.delete(identityKey);
      this.decrement(this.emailCounters, this.hourKeyFromExpiry(reservation.expiresAtMs, reservation.emailHash));
      this.decrement(this.ipCounters, this.hourKeyFromExpiry(reservation.expiresAtMs, reservation.ipHash));
    }
    for (const [key, expiresAt] of this.cooldowns) {
      if (expiresAt <= nowMs) this.cooldowns.delete(key);
    }
    for (const [key, code] of this.codes) {
      if (code.expiresAtMs <= nowMs) this.codes.delete(key);
    }
    for (const [key, counter] of this.emailCounters) {
      if (counter.expiresAtMs <= nowMs) this.emailCounters.delete(key);
    }
    for (const [key, counter] of this.ipCounters) {
      if (counter.expiresAtMs <= nowMs) this.ipCounters.delete(key);
    }
  }
}
