export type FeatureKey = 'farm-management' | 'team-management' | 'reports';

export interface User {
  id: string;
  username: string;
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
  role: 'owner' | 'member';
  createdAt: string;
}

export interface EntitlementSnapshot {
  organizationId: string;
  productId: string;
  plan: string;
  status: 'active' | 'inactive';
  featureKeys: FeatureKey[];
  limits: Record<string, number>;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  billingInterval: 'month' | 'year';
  featureKeys: FeatureKey[];
  limits: Record<string, number>;
}

export interface Order {
  id: string;
  organizationId: string;
  productId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  status: 'pending' | 'settled';
  createdAt: string;
  settledAt: string | null;
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

export class SaasDomainError extends Error {
  constructor(
    public readonly code: 'USERNAME_TAKEN' | 'ORDER_NOT_FOUND' | 'IDEMPOTENCY_KEY_TAKEN',
    message: string,
  ) {
    super(message);
    this.name = 'SaasDomainError';
  }
}
