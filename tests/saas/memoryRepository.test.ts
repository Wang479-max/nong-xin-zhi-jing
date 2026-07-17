import { describe, expect, it } from 'vitest';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';
import type { Order } from '../../server/saas/types';

describe('MemorySaasRepository', () => {
  it('normalizes usernames and enforces uniqueness', async () => {
    const repo = new MemorySaasRepository();
    await repo.createUserWithOrganization({ username: ' Farmer ', passwordHash: 'hash' });
    await expect(repo.createUserWithOrganization({ username: 'farmer', passwordHash: 'hash2' }))
      .rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  });

  it('creates a public user with the approved roles and free entitlement baseline', async () => {
    const repo = new MemorySaasRepository();

    const context = await repo.createUserWithOrganization({ username: 'farmer', passwordHash: 'hash' });

    expect(context.user.platformRole).toBe('user');
    expect(context.membership.role).toBe('owner');
    expect(context.entitlement).toMatchObject({
      plan: 'free',
      features: ['monitoring.basic'],
      limits: { aiMonthly: 5, plots: 2 },
    });
  });

  it('provides the approved catalog without exposing mutable product state', async () => {
    const repo = new MemorySaasRepository();

    const products = await repo.listProducts();
    const addon = products.find((product) => product.id === 'addon.ai.pro');
    products[0].features.push('ai.diagnosis');
    products[0].limits.plots = 999;

    expect(products.map((product) => product.id)).toEqual(expect.arrayContaining(['free', 'pro', 'enterprise', 'addon.ai.pro']));
    expect(addon).toMatchObject({ amountFen: 9900, enabled: true, kind: 'addon' });
    expect((await repo.listProducts()).find((product) => product.id === 'free')).toMatchObject({
      kind: 'plan', features: ['monitoring.basic'],
      limits: { plots: 2 },
    });
  });

  it('rejects entitlement lookups for unknown organizations', async () => {
    const repo = new MemorySaasRepository();

    await expect(repo.getEntitlementSnapshot('missing-org')).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
  });

  it('copies refresh sessions across save, find, and revoke', async () => {
    const repo = new MemorySaasRepository();
    const session = { tokenHash: 'token', userId: 'user', expiresAt: '2030-01-01T00:00:00.000Z', revokedAt: null };

    await repo.saveRefreshSession(session);
    session.userId = 'mutated';
    const found = await repo.findRefreshSession('token');
    found!.userId = 'changed';
    await repo.revokeRefreshSession('token');

    expect(await repo.findRefreshSession('token')).toMatchObject({ userId: 'user', revokedAt: expect.any(String) });
  });

  it('atomically rotates only an active session with a valid future expiry', async () => {
    const repo = new MemorySaasRepository();
    const session = { tokenHash: 'current', userId: 'user', expiresAt: '2030-01-01T00:00:01.000Z', revokedAt: null };
    await repo.saveRefreshSession(session);

    const rotated = await repo.rotateRefreshSession('current', {
      tokenHash: 'replacement', userId: 'user', expiresAt: '2030-02-01T00:00:00.000Z', revokedAt: null,
    }, Date.parse('2030-01-01T00:00:00.000Z'));

    expect(rotated).toMatchObject({ tokenHash: 'current', revokedAt: expect.any(String) });
    expect(await repo.findRefreshSession('current')).toMatchObject({ revokedAt: expect.any(String) });
    expect(await repo.findRefreshSession('replacement')).toMatchObject({ revokedAt: null, userId: 'user' });

    await repo.saveRefreshSession({ tokenHash: 'malformed', userId: 'user', expiresAt: 'not-a-date', revokedAt: null });
    await expect(repo.rotateRefreshSession('malformed', {
      tokenHash: 'should-not-save', userId: 'user', expiresAt: '2030-02-01T00:00:00.000Z', revokedAt: null,
    }, Date.parse('2030-01-01T00:00:00.000Z'))).resolves.toBeNull();
    expect(await repo.findRefreshSession('malformed')).toMatchObject({ revokedAt: null });
    await expect(repo.findRefreshSession('should-not-save')).resolves.toBeNull();

    await repo.saveRefreshSession({ tokenHash: 'mismatched', userId: 'user', expiresAt: '2030-01-01T00:00:01.000Z', revokedAt: null });
    await expect(repo.rotateRefreshSession('mismatched', {
      tokenHash: 'wrong-user-replacement', userId: 'other-user', expiresAt: '2030-02-01T00:00:00.000Z', revokedAt: null,
    }, Date.parse('2030-01-01T00:00:00.000Z'))).resolves.toBeNull();
    expect(await repo.findRefreshSession('mismatched')).toMatchObject({ revokedAt: null });
    await expect(repo.findRefreshSession('wrong-user-replacement')).resolves.toBeNull();
  });

  it('keeps order IDs and organization-scoped idempotency keys unambiguous', async () => {
    const repo = new MemorySaasRepository();
    const firstContext = await repo.createUserWithOrganization({ username: 'first', passwordHash: 'hash' });
    const secondContext = await repo.createUserWithOrganization({ username: 'second', passwordHash: 'hash' });
    const first = order('order-1', firstContext.organization.id, 'key-1');

    await repo.createOrder(first);
    await expect(repo.createOrder(order('order-1', firstContext.organization.id, 'key-2')))
      .rejects.toMatchObject({ code: 'ORDER_ID_TAKEN' });
    await repo.createOrder(order('order-2', secondContext.organization.id, 'key-1'));

    expect(await repo.findOrderByIdempotencyKey(firstContext.organization.id, 'key-1')).toMatchObject({ id: 'order-1' });
    await expect(repo.findOrderByIdempotencyKey(firstContext.organization.id, 'key-2')).resolves.toBeNull();
    expect(await repo.findOrderByIdempotencyKey(secondContext.organization.id, 'key-1')).toMatchObject({ id: 'order-2' });
  });

  it('settles a pending order once and applies its product entitlement once', async () => {
    const repo = new MemorySaasRepository();
    const context = await repo.createUserWithOrganization({ username: 'buyer', passwordHash: 'hash' });
    await repo.createOrder(order('order-1', context.organization.id, 'payment-1', 'pro'));

    const paid = await repo.settleMockOrder('order-1');
    const entitlementAfterFirstSettlement = await repo.getEntitlementSnapshot(context.organization.id);
    const paidAgain = await repo.settleMockOrder('order-1');
    const entitlementAfterSecondSettlement = await repo.getEntitlementSnapshot(context.organization.id);

    expect(paid).toMatchObject({ status: 'paid', paidAt: expect.any(String) });
    expect(paidAgain.paidAt).toBe(paid.paidAt);
    expect(entitlementAfterFirstSettlement).toEqual(entitlementAfterSecondSettlement);
    expect(entitlementAfterFirstSettlement).toMatchObject({ plan: 'pro', features: expect.arrayContaining(['analytics.advanced']) });
  });

  it('preserves and extends the base entitlement when settling an add-on once', async () => {
    const repo = new MemorySaasRepository();
    const context = await repo.createUserWithOrganization({ username: 'addon-buyer', passwordHash: 'hash' });
    await repo.createOrder(order('addon-order', context.organization.id, 'addon-payment'));

    await repo.settleMockOrder('addon-order');
    const entitlementAfterFirstSettlement = await repo.getEntitlementSnapshot(context.organization.id);
    await repo.settleMockOrder('addon-order');
    const entitlementAfterSecondSettlement = await repo.getEntitlementSnapshot(context.organization.id);

    expect(entitlementAfterFirstSettlement).toMatchObject({
      plan: 'free',
      features: expect.arrayContaining(['monitoring.basic', 'ai.diagnosis']),
      limits: { plots: 2, aiMonthly: 505 },
    });
    expect(entitlementAfterSecondSettlement).toEqual(entitlementAfterFirstSettlement);
  });

  it('recomputes a replacement plan with every prior paid add-on grant', async () => {
    const repo = new MemorySaasRepository();
    const context = await repo.createUserWithOrganization({ username: 'plan-after-addon', passwordHash: 'hash' });
    await repo.createOrder(order('addon-order', context.organization.id, 'addon-payment'));
    await repo.createOrder(order('pro-order', context.organization.id, 'pro-payment', 'pro'));

    await repo.settleMockOrder('addon-order');
    await repo.settleMockOrder('pro-order');
    const entitlement = await repo.getEntitlementSnapshot(context.organization.id);
    await repo.settleMockOrder('addon-order');
    await repo.settleMockOrder('pro-order');

    expect(entitlement).toMatchObject({
      plan: 'pro',
      features: expect.arrayContaining(['monitoring.realtime', 'analytics.advanced', 'ai.diagnosis']),
      limits: { aiMonthly: 600, plots: 20, members: 25 },
    });
    expect(await repo.getEntitlementSnapshot(context.organization.id)).toEqual(entitlement);
  });

  it('keeps colon-containing organization and idempotency-key tuples distinct', async () => {
    const repo = new MemorySaasRepository();

    await repo.createOrder(order('first', 'a:b', 'c'));
    await repo.createOrder(order('second', 'a', 'b:c'));

    expect(await repo.findOrderByIdempotencyKey('a:b', 'c')).toMatchObject({ id: 'first' });
    expect(await repo.findOrderByIdempotencyKey('a', 'b:c')).toMatchObject({ id: 'second' });
  });

  it('returns defensive copies of orders', async () => {
    const repo = new MemorySaasRepository();
    const context = await repo.createUserWithOrganization({ username: 'orders', passwordHash: 'hash' });
    const created = await repo.createOrder(order('order-1', context.organization.id, 'key-1'));
    created.amountFen = 1;

    expect(await repo.findOrderByIdempotencyKey(context.organization.id, 'key-1')).toMatchObject({ amountFen: 9900 });
  });
});

function order(id: string, organizationId: string, idempotencyKey: string, productId = 'addon.ai.pro'): Order {
  return {
    id,
    organizationId,
    productId,
    quantity: 1,
    idempotencyKey,
    amountFen: 9900,
    currency: 'CNY',
    status: 'pending',
    createdAt: '2030-01-01T00:00:00.000Z',
    paidAt: null,
  };
}
