import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadSmtpConfig, type SmtpConfig } from '../server/saas/email/config';
import {
  createSmtpVerificationMailer,
  type VerificationMailer,
} from '../server/saas/email/mailer';

interface SmtpSmokeDependencies {
  createMailer?: (config: SmtpConfig) => VerificationMailer;
  log?: (message: string) => void;
  createCode?: () => string;
}

export async function runSmtpSmokeTest(
  environment: Record<string, string | undefined>,
  dependencies: SmtpSmokeDependencies = {},
): Promise<void> {
  const administratorEmail = z.string()
    .trim()
    .toLowerCase()
    .email('ADMIN_EMAIL must be a valid email address.')
    .parse(environment.ADMIN_EMAIL);
  const config = loadSmtpConfig(environment);
  const mailer = dependencies.createMailer?.(config)
    ?? createSmtpVerificationMailer({
      ...config,
      port: config.port as 465 | 587,
    });

  await mailer.sendCode({
    email: administratorEmail,
    code: dependencies.createCode?.() ?? String(randomInt(100_000, 1_000_000)),
    purpose: 'register',
  });

  (dependencies.log ?? console.info)('SMTP smoke test succeeded for the administrator mailbox.');
}

const isCliEntrypoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCliEntrypoint) {
  void runSmtpSmokeTest(process.env).catch(() => {
    console.error('SMTP smoke test failed. Check the protected environment settings.');
    process.exitCode = 1;
  });
}
