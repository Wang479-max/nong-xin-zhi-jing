import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthService } from './service';
import type { EntitlementService } from '../entitlements/service';
import type { SaasRepository } from '../repository';
import type { FeatureKey, UserContext } from '../types';

declare global {
  namespace Express {
    interface Request {
      saasContext?: UserContext;
    }
  }
}

export interface AccessAuthDependencies {
  repository: SaasRepository;
  authService: AuthService;
}

export function createAccessAuthMiddleware(dependencies: AccessAuthDependencies): RequestHandler {
  return async (request: Request, response: Response, _next: NextFunction) => {
    const authorization = request.get('Authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) return invalidAccessToken(response);

    let claims;
    try {
      claims = dependencies.authService.verifyAccessToken(match[1]);
    } catch {
      return invalidAccessToken(response);
    }

    try {
      const context = await dependencies.repository.findUserContext(claims.sub);
      if (!context
        || claims.sub !== context.user.id
        || claims.org !== context.organization.id
        || claims.platformRole !== context.user.platformRole
        || claims.membershipRole !== context.membership.role
        || context.user.id !== context.membership.userId
        || context.organization.id !== context.membership.organizationId) {
        return invalidAccessToken(response);
      }
      request.saasContext = context;
      return _next();
    } catch (error) {
      return _next(error);
    }
  };
}

export function createFeatureGuard(
  entitlementService: EntitlementService,
  feature: FeatureKey,
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const context = request.saasContext;
    if (!context) return invalidAccessToken(response);
    try {
      const decision = await entitlementService.canUse(context, feature);
      if (!('code' in decision)) return next();
      return response.status(403).json({
        success: false,
        error: {
          code: decision.code,
          message: 'This feature requires an upgrade.',
          feature: decision.feature,
          upgradePath: decision.upgradePath,
        },
      });
    } catch (error) {
      if (hasCode(error, 'CONTEXT_MISMATCH') || hasCode(error, 'ORGANIZATION_NOT_FOUND')) {
        return response.status(403).json({
          success: false,
          error: { code: 'CONTEXT_MISMATCH', message: 'Access context is no longer valid.' },
        });
      }
      return next(error);
    }
  };
}

function invalidAccessToken(response: Response): Response {
  return response.status(401).json({
    success: false,
    error: { code: 'INVALID_ACCESS_TOKEN', message: 'Invalid access token.' },
  });
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code;
}
