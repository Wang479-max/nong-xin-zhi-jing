import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, HelpCircle, X, ChevronRight, ChevronLeft, Map, Scan, BookOpen, Newspaper, Activity, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { createPortal } from 'react-dom';

const TOUR_STEPS = [
  { title: '欢迎使用农芯智境 👋', selector: null, tab: null, text: '感谢您完成「用户需知」的阅读！接下来的快速引导将用约 1 分钟带您走遍系统的全部核心功能，助您轻松上手数字化农业管理。可随时点击「跳过引导」结束。' },
  { title: '3D 农场孪生 🛰️', selector: '#module-selector-3d', tab: null, text: '一键切换至沉浸式 3D 数字孪生场景，宏观卫星地图与微观作物长势双引擎联动，并与 AI 研判、环境监测数据实时贯通。' },
  { title: '仪表盘入口 📊', selector: '#sidebar-nav-dashboard', tab: null, text: '数据看板主入口，涵盖物联负荷、环境安全与气象因子等全局总览。' },
  { title: '核心指标 🌾', selector: '#dashboard-indicators', tab: 'dashboard', text: '实时查看温度、持水率、活跃硬件与AI预估年收益等核心生产数据。' },
  { title: '24h温湿度图 📈', selector: '#dashboard-chart-container', tab: 'dashboard', text: '动态多维物理波动曲线，直观推演作物蒸腾与光合活性状态。' },
  { title: '天算天枢指令中心 ⚙️', selector: '#dashboard-quick-actions', tab: 'dashboard', text: '八大核心快捷控制：病虫害诊断、NDVI监测、农业百科搜索、遥控等一键直达。' },
  { title: '物联监测入口 📡', selector: '#sidebar-nav-monitoring', tab: null, text: '通过5G空天地一体化物联感知中枢，全面掌控农田实时动态。' },
  { title: '传感器网络 📡', selector: '#monitoring-realtime-grid', tab: 'monitoring', text: '监控温湿度、光照、NPK和SPAD等传感器数据，结合LSTM防旱模型实现自愈滴灌。' },
  { title: '地块配置入口 🗺️', selector: '#sidebar-nav-management', tab: null, text: '管理农田基础数据，包括地块拓展、面积测绘与硬件连接调试。' },
  { title: '地块管理列表 🌾', selector: '#field-plots-list', tab: 'management', text: '实时控制滴灌、通风、补光、施肥等设备，支持一键操作与状态追溯。' },
  { title: 'AI诊断入口 🧠', selector: '#sidebar-nav-ai', tab: null, text: '基于大模型的图像形态学病理分析，提供全天候作物异常自动普查。' },
  { title: 'AI诊断上传区 📸', selector: '#ai-upload-area', tab: 'ai', text: '支持拖拽上传或摄像头拍摄，快速对接5G无人机航线进行病害诊断。' },
  { title: '农业百科入口 📚', selector: '#sidebar-nav-knowledge', tab: null, text: '汇聚千万级农业种植手册、防灾提醒与科学轮作方案的大型知识库。' },
  { title: '百科AI检索 🔍', selector: '#knowledge-search-container', tab: 'knowledge', text: '智能多模态引擎，秒级输出技术精解、指标预警及标准化操作流程。' },
  { title: '行业资讯入口 📰', selector: '#sidebar-nav-news', tab: null, text: '实时同步农业农村部与天行资讯的最新舆情动态和农资价格趋势分析。' },
  { title: '全局高速搜索 🔍', selector: '#global-search-container', tab: null, text: '毫秒级响应的全文搜索引擎，随时检索功能模块、地块信息或专业知识。' },
  { title: '微气象舱 🌤️', selector: '#header-weather-widget', tab: null, text: '精准呈现气温、湿度、风速和紫外线指数，并提供智能化农事作业推荐。' },
  { title: '农事日历 📅', selector: '#farm-calendar-widget', tab: null, text: '可视化时间轴排班系统，科学规划播种、灌溉、施药和收割等农事活动。' },
  { title: '警报通知 🔔', selector: '#header-notifications-bell', tab: null, text: '集中汇总系统故障与异常告警，对极其严重事件进行非消失式悬浮提醒。' },
  { title: '协同反馈 💬', selector: '#sidebar-nav-feedback', tab: 'feedback', text: '提供高效的用户沟通渠道，我们承诺对意见反馈实行2小时极速响应。' },
  { title: 'AI助手 🤖', selector: '#ai-assistant-ball', tab: null, text: '点击悬浮球或通过F1快捷键唤醒AI助手，随时解答如农药配置、飞防作业等疑难问题。' }
];

