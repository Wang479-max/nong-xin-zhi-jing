# Mobile Responsive Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved mobile “方案 A” experience across every module while preserving the existing desktop UI at widths of 1024px and above.

**Architecture:** Add a mobile-only application chrome that reuses the current `activeTab`, permission filtering, navigation callbacks, data services, and business components. Refactor page layouts with scoped small-screen utilities and focused component changes; keep the current desktop shell and desktop Tailwind classes as the default. Build the navigation behavior test-first, then adapt each page family and verify all target widths.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4, Vite 6, Vitest, Testing Library, jsdom

---

## File Structure

**New files**

- `src/components/mobile/mobileNavigation.ts` — primary/secondary navigation model and section definitions.
- `src/components/mobile/MobileTopBar.tsx` — brand, mobile search, title, and account action.
- `src/components/mobile/MobileSectionTabs.tsx` — horizontally scrollable in-module section navigation.
- `src/components/mobile/MobileBottomNav.tsx` — fixed five-item bottom navigation.
- `src/components/mobile/MobileMoreSheet.tsx` — role-filtered secondary module and account actions.
- `src/components/mobile/MobileAppChrome.tsx` — composes all mobile-only chrome.
- `src/components/mobile/MobileNavigation.test.tsx` — navigation and permission behavior tests.
- `src/components/mobile/mobileNavigation.test.ts` — pure navigation model tests.
- `src/test/setup.ts` — Testing Library matchers and cleanup.
- `vitest.config.ts` — jsdom component-test configuration.

**Modified files**

- `package.json`, `package-lock.json` — test dependencies and scripts.
- `index.html` — safe-area viewport declaration.
- `src/App.tsx` — mount mobile chrome, preserve tablet/desktop chrome, expose mobile search, and add content-safe spacing.
- `src/index.css` — safe-area tokens, horizontal-scroll helpers, responsive table/card rules, and mobile-only layout utilities.
- `src/components/Dashboard.tsx` — mobile dashboard hierarchy and spacing.
- `src/components/FieldMonitoring.tsx` — monitoring cards, filters, charts, and detail panels.
- `src/components/FieldManagement.tsx` — field list/map, operations, forms, and detail panels.
- `src/components/AIRecognition.tsx` — upload/scan/result flow and mobile history cards.
- `src/components/KnowledgeBase.tsx` — mobile knowledge list, search, filters, and reader layout.
- `src/components/NewsModule.tsx` — mobile news grid, article view, and side drawer.
- `src/components/ServiceMarket.tsx` — pricing cards and mobile purchase flow.
- `src/components/Feedback.tsx` — single-column feedback form and history cards.
- `src/components/SettingsModal.tsx` — full-screen mobile settings with section tabs.
- `src/components/FarmCalendar.tsx` — mobile calendar and event editor.
- `src/components/AIAssistant.tsx` — bottom-sheet assistant on phones.
- `src/components/ShortcutFloatingCard.tsx` — viewport-safe floating card.

**Do not modify**

- `src/lib/utils.ts` — it contains pre-existing user changes and is not needed for this feature.
- Existing desktop-only visual values at `lg:` and above unless a failing desktop regression proves a change is required.

## Worktree Safety

The current worktree already contains user changes in:

- `src/components/KnowledgeBase.tsx`
- `src/components/NewsModule.tsx`
- `src/lib/utils.ts`

Before editing, save the exact pre-existing diffs:

```powershell
git diff -- src/components/KnowledgeBase.tsx src/components/NewsModule.tsx src/lib/utils.ts
```

Never restore or overwrite those files. Do not stage `src/lib/utils.ts`. For `KnowledgeBase.tsx` and `NewsModule.tsx`, inspect the diff before and after every edit; do not create commits that accidentally absorb the user’s pre-existing hunks.

---

### Task 1: Install and Configure the Component Test Harness

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Add the test scripts before installing dependencies**

Add these entries to `package.json` under `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Install the minimal test dependencies**

Run:

```powershell
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: `package.json` and `package-lock.json` include the four development dependencies.

- [ ] **Step 3: Create the Vitest configuration**

Create `vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 4: Run the empty test suite**

Run:

```powershell
npm test -- --passWithNoTests
```

Expected: Vitest exits successfully and reports that no test files exist yet. The permanent `test` script remains `vitest run`; Task 2 adds the first real test file.

- [ ] **Step 5: Commit the isolated harness**

```powershell
git add package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "test: add responsive component test harness"
```

---

### Task 2: Define the Mobile Navigation Model Test-First

**Files:**

- Create: `src/components/mobile/mobileNavigation.test.ts`
- Create: `src/components/mobile/mobileNavigation.ts`

- [ ] **Step 1: Write failing tests for primary and secondary navigation**

Create `src/components/mobile/mobileNavigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MOBILE_PRIMARY_IDS,
  getMobileNavigationGroups,
  getMobileSections,
} from './mobileNavigation';

