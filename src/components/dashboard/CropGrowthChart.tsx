import React, { useState, useEffect, useMemo } from "react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from "recharts";
import { 
  Sprout, 
  Sparkles, 
  CalendarDays, 
  TrendingUp, 
  Satellite, 
  Ruler, 
  Eye, 
  Activity,
  CheckCircle2,
  BrainCircuit
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";

interface CropGrowthChartProps {
  selectedPlotCrop: string;
  onAddSystemLog?: (text: string) => void;
  onAddNotification?: (notification: { title: string; message: string; type: "success" | "info" | "warning" | "error" }) => void;
}

// Crop specific descriptions and growth stage details
const CROP_METRICS_INFO: Record<string, {
  stage: string;
  daysToMature: number;
  healthRate: string;
  description: string;
  laiTarget: number;
  heightTarget: number;
}> = {
  "冬小麦": {
    stage: "拔节孕穗期",
    daysToMature: 45,
    healthRate: "94.5%",
    laiTarget: 4.8,
    heightTarget: 85,
    description: "当前温光水肥耦合度高，主茎拔节速度良好，冠层郁闭度符合高产群体设计。建议在接下来的抽穗期微量补充叶面磷钾肥。"
  },
  "玉米": {
    stage: "大喇叭口期",
    daysToMature: 60,
    healthRate: "91.2%",
    laiTarget: 5.5,
    heightTarget: 180,
    description: "植株进入快速纵向伸长期，对水分和氮肥需求急剧增加。当前冠层NDVI值持续走高，反映其光合合成速率处于峰值带。"
  },
  "黄瓜": {
    stage: "结瓜盛期",
    daysToMature: 30,
    healthRate: "88.7%",
    laiTarget: 3.8,
    heightTarget: 160,
    description: "侧枝生长活跃，藤蔓分布均匀。叶片大而薄，蒸腾作用偏强，需注意调控大棚夜间相对湿度，防范灰霉病滋生。"
  },
  "番茄": {
    stage: "开花坐果期",
    daysToMature: 35,
    healthRate: "92.1%",
    laiTarget: 4.2,
    heightTarget: 120,
    description: "第一、二花序坐果率稳定。冠层受光均匀，下部叶片透光透气良好。需强化土壤水分微波动控制，防范脐腐病风险。"
  }
};

export default function CropGrowthChart({ 
  selectedPlotCrop, 
  onAddSystemLog,
  onAddNotification 
}: CropGrowthChartProps) {
  // Crop state - defaults to winter wheat if not specified
  const [selectedCrop, setSelectedCrop] = useState<string>("冬小麦");
  const [activeMetric, setActiveMetric] = useState<"lai" | "ndvi" | "height">("lai");
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationCounter, setCalibrationCounter] = useState<number>(0);

  // Sync with selected plot's crop
  useEffect(() => {
    if (selectedPlotCrop && selectedPlotCrop !== "all") {
      // Find matches in our supported crops
      const matched = Object.keys(CROP_METRICS_INFO).find(c => selectedPlotCrop.includes(c));
      if (matched) {
        setSelectedCrop(matched);
        if (onAddSystemLog) {
          onAddSystemLog(`[CROP_GROWTH] 生长分析仪自动联动切换至所选地块作物: 「${matched}」`);
        }
      }
    }
  }, [selectedPlotCrop]);

  // Generate 30 days of data ending at current date
  const chartData = useMemo(() => {
    const data = [];
    const now = new Date();
    
    // Seed variation based on selected crop and calibration cycles
    let seedMultiplier = 1.0;
    if (selectedCrop === "玉米") seedMultiplier = 1.25;
    if (selectedCrop === "黄瓜") seedMultiplier = 0.85;
    if (selectedCrop === "番茄") seedMultiplier = 0.95;

    // Small boost when user runs satellite calibration
    const calibrationBoost = calibrationCounter * 0.04;

    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

      // Sigmoid growth simulation for 30 days
      const progress = (30 - i) / 30; // 0 to 1
      const sigmoidProgress = 1 / (1 + Math.exp(-6 * (progress - 0.4))); // smooth s-curve

      // Base metrics calculations
      let laiBase = 0.5 + 4.5 * sigmoidProgress * seedMultiplier;
      let ndviBase = 0.15 + 0.72 * (1 - Math.exp(-0.6 * laiBase));
      let heightBase = 10 + 150 * sigmoidProgress * seedMultiplier;

      // Adjust height ranges realistic for crops
      if (selectedCrop === "冬小麦") {
        laiBase = 0.8 + 3.8 * sigmoidProgress;
        ndviBase = 0.2 + 0.65 * (1 - Math.exp(-0.7 * laiBase));
        heightBase = 15 + 68 * sigmoidProgress;
      } else if (selectedCrop === "黄瓜") {
        laiBase = 0.4 + 3.2 * sigmoidProgress;
        ndviBase = 0.12 + 0.68 * (1 - Math.exp(-0.5 * laiBase));
        heightBase = 20 + 130 * sigmoidProgress;
      } else if (selectedCrop === "番茄") {
        laiBase = 0.5 + 3.5 * sigmoidProgress;
        ndviBase = 0.15 + 0.7 * (1 - Math.exp(-0.6 * laiBase));
        heightBase = 18 + 95 * sigmoidProgress;
      }

      // Add minor realistic daily fluctuations
      const noise = Math.sin(i * 0.7) * 0.05 + Math.cos(i * 1.3) * 0.02;
      
      const finalLai = Math.max(0.1, Number((laiBase + noise * 0.2 + calibrationBoost).toFixed(2)));
      const finalNdvi = Math.min(0.99, Math.max(0.05, Number((ndviBase + noise * 0.03 + calibrationBoost * 0.05).toFixed(2))));
      const finalHeight = Math.max(5, Math.round(heightBase + noise * 1.5 + calibrationBoost * 1.2));

      data.push({
        date: dateStr,
        lai: finalLai,
        ndvi: finalNdvi,
        height: finalHeight
      });
    }
    return data;
  }, [selectedCrop, calibrationCounter]);

  // Current metrics (the last item in the array)
  const currentMetrics = useMemo(() => {
    if (chartData.length === 0) return { lai: 0, ndvi: 0, height: 0 };
    return chartData[chartData.length - 1];
  }, [chartData]);

  // Starting metrics (the first item in the array)
  const startingMetrics = useMemo(() => {
    if (chartData.length === 0) return { lai: 0, ndvi: 0, height: 0 };
    return chartData[0];
  }, [chartData]);

  // Growth rates & changes
  const metricsChange = useMemo(() => {
    const laiDiff = currentMetrics.lai - startingMetrics.lai;
    const laiPct = (laiDiff / (startingMetrics.lai || 1)) * 100;

    const ndviDiff = currentMetrics.ndvi - startingMetrics.ndvi;
    const ndviPct = (ndviDiff / (startingMetrics.ndvi || 1)) * 100;

    const heightDiff = currentMetrics.height - startingMetrics.height;
    const heightPct = (heightDiff / (startingMetrics.height || 1)) * 100;

    return {
      lai: { diff: laiDiff.toFixed(2), pct: laiPct.toFixed(1) },
      ndvi: { diff: ndviDiff.toFixed(2), pct: ndviPct.toFixed(1) },
      height: { diff: heightDiff, pct: heightPct.toFixed(1) }
    };
  }, [currentMetrics, startingMetrics]);

  // Current active configuration for charts
  const metricConfig = useMemo(() => {
    const config = {
      lai: {
        label: "叶面积指数 (LAI)",
        unit: "",
        color: "#10b981", // Emerald
        gradientId: "colorLai",
        description: "单位地表面积上绿叶面积的总和。是表征作物冠层结构和光合合成潜力的核心生化参数。"
      },
      ndvi: {
        label: "植被归一化指数 (NDVI)",
        unit: "",
        color: "#14b8a6", // Teal
        gradientId: "colorNdvi",
        description: "利用近红外与红光波段的反射率比值进行计算。高度相关于叶绿素活性与作物氮素营养水平。"
      },
      height: {
        label: "平均冠层高度",
        unit: "cm",
        color: "#059669", // Medium Emerald
        gradientId: "colorHeight",
        description: "冠层纵向生长的宏观几何参数。直接反映作物的长势状态及所处的生育期进程。"
      }
    };
    return config[activeMetric];
  }, [activeMetric]);

  const activeCropInfo = CROP_METRICS_INFO[selectedCrop] || CROP_METRICS_INFO["冬小麦"];

  // Satellite Calibration simulator action
  const handleSatelliteCalibration = () => {
    setIsCalibrating(true);
    if (onAddSystemLog) {
      onAddSystemLog(`[SATELLITE_TASK] 正在握手联接 Sentinel-2B 欧空局多光谱遥感星座...`);
      onAddSystemLog(`[SATELLITE_TASK] 解析赤道反射谱段 B4(红光)与 B8(近红外)，正在对 ${selectedCrop} 冠层郁闭度执行二次网格校准...`);
    }

    setTimeout(() => {
      setIsCalibrating(false);
      setCalibrationCounter(prev => prev + 1);
      
      if (onAddNotification) {
        onAddNotification({
          title: "卫星冠层谱段校准成功",
          message: `已拉取最新红外光谱合成反演图，更新了「${selectedCrop}」的叶绿素及LAI郁闭反演系数。`,
          type: "success"
        });
      }

      if (onAddSystemLog) {
        onAddSystemLog(`[SENSING_OK] 多光谱微网格重算完成！高精反演 LAI 偏差率下调 0.02，数据一致性校准通过。`);
      }
    }, 2000);
  };

  return (
    <div 
      id="crop-growth-trend-card" 
      className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-[2.5rem] p-6 lg:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative overflow-hidden flex flex-col gap-8 transition-all"
    >
      {/* Dynamic Decorator Laser/Satellite lines */}
      <div className="absolute top-0 right-0 w-[400px] h-[300px] bg-emerald-500/[0.01] pointer-events-none rounded-full blur-3xl" />
      
      {/* Header Container */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-50 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-3.5">
          <div className="w-1.5 h-6 bg-emerald-500 rounded-full animate-pulse" />
          <div className="flex flex-col">
            <h3 className="text-lg sm:text-xl font-black text-slate-850 dark:text-slate-100 tracking-tight italic flex items-center gap-2">
              <Sprout className="text-emerald-500" size={20} />
              作物 30 天历史长势与生理发育监测
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest font-mono mt-0.5">
              Crop Biophysical Properties Sat-Inversion View
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto z-10">
          
          {/* Crop Selector dropdown or buttons */}
          <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-[#151515]/60 border border-slate-200/50 dark:border-white/5 p-1 rounded-xl">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-2 hidden sm:inline">当前监测:</span>
            <select
              value={selectedCrop}
              onChange={(e) => {
                setSelectedCrop(e.target.value);
                if (onAddSystemLog) {
                  onAddSystemLog(`[CROP_GROWTH] 手动切换生化分析目标至「${e.target.value}」`);
                }
              }}
              className="bg-white dark:bg-slate-850 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded-lg px-3 py-1 text-xs font-black text-slate-800 dark:text-white outline-none cursor-pointer transition-all"
            >
              {Object.keys(CROP_METRICS_INFO).map((crop) => (
                <option key={crop} value={crop}>{crop}</option>
              ))}
            </select>
          </div>

          {/* Satellite Handshake Action button */}
          <button
            onClick={handleSatelliteCalibration}
            disabled={isCalibrating}
            className={cn(
              "px-4 py-2 border rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 shadow-sm",
              isCalibrating
                ? "bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-white/5 text-slate-400"
                : "bg-emerald-500 hover:bg-emerald-600 border-emerald-500 text-white shadow-emerald-500/10"
            )}
          >
            {isCalibrating ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border border-slate-300 border-t-transparent animate-spin" />
                <span>光谱解算中...</span>
              </>
            ) : (
              <>
                <Satellite size={14} className="animate-bounce" />
                <span>联接遥感星轨校准</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Info panel + Chart */}
      <div className="grid grid-cols-12 gap-6 lg:gap-8 items-stretch relative">
        
        {/* Signal Scanning overlay during calibration */}
        <AnimatePresence>
          {isCalibrating && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-white/40 dark:bg-slate-950/40 rounded-3xl backdrop-blur-sm flex flex-col items-center justify-center border border-emerald-500/10"
            >
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                <Satellite className="absolute text-emerald-500 animate-pulse" size={24} />
              </div>
              <p className="text-xs font-black text-slate-800 dark:text-white mt-4 font-mono tracking-widest animate-pulse">
                RETRIEVING SPECTRAL BAND MATRIX B4/B8...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. Left Grid Side: Current growth status indicators */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5 justify-between">
          
          {/* Main Info Card */}
          <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-white/5 p-5 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CalendarDays size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Current Fertility Phase</span>
                <span className="text-sm font-black text-slate-800 dark:text-white">{activeCropInfo.stage}</span>
              </div>
            </div>

            <div className="h-[1px] bg-slate-150 dark:bg-white/[0.04]" />

            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                {activeCropInfo.description}
              </p>
              
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-lg">
                  <CheckCircle2 size={12} />
                  综合健康度 {activeCropInfo.healthRate}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-lg">
                  预计成熟周期 {activeCropInfo.daysToMature} 天
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* LAI Box */}
            <div 
              onClick={() => setActiveMetric("lai")}
              className={cn(
                "p-4 rounded-2xl border cursor-pointer transition-all flex flex-col gap-2 select-none",
                activeMetric === "lai"
                  ? "bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "bg-slate-50/50 dark:bg-[#151515]/30 border-slate-100 dark:border-white/5 text-slate-400 dark:text-slate-500 hover:border-slate-300"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-wider font-mono">LAI 指数</span>
                <Activity size={14} />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-slate-850 dark:text-slate-100 font-mono italic">{currentMetrics.lai}</span>
                <span className="text-[10px] font-medium text-slate-400">/ 6.0</span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                <TrendingUp size={10} className="text-emerald-500" />
                30天增长 {metricsChange.lai.pct}%
              </span>
            </div>

            {/* NDVI Box */}
            <div 
              onClick={() => setActiveMetric("ndvi")}
              className={cn(
                "p-4 rounded-2xl border cursor-pointer transition-all flex flex-col gap-2 select-none",
                activeMetric === "ndvi"
                  ? "bg-teal-500/5 dark:bg-teal-500/10 border-teal-500/40 text-teal-600 dark:text-teal-400"
                  : "bg-slate-50/50 dark:bg-[#151515]/30 border-slate-100 dark:border-white/5 text-slate-400 dark:text-slate-500 hover:border-slate-300"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-wider font-mono">NDVI 植被</span>
                <Eye size={14} />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-slate-850 dark:text-slate-100 font-mono italic">{currentMetrics.ndvi}</span>
                <span className="text-[10px] font-medium text-slate-400">/ 1.0</span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                <TrendingUp size={10} className="text-emerald-500" />
                30天攀升 {metricsChange.ndvi.pct}%
              </span>
            </div>

            {/* Canopy Height Box */}
            <div 
              onClick={() => setActiveMetric("height")}
              className={cn(
                "col-span-2 p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between select-none",
                activeMetric === "height"
                  ? "bg-emerald-600/5 dark:bg-emerald-600/10 border-emerald-600/40 text-emerald-600 dark:text-emerald-400"
                  : "bg-slate-50/50 dark:bg-[#151515]/30 border-slate-100 dark:border-white/5 text-slate-400 dark:text-slate-500 hover:border-slate-300"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-150 dark:bg-white/[0.04]">
                  <Ruler size={16} />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-wider block font-mono">平均冠层高度</span>
                  <div className="flex items-baseline gap-0.5 mt-0.5">
                    <span className="text-xl font-black text-slate-850 dark:text-slate-100 font-mono italic">{currentMetrics.height}</span>
                    <span className="text-[9px] font-medium text-slate-400">cm</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-black text-emerald-500 flex items-center gap-1 pr-2 font-mono">
                ↑ {metricsChange.height.diff}cm (+{metricsChange.height.pct}%)
              </span>
            </div>

          </div>

        </div>

        {/* 2. Right Grid Side: Interactive Recharts Visualizer */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5 h-[340px] lg:h-auto min-h-[300px]">
          
          {/* Header metric selection info strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-950/20 border border-slate-100 dark:border-white/5 rounded-2xl px-5 py-3 text-xs leading-relaxed transition-colors">
            <div className="flex flex-col">
              <span className="font-black text-slate-750 dark:text-slate-200">{metricConfig.label} 30天成长态势线</span>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-normal">{metricConfig.description}</p>
            </div>
            
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 font-mono text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <BrainCircuit size={12} />
              <span>数据插值校准：AISTUDIO_V5</span>
            </div>
          </div>

          {/* Actual Recharts Area Plotting */}
          <div className="flex-1 min-h-[220px] relative w-full border border-slate-50 dark:border-white/5 bg-slate-50/20 dark:bg-slate-950/20 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={metricConfig.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metricConfig.color} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={metricConfig.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }} 
                />
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                <Tooltip 
                  isAnimationActive={false}
                  cursor={{ stroke: metricConfig.color, strokeWidth: 1.5, strokeDasharray: '3 3' }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', 
                    backgroundColor: 'var(--tw-colors-slate-900)', 
                    color: 'white', 
                    fontSize: '11px', 
                    fontWeight: 'bold' 
                  }}
                  itemStyle={{ padding: '2px 0', fontSize: '13px', fontWeight: 'bold' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '9px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                />
                <Area 
                  type="monotone" 
                  name={`${metricConfig.label} ${metricConfig.unit ? `(${metricConfig.unit})` : ""}`} 
                  dataKey={activeMetric} 
                  stroke={metricConfig.color} 
                  strokeWidth={3.5} 
                  fillOpacity={1} 
                  fill={`url(#${metricConfig.gradientId})`}
                  isAnimationActive={true}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

        </div>

      </div>

    </div>
  );
}
