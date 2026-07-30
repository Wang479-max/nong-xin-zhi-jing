import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit,
  Sprout,
  Droplet,
  Bug,
  Map as MapIcon,
  Leaf,
  FileText,
  ThermometerSun,
  X,
  Clock,
  LucideIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { useRipple, RippleEffect } from './ui/useRipple';
import { EmptyState } from './ui/EmptyState';

// Types
export type ActivityType = 'plant' | 'fertilize' | 'irrigate' | 'spray' | 'harvest' | 'other';

export interface FarmActivity {
  id: string;
  type: ActivityType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  plotId: string;
  notes: string;
  operator: string;
}

const ACTIVITY_CONFIG: Record<ActivityType, { icon: LucideIcon, label: string, color: string, bg: string, text: string }> = {
  plant: { icon: Sprout, label: '播种', color: 'text-emerald-500', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300' },
  fertilize: { icon: Leaf, label: '施肥', color: 'text-amber-500', bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-300' },
  irrigate: { icon: Droplet, label: '灌溉', color: 'text-blue-500', bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-300' },
  spray: { icon: Bug, label: '打药', color: 'text-rose-500', bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-700 dark:text-rose-300' },
  harvest: { icon: ThermometerSun, label: '收获', color: 'text-orange-500', bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-700 dark:text-orange-300' },
  other: { icon: FileText, label: '其他', color: 'text-slate-500', bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-700 dark:text-slate-300' },
};

// Utils
const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};
const getFirstDayOfMonth = (year: number, month: number) => {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Make Monday 0, Sunday 6
};

// Storage keys
const STORAGE_KEY = 'nxzj_farm_activities';

export default function FarmCalendarWidget({ user }: { user: any }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [liveTime, setLiveTime] = useState(new Date());
  const [activities, setActivities] = useState<FarmActivity[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
  );
  
  // Widget Modal State
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<FarmActivity | null>(null);

  const { ripples, addRipple } = useRipple();

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const openCalendar = () => setIsCalendarOpen(true);
    window.addEventListener('open-farm-calendar', openCalendar);
    return () => window.removeEventListener('open-farm-calendar', openCalendar);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setActivities(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse activities', e);
      }
    } else {
      // Add some mockup data
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const mocks: FarmActivity[] = [
        { id: '1', type: 'plant', date: `${year}-${month}-08`, time: '08:30', plotId: 'A-1区 春玉米田', notes: '已按计划完成，种子品种：郑单958', operator: '张三' },
        { id: '2', type: 'irrigate', date: `${year}-${month}-12`, time: '14:20', plotId: 'B-2区 番茄温室', notes: '滴灌管网正常，补水5吨', operator: '李师傅' },
        { id: '3', type: 'spray', date: `${year}-${month}-16`, time: '06:00', plotId: 'C-1区 苹果园', notes: '无人机叶面喷洒防虫剂', operator: '王五' },
      ];
      setActivities(mocks);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mocks));
    }
  }, []);

  const saveActivities = (newActivities: FarmActivity[]) => {
    setActivities(newActivities);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newActivities));
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paddingBefore = Array.from({ length: firstDay }, (_, i) => i);

  const handleDateClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确认删除此农事记录？')) {
      saveActivities(activities.filter(a => a.id !== id));
    }
  };

  const handleEdit = (activity: FarmActivity, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingActivity(activity);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingActivity({
      id: Date.now().toString(),
      type: 'plant',
      date: selectedDate,
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }),
      plotId: '',
      notes: '',
      operator: user?.username || '操作员'
    });
    setIsModalOpen(true);
  };

  const renderDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayActivities = activities.filter(a => a.date === dateStr);
    const isSelected = dateStr === selectedDate;
    const isToday = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') === dateStr;

    return (
      <div 
        key={day}
        onClick={() => handleDateClick(day)}
        className={cn(
          "min-h-[54px] sm:min-h-[100px] p-1 sm:p-2 border border-slate-100 dark:border-white/5 rounded-lg sm:rounded-2xl cursor-pointer transition-all duration-300 relative group overflow-hidden flex flex-col gap-1",
          isSelected ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 dark:border-emerald-500 shadow-md" : "bg-white dark:bg-[#0A0A0A] hover:bg-slate-50 dark:hover:bg-white/5"
        )}
      >
        <span className={cn(
          "text-xs sm:text-sm font-black w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full z-10",
          isSelected ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30" : isToday ? "text-emerald-500" : "text-slate-700 dark:text-slate-300"
        )}>
          {day}
        </span>
        
        <div className="relative z-10 hidden max-h-[80px] flex-1 space-y-1 overflow-y-auto no-scrollbar min-[390px]:block">
          {dayActivities.map(act => {
            const config = ACTIVITY_CONFIG[act.type];
            const Icon = config.icon;
            return (
              <div 
                key={act.id} 
                className={cn("text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1", config.bg, config.text)}
              >
                <Icon size={10} className="shrink-0" />
                <span className="truncate">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const selectedActivities = activities.filter(a => a.date === selectedDate);
  const displaySelectedDate = selectedDate.split('-').map(Number); // [Y, M, D]

  // Widget Button Formatting
  const liveDateStr = liveTime.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const liveTimeStr = liveTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const monthActivities = activities.filter(a => a.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  
  const stats = [
    { type: 'plant', count: monthActivities.filter(a => a.type === 'plant').length },
    { type: 'irrigate', count: monthActivities.filter(a => a.type === 'irrigate').length },
    { type: 'fertilize', count: monthActivities.filter(a => a.type === 'fertilize').length },
    { type: 'spray', count: monthActivities.filter(a => a.type === 'spray').length },
  ];

  return (
    <>
      <button
        onClick={() => setIsCalendarOpen(true)}
        className="hidden items-center gap-3 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-[#1A1A1A]/50 p-2.5 rounded-2xl transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-white/10 hover:shadow-sm md:flex"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0">
            <CalendarIcon size={16} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-slate-900 dark:text-white font-black leading-none">{liveTimeStr}</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 tracking-widest">{liveDateStr}</span>
          </div>
        </div>
      </button>

      {/* Main Calendar Modal */}
      {createPortal(
        <AnimatePresence>
          {isCalendarOpen && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-6 md:p-8">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCalendarOpen(false)}
                className="absolute inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-white/50 bg-white/95 text-slate-800 shadow-2xl backdrop-blur-3xl dark:border-white/10 dark:bg-[#0A0A0A]/95 dark:text-slate-200 sm:h-[90vh] sm:rounded-[48px]"
              >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-black/20 sm:p-8 sm:pb-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/20 sm:h-12 sm:w-12 sm:rounded-2xl">
                    <CalendarIcon size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-none">农事实时日历与排盘</h2>
                    <p className="hidden text-[10px] uppercase tracking-widest text-emerald-500 font-bold mt-2 sm:block sm:text-xs">
                      Farm Operations Calendar & Planning
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onMouseDown={addRipple}
                    onClick={() => {
                      const sortedActivities = [...activities].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                      
                      let template = `
                      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
                            xmlns:x="urn:schemas-microsoft-com:office:excel" 
                            xmlns="http://www.w3.org/TR/REC-html40">
                      <head>
                          <meta charset="utf-8">
                          <!--[if gte mso 9]>
                          <xml>
                              <x:ExcelWorkbook>
                                  <x:ExcelWorksheets>
                                      <x:ExcelWorksheet>
                                          <x:Name>农事日程台账</x:Name>
                                          <x:WorksheetOptions>
                                              <x:DisplayGridlines/>
                                          </x:WorksheetOptions>
                                      </x:ExcelWorksheet>
                                  </x:ExcelWorksheets>
                              </x:ExcelWorkbook>
                          </xml>
                          <![endif]-->
                          <style>
                              table { border-collapse: collapse; width: 100%; font-family: 'Microsoft YaHei', sans-serif; }
                              td, th { border: 1px solid #cbd5e1; padding: 12px; text-align: center; }
                              .header-title { background-color: #10b981; color: #ffffff; font-size: 24px; font-weight: bold; padding: 20px; }
                              .header-subtitle { background-color: #ecfdf5; color: #065f46; font-size: 14px; font-weight: bold; }
                              .col-date { width: 140px; }
                              .col-type { width: 140px; font-weight: bold; }
                              .col-title { width: 350px; text-align: left; }
                              .col-status { width: 140px; }
                          </style>
                      </head>
                      <body>
                          <table>
                              <!-- 专属大表头 -->
                              <tr>
                                  <td colspan="4" class="header-title">👑 农芯智境 · 专属农事实时排盘台账</td>
                              </tr>
                              <tr>
                                  <td colspan="4" class="header-subtitle">
                                      生成系统: 智能农事排盘引擎 | 数据范围: ${year}年整体规划 | 导出时间: ${new Date().toLocaleString()}
                                  </td>
                              </tr>
                              <!-- 字段行 -->
                              <tr style="background-color: #f1f5f9; font-weight: bold; color: #334155;">
                                  <td class="col-date">农事计划日期</td>
                                  <td class="col-type">核心业务分类</td>
                                  <td class="col-title" style="text-align: center;">具体操作内容规划</td>
                                  <td class="col-status">任务执行进度</td>
                              </tr>
                              ${sortedActivities.map(act => {
                                  const typeName = act.type === 'plant' ? '播种育苗' : 
                                                 act.type === 'harvest' ? '采收作业' : 
                                                 act.type === 'irrigate' ? '补水灌溉' : 
                                                 act.type === 'fertilize' ? '追施肥料' : '病虫防治';
                                  
                                  let typeColor = act.type === 'plant' ? '#059669' : 
                                                 act.type === 'harvest' ? '#d97706' : 
                                                 act.type === 'irrigate' ? '#2563eb' : 
                                                 act.type === 'fertilize' ? '#c026d3' : '#dc2626';

                                  const isCompleted = new Date(act.date) < new Date();
                                  const statusName = isCompleted ? '✅ 已落实验收' : '⏳ 待执行规划';
                                  let statusColor = isCompleted ? '#10b981' : '#f59e0b';
                                  
                                  return `
                                  <tr>
                                      <td>${act.date}</td>
                                      <td style="color: ${typeColor};">${typeName}</td>
                                      <td class="col-title">${act.notes || '无具体备注'}</td>
                                      <td style="color: ${statusColor}; font-weight: bold;">${statusName}</td>
                                  </tr>
                                  `;
                              }).join('')}
                              <tr>
                                  <td colspan="4" style="text-align: center; font-size: 12px; color: #94a3b8; padding-top: 30px;">
                                      * ℹ️ 本电子防伪台账由农芯智境自动提取并验证真实性，全程数据防篡改特性溯源。
                                  </td>
                              </tr>
                          </table>
                      </body>
                      </html>
                      `;
                      
                      const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const downloadAnchorNode = document.createElement('a');
                      downloadAnchorNode.setAttribute("href", url);
                      downloadAnchorNode.setAttribute("download", `农芯智境_农事排盘台账_${year}年_${month + 1}月.xls`);
                      document.body.appendChild(downloadAnchorNode);
                      downloadAnchorNode.click();
                      downloadAnchorNode.remove();
                      URL.revokeObjectURL(url);
                    }}
                    className="relative overflow-hidden hidden sm:flex px-4 h-12 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black tracking-widest transition-all items-center gap-2 border border-slate-100 dark:border-white/5 shadow-sm"
                  >
                    导出日程
                    <RippleEffect ripples={ripples} />
                  </button>
                  <button 
                    aria-label="关闭农事日历"
                    onClick={() => setIsCalendarOpen(false)} 
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-700 dark:border-white/5 dark:bg-white/5 dark:hover:text-white sm:h-12 sm:w-12 sm:rounded-2xl"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              {/* Content Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col lg:flex-row">
                {/* Left Column: Calendar Grid & Stats */}
                <div className="flex flex-1 flex-col gap-5 border-r border-slate-100 p-3 dark:border-white/5 sm:gap-8 sm:p-8">
                  
                  {/* Calendar Grid Container */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2 dark:border-white/10 dark:bg-[#0A0A0A] sm:rounded-[32px] sm:p-8">
                    <div className="mb-3 flex items-center justify-between sm:mb-8">
                      <h3 className="text-lg font-black uppercase tracking-widest text-slate-800 dark:text-slate-100 sm:text-2xl">
                        {year}年 {month + 1}月
                      </h3>
                      <div className="flex items-center gap-2">
                        <button onClick={handlePrevMonth} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                          <ChevronLeft size={18} />
                        </button>
                        <button onClick={handleNextMonth} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-3">
                      {['一', '二', '三', '四', '五', '六', '日'].map(d => (
                        <div key={d} className="text-center font-black text-xs text-slate-400 py-2">
                          {d}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                      {paddingBefore.map(p => (
                        <div key={`pad-${p}`} className="min-h-[54px] rounded-lg sm:min-h-[100px] sm:rounded-2xl" />
                      ))}
                      {days.map(renderDay)}
                    </div>
                  </div>

                  {/* Monthly Summary Stats */}
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2 tracking-widest">
                      <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                      本月农事统计月报
                    </h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                      {stats.map(s => {
                        const config = ACTIVITY_CONFIG[s.type as ActivityType];
                        const Icon = config.icon;
                        return (
                          <div key={s.type} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/[0.02] sm:gap-4 sm:rounded-3xl sm:p-4">
                            <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-inner", config.bg, config.color)}>
                              <Icon size={20} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{config.label}</div>
                              <div className="text-xl font-black text-slate-900 dark:text-white">
                                {s.count} <span className="text-[10px] text-slate-400 font-bold ml-0.5">次</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Right Column: Selected Date Tasks */}
                <div className="flex w-full shrink-0 flex-col gap-4 bg-slate-50/30 p-3 dark:bg-transparent sm:p-8 lg:w-[400px] lg:gap-6">
                  {/* Date Card */}
                  <div className="relative shrink-0 overflow-hidden rounded-2xl bg-[#020617] p-5 text-white shadow-2xl sm:rounded-[32px] sm:p-8">
                    <div className="absolute -top-20 -right-20 w-56 h-56 bg-emerald-500/20 blur-[60px] rounded-full pointer-events-none" />
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm font-bold text-emerald-400 mb-1 tracking-widest uppercase">{displaySelectedDate[0]}年</div>
                        <h3 className="text-4xl font-black tracking-tighter">
                          {displaySelectedDate[1]}月{displaySelectedDate[2]}日
                        </h3>
                        <p className="text-xs text-white/50 font-bold mt-2 tracking-widest">
                          {selectedActivities.length > 0 ? `本日共有 ${selectedActivities.length} 项农事安排` : '今日农闲，未排计划'}
                        </p>
                      </div>
                      <button 
                        onMouseDown={addRipple}
                        onClick={handleAddNew}
                        className="relative overflow-hidden w-12 h-12 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
                      >
                        <Plus size={24} />
                        <RippleEffect ripples={ripples} />
                      </button>
                    </div>
                  </div>

                  {/* Tasks List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    <div className="sticky top-0 bg-slate-50/30 dark:bg-[#121214] backdrop-blur-md pb-4 pt-2 z-10 hidden lg:block">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 tracking-widest uppercase">
                        详细安排明细
                      </h4>
                    </div>

                    {selectedActivities.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center opacity-60 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[32px]">
                        <Clock size={40} className="mb-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">当前日期未排计划</p>
                        <p className="text-xs text-slate-400 tracking-widest mt-2 uppercase">No scheduled operations</p>
                      </div>
                    ) : (
                      selectedActivities.map(act => {
                        const config = ACTIVITY_CONFIG[act.type];
                        const Icon = config.icon;
                        return (
                          <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={act.id} 
                            className="p-5 rounded-[24px] bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-white/5 shadow-sm transition-all group relative cursor-pointer"
                            onClick={(e) => handleEdit(act, e)}
                          >
                            <div className="flex items-start gap-4">
                              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner", config.bg, config.color)}>
                                <Icon size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={cn("text-[11px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider", config.bg, config.text)}>{config.label}</span>
                                  <span className="text-[11px] font-black text-slate-400 flex items-center gap-1 bg-slate-100 dark:bg-black/40 px-2 py-0.5 rounded-md">
                                    <Clock size={12} /> {act.time}
                                  </span>
                                </div>
                                <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200 truncate mt-2">
                                  📍 {act.plotId || '未指定地块'}
                                </p>
                                {act.notes && (
                                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2 leading-relaxed bg-slate-50 dark:bg-black/20 p-3 rounded-xl border border-slate-100 dark:border-white/5">
                                    {act.notes}
                                  </p>
                                )}
                                <div className="text-[10px] text-slate-400 font-bold mt-3 px-1 tracking-widest uppercase">
                                  操作人：{act.operator}
                                </div>
                              </div>
                            </div>
                            <div className="absolute right-3 top-3 flex flex-col gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity lg:right-4 lg:top-4">
                              <button
                                type="button"
                                aria-label="删除这条农事安排"
                                onClick={(e) => handleDelete(act.id, e)}
                                className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white focus-visible:outline-2 focus-visible:outline-rose-500 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* Edit/Add Modal - Separate higher z-index */}
      {createPortal(
        <AnimatePresence>
          {isModalOpen && editingActivity && (
            <div className="fixed inset-0 z-[300] flex items-end justify-center px-0 sm:items-center sm:px-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModalOpen(false)}
                className="absolute inset-0 bg-[#020617]/60 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0A0A0A] sm:max-h-[90vh] sm:rounded-[32px]"
              >
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <h3 className="font-black text-lg text-slate-900 dark:text-white tracking-tight">
                  {activities.find(a => a.id === editingActivity.id) ? '编辑农事记录' : '添加新农事'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 dark:bg-white/5 p-2 rounded-full">
                  <X size={16} />
                </button>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (activities.find(a => a.id === editingActivity.id)) {
                    saveActivities(activities.map(a => a.id === editingActivity.id ? editingActivity : a));
                  } else {
                    saveActivities([...activities, editingActivity]);
                  }
                  setIsModalOpen(false);
                }}
                className="space-y-5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6"
              >
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">农事类型 TYPE</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(ACTIVITY_CONFIG).map(([k, v]) => {
                      const Icon = v.icon;
                      return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setEditingActivity({...editingActivity, type: k as ActivityType})}
                        className={cn(
                          "py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all",
                          editingActivity.type === k 
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]" 
                            : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20"
                        )}
                      >
                        <Icon size={18} className={cn(editingActivity.type === k ? "text-emerald-500" : "text-slate-400")} />
                        <span className={cn("text-[10px] font-bold uppercase", editingActivity.type === k ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500")}>
                          {v.label}
                        </span>
                      </button>
                    )})}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">日期 DATE</label>
                    <input 
                      type="date" 
                      required
                      value={editingActivity.date}
                      onChange={e => setEditingActivity({...editingActivity, date: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-[#0F0F0F] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">时间 TIME</label>
                    <input 
                      type="time" 
                      required
                      value={editingActivity.time}
                      onChange={e => setEditingActivity({...editingActivity, time: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-[#0F0F0F] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">地块 LOCATION</label>
                    <input 
                      type="text" 
                      placeholder="例如: A-1区"
                      value={editingActivity.plotId}
                      onChange={e => setEditingActivity({...editingActivity, plotId: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-[#0F0F0F] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">操作人 OPERATOR</label>
                    <input 
                      type="text" 
                      required
                      value={editingActivity.operator}
                      onChange={e => setEditingActivity({...editingActivity, operator: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-[#0F0F0F] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">备注 NOTES</label>
                  <textarea 
                    rows={3}
                    placeholder="输入具体操作记录或观察事项..."
                    value={editingActivity.notes}
                    onChange={e => setEditingActivity({...editingActivity, notes: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-[#0F0F0F] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="submit" onMouseDown={addRipple} className="flex-1 py-4 rounded-xl relative overflow-hidden bg-[#020617] dark:bg-emerald-500 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl group">
                     {/* Light effect */}
                     <span className="absolute inset-0 w-full h-full bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[authShimmer_1.5s_infinite] skew-x-12" />
                     <span className="relative text-white font-black tracking-widest uppercase text-sm">保存记录 S A V E</span>
                     <RippleEffect ripples={ripples} />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}
  </>
);
}

