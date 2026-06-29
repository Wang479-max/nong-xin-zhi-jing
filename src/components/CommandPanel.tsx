import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  LayoutDashboard, 
  Activity, 
  Map as MapIcon, 
  Scan, 
  BookOpen, 
  Newspaper, 
  Settings, 
  ChevronRight, 
  Sparkles, 
  Compass, 
  Sun, 
  Moon, 
  Columns, 
  Bell, 
  ArrowRight,
  Loader2,
  Command
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import DataService from '../services/dataService';

interface CommandPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string, query?: string) => void;
  triggerThemeToggle: () => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (val: boolean) => void;
}

interface FlattenedItem {
  id: string;
  category: 'page' | 'action' | 'plot' | 'knowledge';
  categoryLabel: string;
  title: string;
  subtitle?: string;
  icon: any;
  action: () => void;
}

export default function CommandPanel({
  isOpen,
  onClose,
  onNavigate,
  triggerThemeToggle,
  isSidebarCollapsed,
  setIsSidebarCollapsed
}: CommandPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Plots & Knowledge search results state
  const [allPlots, setAllPlots] = useState<any[]>([]);
  const [liveKnowledge, setLiveKnowledge] = useState<any[]>([]);
  const [isKnowledgeLoading, setIsKnowledgeLoading] = useState(false);

  // Sync native dialog state with prop
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      setQuery('');
      setSelectedIndex(0);
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  // Load plots on mount / when open
  useEffect(() => {
    if (isOpen) {
      DataService.getPlots().then(plots => {
        if (Array.isArray(plots)) {
          setAllPlots(plots);
        }
      }).catch(err => {
        console.warn('CommandPanel failing to fetch plots:', err);
      });
    }
  }, [isOpen]);

  // Knowledge search with 300ms debounce
  useEffect(() => {
    if (!query.trim()) {
      setLiveKnowledge([]);
      return;
    }

    setIsKnowledgeLoading(true);
    const delayTimer = setTimeout(async () => {
      try {
        const data = await DataService.searchKnowledge(query);
        if (data && Array.isArray(data.localResults)) {
          setLiveKnowledge(data.localResults.slice(0, 3));
        } else {
          setLiveKnowledge([]);
        }
      } catch (e) {
        console.warn('Knowledge live search failed:', e);
        setLiveKnowledge([]);
      } finally {
        setIsKnowledgeLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayTimer);
  }, [query]);

  // Handle outside click or Escape close
  const handleNativeClose = () => {
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  // Define Pages list
  const pagesData = useMemo(() => [
    { id: 'dashboard', title: '全景大盘 (Dashboard)', keywords: ['首页', '概览', '仪表盘', '看板', 'dashboard', 'shouye'], icon: LayoutDashboard, route: 'dashboard' },
    { id: 'monitoring', title: '物联网环境监测 (Monitoring)', keywords: ['环境', '监测', '传感器', '数据', '实时', 'monitoring', 'jiance'], icon: Activity, route: 'monitoring' },
    { id: 'management', title: '地块管理与数字孪生 (Management)', keywords: ['地块', '农田', '管理', '3d', '三维', '数字孪生', 'fields', 'management', 'dikuai'], icon: MapIcon, route: 'management' },
    { id: 'ai', title: 'AI 视觉病虫害诊疗 (AIRecognition)', keywords: ['ai', '诊断', '识别', '病虫害', '拍照', 'visual', 'ai'], icon: Scan, route: 'ai' },
    { id: 'knowledge', title: '科普中国 & 农技智库 (Knowledge)', keywords: ['知识', '智库', '百科', '技术', '经验', 'knowledge', 'zhishi'], icon: BookOpen, route: 'knowledge' },
    { id: 'news', title: '惠农政策与时政资讯 (News)', keywords: ['资讯', '新闻', '政策', '公告', 'news', 'xinwen'], icon: Newspaper, route: 'news' }
  ], []);

  // Define Actions list
  const actionsData = useMemo(() => [
    {
      id: 'action_ai',
      title: '召唤 AI 智能助手',
      subtitle: '直接对话 AI 解决农技与策略疑惑',
      icon: Sparkles,
      action: () => {
        onClose();
        window.dispatchEvent(new CustomEvent('toggle-ai-assistant'));
      }
    },
    {
      id: 'action_tour',
      title: '启动新手自学导引录 (Interactive Guide)',
      subtitle: '一步步熟悉无人园区终端操作说明',
      icon: Compass,
      action: () => {
        onClose();
        // Delay slightly to let panel close transition finish
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('start-onboarding-tour'));
        }, 300);
      }
    },
    {
      id: 'action_theme',
      title: '切换系统视觉主题 (Light/Dark Theme)',
      subtitle: '在雅致白与晶耀黑之间极速切换',
      icon: Sun,
      action: () => {
        onClose();
        triggerThemeToggle();
      }
    },
    {
      id: 'action_sidebar',
      title: '展开/收起左侧边栏 (Sidebar Collapsible)',
      subtitle: `当前状态为: ${isSidebarCollapsed ? '已折叠' : '展开中'}`,
      icon: Columns,
      action: () => {
        onClose();
        setIsSidebarCollapsed(!isSidebarCollapsed);
      }
    },
    {
      id: 'action_settings',
      title: '配置中心 (Settings Workspace)',
      subtitle: '个性化设定、阿里/智谱大模型密钥等',
      icon: Settings,
      action: () => {
        onClose();
        (window as any).openSettings?.();
      }
    }
  ], [isSidebarCollapsed, setIsSidebarCollapsed, triggerThemeToggle, onClose]);

  // Compute filtered items flatly
  const flattenedItems = useMemo(() => {
    const list: FlattenedItem[] = [];
    const q = (query || '').toLowerCase().trim();

    // 1. Pages
    const filteredPages = pagesData.filter(p => 
      !q ||
      (p.title || '').toLowerCase().includes(q) ||
      p.keywords.some(k => k.includes(q))
    );
    filteredPages.forEach(p => {
      list.push({
        id: `page_${p.id}`,
        category: 'page',
        categoryLabel: '系统模块',
        title: p.title,
        icon: p.icon,
        action: () => {
          onClose();
          onNavigate(p.route);
        }
      });
    });

    // 2. Actions
    const filteredActions = actionsData.filter(a =>
      !q ||
      (a.title || '').toLowerCase().includes(q) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(q))
    );
    filteredActions.forEach(a => {
      list.push({
        id: `action_${a.id}`,
        category: 'action',
        categoryLabel: '操作指令',
        title: a.title,
        subtitle: a.subtitle,
        icon: a.icon,
        action: a.action
      });
    });

    // 3. Plots
    const filteredPlots = allPlots.filter(p =>
      !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.crop || '').toLowerCase().includes(q)
    );
    filteredPlots.forEach(p => {
      list.push({
        id: `plot_${p.id}`,
        category: 'plot',
        categoryLabel: '快速定位地块',
        title: p.name,
        subtitle: `智能监测：作物 [${p.crop}] · 点击跳转查看`,
        icon: MapIcon,
        action: () => {
          onClose();
          onNavigate('monitoring', p.id);
        }
      });
    });

    // 4. Knowledge base results (asynchronously searched)
    liveKnowledge.forEach((k, idx) => {
      list.push({
        id: `knowledge_${idx}`,
        category: 'knowledge',
        categoryLabel: '实时智库搜索结果',
        title: k.title,
        subtitle: k.summary || k.category,
        icon: BookOpen,
        action: () => {
          onClose();
          onNavigate('knowledge', k.title || k.name);
        }
      });
    });

    return list;
  }, [query, pagesData, actionsData, allPlots, liveKnowledge, onNavigate, onClose]);

  // Adjust selection wrap-around
  useEffect(() => {
    if (selectedIndex >= flattenedItems.length) {
      setSelectedIndex(Math.max(0, flattenedItems.length - 1));
    }
  }, [flattenedItems, selectedIndex]);

  // Keyboard controls inside search box
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % flattenedItems.length);
      scrollSelectedIntoView(selectedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + flattenedItems.length) % flattenedItems.length);
      scrollSelectedIntoView(selectedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flattenedItems[selectedIndex]) {
        flattenedItems[selectedIndex].action();
      }
    }
  };

  const scrollSelectedIntoView = (index: number) => {
    // Slight delay to ensure elements render or state propagates if active
    setTimeout(() => {
      const container = listContainerRef.current;
      const target = container?.querySelector(`[data-index="${index}"]`);
      if (container && target) {
        const cHeight = container.clientHeight;
        const cScrollTop = container.scrollTop;
        const eOffsetTop = (target as HTMLElement).offsetTop;
        const eHeight = (target as HTMLElement).clientHeight;

        if (eOffsetTop < cScrollTop) {
          container.scrollTop = eOffsetTop;
        } else if (eOffsetTop + eHeight > cScrollTop + cHeight) {
          container.scrollTop = eOffsetTop + eHeight - cHeight;
        }
      }
    }, 10);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      className={cn(
        "bg-transparent backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm",
        "p-0 m-auto max-w-2xl w-full border-none outline-none overflow-hidden duration-300 transform scale-100 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.25)] dark:shadow-none"
      )}
    >
      <div 
        className={cn(
          "bg-white/95 dark:bg-[#0C0F19]/95 backdrop-blur-3xl rounded-[2.5rem] border border-slate-200/50 dark:border-white/10 overflow-hidden flex flex-col max-h-[550px] transition-all"
        )}
      >
        {/* Search header area */}
        <div className="flex items-center gap-4 px-6 py-4.5 border-b border-slate-100 dark:border-white/5 relative z-10 bg-slate-50/40 dark:bg-black/20">
          <Search size={20} className="text-slate-400 group-focus-within:text-emerald-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="键入关键字模糊过滤... (如: 地块, or, 施肥)"
            className="w-full bg-transparent border-none outline-none font-bold text-[14px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 py-1"
            autoFocus
          />
          <div className="flex items-center gap-1 shrink-0">
            {isKnowledgeLoading && <Loader2 size={16} className="animate-spin text-emerald-500" />}
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2.5 py-1 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/10 flex items-center gap-1 shadow-sm">
              <Command size={10} /> + K
            </span>
          </div>
        </div>

        {/* Scrollable list */}
        <div 
          ref={listContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar max-h-[380px]"
        >
          {flattenedItems.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-sm">
                <Search size={24} className="text-slate-300 dark:text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">未找到相关指令或地块</p>
                <p className="text-[10px] text-slate-400/70 dark:text-slate-500 mt-1 uppercase tracking-widest">请尝试其它搜索策略</p>
              </div>
            </div>
          ) : (
            <div>
              {/* Grouped rendering for beautiful VS Code structure */}
              {Array.from(new Set(flattenedItems.map(item => item.categoryLabel))).map(categoryLabel => {
                const categoryItems = flattenedItems.filter(item => item.categoryLabel === categoryLabel);
                
                return (
                  <div key={categoryLabel} className="mb-4">
                    <h5 className="px-4 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      {categoryLabel}
                    </h5>
                    <div className="space-y-1">
                      {categoryItems.map(item => {
                        const globalIndex = flattenedItems.indexOf(item);
                        const isSelected = globalIndex === selectedIndex;
                        const Icon = item.icon;

                        return (
                          <div
                            key={item.id}
                            data-index={globalIndex}
                            onClick={() => {
                              setSelectedIndex(globalIndex);
                              item.action();
                            }}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={cn(
                              "w-full flex items-center gap-4 px-4 py-3 rounded-2xl cursor-pointer transition-all border",
                              isSelected 
                                ? "bg-emerald-500 text-white border-transparent shadow-lg shadow-emerald-500/10 scale-[1.01]" 
                                : "bg-transparent text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-50/50 dark:hover:bg-white/5"
                            )}
                          >
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center",
                              isSelected ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-[#1A1A1A] text-slate-400 dark:text-slate-500"
                            )}>
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black truncate">{item.title}</p>
                              {item.subtitle && (
                                <p className={cn(
                                  "text-[10px] mt-0.5 truncate font-bold",
                                  isSelected ? "text-white/80" : "text-slate-400 dark:text-slate-500"
                                )}>
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {isSelected && (
                                <span className="text-[8px] font-black tracking-widest bg-white/20 px-2 py-0.5 rounded-md uppercase">
                                  确认 ↵
                                </span>
                              )}
                              <ChevronRight 
                                size={14} 
                                className={cn(
                                  "transition-all",
                                  isSelected ? "text-white scale-110 translate-x-0.5" : "text-slate-300 dark:text-slate-700"
                                )} 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="p-4 bg-slate-50/50 dark:bg-black/30 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest px-6">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 rounded shadow-sm text-[9px]">↑↓</kbd> 导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 rounded shadow-sm text-[9px]">↵</kbd> 执行
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 rounded shadow-sm text-[9px]">ESC</kbd> 智能收起
            </span>
          </div>
          <div className="text-[9px] font-black text-emerald-500">农芯极速中枢大厅</div>
        </div>
      </div>
    </dialog>
  );
}
