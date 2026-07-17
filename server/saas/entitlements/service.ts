import type { SaasRepository } from '../repository';
import type { EntitlementSnapshot, FeatureKey, UserContext } from '../types';

export type EntitlementDecision =
  | { allowed: true; source: 'admin' | 'entitlement' }
  | { allowed: false; code: 'FEATURE_REQUIRED'; feature: FeatureKey; upgradePath: '/market' };

export class EntitlementContextError extends Error {
  readonly code = 'CONTEXT_MISMATCH';

  constructor() {
    super('User context membership does not match its user and organization.');
    this.name = 'EntitlementContextError';
  }
}

export class EntitlementService {
  constructor(private readonly repository: SaasRepository) {}

  async forOrganization(organizationId: string): Promise<EntitlementSnapshot> {
    const snapshot = await this.repository.getEntitlementSnapshot(organizationId);
    return structuredClone(snapshot);
  }

  async canUse(context: UserContext, feature: FeatureKey): Promise<EntitlementDecision> {
    if (context.user.platformRole === 'platform_admin') {
      return { allowed: true, source: 'admin' };
    }

    if (context.membership.userId !== context.user.id
      || context.organization.id !== context.membership.organizationId) {
      throw new EntitlementContextError();
    }

    const entitlement = await this.forOrganization(context.membership.organizationId);
    if (entitlement.status === 'active' && entitlement.features.includes(feature)) {
      return { allowed: true, source: 'entitlement' };
    }

    return {
      allowed: false,
      code: 'FEATURE_REQUIRED',
      feature,
      upgradePath: '/market',
    };
  }
}
