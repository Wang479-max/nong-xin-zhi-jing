import { createTransport as nodemailerCreateTransport } from 'nodemailer';
import type { VerificationPurpose } from './types';

const OFFICIAL_URL = 'https://www.nongxinzhijing.site';

export interface VerificationMailer {
  sendCode(input: {
    email: string;
    code: string;
    purpose: VerificationPurpose;
  }): Promise<void>;
}

export interface VerificationMailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface MailDeliveryEvent {
  event: 'email_verification_delivery';
  purpose: VerificationPurpose;
  recipient: string;
  durationMs: number;
  result: 'success' | 'failure';
}

export interface SmtpMailerConfig {
  host: string;
  port: 465 | 587;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}

interface SmtpTransportOptions {
  host: string;
  port: 465 | 587;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  connectionTimeout: number;
  socketTimeout: number;
}

export class MailDeliveryError extends Error {
  readonly code = 'SMTP_DELIVERY_FAILED';

  constructor() {
    super('SMTP delivery failed.');
    this.name = 'MailDeliveryError';
  }
}

export class NodemailerVerificationMailer implements VerificationMailer {
  constructor(
    private readonly transport: VerificationMailTransport,
    private readonly sender: { senderEmail: string; fromName: string },
    private readonly log: (event: MailDeliveryEvent) => void = defaultDeliveryLogger,
    private readonly now: () => number = Date.now,
  ) {}

  async sendCode(input: {
    email: string;
    code: string;
    purpose: VerificationPurpose;
  }): Promise<void> {
    const startedAt = this.now();
    const message = createMessage({
      ...input,
      senderEmail: this.sender.senderEmail,
      fromName: this.sender.fromName,
    });

    try {
      await this.transport.sendMail(message);
    } catch {
      this.safeLogDelivery(input, startedAt, 'failure');
      throw new MailDeliveryError();
    }
    this.safeLogDelivery(input, startedAt, 'success');
  }

  private safeLogDelivery(
    input: { email: string; purpose: VerificationPurpose },
    startedAt: number,
    result: MailDeliveryEvent['result'],
  ): void {
    try {
      this.log({
        event: 'email_verification_delivery',
        purpose: input.purpose,
        recipient: maskEmail(input.email),
        durationMs: Math.max(0, this.now() - startedAt),
        result,
      });
    } catch {
      // Observability failures must not alter the delivery result.
    }
  }
}

export function createSmtpVerificationMailer(
  config: SmtpMailerConfig,
  dependencies: {
    createTransport?: (options: SmtpTransportOptions) => VerificationMailTransport;
    log?: (event: MailDeliveryEvent) => void;
    now?: () => number;
  } = {},
): VerificationMailer {
  const createTransport = dependencies.createTransport
    ?? ((options: SmtpTransportOptions) => nodemailerCreateTransport(options));
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return new NodemailerVerificationMailer(
    transport,
    { senderEmail: config.user, fromName: config.fromName },
    dependencies.log,
    dependencies.now,
  );
}

function createMessage(input: {
  email: string;
  code: string;
  purpose: VerificationPurpose;
  senderEmail: string;
  fromName: string;
}) {
  const isRegistration = input.purpose === 'register';
  const subject = isRegistration ? '农芯智境邮箱验证码' : '农芯智境密码重置验证码';
  const action = isRegistration ? '注册农芯智境账户' : '重置农芯智境账户密码';
  const safeCode = escapeHtml(input.code);

  return {
    from: `"${escapeHeaderName(input.fromName)}" <${input.senderEmail}>`,
    to: input.email,
    subject,
    text: [
      '您好！',
      '',
      `您正在${action}，本次验证码为：${input.code}`,
      '验证码 5 分钟内有效，请勿向任何人泄露。',
      '',
      `农芯智境官网：${OFFICIAL_URL}`,
      '如非本人操作，请忽略此邮件。',
    ].join('\n'),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#173c2b;">
    <div style="max-width:560px;margin:32px auto;padding:0 16px;">
      <div style="overflow:hidden;border:1px solid #dce9e1;border-radius:18px;background:#ffffff;box-shadow:0 12px 34px rgba(23,60,43,.08);">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#12613d,#1f8a59);color:#ffffff;">
          <div style="font-size:22px;font-weight:700;letter-spacing:1px;">农芯智境</div>
          <div style="margin-top:6px;font-size:13px;opacity:.86;">智慧农业管理系统</div>
        </div>
        <div style="padding:30px 28px;">
          <p style="margin:0 0 16px;font-size:16px;">您好！</p>
          <p style="margin:0;color:#426452;line-height:1.7;">您正在${action}，请使用以下验证码：</p>
          <div style="margin:24px 0;padding:18px;border-radius:12px;background:#eef8f2;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#12613d;">${safeCode}</div>
          <p style="margin:0;color:#687b70;line-height:1.7;">验证码 <strong>5 分钟</strong>内有效，请勿向任何人泄露。如非本人操作，请忽略此邮件。</p>
          <a href="${OFFICIAL_URL}" style="display:inline-block;margin-top:24px;color:#16774a;text-decoration:none;">访问农芯智境官网</a>
        </div>
      </div>
    </div>
  </body>
</html>`,
  };
}

function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return '***';
  return `${email.slice(0, 1)}***@${email.slice(separator + 1)}`;
}

function escapeHeaderName(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function defaultDeliveryLogger(event: MailDeliveryEvent): void {
  console.info(JSON.stringify(event));
}
