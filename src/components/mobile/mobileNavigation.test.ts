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
