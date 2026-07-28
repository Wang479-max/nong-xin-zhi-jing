import { validatePasswordResetInput, validateUserRegistrationInput } from './identityValidation';
import type { PasswordResetInput, SaasRepository, UserRegistrationInput } from './repository';
import {
  SaasDomainError,
  type EntitlementSnapshot,
  type Membership,
  type Order,
  type Organization,
  type PlatformRole,
  type Product,
  type RefreshSession,
  type User,
  type UserContext,
  type UserWithCredential,
} from './types';

const FREE_PRODUCT: Product = {
  id: 'free',
  kind: 'plan',
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
  kind: 'plan',
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
  kind: 'plan',
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
  kind: 'addon',
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
const normalizedEmail = (email: string): string => email.trim().toLowerCase();
const legacyEmail = (username: string): string => username.includes('@') ? username : `${username}@legacy.invalid`;

export class MemorySaasRepository implements SaasRepository {
  private sequence = 0;
  private readonly usersById = new Map<string, UserWithCredential>();
  private readonly userIdsByUsername = new Map<string, string>();
  private readonly userIdsByEmail = new Map<string, string>();
  private readonly organizationsById = new Map<string, Organization>();
  private readonly membershipsByUserId = new Map<string, Membership>();
  private readonly baseProductIdsByOrganizationId = new Map<string, string>();
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

  async createUserWithOrganization(input: UserRegistrationInput): Promise<UserContext> {
    validateUserRegistrationInput(input);
    const verifiedEmailRegistration = 'email' in input;
    const username = verifiedEmailRegistration ? normalizedEmail(input.email) : normalizedUsername(input.username);
    const email = verifiedEmailRegistration ? username : legacyEmail(username);
    const displayName = verifiedEmailRegistration ? input.displayName.trim() : username;
    if (this.userIdsByUsername.has(username)) {
      if (verifiedEmailRegistration) throw new SaasDomainError('EMAIL_TAKEN', 'Email is already taken.');
      throw new SaasDomainError('USERNAME_TAKEN', 'Username is already taken.');
    }
    if (this.userIdsByEmail.has(email)) {
      throw new SaasDomainError('EMAIL_TAKEN', 'Email is already taken.');
    }

    const createdAt = new Date().toISOString();
    const user: UserWithCredential = {
      user: {
        id: this.nextId('user'),
        username,
        email,
        displayName,
        accountStatus: 'active',
        platformRole: 'user',
        createdAt,
      },
      passwordHash: input.passwordHash,
    };
    const organization: Organization = {
      id: this.nextId('org'),
      name: `${displayName}'s organization`,
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
    this.userIdsByEmail.set(email, user.user.id);
    this.organizationsById.set(organization.id, organization);
    this.membershipsByUserId.set(user.user.id, membership);
    this.baseProductIdsByOrganizationId.set(organization.id, FREE_PRODUCT.id);
    this.entitlementsByOrganizationId.set(organization.id, entitlement);

    return copy({ user: user.user, organization, membership, entitlement });
  }

  async findUserByUsername(username: string): Promise<UserWithCredential | null> {
    const userId = this.userIdsByUsername.get(normalizedUsername(username));
    const user = userId ? this.usersById.get(userId) : undefined;
    return user ? copy(user) : null;
  }

  async findUserByEmail(email: string): Promise<UserWithCredential | null> {
    const userId = this.userIdsByEmail.get(normalizedEmail(email));
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

  async setUserDisplayName(userId: string, displayName: string): Promise<User> {
    const credential = this.usersById.get(userId);
    if (!credential) throw new SaasDomainError('USER_NOT_FOUND', 'User was not found.');
    const normalized = displayName.trim();
    if (normalized.length === 0 || normalized.length > 64) {
      throw new SaasDomainError('VALIDATION_ERROR', 'Display name is invalid.');
    }
    credential.user.displayName = normalized;
    return copy(credential.user);
  }

  async setUserPlatformRole(userId: string, role: PlatformRole): Promise<User> {
    const credential = this.usersById.get(userId);
    if (!credential) throw new SaasDomainError('USER_NOT_FOUND', 'User was not found.');
    credential.user.platformRole = role;
    return copy(credential.user);
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

  async resetPasswordAndRevokeSessions(input: PasswordResetInput): Promise<void> {
    validatePasswordResetInput(input);
    const credential = this.usersById.get(input.userId);
    if (!credential) throw new SaasDomainError('USER_NOT_FOUND', 'User was not found.');

    credential.passwordHash = input.passwordHash;
    for (const session of this.refreshSessionsByTokenHash.values()) {
      if (session.userId === input.userId && session.revokedAt === null) {
        session.revokedAt = input.revokedAt;
      }
    }
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

  async findOrderById(orderId: string): Promise<Order | null> {
    const order = this.ordersById.get(orderId);
    return order ? copy(order) : null;
  }

  async listOrders(organizationId: string): Promise<Order[]> {
    return copy([...this.ordersById.values()]
      .filter((order) => order.organizationId === organizationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
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
    if (order.status !== 'pending') {
      throw new SaasDomainError('ORDER_NOT_SETTLEABLE', 'Order cannot be settled.');
    }

    const organization = this.organizationsById.get(order.organizationId);
    if (!organization) throw new SaasDomainError('ORGANIZATION_NOT_FOUND', 'Organization was not found.');
    const product = this.productsById.get(order.productId);
    if (!product) throw new SaasDomainError('PRODUCT_NOT_FOUND', 'Product was not found.');
    if (!this.entitlementsByOrganizationId.has(organization.id)) {
      throw new SaasDomainError('ENTITLEMENT_NOT_FOUND', 'Organization entitlement was not found.');
    }

    const paidAt = new Date().toISOString();
    order.status = 'paid';
    order.paidAt = paidAt;
    if (product.kind === 'plan') this.baseProductIdsByOrganizationId.set(organization.id, product.id);
    const updatedEntitlement = this.recomputeEntitlement(organization.id);
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

  private recomputeEntitlement(organizationId: string): EntitlementSnapshot {
    const baseProductId = this.baseProductIdsByOrganizationId.get(organizationId);
    const baseProduct = baseProductId ? this.productsById.get(baseProductId) : undefined;
    if (!baseProduct || baseProduct.kind !== 'plan') {
      throw new SaasDomainError('ENTITLEMENT_NOT_FOUND', 'Organization entitlement was not found.');
    }

    let entitlement = this.entitlementForProduct(organizationId, baseProduct);
    for (const order of this.ordersById.values()) {
      if (order.organizationId !== organizationId || order.status !== 'paid') continue;
      const product = this.productsById.get(order.productId);
      if (!product) throw new SaasDomainError('PRODUCT_NOT_FOUND', 'Product was not found.');
      if (product.kind === 'addon') entitlement = this.entitlementWithAddon(entitlement, product, order.quantity);
    }
    return entitlement;
  }

  private entitlementWithAddon(entitlement: EntitlementSnapshot, addon: Product, quantity: number): EntitlementSnapshot {
    const limits = { ...entitlement.limits };
    for (const [limit, value] of Object.entries(addon.limits)) {
      limits[limit] = (limits[limit] ?? 0) + value * quantity;
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
