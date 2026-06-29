/**
 * @file ServiceMarket.tsx
 * @description 服务市场（商业中心）—— 落地商业模式三大板块：
 *   ① SaaS 订阅套餐  ② 硬件商城  ③ 增值服务  + 我的订单 + 收入构成可视化
 * 支付走「模拟支付」并预留真实支付（微信/支付宝）接口占位。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown, Cpu, Sparkles, ShoppingCart, ReceiptText, Check, X, Loader2,
  CheckCircle2, Clock, ArrowRight, Wallet, ShieldCheck, Star, Headphones,
} from 'lucide-react';
import DataService from '../services/dataService';
import { notifyCommerceUpdated } from '../hooks/usePlanGate';
import {
  PLAN_DEFS, PRODUCTS, VALUE_SERVICES, PAYMENT_PROVIDERS, REVENUE_BREAKDOWN,
  type PlanDef, type ProductDef, type ValueServiceDef, type PaymentProviderId,
} from '../data/pricing';

type TabId = 'plans' | 'hardware' | 'services' | 'orders';

const ACCENT: Record<string, { ring: string; text: string; btn: string; soft: string }> = {
  slate:   { ring: 'border-slate-200 dark:border-slate-700', text: 'text-slate-600', btn: 'bg-slate-700 hover:bg-slate-800', soft: 'bg-slate-100 dark:bg-slate-800' },
  emerald: { ring: 'border-emerald-400 dark:border-emerald-500', text: 'text-emerald-600', btn: 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600', soft: 'bg-emerald-50 dark:bg-emerald-900/30' },
  violet:  { ring: 'border-violet-300 dark:border-violet-600', text: 'text-violet-600', btn: 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600', soft: 'bg-violet-50 dark:bg-violet-900/30' },
};

const yuan = (n: number) => `¥${n.toLocaleString('zh-CN')}`;

// ----- 收入构成环形图（对应商业模式图） -----
const RevenueDonut: React.FC = () => {
  const radius = 52, stroke = 22, c = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="w-32 h-32 -rotate-90">
        {REVENUE_BREAKDOWN.map(seg => {
          const len = (seg.percent / 100) * c;
          const el = (
            <circle key={seg.key} cx="70" cy="70" r={radius} fill="none" stroke={seg.color}
              strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="space-y-1.5">
        {REVENUE_BREAKDOWN.map(seg => (
          <div key={seg.key} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: seg.color }} />
            <span className="text-slate-600 dark:text-slate-300">{seg.label}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">{seg.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface Props {
  user: any;
  onUpdateUser?: (u: any) => void;
  onNavigate?: (tab: string) => void;
}

const ServiceMarket: React.FC<Props> = ({ user, onUpdateUser }) => {
  const [tab, setTab] = useState<TabId>('plans');
  const [ent, setEnt] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [provider, setProvider] = useState<PaymentProviderId>('mock');
  const [pendingPay, setPendingPay] = useState<any>(null); // 真实支付占位的待支付订单

  const showToast = (type: 'ok' | 'err' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3200);
  };

  const refresh = async () => {
    const [e, o] = await Promise.all([
      DataService.getEntitlements(user?.username),
      DataService.getCommerceOrders(user?.username),
    ]);
    setEnt(e); setOrders(o);
  };

  useEffect(() => {
    refresh();
    DataService.getPlots(user?.username).then(setPlots).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  // 下单后统一处理：刷新权益、同步 user.plan、广播门控更新
  const afterOrder = async (resp: any) => {
    await refresh();
    notifyCommerceUpdated();
    if (resp?.entitlements && onUpdateUser && user) {
      const planName = resp.entitlements.planName;
      if (planName && planName !== user.plan) {
        onUpdateUser({ ...user, plan: planName });
      }
    }
    if (resp?.payment?.settled) {
      showToast('ok', '支付成功，权益已生效！');
    } else if (resp?.payment?.payUrl) {
      setPendingPay(resp.order);
      showToast('info', '已创建待支付订单（真实支付占位），请在弹窗中完成支付。');
    }
  };

  const placeOrder = async (payload: any, key: string) => {
    setBusy(key);
    try {
      const resp = await DataService.createOrder({ username: user?.username, provider, ...payload });
      await afterOrder(resp);
    } catch (e: any) {
      if (e?.data?.code === 'CONTACT_SALES') showToast('info', '企业版为定制报价，已为您转接商务洽谈通道。');
      else showToast('err', e?.message || '下单失败');
    } finally {
      setBusy(null);
    }
  };

  const settlePending = async (orderId: string) => {
    setBusy('settle');
    try {
      const resp = await DataService.notifyPayment(orderId);
      setPendingPay(null);
      await afterOrder({ entitlements: resp.entitlements, payment: { settled: true } });
      showToast('ok', '支付回调成功，订单已结算。');
    } catch (e: any) {
      showToast('err', e?.message || '结算失败');
    } finally { setBusy(null); }
  };

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'plans', label: 'SaaS 订阅', icon: <Crown size={16} /> },
    { id: 'hardware', label: '硬件商城', icon: <Cpu size={16} /> },
    { id: 'services', label: '增值服务', icon: <Sparkles size={16} /> },
    { id: 'orders', label: '我的订单', icon: <ReceiptText size={16} /> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 顶部概览 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Wallet className="text-emerald-500" /> 服务市场
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            订阅套餐 · 硬件设备 · 增值服务 —— 一站式开通智慧农业全栈能力
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-5 py-3 flex items-center gap-4">
          <div className="text-sm">
            <div className="text-slate-400">当前套餐</div>
            <div className="font-semibold text-emerald-600 flex items-center gap-1">
              <Crown size={15} /> {ent?.planName || user?.plan || '加载中…'}
            </div>
          </div>
          {ent && (
            <div className="text-sm border-l border-slate-200 dark:border-slate-700 pl-4">
              <div className="text-slate-400">地块 / AI 配额</div>
              <div className="font-medium text-slate-700 dark:text-slate-200">
                {ent.plotsOwned}/{ent.plotLimit === -1 ? '∞' : ent.plotLimit} · {ent.aiMonthlyQuota === -1 ? '不限' : `${ent.aiUsedThisMonth}/${ent.aiMonthlyQuota}`}
              </div>
            </div>
          )}
          {ent?.commerceDemo && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">演示模式·门控已放行</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === t.id ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 支付方式选择 */}
      {tab !== 'orders' && (
        <div className="flex items-center gap-3 mb-5 text-sm flex-wrap">
          <span className="text-slate-500 flex items-center gap-1"><Wallet size={15} /> 支付方式：</span>
          {PAYMENT_PROVIDERS.map(p => (
            <button key={p.id} onClick={() => setProvider(p.id)}
              title={p.description}
              className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                provider === p.id ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
              {p.name}{!p.enabled && p.id !== 'mock' ? '（占位）' : ''}
            </button>
          ))}
        </div>
      )}

      {/* 内容区 */}
      {tab === 'plans' && <PlansView ent={ent} busy={busy} plots={plots} onSubscribe={placeOrder} onContactSales={() => showToast('info', '企业版定制：请联系商务 400-000-0000 或 admin@nxzj.com')} />}
      {tab === 'hardware' && <CatalogView kind="hardware" items={PRODUCTS} busy={busy} onBuy={placeOrder} />}
      {tab === 'services' && <CatalogView kind="service" items={VALUE_SERVICES} busy={busy} onBuy={placeOrder} ent={ent} />}
      {tab === 'orders' && <OrdersView orders={orders} busy={busy} onSettle={settlePending} />}

      {/* 收入构成（商业模式可视化） */}
      <div className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="text-blue-500" size={18} />
          <h3 className="font-semibold text-slate-800 dark:text-white">收入构成</h3>
          <span className="text-xs text-slate-400">SaaS 订阅为主要收入来源</span>
        </div>
        <RevenueDonut />
      </div>

      {/* 真实支付占位弹窗 */}
      <AnimatePresence>
        {pendingPay && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPendingPay(null)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full text-center">
              <div className="text-lg font-semibold text-slate-800 dark:text-white mb-1">扫码支付（真实支付占位）</div>
              <div className="text-sm text-slate-500 mb-4">订单 {pendingPay.id} · {yuan(pendingPay.amount)}</div>
              <div className="mx-auto w-40 h-40 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-xs mb-4">
                {pendingPay.provider === 'wechat' ? '微信' : '支付宝'} 二维码<br />（接入真实商户后生成）
              </div>
              <p className="text-xs text-slate-400 mb-4">真实环境下用户扫码支付后，支付网关将回调 <code>/api/payments/notify</code> 自动结算。此处可手动模拟该回调。</p>
              <div className="flex gap-3">
                <button onClick={() => setPendingPay(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">取消</button>
                <button disabled={busy === 'settle'} onClick={() => settlePending(pendingPay.id)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {busy === 'settle' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} 模拟支付成功
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm text-white flex items-center gap-2 ${
              toast.type === 'ok' ? 'bg-emerald-600' : toast.type === 'err' ? 'bg-rose-600' : 'bg-slate-700'}`}>
            {toast.type === 'ok' ? <Check size={16} /> : toast.type === 'err' ? <X size={16} /> : <ShieldCheck size={16} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ===== SaaS 套餐 =====
const PlansView: React.FC<{ ent: any; busy: string | null; plots: any[]; onSubscribe: (payload: any, key: string) => void; onContactSales: () => void }>
  = ({ ent, busy, plots, onSubscribe, onContactSales }) => {
  const [years, setYears] = useState(1);
  const [qty, setQty] = useState(1);
  return (
    <div>
      <div className="grid md:grid-cols-3 gap-5">
        {PLAN_DEFS.map((plan: PlanDef) => {
          const a = ACCENT[plan.accent];
          const isCurrent = ent?.planId === plan.id;
          return (
            <motion.div key={plan.id} whileHover={{ y: -4 }}
              className={`relative rounded-2xl border-2 ${a.ring} bg-white dark:bg-slate-800/60 p-6 flex flex-col ${plan.recommended ? 'shadow-xl shadow-emerald-500/10' : ''}`}>
              {plan.recommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full bg-emerald-500 text-white font-medium">主推 · 收入 60%</span>
              )}
              <div className="text-lg font-bold text-slate-800 dark:text-white">{plan.name}</div>
              <div className="text-xs text-slate-400 mt-0.5 mb-3">{plan.tagline}</div>
              <div className={`text-2xl font-extrabold ${a.text}`}>{plan.priceLabel}</div>
              <ul className="mt-4 space-y-2 flex-1">
                {plan.highlights.map(h => (
                  <li key={h} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Check size={16} className={`mt-0.5 ${a.text}`} /> {h}
                  </li>
                ))}
              </ul>

              {plan.id === 'pro' && !isCurrent && (
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 w-12">地块数</span>
                    <input type="number" min={1} max={50} value={qty} onChange={e => setQty(Math.max(1, +e.target.value))}
                      className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent" />
                    <span className="text-slate-500 w-8">年限</span>
                    <input type="number" min={1} max={5} value={years} onChange={e => setYears(Math.max(1, +e.target.value))}
                      className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent" />
                  </div>
                  <div className="text-right text-slate-500">合计 <span className="font-semibold text-emerald-600">{yuan(plan.pricePerPlotPerYear * qty * years)}</span></div>
                </div>
              )}

              <div className="mt-5">
                {isCurrent ? (
                  <button disabled className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-sm font-medium">当前套餐</button>
                ) : plan.id === 'free' ? (
                  <button disabled className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-sm font-medium">免费基础版</button>
                ) : plan.id === 'enterprise' ? (
                  <button onClick={onContactSales} className={`w-full py-2.5 rounded-xl text-white text-sm font-medium ${a.btn} inline-flex items-center justify-center gap-2`}>
                    <Headphones size={16} /> 联系商务
                  </button>
                ) : (
                  <button disabled={busy === 'sub'} onClick={() => onSubscribe({ type: 'subscription', planId: 'pro', qty, years, plotIds: plots.slice(0, qty).map(p => p.id) }, 'sub')}
                    className={`w-full py-2.5 rounded-xl text-white text-sm font-medium ${a.btn} inline-flex items-center justify-center gap-2 disabled:opacity-60`}>
                    {busy === 'sub' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} 立即订阅
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ===== 硬件 / 增值服务通用目录 =====
const CatalogView: React.FC<{ kind: 'hardware' | 'service'; items: (ProductDef | ValueServiceDef)[]; busy: string | null; ent?: any; onBuy: (payload: any, key: string) => void }>
  = ({ kind, items, busy, ent, onBuy }) => {
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  return (
    <div className="grid md:grid-cols-3 gap-5">
      {items.map((it: any) => {
        const qty = qtyMap[it.id] || 1;
        const owned = kind === 'service' && ent?.purchasedServices?.some((s: any) => s.serviceId === it.id && s.unlocks === 'advanced-ai-pack' && (!s.expiry || new Date(s.expiry) > new Date()));
        return (
          <div key={it.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 flex flex-col">
            <div className="flex items-start justify-between">
              <div className="font-semibold text-slate-800 dark:text-white">{it.name}</div>
              {it.badge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">{it.badge}</span>}
            </div>
            <div className="text-xl font-bold text-emerald-600 mt-2">{yuan(it.price)}<span className="text-xs text-slate-400 font-normal"> /{it.unit}</span></div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 flex-1">{it.desc}</p>
            {it.specs && (
              <ul className="mt-3 space-y-1">
                {it.specs.map((s: string) => (
                  <li key={s} className="text-xs text-slate-500 flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> {s}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center gap-2">
              <input type="number" min={1} value={qty} onChange={e => setQtyMap(m => ({ ...m, [it.id]: Math.max(1, +e.target.value) }))}
                className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent text-sm" />
              <button disabled={busy === it.id || owned}
                onClick={() => onBuy({ type: kind === 'hardware' ? 'hardware' : 'service', items: [{ refId: it.id, qty }] }, it.id)}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {busy === it.id ? <Loader2 size={15} className="animate-spin" /> : owned ? <Check size={15} /> : <ShoppingCart size={15} />}
                {owned ? '已拥有' : kind === 'hardware' ? '立即购买' : it.billing === 'hourly' ? '预约' : '购买'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ===== 我的订单 =====
const OrdersView: React.FC<{ orders: any[]; busy: string | null; onSettle: (id: string) => void }> = ({ orders, busy, onSettle }) => {
  if (orders.length === 0) {
    return <div className="text-center py-16 text-slate-400">暂无订单，去服务市场看看吧～</div>;
  }
  const STATUS: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    paid: { label: '已支付', cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30', icon: <CheckCircle2 size={14} /> },
    pending: { label: '待支付', cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30', icon: <Clock size={14} /> },
    cancelled: { label: '已取消', cls: 'text-slate-500 bg-slate-100 dark:bg-slate-700', icon: <X size={14} /> },
    refunded: { label: '已退款', cls: 'text-slate-500 bg-slate-100 dark:bg-slate-700', icon: <X size={14} /> },
  };
  const TYPE: Record<string, string> = { subscription: 'SaaS 订阅', hardware: '硬件', service: '增值服务' };
  return (
    <div className="space-y-3">
      {orders.map(o => {
        const st = STATUS[o.status] || STATUS.pending;
        return (
          <div key={o.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">{TYPE[o.type] || o.type}</span>
                <span className="font-mono text-xs text-slate-400">{o.id}</span>
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-200 mt-1 truncate">
                {o.items.map((i: any) => `${i.name}×${i.qty}`).join('，')}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{new Date(o.createdAt).toLocaleString('zh-CN')} · {PAYMENT_PROVIDERS.find(p => p.id === o.provider)?.name || o.provider}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold text-slate-800 dark:text-white">{yuan(o.amount)}</div>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.icon} {st.label}</span>
              {o.status === 'pending' && (
                <button disabled={busy === 'settle'} onClick={() => onSettle(o.id)}
                  className="block mt-1.5 text-xs text-emerald-600 hover:underline">模拟支付回调 →</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ServiceMarket;
