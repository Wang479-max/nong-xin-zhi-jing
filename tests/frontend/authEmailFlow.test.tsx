/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from '../../src/components/Auth';
import type { SaasSession } from '../../src/types/saas';

const authMocks = vi.hoisted(() => ({
  sendEmailCode: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('../../src/services/saasClient', () => ({
  SaasApiError: class SaasApiError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  },
  saasClient: authMocks,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const session: SaasSession = {
  user: {
    id: 'user-1',
    username: 'grower@example.com',
    email: 'grower@example.com',
    displayName: 'grower',
    accountStatus: 'active',
    platformRole: 'user',
    createdAt: '2030-01-01T00:00:00.000Z',
  },
  organization: { id: 'org-1', name: 'Farm', createdAt: '2030-01-01T00:00:00.000Z' },
  membership: {
    id: 'member-1',
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'owner',
    createdAt: '2030-01-01T00:00:00.000Z',
  },
  entitlement: {
    organizationId: 'org-1',
    productId: 'free',
    plan: 'free',
    status: 'active',
    features: ['monitoring.basic'],
    limits: { plots: 2 },
  },
};

beforeEach(() => {
  authMocks.sendEmailCode.mockResolvedValue({
    accepted: true,
    retryAfterSeconds: 60,
    expiresInSeconds: 300,
  });
  authMocks.login.mockResolvedValue(session);
  authMocks.register.mockResolvedValue(session);
  authMocks.resetPassword.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Auth email account flow', () => {
  it('shows email login without a verification field', () => {
    render(<Auth onLogin={vi.fn()} />);

    expect((screen.getByLabelText('邮箱') as HTMLInputElement).type).toBe('email');
    expect(screen.queryByLabelText('验证码')).toBeNull();
    expect(screen.getByRole('button', { name: '忘记密码' })).not.toBeNull();
  });

  it('requests a registration code and starts the resend countdown', async () => {
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '切换到注册' }));
    await screen.findByLabelText('验证码');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'grower@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => expect(authMocks.sendEmailCode).toHaveBeenCalledWith({
      email: 'grower@example.com',
      purpose: 'register',
    }));
    expect((screen.getByRole('button', { name: '60 秒后重发' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('验证码')).not.toBeNull();
  });

  it('does not call the API for an invalid email', async () => {
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '切换到注册' }));
    await screen.findByLabelText('验证码');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'invalid-email' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(authMocks.sendEmailCode).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain('请输入有效的邮箱地址');
  });

  it('registers with the code and returns the authenticated session', async () => {
    const onLogin = vi.fn();
    render(<Auth onLogin={onLogin} />);
    fireEvent.click(screen.getByRole('button', { name: '切换到注册' }));
    await screen.findByLabelText('验证码');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'grower@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'StrongPassword#123' } });
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } });
    fireEvent.submit(screen.getByRole('form', { name: '邮箱账号表单' }));

    await waitFor(() => expect(authMocks.register).toHaveBeenCalledWith({
      email: 'grower@example.com',
      password: 'StrongPassword#123',
      verificationCode: '123456',
    }));
    expect(onLogin).toHaveBeenCalledWith(session, '3d');
  });

  it('resets the password with a reset-purpose code and returns to login', async () => {
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '忘记密码' }));
    await screen.findByLabelText('验证码');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'grower@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await waitFor(() => expect(authMocks.sendEmailCode).toHaveBeenCalledWith({
      email: 'grower@example.com',
      purpose: 'reset_password',
    }));
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'NewStrongPassword#456' } });
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '654321' } });
    fireEvent.submit(screen.getByRole('form', { name: '邮箱账号表单' }));

    await waitFor(() => expect(authMocks.resetPassword).toHaveBeenCalledWith({
      email: 'grower@example.com',
      password: 'NewStrongPassword#456',
      verificationCode: '654321',
    }));
    expect(await screen.findByRole('button', { name: '忘记密码' })).not.toBeNull();
    expect(authMocks.login).not.toHaveBeenCalled();
  });

  it('clears secrets and stale errors when changing modes', async () => {
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '切换到注册' }));
    await screen.findByLabelText('验证码');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'invalid-email' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'SecretPassword#123' } });
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect(await screen.findByRole('alert')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '切换到登录' }));

    await waitFor(() => expect(screen.queryByLabelText('验证码')).toBeNull());
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the administrator shortcut free of embedded credentials', () => {
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '管理员登录提示' }));

    expect((screen.getByLabelText('邮箱') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('alert').textContent).toContain('请使用部署时配置的管理员邮箱登录');
  });
});
