import { describe, expect, it } from 'vitest';
import { loadEmailConfig } from '../../server/saas/email/config';

const validEnvironment = {
  REDIS_URL: 'redis://:redis-password@127.0.0.1:6379',
  EMAIL_VERIFICATION_HMAC_SECRET: 'email-code-hmac-secret-that-is-at-least-32-characters',
  SMTP_HOST: 'smtp.qq.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'sender@qq.com',
  SMTP_PASS: 'smtp-authorization-code',
  SMTP_FROM_NAME: '农芯智境',
};

describe('email verification configuration', () => {
  it('loads a valid QQ SMTP configuration with fixed verification limits', () => {
    expect(loadEmailConfig(validEnvironment)).toMatchObject({
      smtp: { host: 'smtp.qq.com', port: 465, secure: true, user: 'sender@qq.com' },
      codeTtlSeconds: 300,
      resendCooldownSeconds: 60,
      emailHourlyLimit: 5,
      ipHourlyLimit: 20,
      maxAttempts: 5,
    });
  });

  it('loads a valid 163 SMTP configuration on port 465', () => {
    expect(loadEmailConfig({
      ...validEnvironment,
      SMTP_HOST: 'smtp.163.com',
      SMTP_USER: 'sender@163.com',
    })).toMatchObject({
      smtp: {
        host: 'smtp.163.com',
        port: 465,
        secure: true,
        user: 'sender@163.com',
      },
    });
  });

  it('loads STARTTLS-style SMTP configuration on port 587 with secure disabled', () => {
    expect(loadEmailConfig({
      ...validEnvironment,
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
    })).toMatchObject({
      smtp: { port: 587, secure: false },
    });
  });

  it('rejects missing SMTP credentials', () => {
    expect(() => loadEmailConfig({ ...validEnvironment, SMTP_PASS: '' })).toThrow();
  });

  it('rejects an HMAC secret shorter than 32 characters', () => {
    expect(() => loadEmailConfig({
      ...validEnvironment,
      EMAIL_VERIFICATION_HMAC_SECRET: 'short',
    })).toThrow();
  });

  it('rejects malformed Redis URLs', () => {
    expect(() => loadEmailConfig({
      ...validEnvironment,
      REDIS_URL: 'not-a-redis-url',
    })).toThrow();
  });

  it('rejects secure SMTP on port 587', () => {
    expect(() => loadEmailConfig({
      ...validEnvironment,
      SMTP_PORT: '587',
      SMTP_SECURE: 'true',
    })).toThrow();
  });

  it('rejects insecure SMTP on port 465', () => {
    expect(() => loadEmailConfig({
      ...validEnvironment,
      SMTP_SECURE: 'false',
    })).toThrow();
  });
});
