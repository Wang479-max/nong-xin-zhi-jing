import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Scan, 
  BookOpen, 
  Newspaper, 
  Settings, 
  LogOut, 
  Bell, 
  User, 
  CloudSun,
  ArrowRight,
  Menu,
  ChevronLeft,
  Search,
  TrendingUp,
  CloudRain,
  Sun,
  AlertCircle,
  AlertTriangle,
  Info,
  MessageSquare,
  Cloud,
  CloudLightning,
  CloudSnow,
  CloudFog,
  CloudDrizzle,
  X,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trophy,
  MapPin,
  Minus,
  Square,
  Monitor,
  Globe,
  Calendar,
  Compass,
  HelpCircle,
  Maximize,
  ShoppingBag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import DataService from './services/dataService';
import OnboardingTour from './components/OnboardingTour';

// Import modules
import FieldMonitoring from './components/FieldMonitoring';
import FieldManagement from './components/FieldManagement';
import AIRecognition from './components/AIRecognition';
import KnowledgeBase from './components/KnowledgeBase';
import NewsModule from './components/NewsModule';
import Feedback from './components/Feedback';
import AIAssistant from './components/AIAssistant';
import Dashboard from './components/Dashboard';
import InteractiveCenter from './components/dashboard/InteractiveCenter';
import DigitalTwin from './components/DigitalTwin';
import ServiceMarket from './components/ServiceMarket';
import SettingsModal from './components/SettingsModal';
import { ToastContainer } from './components/ToastContainer';
import Auth from './components/Auth';
import UserNoticeModal from './components/UserNoticeModal';
import FarmCalendarWidget from './components/FarmCalendar';
import { useHotkeys } from './hooks/useHotkeys';
import CommandPanel from './components/CommandPanel';
import ShortcutHelpPanel from './components/ShortcutHelpPanel';
import ShortcutFloatingCard from './components/ShortcutFloatingCard';

// --- Components ---

