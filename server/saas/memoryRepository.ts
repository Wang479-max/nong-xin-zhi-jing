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
  description: 'Essential monitoring for a small organization.',
  amountFen: 0,
  currency: 'CNY',
  billingInterval: 'month',
  enabled: true,
  features: ['monitoring.basic'],
  limits: { aiMonthly: 5, plots: 2, members: 1 },
};

const PRO_PRODUCT: Product = {
  id: 'pro',
  name: 'Pro',
  description: 'Advanced monitoring, AI, analytics, and team collaboration.',
  amountFen: 9_900,
  currency: 'CNY',
  billingInterval: 'month',
  enabled: true,
  features: ['monitoring.basic', 'monitoring.realtime', 'ai.diagnosis', 'analytics.advanced', 'team.members'],
  limits: { aiMonthly: 100, plots: 20, members: 25 },
};

const ENTERPRISE_PRODUCT: Product = {
  id: 'enterprise',
  name: 'Enterprise',
  description: 'Full platform capabilities and private deployment support.',
  amountFen: 99_900,
  currency: 'CNY',
  billingInterval: 'month',
  enabled: true,
  features: [
    'monitoring.basic',
    'monitoring.realtime',
    'ai.diagnosis',
    'digital_twin.advanced',
    'analytics.advanced',
    'device.control',
    'team.members',
    'deployment.private',
  ],
  limits: { aiMonthly: 1_000, plots: 1_000, members: 500 },
};

const AI_PRO_ADDON: Product = {
  id: 'addon.ai.pro',
  name: 'AI Pro Add-on',
  description: 'Additional AI diagnosis capacity.',
  amountFen: 9_900,
  currency: 'CNY',
  billingInterval: null,
  enabled: true,
  features: ['ai.diagnosis'],
  limits: { aiMonthly: 500 },
};

const copy = <T>(value: T): T => structuredClone(value);
const normalizedUsername = (username: string): string => username.trim().toLowerCase();

export class MemorySaasRepository implements SaasRepository {
  private sequence = 0;
  private readonly usersById = new Map<string, UserWithCredential>();
  private readonly userIdsByUsername = new Map<string, string>();
  private readonly organizationsById = new Map<string, Organization>();
  private readonly membershipsByUserId = new Map<string, Membership>();
  private readonly entitlementsByOrganizationId = new Map<string, EntitlementSnapshot>();
  private readonly refreshSessionsByTokenHash = new Map<string, RefreshSession>();
  private readonly ordersById = new Map<string, Order>();
  private readonly orderIdsByOrganizationAndIdempotencyKey = new Map<string, Map<string, string>>();
  private readonly productsById = new Map<string, Product>([
    [FREE_PRODUCT.id, FREE_PRODUCT],
    [PRO_PRODUCT.id, PRO_PRODUCT],
    [ENTERPRISE_PRODUCT.id, ENTERPRISE_PRODUCT],
    [AI_PRO_ADDON.id, AI_PRO_ADDON],
  ]);