const items = [
  { id: 'dashboard', label: '首页' },
  { id: 'monitoring', label: '监测' },
  { id: 'management', label: '地块' },
  { id: 'ai', label: 'AI' },
  { id: 'knowledge', label: '知识' },
  { id: 'news', label: '资讯' },
  { id: 'market', label: '市场' },
  { id: 'feedback', label: '反馈' },
];

describe('mobile navigation model', () => {
  it('keeps exactly four business modules in the fixed bottom navigation', () => {
    expect(MOBILE_PRIMARY_IDS).toEqual([
      'dashboard',
      'monitoring',
      'management',
      'ai',
    ]);
    expect(getMobileNavigationGroups(items).primary.map((item) => item.id))
      .toEqual(MOBILE_PRIMARY_IDS);
  });

  it('places the remaining permitted modules in the more panel', () => {
    expect(getMobileNavigationGroups(items).secondary.map((item) => item.id))
      .toEqual(['knowledge', 'news', 'market', 'feedback']);
  });

  it('returns real section anchors for the active module', () => {
    expect(getMobileSections('monitoring')).toEqual([
      { id: 'monitoring-realtime-grid', label: '实时' },
      { id: 'monitoring-trends', label: '趋势' },
      { id: 'monitoring-devices', label: '设备' },
      { id: 'monitoring-alerts', label: '告警' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
npx vitest run src/components/mobile/mobileNavigation.test.ts
```

Expected: FAIL because `./mobileNavigation` does not exist.

- [ ] **Step 3: Implement the navigation model**

Create `src/components/mobile/mobileNavigation.ts`:

```ts
export type MobileNavigationItem = {
  id: string;
  label: string;
};

export type MobileSection = {
  id: string;
  label: string;
};

export const MOBILE_PRIMARY_IDS = [
  'dashboard',
  'monitoring',
  'management',
  'ai',
] as const;

const sections: Record<string, MobileSection[]> = {
  dashboard: [
    { id: 'dashboard-indicators', label: '概览' },
    { id: 'dashboard-environment', label: '环境' },
    { id: 'dashboard-quick-actions', label: '任务' },
    { id: 'dashboard-alerts', label: '预警' },
  ],
  monitoring: [
    { id: 'monitoring-realtime-grid', label: '实时' },
    { id: 'monitoring-trends', label: '趋势' },
    { id: 'monitoring-devices', label: '设备' },
    { id: 'monitoring-alerts', label: '告警' },
  ],
  management: [
    { id: 'management-fields', label: '地块' },
    { id: 'management-map', label: '地图' },
    { id: 'management-operations', label: '作业' },
    { id: 'management-archive', label: '档案' },
  ],
  ai: [
    { id: 'ai-capture', label: '拍照' },
    { id: 'ai-upload', label: '上传' },
    { id: 'ai-results', label: '结果' },
    { id: 'ai-history', label: '历史' },
  ],
};

export function getMobileNavigationGroups<T extends MobileNavigationItem>(
  items: T[],
) {
  const primary = MOBILE_PRIMARY_IDS
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is T => Boolean(item));
  const primarySet = new Set<string>(MOBILE_PRIMARY_IDS);
  const secondary = items.filter((item) => !primarySet.has(item.id));
  return { primary, secondary };
}

export function getMobileSections(activeTab: string): MobileSection[] {
  return sections[activeTab] ?? [];
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npx vitest run src/components/mobile/mobileNavigation.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/mobile/mobileNavigation.ts src/components/mobile/mobileNavigation.test.ts
git commit -m "feat: define mobile navigation model"
```

---

### Task 3: Build the Mobile Navigation Components Test-First

**Files:**

- Create: `src/components/mobile/MobileNavigation.test.tsx`
- Create: `src/components/mobile/MobileTopBar.tsx`
- Create: `src/components/mobile/MobileSectionTabs.tsx`
- Create: `src/components/mobile/MobileBottomNav.tsx`
- Create: `src/components/mobile/MobileMoreSheet.tsx`
- Create: `src/components/mobile/MobileAppChrome.tsx`

- [ ] **Step 1: Write failing behavior tests**

Create `src/components/mobile/MobileNavigation.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { Home, Scan } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import MobileBottomNav from './MobileBottomNav';
import MobileMoreSheet from './MobileMoreSheet';

const items = [
  { id: 'dashboard', label: '首页', icon: Home },
  { id: 'ai', label: 'AI', icon: Scan },
];

describe('mobile app navigation', () => {
  it('navigates through a bottom navigation item', () => {
    const onNavigate = vi.fn();
    render(
      <MobileBottomNav
        activeTab="dashboard"
        items={items}
        onNavigate={onNavigate}
        onOpenMore={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(onNavigate).toHaveBeenCalledWith('ai');
  });

  it('renders only the secondary items supplied by permission filtering', () => {
    render(
      <MobileMoreSheet
        open
        items={[{ id: 'knowledge', label: '知识库', icon: Home }]}
        onClose={() => undefined}
        onNavigate={() => undefined}
        onSettings={() => undefined}
        onLogout={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: '知识库' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '服务市场' })).not.toBeInTheDocument();
  });

  it('closes the more sheet after navigation', () => {
    const onClose = vi.fn();
    render(
      <MobileMoreSheet
        open
        items={[{ id: 'news', label: '资讯', icon: Home }]}
        onClose={onClose}
        onNavigate={() => undefined}
        onSettings={() => undefined}
        onLogout={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '资讯' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx vitest run src/components/mobile/MobileNavigation.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement `MobileBottomNav`**

Use this public interface in `src/components/mobile/MobileBottomNav.tsx`:

```tsx
import { Grid2X2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Item = { id: string; label: string; icon: LucideIcon };
type Props = {
  activeTab: string;
  items: Item[];
  onNavigate: (id: string) => void;
  onOpenMore: () => void;
};

export default function MobileBottomNav({
  activeTab,
  items,
  onNavigate,
  onOpenMore,
}: Props) {
  return (
    <nav
      aria-label="手机端主导航"
      className="fixed inset-x-0 bottom-0 z-[80] grid h-[calc(3.75rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/95 md:hidden"
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={activeTab === id ? 'page' : undefined}
          aria-label={label}
          onClick={() => onNavigate(id)}
          className="flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500 aria-[current=page]:text-emerald-600 dark:text-slate-400"
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
      <button
        type="button"
        aria-label="全部"
        onClick={onOpenMore}
        className="flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"
      >
        <Grid2X2 size={21} />
        <span>全部</span>
      </button>
    </nav>
  );
}
```

- [ ] **Step 4: Implement the remaining components**

Create `src/components/mobile/MobileTopBar.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Map, User } from 'lucide-react';

type Props = {
  title: string;
  search: ReactNode;
  onAccount: () => void;
};

export default function MobileTopBar({ title, search, onAccount }: Props) {
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
          aria-label="账户与设置"
          onClick={onAccount}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:bg-white/10 dark:text-slate-300"
        >
          <User size={20} />
        </button>
      </div>
    </header>
  );
}
```

Create `src/components/mobile/MobileSectionTabs.tsx`:

```tsx
import { useEffect, useState } from 'react';

type Props = {
  sections: Array<{ id: string; label: string }>;
  onSelect: (id: string) => void;
};

export default function MobileSectionTabs({ sections, onSelect }: Props) {
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
          className="min-h-11 shrink-0 border-b-2 border-transparent px-1 text-xs font-bold text-slate-500 aria-[current=page]:border-emerald-500 aria-[current=page]:text-emerald-600 dark:text-slate-400"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
```

Create `src/components/mobile/MobileMoreSheet.tsx`:

```tsx
import { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Settings, X } from 'lucide-react';

type Item = { id: string; label: string; icon: LucideIcon };
type Props = {
  open: boolean;
  items: Item[];
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
}: Props) {
  useEffect(() => {
    if (!open) return;
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
          <h2 className="text-lg font-black text-slate-900 dark:text-white">全部功能</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="mobile-touch-target flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10"
          >
            <X size={19} />
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
              className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 px-1 text-[11px] font-bold text-slate-700 dark:bg-white/5 dark:text-slate-200"
            >
              <Icon size={22} className="text-emerald-600" />
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
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-bold dark:bg-white/10"
          >
            <Settings size={18} /> 设置
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-bold text-red-600 dark:bg-red-500/10"
          >
            <LogOut size={18} /> 退出
          </button>
        </div>
      </section>
    </div>
  );
}
```

Create `src/components/mobile/MobileAppChrome.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { MobileSection } from './mobileNavigation';
import MobileBottomNav from './MobileBottomNav';
import MobileMoreSheet from './MobileMoreSheet';
import MobileSectionTabs from './MobileSectionTabs';
import MobileTopBar from './MobileTopBar';

type Item = { id: string; label: string; icon: LucideIcon };
type Props = {
  activeTab: string;
  title: string;
  primaryItems: Item[];
  secondaryItems: Item[];
  sections: MobileSection[];
  search: ReactNode;
  onNavigate: (id: string) => void;
  onSectionSelect: (id: string) => void;
  onSettings: () => void;
  onLogout: () => void;
};

export default function MobileAppChrome({
  activeTab,
  title,
  primaryItems,
  secondaryItems,
  sections,
  search,
  onNavigate,
  onSectionSelect,
  onSettings,
  onLogout,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <MobileTopBar title={title} search={search} onAccount={onSettings} />
      <MobileSectionTabs sections={sections} onSelect={onSectionSelect} />
      <MobileBottomNav
        activeTab={activeTab}
        items={primaryItems}
        onNavigate={onNavigate}
        onOpenMore={() => setMoreOpen(true)}
      />
      <MobileMoreSheet
        open={moreOpen}
        items={secondaryItems}
        onClose={() => setMoreOpen(false)}
        onNavigate={onNavigate}
        onSettings={onSettings}
        onLogout={onLogout}
      />
    </>
  );
}
```

- [ ] **Step 5: Run focused and full tests**

Run:

```powershell
npx vitest run src/components/mobile/MobileNavigation.test.tsx
npm test
```

Expected: all mobile navigation tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/mobile
git commit -m "feat: add mobile application navigation"
```

---

### Task 4: Integrate the Mobile Chrome Without Changing Desktop

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `index.html`
- Test: `src/components/mobile/MobileNavigation.test.tsx`

- [ ] **Step 1: Add a failing desktop/mobile visibility test**

Add to `MobileNavigation.test.tsx`:

```tsx
it('keeps mobile chrome scoped below the md breakpoint', () => {
  render(
    <MobileBottomNav
      activeTab="dashboard"
      items={items}
      onNavigate={() => undefined}
      onOpenMore={() => undefined}
    />,
  );
  expect(screen.getByRole('navigation', { name: '手机端主导航' }))
    .toHaveClass('md:hidden');
});
```

Run the focused test and confirm it fails if the breakpoint class is absent.

- [ ] **Step 2: Make `GlobalSearch` support a mobile variant**

Change the `GlobalSearch` props in `src/App.tsx` to include `mobile?: boolean`. Use:

```tsx
className={cn(
  'items-center gap-2 border border-slate-100 bg-slate-50 shadow-sm transition-all dark:border-white/5 dark:bg-[#1A1A1A]',
  mobile
    ? 'flex h-9 w-full rounded-full px-3'
    : 'hidden w-64 rounded-2xl px-4 py-2 md:flex lg:w-80',
)}
```

For the results panel use:

```tsx
className={cn(
  'absolute top-full mt-3 overflow-hidden border border-slate-200/50 bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#0A0A0A]/95',
  mobile
    ? 'fixed left-3 right-3 top-[calc(3.5rem+env(safe-area-inset-top))] w-auto rounded-2xl'
    : 'left-0 w-[400px] rounded-3xl',
)}
```

- [ ] **Step 3: Build permission-filtered mobile navigation data**

In `AppContent`, create one `navigationItems` array containing the existing role-filtered menu items plus feedback, then call:

```tsx
const { primary, secondary } = getMobileNavigationGroups(navigationItems);
const mobileSections = getMobileSections(activeTab);
```

Do not duplicate role checks inside the mobile components.

- [ ] **Step 4: Mount mobile chrome and protect desktop chrome**

Render `MobileAppChrome` inside the main container before the existing header. Pass the existing navigation, settings, logout, title, and search callbacks.

Change the current desktop/tablet header root from:

```tsx
<header className="h-16 lg:h-24 ...">
```

to:

```tsx
<header className="hidden h-16 md:flex lg:h-24 ...">
```

Keep the current `lg:` desktop styles unchanged.

Add to the data-mode `<main>`:

```tsx
data-active-tab={activeTab}
className={cn(
  'flex-1 relative overflow-hidden',
  appMode === 'data'
    ? 'mobile-content bg-slate-50 p-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] dark:bg-[#050505] md:p-4 md:pb-4 lg:p-12'
    : 'bg-black',
)}
```

Implement section navigation with:

```ts
const handleMobileSectionSelect = (id: string) => {
  document.getElementById(id)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
};
```

- [ ] **Step 5: Add safe-area and viewport CSS**

In `index.html`, set:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Add to `src/index.css`:

```css
@media (max-width: 767px) {
  html,
  body,
  #root {
    width: 100%;
    min-width: 320px;
    max-width: 100%;
    overflow-x: clip;
  }

  .mobile-content {
    overscroll-behavior-y: contain;
  }

  .mobile-scroll-row {
    display: flex;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .mobile-scroll-row::-webkit-scrollbar {
    display: none;
  }

  .mobile-touch-target {
    min-width: 44px;
    min-height: 44px;
  }
}
```

- [ ] **Step 6: Verify tests, types, and build**

Run:

```powershell
npm test
npm run lint
npm run build:frontend
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit only clean files**

```powershell
git add src/App.tsx src/index.css index.html
git commit -m "feat: integrate mobile app chrome"
```

---

### Task 5: Adapt the Dashboard Page

**Files:**

- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Add a failing static layout contract test**

Create `src/components/mobile/mobileLayoutContracts.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('mobile layout contracts', () => {
  it('uses mobile-first dashboard spacing and section anchors', () => {
    const source = read('src/components/Dashboard.tsx');
    expect(source).toContain('p-3 sm:p-6 lg:p-14');
    expect(source).toContain('id="dashboard-environment"');
    expect(source).toContain('grid-cols-2 sm:grid-cols-4');
  });
});
```

Run:

```powershell
npx vitest run src/components/mobile/mobileLayoutContracts.test.ts
```

Expected: FAIL because the new spacing and anchor are absent.

- [ ] **Step 2: Apply the dashboard mobile hierarchy**

Make these exact class changes:

- Main padding: `p-8 lg:p-14 space-y-12` → `p-3 sm:p-6 lg:p-14 space-y-5 sm:space-y-8 lg:space-y-12`.
- Indicator section: keep `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, reduce phone gap to `gap-3 sm:gap-5`.
- Main 12-column grid: `gap-10 lg:gap-12` → `gap-5 sm:gap-8 lg:gap-12`.
- Quick actions: `grid-cols-2 sm:grid-cols-4 gap-5` → `grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5`.
- Quick-action card padding: `p-6` → `p-4 sm:p-6`.
- Chart cards: use `p-4 sm:p-6`, `rounded-2xl sm:rounded-[2rem]`, and a phone height of at least `h-[230px]`.

Add the approved anchors to the relevant existing sections:

```tsx
id="dashboard-environment"
id="dashboard-alerts"
```

- [ ] **Step 3: Run the focused test and build**

```powershell
npx vitest run src/components/mobile/mobileLayoutContracts.test.ts
npm run lint
npm run build:frontend
```

Expected: PASS and build exit 0.

- [ ] **Step 4: Commit**

```powershell
git add src/components/Dashboard.tsx src/components/mobile/mobileLayoutContracts.test.ts
git commit -m "feat: adapt dashboard for phones"
```

---

### Task 6: Adapt Field Monitoring and Field Management

**Files:**

- Modify: `src/components/FieldMonitoring.tsx`
- Modify: `src/components/FieldManagement.tsx`
- Test: `src/components/mobile/mobileLayoutContracts.test.ts`

- [ ] **Step 1: Add failing source contracts**

Add tests that require:

```ts
expect(read('src/components/FieldMonitoring.tsx'))
  .toContain('id="monitoring-trends"');
expect(read('src/components/FieldMonitoring.tsx'))
  .toContain('grid-cols-2 sm:grid-cols-3');
expect(read('src/components/FieldManagement.tsx'))
  .toContain('id="management-fields"');
expect(read('src/components/FieldManagement.tsx'))
  .toContain('grid-cols-1 sm:grid-cols-2 md:grid-cols-4');
```

Run the focused test and confirm FAIL.

- [ ] **Step 2: Refactor monitoring**

Apply these changes:

- Page-level gaps: `gap-6` → `gap-4 sm:gap-6`.
- Three-value phone grids: `grid-cols-3` → `grid-cols-2 sm:grid-cols-3`.
- Header actions: use `flex-col sm:flex-row`, `w-full sm:w-auto`, and 44px minimum button height.
- Chart legends: wrap or use `.mobile-scroll-row`; never allow them to widen the page.
- Detail panels and modals: phone `inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl`, desktop existing centered layout at `sm:` or `lg:`.
- Add anchors `monitoring-trends`, `monitoring-devices`, and `monitoring-alerts` to the existing matching sections.

- [ ] **Step 3: Refactor field management**

Apply these changes:

- Root: `gap-6 h-full` → `gap-4 sm:gap-6 min-h-full`.
- Top grids: `grid-cols-2 md:grid-cols-4` → `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` when cards contain labels and controls.
- Preserve compact metric-only grids as two columns on phones.
- Convert field action headers to `flex-col sm:flex-row`.
- Make search, filter, and primary-action controls `w-full sm:w-auto`.
- Use bottom sheets for phone details and forms, with `max-h-[90dvh] overflow-y-auto`.
- Add anchors `management-fields`, `management-map`, `management-operations`, and `management-archive`.

- [ ] **Step 4: Run verification**

```powershell
npx vitest run src/components/mobile/mobileLayoutContracts.test.ts
npm run lint
npm run build:frontend
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/FieldMonitoring.tsx src/components/FieldManagement.tsx src/components/mobile/mobileLayoutContracts.test.ts
git commit -m "feat: adapt field workflows for mobile"
```

---

### Task 7: Adapt AI Recognition and Responsive Record Tables

**Files:**

- Modify: `src/components/AIRecognition.tsx`
- Modify: `src/index.css`
- Test: `src/components/mobile/mobileLayoutContracts.test.ts`

- [ ] **Step 1: Add a failing AI layout contract**

Require:

```ts
const ai = read('src/components/AIRecognition.tsx');
expect(ai).toContain('id="ai-capture"');
expect(ai).toContain('data-mobile-table');
expect(ai).toContain('data-label=');
```

Run the test and confirm FAIL.

- [ ] **Step 2: Convert AI to a mobile vertical workflow**

- Add `px-0 sm:px-4` to the page wrapper.
- Use single-column phone layout for capture, upload, and results; keep existing `lg:grid-cols-12`.
- Add anchors `ai-capture`, `ai-upload`, `ai-results`, and `ai-history`.
- Mark history tables with `data-mobile-table`.
- Add a `data-label` matching the visible column heading to every history `<td>`.
- Keep image comparison controls at least 44px and support pointer/touch events.
- Make result modals full-screen on phones and retain existing desktop maximum width.

- [ ] **Step 3: Add scoped responsive-table CSS**

Add to `src/index.css`:

```css
@media (max-width: 767px) {
  [data-mobile-table] thead {
    display: none;
  }

  [data-mobile-table],
  [data-mobile-table] tbody,
  [data-mobile-table] tr,
  [data-mobile-table] td {
    display: block;
    width: 100%;
  }

  [data-mobile-table] tr {
    margin-bottom: 0.75rem;
    overflow: hidden;
    border: 1px solid rgb(226 232 240);
    border-radius: 1rem;
    background: white;
  }

  [data-mobile-table] td {
    display: grid;
    grid-template-columns: minmax(5.5rem, 40%) 1fr;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
  }

  [data-mobile-table] td::before {
    content: attr(data-label);
    color: rgb(100 116 139);
    font-size: 0.75rem;
    font-weight: 700;
  }
}
```

Add equivalent dark-mode borders/backgrounds using the project’s existing dark selectors.

- [ ] **Step 4: Verify and commit**

```powershell
npx vitest run src/components/mobile/mobileLayoutContracts.test.ts
npm run lint
npm run build:frontend
git add src/components/AIRecognition.tsx src/index.css src/components/mobile/mobileLayoutContracts.test.ts
git commit -m "feat: adapt AI recognition for touch screens"
```

---

### Task 8: Adapt Knowledge Base and News Without Overwriting User Changes

**Files:**

- Modify carefully: `src/components/KnowledgeBase.tsx`
- Modify carefully: `src/components/NewsModule.tsx`
- Test: `src/components/mobile/mobileLayoutContracts.test.ts`

- [ ] **Step 1: Capture current user diffs**

Run and save the output in the task log:

```powershell
git diff -- src/components/KnowledgeBase.tsx src/components/NewsModule.tsx
```

Expected baseline: Knowledge Base has 4 added and 4 removed lines; News has 5 added and 12 removed lines.

- [ ] **Step 2: Add failing contracts**

Require:

```ts
expect(read('src/components/KnowledgeBase.tsx'))
  .toContain('grid-cols-1 min-[380px]:grid-cols-2');
expect(read('src/components/NewsModule.tsx'))
  .toContain('w-full sm:w-96 md:w-[420px]');
```

Run and confirm FAIL.

- [ ] **Step 3: Adapt knowledge pages**

- Use a one-column grid at 320–379px and two columns at 380px and above.
- Reduce phone card radius/padding and keep existing desktop values at `md:`.
- Make search/filter rows sticky and horizontally scrollable.
- Convert reader dialogs to full-screen on phones with a sticky close/back action.
- Keep the existing user modifications intact.

- [ ] **Step 4: Adapt news pages**

- Change the fixed drawer width from `w-96 md:w-[420px]` to `w-full sm:w-96 md:w-[420px]`.
- Use one column at 320–379px and two columns at 380px and above for news cards.
- Make the full-screen article header compact and sticky on phones.
- Ensure share/bookmark actions are 44px touch targets.
- Keep the existing user modifications intact.

- [ ] **Step 5: Compare diffs before and after**

Run:

```powershell
git diff -- src/components/KnowledgeBase.tsx src/components/NewsModule.tsx
```

Expected: the original user hunks are still present plus clearly separated responsive hunks.

- [ ] **Step 6: Verify without staging these dirty files**

```powershell
npx vitest run src/components/mobile/mobileLayoutContracts.test.ts
npm run lint
npm run build:frontend
```

Do not commit these two files unless the pre-existing user hunks can be excluded from staging. Leave them as working-tree changes otherwise.

---

### Task 9: Adapt Market, Feedback, Settings, Calendar, and Floating Tools

**Files:**

- Modify: `src/components/ServiceMarket.tsx`
- Modify: `src/components/Feedback.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/FarmCalendar.tsx`
- Modify: `src/components/AIAssistant.tsx`
- Modify: `src/components/ShortcutFloatingCard.tsx`
- Test: `src/components/mobile/mobileLayoutContracts.test.ts`

- [ ] **Step 1: Add failing contracts**

Require:

```ts
expect(read('src/components/ServiceMarket.tsx')).toContain('p-3 sm:p-6');
expect(read('src/components/Feedback.tsx')).toContain('p-3 sm:p-6');
expect(read('src/components/SettingsModal.tsx')).toContain('h-[100dvh] md:h-auto');
expect(read('src/components/FarmCalendar.tsx')).toContain('max-h-[100dvh]');
expect(read('src/components/AIAssistant.tsx')).toContain('inset-x-0 bottom-0');
```

Run and confirm FAIL.

- [ ] **Step 2: Apply focused mobile changes**

- `ServiceMarket`: phone padding `p-3 sm:p-6`; pricing grid single-column on phones; purchase modal full-screen below `sm`.
- `Feedback`: phone padding `p-3 sm:p-6`; category choices two columns on phones; screenshot uploader full width; history single-column.
- `SettingsModal`: phone `inset-0 h-[100dvh] w-full rounded-none`, desktop existing centered `md:h-auto md:max-w-4xl md:rounded-[...]`; section selector becomes horizontal tabs.
- `FarmCalendar`: full-screen phone calendar, compact weekday cells, event detail below the calendar, event editor scrollable within `max-h-[100dvh]`.
- `AIAssistant`: phone bottom sheet at `inset-x-0 bottom-0`, `max-h-[85dvh]`, full width, desktop retains bottom-right floating card at `md:`.
- `ShortcutFloatingCard`: use `w-[calc(100vw-1.5rem)] max-w-[340px]`, safe-area bottom offset, and clamp its drag bounds to the viewport.

- [ ] **Step 3: Verify and commit**

```powershell
npx vitest run src/components/mobile/mobileLayoutContracts.test.ts
npm run lint
npm run build:frontend
git add src/components/ServiceMarket.tsx src/components/Feedback.tsx src/components/SettingsModal.tsx src/components/FarmCalendar.tsx src/components/AIAssistant.tsx src/components/ShortcutFloatingCard.tsx src/components/mobile/mobileLayoutContracts.test.ts
git commit -m "feat: adapt secondary modules for mobile"
```

---

### Task 10: Complete Cross-Module Accessibility and Overflow Audit

**Files:**

- Modify only where audit failures occur: files listed above
- Test: `src/components/mobile/mobileLayoutContracts.test.ts`

- [ ] **Step 1: Add failing source-audit checks**

Add tests that scan modified modules and reject newly introduced phone-unsafe patterns:

```ts
it('does not introduce fixed modal widths without a phone fallback', () => {
  const files = [
    'src/components/AIRecognition.tsx',
    'src/components/ServiceMarket.tsx',
    'src/components/SettingsModal.tsx',
    'src/components/FarmCalendar.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    expect(source).not.toMatch(/className="[^"]*\bw-\[(?:4|5|6|7|8|9)\d{2}px\][^"]*"/);
  }
});
```

Run and inspect any expected failures.

- [ ] **Step 2: Audit interactive controls**

For every phone-visible icon-only button:

- add `aria-label`;
- ensure `min-h-11 min-w-11` or an equivalent 44px target;
- provide visible focus styles;
- replace hover-only reveal with click/tap access;
- add `aria-current` to navigation/tabs and `aria-expanded` to expandable controls.

- [ ] **Step 3: Audit overflow and text**

- Replace unsafe fixed widths with `w-full`, `max-w-full`, or breakpoint-scoped widths.
- Add `min-w-0` to flex/grid children containing long text.
- Use `break-words`, `line-clamp-*`, or `truncate` according to the content type.
- Keep intended horizontal scrolling inside `.mobile-scroll-row`.
- Verify modals use `dvh`, internal scrolling, and safe-area padding.

- [ ] **Step 4: Run full automated verification**

```powershell
npm test
npm run lint
npm run build
```

Expected: all exit 0 with zero failed tests.

- [ ] **Step 5: Commit only clean audit files**

Stage only files that do not contain pre-existing user hunks:

```powershell
git add src/App.tsx src/index.css src/components/mobile src/components/Dashboard.tsx src/components/FieldMonitoring.tsx src/components/FieldManagement.tsx src/components/AIRecognition.tsx src/components/ServiceMarket.tsx src/components/Feedback.tsx src/components/SettingsModal.tsx src/components/FarmCalendar.tsx src/components/AIAssistant.tsx src/components/ShortcutFloatingCard.tsx
git commit -m "fix: complete mobile accessibility audit"
```

If there are no unstaged implementation hunks in these files, skip the empty commit.

---

### Task 11: Verify Every Target Width and Desktop Preservation

**Files:**

- Create: `docs/superpowers/reports/2026-07-28-mobile-responsive-verification.md`

- [ ] **Step 1: Start the application**

Run:

```powershell
npm run dev
```

Expected: the local application starts without runtime errors.

- [ ] **Step 2: Run the module checklist at phone widths**

At 320px, 375px, 390px, and 430px:

- open Dashboard, Monitoring, Field Management, AI Recognition, Knowledge Base, News, Service Market, Feedback, Settings, Calendar, Notifications, Weather, and the 3D entry;
- verify scrolling, search/filter, details, forms, upload entry, dialogs, close/back, and bottom navigation;
- verify no page-level horizontal overflow;
- verify bottom navigation and virtual-keyboard-safe actions.

- [ ] **Step 3: Verify tablet and desktop boundaries**

At 768px:

- verify drawer navigation and tablet content columns.

At 1024px and 1440px:

- compare the sidebar, top header, card columns, 3D entry, weather, search, and shortcuts with the pre-change desktop layout;
- treat any visual or interaction change as a regression.

- [ ] **Step 4: Verify themes, languages, and roles**

Repeat representative flows for:

- light and dark themes;
- Chinese and English;
- administrator, agricultural expert, and normal user.

- [ ] **Step 5: Write the verification report**

Create `docs/superpowers/reports/2026-07-28-mobile-responsive-verification.md` containing:

```md
# Mobile Responsive Verification Report

## Automated checks
- `npm test`: Not run
- `npm run lint`: Not run
- `npm run build`: Not run

## Viewport matrix
| Width | Shell | Modules checked | Overflow | Result |
|---|---|---|---|---|
| 320 | Mobile A | Not run | Not run | Not run |
| 375 | Mobile A | Not run | Not run | Not run |
| 390 | Mobile A | Not run | Not run | Not run |
| 430 | Mobile A | Not run | Not run | Not run |
| 768 | Tablet drawer | Not run | Not run | Not run |
| 1024 | Existing desktop | Not run | Not run | Not run |
| 1440 | Existing desktop | Not run | Not run | Not run |

## Theme, locale, and role coverage
Not run.

## Known limitations
None recorded before execution.
```

After the checks, replace every “Not run” entry with observed evidence and update known limitations truthfully. Do not leave pre-execution values in the final report.

- [ ] **Step 6: Run final fresh verification**

Run:

```powershell
npm test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: tests, type checking, and build exit 0; `git diff --check` reports no whitespace errors; status lists only intended implementation files plus the three preserved user-modified files.

- [ ] **Step 7: Commit the report only**

```powershell
git add docs/superpowers/reports/2026-07-28-mobile-responsive-verification.md
git commit -m "docs: record mobile responsive verification"
```

Do not stage `src/lib/utils.ts`. Do not stage pre-existing user hunks from `KnowledgeBase.tsx` or `NewsModule.tsx`.
