/**
 * @file usePlanGate.ts
 * @description 套餐权益门控 Hook。统一从后端 /api/commerce/me 拉取权益快照，
 * 供各模块判断功能是否解锁（含「演示模式」一键放行）。
 */
import { useState, useEffect, useCallback } from 'react';
import DataService from '../services/dataService';
import { planAllowsFeature, type FeatureKey } from '../data/pricing';

export interface Entitlements {
  username: string | null;
  planId: 'free' | 'pro' | 'enterprise';
  planName: string;
  planExpiry?: string | null;
  commerceDemo: boolean;
  features: FeatureKey[];
  plotLimit: number;
  plotsOwned: number;
  aiMonthlyQuota: number;
  aiUsedThisMonth: number;
  subscriptions: any[];
  purchasedServices: any[];
  hasAdvancedAiPack: boolean;
}

// 模块级缓存 + 订阅，保证多组件共享同一份权益且可被购买/切换演示模式后统一刷新
let cache: Entitlements | null = null;
const subscribers = new Set<() => void>();

export const notifyCommerceUpdated = () => {
  cache = null;
  subscribers.forEach(fn => fn());
};

export function useEntitlements(user: any) {
  const username = user?.username;
  const [ent, setEnt] = useState<Entitlements | null>(cache);
  const [loading, setLoading] = useState(!cache);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await DataService.getEntitlements(username);
    cache = data;
    setEnt(data);
    setLoading(false);
  }, [username]);

  useEffect(() => {
    if (!cache) load();
    const sub = () => load();
    subscribers.add(sub);
    return () => { subscribers.delete(sub); };
  }, [load]);

  const isUnlocked = useCallback((feature: FeatureKey) => {
    if (ent?.commerceDemo) return true;            // 演示模式：全部放行
    if (ent) return ent.features.includes(feature);
    // 权益未就绪时回退到 user.plan 静态判断，避免闪烁锁定
    return planAllowsFeature(user?.plan, feature);
  }, [ent, user?.plan]);

  return { ent, loading, refresh: load, isUnlocked };
}
