import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { AuthError, type AuthService, type AuthSessionResult } from './auth/service';
import { createAccessAuthMiddleware } from './auth/middleware';
import type { BillingService } from './billing/service';
import type { EntitlementService } from './entitlements/service';
import type { SaasRepository } from './repository';
import { BillingError, SaasDomainError, type UserContext } from './types';

export const SAAS_REFRESH_COOKIE_NAME = 'saas_refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SaasRouterDependencies {
  repository: SaasRepository;
  authService: AuthService;
  entitlementService: EntitlementService;
  billingService: BillingService;
  refreshTokenTtlSeconds: number;
  secureCookies: boolean;
}

export function createSaasRouter(dependencies: SaasRouterDependencies): express.Router {
  const router = express.Router();
  const requireAccess = createAccessAuthMiddleware(dependencies);

  router.use(cookieParser());
  router.use(express.json({ limit: '64kb' }));

  router.post('/auth/register', asyncRoute(async (request, response) => {
    const session = await dependencies.authService.register(request.body);
    setRefreshCookie(response, session.refreshToken, dependencies);
    response.status(201).json(success(publicSession(session)));
  }));

  router.post('/auth/login', asyncRoute(async (request, response) => {
    const session = await dependencies.authService.login(request.body);
    setRefreshCookie(response, session.refreshToken, dependencies);
    response.json(success(publicSession(session)));
  }));

  router.post('/auth/refresh', asyncRoute(async (request, response) => {
    const session = await dependencies.authService.refresh(request.cookies?.[SAAS_REFRESH_COOKIE_NAME]);
    setRefreshCookie(response, session.refreshToken, dependencies);
    response.json(success(publicSession(session)));
  }));

  router.post('/auth/logout', asyncRoute(async (request, response) => {
    await dependencies.authService.logout(request.cookies?.[SAAS_REFRESH_COOKIE_NAME]);
    response.clearCookie(SAAS_REFRESH_COOKIE_NAME, baseCookieOptions(dependencies));
    response.json(success({ loggedOut: true }));
  }));

  router.get('/me', requireAccess, (request, response) => {
    response.json(success(publicContext(requireContext(request))));
  });

  router.get('/entitlements', requireAccess, asyncRoute(async (request, response) => {
    const context = requireContext(request);
    const entitlement = await dependencies.entitlementService.forOrganization(context.organization.id);
    response.json(success(entitlement));
  }));

  router.get('/catalog', requireAccess, asyncRoute(async (_request, response) => {
    response.json(success(await dependencies.repository.listProducts()));
  }));

  router.get('/orders', requireAccess, asyncRoute(async (request, response) => {
    const context = requireContext(request);
    response.json(success(await dependencies.repository.listOrders(context.organization.id)));
  }));

  router.post('/orders', requireAccess, asyncRoute(async (request, response) => {
    const context = requireContext(request);
    const input = request.body as Record<string, unknown> | undefined;
    const key = typeof input?.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    const existing = key
      ? await dependencies.repository.findOrderByIdempotencyKey(context.organization.id, key)
      : null;
    const order = await dependencies.billingService.createOrder(context, request.body);
    response.status(existing ? 200 : 201).json(success(order));
  }));

  router.post('/orders/:id/mock-settle', requireAccess, asyncRoute(async (request, response) => {
    if (!UUID_PATTERN.test(request.params.id)) throw new BillingError('VALIDATION_ERROR');
    const result = await dependencies.billingService.settleMockOrder(requireContext(request), request.params.id);
    response.json(success(result));
  }));

  router.use((_request, response) => {
    response.status(404).json(failure('NOT_FOUND', 'API endpoint was not found.'));
  });
  router.use(errorHandler);
  return router;
}

function publicSession(session: AuthSessionResult) {
  return { ...publicContext(session), accessToken: session.accessToken };
}

function publicContext(context: UserContext) {
  return {
    user: context.user,
    organization: context.organization,
    membership: context.membership,
    entitlement: context.entitlement,
  };
}

function requireContext(request: Request): UserContext {
  if (!request.saasContext) throw new AuthError('INVALID_ACCESS_TOKEN');
  return request.saasContext;
}

function setRefreshCookie(response: Response, refreshToken: string, dependencies: SaasRouterDependencies): void {
  response.cookie(SAAS_REFRESH_COOKIE_NAME, refreshToken, {
    ...baseCookieOptions(dependencies),
    maxAge: dependencies.refreshTokenTtlSeconds * 1_000,
  });
}

function baseCookieOptions(dependencies: SaasRouterDependencies) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: dependencies.secureCookies,
    path: REFRESH_COOKIE_PATH,
  };
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: express.NextFunction) => {
    void handler(request, response).catch(next);
  };
}

function success<T>(data: T) {
  return { success: true, data };
}

function failure(code: string, message: string, extra?: Record<string, unknown>) {
  return { success: false, error: { code, message, ...extra } };
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isPayloadTooLarge(error)) {
    response.status(413).json(failure('PAYLOAD_TOO_LARGE', 'Request body is too large.'));
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json(failure('VALIDATION_ERROR', 'Invalid request.'));
    return;
  }

  const mapped = mapKnownError(error);
  response.status(mapped.status).json(failure(mapped.code, mapped.message));
};

function mapKnownError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof AuthError) {
    const mappings = {
      VALIDATION_ERROR: [400, 'Invalid request.'],
      INVALID_CREDENTIALS: [401, 'Invalid username or password.'],
      INVALID_REFRESH_TOKEN: [401, 'Invalid refresh token.'],
      INVALID_ACCESS_TOKEN: [401, 'Invalid access token.'],
      USERNAME_TAKEN: [409, 'Username is already taken.'],
    } as const;
    const [status, message] = mappings[error.code];
    return { status, code: error.code, message };
  }
  if (error instanceof BillingError) {
    const mappings = {
      VALIDATION_ERROR: [400, 'Invalid request.'],
      CONTEXT_MISMATCH: [403, 'Access context is no longer valid.'],
      PRODUCT_NOT_FOUND: [404, 'Product was not found.'],
      PRODUCT_DISABLED: [409, 'Product is disabled.'],
      CATALOG_PRICE_INVALID: [500, 'Internal server error.'],
      PLAN_QUANTITY_INVALID: [409, 'Plan quantity is invalid.'],
      IDEMPOTENCY_CONFLICT: [409, 'Idempotency key conflicts with an existing order.'],
      ORDER_NOT_FOUND: [404, 'Order was not found.'],
      ORDER_NOT_SETTLEABLE: [409, 'Order cannot be settled.'],
      PAYMENT_MODE_DISABLED: [409, 'Mock payment is disabled.'],
    } as const;
    const [status, message] = mappings[error.code];
    return { status, code: error.code, message };
  }
  if (error instanceof SaasDomainError) {
    if (error.code === 'USERNAME_TAKEN') return { status: 409, code: error.code, message: 'Username is already taken.' };
    if (error.code === 'USER_NOT_FOUND') return { status: 404, code: error.code, message: 'User was not found.' };
    if (error.code === 'ORDER_NOT_FOUND') return { status: 404, code: error.code, message: 'Order was not found.' };
    if (error.code === 'PRODUCT_NOT_FOUND') return { status: 404, code: error.code, message: 'Product was not found.' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error.' };
}

function isPayloadTooLarge(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (('type' in error && (error as { type?: unknown }).type === 'entity.too.large')
      || ('status' in error && (error as { status?: unknown }).status === 413));
}
