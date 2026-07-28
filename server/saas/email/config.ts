import { z } from 'zod';

const CODE_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_HOURLY_LIMIT = 5;
const IP_HOURLY_LIMIT = 20;
const MAX_ATTEMPTS = 5;

function isUsableRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      !['redis:', 'rediss:'].includes(url.protocol)
      || !url.hostname
      || url.search
      || url.hash
    ) {
      return false;
    }

    decodeURIComponent(url.username);
    decodeURIComponent(url.password);

    if (url.pathname === '' || url.pathname === '/') {
      return true;
    }

    if (!/^\/\d+$/.test(url.pathname)) {
      return false;
    }

    return Number.isSafeInteger(Number(url.pathname.slice(1)));
  } catch {
    return false;
  }
}

const redisUrlSchema = z.string()
  .url('REDIS_URL must be a valid URL.')
  .refine(isUsableRedisUrl, 'REDIS_URL is not usable by the Redis client.');

const smtpConfigSchema = z.object({
  host: z.string().trim().min(1, 'SMTP_HOST is required.'),
  port: z.union([z.literal(465), z.literal(587)]),
  secure: z.boolean(),
  user: z.string().trim().email('SMTP_USER must be a valid email address.'),
  pass: z.string().refine((value) => value.trim().length > 0, 'SMTP_PASS is required.'),
  fromName: z.string().trim().min(1, 'SMTP_FROM_NAME is required.').max(64),
}).strict().superRefine((smtp, context) => {
  const expectedSecure = smtp.port === 465;
  if (smtp.secure !== expectedSecure) {
    context.addIssue({
      code: 'custom',
      message: 'SMTP_SECURE must be true for port 465 and false for port 587.',
      path: ['secure'],
    });
  }
});

const emailConfigSchema = z.object({
  redisUrl: redisUrlSchema,
  hmacSecret: z.string().refine(
    (value) => value.trim().length >= 32,
    'EMAIL_VERIFICATION_HMAC_SECRET must be at least 32 characters after trimming.',
  ),
  smtp: smtpConfigSchema,
  codeTtlSeconds: z.literal(CODE_TTL_SECONDS),
  resendCooldownSeconds: z.literal(RESEND_COOLDOWN_SECONDS),
  emailHourlyLimit: z.literal(EMAIL_HOURLY_LIMIT),
  ipHourlyLimit: z.literal(IP_HOURLY_LIMIT),
  maxAttempts: z.literal(MAX_ATTEMPTS),
}).strict();

export type EmailConfig = z.infer<typeof emailConfigSchema>;
export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

export function loadSmtpConfig(
  environment: Record<string, string | undefined> = process.env,
): SmtpConfig {
  return smtpConfigSchema.parse({
    host: environment.SMTP_HOST,
    port: Number(environment.SMTP_PORT),
    secure: environment.SMTP_SECURE === 'true'
      ? true
      : environment.SMTP_SECURE === 'false'
        ? false
        : environment.SMTP_SECURE,
    user: environment.SMTP_USER,
    pass: environment.SMTP_PASS,
    fromName: environment.SMTP_FROM_NAME,
  });
}

export function loadEmailConfig(
  environment: Record<string, string | undefined> = process.env,
): EmailConfig {
  return emailConfigSchema.parse({
    redisUrl: environment.REDIS_URL,
    hmacSecret: environment.EMAIL_VERIFICATION_HMAC_SECRET,
    smtp: loadSmtpConfig(environment),
    codeTtlSeconds: CODE_TTL_SECONDS,
    resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    emailHourlyLimit: EMAIL_HOURLY_LIMIT,
    ipHourlyLimit: IP_HOURLY_LIMIT,
    maxAttempts: MAX_ATTEMPTS,
  });
}
