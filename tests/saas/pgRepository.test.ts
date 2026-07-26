import { describe, expect, it } from 'vitest';
import { PgSaasRepository } from '../../server/saas/db/pgRepository';
import type { Order } from '../../server/saas/types';

describe('PgSaasRepository', () => {
  it('promotes a user with a parameterized update and returns a stable missing-user error', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'set-user-platform-role' ? [{
      id: 'user-1', normalized_username: 'admin', platform_role: 'platform_admin', created_at: '2030-01-01T00:00:00.000Z',
      normalized_email: 'admin@legacy.invalid', display_name: 'admin', account_status: 'active',
    }] : []);
    const repository = new PgSaasRepository(db as never);

    await expect(repository.setUserPlatformRole('user-1', 'platform_admin')).resolves.toMatchObject({
      id: 'user-1', platformRole: 'platform_admin',
    });
    expect(db.call('set-user-platform-role')?.values).toEqual(['user-1', 'platform_admin']);

    const missing = new PgSaasRepository(new ScriptedDb(() => []) as never);
    await expect(missing.setUserPlatformRole('missing', 'platform_admin')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('normalizes username lookup parameters and maps timestamps defensively', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'find-user-by-username' ? [{
      id: 'user-1', normalized_username: 'farmer', platform_role: 'user',
      normalized_email: 'farmer@legacy.invalid', display_name: 'farmer', account_status: 'active',
      created_at: new Date('2030-01-01T00:00:00.000Z'), password_hash: 'hash',
    }] : []);
    const repository = new PgSaasRepository(db as never);

    await expect(repository.findUserByUsername(' Farmer ')).resolves.toEqual({
      user: {
        id: 'user-1', username: 'farmer', email: 'farmer@legacy.invalid', displayName: 'farmer',
        accountStatus: 'active', platformRole: 'user', createdAt: '2030-01-01T00:00:00.000Z',
      },
      passwordHash: 'hash',
    });
    expect(db.call('find-user-by-username')?.values).toEqual(['farmer']);
  });

  it.each([null, 'pending'])('fails closed for invalid account status %j', async (accountStatus) => {
    const db = new ScriptedDb(({ tag }) => tag === 'find-user-by-email' ? [{
      id: 'user-1', normalized_username: 'grower@example.com', normalized_email: 'grower@example.com',
      display_name: 'grower', account_status: accountStatus, platform_role: 'user',
      created_at: '2030-01-01T00:00:00.000Z', password_hash: 'hash',
    }] : []);

    await expect(new PgSaasRepository(db as never).findUserByEmail('grower@example.com'))
      .rejects.toThrow('Invalid account status.');
  });

  it('creates and finds verified email identity in one registration transaction', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'free-subscription-product' ? [{
      id: 'free', plan_id: 'free', features: ['monitoring.basic'], limits: { plots: 2 },
    }] : tag === 'find-user-by-email' ? [{
      id: 'user-1', normalized_username: 'grower@example.com', normalized_email: 'grower@example.com',
      display_name: 'grower', account_status: 'active', platform_role: 'user',
      created_at: '2030-01-01T00:00:00.000Z', password_hash: 'hash',
    }] : []);
    const repository = new PgSaasRepository(db as never);

    const context = await repository.createUserWithOrganization({
      email: ' GROWER@Example.COM ',
      displayName: 'grower',
      passwordHash: '  exact hash bytes  ',
      emailVerifiedAt: '2030-01-01T00:00:00.000Z',
    });

    expect(context.user).toMatchObject({
      username: 'grower@example.com', email: 'grower@example.com',
      displayName: 'grower', accountStatus: 'active',
    });
    expect(db.tags()).toEqual([
      'begin', 'insert-user', 'insert-user-credential', 'insert-personal-organization',
      'insert-owner-membership', 'free-subscription-product', 'insert-free-subscription', 'commit',
    ]);
    expect(db.call('insert-user')?.values).toEqual(expect.arrayContaining([
      'grower@example.com', 'grower@example.com', 'grower', '2030-01-01T00:00:00.000Z', 'active',
    ]));
    expect(db.call('insert-user-credential')?.values).toContain('  exact hash bytes  ');

    await expect(repository.findUserByEmail(' GROWER@EXAMPLE.COM ')).resolves.toEqual({
      user: {
        id: 'user-1', username: 'grower@example.com', email: 'grower@example.com',
        displayName: 'grower', accountStatus: 'active', platformRole: 'user',
        createdAt: '2030-01-01T00:00:00.000Z',
      },
      passwordHash: 'hash',
    });
    expect(db.call('find-user-by-email')?.values).toEqual(['grower@example.com']);
  });

  it('maps duplicate verified email registrations to EMAIL_TAKEN', async () => {
    const db = new ScriptedDb(({ tag }) => {
      if (tag === 'insert-user') throw Object.assign(new Error('duplicate'), {
        code: '23505', constraint: 'users_normalized_email_idx',
      });
      return [];
    });

    await expect(new PgSaasRepository(db as never).createUserWithOrganization({
      email: 'grower@example.com',
      displayName: 'grower',
      passwordHash: 'hash',
      emailVerifiedAt: '2030-01-01T00:00:00.000Z',
    })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(db.tags()).toEqual(['begin', 'insert-user', 'rollback']);
  });

  it('never marks a legacy compatibility identity as email verified', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'free-subscription-product' ? [{
      id: 'free', plan_id: 'free', features: ['monitoring.basic'], limits: { plots: 2 },
    }] : []);
    const repository = new PgSaasRepository(db as never);

    await repository.createUserWithOrganization({ username: 'legacy-user', passwordHash: 'hash' });

    expect(db.call('insert-user')?.values?.[4]).toBeNull();
  });

  it('resets a password and revokes active sessions for that user in one transaction', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'reset-password' ? [{ user_id: 'user-1' }] : []);
    const repository = new PgSaasRepository(db as never);

    await repository.resetPasswordAndRevokeSessions({
      userId: 'user-1', passwordHash: 'new-hash', revokedAt: '2030-01-03T00:00:00.000Z',
    });

    expect(db.tags()).toEqual(['begin', 'reset-password', 'revoke-user-refresh-sessions', 'commit']);
    expect(db.call('reset-password')?.values).toEqual([
      'user-1', 'new-hash', '2030-01-03T00:00:00.000Z',
    ]);
    expect(db.call('revoke-user-refresh-sessions')?.values).toEqual([
      'user-1', '2030-01-03T00:00:00.000Z',
    ]);
    expect(db.call('revoke-user-refresh-sessions')?.text).toMatch(/user_id\s*=\s*\$1[\s\S]*revoked_at\s+is\s+null/i);
  });

  it('rolls back password changes when session revocation fails', async () => {
    const db = new ScriptedDb(({ tag }) => {
      if (tag === 'reset-password') return [{ user_id: 'user-1' }];
      if (tag === 'revoke-user-refresh-sessions') throw new Error('session update failed');
      return [];
    });

    await expect(new PgSaasRepository(db as never).resetPasswordAndRevokeSessions({
      userId: 'user-1', passwordHash: 'new-hash', revokedAt: '2030-01-03T00:00:00.000Z',
    })).rejects.toThrow('session update failed');
    expect(db.tags()).toEqual(['begin', 'reset-password', 'revoke-user-refresh-sessions', 'rollback']);
  });

  it('maps catalog JSON and rejects unapproved or invalid defensive values', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'list-products' ? [{
      id: 'addon.ai.pro', kind: 'addon', name: 'AI Pro', description: 'Capacity', amount_fen: '9900',
      currency: 'CNY', billing_interval: null, enabled: true,
      features: ['ai.diagnosis', 'not.approved'], limits: { aiMonthly: 500, negative: -1, text: '5' },
    }] : []);

    await expect(new PgSaasRepository(db as never).listProducts()).resolves.toEqual([{
      id: 'addon.ai.pro', kind: 'addon', name: 'AI Pro', description: 'Capacity', amountFen: 9900,
      currency: 'CNY', billingInterval: null, enabled: true,
      features: ['ai.diagnosis'], limits: { aiMonthly: 500 },
    }]);
  });

  it('combines an active plan with every active add-on quantity', async () => {
    const db = new ScriptedDb(({ tag }) => {
      if (tag === 'entitlement-base') return [{
        organization_id: 'org-1', product_id: 'pro', plan_id: 'pro',
        granted_features: ['monitoring.basic', 'analytics.advanced'],
        granted_limits: { aiMonthly: 100, plots: 20 },
      }];
      if (tag === 'entitlement-addons') return [
        { quantity: 2, granted_features: ['ai.diagnosis'], granted_limits: { aiMonthly: 500 } },
        { quantity: 1, granted_features: ['device.control'], granted_limits: { devices: 3 } },
      ];
      return [];
    });

    await expect(new PgSaasRepository(db as never).getEntitlementSnapshot('org-1')).resolves.toEqual({
      organizationId: 'org-1', productId: 'pro', plan: 'pro', status: 'active',
      features: ['monitoring.basic', 'analytics.advanced', 'ai.diagnosis', 'device.control'],
      limits: { aiMonthly: 1100, plots: 20, devices: 3 },
    });
    expect(db.call('entitlement-addons')?.text).toMatch(/JOIN\s+order_items[\s\S]*JOIN\s+orders[\s\S]*status\s*=\s*'paid'/i);
  });

  it('creates orders from enabled server catalog snapshots in one transaction', async () => {
    const db = catalogDb();
    const repository = new PgSaasRepository(db as never);

    await expect(repository.createOrder(order())).resolves.toMatchObject({ id: 'order-1', amountFen: 19_800 });
    expect(db.tags()).toEqual([
      'begin', 'order-catalog-product', 'order-organization', 'insert-order', 'insert-order-item', 'commit',
    ]);
    const itemValues = db.call('insert-order-item')?.values ?? [];
    expect(itemValues).toEqual(expect.arrayContaining([
      'addon.ai.pro', 'addon', 9900, 2, JSON.stringify(['ai.diagnosis']), JSON.stringify({ aiMonthly: 500 }),
    ]));
  });

  it('lists tenant orders from immutable items newest first with a parameterized organization filter', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'list-orders' ? [{
      id: 'order-2', organization_id: 'org-1', idempotency_key: 'key-2', amount_fen: '9900',
      currency: 'CNY', status: 'pending', created_at: '2030-01-02T00:00:00.000Z', paid_at: null,
      product_id: 'addon.ai.pro', quantity: '1',
    }] : []);

    await expect(new PgSaasRepository(db as never).listOrders('org-1')).resolves.toEqual([expect.objectContaining({
      id: 'order-2', organizationId: 'org-1', productId: 'addon.ai.pro', quantity: 1,
    })]);
    expect(db.call('list-orders')?.values).toEqual(['org-1']);
    expect(db.call('list-orders')?.text).toMatch(/JOIN\s+order_items[\s\S]*organization_id\s*=\s*\$1[\s\S]*ORDER BY[\s\S]*created_at\s+DESC/i);
  });

  it('rolls back an order whose client amount disagrees with the catalog', async () => {
    const db = catalogDb();
    const repository = new PgSaasRepository(db as never);

    await expect(repository.createOrder({ ...order(), amountFen: 1 })).rejects.toMatchObject({ code: 'CATALOG_PRICE_INVALID' });
    expect(db.tags()).toEqual(['begin', 'order-catalog-product', 'rollback']);
  });

  it('uses an injected PoolClient without reconnecting or releasing caller ownership', async () => {
    const db = catalogDb();
    let released = false;
    const client = {
      query: db.query.bind(db),
      connect: async () => { throw new Error('PoolClient must not reconnect'); },
      release: () => { released = true; },
    };

    await expect(new PgSaasRepository(client as never).createOrder(order())).resolves.toMatchObject({ id: 'order-1' });
    expect(released).toBe(false);
    expect(db.calls.map(({ text }) => text)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^SAVEPOINT saas_repository_transaction$/),
      expect.stringMatching(/^RELEASE SAVEPOINT saas_repository_transaction$/),
    ]));
    expect(db.calls.map(({ text }) => text)).not.toContain('COMMIT');
  });

  it('starts its own transaction on a standalone injected PoolClient', async () => {
    const db = catalogDb();
    let released = false;
    const client = {
      query: async (input: string | { text: string; values?: unknown[] }, values?: unknown[]) => {
        const text = typeof input === 'string' ? input : input.text;
        if (text === 'SAVEPOINT saas_repository_transaction') {
          throw Object.assign(new Error('no active SQL transaction'), { code: '25P01' });
        }
        return db.query(input, values);
      },
      release: () => { released = true; },
    };

    await expect(new PgSaasRepository(client as never).createOrder(order())).resolves.toMatchObject({ id: 'order-1' });
    expect(db.calls.map(({ text }) => text)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(released).toBe(false);
  });

  it('releases a pool-acquired client when BEGIN fails', async () => {
    let releases = 0;
    const commands: string[] = [];
    const client = {
      query: async (input: string | { text: string }) => {
        const text = typeof input === 'string' ? input : input.text;
        commands.push(text);
        if (text === 'BEGIN') throw new Error('begin failed');
        return { rows: [] };
      },
      release: () => { releases += 1; },
    };
    const pool = { connect: async () => client };

    await expect(new PgSaasRepository(pool as never).createOrder(order())).rejects.toThrow('begin failed');
    expect(releases).toBe(1);
    expect(commands).toEqual(['BEGIN']);
    expect(commands).not.toContain('COMMIT');
  });

  it('makes duplicate refresh-session saves harmless without replacing token ownership', async () => {
    const db = new ScriptedDb(() => []);

    await new PgSaasRepository(db as never).saveRefreshSession({
      tokenHash: 'hash-only', userId: 'user-1', expiresAt: '2030-01-01T00:00:00.000Z', revokedAt: null,
    });

    expect(db.call('save-refresh-session')?.text).toMatch(/ON CONFLICT\s*\(token_hash\)\s*DO NOTHING/i);
  });

  it('rotates a valid refresh session under a row lock and consumes it exactly once', async () => {
    const db = new ScriptedDb(({ tag }) => tag === 'lock-refresh-session' ? [{
      token_hash: 'old', user_id: 'user-1', expires_at: '2030-01-02T00:00:00.000Z', revoked_at: null,
    }] : []);
    const repository = new PgSaasRepository(db as never);
    const now = Date.parse('2030-01-01T00:00:00.000Z');

    await expect(repository.rotateRefreshSession('old', {
      tokenHash: 'new', userId: 'user-1', expiresAt: '2030-02-01T00:00:00.000Z', revokedAt: null,
    }, now)).resolves.toEqual({
      tokenHash: 'old', userId: 'user-1', expiresAt: '2030-01-02T00:00:00.000Z', revokedAt: '2030-01-01T00:00:00.000Z',
    });
    expect(db.tags()).toEqual(['begin', 'lock-refresh-session', 'insert-refresh-replacement', 'consume-refresh-session', 'commit']);
  });

  it('settles add-ons from immutable item snapshots and remains idempotent when already paid', async () => {
    const pending = {
      id: 'order-1', organization_id: 'org-1', idempotency_key: 'key-1', amount_fen: 19800,
      currency: 'CNY', status: 'pending', created_at: '2030-01-01T00:00:00.000Z', paid_at: null,
      item_id: 'item-1', product_id: 'addon.ai.pro', product_kind: 'addon', plan_id_snapshot: null,
      quantity: 2, granted_features: ['ai.diagnosis'], granted_limits: { aiMonthly: 500 },
    };
    const db = new ScriptedDb(({ tag }) => tag === 'lock-order' ? [pending] : []);

    await expect(new PgSaasRepository(db as never).settleMockOrder('order-1')).resolves.toMatchObject({
      id: 'order-1', status: 'paid', paidAt: expect.any(String),
    });
    expect(db.call('lock-order')?.text).toMatch(/FOR UPDATE OF o, i/i);
    expect(db.tags()).toEqual([
      'begin', 'lock-order', 'lock-entitlement-organization', 'grant-addon', 'mark-order-paid', 'insert-payment-event', 'commit',
    ]);
    expect(db.call('grant-addon')?.values).toEqual(expect.arrayContaining([
      'item-1', 2, JSON.stringify(['ai.diagnosis']), JSON.stringify({ aiMonthly: 500 }),
    ]));

    const paidDb = new ScriptedDb(({ tag }) => tag === 'lock-order' ? [{
      ...pending, status: 'paid', paid_at: '2030-01-03T00:00:00.000Z',
    }] : []);
    await new PgSaasRepository(paidDb as never).settleMockOrder('order-1');
    expect(paidDb.tags()).toEqual(['begin', 'lock-order', 'commit']);
  });

  it('maps unique username violations to USERNAME_TAKEN and rolls back', async () => {
    const db = new ScriptedDb(({ tag }) => {
      if (tag === 'insert-user') throw Object.assign(new Error('duplicate'), {
        code: '23505', constraint: 'users_normalized_username_key',
      });
      return [];
    });

    await expect(new PgSaasRepository(db as never).createUserWithOrganization({
      username: 'farmer', passwordHash: 'hash',
    })).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    expect(db.tags()).toEqual(['begin', 'insert-user', 'rollback']);
  });
});

