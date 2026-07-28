import { useEffect } from 'react';
import { LogOut, Settings, X, type LucideIcon } from 'lucide-react';

type NavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type MobileMoreSheetProps = {
  open: boolean;
  items: NavigationItem[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onSettings: () => void;
  onLogout: () => void;
};

export default function MobileMoreSheet({
  open,
  items,
  onClose,
  onNavigate,
  onSettings,
  onLogout,
}: MobileMoreSheetProps) {
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
    <div className="fixed inset-0 z-[100] md:hidden">
      <button
        type="button"
        aria-label="关闭全部功能"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="全部功能"
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:bg-slate-950"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            全部功能
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="mobile-touch-target flex items-center justify-center rounded-xl bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-white/10"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              onClick={() => {
                onNavigate(id);
                onClose();
              }}
              className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 px-1 text-[11px] font-bold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-white/5 dark:text-slate-200"
            >
              <Icon size={22} className="text-emerald-600" aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => {
              onSettings();
              onClose();
            }}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-bold focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-white/10"
          >
            <Settings size={18} aria-hidden="true" />
            设置
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-bold text-red-600 focus-visible:outline-2 focus-visible:outline-red-500 dark:bg-red-500/10"
          >
            <LogOut size={18} aria-hidden="true" />
            退出
          </button>
        </div>
      </section>
    </div>
  );
}
