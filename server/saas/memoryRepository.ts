import type { SaasRepository } from './repository';
import {
  SaasDomainError,
  type EntitlementSnapshot,
  type Membership,
  type Order,
  type Organization,
  type Product,
  type RefreshSession,
  type User,
  type UserContext,
  type UserWithCredential,
} from './types';

const FREE_PRODUCT: Product = {
  id: 'free',
  name: 'Free',
  description: 'Essential farm management for a single organization.',
  priceCents: 0,
  currency: 'CNY',
  billingInterval: 'month',
  featureKeys: ['farm-management'],
  limits: { members: 1, farms: 1 },
};

const PRO_PRODUCT: Product = {
  id: 'pro',
  name: 'Pro',
  description: 'Collaboration and reporting for growing farm teams.',
  priceCents: 9_900,
  currency: 'CNY',
  billingInterval: 'month',
  featureKeys: ['farm-management', 'team-management', 'reports'],
  limits: { members: 25, farms: 20 },
};

const copy = <T>(value: T): T => structuredClone(value);
const normalizedUsername = (username: string): string => username.trim().toLowerCase();
const orderKey = (organizationId: string, key: string): string => `${organizationId}:${key}`;

export class MemorySaasRepository implements SaasRepository {
  private sequence = 0;
  private readonly usersById = new Map<string, UserWithCredential>();
  private readonly userIdsByUsername = new Map<string, string>();
  private readonly organizationsById = new Map<string, Organization>();
  private readonly membershipsByUserId = new Map<string, Membership>();
  private readonly entitlementsByOrganizationId = new Map<string, EntitlementSnapshot>();
  private readonly refreshSessionsByTokenHash = new Map<string, RefreshSession>();
  private readonly ordersById = new Map<string, Order>();
  private readonly orderIdsByIdempotencyKey = new Map<string, string>();
  private readonly products = [FREE_PRODUCT, PRO_PRODUCT];

  async createUserWithOrganization(input: { username: string; passwordHash: string }): Promise<UserContext> {
    const username = normalizedUsername(input.username);
    if (this.userIdsByUsername.has(username)) {
      throw new SaasDomainError('USERNAME_TAKEN', 'Username is already taken.');
    }

    const createdAt = new Date().toISOString();
    const user: UserWithCredential = {
      user: { id: this.nextId('user'), username, createdAt },
      passwordHash: input.passwordHash,
    };
    const organization: Organization = {
      id: this.nextId('org'),
      name: `${username}'s organization`,
      createdAt,
    };
    const membership: Membership = {
      id: this.nextId('membership'),
      userId: user.user.id,
      organizationId: organization.id,
      role: 'owner',
      createdAt,
    };
    const entitlement: EntitlementSnapshot = {
      organizationId: organization.id,
      productId: FREE_PRODUCT.id,
      plan: FREE_PRODUCT.name,
      status: 'active',
      featureKeys: [...FREE_PRODUCT.featureKeys],
      limits: { ...FREE_PRODUCT.limits },
    };

    this.usersById.set(user.user.id, user);
    this.userIdsByUsername.set(username, user.user.id);
    this.organizationsById.set(organization.id, organization);
    this.membershipsByUserId.set(user.user.id, membership);
    this.entitlementsByOrganizationId.set(organization.id, entitlement);

    return copy({ user: user.user, organization, membership, entitlement });
  }

  async findUserByUsername(username: string): Promise<UserWithCredential | null> {
    const userId = this.userIdsByUsername.get(normalizedUsername(username));
    const user = userId ? this.usersById.get(userId) : undefined;
    return user ? copy(user) : null;
  }

  async findUserContext(userId: string): Promise<UserContext | null> {
    const user = this.usersById.get(userId);
    const membership = this.membershipsByUserId.get(userId);
    if (!user || !membership) return null;

    const organization = this.organizationsById.get(membership.organizationId);
    const entitlement = this.entitlementsByOrganizationId.get(membership.organizationId);
    if (!organization || !entitlement) return null;

    return copy({ user: user.user, organization, membership, entitlement });
  }

  async saveRefreshSession(session: RefreshSession): Promise<void> {
    this.refreshSessionsByTokenHash.set(session.tokenHash, copy(session));
  }

  async findRefreshSession(tokenHash: string): Promise<RefreshSession | null> {
    const session = this.refreshSessionsByTokenHash.get(tokenHash);
    return session ? copy(session) : null;
  }

  async revokeRefreshSession(tokenHash: string): Promise<void> {
    const session = this.refreshSessionsByTokenHash.get(tokenHash);
    if (session) session.revokedAt = new Date().toISOString();
  }

  async listProducts(): Promise<Product[]> {
    return copy(this.products);
  }

  async getEntitlementSnapshot(organizationId: string): Promise<EntitlementSnapshot> {
    const entitlement = this.entitlementsByOrganizationId.get(organizationId);
    if (entitlement) return copy(entitlement);

    return copy({
      organizationId,
      productId: FREE_PRODUCT.id,
      plan: FREE_PRODUCT.name,
      status: 'active',
      featureKeys: FREE_PRODUCT.featureKeys,
      limits: FREE_PRODUCT.limits,
    });
  }

  async findOrderByIdempotencyKey(organizationId: string, key: string): Promise<Order | null> {
    const orderId = this.orderIdsByIdempotencyKey.get(orderKey(organizationId, key));
    const order = orderId ? this.ordersById.get(orderId) : undefined;
    return order ? copy(order) : null;
  }

  async createOrder(order: Order): Promise<Order> {
    const key = orderKey(order.organizationId, order.idempotencyKey);
    if (this.orderIdsByIdempotencyKey.has(key)) {
      throw new SaasDomainError('IDEMPOTENCY_KEY_TAKEN', 'Order idempotency key is already in use.');
    }

    const storedOrder = copy(order);
    this.ordersById.set(storedOrder.id, storedOrder);
    this.orderIdsByIdempotencyKey.set(key, storedOrder.id);
    return copy(storedOrder);
  }

  async settleMockOrder(orderId: string): Promise<Order> {
    const order = this.ordersById.get(orderId);
    if (!order) throw new SaasDomainError('ORDER_NOT_FOUND', 'Order was not found.');

    order.status = 'settled';
    order.settledAt ??= new Date().toISOString();
    return copy(order);
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}
