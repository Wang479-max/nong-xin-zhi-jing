import React, { useState, useEffect } from "react";
import { DigitalTwinProps } from "./shared/types";
import DataService from "../../services/dataService";
import {
  Camera,
  Map as MapIcon,
  RefreshCw,
  Activity,
  Cpu,
  Play,
  Maximize,
  Sprout,
  TrendingUp,
  Zap,
  FlaskConical,
  Gauge,
  BrainCircuit,
  HeartPulse,
  AlertTriangle,
  Droplets,
  Wind,
  Sun as SunIcon,
  Thermometer,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { motion } from "motion/react";

import {
  DashboardPanels,
  EnvPanels,
  DevicePanels,
  PersonnelPanels,
} from "./HUDPanels";

interface HUDProps extends DigitalTwinProps {
  viewMode: "macro" | "micro";
  onToggleView: () => void;
}

export default function HUD({
  viewMode,
  onToggleView,
  activePlotId,
  plots,
  hardwareStatus,
  aiResult,
  realtimeData,
  onExit,
  isImmersive,
  onToggleImmersive,
  onControlHardware,
  readOnly,
}: HUDProps) {
  const [time, setTime] = useState(new Date());
  const [showPanels, setShowPanels] = useState(true);
  const [isFirstPerson, setIsFirstPerson] = useState(false);
  const [activeMacroTab, setActiveMacroTab] = useState<
    "dashboard" | "monitoring" | "management" | "ai" | "ai-insight"
  >("dashboard");
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<any>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePlantClick = (e: any) => {
      setSelectedPlant(e.detail.plant);
      if (e.detail.plant) {
        setShowPanels(true); // Auto show panels when plant selected
      }
    };
    window.addEventListener("farm-plant-click", handlePlantClick);
    return () => window.removeEventListener("farm-plant-click", handlePlantClick);
  }, []);

  useEffect(() => {
    setSystemLogs(DataService.getDashboardLogs());
    const unsubscribe = DataService.subscribe(() => {
      setSystemLogs(DataService.getDashboardLogs());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClosePopups = () => {
      setShowPanels(false);
    };
    window.addEventListener("closeAllPopups", handleClosePopups);
    return () =>
      window.removeEventListener("closeAllPopups", handleClosePopups);
  }, []);

  const formatTime = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col p-6 font-sans">
      {/* Visual Hologram grid & CRT Scanline CSS Overlays */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[size:100%_4px] opacity-40 z-30" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] z-20" />

      {/* Top Header */}
      <div className="flex justify-between items-start z-50 pointer-events-auto">
        <div className="w-auto max-w-[48%] sm:w-80 flex flex-col gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md border border-emerald-500/50 text-emerald-400 px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all text-xs flex items-center gap-2 font-bold w-fit"
            >
              <Activity size={14} />
              返回数据控制台
            </button>
          )}
          {/* Mode Toggle Button */}
          <div className="flex gap-2">
            <button
              onClick={onToggleView}
              className="bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md border border-cyan-500/50 text-cyan-400 px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all text-xs flex items-center gap-2 font-bold w-fit"
            >
              {viewMode === "macro" ? (
                <Camera size={14} />
              ) : (
                <MapIcon size={14} />
              )}
              {viewMode === "macro" ? "切换至农田微观孪生" : "返回全球卫星地图"}
            </button>
            <button
              onClick={onToggleImmersive}
              className="bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md border border-cyan-500/50 text-cyan-400 px-3 py-2 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all flex items-center justify-center"
              title="全屏沉浸模式"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="relative">
            <h1
              className="text-3xl font-black text-white tracking-widest text-shadow-lg mb-1"
              style={{
                textShadow:
                  "0 2px 10px rgba(0,0,0,0.8), 0 0 20px rgba(6,182,212,0.5)",
              }}
            >
              智慧农业大棚管控平台
            </h1>
            <div className="absolute -top-4 -left-12 w-8 h-8 border-t-2 border-l-2 border-cyan-400" />
            <div className="absolute -bottom-2 -right-12 w-8 h-8 border-b-2 border-r-2 border-cyan-400" />
          </div>
          <p className="text-emerald-400 text-sm font-mono tracking-widest text-shadow-sm font-bold">
            {formatTime(time)}
          </p>

          <div className="flex gap-2 mt-4 text-[10px] font-bold text-white tracking-wider">
            {[
              "屋顶显隐",
              "区块显隐",
              "作物区域显隐",
              "监控POI显隐",
              showPanels ? "关闭全部弹窗" : "显示全部弹窗",
              isFirstPerson ? "全局俯瞰模式" : "第一人称模式",
            ].map((label) => (
              <button
                key={label}
                onClick={() => {
                  if (label === "关闭全部弹窗" || label === "显示全部弹窗") {
                    const nextState = label === "显示全部弹窗";
                    setShowPanels(nextState);
                    if (!nextState) {
                      window.dispatchEvent(new CustomEvent("closeAllPopups"));
                    } else {
                      window.dispatchEvent(new CustomEvent("openAllPopups"));
                    }
                  } else if (label === "屋顶显隐") {
                    window.dispatchEvent(new CustomEvent("toggleRoof"));
                  } else if (label === "区块显隐") {
                    window.dispatchEvent(new CustomEvent("togglePlot"));
                  } else if (label === "作物区域显隐") {
                    window.dispatchEvent(new CustomEvent("toggleCrop"));
                  } else if (label === "监控POI显隐") {
                    window.dispatchEvent(new CustomEvent("togglePOI"));
                  } else if (
                    label === "第一人称模式" ||
                    label === "全局俯瞰模式"
                  ) {
                    setIsFirstPerson((v) => !v);
                    window.dispatchEvent(new CustomEvent("toggleFirstPerson"));
                  }
                }}
                className="px-3 py-1 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/40 rounded shadow-[inset_0_0_10px_rgba(6,182,212,0.2)] transition-all"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-auto max-w-[48%] sm:w-80 flex justify-end">
          <div className="bg-slate-900/60 backdrop-blur-md border border-cyan-500/50 p-2 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-cyan-950/50 flex items-center justify-center text-cyan-400">
              <Cpu
                size={16}
                className="animate-spin"
                style={{ animationDuration: "8s" }}
              />
            </div>
            <div className="text-right">
              <div className="text-cyan-400 text-[10px] font-bold tracking-widest">
                AETHERIS ENGINE
              </div>
              <div className="text-emerald-400 text-[9px] font-mono">
                60 FPS / SYNC OK
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex justify-between mt-6 relative z-40 pb-20 min-h-0">
        {/* Left Panel */}
        <div
          className={`w-[320px] flex flex-col gap-4 overflow-y-auto hide-scrollbar ${viewMode === "macro" ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          {showPanels && viewMode === "macro" && (
            <>
              {activeMacroTab === "dashboard" && <DashboardPanels.Left realtimeData={realtimeData} hardwareStatus={hardwareStatus} />}
              {activeMacroTab === "monitoring" && <EnvPanels.Left realtimeData={realtimeData} />}
              {!readOnly && activeMacroTab === "management" && <DevicePanels.Left hardwareStatus={hardwareStatus} onControlHardware={onControlHardware} />}
              {activeMacroTab === "ai" && <PersonnelPanels.Left realtimeData={realtimeData} systemLogs={systemLogs} />}
              {activeMacroTab === "ai-insight" && <AIInsightLeft aiResult={aiResult} plot={plots?.find((p) => p.id === activePlotId)} realtimeData={realtimeData} />}
            </>
          )}
        </div>

        {/* Right Panel */}
        <div
          className={`w-[320px] flex flex-col gap-4 overflow-y-auto hide-scrollbar ${viewMode === "macro" ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          {showPanels && viewMode === "macro" && (
            <>
              {activeMacroTab === "dashboard" && <DashboardPanels.Right realtimeData={realtimeData} systemLogs={systemLogs} time={time} />}
              {activeMacroTab === "monitoring" && <EnvPanels.Right realtimeData={realtimeData} />}
              {!readOnly && activeMacroTab === "management" && <DevicePanels.Right hardwareStatus={hardwareStatus} onControlHardware={onControlHardware} />}
              {activeMacroTab === "ai" && <PersonnelPanels.Right />}
              {activeMacroTab === "ai-insight" && <AIInsightRight aiResult={aiResult} realtimeData={realtimeData} />}
            </>
          )}
        </div>

        {/* Center Bottom Control Panel */}
        <div
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center w-[600px] max-w-[96vw] transition-all ${viewMode === "macro" ? "pointer-events-auto" : "pointer-events-none opacity-0"}`}
        >
          <div className="flex gap-4 mb-2">
            {[
              { id: "dashboard", label: "基地概览" },
              { id: "monitoring", label: "环境监测" },
              ...(!readOnly ? [{ id: "management", label: "设备管控" }] : []),
              { id: "ai", label: "人员管理" },
              { id: "ai-insight", label: "AI 研判" },
            ].map((tab) => {
              const isActive = activeMacroTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveMacroTab(tab.id as any);
                  }}
                  className={`px-6 py-2 rounded-full font-bold text-sm tracking-widest transition-all ${isActive ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]" : "bg-slate-900/40 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-900/40 hover:text-emerald-300"}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="w-full h-12 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none" />
        </div>

        {/* Micro View Selected Plant Panel */}
        {viewMode === "micro" && selectedPlant && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2 w-80 pointer-events-auto z-50">
            <div className="bg-slate-950/85 backdrop-blur-xl border border-cyan-500/50 rounded-2xl p-5 shadow-[0_0_40px_rgba(6,182,212,0.2)] text-white">
              <div className="flex justify-between items-center mb-4 border-b border-cyan-500/30 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
                  <span className="text-sm font-bold text-cyan-300 tracking-[0.2em] uppercase">单株精准画像</span>
                </div>
                <button 
                  onClick={() => setSelectedPlant(null)}
                  className="text-slate-400 hover:text-rose-400 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-xs">状态评估</span>
                  <span className={`text-sm font-bold ${
                    selectedPlant.status === 'healthy' ? 'text-emerald-400' :
                    selectedPlant.status === 'drought' ? 'text-yellow-400' :
                    selectedPlant.status === 'pest' ? 'text-rose-400' : 'text-blue-400'
                  }`}>
                    {selectedPlant.status === 'healthy' ? '健康优良' :
                     selectedPlant.status === 'drought' ? '中度干旱' :
                     selectedPlant.status === 'pest' ? '病害侵染' : '氮素缺乏'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                     <span className="text-slate-500 text-[10px] uppercase block mb-1">冠层高度 / 生育期</span>
                     <span className="text-cyan-400 font-mono font-bold">{selectedPlant.scale.toFixed(2)}m <span className="text-slate-400 text-xs ml-1 font-sans">({selectedPlant.growthStage === 1.0 ? '成熟期' : selectedPlant.growthStage >= 0.8 ? '抽穗期' : selectedPlant.growthStage >= 0.5 ? '拔节期' : '苗期'})</span></span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                     <span className="text-slate-500 text-[10px] uppercase block mb-1">点位土壤参数</span>
                     <div className="text-cyan-400 font-mono font-bold text-xs flex justify-between">
                       <span>W: {selectedPlant.soilMoisture}%</span>
                       <span>N: {selectedPlant.soilN}mg/kg</span>
                     </div>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                     <span className="text-slate-500 text-[10px] uppercase block mb-1">长势综合评分</span>
                     <span className={`font-mono font-bold text-lg ${parseFloat(selectedPlant.score) > 85 ? 'text-emerald-400' : parseFloat(selectedPlant.score) > 65 ? 'text-yellow-400' : 'text-rose-400'}`}>{selectedPlant.score}</span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                     <span className="text-slate-500 text-[10px] uppercase block mb-1">坐标定位</span>
                     <span className="text-cyan-400 font-mono font-bold">X:{selectedPlant.x.toFixed(1)} Z:{selectedPlant.z.toFixed(1)}</span>
                  </div>
                </div>

                {selectedPlant.status !== 'healthy' && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    <button className="w-full py-2 bg-rose-500/20 border border-rose-500/50 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-500/40 transition-all">
                      下发精准处方干预
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== AI 研判面板：将 3D 孪生与「AI 智能种植推荐 / ROI 核算」「环境监测」模块数据联动 ===== */

type Accent = "cyan" | "emerald" | "amber" | "rose";
const ACCENT_GLOW: Record<Accent, string> = {
  cyan: "bg-cyan-500/10",
  emerald: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  rose: "bg-rose-500/10",
};
const ACCENT_ICON: Record<Accent, string> = {
  cyan: "bg-cyan-500/15 text-cyan-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  rose: "bg-rose-500/15 text-rose-300",
};

const HudCard: React.FC<{ title: string; icon: React.ReactNode; accent?: Accent; children: React.ReactNode }> = ({
  title,
  icon,
  accent = "cyan",
  children,
}) => (
  <div className="bg-slate-950/70 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(6,182,212,0.12)] relative overflow-hidden">
    <div className={`absolute -top-10 -right-10 w-24 h-24 ${ACCENT_GLOW[accent]} blur-2xl rounded-full pointer-events-none`} />
    <div className="flex items-center gap-2 mb-3 border-b border-cyan-500/20 pb-2 relative z-10">
      <div className={`w-7 h-7 rounded-lg ${ACCENT_ICON[accent]} flex items-center justify-center`}>{icon}</div>
      <span className="text-xs font-bold text-cyan-200 tracking-[0.18em] uppercase">{title}</span>
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);

// ============ 实时研判引擎（无需手动跑分析，基于实时传感器数据计算，真实有效）============
type Severity = "normal" | "watch" | "alert";

// 各指标的适宜区间（通用设施农业经验值）
const IDEAL_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  temperature: { min: 18, max: 30, unit: "℃", label: "气温" },
  humidity: { min: 55, max: 80, unit: "%", label: "湿度" },
  soilMoisture: { min: 35, max: 70, unit: "%", label: "土壤湿度" },
  pH: { min: 6.0, max: 7.0, unit: "", label: "pH 值" },
};

function getMetric(rt: any, key: string): number | undefined {
  if (!rt) return undefined;
  if (key === "pH") return rt.pH ?? rt.ph;
  return rt[key];
}

// 综合长势健康评分：各指标偏离适宜区间越远扣分越多
function computeHealthScore(rt: any): { score: number; level: string; color: string } {
  let score = 100;
  Object.keys(IDEAL_RANGES).forEach((key) => {
    const v = getMetric(rt, key);
    if (v === undefined || v === null || isNaN(v)) return;
    const { min, max } = IDEAL_RANGES[key];
    const span = max - min;
    if (v < min) score -= Math.min(28, ((min - v) / span) * 45);
    else if (v > max) score -= Math.min(28, ((v - max) / span) * 45);
  });
  score = Math.round(Math.max(20, Math.min(100, score)));
  const level = score >= 85 ? "长势优良" : score >= 70 ? "长势良好" : score >= 55 ? "亚健康" : "胁迫预警";
  const color = score >= 85 ? "text-emerald-400" : score >= 70 ? "text-cyan-400" : score >= 55 ? "text-yellow-400" : "text-rose-400";
  return { score, level, color };
}

// 实时环境胁迫诊断
function computeStressFlags(rt: any): { label: string; detail: string; sev: Severity }[] {
  const flags: { label: string; detail: string; sev: Severity }[] = [];
  const temp = getMetric(rt, "temperature");
  const hum = getMetric(rt, "humidity");
  const soil = getMetric(rt, "soilMoisture");
  const ph = getMetric(rt, "pH");
  const light = rt?.light;
  const co2 = rt?.co2;
  if (temp !== undefined) {
    if (temp > 33) flags.push({ label: "高温胁迫", detail: `气温 ${temp.toFixed(1)}℃ 偏高`, sev: "alert" });
    else if (temp < 15) flags.push({ label: "低温胁迫", detail: `气温 ${temp.toFixed(1)}℃ 偏低`, sev: "alert" });
    else if (temp > 30) flags.push({ label: "温度偏高", detail: `接近上限 ${temp.toFixed(1)}℃`, sev: "watch" });
  }
  if (soil !== undefined) {
    if (soil < 25) flags.push({ label: "干旱胁迫", detail: `土壤湿度 ${soil.toFixed(0)}% 偏低`, sev: "alert" });
    else if (soil > 80) flags.push({ label: "渍涝风险", detail: `土壤湿度 ${soil.toFixed(0)}% 偏高`, sev: "watch" });
    else if (soil < 35) flags.push({ label: "水分偏少", detail: `接近下限 ${soil.toFixed(0)}%`, sev: "watch" });
  }
  if (hum !== undefined) {
    if (hum > 90) flags.push({ label: "高湿病害风险", detail: `空气湿度 ${hum.toFixed(0)}% 过高`, sev: "watch" });
    else if (hum < 40) flags.push({ label: "空气干燥", detail: `湿度 ${hum.toFixed(0)}% 偏低`, sev: "watch" });
  }
  if (ph !== undefined) {
    if (ph < 5.5) flags.push({ label: "土壤偏酸", detail: `pH ${ph.toFixed(1)}`, sev: "alert" });
    else if (ph > 7.8) flags.push({ label: "土壤偏碱", detail: `pH ${ph.toFixed(1)}`, sev: "alert" });
    else if (ph < 6.0) flags.push({ label: "酸度偏低", detail: `pH ${ph.toFixed(1)}`, sev: "watch" });
  }
  if (light !== undefined && light < 4000) flags.push({ label: "光照不足", detail: `${light}Lx 低于阈值`, sev: "watch" });
  if (co2 !== undefined && co2 < 350) flags.push({ label: "CO₂ 偏低", detail: `${co2}ppm 影响光合`, sev: "watch" });
  return flags;
}

// 智能农事建议（规则引擎，从实时数据派生可执行操作）
function computeFarmingAdvice(rt: any): { text: string; icon: "water" | "wind" | "light" | "ph" | "ok"; priority: "高" | "中" | "低" }[] {
  const adv: { text: string; icon: "water" | "wind" | "light" | "ph" | "ok"; priority: "高" | "中" | "低" }[] = [];
  const temp = getMetric(rt, "temperature");
  const soil = getMetric(rt, "soilMoisture");
  const hum = getMetric(rt, "humidity");
  const ph = getMetric(rt, "pH");
  const light = rt?.light;
  if (soil !== undefined && soil < 30) adv.push({ text: `土壤湿度仅 ${soil.toFixed(0)}%，建议立即启动微喷灌溉补水`, icon: "water", priority: "高" });
  if (temp !== undefined && temp > 33) adv.push({ text: `气温 ${temp.toFixed(1)}℃ 偏高，建议开启通风并配合遮阳降温`, icon: "wind", priority: "高" });
  if (hum !== undefined && hum > 90) adv.push({ text: `湿度 ${hum.toFixed(0)}% 过高，建议加强通风以防霉变病害`, icon: "wind", priority: "中" });
  if (light !== undefined && light < 4000) adv.push({ text: `光照 ${light}Lx 不足，建议开启光谱补光维持光合`, icon: "light", priority: "中" });
  if (ph !== undefined && ph < 5.8) adv.push({ text: `pH ${ph.toFixed(1)} 偏酸，建议追施石灰类调理剂调节酸度`, icon: "ph", priority: "中" });
  if (soil !== undefined && soil > 80) adv.push({ text: `土壤湿度 ${soil.toFixed(0)}% 偏高，建议暂停灌溉并排涝`, icon: "water", priority: "中" });
  if (adv.length === 0) adv.push({ text: "各项环境指标均处于适宜区间，维持当前管理策略即可", icon: "ok", priority: "低" });
  return adv;
}

// 适宜区间对比条
const RangeBar: React.FC<{ value: number; min: number; max: number }> = ({ value, min, max }) => {
  const lo = min - (max - min) * 0.6;
  const hi = max + (max - min) * 0.6;
  const clamp = (n: number) => Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100));
  const inRange = value >= min && value <= max;
  return (
    <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
      <div className="absolute h-full bg-emerald-500/25" style={{ left: `${clamp(min)}%`, width: `${clamp(max) - clamp(min)}%` }} />
      <div className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${inRange ? "bg-emerald-400" : "bg-rose-400"} ring-2 ring-slate-950`} style={{ left: `calc(${clamp(value)}% - 3px)` }} />
    </div>
  );
};

const SEV_STYLE: Record<Severity, string> = {
  normal: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  watch: "text-yellow-300 border-yellow-500/30 bg-yellow-500/10",
  alert: "text-rose-300 border-rose-500/30 bg-rose-500/10",
};

const AIInsightEmpty: React.FC<{ realtimeData?: any }> = ({ realtimeData }) => {
  const hasRt = !!realtimeData;
  const { score, level, color } = computeHealthScore(realtimeData);
  const flags = computeStressFlags(realtimeData);
  const ringColor = score >= 85 ? "#34d399" : score >= 70 ? "#22d3ee" : score >= 55 ? "#facc15" : "#fb7185";
  return (
    <>
      <HudCard title="实时长势诊断" icon={<HeartPulse size={16} />} accent={score >= 70 ? "emerald" : "amber"}>
        {hasRt ? (
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1e293b" strokeWidth="3" />
                <motion.circle
                  cx="18" cy="18" r="15.5" fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 97.4} 97.4`}
                  initial={{ strokeDasharray: "0 97.4" }}
                  animate={{ strokeDasharray: `${(score / 100) * 97.4} 97.4` }}
                  transition={{ duration: 1 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-xl font-black ${color} leading-none`}>{score}</span>
                <span className="text-[8px] text-slate-500">健康分</span>
              </div>
            </div>
            <div className="flex-1">
              <div className={`text-base font-bold ${color} mb-1`}>{level}</div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                基于实时温/湿/墒/pH 传感数据综合研判，数值随环境实时刷新。
              </p>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-xs py-2">环境传感器数据接入中…</p>
        )}
      </HudCard>

      <HudCard title="环境胁迫预警" icon={<AlertTriangle size={16} />} accent={flags.some((f) => f.sev === "alert") ? "amber" : "cyan"}>
        {flags.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-300 text-xs py-2">
            <CheckCircle2 size={16} /> 各项指标正常，无胁迫预警
          </div>
        ) : (
          <div className="space-y-2">
            {flags.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] ${SEV_STYLE[f.sev]}`}
              >
                <span className="font-bold">{f.label}</span>
                <span className="text-[10px] opacity-80 font-mono">{f.detail}</span>
              </motion.div>
            ))}
          </div>
        )}
      </HudCard>

      <HudCard title="AI 智能研判中枢" icon={<BrainCircuit size={16} />}>
        <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
          <BrainCircuit size={20} className="text-cyan-500/50 shrink-0 mt-0.5 animate-pulse" />
          <p>
            返回数据控制台运行「AI 智能种植推荐与 ROI 核算」，可解锁<span className="text-cyan-300">作物推荐 / 施肥处方 / 经济效益预估</span>等完整研判，结果将实时同步至此场景。
          </p>
        </div>
      </HudCard>
    </>
  );
};

const AIInsightLeft: React.FC<{ aiResult: any; plot: any; realtimeData?: any }> = ({ aiResult, plot, realtimeData }) => {
  if (!aiResult) return <AIInsightEmpty realtimeData={realtimeData} />;
  const suitability = Number(aiResult.suitability) || 0;
  const suitText =
    suitability >= 80 ? "text-emerald-400" : suitability >= 60 ? "text-yellow-400" : "text-rose-400";
  const suitBar =
    suitability >= 80
      ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
      : suitability >= 60
      ? "bg-gradient-to-r from-yellow-500 to-yellow-300"
      : "bg-gradient-to-r from-rose-500 to-rose-300";
  return (
    <>
      <HudCard title="AI 智能种植推荐" icon={<Sprout size={16} />} accent="emerald">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">推荐主栽作物</p>
        <div className="flex items-end justify-between mb-3">
          <span className="text-2xl font-black text-emerald-300">{aiResult.recommendedCrop || "—"}</span>
          {plot?.name && <span className="text-[10px] text-cyan-400/70 font-mono">{plot.name}</span>}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span className="flex items-center gap-1"><Gauge size={11} /> 土壤环境匹配度</span>
          <span className={`font-mono font-bold ${suitText}`}>{suitability}%</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${suitBar} transition-all duration-700`}
            style={{ width: `${Math.min(100, Math.max(0, suitability))}%` }}
          />
        </div>
      </HudCard>

      <HudCard title="经济效益预估" icon={<TrendingUp size={16} />} accent="amber">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">预估亩均净收益</p>
        <p className="text-2xl font-black text-amber-300 font-mono mb-3">
          ¥{Number(aiResult.expectedProfit || 0).toLocaleString()}
          <span className="text-xs text-slate-500 font-sans ml-1">/亩·年</span>
        </p>
        {aiResult.roiAnalysis && (
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500 block">生长周期</span>
              <span className="text-cyan-300 font-bold">{aiResult.roiAnalysis.growthCycle || "—"}</span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500 block">市场风险</span>
              <span className="text-cyan-300 font-bold">{aiResult.roiAnalysis.marketRisk || "—"}</span>
            </div>
          </div>
        )}
      </HudCard>

      {aiResult.reason && (
        <HudCard title="研判依据" icon={<BrainCircuit size={16} />}>
          <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-6">{aiResult.reason}</p>
        </HudCard>
      )}
    </>
  );
};

const AIInsightRight: React.FC<{ aiResult: any; realtimeData: any }> = ({ aiResult, realtimeData }) => {
  if (!aiResult) {
    const advice = computeFarmingAdvice(realtimeData);
    const adviceIcon = (k: string) =>
      k === "water" ? <Droplets size={13} className="text-cyan-400" /> :
      k === "wind" ? <Wind size={13} className="text-emerald-400" /> :
      k === "light" ? <SunIcon size={13} className="text-amber-400" /> :
      k === "ph" ? <FlaskConical size={13} className="text-violet-400" /> :
      <CheckCircle2 size={13} className="text-emerald-400" />;
    const prioStyle = (p: string) =>
      p === "高" ? "text-rose-300 border-rose-500/40 bg-rose-500/10" :
      p === "中" ? "text-yellow-300 border-yellow-500/40 bg-yellow-500/10" :
      "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
    return (
      <>
        <HudCard title="实时环境快照" icon={<Activity size={16} />}>
          {realtimeData ? (
            <div className="space-y-2.5">
              {Object.keys(IDEAL_RANGES).map((key) => {
                const v = getMetric(realtimeData, key);
                const cfg = IDEAL_RANGES[key];
                const inRange = v !== undefined && v >= cfg.min && v <= cfg.max;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        {key === "temperature" ? <Thermometer size={11} /> : key === "soilMoisture" ? <Droplets size={11} /> : key === "pH" ? <FlaskConical size={11} /> : <Activity size={11} />}
                        {cfg.label}
                      </span>
                      <span className={`font-mono font-bold ${inRange ? "text-cyan-300" : "text-rose-300"}`}>
                        {v !== undefined ? v.toFixed(1) : "—"}{cfg.unit}
                        <span className="text-slate-600 font-sans font-normal ml-1">/ {cfg.min}~{cfg.max}</span>
                      </span>
                    </div>
                    {v !== undefined && <RangeBar value={v} min={cfg.min} max={cfg.max} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-xs">环境传感器数据接入中…</p>
          )}
        </HudCard>

        <HudCard title="智能农事建议" icon={<Lightbulb size={16} />} accent="amber">
          <div className="space-y-2">
            {advice.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="flex items-start gap-2 bg-slate-900/50 rounded-lg p-2 border border-slate-800"
              >
                <div className="shrink-0 mt-0.5">{adviceIcon(a.icon)}</div>
                <p className="text-[11px] text-slate-300 leading-relaxed flex-1">{a.text}</p>
                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border ${prioStyle(a.priority)}`}>{a.priority}</span>
              </motion.div>
            ))}
          </div>
        </HudCard>
      </>
    );
  }
  const fert = aiResult.fertilizationAdvice;
  return (
    <>
      {fert && (
        <HudCard title="精准施肥处方" icon={<FlaskConical size={16} />} accent="emerald">
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500">施肥量</span>
              <span className="text-emerald-300 font-bold text-right">{fert.amount || "—"}</span>
            </div>
            <div className="flex justify-between bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500">施肥时机</span>
              <span className="text-emerald-300 font-bold text-right">{fert.timing || "—"}</span>
            </div>
            {fert.description && (
              <p className="text-slate-400 leading-relaxed pt-1 line-clamp-4">{fert.description}</p>
            )}
          </div>
        </HudCard>
      )}

      {aiResult.roiAnalysis && (
        <HudCard title="ROI 投产核算" icon={<Zap size={16} />} accent="amber">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500 block">折算单产</span>
              <span className="text-amber-300 font-mono font-bold">{aiResult.roiAnalysis.suggestedYield ?? "—"} kg/亩</span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500 block">预估售价</span>
              <span className="text-amber-300 font-mono font-bold">¥{aiResult.roiAnalysis.suggestedPrice ?? "—"}/kg</span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500 block">亩均成本</span>
              <span className="text-rose-300 font-mono font-bold">{aiResult.roiAnalysis.costEstimate || "—"}</span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <span className="text-slate-500 block">耗水评估</span>
              <span className="text-cyan-300 font-bold">{aiResult.roiAnalysis.waterUsage || "—"}</span>
            </div>
          </div>
        </HudCard>
      )}

      {Array.isArray(aiResult.alternatives) && aiResult.alternatives.length > 0 && (
        <HudCard title="备选轮作方案" icon={<Sprout size={16} />}>
          <div className="space-y-1.5">
            {aiResult.alternatives.slice(0, 3).map((alt: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-[11px] bg-slate-900/60 rounded-lg px-2 py-1.5 border border-slate-800">
                <span className="text-slate-300 font-bold">{alt.crop}</span>
                <span className="text-slate-500 font-mono">匹配 {alt.suitability}% · ¥{Number(alt.expectedProfit || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </HudCard>
      )}
    </>
  );
};
