import React from "react";
import { motion } from "motion/react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import {
  Play,
  Wind,
  Sun,
  Droplets,
  Activity,
  Users,
  AlertTriangle,
  Calendar,
  Grid,
  Thermometer,
  CloudRain,
  Droplet,
} from "lucide-react";

// 量质分析：根据实时数据派生一条平滑的「产量/品质」周趋势（保持稳定，仅随实时值微调）
function buildQualitySeries(realtimeData?: any) {
  const base = [62, 70, 66, 78, 73, 85, 90];
  const qual = [55, 60, 58, 64, 68, 72, 80];
  const tempBias = realtimeData?.temperature ? (realtimeData.temperature - 26) * 0.8 : 0;
  const moistBias = realtimeData?.soilMoisture ? (realtimeData.soilMoisture - 50) * 0.3 : 0;
  const yieldArr = base.map((v) => Math.min(98, Math.max(20, v + tempBias)));
  const qualArr = qual.map((v) => Math.min(98, Math.max(20, v + moistBias)));
  return { yieldArr, qualArr };
}

function seriesToPath(arr: number[]) {
  const max = 100;
  const stepX = 100 / (arr.length - 1);
  return arr
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)},${(50 - (v / max) * 50).toFixed(1)}`)
    .join(" ");
}

function seriesToArea(arr: number[]) {
  const line = seriesToPath(arr);
  return `${line} L 100,50 L 0,50 Z`;
}

export const DashboardPanels = {
  Left: ({ realtimeData, hardwareStatus }: { realtimeData?: any; hardwareStatus?: Record<string, boolean> }) => {
    const onlineDevices = hardwareStatus
      ? Object.values(hardwareStatus).filter(Boolean).length
      : 0;
    const totalDevices = hardwareStatus ? Object.keys(hardwareStatus).length : 0;
    const health = Math.round(
      92 - (realtimeData?.temperature && realtimeData.temperature > 33 ? 6 : 0) -
        (realtimeData?.soilMoisture && realtimeData.soilMoisture < 25 ? 5 : 0)
    );
    const stats = [
      { label: "占地面积", val: "500", unit: "亩", color: "text-cyan-300" },
      { label: "传感分区", val: "6", unit: "个", color: "text-emerald-300" },
      { label: "在线设备", val: totalDevices ? `${onlineDevices}/${totalDevices}` : "18/20", unit: "", color: "text-amber-300" },
      { label: "综合健康", val: `${health}`, unit: "%", color: "text-rose-300" },
    ];
    const { yieldArr, qualArr } = buildQualitySeries(realtimeData);
    const yieldNow = Math.round(yieldArr[yieldArr.length - 1]);
    const qualNow = Math.round(qualArr[qualArr.length - 1]);
    return (
    <>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/80 backdrop-blur-md border border-cyan-900/50 rounded-xl p-4 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] flex-1 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-3">
          <Play size={10} className="fill-cyan-400" /> 基地介绍
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed indent-6 text-justify">
          农芯智境·现代农业大棚数字孪生管控平台项目基地。占地面积约500余亩，集成了高精度环境传感器、自动化水肥一体机与多维感知网络，是区域领先的智慧农业与数字孪生示范基地。
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-slate-900/40 border border-white/5 rounded-lg px-2 py-2 flex flex-col items-center justify-center"
            >
              <div className="flex items-baseline gap-0.5">
                <span className={`text-base font-bold leading-none ${s.color}`}>{s.val}</span>
                <span className="text-[9px] text-slate-400">{s.unit}</span>
              </div>
              <span className="text-[9px] text-slate-500 mt-1">{s.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-[#020B14]/80 backdrop-blur-md border border-cyan-900/50 rounded-xl p-4 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] flex-1 flex flex-col"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2">
            <Play size={10} className="fill-cyan-400" /> 量质分析
          </h2>
          <div className="flex gap-3 text-[9px]">
            <span className="flex items-center gap-1 text-teal-300">
              <span className="w-2 h-0.5 bg-teal-400 inline-block" />产量 {yieldNow}
            </span>
            <span className="flex items-center gap-1 text-blue-300">
              <span className="w-2 h-0.5 bg-blue-400 inline-block" />品质 {qualNow}
            </span>
          </div>
        </div>
        <div className="flex-1 relative border-l border-b border-slate-700/70 ml-6 mb-4 mt-2">
          <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="qa-yield" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="qa-qual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[12.5, 25, 37.5].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#1e293b" strokeWidth="0.4" />
            ))}
            <motion.path
              d={seriesToArea(qualArr)}
              fill="url(#qa-qual)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            />
            <motion.path
              d={seriesToArea(yieldArr)}
              fill="url(#qa-yield)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            />
            <motion.path
              d={seriesToPath(qualArr)}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1 }}
            />
            <motion.path
              d={seriesToPath(yieldArr)}
              fill="none"
              stroke="#2dd4bf"
              strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1 }}
            />
          </svg>
          <div className="absolute -bottom-4 left-0 w-full flex justify-between text-[8px] text-slate-500">
            <span>周一</span>
            <span>周三</span>
            <span>周五</span>
            <span>周日</span>
          </div>
        </div>
      </motion.div>
    </>
  );
  },
  Right: ({ realtimeData, systemLogs, time }: { realtimeData?: any; systemLogs?: string[]; time?: Date }) => {
    const cams = [
      { id: "CH-01", name: "温室 A 区", grad: "from-emerald-950 via-slate-900 to-[#04121a]", tint: "bg-emerald-500/5" },
      { id: "CH-02", name: "温室 B 区", grad: "from-cyan-950 via-slate-900 to-[#04121a]", tint: "bg-cyan-500/5" },
      { id: "CH-03", name: "育苗中心", grad: "from-amber-950/60 via-slate-900 to-[#04121a]", tint: "bg-amber-500/5" },
    ];
    const [activeCam, setActiveCam] = React.useState(0);
    const cam = cams[activeCam];
    const now = time || new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    // 设备告警趋势：从 systemLogs 聚合最近 7 段的告警条数
    const logs = systemLogs || [];
    const isWarn = (l: string) => l.includes("STRESS") || l.includes("异常") || l.includes("干旱") || l.includes("失败") || l.includes("警告");
    const warnToday = logs.filter(isWarn).length;
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    logs.forEach((l, i) => {
      const w = isWarn(l) ? 2 : 1;
      buckets[i % 7] += w;
    });
    const maxBucket = Math.max(4, ...buckets);

    return (
    <>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/80 backdrop-blur-md border border-cyan-900/50 rounded-xl p-4 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] flex-1 flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2">
            <Play size={10} className="fill-cyan-400" /> 实时监控
          </h2>
          <span className="flex items-center gap-1 text-[9px] font-mono text-red-400">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> REC
          </span>
        </div>
        {/* 模拟 CCTV 画面 */}
        <div className={`relative rounded-md overflow-hidden border border-cyan-900/60 aspect-video bg-gradient-to-br ${cam.grad}`}>
          {/* 场景：地平线 + 棚架剪影 */}
          <div className="absolute inset-0">
            <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-[33%] left-0 w-full h-px bg-cyan-400/20" />
            {[18, 38, 58, 78].map((x) => (
              <div key={x} className="absolute bottom-[33%] w-px bg-white/10" style={{ left: `${x}%`, height: "34%" }} />
            ))}
            <div className="absolute bottom-[33%] left-[10%] w-[80%] h-[2px] bg-white/10" />
          </div>
          <div className={`absolute inset-0 ${cam.tint}`} />
          {/* 扫描线 */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_3px] opacity-50 pointer-events-none" />
          <motion.div
            className="absolute left-0 w-full h-6 bg-gradient-to-b from-cyan-400/10 to-transparent pointer-events-none"
            animate={{ top: ["-10%", "110%"] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
          />
          {/* 暗角 */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)] pointer-events-none" />
          {/* HUD 叠层 */}
          <div className="absolute top-1.5 left-2 text-[9px] font-mono text-cyan-200/90 drop-shadow">{cam.id} · {cam.name}</div>
          <div className="absolute top-1.5 right-2 flex gap-0.5 items-end h-3">
            {[3, 5, 4, 6].map((h, i) => (
              <span key={i} className="w-0.5 bg-emerald-400/80" style={{ height: `${h * 1.6}px` }} />
            ))}
          </div>
          <div className="absolute bottom-1.5 left-2 text-[9px] font-mono text-white/80 drop-shadow">{ts}</div>
          <div className="absolute bottom-1.5 right-2 text-[8px] font-mono text-slate-300/70">1080P · 25FPS</div>
          {/* 中心准星 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border border-cyan-400/30 rounded-sm">
            <div className="absolute top-1/2 left-1/2 w-1.5 h-px -translate-x-1/2 bg-cyan-400/50" />
            <div className="absolute top-1/2 left-1/2 w-px h-1.5 -translate-y-1/2 bg-cyan-400/50" />
          </div>
        </div>
        {/* 通道切换缩略图 */}
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {cams.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveCam(i)}
              className={`relative rounded overflow-hidden aspect-video border bg-gradient-to-br ${c.grad} transition-all ${
                i === activeCam ? "border-cyan-400 ring-1 ring-cyan-400/40" : "border-white/10 opacity-60 hover:opacity-90"
              }`}
            >
              <span className="absolute bottom-0.5 left-1 text-[7px] font-mono text-white/80">{c.id}</span>
            </button>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-[#020B14]/80 backdrop-blur-md border border-cyan-900/50 rounded-xl p-4 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] flex-1 flex flex-col"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2">
            <Play size={10} className="fill-cyan-400" /> 设备告警趋势
          </h2>
          <span className={`text-[9px] px-2 py-0.5 rounded-full border ${warnToday > 0 ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"}`}>
            今日告警 {warnToday}
          </span>
        </div>
        <div className="flex-1 relative border-l border-b border-slate-700/70 ml-6 mb-4 mt-2 flex items-end justify-between gap-1 px-1 pb-px">
          {buckets.map((b, i) => {
            const pct = Math.max(6, (b / maxBucket) * 100);
            const hot = b >= maxBucket * 0.7;
            return (
              <motion.div
                key={i}
                className={`flex-1 rounded-t-sm ${hot ? "bg-gradient-to-t from-rose-600 to-amber-400" : "bg-gradient-to-t from-cyan-700 to-cyan-400"}`}
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
              />
            );
          })}
          <div className="absolute -bottom-4 left-0 w-full flex justify-between text-[8px] text-slate-500 px-1">
            <span>周一</span>
            <span>周三</span>
            <span>周五</span>
            <span>周日</span>
          </div>
        </div>
      </motion.div>
    </>
  );
  },
};

