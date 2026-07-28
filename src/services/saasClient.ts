import type {
  EntitlementSnapshot,
  FeatureKey,
  Order,
  OrderSettlement,
  Product,
  SaasSession,
} from '../types/saas';

export const SESSION_EXPIRED_EVENT = 'saas-session-expired';
const API_ROOT = '/api/v1';
const FEATURES = new Set<FeatureKey>([
  'monitoring.basic', 'monitoring.realtime', 'ai.diagnosis', 'digital_twin.advanced',
  'analytics.advanced', 'device.control', 'team.members', 'deployment.private',
]);

export class SaasApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'SaasApiError';
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type VerificationPurpose = 'register' | 'reset_password';

export interface EmailCodeAccepted {
  accepted: true;
  retryAfterSeconds: number;
  expiresInSeconds: number;
}

export function createSaasClient(
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  events: EventTarget = typeof window === 'undefined' ? new EventTarget() : window,
) {
  let accessToken: string | null = null;
  let currentSession: SaasSession | null = null;
  let refreshFlight: Promise<SaasSession> | null = null;
  let refreshController: AbortController | null = null;
  let authGeneration = 0;

  const clearSession = () => { accessToken = null; currentSession = null; };

  const readEnvelope = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new SaasApiError('INVALID_RESPONSE', '服务器返回了无法识别的响应。', response.status);
    }
    let body: unknown;
    try { body = await response.json(); } catch { throw new SaasApiError('INVALID_RESPONSE', '服务器响应格式无效。', response.status); }
    if (!isRecord(body) || typeof body.success !== 'boolean') {
      throw new SaasApiError('INVALID_RESPONSE', '服务器响应格式无效。', response.status);
    }
    if (body.success === false) {
      const error = isRecord(body.error) ? body.error : {};
      throw new SaasApiError(
        typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
        typeof error.message === 'string' ? error.message : '请求失败。',
        response.status,
      );
    }
    if (!('data' in body)) throw new SaasApiError('INVALID_RESPONSE', '服务器响应缺少数据。', response.status);
    return body.data;
  };

  const publicSession = (data: unknown, expectedGeneration: number): SaasSession => {
    if (!isRecord(data) || typeof data.accessToken !== 'string' || !data.accessToken) invalidResponse();
    const session = parseSession(data);
    if (expectedGeneration !== authGeneration) throw new SaasApiError('SESSION_CHANGED', '会话状态已改变。', 0);
    accessToken = data.accessToken;
    currentSession = session;
    return session;
  };

  const authSession = async (path: string, body?: unknown, signal?: AbortSignal, expectedGeneration = authGeneration): Promise<SaasSession> => {
    const response = await fetcher(`${API_ROOT}${path}`, {
      method: 'POST', credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    return publicSession(await readEnvelope(response), expectedGeneration);
  };

  const refresh = (emitExpiration: boolean): Promise<SaasSession> => {
    if (!refreshFlight) {
      const generation = authGeneration;
      const controller = new AbortController();
      refreshController = controller;
      refreshFlight = authSession('/auth/refresh', undefined, controller.signal, generation).catch((error) => {
        if (generation === authGeneration && !controller.signal.aborted) {
          clearSession();
          if (emitExpiration) events.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        }
        throw error;
      }).finally(() => {
        if (refreshController === controller) refreshController = null;
        refreshFlight = null;
      });
    }
    return refreshFlight;
  };

  const sameOrigin = (input: RequestInfo | URL): boolean => {
    if (typeof input !== 'string') return input instanceof URL ? input.origin === origin : new URL(input.url, origin).origin === origin;
    return new URL(input, origin).origin === origin;
  };

  const withSession = async (input: RequestInfo | URL, init: RequestInit = {}, retry = true): Promise<Response> => {
    const local = sameOrigin(input);
    const requestToken = local ? accessToken : null;
    const headers = new Headers(init.headers);
    if (requestToken) headers.set('Authorization', `Bearer ${requestToken}`);
    else if (!local) headers.delete('Authorization');
    const requestInit: RequestInit = { ...init, headers };
    requestInit.credentials = local ? 'include' : 'omit';
    let response = await fetcher(input, requestInit);
    if (local && response.status === 401 && retry && requestToken) {
      if (accessToken === requestToken) await refresh(true);
      const retriedHeaders = new Headers(init.headers);
      if (accessToken) retriedHeaders.set('Authorization', `Bearer ${accessToken}`);
      response = await fetcher(input, { ...init, credentials: 'include', headers: retriedHeaders });
    }
    return response;
  };

  const api = async <T>(path: string, init?: RequestInit): Promise<T> => readEnvelope(await withSession(`${API_ROOT}${path}`, init)) as Promise<T>;

  const postPublic = async (path: string, body: unknown): Promise<unknown> => readEnvelope(await fetcher(
    `${API_ROOT}${path}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  ));

  const beginAuthSession = (
    path: '/auth/login' | '/auth/register',
    input:
      | { email: string; password: string }
      | { email: string; password: string; verificationCode: string },
  ) => {
    authGeneration += 1;
    refreshController?.abort();
    clearSession();
    return authSession(path, input, undefined, authGeneration);
  };

  return {
    hasAccessToken: () => accessToken !== null,
    currentSession: () => currentSession,
    clearSession: () => {
      authGeneration += 1;
      refreshController?.abort();
      clearSession();
    },
    sendEmailCode: async (input: { email: string; purpose: VerificationPurpose }) =>
      parseEmailCodeAccepted(await postPublic('/auth/email-code', input)),
    login: (input: { email: string; password: string }) => beginAuthSession('/auth/login', input),
    register: (input: { email: string; password: string; verificationCode: string }) =>
      beginAuthSession('/auth/register', input),
    resetPassword: async (input: { email: string; password: string; verificationCode: string }) => {
      const result = await postPublic('/auth/password-reset', input);
      if (!isRecord(result) || result.reset !== true) invalidResponse();
      authGeneration += 1;
      refreshController?.abort();
      clearSession();
    },
    restoreSession: () => refresh(false),
    logout: async () => {
      authGeneration += 1;
      const generation = authGeneration;
      const pendingRefresh = refreshFlight;
      refreshController?.abort();
      clearSession();
      if (pendingRefresh) await pendingRefresh.catch(() => undefined);
      try {
        await readEnvelope(await fetcher(`${API_ROOT}/auth/logout`, { method: 'POST', credentials: 'include' }));
      } finally { if (generation === authGeneration) clearSession(); }
    },
    me: async () => {
      const generation = authGeneration;
      const session = parseContext(await api<unknown>('/me'));
      if (generation !== authGeneration) throw new SaasApiError('SESSION_CHANGED', '会话状态已改变。', 0);
      currentSession = session;
      return session;
    },
    entitlements: async () => parseEntitlement(await api<unknown>('/entitlements')),
    catalog: async () => parseArray(await api<unknown>('/catalog'), parseProduct),
    createOrder: async (input: { productId: string; quantity: number; idempotencyKey: string }) =>
      parseOrder(await api<unknown>('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })),
    settleOrder: async (orderId: string) => parseSettlement(await api<unknown>(`/orders/${encodeURIComponent(orderId)}/mock-settle`, { method: 'POST' })),
    listOrders: async () => parseArray(await api<unknown>('/orders'), parseOrder),
    fetchWithSession: withSession,
  };
}

function invalidResponse(): never { throw new SaasApiError('INVALID_RESPONSE', '服务器响应格式无效。', 0); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function string(value: unknown): string { if (typeof value !== 'string') invalidResponse(); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) invalidResponse(); return value; }
function parseContext(value: unknown): SaasSession {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.organization) || !isRecord(value.membership)) invalidResponse();
  const user = value.user; const organization = value.organization; const membership = value.membership;
  const platformRole = user.platformRole === 'platform_admin' ? 'platform_admin' : user.platformRole === 'user' ? 'user' : invalidResponse();
  const membershipRoles = new Set(['owner', 'admin', 'expert', 'operator', 'viewer']);
  if (!membershipRoles.has(String(membership.role))) invalidResponse();
  const accountStatus = user.accountStatus === 'active'
    ? 'active'
    : user.accountStatus === 'disabled'
      ? 'disabled'
      : invalidResponse();
  return {
    user: {
      id: string(user.id),
      username: string(user.username),
      email: email(user.email),
      displayName: nonEmptyString(user.displayName),
      accountStatus,
      platformRole,
      createdAt: string(user.createdAt),
    },
    organization: { id: string(organization.id), name: string(organization.name), createdAt: string(organization.createdAt) },
    membership: {
      id: string(membership.id), userId: string(membership.userId), organizationId: string(membership.organizationId),
      role: membership.role as SaasSession['membership']['role'], createdAt: string(membership.createdAt),
    },
    entitlement: parseEntitlement(value.entitlement),
  };
}
function parseSession(value: unknown): SaasSession { return parseContext(value); }
function parseEntitlement(value: unknown): EntitlementSnapshot {
  if (!isRecord(value) || !Array.isArray(value.features) || !isRecord(value.limits)) invalidResponse();
  const status = value.status === 'active' ? 'active' : value.status === 'inactive' ? 'inactive' : invalidResponse();
  const features = value.features.filter((feature): feature is FeatureKey => typeof feature === 'string' && FEATURES.has(feature as FeatureKey));
  const limits: Record<string, number> = {};
  for (const [key, limit] of Object.entries(value.limits)) if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) limits[key] = limit;
  return { organizationId: string(value.organizationId), productId: string(value.productId), plan: string(value.plan), status, features, limits };
}
function parseProduct(value: unknown): Product {
  if (!isRecord(value) || !Array.isArray(value.features) || !isRecord(value.limits)) invalidResponse();
  if (value.kind !== 'plan' && value.kind !== 'addon') invalidResponse();
  if (value.billingInterval !== null && value.billingInterval !== 'month' && value.billingInterval !== 'year') invalidResponse();
  const billingInterval = value.billingInterval as Product['billingInterval'];
  return {
    id: string(value.id), kind: value.kind, name: string(value.name), description: string(value.description),
    amountFen: number(value.amountFen), currency: string(value.currency), billingInterval,
    enabled: value.enabled === true, features: value.features.filter((feature): feature is FeatureKey => typeof feature === 'string' && FEATURES.has(feature as FeatureKey)),
    limits: Object.fromEntries(Object.entries(value.limits).filter(([, limit]) => typeof limit === 'number' && Number.isFinite(limit) && limit >= 0)) as Record<string, number>,
  };
}
function parseOrder(value: unknown): Order {
  if (!isRecord(value)) invalidResponse();
  const statuses = new Set(['pending', 'paid', 'cancelled', 'refunded']);
  if (!statuses.has(String(value.status))) invalidResponse();
  return {
    id: string(value.id), organizationId: string(value.organizationId), productId: string(value.productId), quantity: number(value.quantity),
    idempotencyKey: string(value.idempotencyKey), amountFen: number(value.amountFen), currency: string(value.currency),
    status: value.status as Order['status'], createdAt: string(value.createdAt), paidAt: value.paidAt === null ? null : string(value.paidAt),
  };
}
function parseSettlement(value: unknown): OrderSettlement {
  if (!isRecord(value)) invalidResponse();
  return { order: parseOrder(value.order), entitlement: parseEntitlement(value.entitlement) };
}
function parseEmailCodeAccepted(value: unknown): EmailCodeAccepted {
  if (!isRecord(value) || value.accepted !== true) invalidResponse();
  const retryAfterSeconds = number(value.retryAfterSeconds);
  const expiresInSeconds = number(value.expiresInSeconds);
  if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 0
    || !Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    invalidResponse();
  }
  return { accepted: true, retryAfterSeconds, expiresInSeconds };
}
function nonEmptyString(value: unknown): string {
  const parsed = string(value);
  if (parsed.trim().length === 0) invalidResponse();
  return parsed;
}
function email(value: unknown): string {
  const parsed = nonEmptyString(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed)) invalidResponse();
  return parsed;
}
function parseArray<T>(value: unknown, parse: (item: unknown) => T): T[] { if (!Array.isArray(value)) invalidResponse(); return value.map(parse); }

export const saasClient = createSaasClient();
