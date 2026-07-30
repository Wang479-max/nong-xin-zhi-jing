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