export const EnvPanels = {
  Left: ({ realtimeData }: { realtimeData?: any }) => (
    <>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Thermometer size={14} className="text-cyan-400" /> 室外环境
        </h2>
        <div className="bg-slate-900/50 rounded-lg p-3 mb-4 text-center border border-white/5">
          <div className="text-white font-bold text-sm">多云转晴 22~30℃</div>
        </div>
        <div className="grid grid-cols-2 gap-3 flex-1 content-start">
          {[
            { label: "温度", val: `${realtimeData?.temperature || 29}℃`, color: "text-rose-400" },
            { label: "湿度", val: `${realtimeData?.humidity || 34}%`, color: "text-blue-400" },
            { label: "风速", val: `${realtimeData?.windSpeed || 2.9}m/s`, color: "text-cyan-400" },
            { label: "风向", val: realtimeData?.windDirection || "234°", color: "text-emerald-400" },
            { label: "雨量", val: `${realtimeData?.rainfall || 0}mm`, color: "text-blue-300" },
            { label: "光照", val: `${realtimeData?.light || 6000}Lx`, color: "text-amber-400" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-slate-900/30 p-2 rounded border border-white/5 flex flex-col items-center justify-center"
            >
              <span className="text-[10px] text-slate-400 mb-1">
                {item.label}
              </span>
              <span className={`text-xs font-bold ${item.color}`}>
                {item.val}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 mt-4 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <CloudRain size={14} className="text-cyan-400" /> 室内环境
        </h2>
        <div className="space-y-3 flex-1 content-start">
          {[
            { label: "土壤PH值:", val: `${realtimeData?.ph || 6.5}`, color: "text-emerald-400" },
            {
              label: "土壤二氧化碳浓度:",
              val: `${realtimeData?.co2 || 370}ppm`,
              color: "text-amber-400",
            },
            { label: "空气温度:", val: `${(realtimeData?.temperature ? realtimeData.temperature + 5 : 35).toFixed(1)}℃`, color: "text-rose-400" },
            { label: "空气湿度:", val: `${(realtimeData?.humidity ? realtimeData.humidity + 10 : 62.5).toFixed(1)}%`, color: "text-blue-400" },
            { label: "土壤温度:", val: `${realtimeData?.soilTemperature || 28.3}℃`, color: "text-orange-400" },
            { label: "土壤湿度:", val: `${realtimeData?.soilMoisture || 21.6}%`, color: "text-cyan-400" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex justify-between items-center border-b border-slate-800 pb-2"
            >
              <span className="text-xs text-slate-400">{item.label}</span>
              <span className={`text-xs font-bold ${item.color}`}>
                {item.val}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  ),
  Right: ({ realtimeData }: { realtimeData?: any }) => (
    <>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 flex flex-col min-h-[300px]"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Play size={10} className="fill-cyan-400" /> 历史数据
        </h2>
        <div className="flex gap-4 mb-4 text-[10px]">
          <span className="flex items-center gap-1 text-cyan-400">
            <div className="w-2 h-0.5 bg-cyan-400" />
            温度
          </span>
          <span className="flex items-center gap-1 text-blue-400">
            <div className="w-2 h-0.5 bg-blue-400" />
            湿度
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <div className="w-2 h-0.5 bg-emerald-400" />
            土壤湿度
          </span>
        </div>
        <div className="flex-1 relative border-l border-b border-slate-700 ml-6 mb-4 mt-2">
          <svg
            viewBox="0 0 100 50"
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
          >
            <path
              d="M 0,20 L 20,10 L 40,30 L 60,15 L 80,40 L 100,20"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
            />
            <path
              d="M 0,30 L 20,25 L 40,45 L 60,30 L 80,20 L 100,10"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2"
              strokeDasharray="2,2"
            />
            <path
              d="M 0,40 L 20,35 L 40,25 L 60,35 L 80,10 L 100,25"
              fill="none"
              stroke="#34d399"
              strokeWidth="2"
              strokeDasharray="1,2"
            />
          </svg>
          <div className="absolute -left-6 bottom-0 text-[8px] text-slate-500">
            0
          </div>
          <div className="absolute -left-6 top-1/2 text-[8px] text-slate-500">
            200
          </div>
          <div className="absolute -left-6 top-0 text-[8px] text-slate-500">
            400
          </div>
          <div className="absolute -bottom-4 left-0 w-full flex justify-between text-[8px] text-slate-500">
            <span>5</span>
            <span>9</span>
            <span>13</span>
            <span>17</span>
            <span>21</span>
          </div>
        </div>
      </motion.div>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg mt-4 flex-1 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Activity size={14} className="text-cyan-400" /> 实时传感器状态
        </h2>
        <div className="grid grid-cols-2 gap-3 flex-1 content-start">
          {[
            {
              label: "CO2浓度",
              val: `${realtimeData?.co2 || 370} ppm`,
              status: "正常",
              color: "text-emerald-400",
            },
            {
              label: "土壤PH",
              val: `${realtimeData?.ph || 6.5}`,
              status: "正常",
              color: "text-emerald-400",
            },
            {
              label: "室内温度",
              val: `${(realtimeData?.temperature ? realtimeData.temperature + 5 : 35).toFixed(1)}℃`,
              status: (realtimeData?.temperature && realtimeData.temperature + 5 > 35) ? "警告" : "正常",
              color: (realtimeData?.temperature && realtimeData.temperature + 5 > 35) ? "text-rose-400" : "text-emerald-400",
              border: (realtimeData?.temperature && realtimeData.temperature + 5 > 35) ? "border-rose-500/50" : "border-emerald-500/50",
            },
            {
              label: "室内湿度",
              val: `${(realtimeData?.humidity ? realtimeData.humidity + 10 : 62.5).toFixed(1)}%`,
              status: "正常",
              color: "text-emerald-400",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`bg-slate-900/40 p-3 rounded-lg border ${item.border || "border-white/5"} flex flex-col items-center justify-center text-center`}
            >
              <span className="text-[10px] text-slate-400 mb-1">
                {item.label}
              </span>
              <span className={`text-xs font-bold ${item.color} mb-1`}>
                {item.val}
              </span>
              <span
                className={`text-[9px] ${item.status === "警告" ? "text-rose-400" : "text-emerald-500"}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  ),
};

export const DevicePanels = {
  Left: ({ hardwareStatus, onControlHardware }: { hardwareStatus?: Record<string, boolean>; onControlHardware?: (type: any, action: 'on' | 'off', zone?: string) => void }) => (
    <>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Wind size={14} className="text-cyan-400" /> 风扇与通风控制
        </h2>
        <div className="space-y-4 flex-1">
          {["A", "B", "C"].map((zone) => {
            const key = `ventilation_${zone}`;
            const isActive = hardwareStatus ? hardwareStatus[key] : false;
            return (
            <div key={zone} className="flex items-center justify-between">
              <span className="text-xs text-white font-bold w-16">{zone}区风机</span>
              <div className="flex bg-slate-900/50 rounded-lg p-0.5 border border-white/5">
                <button 
                  onClick={() => onControlHardware && onControlHardware('ventilation', 'on', zone)}
                  className={`px-4 py-1.5 text-[10px] rounded-md transition-colors ${isActive ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'}`}>
                  运行
                </button>
                <button 
                  onClick={() => onControlHardware && onControlHardware('ventilation', 'off', zone)}
                  className={`px-4 py-1.5 text-[10px] rounded-md shadow-sm transition-colors ${!isActive ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                  关闭
                </button>
              </div>
            </div>
          )})}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 mt-4 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Sun size={14} className="text-cyan-400" /> 光谱补光控制
        </h2>
        <div className="grid grid-cols-3 gap-4 flex-1 content-start">
          {[1, 2, 3, 4, 5, 6].map((i) => {
            const zone = i.toString();
            const key = `lighting_${zone}`;
            const isActive = hardwareStatus ? hardwareStatus[key] : false;
            return (
            <div key={i} className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 mb-2 font-bold">
                {zone}区补光
              </span>
              <div className="flex bg-slate-900/50 rounded border border-white/5 overflow-hidden w-full">
                <button 
                  onClick={() => onControlHardware && onControlHardware('lighting', 'on', zone)}
                  className={`flex-1 py-1 text-[10px] transition-colors ${isActive ? 'bg-amber-500 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
                  开
                </button>
                <button 
                  onClick={() => onControlHardware && onControlHardware('lighting', 'off', zone)}
                  className={`flex-1 py-1 text-[10px] transition-colors ${!isActive ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
                  关
                </button>
              </div>
            </div>
          )})}
        </div>
      </motion.div>
    </>
  ),
  Right: ({ hardwareStatus, onControlHardware }: { hardwareStatus?: Record<string, boolean>; onControlHardware?: (type: any, action: 'on' | 'off', zone?: string) => void }) => (
    <>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Grid size={14} className="text-cyan-400" /> 智能微喷灌溉
        </h2>
        <div className="grid grid-cols-3 gap-4 flex-1 content-start">
          {[1, 2, 3, 4, 5, 6].map((i) => {
            const zone = i.toString();
            const key = `irrigation_${zone}`;
            const isActive = hardwareStatus ? hardwareStatus[key] : false;
            return (
            <div key={i} className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 mb-2 font-bold">{zone}区水阀</span>
              <div className="flex bg-slate-900/50 rounded border border-white/5 overflow-hidden w-full">
                <button 
                  onClick={() => onControlHardware && onControlHardware('irrigation', 'on', zone)}
                  className={`flex-1 py-1 text-[10px] transition-colors ${isActive ? 'bg-blue-500 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
                  开
                </button>
                <button 
                  onClick={() => onControlHardware && onControlHardware('irrigation', 'off', zone)}
                  className={`flex-1 py-1 text-[10px] transition-colors ${!isActive ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
                  关
                </button>
              </div>
            </div>
          )})}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 mt-4 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Activity size={14} className="text-cyan-400" /> 核心温控系统
        </h2>
        <div className="space-y-4 flex-1">
          {["A", "B", "C"].map((zone) => {
            const key = `heating_${zone}`;
            const isActive = hardwareStatus ? hardwareStatus[key] : false;
            return (
            <div key={zone} className="flex items-center justify-between">
              <span className="text-xs text-white font-bold w-16">{zone}区地暖</span>
              <div className="flex bg-slate-900/50 rounded-lg p-0.5 border border-white/5">
                <button 
                  onClick={() => onControlHardware && onControlHardware('heating', 'on', zone)}
                  className={`px-4 py-1.5 text-[10px] rounded-md transition-colors ${isActive ? 'bg-red-500/20 text-red-400 font-bold' : 'text-slate-400 hover:text-white'}`}>
                  加热
                </button>
                <button 
                  onClick={() => onControlHardware && onControlHardware('heating', 'off', zone)}
                  className={`px-4 py-1.5 text-[10px] rounded-md shadow-sm transition-colors ${!isActive ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                  停止
                </button>
              </div>
            </div>
          )})}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 mt-4 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Activity size={14} className="text-cyan-400" /> 设备健康工况
        </h2>
        <div className="h-40 w-full relative -mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={[
              { subject: '喷灌系统', A: 98, fullMark: 100 },
              { subject: '风机系统', A: 85, fullMark: 100 },
              { subject: '温控设备', A: 92, fullMark: 100 },
              { subject: '补光系统', A: 100, fullMark: 100 },
              { subject: '传感器网', A: 88, fullMark: 100 },
            ]}>
              <PolarGrid stroke="#0891b2" strokeOpacity={0.5} />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="健康度" dataKey="A" stroke="#22d3ee" fill="#06b6d4" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </>
  ),
};

export const PersonnelPanels = {
  Left: ({ realtimeData, systemLogs }: { realtimeData?: any, systemLogs?: string[] }) => (
    <>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Users size={14} className="text-cyan-400" /> 人员信息
        </h2>
        <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500 mb-2 border-b border-slate-800 pb-2">
          <span>值班日期</span>
          <span>姓名</span>
          <span>联系电话</span>
        </div>
        <div className="space-y-3">
          {[
            { d: "星期二", n: "邹显晗", p: "13896267154" },
            { d: "星期三", n: "蒋诗悦", p: "18721429495", active: true },
            { d: "星期四", n: "和敬", p: "18768145486" },
            { d: "星期五", n: "尤玉涛", p: "13817798581" },
            { d: "星期六", n: "杨小毅", p: "13866564976" },
            { d: "星期日", n: "杨大", p: "13866564976" },
          ].map((item) => (
            <div key={item.d} className="grid grid-cols-3 gap-2 text-[11px]">
              <span className="text-slate-300">{item.d}</span>
              <span
                className={`font-bold ${item.active ? "text-cyan-400" : "text-cyan-600"}`}
              >
                {item.n}
              </span>
              <span className="text-slate-400">{item.p}</span>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 mt-4 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <AlertTriangle size={14} className="text-cyan-400" /> 控制台事件
        </h2>
        <div className="space-y-2 overflow-y-auto max-h-32 pr-1 custom-scrollbar">
          {(systemLogs || []).slice(0, 5).map((log, i) => {
            const isWarning = log.includes('STRESS') || log.includes('异常') || log.includes('干旱') || log.includes('失败');
            const isAction = log.includes('ACTUATOR') || log.includes('启动') || log.includes('CMD');
            return (
            <div
              key={i}
              className={`text-[9px] p-2 rounded border ${isWarning ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : (isAction ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-slate-900/40 border-white/5 text-slate-300')} text-justify leading-relaxed`}
            >
              {log}
            </div>
          )})}
        </div>
      </motion.div>
    </>
  ),
  Right: () => (
    <>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 min-h-[300px] flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Play size={10} className="fill-cyan-400" /> 巡检计划
        </h2>
        <div className="flex gap-4 mb-4 text-[10px]">
          <span className="flex items-center gap-1 text-amber-400">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            计划执行
          </span>
          <span className="flex items-center gap-1 text-cyan-400">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            周期执行
          </span>
        </div>
        <div className="flex-1 relative border-l border-b border-slate-700 ml-6 mb-4 mt-2 flex items-end justify-around pb-2">
          {[
            { p: "3/13", y: 40, c: 30 },
            { p: "3/14", y: 60, c: 55 },
            { p: "3/15", y: 35, c: 35 },
            { p: "3/16", y: 70, c: 45 },
            { p: "3/17", y: 25, c: 25 },
          ].map((d, i) => (
            <div key={i} className="flex gap-1 h-full items-end group">
              <div
                className="w-3 bg-amber-400 hover:bg-amber-300 transition-colors"
                style={{ height: `${d.y}%` }}
              />
              <div
                className="w-3 bg-cyan-400 hover:bg-cyan-300 transition-colors"
                style={{ height: `${d.c}%` }}
              />
              <div className="absolute -bottom-5 text-[8px] text-slate-400 text-center w-10 -ml-2">
                {d.p}
              </div>
            </div>
          ))}
          <div className="absolute -left-6 bottom-0 text-[8px] text-slate-500">
            0
          </div>
          <div className="absolute -left-6 top-1/2 text-[8px] text-slate-500">
            4
          </div>
          <div className="absolute -left-6 top-0 text-[8px] text-slate-500">
            8
          </div>
        </div>
      </motion.div>
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-lg flex-1 mt-4 flex flex-col"
      >
        <h2 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-4">
          <Grid size={14} className="text-cyan-400" /> 行列巡检分区
        </h2>
        <div className="grid grid-cols-3 gap-3 flex-1 content-start">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-slate-900/40 border border-white/5 rounded-lg p-3 text-center flex flex-col items-center"
            >
              <span className="text-xs text-white font-bold mb-1">
                行8列{i}
              </span>
              <span className="text-[10px] text-emerald-500">正常</span>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  ),
};
