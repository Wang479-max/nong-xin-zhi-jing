import type { ReactNode } from 'react';
import { CalendarDays, Map, User } from 'lucide-react';

type MobileTopBarProps = {
  title: string;
  search: ReactNode;
  onCalendar: () => void;
  onAccount: () => void;
};

export default function MobileTopBar({
  title,
  search,
  onCalendar,
  onAccount,
}: MobileTopBarProps) {
  return (
    <header className="sticky top-0 z-[70] border-b border-slate-200/70 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/95 md:hidden">
      <div className="flex min-h-14 items-center gap-2 px-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-500 text-white">
          <Map size={19} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1" aria-label={`${title}搜索`}>
          {search}
        </div>
        <button
          type="button"
          aria-label="打开农事日历"
          onClick={onCalendar}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-indigo-500/10 dark:text-indigo-300"
        >
          <CalendarDays size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="账户与设置"
          onClick={onAccount}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-white/10 dark:text-slate-300"
        >
          <User size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
