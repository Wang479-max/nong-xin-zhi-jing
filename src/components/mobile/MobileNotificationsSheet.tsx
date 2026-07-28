import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, Bell, Info, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Notification } from '../../context/NotificationContext';

type MobileNotificationsSheetProps = {
  open: boolean;
  notifications: Notification[];
  unreadCount: number;
  onClose: () => void;
  onClearAll: () => void;
  onMarkAsRead: (id: string) => void;
};

export default function MobileNotificationsSheet({
  open,
  notifications,
  unreadCount,
  onClose,
  onClearAll,
  onMarkAsRead,
}: MobileNotificationsSheetProps) {
  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] md:hidden">
      <button
        type="button"
        aria-label="关闭系统通知"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="系统通知"
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950"
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/70 p-4 dark:border-white/10">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">系统通知</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{unreadCount} 条未读消息</p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                type="button"
                aria-label="清除全部通知"
                onClick={onClearAll}
                className="mobile-touch-target flex items-center justify-center rounded-xl bg-rose-50 text-rose-600 focus-visible:outline-2 focus-visible:outline-rose-500 dark:bg-rose-500/10"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="mobile-touch-target flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-white/10 dark:text-slate-300"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {notifications.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5">
                <Bell size={25} className="text-slate-300 dark:text-slate-600" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">暂无新通知</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onMarkAsRead(notification.id)}
                  className={cn(
                    'flex min-h-20 w-full items-start gap-3 rounded-2xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-emerald-500',
                    notification.read
                      ? 'border-transparent bg-slate-50/60 opacity-70 dark:bg-white/[0.03]'
                      : 'border-emerald-500/15 bg-emerald-50/40 dark:bg-emerald-500/5',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      notification.type === 'error'
                        ? 'bg-red-50 text-red-500 dark:bg-red-500/10'
                        : notification.type === 'warning'
                          ? 'bg-amber-50 text-amber-500 dark:bg-amber-500/10'
                          : 'bg-blue-50 text-blue-500 dark:bg-blue-500/10',
                    )}
                  >
                    {notification.type === 'error' ? (
                      <AlertCircle size={18} aria-hidden="true" />
                    ) : notification.type === 'warning' ? (
                      <AlertTriangle size={18} aria-hidden="true" />
                    ) : (
                      <Info size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-black text-slate-800 dark:text-white">
                        {notification.title}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">
                        {notification.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className="mt-1 block break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {notification.message}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
