import React, { useState, useEffect } from 'react';
import { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { TiltCard } from '../ui/TiltCard';
import { AnimatedNumber } from '../ui/AnimatedNumber';

interface StatCardProps {
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
  color: string;
  trend: number;
  description: string;
  delay?: number;
}

const CountUp = ({ end, duration = 1500, decimals = 1 }: { end: number; duration?: number; decimals?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(progress * end);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [end, duration]);

  return <span>{count.toFixed(decimals)}</span>;
};

const Sparkline = ({ color, trend }: { color: string; trend: number }) => {
  const points = Array.from({ length: 12 }, (_, i) => ({
    x: i * 10,
    y: 20 + Math.random() * 20 + (trend > 0 ? -i : i) * 1.5
  }));

  const path = `M 0 ${points[0].y} ` + points.map(p => `L ${p.x} ${p.y}`).join(' ');

  return (
    <svg className="w-20 h-10 overflow-visible" viewBox="0 0 110 40">
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
      />
      <motion.circle
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        className={cn("fill-current", color)}
      />
    </svg>
  );
};

export default function StatCard({ label, value, unit, icon: Icon, color, trend, description, delay = 0 }: StatCardProps) {
  const isNegative = trend < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <TiltCard className="group relative h-60 bg-white dark:bg-[#0F172A] border border-slate-100 dark:border-white/10 rounded-[2.5rem] p-8 shadow-sm dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:shadow-2xl dark:hover:shadow-[0_20px_40px_rgba(16,185,129,0.1)] hover:-translate-y-2 dark:hover:border-emerald-500/30 overflow-hidden">
      {/* 玻璃感装饰背景层 */}
      <div className={cn(
        "absolute -top-12 -right-12 w-40 h-40 rounded-full blur-[60px] opacity-0 group-hover:opacity-30 transition-opacity duration-1000",
        color.replace('text-', 'bg-')
      )} />

      <div className="h-full flex flex-col justify-between relative z-10">
        <div className="flex items-start justify-between">
          <div className={cn(
            "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-700 group-hover:rotate-6 group-hover:scale-110 shadow-lg shadow-current/10 border border-current/10",
            color.replace('text-', 'bg-').concat('/10 dark:').concat(color.replace('text-', 'bg-')).concat('/30'),
            color
          )}>
            <Icon size={32} strokeWidth={1.5} />
          </div>
          
          <div className="flex flex-col items-end">
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm transition-colors",
              isNegative ? "bg-red-50 dark:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-500/30" : "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30"
            )}>
              {isNegative ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
              {Math.abs(trend)}%
            </div>
            <div className="mt-3 flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-bold text-slate-400 dark:text-slate-300 font-mono uppercase tracking-[0.1em] transition-colors">实时数采</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div className="flex-grow">
            <p className="text-[14px] font-black text-slate-400 dark:text-slate-300 mb-1 tracking-tight uppercase transition-colors">{label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter transition-colors">
                <AnimatedNumber value={label.includes('光照') ? value.toFixed(0) : value.toFixed(2)} />
              </span>
              <span className="text-[13px] font-black text-slate-400 dark:text-emerald-400 uppercase tracking-[0.2em] transition-colors">{unit}</span>
            </div>
          </div>
          
          <div className="mb-1 opacity-80 group-hover:opacity-100 transition-opacity">
             <Sparkline color={color} trend={trend} />
          </div>
        </div>
      </div>
      
      {/* 底部功能性微标签 */}
      <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between pointer-events-none opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500">
         <span className="text-[9px] font-bold text-slate-400 dark:text-slate-400 italic">#{Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
         <span className="text-[9px] font-bold text-slate-400 dark:text-emerald-400">NX-TENSOR-ENGINE</span>
      </div>

      {/* 装饰性背景大图标 */}
      <div className="absolute -bottom-10 -right-10 opacity-[0.02] dark:opacity-[0.08] text-slate-900 dark:text-white pointer-events-none group-hover:scale-150 group-hover:-rotate-12 transition-transform duration-[2000ms]">
        <Icon size={200} strokeWidth={0.5} />
      </div>
      </TiltCard>
    </motion.div>
  );
}

import { ArrowUpRight, ArrowDownRight } from "lucide-react";