  async createUserWithOrganization(input: { username: string; passwordHash: string }): Promise<UserContext> {
    const username = normalizedUsername(input.username);
    if (this.userIdsByUsername.has(username)) {
      throw new SaasDomainError('USERNAME_TAKEN', 'Username is already taken.');
    }

    const createdAt = new Date().toISOString();
    const user: UserWithCredential = {
      user: { id: this.nextId('user'), username, platformRole: 'user', createdAt },
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
    const entitlement = this.entitlementForProduct(organization.id, FREE_PRODUCT);

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

  async rotateRefreshSession(
    currentTokenHash: string,
    replacementSession: RefreshSession,
    now: number,
  ): Promise<RefreshSession | null> {
    const current = this.refreshSessionsByTokenHash.get(currentTokenHash);
    const expiresAt = current ? Date.parse(current.expiresAt) : Number.NaN;
    const replacementExpiresAt = Date.parse(replacementSession.expiresAt);
    if (!current
      || current.revokedAt !== null
      || !Number.isFinite(now)
      || !Number.isFinite(expiresAt)
      || expiresAt <= now
      || current.userId !== replacementSession.userId
      || currentTokenHash === replacementSession.tokenHash
      || replacementSession.revokedAt !== null
      || !Number.isFinite(replacementExpiresAt)
      || replacementExpiresAt <= now
      || this.refreshSessionsByTokenHash.has(replacementSession.tokenHash)) {
      return null;
    }

    const consumed = { ...current, revokedAt: new Date(now).toISOString() };
    this.refreshSessionsByTokenHash.set(currentTokenHash, consumed);
    this.refreshSessionsByTokenHash.set(replacementSession.tokenHash, copy(replacementSession));
    return copy(consumed);
  }

  async listProducts(): Promise<Product[]> {
    return copy([...this.productsById.values()]);
  }

  async getEntitlementSnapshot(organizationId: string): Promise<EntitlementSnapshot> {
    const entitlement = this.entitlementsByOrganizationId.get(organizationId);
    if (!entitlement) throw new SaasDomainError('ORGANIZATION_NOT_FOUND', 'Organization was not found.');
    return copy(entitlement);
  }

  async findOrderByIdempotencyKey(organizationId: string, key: string): Promise<Order | null> {
    const orderId = this.orderIdsByOrganizationAndIdempotencyKey.get(organizationId)?.get(key);
    const order = orderId ? this.ordersById.get(orderId) : undefined;
    return order ? copy(order) : null;
  }

  async createOrder(order: Order): Promise<Order> {
    if (this.ordersById.has(order.id)) {
      throw new SaasDomainError('ORDER_ID_TAKEN', 'Order ID is already in use.');
    }
    const orderIdsByIdempotencyKey = this.orderIdsByOrganizationAndIdempotencyKey.get(order.organizationId);
    if (orderIdsByIdempotencyKey?.has(order.idempotencyKey)) {
      throw new SaasDomainError('IDEMPOTENCY_KEY_TAKEN', 'Order idempotency key is already in use.');
    }

    const storedOrder = copy(order);
    this.ordersById.set(storedOrder.id, storedOrder);
    const organizationOrderIds = orderIdsByIdempotencyKey ?? new Map<string, string>();
    organizationOrderIds.set(storedOrder.idempotencyKey, storedOrder.id);
    if (!orderIdsByIdempotencyKey) {
      this.orderIdsByOrganizationAndIdempotencyKey.set(storedOrder.organizationId, organizationOrderIds);
    }
    return copy(storedOrder);
  }

  async settleMockOrder(orderId: string): Promise<Order> {
    const order = this.ordersById.get(orderId);
    if (!order) throw new SaasDomainError('ORDER_NOT_FOUND', 'Order was not found.');
    if (order.status === 'paid') return copy(order);

    const organization = this.organizationsById.get(order.organizationId);
    if (!organization) throw new SaasDomainError('ORGANIZATION_NOT_FOUND', 'Organization was not found.');
    const product = this.productsById.get(order.productId);
    if (!product) throw new SaasDomainError('PRODUCT_NOT_FOUND', 'Product was not found.');
    const entitlement = this.entitlementsByOrganizationId.get(organization.id);
    if (!entitlement) throw new SaasDomainError('ENTITLEMENT_NOT_FOUND', 'Organization entitlement was not found.');

    const paidAt = new Date().toISOString();
    const updatedEntitlement = product.id.startsWith('addon.')
      ? this.entitlementWithAddon(entitlement, product)
      : this.entitlementForProduct(organization.id, product);
    order.status = 'paid';
    order.paidAt = paidAt;
    this.entitlementsByOrganizationId.set(organization.id, updatedEntitlement);
    return copy(order);
  }

  private entitlementForProduct(organizationId: string, product: Product): EntitlementSnapshot {
    return {
      organizationId,
      productId: product.id,
      plan: product.id,
      status: 'active',
      features: copy(product.features),
      limits: copy(product.limits),
    };
  }

  private entitlementWithAddon(entitlement: EntitlementSnapshot, addon: Product): EntitlementSnapshot {
    const limits = { ...entitlement.limits };
    for (const [limit, value] of Object.entries(addon.limits)) {
      limits[limit] = (limits[limit] ?? 0) + value;
    }

    return {
      ...entitlement,
      features: [...new Set([...entitlement.features, ...addon.features])],
      limits,
    };
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}
