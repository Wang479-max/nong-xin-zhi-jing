import React, { useMemo } from 'react';
import { Sprout, Sun, Leaf, Wheat, Calendar, Clock } from 'lucide-react';
import { Plot } from '../services/dataService';

interface CropGrowthTimelineProps {
  plot: Plot | undefined;
}

const cropStages: Record<string, { name: string, icon: any, color: string, progress: number }[]> = {
  '小麦': [
    { name: '播种期', icon: Sprout, color: 'text-amber-600', progress: 10 },
    { name: '分蘖期', icon: Leaf, color: 'text-emerald-500', progress: 30 },
    { name: '拔节期', icon: Leaf, color: 'text-emerald-600', progress: 50 },
    { name: '抽穗期', icon: Sun, color: 'text-yellow-500', progress: 75 },
    { name: '成熟期', icon: Wheat, color: 'text-amber-500', progress: 100 },
  ],
  '玉米': [
    { name: '播种期', icon: Sprout, color: 'text-amber-600', progress: 10 },
    { name: '苗期', icon: Leaf, color: 'text-emerald-500', progress: 30 },
    { name: '穗期', icon: Sun, color: 'text-yellow-500', progress: 60 },
    { name: '花粒期', icon: Leaf, color: 'text-emerald-600', progress: 80 },
    { name: '成熟期', icon: Wheat, color: 'text-amber-500', progress: 100 },
  ],
  '大豆': [
    { name: '播种期', icon: Sprout, color: 'text-amber-600', progress: 10 },
    { name: '出苗期', icon: Leaf, color: 'text-emerald-400', progress: 25 },
    { name: '分枝期', icon: Leaf, color: 'text-emerald-500', progress: 45 },
    { name: '开花期', icon: Sun, color: 'text-yellow-500', progress: 65 },
    { name: '结荚期', icon: Leaf, color: 'text-emerald-600', progress: 85 },
    { name: '成熟期', icon: Wheat, color: 'text-amber-500', progress: 100 },
  ],
};

const defaultStages = [
  { name: '播种', icon: Sprout, color: 'text-amber-600', progress: 10 },
  { name: '生长', icon: Leaf, color: 'text-emerald-500', progress: 50 },
  { name: '成熟', icon: Wheat, color: 'text-amber-500', progress: 100 },
];

export const CropGrowthTimeline: React.FC<CropGrowthTimelineProps> = ({ plot }) => {
  if (!plot) return null;

  const stages = cropStages[plot.crop] || defaultStages;
  
  const currentStageIndex = stages.findIndex(s => s.name === plot.growthStage);
  const currentProgress = currentStageIndex >= 0 ? stages[currentStageIndex].progress : 0;

  const plantingDateStr = plot.plantingDate || '未知';
  const harvestDateStr = plot.expectedHarvestDate || '未知';

  const daysSincePlanting = useMemo(() => {
    if (!plot.plantingDate) return 0;
    const planting = new Date(plot.plantingDate);
    if (isNaN(planting.getTime())) return 0;
    // Current date logic: Using current local time 2026-06-24
    const now = new Date('2026-06-24');
    const diffTime = now.getTime() - planting.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }, [plot.plantingDate]);

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl p-6 lg:p-8 shadow-sm transition-all relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sprout className="text-emerald-500" />
            作物生长周期监控
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            当前作物: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{plot.crop}</span> | 
            当前阶段: <span className="font-semibold text-slate-700 dark:text-slate-300">{plot.growthStage || '未知'}</span>
          </p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 flex flex-col justify-center min-w-[120px]">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Clock size={14} /> 已种植天数
            </span>
            <span className="text-lg font-bold text-slate-800 dark:text-slate-200 font-mono">{daysSincePlanting} <span className="text-xs font-normal">天</span></span>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 flex flex-col justify-center min-w-[120px]">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Calendar size={14} /> 预计收割
            </span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono">{harvestDateStr}</span>
          </div>
        </div>
      </div>

      <div className="relative pt-6 pb-2 px-2">
        {/* Progress bar background */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          {/* Active progress */}
          <div 
            className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${currentProgress}%` }}
          />
        </div>

        {/* Stages */}
        <div className="relative flex justify-between">
          {stages.map((stage, idx) => {
            const isCompleted = idx <= currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            const Icon = stage.icon;
            
            return (
              <div key={idx} className="flex flex-col items-center relative z-10">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-all duration-500 ${
                    isCurrent ? 'bg-white dark:bg-slate-900 border-emerald-500 scale-125 shadow-lg shadow-emerald-500/20' :
                    isCompleted ? 'bg-emerald-500 border-emerald-500' : 
                    'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <Icon size={18} className={
                    isCurrent ? stage.color :
                    isCompleted ? 'text-white' : 
                    'text-slate-400 dark:text-slate-600'
                  } />
                </div>
                <span className={`mt-3 text-xs font-medium ${
                  isCurrent ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 
                  isCompleted ? 'text-slate-700 dark:text-slate-300' : 
                  'text-slate-400 dark:text-slate-600'
                }`}>
                  {stage.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="flex justify-between text-xs text-slate-400 mt-6 px-2 font-mono">
        <span>播种: {plantingDateStr}</span>
        <span>收割: {harvestDateStr}</span>
      </div>
    </div>
  );
};
