import type { SaasRepository } from '../repository';
import type { EntitlementSnapshot, FeatureKey, UserContext } from '../types';

export type EntitlementDecision =
  | { allowed: true; source: 'admin' | 'entitlement' }
  | { allowed: false; code: 'FEATURE_REQUIRED'; feature: FeatureKey; upgradePath: '/market' };

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

    const entitlement = await this.forOrganization(context.organization.id);
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
