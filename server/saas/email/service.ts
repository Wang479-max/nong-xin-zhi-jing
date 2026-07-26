import { createHmac, randomInt } from 'node:crypto';
import { z } from 'zod';
import type { VerificationMailer } from './mailer';
import type {
  VerificationCodeStore,
  VerificationPurpose,
} from './types';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const codeSchema = z.string().regex(/^\d{6}$/);
const purposeSchema = z.enum(['register', 'reset_password']);
const ipSchema = z.string().trim().min(1).max(128);

export type EmailVerificationErrorCode =
  | 'INVALID_EMAIL'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'CODE_LOCKED'
  | 'TOO_MANY_REQUESTS'
  | 'EMAIL_DELIVERY_UNAVAILABLE'
  | 'VERIFICATION_UNAVAILABLE';

export class EmailVerificationError extends Error {
  constructor(
    public readonly code: EmailVerificationErrorCode,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'EmailVerificationError';
  }
}

export interface EmailCodeAccepted {
  accepted: true;
  retryAfterSeconds: number;
  expiresInSeconds: number;
}

export class EmailVerificationService {
  private readonly store: VerificationCodeStore;
  private readonly mailer: VerificationMailer;
  private readonly hmacSecret: string;
  private readonly codeTtlSeconds: number;
  private readonly resendCooldownSeconds: number;
  private readonly generateCode: () => string;
  private readonly now: () => number;

  constructor(options: {
    store: VerificationCodeStore;
    mailer: VerificationMailer;
    hmacSecret: string;
    codeTtlSeconds: number;
    resendCooldownSeconds: number;
    generateCode?: () => string;
    now?: () => number;
  }) {
    if (options.hmacSecret.trim().length < 32) {
      throw new Error('Email verification HMAC secret must be at least 32 characters.');
    }
    this.store = options.store;
    this.mailer = options.mailer;
    this.hmacSecret = options.hmacSecret;
    this.codeTtlSeconds = options.codeTtlSeconds;
    this.resendCooldownSeconds = options.resendCooldownSeconds;
    this.generateCode = options.generateCode
      ?? (() => randomInt(0, 1_000_000).toString().padStart(6, '0'));
    this.now = options.now ?? Date.now;
  }

  async sendCode(input: unknown): Promise<EmailCodeAccepted> {
    const parsed = this.parseSendInput(input);
    const nowMs = this.now();
    const emailHash = this.hmac(`email\n${parsed.email}`);
    const ipHash = this.hmac(`ip\n${parsed.ip}`);

    let reservation;
    try {
      reservation = await this.store.reserve({
        emailHash,
        ipHash,
        purpose: parsed.purpose,
        nowMs,
      });
    } catch {
      throw new EmailVerificationError('VERIFICATION_UNAVAILABLE');
    }

    if (!reservation.allowed) {
      throw new EmailVerificationError('TOO_MANY_REQUESTS', reservation.retryAfterSeconds);
    }

    const code = this.generateCode();
    if (!codeSchema.safeParse(code).success) {
      await this.safeAbort(reservation.reservationId);
      throw new EmailVerificationError('VERIFICATION_UNAVAILABLE');
    }

    try {
      await this.mailer.sendCode({
        email: parsed.email,
        code,
        purpose: parsed.purpose,
      });
    } catch {
      await this.safeAbort(reservation.reservationId);
      throw new EmailVerificationError('EMAIL_DELIVERY_UNAVAILABLE');
    }

    try {
      await this.store.commit({
        reservationId: reservation.reservationId,
        emailHash,
        ipHash,
        purpose: parsed.purpose,
        codeHash: this.hmac(`${parsed.purpose}\n${parsed.email}\n${code}`),
        nowMs: this.now(),
      });
    } catch {
      await this.safeAbort(reservation.reservationId);
      throw new EmailVerificationError('VERIFICATION_UNAVAILABLE');
    }

    return {
      accepted: true,
      retryAfterSeconds: this.resendCooldownSeconds,
      expiresInSeconds: this.codeTtlSeconds,
    };
  }

  async consumeCode(input: unknown): Promise<void> {
    const parsed = this.parseConsumeInput(input);
    const nowMs = this.now();
    let result;
    try {
      result = await this.store.consume({
        emailHash: this.hmac(`email\n${parsed.email}`),
        purpose: parsed.purpose,
        candidateHash: this.hmac(`${parsed.purpose}\n${parsed.email}\n${parsed.code}`),
        nowMs,
      });
    } catch {
      throw new EmailVerificationError('VERIFICATION_UNAVAILABLE');
    }

    if (result === 'MATCH') return;
    if (result === 'MISMATCH') throw new EmailVerificationError('INVALID_CODE');
    if (result === 'EXPIRED') throw new EmailVerificationError('CODE_EXPIRED');
    throw new EmailVerificationError('CODE_LOCKED');
  }

  private parseSendInput(input: unknown): {
    email: string;
    purpose: VerificationPurpose;
    ip: string;
  } {
    const value = record(input);
    const email = emailSchema.safeParse(value?.email);
    if (!email.success) throw new EmailVerificationError('INVALID_EMAIL');
    const purpose = purposeSchema.safeParse(value?.purpose);
    if (!purpose.success) throw new EmailVerificationError('INVALID_EMAIL');
    const ip = ipSchema.safeParse(value?.ip);
    if (!ip.success) {
      throw new EmailVerificationError('VERIFICATION_UNAVAILABLE');
    }
    return { email: email.data, purpose: purpose.data, ip: ip.data };
  }

  private parseConsumeInput(input: unknown): {
    email: string;
    purpose: VerificationPurpose;
    code: string;
  } {
    const value = record(input);
    const email = emailSchema.safeParse(value?.email);
    if (!email.success) throw new EmailVerificationError('INVALID_EMAIL');
    const code = codeSchema.safeParse(value?.code);
    if (!code.success) throw new EmailVerificationError('INVALID_CODE');
    const purpose = purposeSchema.safeParse(value?.purpose);
    if (!purpose.success) throw new EmailVerificationError('INVALID_CODE');
    return { email: email.data, purpose: purpose.data, code: code.data };
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.hmacSecret).update(value).digest('hex');
  }

  private async safeAbort(reservationId: string): Promise<void> {
    try {
      await this.store.abort(reservationId);
    } catch {
      // A failed cleanup stays fail-closed: the reservation expires on its own.
    }
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}
