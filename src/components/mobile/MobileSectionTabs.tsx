import { useEffect, useState } from 'react';
import type { MobileSection } from './mobileNavigation';

type MobileSectionTabsProps = {
  sections: MobileSection[];
  onSelect: (id: string) => void;
};

export default function MobileSectionTabs({
  sections,
  onSelect,
}: MobileSectionTabsProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    setActiveId(sections[0]?.id ?? '');
  }, [sections]);

  if (!sections.length) return null;

  return (
    <nav
      aria-label="当前模块分类"
      className="mobile-scroll-row sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[65] gap-5 border-b border-slate-200/70 bg-white/95 px-4 dark:border-white/10 dark:bg-slate-950/95 md:hidden"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          aria-current={activeId === section.id ? 'page' : undefined}
          onClick={() => {
            setActiveId(section.id);
            onSelect(section.id);
          }}
          className="min-h-11 shrink-0 border-b-2 border-transparent px-1 text-xs font-bold text-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-500 aria-[current=page]:border-emerald-500 aria-[current=page]:text-emerald-600 dark:text-slate-400"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