const GlobalSearch = ({ onNavigate, user }: { onNavigate: (tab: string, query?: string) => void, user: any }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    features: any[],
    plots: any[],
    knowledge: any[]
  }>({ features: [], plots: [], knowledge: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const FEATURES = [
    { id: 'dashboard', label: t('app.dashboard'), icon: LayoutDashboard, keywords: ['首页', '概览', '看板', 'dashboard'] },
    { id: 'monitoring', label: t('app.monitoring'), icon: Activity, keywords: ['监测', '环境', '数据', '传感器', 'monitoring'] },
    { id: 'management', label: t('app.management'), icon: MapIcon, keywords: ['地块', '农田', '管理', 'fields'] },
    { id: 'ai', label: t('app.ai'), icon: Scan, keywords: ['ai', '诊断', '识别', '病虫害'] },
    { id: 'knowledge', label: t('app.knowledge'), icon: BookOpen, keywords: ['知识', '智库', '技术', '百科', 'knowledge'] },
    { id: 'news', label: t('app.news'), icon: Newspaper, keywords: ['资讯', '新闻', '政策', '行情', 'news'] },
    { id: 'feedback', label: t('app.feedback'), icon: MessageSquare, keywords: ['反馈', '建议', '问题', 'feedback'] },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setResults({ features: [], plots: [], knowledge: [] });
        setShowResults(false);
        return;
      }

      setIsSearching(true);
      setShowResults(true);

      const q = (query || '').toLowerCase();

      // 1. Search Features
      const matchedFeatures = FEATURES.filter(f => 
        (f.label || '').toLowerCase().includes(q) || 
        f.keywords.some(k => k.includes(q))
      );

      try {
        // 2. Search Plots & Knowledge in parallel
        const [plots, knowledgeData] = await Promise.all([
          DataService.getPlots(user?.username),
          DataService.searchKnowledge(query).catch(() => ({ localResults: [] }))
        ]);

        const matchedPlots = plots.filter((p: any) => 
          (p.name || '').toLowerCase().includes(q) || 
          (p.crop || '').toLowerCase().includes(q)
        );

        setResults({
          features: matchedFeatures,
          plots: matchedPlots,
          knowledge: Array.isArray(knowledgeData.localResults) ? knowledgeData.localResults.slice(0, 3) : []
        });
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, user]);

  const handleSelect = useCallback((type: string, item: any) => {
    setShowResults(false);
    setQuery('');
    
    if (type === 'feature') {
      onNavigate(item.id);
    } else if (type === 'plot') {
      onNavigate('monitoring', item.id);
    } else if (type === 'knowledge') {
      onNavigate('knowledge', item.title || item.name);
    }
  }, [onNavigate]);

  const hasResults = results.features.length > 0 || results.plots.length > 0 || results.knowledge.length > 0;

  return (
    <div ref={searchRef} className="relative z-[100]">
      <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-[#1A1A1A] rounded-2xl border border-slate-100 dark:border-white/5 focus-within:border-forest-green dark:focus-within:border-emerald-500/50 focus-within:bg-white dark:focus-within:bg-[#2A2A2A] transition-all w-64 lg:w-80 shadow-sm">
        <Search size={16} className={cn("text-slate-400 transition-colors", query && "text-forest-green")} />
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setShowResults(true)}
          placeholder={t('app.searchPlaceholder')} 
          className="bg-transparent border-none outline-none text-xs flex-1 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 font-medium"
        />
        {isSearching && <Loader2 size={14} className="animate-spin text-forest-green" />}
        {query && !isSearching && (
          <button onClick={() => setQuery('')} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showResults && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 mt-3 w-[400px] bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-200/50 dark:border-white/10 overflow-hidden"
          >
            <div className="max-h-[500px] overflow-y-auto p-2 custom-scrollbar">
              {!isSearching && !hasResults ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Search size={24} className="text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-400">未找到相关结果</p>
                  <p className="text-[10px] text-slate-400/60 mt-1 uppercase tracking-widest">尝试搜索其他关键词</p>
                </div>
              ) : (
                <div className="space-y-4 p-2">
                  {/* Features */}
                  {results.features.length > 0 && (
                    <div>
                      <h4 className="px-3 py-1 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">功能入口</h4>
                      <div className="space-y-1">
                        {results.features.map(f => (
                          <button 
                            key={f.id}
                            onClick={() => handleSelect('feature', f)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 bg-forest-green/10 text-forest-green rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                              <f.icon size={16} />
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{f.label}</span>
                            <ChevronRight size={14} className="ml-auto text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Plots */}
                  {results.plots.length > 0 && (
                    <div>
                      <h4 className="px-3 py-1 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">地块数据</h4>
                      <div className="space-y-1">
                        {results.plots.map(p => (
                          <button 
                            key={p.id}
                            onClick={() => handleSelect('plot', p)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 bg-amber-500/10 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                              <MapIcon size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{p.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">作物: {p.crop}</p>
                            </div>
                            <ChevronRight size={14} className="ml-auto text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Knowledge */}
                  {results.knowledge.length > 0 && (
                    <div>
                      <h4 className="px-3 py-1 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">农事知识</h4>
                      <div className="space-y-1">
                        {results.knowledge.map((k, i) => (
                          <button 
                            key={i}
                            onClick={() => handleSelect('knowledge', k)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                              <BookOpen size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{k.title}</p>
                              <p className="text-[10px] text-slate-400 font-medium truncate">{k.summary || k.category}</p>
                            </div>
                            <ChevronRight size={14} className="ml-auto text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 bg-slate-50/50 dark:bg-[#1A1A1A]/50 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 rounded shadow-sm">ESC</kbd> 关闭</span>
                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 rounded shadow-sm">↵</kbd> 选择</span>
              </div>
              <div className="text-[10px] font-black text-forest-green uppercase tracking-widest">农芯智境 · 全局搜索</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DesktopTitleBar = ({ title }: { title: string }) => {
  const { t } = useTranslation();
  const isElectron = !!(window as any).electron;

  if (!isElectron) return null;

  const handleMinimize = () => {
    if (isElectron) (window as any).electron.minimize();
  };

  const handleMaximize = () => {
    if (isElectron) {
      (window as any).electron.maximize();
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  };

  const handleClose = () => {
    if (isElectron) {
      (window as any).electron.close();
    } else {
      window.close();
    }
  };

  return (
    <div className="h-8 bg-white dark:bg-[#0A0A0A] border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between px-4 select-none drag-region z-[100]">
      <div className="flex items-center gap-2">
        <MapIcon size={14} className="text-forest-green" />
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{title}</span>
      </div>
      
      <div className="flex items-center no-drag">
        <button 
          onClick={handleMinimize}
          className="w-10 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-colors"
        >
          <Minus size={14} />
        </button>
        <button 
          onClick={handleMaximize}
          className="w-10 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-colors"
        >
          <Square size={12} />
        </button>
        <button 
          onClick={handleClose}
          className="w-10 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white text-slate-500 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const StatusBar = ({ user }: { user: any }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'online' | 'syncing' | 'offline'>('online');
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus('syncing');
      setTimeout(() => setStatus('online'), 2000);
    }, 45000);
    
    const timeInterval = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, []);

  return (
    <div className="min-h-6 bg-white dark:bg-[#0A0A0A] border-t border-slate-200/50 dark:border-white/5 flex flex-col sm:flex-row flex-wrap items-center justify-center sm:justify-between px-4 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 select-none z-[100] gap-y-1">
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            status === 'online' ? "bg-emerald-500" : status === 'syncing' ? "bg-amber-500 animate-pulse" : "bg-red-500"
          )} />
          <span className="uppercase tracking-widest">{t('app.systemStatus')}: {status === 'online' ? t('app.online') : status === 'syncing' ? 'CRDT 数据同步中...' : '离线状态 (本地缓存)'}</span>
        </div>
        <div className="w-px h-3 bg-slate-200/50 dark:bg-white/5" />
        <div className="flex items-center gap-1.5 cursor-help" title="基于 CRDT 的无冲突同步架构，支持断网离线操作，联网后自动合并">
          <Monitor size={10} />
          <span className="uppercase tracking-widest">离线可用版本: v1.0.4-Sync</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
        <div className="flex items-center gap-1.5">
          <User size={10} />
          <span className="uppercase tracking-widest">{t('app.currentUser')}: {user?.username || '管理员'} ({user?.role || '高级专家'})</span>
        </div>
        <div className="w-px h-3 bg-slate-200/50 dark:bg-white/5" />
        <div className="flex items-center gap-1.5">
          <RefreshCw size={10} className={status === 'syncing' ? 'animate-spin' : ''} />
          <span className="uppercase tracking-widest">{t('app.lastUpdate')}: {time}</span>
        </div>
      </div>
    </div>
  );
};

const BrandArea = React.memo(() => (
  <div className="hidden lg:flex lg:w-1/2 bg-forest-green relative items-center justify-center p-12 text-white">
    <div className="absolute inset-0 opacity-20">
      <img 
        src="https://picsum.photos/seed/agri-tech/1200/800" 
        alt="Agriculture Background" 
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    </div>
    <div className="absolute inset-0 bg-gradient-to-br from-forest-green/80 to-emerald-green/40" />
    <div className="relative z-10 text-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center"
      >
        <div className="w-24 h-24 bg-white/10 backdrop-blur-xl rounded-[32px] flex items-center justify-center mb-8 border border-white/20 shadow-2xl animate-float">
          <div className="relative">
            <MapIcon size={48} className="text-white" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-harvest-gold rounded-full border-2 border-forest-green" />
          </div>
        </div>
        <h1 className="text-6xl font-black mb-4 tracking-tighter">农芯智境</h1>
        <div className="h-1 w-24 bg-harvest-gold mx-auto mb-6 rounded-full" />
        <p className="text-2xl opacity-90 font-medium tracking-widest uppercase">农芯智境平台</p>
        <p className="mt-4 text-white/60 text-sm font-bold tracking-[0.3em] uppercase">智绘农田 · 芯领未来</p>
      </motion.div>
    </div>
  </div>
));


// --- Components ---

import { NotificationProvider, useNotifications } from './context/NotificationContext';

const DigitalTwinWrapper = ({ user, activePlotId, onSelectPlot, onExit }: { user: any, activePlotId?: string, onSelectPlot: (id: string) => void, onExit: () => void }) => {
  const { addNotification } = useNotifications();
  const [plots, setPlots] = useState<any[]>([]);
  const [hardwareStatus, setHardwareStatus] = useState<Record<string, boolean>>({ irrigation: false, ventilation: true, heating: false, lighting: false });
  const [realtimeData, setRealtimeData] = useState<any>(null);

  useEffect(() => {
    if (user) {
      DataService.getPlots(user.username).then((plots) => {
        setPlots(plots);
        if (plots.length > 0) {
          const targetId = activePlotId || plots[0].id;
          DataService.getRealtimeData(targetId).then(data => {
            setRealtimeData(data);
          });
        }
      });
    }
  }, [user, activePlotId]);

  return (
    <DigitalTwin 
      plots={plots} 
      activePlotId={activePlotId || null}
      onSelectPlot={onSelectPlot}
      hardwareStatus={hardwareStatus}
      realtimeData={realtimeData}
      onControlHardware={(type: any, action?: 'on' | 'off', zone?: string) => {
        const key = zone ? `${type}_${zone}` : type;
        const currentState = hardwareStatus[key];
        const newState = action ? action === 'on' : !currentState;
        setHardwareStatus(prev => ({ ...prev, [key]: newState }));
        
        const baseDeviceName = type === 'irrigation' ? '高压智能旋转喷灌系统' : type === 'ventilation' ? '工业负压换气风机' : type === 'lighting' ? '补光调温光谱照灯' : '温控系统';
        const deviceName = zone ? `${zone}区${baseDeviceName}` : baseDeviceName;
        
        addNotification({
          title: '设备控制成功',
          message: `已${newState ? '开启' : '关闭'}${deviceName}。`,
          type: 'success'
        });
        
        DataService.addDashboardLog(`[ACTUATOR_CMD] 收到 3D 农场宏观操控指令：${newState ? '开启' : '关闭'} ${deviceName}`);
      }}
      onFertilize={() => {
        addNotification({
          title: '智能决策下发成功',
          message: '已根据当前土壤NPK状态和作物生长阶段，生成精准水肥配方，并下发至水肥一体机。',
          type: 'success'
        });
      }}
      onExit={onExit}
    />
  );
};

// --- Main App ---

export default function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const [appMode, setAppMode] = useState<'data' | '3d'>('data');
  const [hasOpened3D, setHasOpened3D] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') || 'dashboard';
    }
    return 'dashboard';
  });
  const [initialArticleId, setInitialArticleId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('articleId');
    }
    return null;
  });
  const [initialNewsId, setInitialNewsId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('newsId');
    }
    return null;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'notifications' | 'appearance' | 'security' | 'ai' | 'system' | 'shortcuts' | undefined>(undefined);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const [selectedPlotId, setSelectedPlotId] = useState<string | undefined>(undefined);
  const [navKey, setNavKey] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [hasAcceptedNotice, setHasAcceptedNotice] = useState(false);

  // Global overlay control for the Command Center (renders at App root)
  const [isInteractiveOpen, setIsInteractiveOpen] = useState(false);
  const [interactiveTab, setInteractiveTab] = useState('pest');

  // Shortcuts & Command Panels State
  const [isCommandPanelOpen, setIsCommandPanelOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);

  useEffect(() => {
    if (appMode === '3d') {
      setIsSidebarCollapsed(true);
      setHasOpened3D(true);
    } else {
      setIsSidebarCollapsed(false);
    }
  }, [appMode]);

  // 启动自愈：若上次因服务端短暂掉线而被锁定在离线演示模式，启动时探测一次，
  // 服务端已恢复则自动退出演示模式并刷新数据，避免“一直离线”。
  useEffect(() => {
    DataService.ensureOnlineOnStartup().then((online) => {
      if (online && DataService.isDemoMode() === false) {
        DataService.notify();
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleNavigateTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
      }
    };
    const handleSetAppMode = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setAppMode(customEvent.detail);
      }
    };
    window.addEventListener('navigateTab', handleNavigateTab);
    window.addEventListener('setAppMode', handleSetAppMode);
    return () => {
      window.removeEventListener('navigateTab', handleNavigateTab);
      window.removeEventListener('setAppMode', handleSetAppMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const tabInUrl = url.searchParams.get('tab');
      if (tabInUrl !== activeTab) {
        url.searchParams.set('tab', activeTab);
        // Clean up articleId and newsId if navigating away from respective tabs
        if (activeTab !== 'knowledge') {
          url.searchParams.delete('articleId');
          setInitialArticleId(null);
        }
        if (activeTab !== 'news') {
          url.searchParams.delete('newsId');
          setInitialNewsId(null);
        }
        window.history.pushState({}, '', url.toString());
      }
    }
  }, [activeTab]);

  useEffect(() => {
    const handleOpenInteractive = (e: any) => {
      const tab = e.detail?.tab || 'pest';
      setInteractiveTab(tab);
      setIsInteractiveOpen(true);
      // Auto-collapse sidebar when Command Center is active for standard clean full screen look
      setIsSidebarCollapsed(true);
    };
    window.addEventListener('open-interactive-center', handleOpenInteractive);
    return () => window.removeEventListener('open-interactive-center', handleOpenInteractive);
  }, []);

  const handleCloseInteractive = () => {
    setIsInteractiveOpen(false);
    // Auto-restore sidebar collapse state when closing the overlay
    setIsSidebarCollapsed(false);
  };

  const triggerThemeToggle = useCallback(() => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('nxzj_theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('nxzj_theme', 'dark');
    }
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Hook up event bus for command/shortcut panel
  useEffect(() => {
    const toggleCommand = () => setIsCommandPanelOpen(prev => !prev);
    const openCommand = () => setIsCommandPanelOpen(true);
    const closeCommand = () => setIsCommandPanelOpen(false);

    const toggleHelp = () => setIsHelpPanelOpen(prev => !prev);
    const openHelp = () => setIsHelpPanelOpen(true);
    const closeHelp = () => setIsHelpPanelOpen(false);

    window.addEventListener('toggle-command-panel', toggleCommand);
    window.addEventListener('open-command-panel', openCommand);
    window.addEventListener('close-command-panel', closeCommand);

    window.addEventListener('toggle-shortcut-panel', toggleHelp);
    window.addEventListener('open-shortcut-panel', openHelp);
    window.addEventListener('close-shortcut-panel', closeHelp);

    return () => {
      window.removeEventListener('toggle-command-panel', toggleCommand);
      window.removeEventListener('open-command-panel', openCommand);
      window.removeEventListener('close-command-panel', closeCommand);

      window.removeEventListener('toggle-shortcut-panel', toggleHelp);
      window.removeEventListener('open-shortcut-panel', openHelp);
      window.removeEventListener('close-shortcut-panel', closeHelp);
    };
  }, []);

  // Hook up global Hotkeys with priority smart ESC close chain
  useHotkeys({
    'ctrl+k': () => {
      setIsCommandPanelOpen(prev => !prev);
    },
    'ctrl+/': () => {
      setIsHelpPanelOpen(prev => !prev);
    },
    'ctrl+b': () => {
      setIsSidebarCollapsed(prev => !prev);
    },
    'ctrl+d': () => {
      triggerThemeToggle();
    },
    'ctrl+1': () => {
      handleNavigate('dashboard');
    },
    'ctrl+2': () => {
      handleNavigate('monitoring');
    },
    'ctrl+3': () => {
      handleNavigate('management');
    },
    'ctrl+4': () => {
      handleNavigate('ai');
    },
    'ctrl+5': () => {
      handleNavigate('knowledge');
    },
    'ctrl+6': () => {
      handleNavigate('news');
    },
    'f1': () => {
      window.dispatchEvent(new CustomEvent('toggle-ai-assistant'));
    },
    'f2': () => {
      handleNavigate('management');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('set-view-mode-3d'));
      }, 150);
    },
    'esc': () => {
      if ((window as any).isAIAssistantOpen) {
        window.dispatchEvent(new CustomEvent('close-ai-assistant'));
      } else if (isInteractiveOpen) {
        handleCloseInteractive();
      } else if (isSettingsOpen) {
        setIsSettingsOpen(false);
        setSettingsTab(undefined);
      } else if (isCommandPanelOpen) {
        setIsCommandPanelOpen(false);
      } else if (isHelpPanelOpen) {
        setIsHelpPanelOpen(false);
      } else if (showWeatherModal) {
        setShowWeatherModal(false);
      } else if (showNotifications) {
        setShowNotifications(false);
      }
    }
  }, [
    isInteractiveOpen,
    isSettingsOpen,
    isCommandPanelOpen,
    isHelpPanelOpen,
    showWeatherModal,
    showNotifications,
    triggerThemeToggle,
    isSidebarCollapsed
  ]);

  const { notifications, unreadCount, markAsRead, clearAll } = useNotifications();

  // Expose openSettings to window for other components
  useEffect(() => {
    (window as any).openSettings = (tab?: any) => {
      setSettingsTab(tab);
      setIsSettingsOpen(true);
    };
    return () => {
      delete (window as any).openSettings;
    };
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('nxzj_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        const storedMode = localStorage.getItem('nxzj_app_mode');
        if (storedMode === '3d' || storedMode === 'data') {
          setAppMode(storedMode);
        }
      } catch (e) {
        console.warn('Failed to parse stored user:', e);
        localStorage.removeItem('nxzj_user');
      }
    }
    const noticeAccepted = sessionStorage.getItem('nxzj_notice_accepted');
    if (noticeAccepted === 'true') {
      setHasAcceptedNotice(true);
    }
  }, []);

  const handleLogin = (userData: any, mode: 'data' | '3d' = 'data') => {
    setUser(userData);
    setAppMode(mode);
    localStorage.setItem('nxzj_user', JSON.stringify(userData));
    localStorage.setItem('nxzj_app_mode', mode);
    setHasAcceptedNotice(false);
    sessionStorage.removeItem('nxzj_notice_accepted');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('nxzj_user');
    sessionStorage.removeItem('nxzj_notice_accepted');
    setActiveTab('dashboard');
  };

  const handleAcceptNotice = () => {
    setHasAcceptedNotice(true);
    sessionStorage.setItem('nxzj_notice_accepted', 'true');
  };

  // Theme persistence
  useEffect(() => {
    const savedTheme = localStorage.getItem('nxzj_theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (savedTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    }

    // Disable context menu to feel like a native app
    const handleContextMenu = (e: MouseEvent) => {
      // Allow context menu on inputs and textareas
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    const fetchWeather = async (lat?: number, lon?: number) => {
      const data = await DataService.getWeather(lat, lon);
      if (data) {
        setWeatherData(data);
      }
    };
    
    // Initial fetch
    fetchWeather();

    // Listen for location changes from Dashboard
    const handleLocationChange = (e: any) => {
      const loc = e.detail;
      if (loc && loc.lat && loc.lon) {
        fetchWeather(loc.lat, loc.lon);
      }
    };

    window.addEventListener('locationChanged', handleLocationChange);
    return () => window.removeEventListener('locationChanged', handleLocationChange);
  }, []);

  useEffect(() => {
    const handleJumpToKnowledge = (e: any) => {
      const query = e.detail?.query;
      if (query) {
        handleNavigate('knowledge', query);
      }
    };
    window.addEventListener('navigate-to-knowledge', handleJumpToKnowledge);
    return () => window.removeEventListener('navigate-to-knowledge', handleJumpToKnowledge);
  }, []);

  const startGuide = useCallback(() => {
    // 新手引导围绕数据控制台展开，先切回数据控制台再启动，确保被高亮的元素均已渲染
    setAppMode('data');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('start-onboarding-tour'));
    }, 350);
  }, []);

  // 仅在用户确认「用户需知」之后，才自动启动一次新手引导，避免两者同时显示重叠
  useEffect(() => {
    if (user && hasAcceptedNotice) {
      const isDone = localStorage.getItem('nxzj_onboarding_done');
      if (isDone !== 'true') {
        // 留出弹窗退场动画 + 界面渲染的时间，再顺序启动引导
        const timer = setTimeout(() => {
          startGuide();
        }, 900);
        return () => clearTimeout(timer);
      }
    }
  }, [user, hasAcceptedNotice, startGuide]);

  const getWeatherDescription = (code: number) => {
    if (code === 0) return '晴朗';
    if (code === 1) return '大部晴朗';
    if (code === 2) return '多云';
    if (code === 3) return '阴天';
    if (code >= 45 && code <= 48) return '雾';
    if (code >= 51 && code <= 55) return '毛毛雨';
    if (code >= 56 && code <= 57) return '冻毛毛雨';
    if (code >= 61 && code <= 65) return '雨';
    if (code >= 66 && code <= 67) return '冻雨';
    if (code >= 71 && code <= 75) return '雪';
    if (code === 77) return '雪粒';
    if (code >= 80 && code <= 82) return '阵雨';
    if (code >= 85 && code <= 86) return '阵雪';
    if (code >= 95) return '雷暴';
    return '未知';
  };

  const getWeatherIcon = (code: number) => {
    if (code === 0 || code === 1) return Sun;
    if (code === 2) return CloudSun;
    if (code === 3) return Cloud;
    if (code >= 45 && code <= 48) return CloudFog;
    if (code >= 51 && code <= 57) return CloudDrizzle;
    if (code >= 61 && code <= 67) return CloudRain;
    if (code >= 71 && code <= 77) return CloudSnow;
    if (code >= 80 && code <= 82) return CloudRain;
    if (code >= 85 && code <= 86) return CloudSnow;
    if (code >= 95) return CloudLightning;
    return CloudSun;
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  const menuItems = [
    { id: 'dashboard', label: t('app.dashboard'), icon: LayoutDashboard, keywords: ['首页', '概览', '看板', 'dashboard'], roles: ['管理员', '农业专家', '普通用户'] },
    { id: 'monitoring', label: t('app.monitoring'), icon: Activity, keywords: ['监测', '环境', '数据', '传感器', 'monitoring'], roles: ['管理员', '农业专家'] },
    { id: 'management', label: t('app.management'), icon: MapIcon, keywords: ['地块', '农田', '管理', 'fields'], roles: ['管理员', '农业专家'] },
    { id: 'ai', label: t('app.ai'), icon: Scan, keywords: ['ai', '诊断', '识别', '病虫害'], roles: ['管理员', '农业专家', '普通用户'] },
    { id: 'knowledge', label: t('app.knowledge'), icon: BookOpen, keywords: ['知识', '智库', '技术', '百科', 'knowledge'], roles: ['管理员', '农业专家', '普通用户'] },
    { id: 'news', label: t('app.news'), icon: Newspaper, keywords: ['资讯', '新闻', '政策', '行情', 'news'], roles: ['管理员', '农业专家', '普通用户'] },
    { id: 'market', label: '服务市场', icon: ShoppingBag, keywords: ['订阅', '套餐', '商城', '硬件', '增值服务', '升级', '购买', 'market', 'store'], roles: ['管理员', '农业专家', '普通用户'] },
  ].filter(item => item.roles.includes(user.role));

  function handleNavigate(tab: string, query?: string) {
    setActiveTab(tab);
    if (tab === 'knowledge' && query) {
      setKnowledgeSearchQuery(query);
    }
    if (tab === 'monitoring' && query) {
      setSelectedPlotId(query);
      setNavKey(prev => prev + 1);
    } else if (tab !== 'monitoring') {
      setSelectedPlotId(undefined);
    }
    if (tab === 'management' && query) {
      setTimeout(() => {
        const el = document.getElementById(query);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  }

  const handleUpdateUser = (updatedUser: any) => {
    setUser(updatedUser);
    localStorage.setItem('nxzj_user', JSON.stringify(updatedUser));
  };

  const handleGlobalSearch = (searchQuery: string) => {
    const query = (searchQuery || '').toLowerCase();
    
    if (query.includes('地块') || query.includes('管理') || query.includes('面积')) {
      setActiveTab('management');
    } else if (query.includes('监测') || query.includes('实时') || query.includes('数据') || query.includes('温湿度')) {
      setActiveTab('monitoring');
    } else if (query.includes('首页') || query.includes('概览') || query.includes('看板')) {
      setActiveTab('dashboard');
    } else if (query.includes('识别') || query.includes('拍照') || query.includes('诊断')) {
      setActiveTab('ai');
    } else if (query.includes('新闻') || query.includes('资讯') || query.includes('动态')) {
      setActiveTab('news');
    } else {
      // Default to knowledge base
      setActiveTab('knowledge');
      setKnowledgeSearchQuery(searchQuery);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} user={user} />;
      case 'monitoring': return <FieldMonitoring user={user} onNavigate={handleNavigate} initialPlotId={selectedPlotId} navKey={navKey} />;
      case 'management': return <FieldManagement user={user} onNavigate={handleNavigate} />;
      case 'ai': return <AIRecognition onNavigate={handleNavigate} user={user} />;
      case 'knowledge': return (
        <KnowledgeBase 
          initialQuery={knowledgeSearchQuery} 
          onQueryHandled={() => setKnowledgeSearchQuery('')} 
          onNavigate={handleNavigate}
          user={user}
          initialArticleId={initialArticleId}
        />
      );
      case 'news': return <NewsModule user={user} initialNewsId={initialNewsId} />;
      case 'market': return <ServiceMarket user={user} onUpdateUser={handleUpdateUser} onNavigate={handleNavigate} />;
      case 'feedback': return <Feedback user={user} />;
      default: return <Dashboard onNavigate={handleNavigate} user={user} />;
    }
  };

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return t('app.dashboard');
      case 'monitoring': return t('app.monitoring');
      case 'management': return t('app.management');
      case 'ai': return t('app.ai');
      case 'knowledge': return t('app.knowledge');
      case 'news': return t('app.news');
      case 'feedback': return t('app.feedback');
      default: return t('app.dashboard');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-500 relative">
      <AnimatePresence>
        {user && !hasAcceptedNotice && (
          <UserNoticeModal onAccept={handleAcceptNotice} />
        )}
      </AnimatePresence>

      {/* Global Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] dark:opacity-20 opacity-0 mix-blend-overlay">
         <div className="absolute inset-0 dark:bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[140px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[140px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      <DesktopTitleBar title={t('app.title')} />
      
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        {appMode !== '3d' && (
        <motion.aside 
          initial={false}
          animate={{ 
            width: (isSidebarCollapsed && !isSidebarHovered) ? 100 : 300
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onMouseEnter={() => isSidebarCollapsed && setIsSidebarHovered(true)}
          onMouseLeave={() => setIsSidebarHovered(false)}
          className={cn(
            "sidebar-glass flex flex-col z-50 relative shadow-[20px_0_50px_-20px_rgba(0,0,0,0.05)] dark:shadow-none overflow-hidden",
            "fixed lg:relative h-full lg:h-auto",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          {/* Sidebar Glow */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-forest-green/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="h-24 flex items-center px-8 border-b border-slate-100/50 dark:border-white/5 overflow-hidden whitespace-nowrap relative z-10">
            <div className="flex items-center gap-4 min-w-[220px]">
              <div className="w-12 h-12 bg-gradient-to-br from-forest-green to-emerald-600 rounded-2xl flex items-center justify-center shadow-xl shadow-forest-green/20 shrink-0 relative group-hover:scale-110 transition-transform duration-500">
                <MapIcon size={24} className="text-white" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-harvest-gold rounded-full border-2 border-white dark:border-[#0A0A0A] shadow-sm animate-pulse" />
              </div>
              {(!isSidebarCollapsed || isSidebarHovered) && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex flex-col"
                >
                  <span className="font-black text-slate-900 dark:text-white text-2xl tracking-tighter leading-none">{t('app.brand')}</span>
                  <span className="text-[10px] text-forest-green dark:text-emerald-400 font-black tracking-[0.3em] uppercase mt-1.5 opacity-80">{t('app.subtitle')}</span>
                </motion.div>
              )}
            </div>
          </div>

          <nav className="flex-1 py-10 px-5 space-y-2.5 overflow-y-auto custom-scrollbar relative z-10">
            {menuItems.map(item => {
              const Icon = item.icon;
              return (
                <NavItem 
                  key={item.id}
                  id={`sidebar-nav-${item.id}`}
                  icon={<Icon size={24} />} 
                  label={item.label} 
                  active={activeTab === item.id} 
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }} 
                  collapsed={isSidebarCollapsed && !isSidebarHovered}
                />
              );
            })}
            <NavItem 
              id="sidebar-nav-feedback"
              icon={<MessageSquare size={24} />} 
              label="用户反馈" 
              active={activeTab === 'feedback'} 
              onClick={() => {
                setActiveTab('feedback');
                setIsMobileMenuOpen(false);
              }} 
              collapsed={isSidebarCollapsed && !isSidebarHovered}
            />
          </nav>

          <div className="p-6 border-t border-slate-50 dark:border-white/5 space-y-3 relative z-10">
            <NavItem 
              icon={<HelpCircle size={24} className="text-emerald-500 animate-pulse" />} 
              label="新手引导" 
              onClick={startGuide} 
              collapsed={isSidebarCollapsed && !isSidebarHovered}
            />
            <NavItem 
              icon={<Settings size={24} />} 
              label={t('app.settings')} 
              onClick={() => {
                setIsSettingsOpen(true);
                setIsMobileMenuOpen(false);
              }} 
              collapsed={isSidebarCollapsed && !isSidebarHovered}
            />
            <NavItem 
              icon={<LogOut size={24} />} 
              label={t('app.logout')} 
              onClick={handleLogout} 
              collapsed={isSidebarCollapsed && !isSidebarHovered}
              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
            />
          </div>

          {/* Collapse Toggle (Desktop only) */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex absolute -right-3 top-24 w-7 h-7 bg-white dark:bg-[#1A1A1A] border border-slate-200/50 dark:border-white/10 rounded-full items-center justify-center shadow-xl text-slate-400 hover:text-forest-green hover:scale-110 transition-all z-30"
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </motion.aside>
        )}

        {/* Main Container */}
        <div className="flex-1 flex flex-col min-w-0 relative w-full lg:w-auto">
          {/* Top Header */}
          {appMode !== '3d' && (
            <header className="h-16 lg:h-24 bg-white/40 dark:bg-[#020617]/60 backdrop-blur-3xl border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between px-4 lg:px-12 relative z-30 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-4 lg:gap-8 flex-1">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"
              >
                <Menu size={24} />
              </button>
              
              <div className="flex flex-col shrink-0">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none whitespace-nowrap">{getTitle()}</h2>
                <div className="flex items-center gap-2 mt-1.5 group relative">
                  <div className="relative flex items-center justify-center">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping absolute opacity-75" />
                    <div className="w-2 h-2 bg-emerald-500 rounded-full relative" />
                  </div>
                  <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-500/20 cursor-help transition-all hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
                    系统运行正常
                  </span>
                  {/* Tooltip */}
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white/95 dark:bg-[#1A1A1A]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/50 dark:border-white/10 p-4 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-[60]">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">传感器连接</span>
                        <span className="text-[10px] text-emerald-500 font-black">100%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">网关状态</span>
                        <span className="text-[10px] text-emerald-500 font-black">在线</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">数据同步</span>
                        <span className="text-[10px] text-emerald-500 font-black">实时</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">所有节点运行正常，最后同步时间：刚刚</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-10 w-px bg-slate-200/50 dark:bg-white/5 hidden lg:block" />
              
              {/* Module Selector */}
              <div className="hidden md:flex bg-slate-100/50 dark:bg-[#1A1A1A]/50 p-1 rounded-2xl border border-slate-200/50 dark:border-white/10 backdrop-blur-md">
                <button
                  className="bg-white dark:bg-[#2A2A2A] text-forest-green dark:text-emerald-400 shadow-sm px-4 py-2 rounded-xl text-xs font-bold transition-all"
                >
                  数据概览
                </button>
                <button
                  id="module-selector-3d"
                  onClick={() => setAppMode('3d')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <MapIcon size={14} />
                  3D 农场孪生
                </button>
              </div>
              <div className="h-10 w-px bg-slate-200/50 dark:bg-white/5 hidden lg:block" />
              <div id="global-search-container" className="hidden md:block flex-1 max-w-md global-search-container">
                <GlobalSearch onNavigate={handleNavigate} user={user} />
              </div>
            </div>
            
            <div className="flex items-center gap-4 lg:gap-8">
            <div id="farm-calendar-widget">
              <FarmCalendarWidget user={user} />
            </div>
            
            <div 
              id="header-weather-widget"
              onClick={() => setShowWeatherModal(true)}
              className="weather-widget-container hidden lg:flex items-center gap-6 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-[#1A1A1A]/50 p-3 rounded-2xl transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-white/10 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-forest-green dark:text-emerald-400">
                  <CloudSun size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-900 dark:text-white font-black leading-none">{weatherData?.current ? `${weatherData.current.temperature_2m.toFixed(1)}°C` : '--°C'}</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{weatherData?.current ? getWeatherDescription(weatherData.current.weather_code) : '加载中'}</span>
                </div>
              </div>
              <div className="w-px h-6 bg-slate-200/50 dark:bg-white/5" />
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-harvest-gold dark:text-amber-400">
                  <Sun size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-900 dark:text-white font-black leading-none">UV 强</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">适宜作业</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 relative">
              <button 
                onClick={handleFullscreenToggle}
                title="全屏切换"
                className="hidden md:flex p-2.5 rounded-2xl relative transition-all border text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent hover:border-slate-100 dark:hover:border-white/10"
              >
                <Maximize size={20} />
              </button>
              
              <button 
                id="header-notifications-bell"
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  "p-2.5 rounded-2xl relative transition-all border",
                  showNotifications 
                    ? "bg-forest-green text-white border-forest-green shadow-lg shadow-forest-green/20" 
                    : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent hover:border-slate-100 dark:hover:border-white/10"
                )}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white dark:border-[#0A0A0A] font-black animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div 
                      className="fixed inset-0 z-[60]" 
                      onClick={() => setShowNotifications(false)} 
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-4 w-96 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-slate-200/50 dark:border-white/10 z-[70] overflow-hidden"
                    >
                      <div className="p-6 border-b border-slate-100/50 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-[#1A1A1A]/50 backdrop-blur-md">
                        <div>
                          <h4 className="font-black text-slate-900 dark:text-white text-base tracking-tight">系统通知</h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                            您有 {unreadCount} 条未读消息
                          </p>
                        </div>
                        <button 
                          onClick={clearAll} 
                          className="px-3 py-1.5 bg-slate-200/50 dark:bg-[#2A2A2A]/50 hover:bg-red-50 dark:hover:bg-red-900/30 text-[10px] font-black text-slate-600 dark:text-slate-300 hover:text-red-500 transition-colors uppercase tracking-wider rounded-xl"
                        >
                          清除全部
                        </button>
                      </div>
                      
                      <div className="max-h-[480px] overflow-y-auto p-3 custom-scrollbar">
                        {notifications.length > 0 ? (
                          <div className="space-y-2">
                            {notifications.map((n) => (
                              <div 
                                key={n.id} 
                                onClick={() => markAsRead(n.id)}
                                className={cn(
                                  "group p-4 rounded-2xl cursor-pointer transition-all border relative overflow-hidden",
                                  n.read 
                                    ? "bg-white dark:bg-[#1A1A1A] border-transparent opacity-60" 
                                    : "bg-slate-50/50 dark:bg-[#0A0A0A]/50 border-slate-100 dark:border-white/5 hover:bg-white dark:hover:bg-slate-800 hover:border-forest-green/20 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-none"
                                )}
                              >
                                {!n.read && (
                                  <div className="absolute top-0 left-0 w-1 h-full bg-forest-green" />
                                )}
                                
                                <div className="flex gap-4">
                                  <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                    n.type === 'error' ? "bg-red-50 dark:bg-red-900/20 text-red-500" : 
                                    n.type === 'warning' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-500" : 
                                    "bg-blue-50 dark:bg-blue-900/20 text-blue-500"
                                  )}>
                                    {n.type === 'error' ? <AlertCircle size={18} /> : 
                                     n.type === 'warning' ? <AlertTriangle size={18} /> : 
                                     <Info size={18} />}
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-black text-xs text-slate-800 dark:text-white tracking-tight truncate pr-2">
                                        {n.title}
                                      </span>
                                      <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold whitespace-nowrap">
                                        {n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                                      {n.message}
                                    </p>
                                    
                                    {!n.read && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markAsRead(n.id);
                                        }}
                                        className="mt-2 text-[8px] font-black text-forest-green uppercase tracking-widest hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        标记为已读
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-20 text-center">
                            <div className="w-16 h-16 bg-slate-50 dark:bg-[#0A0A0A] rounded-full flex items-center justify-center mx-auto mb-4">
                              <Bell size={24} className="text-slate-200 dark:text-slate-700" />
                            </div>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold tracking-widest uppercase">暂无新通知</p>
                          </div>
                        )}
                      </div>
                      
                      {notifications.length > 0 && (
                        <div className="p-4 bg-slate-50/50 dark:bg-[#0A0A0A]/50 border-t border-slate-50 dark:border-white/5 text-center">
                          <button className="text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-forest-green transition-colors uppercase tracking-[0.2em]">
                            查看历史通知
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
              
              <div 
                className="flex items-center gap-3 lg:pl-4 lg:border-l border-slate-200/50 dark:border-white/5 cursor-pointer group"
                onClick={() => setIsSettingsOpen(true)}
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-black text-slate-900 dark:text-white group-hover:text-forest-green transition-colors">{user?.username || '管理员'}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{user?.role || '高级专家'}</p>
                </div>
                <div className="w-10 h-10 bg-slate-100/50 dark:bg-[#1A1A1A]/50 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 group-hover:border-forest-green/50 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-forest-green group-hover:shadow-lg group-hover:shadow-forest-green/10">
                  <User size={20} />
                </div>
              </div>
            </div>
          </div>
        </header>
        )}

        {/* Content Area */}
        <main className={cn(
          "flex-1 relative overflow-hidden",
          appMode === 'data' ? "bg-slate-50 dark:bg-[#050505] p-4 lg:p-12 custom-scrollbar hero-gradient" : "bg-black"
        )}>
          {hasOpened3D && (
            <div className={cn(
              "absolute inset-0 z-0 transition-opacity duration-500",
              appMode === '3d' ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}>
              <DigitalTwinWrapper 
                user={user}
                activePlotId={selectedPlotId}
                onSelectPlot={(id) => {
                  setSelectedPlotId(id);
                }}
                onExit={() => setAppMode('data')}
              />
            </div>
          )}

          <div className={cn(
            "h-full relative z-10 transition-opacity duration-500",
            appMode === 'data' ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}>
            {/* Subtle background pattern */}
            <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.15] pointer-events-none overflow-hidden">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-forest-green/20 dark:bg-emerald-500/20 rounded-full blur-[120px]" />
              <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-green/20 dark:bg-indigo-500/20 rounded-full blur-[120px]" />
            </div>
            
            <div className={cn("h-full relative z-10", activeTab !== 'knowledge' && "overflow-y-auto")}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="h-full relative z-10"
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Weather Modal */}
          <AnimatePresence>
            {showWeatherModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowWeatherModal(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-full max-w-2xl bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-2xl rounded-[40px] p-10 shadow-2xl overflow-hidden border border-slate-200/50 dark:border-white/10"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-32 -mt-32 blur-[100px]" />
                  
                  <div className="flex justify-between items-start mb-10 relative">
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">气象详情</h3>
                      <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">气象预报 · 24小时</p>
                    </div>
                    <button onClick={() => setShowWeatherModal(false)} className="p-3 bg-slate-100 dark:bg-[#1A1A1A] hover:bg-slate-200 dark:hover:bg-[#2A2A2A] rounded-2xl transition-all border border-slate-200/50 dark:border-white/10">
                      <ChevronLeft className="rotate-180 text-slate-600 dark:text-slate-300" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                    <div className="bg-gradient-to-br from-forest-green to-emerald-700 p-8 rounded-[32px] text-white shadow-2xl shadow-forest-green/20 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex justify-between items-start mb-6 relative z-10">
                        {weatherData?.current ? React.createElement(getWeatherIcon(weatherData.current.weather_code), { size: 48, className: "drop-shadow-lg" }) : <CloudSun size={48} className="drop-shadow-lg" />}
                        <span className="text-4xl font-black tracking-tighter drop-shadow-lg">{weatherData?.current ? `${weatherData.current.temperature_2m.toFixed(1)}°C` : '--°C'}</span>
                      </div>
                      <p className="text-xl font-black mb-2 relative z-10">{weatherData?.current ? getWeatherDescription(weatherData.current.weather_code) : '加载中...'}</p>
                      <p className="text-sm font-medium opacity-90 leading-relaxed relative z-10">
                        {weatherData?.current ? `当前体感温度 ${weatherData.current.apparent_temperature.toFixed(1)}°C。` : ''}
                        {weatherData?.current?.weather_code > 50 ? '有降水可能，请注意防范。' : '紫外线可能较强，户外作业请注意防晒。'}
                      </p>
                      <div className="mt-8 grid grid-cols-2 gap-4 relative z-10">
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                          <p className="text-[10px] opacity-70 uppercase font-black tracking-widest mb-1">湿度</p>
                          <p className="font-black text-lg">{weatherData?.current ? `${weatherData.current.relative_humidity_2m}%` : '--%'}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                          <p className="text-[10px] opacity-70 uppercase font-black tracking-widest mb-1">风速</p>
                          <p className="font-black text-lg">{weatherData?.current ? `${weatherData.current.wind_speed_10m} km/h` : '--'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-black text-slate-900 dark:text-white text-sm mb-4 uppercase tracking-widest">未来 3 天预报</h4>
                      {weatherData?.daily ? (
                        [1, 2, 3].map((i) => {
                          const date = new Date(weatherData.daily.time[i]);
                          const dayName = i === 1 ? '明天' : i === 2 ? '后天' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
                          const maxTemp = weatherData.daily.temperature_2m_max[i].toFixed(0);
                          const minTemp = weatherData.daily.temperature_2m_min[i].toFixed(0);
                          const code = weatherData.daily.weather_code[i];
                          const Icon = getWeatherIcon(code);
                          
                          return (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-[#1A1A1A]/30 backdrop-blur-sm rounded-2xl border border-slate-200/50 dark:border-white/5 hover:bg-white dark:hover:bg-[#1A1A1A]/50 transition-all">
                              <div className="flex items-center gap-4">
                                <span className="text-forest-green dark:text-emerald-400"><Icon size={20} /></span>
                                <span className="font-black text-slate-700 dark:text-slate-300 text-sm">{dayName}</span>
                              </div>
                              <div className="text-right">
                                <p className="font-black text-slate-900 dark:text-white text-sm tracking-tight">{maxTemp}°C / {minTemp}°C</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">{getWeatherDescription(code)}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        [
                          { day: '明天', temp: '-- / --', icon: <CloudSun size={20} />, status: '加载中' },
                          { day: '后天', temp: '-- / --', icon: <CloudRain size={20} />, status: '加载中' },
                          { day: '大后天', temp: '-- / --', icon: <Sun size={20} />, status: '加载中' },
                        ].map((w, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-[#1A1A1A]/30 backdrop-blur-sm rounded-2xl border border-slate-200/50 dark:border-white/5 hover:bg-white dark:hover:bg-[#1A1A1A]/50 transition-all">
                            <div className="flex items-center gap-4">
                              <span className="text-forest-green dark:text-emerald-400">{w.icon}</span>
                              <span className="font-black text-slate-700 dark:text-slate-300 text-sm">{w.day}</span>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-slate-900 dark:text-white text-sm tracking-tight">{w.temp}</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">{w.status}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-10 p-6 bg-amber-50/50 dark:bg-amber-900/20 backdrop-blur-md rounded-[24px] border border-amber-100/50 dark:border-amber-500/20 flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                      <AlertCircle size={20} />
                    </div>
                    <p className="text-xs text-amber-900 dark:text-amber-200 font-black leading-relaxed">
                      提示：后天预计有小雨，建议提前做好大棚加固与排水系统检查，避免积水影响作物生长。
                    </p>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
    <StatusBar user={user} />
    
    <ToastContainer />
    <AIAssistant />
    <InteractiveCenter
      isOpen={isInteractiveOpen}
      onClose={handleCloseInteractive}
      initialTab={interactiveTab}
      onAddLog={(log) => console.log("[SYSTEM] Root Interactive: ", log)}
      onNavigate={handleNavigate}
    />
    <SettingsModal 
      isOpen={isSettingsOpen} 
      onClose={() => {
        setIsSettingsOpen(false);
        setSettingsTab(undefined);
      }} 
      user={user} 
      onLogout={handleLogout} 
      onUpdateUser={handleUpdateUser}
      initialTab={settingsTab}
    />
    <CommandPanel
      isOpen={isCommandPanelOpen}
      onClose={() => setIsCommandPanelOpen(false)}
      onNavigate={handleNavigate}
      triggerThemeToggle={triggerThemeToggle}
      isSidebarCollapsed={isSidebarCollapsed}
      setIsSidebarCollapsed={setIsSidebarCollapsed}
    />
    <ShortcutHelpPanel
      isOpen={isHelpPanelOpen}
      onClose={() => setIsHelpPanelOpen(false)}
    />
    <ShortcutFloatingCard />
    <OnboardingTour onNavigate={(tab) => handleNavigate(tab)} />
  </div>
);
}

const NavItem = React.memo(function NavItem({ 
  icon, 
  label, 
  active, 
  onClick, 
  className,
  collapsed,
  id
}: { 
  key?: string | number,
  icon: React.ReactNode, 
  label: string, 
  active?: boolean, 
  onClick: () => void,
  className?: string,
  collapsed?: boolean,
  id?: string
}) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { x, y, id: Date.now() };
    
    setRipples(prev => [...prev, newRipple]);
    
    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);
    
    onClick();
  }, [onClick]);

  return (
    <button 
      id={id}
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-500 group relative overflow-hidden",
        active ? "nav-active scale-[1.02]" : "nav-inactive",
        collapsed ? "justify-center px-0" : "justify-start",
        className
      )}
    >
      {/* Active Indicator */}
      {active && !collapsed && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r-full z-20"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      {/* Ripple Effect */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute bg-white/30 dark:bg-white/10 rounded-full animate-ripple pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 0,
            height: 0,
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}

      <span className={cn(
        "transition-all duration-300 shrink-0 relative z-10", 
        active ? "scale-110" : "group-hover:scale-110",
        collapsed ? "mx-auto" : ""
      )}>
        {icon}
      </span>
      
      {!collapsed && (
        <motion.span 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="font-bold text-sm tracking-tight relative z-10"
        >
          {label}
        </motion.span>
      )}

      {/* Tooltip for collapsed state */}
      {collapsed && (
        <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          {label}
        </div>
      )}
    </button>
  );
});
