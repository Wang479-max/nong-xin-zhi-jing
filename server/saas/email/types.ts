export type VerificationPurpose = 'register' | 'reset_password';

export interface VerificationStoreConfig {
  codeTtlSeconds: number;
  resendCooldownSeconds: number;
  emailHourlyLimit: number;
  ipHourlyLimit: number;
  maxAttempts: number;
  reservationTtlSeconds: number;
}

export type ReserveResult =
  | { allowed: true; reservationId: string }
  | {
    allowed: false;
    reason: 'COOLDOWN' | 'IN_PROGRESS' | 'EMAIL_RATE_LIMITED' | 'IP_RATE_LIMITED';
    retryAfterSeconds: number;
  };

export type VerificationConsumeResult = 'MATCH' | 'MISMATCH' | 'EXPIRED' | 'LOCKED';

export interface VerificationCodeStore {
  reserve(input: {
    emailHash: string;
    ipHash: string;
    purpose: VerificationPurpose;
    nowMs: number;
  }): Promise<ReserveResult>;
  commit(input: {
    reservationId: string;
    emailHash: string;
    ipHash: string;
    purpose: VerificationPurpose;
    codeHash: string;
    nowMs: number;
  }): Promise<void>;
  abort(reservationId: string): Promise<void>;
  consume(input: {
    emailHash: string;
    purpose: VerificationPurpose;
    candidateHash: string;
    nowMs: number;
  }): Promise<VerificationConsumeResult>;
  close(): Promise<void>;
}
