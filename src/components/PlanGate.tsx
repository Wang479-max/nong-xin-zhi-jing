/**
 * @file PlanGate.tsx
 * @description 功能门控包裹组件。当用户套餐未解锁目标功能时，展示「升级解锁」蒙层；
 * 解锁（或演示模式）时正常渲染子内容。
 */
import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useEntitlements } from '../hooks/usePlanGate';
import { getPlanDef, type FeatureKey } from '../data/pricing';

interface PlanGateProps {
  user: any;
  feature: FeatureKey;
  /** 解锁该功能所需的最低套餐（用于文案），默认专业版 */
  requiredPlanName?: string;
  /** 点击升级时回调（通常导航至服务市场） */
  onUpgrade?: () => void;
  children: React.ReactNode;
  /** 蒙层风格：blur 模糊已有内容 / replace 完全替换 */
  variant?: 'blur' | 'replace';
}

const FEATURE_LABELS: Record<FeatureKey, string> = {
  'monitoring-basic': '基础环境监测',
  'ai-diagnosis': 'AI 病害诊断',
  'digital-twin-advanced': '数字孪生高级视图',
  'advanced-analytics': '高级数据分析',
  'private-deploy': '私有化部署',
};

const PlanGate: React.FC<PlanGateProps> = ({ user, feature, requiredPlanName = '专业版', onUpgrade, children, variant = 'blur' }) => {
  const { isUnlocked } = useEntitlements(user);

  if (isUnlocked(feature)) return <>{children}</>;

  const Overlay = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md text-center p-6"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
        <Lock size={26} />
      </div>
      <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
        「{FEATURE_LABELS[feature]}」为专业版功能
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        升级至 <span className="font-medium text-emerald-600">{requiredPlanName}</span>（{getPlanDef('专业版').priceLabel}）即可解锁全部功能与 AI 诊断。
      </div>
      <button
        onClick={onUpgrade}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-600 transition"
      >
        <Sparkles size={16} /> 立即升级解锁
      </button>
    </motion.div>
  );

  if (variant === 'replace') {
    return <div className="relative min-h-[280px] rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">{Overlay}</div>;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[3px] opacity-60">{children}</div>
      {Overlay}
    </div>
  );
};

export default PlanGate;
