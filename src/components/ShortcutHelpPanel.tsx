import React, { useEffect } from 'react';
import { Keyboard, X, Info, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ShortcutHelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcutData = [
  { keys: ['ctrl', 'k'], title: '全局命令面板 (VS Code 中枢)', desc: '打开类似 VS Code 的命令检索大屏，支持搜索系统模块、定位农田地块、实时查询智库百科' },
  { keys: ['ctrl', '/'], title: '系统快捷指令速查 (Shortcut Help)', desc: '呼出此快捷指令说明面板，一目了然获取所有操作秘籍' },
  { keys: ['ctrl', 'b'], title: '左侧导航边栏折叠 (Sidebar Collapse)', desc: '极速折叠/展开左侧核心控制菜单，以最大化拓宽您的视野' },
  { keys: ['ctrl', 'd'], title: '视觉主题切换 (Light/Dark Switch)', desc: '在夜间深色护眼太空蓝与白天雅致亮白底版间一键无级折返' },
  { keys: ['ctrl', '1~6'], title: '快捷切换标签页 (Direct Index Switch)', desc: '数字 1-6 分别映射 dashboard(仪表盘), monitoring(环境监测), management(地块管理), ai(诊断), knowledge(智库), news(资讯)' },
  { keys: ['f1'], title: '唤醒 AI 助手 (Summon AI)', desc: '即刻呼出 24h 农业专家全时助手机器人，进行聊天咨询、下发语音等' },
  { keys: ['f2'], title: '3D 农田数字孪生极速视察 (3D Twin Area)', desc: '极速切到管理页后，直接调度底盘指令一键初始化并启用 3D 三维上帝巡视数字视角' },
  { keys: ['esc'], title: '智能链式物理收起 (Smart Back Escape)', desc: '根据活跃状态最前优先级逐层收起：AI对话 -> 交互面板 -> 个人配置中心 -> 命令面板 -> 此帮助面板等' }
];

export default function ShortcutHelpPanel({ isOpen, onClose }: ShortcutHelpPanelProps) {
  // ESC key closing natively managed in App.tsx using priorities,
  // but let's allow custom events.
  useEffect(() => {
    const handleToggle = () => {
      // We can trigger toggle natively or catch events.
    };
    window.addEventListener('toggle-shortcut-panel', handleToggle);
    return () => window.removeEventListener('toggle-shortcut-panel', handleToggle);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 select-none">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Dialog Body */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="relative w-full max-w-2xl bg-white/95 dark:bg-[#0A0D16]/95 backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-2xl overflow-hidden border border-slate-200/50 dark:border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top glowing radial point */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

            {/* Header */}
            <div className="flex justify-between items-start mb-6 relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center shadow-inner">
                  <Keyboard size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white leading-none">系统快捷指令中枢</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">键盘效率提升速查指南</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 bg-slate-50 dark:bg-[#1A1E29] hover:bg-slate-100 dark:hover:bg-[#252A38] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-2xl transition-all border border-slate-200/50 dark:border-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Alert Banner for input focus bypass */}
            <div className="p-4.5 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/50 dark:border-amber-500/15 rounded-[1.5rem] flex items-start gap-3.5 mb-6 relative z-10">
              <div className="w-8 h-8 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Info size={16} />
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 font-black leading-relaxed">
                <span className="text-amber-500 font-bold">智能输入隔离：</span>
                当您的输入光标聚焦在 INPUT、TEXTAREA 或 contentEditable 网页输入框时，系统会【静默屏蔽】导航类快捷键 (如 Ctrl+1~6、Ctrl+B、Ctrl+D) 的捕获，确保您的文字输入流畅自如，不受干扰。
              </p>
            </div>

            {/* Shortcuts representation */}
            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar relative z-10">
              {shortcutData.map((s, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between p-3.5 bg-slate-50/40 dark:bg-[#131826]/30 hover:bg-slate-50 dark:hover:bg-[#131826]/60 rounded-2xl border border-slate-100 dark:border-[#1E2538]/30 transition-all group"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-xs font-black text-slate-800 dark:text-slate-100 tracking-tight">{s.title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-bold truncate leading-none">{s.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s.keys.map((k, kIdx) => (
                      <React.Fragment key={kIdx}>
                        {kIdx > 0 && <span className="text-[10px] text-slate-400 font-black">+</span>}
                        <kbd className="px-2.5 py-1 bg-white dark:bg-[#1C2234] border border-slate-200 dark:border-white/5 rounded-xl text-[10px] font-black text-slate-700 dark:text-slate-300 shadow-sm uppercase tracking-wider group-hover:border-emerald-500/20 group-hover:bg-emerald-500/5 dark:group-hover:bg-emerald-500/15 dark:group-hover:text-emerald-400 transition-colors">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-2">
              <div className="flex items-center gap-2">
                <HelpCircle size={10} className="text-emerald-500" />
                <span>提效 10 倍：随时按下 <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-[#1E2538] border border-slate-200 dark:border-white/5 rounded">ctrl + /</kbd> 呼起或隐藏此速查表</span>
              </div>
              <span className="text-[9px] font-black text-emerald-500">农芯终端运行套件</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
