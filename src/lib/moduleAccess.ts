import type { EntitlementSnapshot, FeatureKey, SaasUser } from '../types/saas';

export type ModuleId =
  | 'dashboard'
  | 'monitoring'
  | 'management'
  | 'ai'
  | 'digitalTwin'
  | 'knowledge'
  | 'news'
  | 'feedback'
  | 'market';

export interface ModuleDefinition { id: ModuleId; feature: FeatureKey | null }
export type ActionId = 'digitalTwin.control' | 'digitalTwin.fertilize';

export const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  { id: 'dashboard', feature: null },
  { id: 'monitoring', feature: 'monitoring.basic' },
  { id: 'management', feature: null },
  { id: 'ai', feature: 'ai.diagnosis' },
  { id: 'digitalTwin', feature: null },
  { id: 'knowledge', feature: null },
  { id: 'news', feature: null },
  { id: 'feedback', feature: null },
  { id: 'market', feature: null },
] as const;

const byId = new Map(MODULE_DEFINITIONS.map((definition) => [definition.id, definition]));
const actionFeatures: Readonly<Record<ActionId, FeatureKey>> = {
  'digitalTwin.control': 'digital_twin.advanced',
  'digitalTwin.fertilize': 'digital_twin.advanced',
};

export function visibleModules(_user: SaasUser): readonly ModuleDefinition[] {
  return MODULE_DEFINITIONS;
}

export function featureForModule(moduleId: ModuleId): FeatureKey | null {
  return byId.get(moduleId)?.feature ?? null;
}

export function canAccessFeature(feature: FeatureKey | null, user: SaasUser, entitlement: EntitlementSnapshot | null): boolean {
  if (user.platformRole === 'platform_admin' || feature === null) return true;
  return entitlement?.status === 'active' && entitlement.features.includes(feature);
}

export function canAccessModule(moduleId: ModuleId, user: SaasUser, entitlement: EntitlementSnapshot | null): boolean {
  return canAccessFeature(featureForModule(moduleId), user, entitlement);
}

export function canAccessAction(actionId: ActionId, user: SaasUser, entitlement: EntitlementSnapshot | null): boolean {
  return canAccessFeature(actionFeatures[actionId], user, entitlement);
}
