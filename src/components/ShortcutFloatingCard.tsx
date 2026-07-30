import React, { useState, useEffect } from 'react';
import { Keyboard, ChevronDown, ChevronUp, Sparkles, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ShortcutItem {
  id: string;
  keys: string[];
  label: string;
  desc: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { id: 'command-panel', keys: ['ctrl', 'k'], label: '命令面板', desc: '全局功能/地块快速检索' },
  { id: 'shortcut-help', keys: ['ctrl', '/'], label: '速查面板', desc: '呼出核心快捷键大屏' },
  { id: 'sidebar-toggle', keys: ['ctrl', 'b'], label: '折叠边栏', desc: '极速折叠/展开主菜单' },
  { id: 'theme-toggle', keys: ['ctrl', 'd'], label: '主题切换', desc: '切换深浅双色护眼底版' },
  { id: 'tab-switch', keys: ['ctrl', '1~6'], label: '切换页面', desc: '1-6直接切换对应模块' },
  { id: 'ai-summon', keys: ['f1'], label: 'AI助手', desc: '即刻呼出24h智能农技专家' },
  { id: 'twin-3d', keys: ['f2'], label: '3D数字孪生', desc: '快速进入上帝视角巡视' },
  { id: 'escape', keys: ['esc'], label: '智能退出', desc: '物理收起活跃窗口与面板' },
];

export default function ShortcutFloatingCard() {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [lastTriggerTime, setLastTriggerTime] = useState<number>(0);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nxzj_shortcut_card_collapsed') === 'true';
    }
    return false;
  });

  // 新手引导进行时隐藏本卡片，避免遮挡引导高亮；引导结束后再自动展开显示。
  // 首次进入（引导尚未完成）默认先隐藏，等引导走完再出现，避免开局闪现。
  const [hiddenForTour, setHiddenForTour] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nxzj_onboarding_done') !== 'true';
    }
    return false;
  });

  useEffect(() => {
    const handleTourStart = () => setHiddenForTour(true);
    const handleTourFinished = () => {
      setHiddenForTour(false);
      // 引导结束后自动“打开”快捷键说明（展开状态）
      setIsCollapsed(false);
      localStorage.setItem('nxzj_shortcut_card_collapsed', 'false');
    };

    window.addEventListener('start-onboarding-tour', handleTourStart);
    window.addEventListener('onboarding-tour-finished', handleTourFinished);

    return () => {
      window.removeEventListener('start-onboarding-tour', handleTourStart);
      window.removeEventListener('onboarding-tour-finished', handleTourFinished);
    };
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('nxzj_shortcut_card_collapsed', String(next));
      return next;
    });
  };

  const getComboString = (e: KeyboardEvent, keyName: string) => {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    
    if (keyName && !['control', 'shift', 'alt', 'meta'].includes(keyName)) {
      parts.push(keyName);
    }
    return parts.join('+');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = !!(
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
      );

      const keysPressed = new Set<string>();
      if (e.ctrlKey || e.metaKey) keysPressed.add('ctrl');
      if (e.altKey) keysPressed.add('alt');
      if (e.shiftKey) keysPressed.add('shift');
      
      let keyName = (e.key || '').toLowerCase();
      if (keyName === 'escape') keyName = 'esc';
      if (keyName === 'control') keyName = 'ctrl';
      
      if (keyName && !['control', 'shift', 'alt', 'meta'].includes(keyName)) {
        keysPressed.add(keyName);
      }

      setActiveKeys(prev => {
        const next = new Set(prev);
        keysPressed.forEach(k => next.add(k));
        return next;
      });

      // Avoid capturing shortcuts for visual feedback when typing inside form elements
      if (isInput) {
        const combo = getComboString(e, keyName);
        const navigationShortcuts = ['ctrl+1', 'ctrl+2', 'ctrl+3', 'ctrl+4', 'ctrl+5', 'ctrl+6', 'ctrl+b', 'ctrl+d'];
        if (navigationShortcuts.includes(combo)) {
          return;
        }
      }

      const combo = getComboString(e, keyName);
      let triggeredId: string | null = null;

      if (combo === 'ctrl+k') triggeredId = 'command-panel';
      else if (combo === 'ctrl+/') triggeredId = 'shortcut-help';
      else if (combo === 'ctrl+b') triggeredId = 'sidebar-toggle';
      else if (combo === 'ctrl+d') triggeredId = 'theme-toggle';
      else if (/^ctrl+[1-6]$/.test(combo)) triggeredId = 'tab-switch';
      else if (combo === 'f1') triggeredId = 'ai-summon';
      else if (combo === 'f2') triggeredId = 'twin-3d';
      else if (combo === 'esc') triggeredId = 'escape';

      if (triggeredId) {
        setHighlightedId(triggeredId);
        setLastTriggerTime(Date.now());
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let keyName = (e.key || '').toLowerCase();
      if (keyName === 'escape') keyName = 'esc';
      if (keyName === 'control') keyName = 'ctrl';

      setActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(keyName);
        if (!e.ctrlKey && !e.metaKey) next.delete('ctrl');
        if (!e.altKey) next.delete('alt');
        if (!e.shiftKey) next.delete('shift');
        return next;
      });
    };

    const handleBlur = () => {
      setActiveKeys(new Set());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [highlightedId, lastTriggerTime]);

  const isKeyHeld = (key: string) => {
    if (key === 'ctrl') return activeKeys.has('ctrl') || activeKeys.has('control');
    if (key === '1~6') {
      return Array.from(activeKeys).some(k => ['1', '2', '3', '4', '5', '6'].includes(k));
    }
    return activeKeys.has(key.toLowerCase());
  };

  // 引导进行时（或首次引导尚未结束时）不渲染本卡片
  if (hiddenForTour) return null;

  return (
    <div className="hidden md:block fixed bottom-10 left-[110px] right-auto z-[90] select-none pointer-events-none lg:left-[315px]">
      <div className="pointer-events-auto">
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <motion.button
              key="collapsed"
              initial={{ scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 10 }}
              onClick={toggleCollapsed}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-lg transition-all text-[10px] font-bold",
                "bg-slate-900/90 dark:bg-[#0E131F]/90 text-white border-slate-800 dark:border-white/10 hover:bg-slate-800",
                "backdrop-blur-md relative"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Keyboard size={12} className="text-emerald-400" />
              <span>快捷键说明</span>
              <ChevronUp size={10} className="text-slate-400 ml-0.5" />
              
              {/* Pulse indicator if any key is currently pressed */}
              {activeKeys.size > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping border border-white dark:border-[#0E131F]" />
              )}
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              className={cn(
                "w-[calc(100vw-1.5rem)] max-w-[340px] bg-white/95 dark:bg-[#070B14]/95 backdrop-blur-xl border rounded-2xl p-3.5 shadow-2xl relative",
                "border-slate-200/60 dark:border-white/10 transition-colors duration-300"
              )}
            >
              {/* Radial glow background */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

              {/* Header */}
              <div className="flex justify-between items-center mb-2.5 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 rounded-lg flex items-center justify-center">
                    <Keyboard size={13} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-none">效率键盘快捷指令</h4>
                    <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block mt-0.5">Press combos to trigger highlights</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {/* Glowing dot if keys are pressed */}
                  {activeKeys.size > 0 && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                  <button
                    onClick={toggleCollapsed}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-[#151D2A] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors"
                    title="收起悬浮卡片"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>

              {/* Grid of Shortcuts */}
              <div className="grid grid-cols-1 gap-1 relative z-10 max-h-[220px] overflow-y-auto custom-scrollbar pr-0.5">
                {SHORTCUTS.map((s) => {
                  const isHighlighted = highlightedId === s.id;
                  return (
                    <motion.div
                      key={s.id}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all duration-200",
                        isHighlighted
                          ? "bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border-emerald-500 dark:border-emerald-400/50 shadow-lg shadow-emerald-500/10"
                          : "bg-slate-50/50 dark:bg-[#0D121F]/40 border-slate-100/50 dark:border-white/5"
                      )}
                      animate={isHighlighted ? { scale: [1, 1.02, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {/* Left: Label and description */}
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[10px] font-bold leading-tight",
                            isHighlighted ? "text-emerald-600 dark:text-emerald-400 font-black" : "text-slate-700 dark:text-slate-300"
                          )}>
                            {s.label}
                          </span>
                          {isHighlighted && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="text-[8px] bg-emerald-500 text-white font-black px-1 rounded uppercase tracking-wider"
                            >
                              Active
                            </motion.span>
                          )}
                        </div>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500 truncate block font-medium leading-none mt-0.5">
                          {s.desc}
                        </span>
                      </div>

                      {/* Right: styled keycaps */}
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, idx) => {
                          const held = isKeyHeld(k);
                          return (
                            <React.Fragment key={idx}>
                              {idx > 0 && <span className="text-[8px] text-slate-400 font-bold">+</span>}
                              <kbd
                                className={cn(
                                  "px-1.5 py-0.5 border text-[9px] font-black uppercase rounded-md tracking-wide transition-all shadow-sm",
                                  held
                                    ? "bg-emerald-500 text-white border-emerald-500 scale-105"
                                    : isHighlighted
                                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500"
                                      : "bg-white dark:bg-[#151D2A] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/5"
                                )}
                              >
                                {k}
                              </kbd>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Mini Footer tip */}
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[8px] font-bold text-slate-400 dark:text-slate-500 relative z-10">
                <div className="flex items-center gap-1">
                  <HelpCircle size={9} className="text-emerald-500" />
                  <span>按键时动态触发高亮反馈</span>
                </div>
                <span>农芯智境 · OS</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
