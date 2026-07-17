import type {
  EntitlementSnapshot,
  Order,
  Product,
  RefreshSession,
  UserContext,
  UserWithCredential,
} from './types';

export interface SaasRepository {
  createUserWithOrganization(input: { username: string; passwordHash: string }): Promise<UserContext>;
  findUserByUsername(username: string): Promise<UserWithCredential | null>;
  findUserContext(userId: string): Promise<UserContext | null>;
  saveRefreshSession(session: RefreshSession): Promise<void>;
  findRefreshSession(tokenHash: string): Promise<RefreshSession | null>;
  revokeRefreshSession(tokenHash: string): Promise<void>;
  listProducts(): Promise<Product[]>;
  getEntitlementSnapshot(organizationId: string): Promise<EntitlementSnapshot>;
  findOrderByIdempotencyKey(organizationId: string, key: string): Promise<Order | null>;
  createOrder(order: Order): Promise<Order>;
  settleMockOrder(orderId: string): Promise<Order>;
}
