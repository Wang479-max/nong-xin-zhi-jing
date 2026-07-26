import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { validatePasswordResetInput, validateUserRegistrationInput } from '../identityValidation';
import type { PasswordResetInput, SaasRepository, UserRegistrationInput } from '../repository';
import {
  BillingError,
  SaasDomainError,
  type AccountStatus,
  type EntitlementSnapshot,
  type FeatureKey,
  type Membership,
  type MembershipRole,
  type Order,
  type Organization,
  type PlatformRole,
  type Product,
  type RefreshSession,
  type User,
  type UserContext,
  type UserWithCredential,
} from '../types';

type Database = Pool | PoolClient;
type Row = QueryResultRow & Record<string, unknown>;

const FEATURE_KEYS: readonly FeatureKey[] = [
  'monitoring.basic',
  'monitoring.realtime',
  'ai.diagnosis',
  'digital_twin.advanced',
  'analytics.advanced',
  'device.control',
  'team.members',
  'deployment.private',
];
const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);
const MEMBERSHIP_ROLES = new Set<MembershipRole>(['owner', 'admin', 'expert', 'operator', 'viewer']);

export class PgSaasRepository implements SaasRepository {
  constructor(private readonly database: Database) {}

  async createUserWithOrganization(input: UserRegistrationInput): Promise<UserContext> {
    validateUserRegistrationInput(input);
    const verifiedEmailRegistration = 'email' in input;
    const username = verifiedEmailRegistration ? normalizeEmail(input.email) : normalizeUsername(input.username);
    const email = verifiedEmailRegistration ? username : legacyEmail(username);
    const displayName = verifiedEmailRegistration ? input.displayName.trim() : username;
    const createdAt = new Date().toISOString();
    const emailVerifiedAt = verifiedEmailRegistration ? input.emailVerifiedAt : null;
    const user: User = {
      id: randomUUID(),
      username,
      email,
      displayName,
      accountStatus: 'active',
      platformRole: 'user',
      createdAt,
    };
    const organization: Organization = {
      id: randomUUID(),
      name: `${displayName}'s organization`,
      createdAt,
    };
    const membership: Membership = {
      id: randomUUID(),
      userId: user.id,
      organizationId: organization.id,
      role: 'owner',
      createdAt,
    };

    try {
      return await this.transaction(async (client) => {
        await client.query(
          `/* insert-user */
           INSERT INTO users
             (id, normalized_username, normalized_email, display_name, email_verified_at,
              account_status, platform_role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [user.id, username, email, displayName, emailVerifiedAt, 'active', 'user', createdAt],
        );
        await client.query(
          '/* insert-user-credential */ INSERT INTO user_credentials (user_id, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $3)',
          [user.id, input.passwordHash, createdAt],
        );
        await client.query(
          '/* insert-personal-organization */ INSERT INTO organizations (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)',
          [organization.id, organization.name, createdAt],
        );
        await client.query(
          '/* insert-owner-membership */ INSERT INTO organization_members (id, organization_id, user_id, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)',
          [membership.id, organization.id, user.id, 'owner', createdAt],
        );
        const catalog = await client.query<Row>(
          `/* free-subscription-product */
           SELECT id, plan_id, features, limits
           FROM products
           WHERE id = $1 AND kind = 'plan' AND enabled = true`,
          ['free'],
        );
        const product = catalog.rows[0];
        if (!product || asString(product.plan_id) === '') {
          throw new SaasDomainError('PRODUCT_NOT_FOUND', 'The free plan product is unavailable.');
        }
        const features = asFeatures(product.features);
        const limits = asLimits(product.limits);
        await client.query(
          `/* insert-free-subscription */
           INSERT INTO subscriptions
             (id, organization_id, plan_id, product_id, status, quantity, granted_features, granted_limits, starts_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', 1, $5::jsonb, $6::jsonb, $7, $7, $7)`,
          [randomUUID(), organization.id, asString(product.plan_id), asString(product.id), JSON.stringify(features), JSON.stringify(limits), createdAt],
        );

        return {
          user,
          organization,
          membership,
          entitlement: {
            organizationId: organization.id,
            productId: asString(product.id),
            plan: asString(product.plan_id),
            status: 'active',
            features,
            limits,
          },
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (verifiedEmailRegistration) {
          throw new SaasDomainError('EMAIL_TAKEN', 'Email is already taken.');
        }
        if (postgresConstraint(error).includes('normalized_email')) {
          throw new SaasDomainError('EMAIL_TAKEN', 'Email is already taken.');
        }
        throw new SaasDomainError('USERNAME_TAKEN', 'Username is already taken.');
      }
      throw error;
    }
  }

  async findUserByUsername(username: string): Promise<UserWithCredential | null> {
    const result = await this.database.query<Row>(
      `/* find-user-by-username */
       SELECT u.id, u.normalized_username, u.normalized_email, u.display_name, u.account_status,
              u.platform_role, u.created_at, c.password_hash
       FROM users u
       JOIN user_credentials c ON c.user_id = u.id
       WHERE u.normalized_username = $1`,
      [normalizeUsername(username)],
    );
    const row = result.rows[0];
    return row ? { user: mapUser(row), passwordHash: asString(row.password_hash) } : null;
  }

  async findUserByEmail(email: string): Promise<UserWithCredential | null> {
    const result = await this.database.query<Row>(
      `/* find-user-by-email */
       SELECT u.id, u.normalized_username, u.normalized_email, u.display_name, u.account_status,
              u.platform_role, u.created_at, c.password_hash
       FROM users u
       JOIN user_credentials c ON c.user_id = u.id
       WHERE u.normalized_email = $1`,
      [normalizeEmail(email)],
    );
    const row = result.rows[0];
    return row ? { user: mapUser(row), passwordHash: asString(row.password_hash) } : null;
  }

  async findUserContext(userId: string): Promise<UserContext | null> {
    const result = await this.database.query<Row>(
      `/* find-user-context */
       SELECT u.id AS user_id, u.normalized_username, u.normalized_email, u.display_name, u.account_status,
              u.platform_role, u.created_at AS user_created_at,
              m.id AS membership_id, m.organization_id, m.role, m.created_at AS membership_created_at,
              o.name AS organization_name, o.created_at AS organization_created_at
       FROM users u
       JOIN LATERAL (
         SELECT om.* FROM organization_members om
         WHERE om.user_id = u.id
         ORDER BY om.created_at, om.id
         LIMIT 1
       ) m ON true
       JOIN organizations o ON o.id = m.organization_id
       WHERE u.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const organizationId = asString(row.organization_id);
    return {
      user: {
        id: asString(row.user_id),
        username: asString(row.normalized_username),
        email: mappedEmail(row),
        displayName: mappedDisplayName(row),
        accountStatus: asAccountStatus(row.account_status),
        platformRole: asPlatformRole(row.platform_role),
        createdAt: asIso(row.user_created_at),
      },
      organization: {
        id: organizationId,
        name: asString(row.organization_name),
        createdAt: asIso(row.organization_created_at),
      },
      membership: {
        id: asString(row.membership_id),
        userId: asString(row.user_id),
        organizationId,
        role: asMembershipRole(row.role),
        createdAt: asIso(row.membership_created_at),
      },
      entitlement: await this.getEntitlementSnapshot(organizationId),
    };
  }

  async setUserDisplayName(userId: string, displayName: string): Promise<User> {
    const normalized = displayName.trim();
    if (normalized.length === 0 || normalized.length > 64) {
      throw new SaasDomainError('VALIDATION_ERROR', 'Display name is invalid.');
    }
    const result = await this.database.query<Row>(
      `/* set-user-display-name */
       UPDATE users SET display_name = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, normalized_username, normalized_email, display_name, account_status, platform_role, created_at`,
      [userId, normalized],
    );
    const row = result.rows[0];
    if (!row) throw new SaasDomainError('USER_NOT_FOUND', 'User was not found.');
    return mapUser(row);
  }

  async setUserPlatformRole(userId: string, role: PlatformRole): Promise<User> {
    const result = await this.database.query<Row>(
      `/* set-user-platform-role */
       UPDATE users SET platform_role = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, normalized_username, normalized_email, display_name, account_status, platform_role, created_at`,
      [userId, role],
    );
    const row = result.rows[0];
    if (!row) throw new SaasDomainError('USER_NOT_FOUND', 'User was not found.');
    return mapUser(row);
  }

  async saveRefreshSession(session: RefreshSession): Promise<void> {
    await this.database.query(
      `/* save-refresh-session */
       INSERT INTO refresh_sessions (token_hash, user_id, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO NOTHING`,
      [session.tokenHash, session.userId, session.expiresAt, session.revokedAt],
    );
  }

  async findRefreshSession(tokenHash: string): Promise<RefreshSession | null> {
    const result = await this.database.query<Row>(
      `/* find-refresh-session */
       SELECT token_hash, user_id, expires_at, revoked_at
       FROM refresh_sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? mapRefreshSession(result.rows[0]) : null;
  }

  async revokeRefreshSession(tokenHash: string): Promise<void> {
    await this.database.query(
      `/* revoke-refresh-session */
       UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1`,
      [tokenHash],
    );
  }

  async resetPasswordAndRevokeSessions(input: PasswordResetInput): Promise<void> {
    validatePasswordResetInput(input);
    await this.transaction(async (client) => {
      const credential = await client.query<Row>(
        `/* reset-password */
         UPDATE user_credentials
         SET password_hash = $2, updated_at = $3
         WHERE user_id = $1
         RETURNING user_id`,
        [input.userId, input.passwordHash, input.revokedAt],
      );
      if (!credential.rows[0]) {
        throw new SaasDomainError('USER_NOT_FOUND', 'User was not found.');
      }
      await client.query(
        `/* revoke-user-refresh-sessions */
         UPDATE refresh_sessions
         SET revoked_at = $2
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.userId, input.revokedAt],
      );
    });
  }

  async rotateRefreshSession(
    currentTokenHash: string,
    replacementSession: RefreshSession,
    now: number,
  ): Promise<RefreshSession | null> {
    if (!Number.isFinite(now)) return null;
    const replacementExpiry = Date.parse(replacementSession.expiresAt);
    if (currentTokenHash === replacementSession.tokenHash
      || replacementSession.revokedAt !== null
      || !Number.isFinite(replacementExpiry)
      || replacementExpiry <= now) return null;

    try {
      return await this.transaction(async (client) => {
        const result = await client.query<Row>(
          `/* lock-refresh-session */
           SELECT token_hash, user_id, expires_at, revoked_at
           FROM refresh_sessions WHERE token_hash = $1 FOR UPDATE`,
          [currentTokenHash],
        );
        const row = result.rows[0];
        if (!row) return null;
        const current = mapRefreshSession(row);
        const currentExpiry = Date.parse(current.expiresAt);
        if (current.revokedAt !== null
          || !Number.isFinite(currentExpiry)
          || currentExpiry <= now
          || current.userId !== replacementSession.userId) return null;

        const revokedAt = new Date(now).toISOString();
        await client.query(
          `/* insert-refresh-replacement */
           INSERT INTO refresh_sessions (token_hash, user_id, expires_at, revoked_at)
           VALUES ($1, $2, $3, NULL)`,
          [replacementSession.tokenHash, replacementSession.userId, replacementSession.expiresAt],
        );
        await client.query(
          `/* consume-refresh-session */
           UPDATE refresh_sessions SET revoked_at = $2, replaced_by_token_hash = $3
           WHERE token_hash = $1 AND revoked_at IS NULL`,
          [currentTokenHash, revokedAt, replacementSession.tokenHash],
        );
        return { ...current, revokedAt };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async listProducts(): Promise<Product[]> {
    const result = await this.database.query<Row>(
      `/* list-products */
       SELECT id, kind, name, description, amount_fen, currency, billing_interval, enabled, features, limits
       FROM products ORDER BY kind, amount_fen, id`,
    );
    return result.rows.map(mapProduct);
  }

  async getEntitlementSnapshot(organizationId: string): Promise<EntitlementSnapshot> {
    const baseResult = await this.database.query<Row>(
      `/* entitlement-base */
       SELECT o.id AS organization_id, s.product_id, s.plan_id, s.granted_features, s.granted_limits
       FROM organizations o
       LEFT JOIN LATERAL (
         SELECT active.* FROM subscriptions active
         WHERE active.organization_id = o.id
           AND active.status = 'active'
           AND (active.ends_at IS NULL OR active.ends_at > now())
         ORDER BY active.starts_at DESC, active.id DESC
         LIMIT 1
       ) s ON true
       WHERE o.id = $1`,
      [organizationId],
    );
    const base = baseResult.rows[0];
    if (!base) throw new SaasDomainError('ORGANIZATION_NOT_FOUND', 'Organization was not found.');
    if (!base.product_id || !base.plan_id) {
      throw new SaasDomainError('ENTITLEMENT_NOT_FOUND', 'Organization entitlement was not found.');
    }

    const features = asFeatures(base.granted_features);
    const limits = asLimits(base.granted_limits);
    const addonResult = await this.database.query<Row>(
      `/* entitlement-addons */
       SELECT e.quantity, e.granted_features, e.granted_limits
       FROM entitlements e
       JOIN order_items i ON i.id = e.order_item_id AND i.organization_id = e.organization_id
       JOIN orders paid_order ON paid_order.id = i.order_id AND paid_order.organization_id = e.organization_id
       WHERE e.organization_id = $1
         AND e.status = 'active'
         AND e.revoked_at IS NULL
         AND (e.expires_at IS NULL OR e.expires_at > now())
         AND paid_order.status = 'paid'
       ORDER BY e.starts_at, e.id`,
      [organizationId],
    );
    const featureSet = new Set<FeatureKey>(features);
    for (const addon of addonResult.rows) {
      const quantity = positiveInteger(addon.quantity, 1);
      for (const feature of asFeatures(addon.granted_features)) featureSet.add(feature);
      for (const [key, amount] of Object.entries(asLimits(addon.granted_limits))) {
        const next = (limits[key] ?? 0) + amount * quantity;
        if (Number.isSafeInteger(next) && next >= 0) limits[key] = next;
      }
    }

    return {
      organizationId,
      productId: asString(base.product_id),
      plan: asString(base.plan_id),
      status: 'active',
      features: [...featureSet],
      limits,
    };
  }

  async findOrderByIdempotencyKey(organizationId: string, key: string): Promise<Order | null> {
    const result = await this.database.query<Row>(
      `/* find-order-by-idempotency */
       SELECT o.*, i.product_id, i.quantity
       FROM orders o JOIN order_items i ON i.order_id = o.id AND i.organization_id = o.organization_id
       WHERE o.organization_id = $1 AND o.idempotency_key = $2`,
      [organizationId, key],
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  }

  async findOrderById(orderId: string): Promise<Order | null> {
    const result = await this.database.query<Row>(
      `/* find-order-by-id */
       SELECT o.*, i.product_id, i.quantity
       FROM orders o JOIN order_items i ON i.order_id = o.id AND i.organization_id = o.organization_id
       WHERE o.id = $1`,
      [orderId],
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  }

  async listOrders(organizationId: string): Promise<Order[]> {
    const result = await this.database.query<Row>(
      `/* list-orders */
       SELECT o.id, o.organization_id, o.idempotency_key, o.amount_fen, o.currency,
              o.status, o.created_at, o.paid_at, i.product_id, i.quantity
       FROM orders o
       JOIN order_items i ON i.order_id = o.id AND i.organization_id = o.organization_id
       WHERE o.organization_id = $1
       ORDER BY o.created_at DESC, o.id DESC`,
      [organizationId],
    );
    return result.rows.map(mapOrder);
  }

  async createOrder(order: Order): Promise<Order> {
    try {
      return await this.transaction(async (client) => {
        const catalogResult = await client.query<Row>(
          `/* order-catalog-product */
           SELECT id, kind, plan_id, name, amount_fen, currency, enabled, features, limits
           FROM products WHERE id = $1 FOR SHARE`,
          [order.productId],
        );
        const product = catalogResult.rows[0];
        if (!product) throw new BillingError('PRODUCT_NOT_FOUND');
        if (product.enabled !== true) throw new BillingError('PRODUCT_DISABLED');

        const kind = product.kind === 'plan' ? 'plan' : product.kind === 'addon' ? 'addon' : null;
        const quantity = positiveInteger(order.quantity, 0);
        const unitAmount = nonnegativeInteger(product.amount_fen, -1);
        const catalogCurrency = asString(product.currency);
        if (!kind || quantity < 1 || unitAmount < 0 || catalogCurrency.length === 0) {
          throw new BillingError('CATALOG_PRICE_INVALID');
        }
        if (kind === 'plan' && quantity !== 1) throw new BillingError('PLAN_QUANTITY_INVALID');
        const expectedAmount = unitAmount * quantity;
        if (!Number.isSafeInteger(expectedAmount)
          || order.amountFen !== expectedAmount
          || order.currency !== catalogCurrency
          || order.status !== 'pending'
          || order.paidAt !== null) throw new BillingError('CATALOG_PRICE_INVALID');

        const organizationResult = await client.query<Row>(
          '/* order-organization */ SELECT id FROM organizations WHERE id = $1',
          [order.organizationId],
        );
        if (!organizationResult.rows[0]) {
          throw new SaasDomainError('ORGANIZATION_NOT_FOUND', 'Organization was not found.');
        }

        await client.query(
          `/* insert-order */
           INSERT INTO orders
             (id, organization_id, idempotency_key, amount_fen, currency, status, created_at, paid_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6, NULL, $6)`,
          [order.id, order.organizationId, order.idempotencyKey, expectedAmount, catalogCurrency, order.createdAt],
        );
        await client.query(
          `/* insert-order-item */
           INSERT INTO order_items
             (id, organization_id, order_id, product_id, product_kind, plan_id_snapshot, product_name,
              unit_amount_fen, currency, quantity, granted_features, granted_limits, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)`,
          [
            randomUUID(), order.organizationId, order.id, asString(product.id), kind,
            product.plan_id === null ? null : asString(product.plan_id), asString(product.name), unitAmount,
            catalogCurrency, quantity, JSON.stringify(asFeatures(product.features)), JSON.stringify(asLimits(product.limits)),
            order.createdAt,
          ],
        );
        return { ...order, amountFen: expectedAmount, currency: catalogCurrency, quantity };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const constraint = postgresConstraint(error);
        if (constraint.includes('organization_id_idempotency_key')) {
          throw new SaasDomainError('IDEMPOTENCY_KEY_TAKEN', 'Order idempotency key is already in use.');
        }
        throw new SaasDomainError('ORDER_ID_TAKEN', 'Order ID is already in use.');
      }
      throw error;
    }
  }

  async settleMockOrder(orderId: string): Promise<Order> {
    return this.transaction(async (client) => {
      const result = await client.query<Row>(
        `/* lock-order */
         SELECT o.*, i.id AS item_id, i.product_id, i.product_kind, i.plan_id_snapshot, i.quantity,
                i.granted_features, i.granted_limits
         FROM orders o
         JOIN order_items i ON i.order_id = o.id AND i.organization_id = o.organization_id
         WHERE o.id = $1
         FOR UPDATE OF o, i`,
        [orderId],
      );
      const row = result.rows[0];
      if (!row) throw new SaasDomainError('ORDER_NOT_FOUND', 'Order was not found.');
      const existing = mapOrder(row);
      if (existing.status === 'paid') return existing;
      if (existing.status !== 'pending') {
        throw new SaasDomainError('ORDER_NOT_SETTLEABLE', 'Order cannot be settled.');
      }

      await client.query(
        '/* lock-entitlement-organization */ SELECT id FROM organizations WHERE id = $1 FOR UPDATE',
        [existing.organizationId],
      );

      const paidAt = new Date().toISOString();
      const features = asFeatures(row.granted_features);
      const limits = asLimits(row.granted_limits);
      if (row.product_kind === 'plan') {
        const planId = asString(row.plan_id_snapshot);
        if (!planId) throw new SaasDomainError('ENTITLEMENT_NOT_FOUND', 'Purchased plan snapshot is incomplete.');
        await client.query(
          `/* close-active-subscription */
           UPDATE subscriptions
           SET status = 'cancelled', ends_at = COALESCE(ends_at, $2), updated_at = $2
           WHERE organization_id = $1 AND status = 'active'`,
          [existing.organizationId, paidAt],
        );
        await client.query(
          `/* grant-plan */
           INSERT INTO subscriptions
             (id, organization_id, plan_id, product_id, status, quantity, granted_features, granted_limits,
              starts_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', 1, $5::jsonb, $6::jsonb, $7, $7, $7)`,
          [randomUUID(), existing.organizationId, planId, existing.productId, JSON.stringify(features), JSON.stringify(limits), paidAt],
        );
      } else if (row.product_kind === 'addon') {
        await client.query(
          `/* grant-addon */
           INSERT INTO entitlements
             (id, organization_id, product_id, order_item_id, status, quantity, granted_features, granted_limits,
              starts_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7::jsonb, $8, $8, $8)`,
          [
            randomUUID(), existing.organizationId, existing.productId, asString(row.item_id), existing.quantity,
            JSON.stringify(features), JSON.stringify(limits), paidAt,
          ],
        );
      } else {
        throw new SaasDomainError('ENTITLEMENT_NOT_FOUND', 'Purchased product snapshot is invalid.');
      }

      await client.query(
        `/* mark-order-paid */
         UPDATE orders SET status = 'paid', paid_at = $2, updated_at = $2
         WHERE id = $1 AND status = 'pending'`,
        [orderId, paidAt],
      );
      await client.query(
        `/* insert-payment-event */
         INSERT INTO payment_events
           (id, organization_id, order_id, provider, provider_event_id, event_type, amount_fen, currency, payload, created_at)
         VALUES ($1, $2, $3, 'mock', $4, 'paid', $5, $6, '{}'::jsonb, $7)`,
        [randomUUID(), existing.organizationId, existing.id, `mock:${existing.id}`, existing.amountFen, existing.currency, paidAt],
      );
      return { ...existing, status: 'paid', paidAt };
    });
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const injectedClient = 'release' in this.database;
    const client = injectedClient ? this.database as PoolClient : await (this.database as Pool).connect();
    let nestedTransaction = false;
    let transactionBoundaryStarted = false;
    try {
      if (injectedClient) {
        try {
          await client.query('SAVEPOINT saas_repository_transaction');
          nestedTransaction = true;
        } catch (error) {
          if (postgresErrorCode(error) !== '25P01') throw error;
          await client.query('BEGIN');
        }
      } else {
        await client.query('BEGIN');
      }
      transactionBoundaryStarted = true;

      const result = await operation(client);
      await client.query(nestedTransaction ? 'RELEASE SAVEPOINT saas_repository_transaction' : 'COMMIT');
      transactionBoundaryStarted = false;
      return result;
    } catch (error) {
      if (transactionBoundaryStarted) {
        try {
          if (nestedTransaction) {
            await client.query('ROLLBACK TO SAVEPOINT saas_repository_transaction');
            await client.query('RELEASE SAVEPOINT saas_repository_transaction');
          } else {
            await client.query('ROLLBACK');
          }
        } catch {
          // Preserve the domain/query error that caused the rollback.
        }
      }
      throw error;
    } finally {
      if (!injectedClient) client.release();
    }
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function legacyEmail(username: string): string {
  return username.includes('@') ? username : `${username}@legacy.invalid`;
}

function mapUser(row: Row): User {
  return {
    id: asString(row.id),
    username: asString(row.normalized_username),
    email: mappedEmail(row),
    displayName: mappedDisplayName(row),
    accountStatus: asAccountStatus(row.account_status),
    platformRole: asPlatformRole(row.platform_role),
    createdAt: asIso(row.created_at),
  };
}

function mappedEmail(row: Row): string {
  const email = normalizeEmail(asString(row.normalized_email));
  return email || legacyEmail(normalizeUsername(asString(row.normalized_username)));
}

function mappedDisplayName(row: Row): string {
  return asString(row.display_name) || asString(row.normalized_username);
}

function mapProduct(row: Row): Product {
  const kind = row.kind === 'addon' ? 'addon' : 'plan';
  const interval = row.billing_interval === 'month' || row.billing_interval === 'year' ? row.billing_interval : null;
  return {
    id: asString(row.id),
    kind,
    name: asString(row.name),
    description: asString(row.description),
    amountFen: nonnegativeInteger(row.amount_fen, 0),
    currency: asString(row.currency),
    billingInterval: interval,
    enabled: row.enabled === true,
    features: asFeatures(row.features),
    limits: asLimits(row.limits),
  };
}

function mapOrder(row: Row): Order {
  const status = row.status === 'paid' || row.status === 'cancelled' || row.status === 'refunded'
    ? row.status
    : 'pending';
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    productId: asString(row.product_id),
    quantity: positiveInteger(row.quantity, 1),
    idempotencyKey: asString(row.idempotency_key),
    amountFen: nonnegativeInteger(row.amount_fen, 0),
    currency: asString(row.currency),
    status,
    createdAt: asIso(row.created_at),
    paidAt: nullableIso(row.paid_at),
  };
}

function mapRefreshSession(row: Row): RefreshSession {
  return {
    tokenHash: asString(row.token_hash),
    userId: asString(row.user_id),
    expiresAt: asIso(row.expires_at),
    revokedAt: nullableIso(row.revoked_at),
  };
}

function asPlatformRole(value: unknown): PlatformRole {
  return value === 'platform_admin' ? 'platform_admin' : 'user';
}

function asAccountStatus(value: unknown): AccountStatus {
  if (value === 'active' || value === 'disabled') return value;
  throw new Error('Invalid account status.');
}

function asMembershipRole(value: unknown): MembershipRole {
  return typeof value === 'string' && MEMBERSHIP_ROLES.has(value as MembershipRole) ? value as MembershipRole : 'viewer';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function asIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(asString(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : asIso(value);
}

function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function asFeatures(value: unknown): FeatureKey[] {
  const parsed = parsedJson(value);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((item): item is FeatureKey => typeof item === 'string' && FEATURE_KEY_SET.has(item)))];
}

function asLimits(value: unknown): Record<string, number> {
  const parsed = parsedJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const limits: Record<string, number> = {};
  for (const [key, amount] of Object.entries(parsed)) {
    if (Number.isSafeInteger(amount) && (amount as number) >= 0) limits[key] = amount as number;
  }
  return limits;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function nonnegativeInteger(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === '23505';
}

function postgresErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function postgresConstraint(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('constraint' in error)) return '';
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : '';
}
