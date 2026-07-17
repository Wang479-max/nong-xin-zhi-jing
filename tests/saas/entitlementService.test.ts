import { describe, expect, it } from 'vitest';
import { EntitlementService } from '../../server/saas/entitlements/service';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';
import type { EntitlementSnapshot, Order, UserContext } from '../../server/saas/types';

describe('EntitlementService', () => {
  it('returns the free baseline and limits for a created organization', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'free-user', passwordHash: 'hash' });
    const service = new EntitlementService(repository);

    await expect(service.forOrganization(context.organization.id)).resolves.toMatchObject({
      features: expect.arrayContaining(['monitoring.basic']),
      limits: { aiMonthly: 5, plots: 2 },
    });
  });

  it('allows a platform admin without a purchased feature', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'admin-user', passwordHash: 'hash' });
    const service = new EntitlementService(repository);
    const adminContext: UserContext = { ...context, user: { ...context.user, platformRole: 'platform_admin' } };

    await expect(service.canUse(adminContext, 'device.control')).resolves.toEqual({ allowed: true, source: 'admin' });
  });

  it('allows free users to use monitoring.basic', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'monitor-user', passwordHash: 'hash' });
    const service = new EntitlementService(repository);

    await expect(service.canUse(context, 'monitoring.basic')).resolves.toEqual({ allowed: true, source: 'entitlement' });
  });

  it('returns the stable feature-required denial for unavailable features', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'denied-user', passwordHash: 'hash' });
    const service = new EntitlementService(repository);

    await expect(service.canUse(context, 'device.control')).resolves.toEqual({
      allowed: false,
      code: 'FEATURE_REQUIRED',
      feature: 'device.control',
      upgradePath: '/market',
    });
  });

  it('authorizes settled add-ons while retaining free baseline features', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'addon-user', passwordHash: 'hash' });
    await repository.createOrder(order(context.organization.id));
    await repository.settleMockOrder('ai-addon-order');
    const service = new EntitlementService(repository);

    await expect(service.canUse(context, 'ai.diagnosis')).resolves.toEqual({ allowed: true, source: 'entitlement' });
    await expect(service.forOrganization(context.organization.id)).resolves.toMatchObject({
      features: expect.arrayContaining(['monitoring.basic', 'ai.diagnosis']),
    });
  });

  it('denies features for an inactive entitlement', async () => {
    const context = contextWith({ status: 'inactive' });
    const service = new EntitlementService(repositoryWith(context.entitlement));

    await expect(service.canUse(context, 'monitoring.basic')).resolves.toEqual({
      allowed: false,
      code: 'FEATURE_REQUIRED',
      feature: 'monitoring.basic',
      upgradePath: '/market',
    });
  });

  it('uses the authoritative repository entitlement instead of a stale context snapshot', async () => {
    const context = contextWith({ features: ['device.control'] });
    const service = new EntitlementService(repositoryWith({ ...context.entitlement, features: ['monitoring.basic'] }));

    await expect(service.canUse(context, 'device.control')).resolves.toEqual({
      allowed: false,
      code: 'FEATURE_REQUIRED',
      feature: 'device.control',
      upgradePath: '/market',
    });
  });

  it('propagates unknown organization failures without authorizing access', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'unknown-org-user', passwordHash: 'hash' });
    const service = new EntitlementService(repository);
    const unknownContext = { ...context, organization: { ...context.organization, id: 'missing-org' } };

    await expect(service.canUse(unknownContext, 'monitoring.basic')).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
  });

  it('returns defensive entitlement snapshots without mutating the repository state', async () => {
    const repository = new MemorySaasRepository();
    const context = await repository.createUserWithOrganization({ username: 'copy-user', passwordHash: 'hash' });
    const service = new EntitlementService(repository);
    const snapshot = await service.forOrganization(context.organization.id);
    snapshot.features.push('ai.diagnosis');
    snapshot.limits.plots = 999;

    await expect(service.forOrganization(context.organization.id)).resolves.toMatchObject({
      features: ['monitoring.basic'],
      limits: { plots: 2 },
    });
  });
});

function contextWith(overrides: Partial<EntitlementSnapshot>): UserContext {
  const entitlement: EntitlementSnapshot = {
    organizationId: 'org-test', productId: 'free', plan: 'free', status: 'active',
    features: ['monitoring.basic'], limits: { aiMonthly: 5, plots: 2 }, ...overrides,
  };
  return {
    user: { id: 'user-test', username: 'user', platformRole: 'user', createdAt: '2030-01-01T00:00:00.000Z' },
    organization: { id: 'org-test', name: 'Test organization', createdAt: '2030-01-01T00:00:00.000Z' },
    membership: { id: 'membership-test', userId: 'user-test', organizationId: 'org-test', role: 'owner', createdAt: '2030-01-01T00:00:00.000Z' },
    entitlement,
  };
}

function repositoryWith(entitlement: EntitlementSnapshot) {
  return {
    getEntitlementSnapshot: async () => structuredClone(entitlement),
  } as unknown as import('../../server/saas/repository').SaasRepository;
}

function order(organizationId: string): Order {
  return {
    id: 'ai-addon-order', organizationId, productId: 'addon.ai.pro', idempotencyKey: 'ai-addon-payment',
    amountFen: 9_900, currency: 'CNY', status: 'pending', createdAt: '2030-01-01T00:00:00.000Z', paidAt: null,
  };
}
