import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../context/NotificationContext';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotifications();

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={cn(
              "pointer-events-auto flex items-center gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-xl",
              toast.type === 'success' && "bg-emerald-50/90 dark:bg-emerald-900/40 border-emerald-100 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-100",
              toast.type === 'error' && "bg-red-50/90 dark:bg-red-900/40 border-red-100 dark:border-red-800/50 text-red-900 dark:text-red-100",
              toast.type === 'warning' && "bg-amber-50/90 dark:bg-amber-900/40 border-amber-100 dark:border-amber-800/50 text-amber-900 dark:text-amber-100",
              toast.type === 'info' && "bg-blue-50/90 dark:bg-blue-900/40 border-blue-100 dark:border-blue-800/50 text-blue-900 dark:text-blue-100"
            )}
          >
            <div className={cn(
              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
              toast.type === 'success' && "bg-emerald-500 text-white",
              toast.type === 'error' && "bg-red-500 text-white",
              toast.type === 'warning' && "bg-amber-500 text-white",
              toast.type === 'info' && "bg-blue-500 text-white"
            )}>
              {toast.type === 'success' && <CheckCircle size={20} />}
              {toast.type === 'error' && <AlertCircle size={20} />}
              {toast.type === 'warning' && <AlertTriangle size={20} />}
              {toast.type === 'info' && <Info size={20} />}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="font-black text-sm tracking-tight">{toast.title}</h4>
              <p className="text-xs opacity-80 line-clamp-2 mt-0.5">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={16} className="opacity-40 dark:opacity-60" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
