import { describe, expect, it, vi } from 'vitest';
import { runSmtpSmokeTest } from '../../scripts/smtpSmokeTest';

const environment = {
  ADMIN_EMAIL: ' Admin@Example.COM ',
  SMTP_HOST: 'smtp.qq.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'sender@qq.com',
  SMTP_PASS: 'smtp-authorization-code',
  SMTP_FROM_NAME: '农芯智境',
};

describe('SMTP pre-deployment smoke test', () => {
  it('sends one generated code only to the normalized administrator mailbox', async () => {
    const sendCode = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await runSmtpSmokeTest(environment, {
      createMailer: () => ({ sendCode }),
      log,
    });

    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(sendCode).toHaveBeenCalledWith({
      email: 'admin@example.com',
      code: expect.stringMatching(/^\d{6}$/),
      purpose: 'register',
    });
    expect(log).toHaveBeenCalledWith('SMTP smoke test succeeded for the administrator mailbox.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('smtp-authorization-code');
  });

  it('rejects a missing administrator email before creating a mail transport', async () => {
    const createMailer = vi.fn();

    await expect(runSmtpSmokeTest({
      ...environment,
      ADMIN_EMAIL: undefined,
    }, { createMailer })).rejects.toThrow();

    expect(createMailer).not.toHaveBeenCalled();
  });
});
