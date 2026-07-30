// @vitest-environment jsdom

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

    expect(screen.getByRole('button', { name: '知识库' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '服务市场' })).toBeNull();
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

  it('keeps mobile chrome scoped below the md breakpoint', () => {
    render(
      <MobileBottomNav
        activeTab="dashboard"
        items={items}
        onNavigate={() => undefined}
        onOpenMore={() => undefined}
      />,
    );

    expect(screen.getByRole('navigation', { name: '手机端主导航' }).className)
      .toContain('md:hidden');
  });
});
