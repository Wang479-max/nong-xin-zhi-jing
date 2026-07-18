import { describe, expect, it } from 'vitest';
import { MODULE_DEFINITIONS, canAccessAction, canAccessModule, visibleModules } from '../../src/lib/moduleAccess';
import type { EntitlementSnapshot, SaasUser } from '../../src/types/saas';
import { isCurrentEntitlementResponse } from '../../src/hooks/usePlanGate';

const user: SaasUser = { id: 'u1', username: 'farmer', platformRole: 'user', createdAt: '2030-01-01T00:00:00.000Z' };
const free: EntitlementSnapshot = {
  organizationId: 'o1', productId: 'free', plan: 'free', status: 'active',
  features: ['monitoring.basic'], limits: { plots: 2 },
};

describe('module access', () => {
  it('keeps every module visible for every authenticated user', () => {
    expect(visibleModules(user).map(({ id }) => id)).toEqual(MODULE_DEFINITIONS.map(({ id }) => id));
  });

  it('keeps the basic digital twin available while locking only advanced twin actions', () => {
    expect(canAccessModule('dashboard', user, free)).toBe(true);
    expect(canAccessModule('monitoring', user, free)).toBe(true);
    expect(canAccessModule('ai', user, free)).toBe(false);
    expect(canAccessModule('digitalTwin', user, free)).toBe(true);
    expect(canAccessAction('digitalTwin.control', user, free)).toBe(false);
    expect(canAccessAction('digitalTwin.fertilize', user, free)).toBe(false);

    const paid = { ...free, features: [...free.features, 'digital_twin.advanced' as const] };
    expect(canAccessAction('digitalTwin.control', user, paid)).toBe(true);
    expect(canAccessAction('digitalTwin.fertilize', user, paid)).toBe(true);
  });

  it('uses server entitlement features rather than a client plan label', () => {
    expect(canAccessModule('ai', user, { ...free, plan: 'enterprise', features: ['monitoring.basic'] })).toBe(false);
    expect(canAccessModule('ai', user, { ...free, plan: 'free', features: ['monitoring.basic', 'ai.diagnosis'] })).toBe(true);
  });

  it('unlocks every module for platform administrators', () => {
    const admin = { ...user, platformRole: 'platform_admin' as const };
    expect(MODULE_DEFINITIONS.every(({ id }) => canAccessModule(id, admin, null))).toBe(true);
    expect(canAccessAction('digitalTwin.control', admin, null)).toBe(true);
  });

  it('rejects stale or cross-organization entitlement responses', () => {
    expect(isCurrentEntitlementResponse('u1:o1', 'u1:o1', 'o1', 'o1')).toBe(true);
    expect(isCurrentEntitlementResponse('u1:o1', 'u2:o2', 'o1', 'o2')).toBe(false);
    expect(isCurrentEntitlementResponse('u1:o1', 'u1:o1', 'o2', 'o1')).toBe(false);
  });
});
