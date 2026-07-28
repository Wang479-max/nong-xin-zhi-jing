import { describe, expect, it, vi } from 'vitest';
import {
  MailDeliveryError,
  NodemailerVerificationMailer,
  createSmtpVerificationMailer,
  type MailDeliveryEvent,
  type VerificationMailTransport,
} from '../../server/saas/email/mailer';

const smtp = {
  host: 'smtp.qq.com',
  port: 465 as const,
  secure: true,
  user: 'sender@qq.com',
  pass: 'smtp-authorization-code',
  fromName: '农芯智境',
};

describe('NodemailerVerificationMailer', () => {
  it('sends a branded registration email with text and safe HTML content', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const events: MailDeliveryEvent[] = [];
    const mailer = new NodemailerVerificationMailer(
      { sendMail },
      { senderEmail: smtp.user, fromName: smtp.fromName },
      (event) => events.push(event),
      () => 1_000,
    );

    await mailer.sendCode({
      email: 'grower@example.com',
      code: '123456',
      purpose: 'register',
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"农芯智境" <sender@qq.com>',
      to: 'grower@example.com',
      subject: '农芯智境邮箱验证码',
    }));
    const message = sendMail.mock.calls[0][0];
    expect(message.text).toContain('123456');
    expect(message.text).toContain('5 分钟');
    expect(message.html).toContain('https://www.nongxinzhijing.site');
    expect(message.html).toContain('123456');
    expect(JSON.stringify(message)).not.toContain(smtp.pass);
    expect(events).toEqual([{
      event: 'email_verification_delivery',
      purpose: 'register',
      recipient: 'g***@example.com',
      durationMs: 0,
      result: 'success',
    }]);
  });

  it('uses a distinct password-reset subject and escapes dynamic HTML values', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const mailer = new NodemailerVerificationMailer(
      { sendMail },
      { senderEmail: smtp.user, fromName: '农芯"智境' },
      () => {},
    );

    await mailer.sendCode({
      email: 'grower@example.com',
      code: '<12345',
      purpose: 'reset_password',
    });

    const message = sendMail.mock.calls[0][0];
    expect(message.subject).toBe('农芯智境密码重置验证码');
    expect(message.html).not.toContain('<12345');
    expect(message.html).toContain('&lt;12345');
    expect(message.from).not.toContain('\r');
    expect(message.from).not.toContain('\n');
  });

  it('wraps provider failures and logs only masked, non-sensitive metadata', async () => {
    const providerError = new Error(
      '535 auth failed for grower@example.com using smtp-authorization-code and code 123456',
    );
    const sendMail = vi.fn().mockRejectedValue(providerError);
    const events: MailDeliveryEvent[] = [];
    let nowMs = 2_000;
    const mailer = new NodemailerVerificationMailer(
      { sendMail },
      { senderEmail: smtp.user, fromName: smtp.fromName },
      (event) => events.push(event),
      () => {
        nowMs += 25;
        return nowMs;
      },
    );

    const attempt = mailer.sendCode({
      email: 'grower@example.com',
      code: '123456',
      purpose: 'register',
    });

    await expect(attempt).rejects.toEqual(expect.objectContaining({
      name: 'MailDeliveryError',
      code: 'SMTP_DELIVERY_FAILED',
      message: 'SMTP delivery failed.',
    }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      recipient: 'g***@example.com',
      purpose: 'register',
      result: 'failure',
      durationMs: 25,
    });
    const publicError = await attempt.catch((error: unknown) => error);
    expect(publicError).toBeInstanceOf(MailDeliveryError);
    const observableOutput = JSON.stringify({ error: publicError, events });
    expect(observableOutput).not.toContain('grower@example.com');
    expect(observableOutput).not.toContain('smtp-authorization-code');
    expect(observableOutput).not.toContain('123456');
    expect(observableOutput).not.toContain('535 auth failed');
  });

  it('does not turn a successful SMTP delivery into a failure when logging fails', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const mailer = new NodemailerVerificationMailer(
      { sendMail },
      { senderEmail: smtp.user, fromName: smtp.fromName },
      () => {
        throw new Error('log sink unavailable');
      },
    );

    await expect(mailer.sendCode({
      email: 'grower@example.com',
      code: '123456',
      purpose: 'register',
    })).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

describe('createSmtpVerificationMailer', () => {
  it('creates one SMTP transport with authentication and bounded timeouts', () => {
    const transport: VerificationMailTransport = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };
    const createTransport = vi.fn().mockReturnValue(transport);

    const mailer = createSmtpVerificationMailer(smtp, {
      createTransport,
      log: () => {},
    });

    expect(mailer).toBeInstanceOf(NodemailerVerificationMailer);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      auth: {
        user: 'sender@qq.com',
        pass: 'smtp-authorization-code',
      },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  });
});
