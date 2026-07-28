import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clock, Crown, Loader2, Package, ReceiptText, RefreshCw, ShoppingCart } from 'lucide-react';
import { invalidateEntitlements } from '../hooks/usePlanGate';
import { SaasApiError, saasClient } from '../services/saasClient';
import type { Order, Product, SaasSession } from '../types/saas';

interface Props { session: SaasSession; onSessionChange: (session: SaasSession) => void }
type Tab = 'catalog' | 'orders';

const yuan = (amountFen: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amountFen / 100);

const ServiceMarket: React.FC<Props> = ({ session, onSessionChange }) => {
  const [tab, setTab] = useState<Tab>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [catalog, history] = await Promise.all([saasClient.catalog(), saasClient.listOrders()]);
      setProducts(catalog); setOrders(history);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '服务市场加载失败。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const checkout = async (product: Product) => {
    if (!product.enabled || busy) return;
    const quantity = product.kind === 'plan' ? 1 : Math.max(1, Math.trunc(quantities[product.id] ?? 1));
    const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setBusy(product.id); setError(null); setNotice(null);
    try {
      const order = await saasClient.createOrder({ productId: product.id, quantity, idempotencyKey });
      setOrders((current) => [order, ...current.filter(({ id }) => id !== order.id)]);
      try {
        const settled = await saasClient.settleOrder(order.id);
        invalidateEntitlements();
        const updated = await saasClient.me();
        if (updated.user.id !== session.user.id || updated.organization.id !== session.organization.id) {
          throw new SaasApiError('SESSION_CHANGED', '会话状态已改变。', 0);
        }
        onSessionChange({ ...updated, entitlement: settled.entitlement });
        setOrders((current) => current.map((item) => item.id === settled.order.id ? settled.order : item));
        setNotice('订单已结算，组织权益已更新。');
      } catch (cause) {
        if (cause instanceof SaasApiError && cause.code === 'PAYMENT_MODE_DISABLED') {
          setNotice('订单已创建并保持待支付。当前部署未配置真实支付，也未启用模拟结算。');
        } else throw cause;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '下单失败。'); }
    finally { setBusy(null); }
  };

  return <div className="mx-auto max-w-7xl p-6">
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white"><ShoppingCart className="text-emerald-500" />服务市场</h1><p className="mt-1 text-sm text-slate-500">价格、功能和限额全部来自当前服务器目录。</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="text-xs text-slate-400">当前组织 · {session.organization.name}</div>
        <div className="flex items-center gap-2 font-semibold text-emerald-600"><Crown size={15} />{session.user.platformRole === 'platform_admin' ? '平台管理员（全部功能）' : session.entitlement.plan}</div>
        <div className="mt-1 text-xs text-slate-500">{Object.entries(session.entitlement.limits).map(([key, value]) => `${key}: ${value}`).join(' · ') || '无额外限额'}</div>
      </div>
    </div>
    <div className="mb-6 flex gap-2"><button onClick={() => setTab('catalog')} className={`rounded-xl px-4 py-2 text-sm ${tab === 'catalog' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Package className="mr-2 inline" size={15} />产品目录</button><button onClick={() => setTab('orders')} className={`rounded-xl px-4 py-2 text-sm ${tab === 'orders' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><ReceiptText className="mr-2 inline" size={15} />我的订单</button></div>
    {notice && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{notice}</div>}
    {error && <div className="mb-4 flex items-center justify-between rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"><span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span><button onClick={() => void load()}><RefreshCw size={16} /></button></div>}
    {loading ? <div className="flex justify-center py-24"><Loader2 className="animate-spin text-emerald-500" size={32} /></div> : tab === 'catalog' ? (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{products.map((product) => {
        const current = product.kind === 'plan' && product.id === session.entitlement.productId;
        return <article key={product.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-start justify-between"><div><span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{product.kind === 'plan' ? '套餐' : '增值包'}</span><h2 className="text-lg font-bold text-slate-800 dark:text-white">{product.name}</h2></div>{current && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">当前</span>}</div>
          <p className="mt-2 flex-1 text-sm text-slate-500">{product.description}</p><div className="my-4 text-2xl font-black text-emerald-600">{yuan(product.amountFen)}<span className="text-xs font-normal text-slate-400">{product.billingInterval ? ` / ${product.billingInterval === 'month' ? '月' : '年'}` : ''}</span></div>
          <ul className="mb-4 space-y-1 text-xs text-slate-500">{product.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={13} className="text-emerald-500" />{feature}</li>)}{Object.entries(product.limits).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul>
          {product.kind === 'addon' && <label className="mb-3 text-xs text-slate-500">数量 <input aria-label={`${product.name} 数量`} type="number" min={1} max={100} value={quantities[product.id] ?? 1} onChange={(event) => setQuantities((value) => ({ ...value, [product.id]: Math.max(1, Math.trunc(Number(event.target.value) || 1)) }))} className="ml-2 w-20 rounded-lg border px-2 py-1 dark:bg-slate-900" /></label>}
          <button disabled={!product.enabled || current || busy !== null} onClick={() => void checkout(product)} className="rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === product.id ? <Loader2 className="mx-auto animate-spin" size={16} /> : !product.enabled ? '已停用' : current ? '当前套餐' : '创建订单'}</button>
        </article>;
      })}</div>
    ) : orders.length === 0 ? <div className="py-20 text-center text-slate-400">暂无服务器订单记录</div> : <div className="space-y-3">{orders.map((order) => <article key={order.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60"><div><div className="font-medium text-slate-800 dark:text-white">{products.find(({ id }) => id === order.productId)?.name ?? order.productId} × {order.quantity}</div><div className="text-xs text-slate-400">{order.id} · {new Date(order.createdAt).toLocaleString('zh-CN')}</div></div><div className="text-right"><div className="font-bold">{yuan(order.amountFen)}</div><span className={`inline-flex items-center gap-1 text-xs ${order.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{order.status === 'paid' ? <Check size={13} /> : <Clock size={13} />}{order.status}</span></div></article>)}</div>}
  </div>;
};

export default ServiceMarket;
