import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { MobileSection } from './mobileNavigation';
import MobileBottomNav from './MobileBottomNav';
import MobileMoreSheet from './MobileMoreSheet';
import MobileSectionTabs from './MobileSectionTabs';
import MobileTopBar from './MobileTopBar';

type NavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type MobileAppChromeProps = {
  activeTab: string;
  title: string;
  primaryItems: NavigationItem[];
  secondaryItems: NavigationItem[];
  sections: MobileSection[];
  search: ReactNode;
  onCalendar: () => void;
  onNotifications: () => void;
  onWeather: () => void;
  unreadCount: number;
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
  onCalendar,
  onNotifications,
  onWeather,
  unreadCount,
  onNavigate,
  onSectionSelect,
  onSettings,
  onLogout,
}: MobileAppChromeProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <MobileTopBar title={title} search={search} onCalendar={onCalendar} onAccount={onSettings} />
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
        onNotifications={onNotifications}
        onWeather={onWeather}
        unreadCount={unreadCount}
        onSettings={onSettings}
        onLogout={onLogout}
      />
    </>
  );
}