function order(): Order {
  return {
    id: 'order-1', organizationId: 'org-1', productId: 'addon.ai.pro', quantity: 2,
    idempotencyKey: 'key-1', amountFen: 19_800, currency: 'CNY', status: 'pending',
    createdAt: '2030-01-01T00:00:00.000Z', paidAt: null,
  };
}

function catalogDb(): ScriptedDb {
  return new ScriptedDb(({ tag }) => {
    if (tag === 'order-catalog-product') return [{
      id: 'addon.ai.pro', kind: 'addon', plan_id: null, name: 'AI Pro', amount_fen: 9900,
      currency: 'CNY', enabled: true, features: ['ai.diagnosis'], limits: { aiMonthly: 500 },
    }];
    if (tag === 'order-organization') return [{ id: 'org-1' }];
    return [];
  });
}

interface DbCall { tag: string; text: string; values: unknown[] }

class ScriptedDb {
  readonly calls: DbCall[] = [];

  constructor(private readonly respond: (call: DbCall) => unknown[]) {}

  async connect(): Promise<{ query: ScriptedDb['query']; release(): void }> {
    return { query: this.query.bind(this), release: () => undefined };
  }

  async query(input: string | { text: string; values?: unknown[] }, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    const text = typeof input === 'string' ? input : input.text;
    const bound = typeof input === 'string' ? values : input.values ?? [];
    const tag = text === 'BEGIN' ? 'begin'
      : text === 'COMMIT' ? 'commit'
        : text === 'ROLLBACK' ? 'rollback'
          : text.match(/^\/\*\s*([a-z0-9-]+)\s*\*\//i)?.[1] ?? 'untagged';
    const call = { tag, text, values: bound };
    this.calls.push(call);
    return { rows: this.respond(call) };
  }

  tags(): string[] { return this.calls.map(({ tag }) => tag); }
  call(tag: string): DbCall | undefined { return this.calls.find((call) => call.tag === tag); }
}
