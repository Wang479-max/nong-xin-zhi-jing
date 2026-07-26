import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSaasClient, SESSION_EXPIRED_EVENT, SaasApiError } from '../../src/services/saasClient';

const sessionPayload = (accessToken = 'access-one') => ({
  success: true,
  data: {
    accessToken,
    refreshToken: 'must-never-escape',
    user: {
      id: 'user-1',
      username: 'farmer@example.com',
      email: 'farmer@example.com',
      displayName: 'farmer',
      accountStatus: 'active',
      platformRole: 'user',
      createdAt: '2030-01-01T00:00:00.000Z',
    },
    organization: { id: 'org-1', name: 'Farm', createdAt: '2030-01-01T00:00:00.000Z' },
    membership: { id: 'member-1', userId: 'user-1', organizationId: 'org-1', role: 'owner', createdAt: '2030-01-01T00:00:00.000Z' },
    entitlement: { organizationId: 'org-1', productId: 'free', plan: 'free', status: 'active', features: ['monitoring.basic'], limits: { plots: 2 } },
  },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

afterEach(() => vi.restoreAllMocks());

describe('SaaS browser client', () => {
  it('logs in with credentials, keeps the access token only in memory, and never exposes refresh data', async () => {
    const storageWrites: string[] = [];
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string) => storageWrites.push(key) } });
    const fetcher = vi.fn(async () => json(sessionPayload()));
    const client = createSaasClient(fetcher, 'https://farm.example');

    const session = await client.login({ email: 'farmer@example.com', password: 'StrongPassword#123' });

    expect(session).not.toHaveProperty('accessToken');
    expect(session).not.toHaveProperty('refreshToken');
    expect(client.hasAccessToken()).toBe(true);
    expect(storageWrites).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ credentials: 'include' }));
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('registers with email, password and verification code', async () => {
    const fetcher = vi.fn(async () => json(sessionPayload()));
    const client = createSaasClient(fetcher, 'https://farm.example');

    await client.register({
      email: 'farmer@example.com',
      password: 'StrongPassword#123',
      verificationCode: '123456',
    });

    const init = (fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'farmer@example.com',
      password: 'StrongPassword#123',
      verificationCode: '123456',
    });
  });

  it('sends email codes and resets passwords with exact request bodies', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({
        success: true,
        data: { accepted: true, retryAfterSeconds: 60, expiresInSeconds: 300 },
      }, 202))
      .mockResolvedValueOnce(json({ success: true, data: { reset: true } }));
    const client = createSaasClient(fetcher, 'https://farm.example');

    await expect(client.sendEmailCode({
      email: 'farmer@example.com',
      purpose: 'register',
    })).resolves.toEqual({ accepted: true, retryAfterSeconds: 60, expiresInSeconds: 300 });
    await expect(client.resetPassword({
      email: 'farmer@example.com',
      password: 'NewStrongPassword#456',
      verificationCode: '654321',
    })).resolves.toBeUndefined();

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/email-code',
      '/api/v1/auth/password-reset',
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      email: 'farmer@example.com',
      purpose: 'register',
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      email: 'farmer@example.com',
      password: 'NewStrongPassword#456',
      verificationCode: '654321',
    });
  });

  it('restores through the cookie refresh endpoint and logout always clears memory', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(sessionPayload('restored-token')))
      .mockResolvedValueOnce(json({ success: true, data: { loggedOut: true } }));
    const client = createSaasClient(fetcher, 'https://farm.example');

    const restored = await client.restoreSession();
    expect(restored.user.email).toBe('farmer@example.com');
    expect(fetcher.mock.calls[0]).toEqual(['/api/v1/auth/refresh', expect.objectContaining({ method: 'POST', credentials: 'include' })]);
    await client.logout();
    expect(client.hasAccessToken()).toBe(false);
  });

  it('injects bearer credentials into same-origin calls but never cross-origin calls', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/login')
      ? json(sessionPayload())
      : json({ success: true, data: {} }));
    const client = createSaasClient(fetcher, 'https://farm.example');
    await client.login({ email: 'farmer@example.com', password: 'x' });
    fetcher.mockClear();

    await client.fetchWithSession('/api/plots');
    await client.fetchWithSession('https://weather.example/forecast', { headers: { Authorization: 'Bearer caller-secret' }, credentials: 'include' });

    const sameOrigin = (fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit])[1];
    const crossOrigin = (fetcher.mock.calls[1] as unknown as [RequestInfo | URL, RequestInit])[1];
    expect(new Headers(sameOrigin.headers).get('Authorization')).toBe('Bearer access-one');
    expect(sameOrigin.credentials).toBe('include');
    expect(new Headers(crossOrigin.headers).has('Authorization')).toBe(false);
    expect(crossOrigin.credentials).toBe('omit');
  });

  it('forces credential omission for cross-origin Request objects', async () => {
    const fetcher = vi.fn(async () => json({ success: true, data: {} }));
    const client = createSaasClient(fetcher, 'https://farm.example');

    await client.fetchWithSession(new Request('https://weather.example/forecast', { credentials: 'include' }));

    const init = (fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit])[1];
    expect(init.credentials).toBe('omit');
  });

  it('uses one refresh for concurrent 401 responses and retries each call once', async () => {
    let protectedAttempts = 0;
    let refreshes = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return json(sessionPayload('expired-token'));
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        await Promise.resolve();
        return json(sessionPayload('fresh-token'));
      }
      protectedAttempts += 1;
      if (protectedAttempts <= 2) return json({ success: false, error: { code: 'INVALID_ACCESS_TOKEN', message: 'expired' } }, 401);
      return json({ success: true, data: { ok: true } });
    });
    const client = createSaasClient(fetcher, 'https://farm.example');
    await client.login({ email: 'farmer@example.com', password: 'x' });

    await Promise.all([client.fetchWithSession('/api/plots'), client.fetchWithSession('/api/devices')]);

    expect(refreshes).toBe(1);
    expect(protectedAttempts).toBe(4);
  });

  it('clears memory and emits session expiration when refresh fails', async () => {
    const target = new EventTarget();
    const expired = vi.fn();
    target.addEventListener(SESSION_EXPIRED_EVENT, expired);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/login')
      ? json(sessionPayload())
      : String(input).endsWith('/auth/refresh')
        ? json({ success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'expired' } }, 401)
        : json({ success: false, error: { code: 'INVALID_ACCESS_TOKEN', message: 'expired' } }, 401));
    const client = createSaasClient(fetcher, 'https://farm.example', target);
    await client.login({ email: 'farmer@example.com', password: 'x' });

    await expect(client.me()).rejects.toBeInstanceOf(SaasApiError);
    expect(client.hasAccessToken()).toBe(false);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight refresh before logout and cannot reinstall the session', async () => {
    let refreshSignal: AbortSignal | undefined;
    let announceRefresh!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { announceRefresh = resolve; });
    let resolveRefresh!: (response: Response) => void;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return json(sessionPayload('expired-token'));
      if (url.endsWith('/auth/refresh')) return new Promise<Response>((resolve, reject) => {
        refreshSignal = init?.signal ?? undefined;
        resolveRefresh = resolve;
        refreshSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        announceRefresh();
      });
      if (url.endsWith('/auth/logout')) return json({ success: true, data: { loggedOut: true } });
      return json({ success: false, error: { code: 'INVALID_ACCESS_TOKEN', message: 'expired' } }, 401);
    });
    const client = createSaasClient(fetcher, 'https://farm.example');
    await client.login({ email: 'farmer@example.com', password: 'x' });
    const protectedCall = client.fetchWithSession('/api/plots');
    await refreshStarted;

    const logoutCall = client.logout();
    await Promise.resolve();
    const wasAborted = refreshSignal?.aborted === true;
    if (!wasAborted) resolveRefresh(json(sessionPayload('late-token')));
    await Promise.allSettled([protectedCall, logoutCall]);

    expect(wasAborted).toBe(true);
    expect(client.hasAccessToken()).toBe(false);
  });

  it('rejects a delayed me response after logout without restoring the cleared session', async () => {
    let announceMe!: () => void;
    const meStarted = new Promise<void>((resolve) => { announceMe = resolve; });
    let resolveMe!: (response: Response) => void;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return json(sessionPayload());
      if (url.endsWith('/me')) return new Promise<Response>((resolve) => {
        resolveMe = resolve;
        announceMe();
      });
      if (url.endsWith('/auth/logout')) return json({ success: true, data: { loggedOut: true } });
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = createSaasClient(fetcher, 'https://farm.example');
    await client.login({ email: 'farmer@example.com', password: 'x' });

    const delayedMe = client.me();
    await meStarted;
    await client.logout();
    resolveMe(json(sessionPayload('late-me-token')));

    await expect(delayedMe).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(client.currentSession()).toBeNull();
    expect(client.hasAccessToken()).toBe(false);
  });

  it('cannot let an old me response overwrite a newly logged-in account', async () => {
    let announceMe!: () => void;
    const meStarted = new Promise<void>((resolve) => { announceMe = resolve; });
    let resolveMe!: (response: Response) => void;
    let loginCount = 0;
    const secondAccount = sessionPayload('second-token');
    secondAccount.data.user = {
      ...secondAccount.data.user,
      id: 'user-2',
      username: 'grower@example.com',
      email: 'grower@example.com',
      displayName: 'grower',
    };
    secondAccount.data.membership = { ...secondAccount.data.membership, id: 'member-2', userId: 'user-2' };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return json(loginCount++ === 0 ? sessionPayload() : secondAccount);
      if (url.endsWith('/me')) return new Promise<Response>((resolve) => {
        resolveMe = resolve;
        announceMe();
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = createSaasClient(fetcher, 'https://farm.example');
    await client.login({ email: 'farmer@example.com', password: 'x' });

    const delayedMe = client.me();
    await meStarted;
    await client.login({ email: 'grower@example.com', password: 'x' });
    resolveMe(json(sessionPayload('old-me-token')));

    await expect(delayedMe).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(client.currentSession()?.user.displayName).toBe('grower');
  });

  it.each([
    ['email', undefined],
    ['displayName', undefined],
    ['accountStatus', 'pending'],
  ])('rejects a malformed session user field %s', async (field, value) => {
    const payload = sessionPayload();
    payload.data.user = { ...payload.data.user, [field]: value };
    const client = createSaasClient(vi.fn(async () => json(payload)), 'https://farm.example');

    await expect(client.login({
      email: 'farmer@example.com',
      password: 'StrongPassword#123',
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
