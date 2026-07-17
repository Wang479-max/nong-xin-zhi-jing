import { useCallback, useEffect, useRef, useState } from 'react';
import { canAccessFeature } from '../lib/moduleAccess';
import { saasClient } from '../services/saasClient';
import type { EntitlementSnapshot, FeatureKey, SaasSession } from '../types/saas';

interface CacheEntry { sessionKey: string; entitlement: EntitlementSnapshot }
let cache: CacheEntry | null = null;
const subscribers = new Set<() => void>();

export function invalidateEntitlements(): void {
  cache = null;
  subscribers.forEach((subscriber) => subscriber());
}

/** Kept as a compatibility alias for components that already broadcast a purchase update. */
export const notifyCommerceUpdated = invalidateEntitlements;

export function isCurrentEntitlementResponse(
  requestedSessionKey: string | null,
  currentSessionKey: string | null,
  responseOrganizationId: string,
  currentOrganizationId: string | null,
): boolean {
  return requestedSessionKey !== null
    && requestedSessionKey === currentSessionKey
    && responseOrganizationId === currentOrganizationId;
}

export function useEntitlements(session: SaasSession | null) {
  const organizationId = session?.organization.id ?? null;
  const sessionKey = session ? `${session.user.id}:${session.organization.id}` : null;
  const currentSessionKey = useRef(sessionKey);
  const currentOrganizationId = useRef(organizationId);
  currentSessionKey.current = sessionKey;
  currentOrganizationId.current = organizationId;
  const cached = cache?.sessionKey === sessionKey ? cache.entitlement : null;
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(cached);
  const [loading, setLoading] = useState(Boolean(session) && !cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestedSessionKey = sessionKey;
    if (!requestedSessionKey || !organizationId) {
      setEntitlement(null); setLoading(false); setError(null); return;
    }
    setLoading(true); setError(null);
    try {
      const next = await saasClient.entitlements();
      if (!isCurrentEntitlementResponse(requestedSessionKey, currentSessionKey.current, next.organizationId, currentOrganizationId.current)) return;
      cache = { sessionKey: requestedSessionKey, entitlement: next };
      setEntitlement(next);
    } catch (cause) {
      if (requestedSessionKey !== currentSessionKey.current) return;
      setEntitlement(null);
      setError(cause instanceof Error ? cause.message : '权益加载失败。');
    } finally {
      if (requestedSessionKey === currentSessionKey.current) setLoading(false);
    }
  }, [organizationId, session, sessionKey]);

  useEffect(() => {
    setEntitlement(cached);
    setError(null);
    setLoading(Boolean(sessionKey) && !cached);
    if (!cached) void load(); else setEntitlement(cached);
    const subscriber = () => { void load(); };
    subscribers.add(subscriber);
    return () => { subscribers.delete(subscriber); };
  }, [cached, load]);

  const isUnlocked = useCallback((feature: FeatureKey | null) => {
    if (!session) return false;
    if (entitlement && entitlement.organizationId !== session.organization.id) return false;
    return canAccessFeature(feature, session.user, entitlement);
  }, [entitlement, session]);

  return { ent: entitlement, entitlement, loading, error, refresh: load, isUnlocked };
}