export default function OnboardingTour({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  
  useEffect(() => {
    setIsRendered(true);

    // 引导仅由外部事件触发（用户需知确认后由 App 派发，或侧边栏「新手引导」按钮手动触发），
    // 不再自启动，避免与「用户需知」弹窗同时显示造成重叠。
    const handleStart = () => {
      setIsActive(true);
      setCurrentStep(0);
    };

    window.addEventListener('start-onboarding-tour', handleStart);

    return () => {
      window.removeEventListener('start-onboarding-tour', handleStart);
    };
  }, []);

  const handleClose = () => {
    setIsActive(false);
    localStorage.setItem('nxzj_onboarding_done', 'true');
    // 引导结束（完成或跳过）后通知外部：此时再自动展开「快捷键说明」悬浮卡片，
    // 避免引导进行时被该卡片遮挡。
    window.dispatchEvent(new CustomEvent('onboarding-tour-finished'));
  };

  useEffect(() => {
    if (!isActive) return;

    let isMounted = true;
    let timer1: any, timer2: any;

    const findTargetFn = async () => {
      const step = TOUR_STEPS[currentStep];
      
      // Navigate if needed
      if (step.tab) {
        onNavigate(step.tab);
        // Wait for rendering
        await new Promise(r => { timer1 = setTimeout(r, 400); });
      } else {
        await new Promise(r => { timer1 = setTimeout(r, 80); });
      }

      if (!isMounted) return;

      if (!step.selector) {
        setRect(null);
        return;
      }

      const el = document.querySelector(step.selector);
      if (el) {
        // Scroll into view
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait for smooth scroll
        await new Promise(r => { timer2 = setTimeout(r, 300); });
        
        if (isMounted) {
          const domRect = el.getBoundingClientRect();
          setRect(domRect);
        }
      } else {
        // Retry once after 500ms if not found
        console.warn(`Onboarding element not found: ${step.selector}`);
        await new Promise(r => { timer2 = setTimeout(r, 500); });
        if (!isMounted) return;
        const retryEl = document.querySelector(step.selector);
        if (retryEl) {
           retryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
           await new Promise(r => { timer2 = setTimeout(r, 300); });
           if (isMounted) setRect(retryEl.getBoundingClientRect());
        } else {
           setRect(null);
        }
      }
    };

    findTargetFn();

    // Resize listener with debounce
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const step = TOUR_STEPS[currentStep];
        if (step.selector) {
           const el = document.querySelector(step.selector);
           if (el) setRect(el.getBoundingClientRect());
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      isMounted = false;
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [currentStep, isActive, onNavigate]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(c => c + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(c => c - 1);
    }
  };

  if (!isRendered || !isActive) return null;

  const currentInfo = TOUR_STEPS[currentStep];

  // Determine popover position
  let popoverStyle: React.CSSProperties = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    position: 'fixed'
  };

  let arrowStyle = '';

  if (currentInfo.selector && rect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;

    // Prefer bottom, then top, then right, then left
    if (spaceBelow > 200) {
      popoverStyle = {
        top: rect.bottom + 16,
        left: Math.max(16, Math.min(window.innerWidth - 320 - 16, rect.left + rect.width / 2 - 160)),
        position: 'fixed'
      };
      arrowStyle = 'bottom';
    } else if (spaceAbove > 200) {
      popoverStyle = {
        top: rect.top - 180, // popover approx height
        left: Math.max(16, Math.min(window.innerWidth - 320 - 16, rect.left + rect.width / 2 - 160)),
        position: 'fixed'
      };
      arrowStyle = 'top';
    } else if (spaceRight > 350) {
      popoverStyle = {
        top: Math.max(16, Math.min(window.innerHeight - 200, rect.top + rect.height / 2 - 100)),
        left: rect.right + 16,
        position: 'fixed'
      };
      arrowStyle = 'right';
    } else {
      popoverStyle = {
        top: Math.max(16, Math.min(window.innerHeight - 200, rect.top + rect.height / 2 - 100)),
        left: rect.left - 336, // 320 + 16
        position: 'fixed'
      };
      arrowStyle = 'left';
    }
  }

  return createPortal(
    <div className="onboarding-portal z-[9990] fixed inset-0 font-sans pointer-events-none">
      
      {/* Invisible backdrop to capture clicks outside */}
      <div 
        className="fixed inset-0 z-[9990] pointer-events-auto" 
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} 
      />

      {/* The hole with massive shadow box */}
      {rect && currentInfo.selector && (
        <div
          className="fixed z-[9991] pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ring-2 ring-emerald-500/50"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            borderRadius: '16px',
          }}
        >
          {/* Active Highlight Glow */}
          <div className="absolute -inset-1 rounded-2xl bg-emerald-500/20 animate-pulse pointer-events-none" />
        </div>
      )}

      {/* Popover overlay when selector is null (Step 1) */}
      {!currentInfo.selector && (
        <div className="fixed inset-0 z-[9991] bg-slate-900/40 backdrop-blur-sm pointer-events-auto" />
      )}

      {/* Popover Card */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0.4 }}
        className="fixed z-[9993] w-[320px] pointer-events-auto"
        style={popoverStyle}
      >
        <div className="bg-white dark:bg-[#1A1A1A] rounded-[24px] overflow-hidden shadow-2xl border border-slate-200/60 dark:border-white/10 relative">

          {/* 顶部进度条 */}
          <div className="h-1 w-full bg-slate-100 dark:bg-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
              initial={false}
              animate={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>

          <div className="absolute top-0 right-0 p-4 opacity-10 blur-xl pointer-events-none">
             <Sparkles size={80} className="text-emerald-500" />
          </div>

          <div className="p-6 relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                 {currentInfo.selector === null ? <Sparkles size={20} className="text-white" /> : <HelpCircle size={20} className="text-white" />}
              </div>
              <div>
                <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">
                  {currentInfo.title}
                </h3>
                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-600 dark:text-emerald-400">
                  Step {currentStep + 1} of {TOUR_STEPS.length}
                </span>
              </div>
            </div>

            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              {currentInfo.text}
            </p>

            {/* 步骤圆点导航：可点击直接跳转到对应步骤 */}
            <div className="flex items-center justify-center gap-1.5 flex-wrap mb-4">
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  aria-label={`跳转到第 ${i + 1} 步`}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === currentStep
                      ? 'w-5 bg-emerald-500'
                      : i < currentStep
                      ? 'w-1.5 bg-emerald-500/40 hover:bg-emerald-500/70'
                      : 'w-1.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20'
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-100 dark:border-white/5">
              <button
                onClick={handleClose}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-wider px-2 py-1"
              >
                跳过引导
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={handleNext}
                  className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-emerald-600 dark:hover:bg-emerald-500 hover:text-white transition-colors shadow-lg active:scale-95"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? '开始使用' : '下一步'}
                  {currentStep < TOUR_STEPS.length - 1 && <ChevronRight size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
