import { Grid2X2, type LucideIcon } from 'lucide-react';

type NavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type MobileBottomNavProps = {
  activeTab: string;
  items: NavigationItem[];
  onNavigate: (id: string) => void;
  onOpenMore: () => void;
};

export default function MobileBottomNav({
  activeTab,
  items,
  onNavigate,
  onOpenMore,
}: MobileBottomNavProps) {
  return (
    <nav
      aria-label="手机端主导航"
      className="fixed inset-x-0 bottom-0 z-[80] grid h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/95 md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={activeTab === id ? 'page' : undefined}
          aria-label={label}
          onClick={() => onNavigate(id)}
          className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold text-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-500 aria-[current=page]:text-emerald-600 dark:text-slate-400"
        >
          <Icon size={21} aria-hidden="true" />
          <span className="max-w-full truncate">{label}</span>
        </button>
      ))}
      <button
        type="button"
        aria-label="全部"
        onClick={onOpenMore}
        className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold text-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:text-slate-400"
      >
        <Grid2X2 size={21} aria-hidden="true" />
        <span>全部</span>
      </button>
    </nav>
  );
}
