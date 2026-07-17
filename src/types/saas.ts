export type PlatformRole = 'platform_admin' | 'user';
export type MembershipRole = 'owner' | 'admin' | 'expert' | 'operator' | 'viewer';
export type FeatureKey =
  | 'monitoring.basic'
  | 'monitoring.realtime'
  | 'ai.diagnosis'
  | 'digital_twin.advanced'
  | 'analytics.advanced'
  | 'device.control'
  | 'team.members'
  | 'deployment.private';

export interface SaasUser { id: string; username: string; platformRole: PlatformRole; createdAt: string }
export interface Organization { id: string; name: string; createdAt: string }
export interface Membership {
  id: string; userId: string; organizationId: string; role: MembershipRole; createdAt: string;
}
export interface EntitlementSnapshot {
  organizationId: string;
  productId: string;
  plan: string;
  status: 'active' | 'inactive';
  features: FeatureKey[];
  limits: Record<string, number>;
}
export interface SaasSession {
  user: SaasUser;
  organization: Organization;
  membership: Membership;
  entitlement: EntitlementSnapshot;
}
export interface Product {
  id: string;
  kind: 'plan' | 'addon';
  name: string;
  description: string;
  amountFen: number;
  currency: string;
  billingInterval: 'month' | 'year' | null;
  enabled: boolean;
  features: FeatureKey[];
  limits: Record<string, number>;
}
export interface Order {
  id: string;
  organizationId: string;
  productId: string;
  quantity: number;
  idempotencyKey: string;
  amountFen: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  createdAt: string;
  paidAt: string | null;
}
export interface OrderSettlement { order: Order; entitlement: EntitlementSnapshot }
