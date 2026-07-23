export type PlatformRole = 'platform_admin' | 'user';
export type AccountStatus = 'active' | 'disabled';
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

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  accountStatus: AccountStatus;
  platformRole: PlatformRole;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  createdAt: string;
}

export interface EntitlementSnapshot {
  organizationId: string;
  productId: string;
  plan: string;
  status: 'active' | 'inactive';
  features: FeatureKey[];
  limits: Record<string, number>;
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

export type BillingErrorCode =
  | 'VALIDATION_ERROR'
  | 'CONTEXT_MISMATCH'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_DISABLED'
  | 'CATALOG_PRICE_INVALID'
  | 'PLAN_QUANTITY_INVALID'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_SETTLEABLE'
  | 'PAYMENT_MODE_DISABLED';

export class BillingError extends Error {
  constructor(public readonly code: BillingErrorCode) {
    super(code);
    this.name = 'BillingError';
  }
}

export interface RefreshSession {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface UserWithCredential {
  user: User;
  passwordHash: string;
}

export interface UserContext {
  user: User;
  organization: Organization;
  membership: Membership;
  entitlement: EntitlementSnapshot;
}

export type SaasDomainErrorCode =
  | 'USERNAME_TAKEN'
  | 'EMAIL_TAKEN'
  | 'USER_NOT_FOUND'
  | 'ORGANIZATION_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_SETTLEABLE'
  | 'ORDER_ID_TAKEN'
  | 'IDEMPOTENCY_KEY_TAKEN'
  | 'PRODUCT_NOT_FOUND'
  | 'ENTITLEMENT_NOT_FOUND';

export class SaasDomainError extends Error {
  constructor(public readonly code: SaasDomainErrorCode, message: string) {
    super(message);
    this.name = 'SaasDomainError';
  }
}
