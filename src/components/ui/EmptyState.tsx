import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useRipple, RippleEffect } from './useRipple';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState = ({ icon, title, description, actionLabel, onAction, className }: EmptyStateProps) => {
  const { ripples, addRipple } = useRipple();
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400 w-full h-full min-h-[300px]", className)}
    >
      <div className="mb-6 text-slate-300 dark:text-slate-600 scale-150">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">{title}</h3>
      {description && <p className="text-sm mb-8 max-w-sm font-medium">{description}</p>}
      {actionLabel && onAction && (
        <button 
          onMouseDown={addRipple}
          onClick={onAction}
          className="relative overflow-hidden px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-black tracking-widest shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          {actionLabel}
          <RippleEffect ripples={ripples} />
        </button>
      )}
    </motion.div>
  );
};
