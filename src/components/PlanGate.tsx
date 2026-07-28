import React from 'react';
import { AlertCircle, Loader2, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useEntitlements } from '../hooks/usePlanGate';
import type { FeatureKey, SaasSession } from '../types/saas';

interface PlanGateProps {
  session: SaasSession;
  feature: FeatureKey;
  onUpgrade: () => void;
  children: React.ReactNode;
  variant?: 'blur' | 'replace';
}

const labels: Record<FeatureKey, string> = {
  'monitoring.basic': '基础环境监测', 'monitoring.realtime': '实时环境监测', 'ai.diagnosis': 'AI 病害诊断',
  'digital_twin.advanced': '高级数字孪生', 'analytics.advanced': '高级数据分析', 'device.control': '远程设备控制',
  'team.members': '团队成员管理', 'deployment.private': '私有化部署',
};

const PlanGate: React.FC<PlanGateProps> = ({ session, feature, onUpgrade, children, variant = 'blur' }) => {
  const { isUnlocked, loading, error, refresh } = useEntitlements(session);
  if (session.user.platformRole === 'platform_admin') return <>{children}</>;
  if (!loading && !error && isUnlocked(feature)) return <>{children}</>;

  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 p-6 text-center backdrop-blur-md dark:bg-slate-900/80">
      {loading ? <Loader2 className="animate-spin text-emerald-500" size={32} /> : error ? <AlertCircle className="text-rose-500" size={32} /> : <Lock className="text-emerald-600" size={32} />}
      <strong className="text-slate-800 dark:text-white">
        {loading ? '正在核验组织权益…' : error ? '暂时无法核验权益' : `“${labels[feature]}”需要升级套餐`}
      </strong>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {error ?? '当前组织的服务器权益尚未包含此功能。菜单仍可预览，升级后即可使用；最终权限始终由服务器校验。'}
      </p>
      {error ? (
        <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm text-white"><RefreshCw size={15} />重试</button>
      ) : !loading ? (
        <button onClick={onUpgrade} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-medium text-white"><Sparkles size={16} />前往服务市场</button>
      ) : null}
    </motion.div>
  );

  if (variant === 'replace') return <div className="relative min-h-[280px] rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">{overlay}</div>;
  return <div className="relative h-full min-h-[280px]"><div className="pointer-events-none h-full select-none blur-[2px] opacity-60">{children}</div>{overlay}</div>;
};

export default PlanGate;
