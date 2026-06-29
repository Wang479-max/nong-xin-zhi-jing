import React, { useState, useEffect, useRef } from "react";
import { 
  Sun, CloudSun, CloudRain, Wind, MapPin, Loader2,
  CloudLightning, CloudFog, Sunrise, Sunset, 
  Thermometer, Droplets, ArrowRight
} from "lucide-react";
import { cn } from "../../lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type WeatherData = {
  current: any;
  hourly: any;
  daily: any;
};

// Convert WMO code to friendly weather characteristics
const getWeatherCodeDetails = (code: number) => {
  if (code === 0) return { label: "晴朗天空", icon: Sun };
  if (code >= 1 && code <= 3) return { label: "多云转晴", icon: CloudSun };
  if (code === 45 || code === 48) return { label: "大雾弥漫", icon: CloudFog };
  if (code >= 51 && code <= 55) return { label: "细雨微风", icon: CloudRain };
  if (code >= 61 && code <= 65) return { label: "小雨骤降", icon: CloudRain };
  if (code >= 80 && code <= 82) return { label: "局部阵雨", icon: CloudRain };
  if (code >= 95 && code <= 99) return { label: "雷阵冷雨", icon: CloudLightning };
  return { label: "清朗天色", icon: Sun };
};

const WEATHER_SITES = [
  { id: "site_01", name: "兰州基地", coords: "36.0617° N, 103.8343° E", lat: 36.0617, lon: 103.8343 },
  { id: "site_02", name: "河南新乡", coords: "35.3031° N, 113.8863° E", lat: 35.3031, lon: 113.8863 },
  { id: "site_03", name: "绥化基地", coords: "46.6373° N, 126.9801° E", lat: 46.6373, lon: 126.9801 }
];

export function WeatherWidgetPro({ addSystemLog }: { addSystemLog?: (log: string) => void }) {
  const [siteIndex, setSiteIndex] = useState(0);
  const [weatherMode, setWeatherMode] = useState<"simulated" | "local">("simulated");
  const [localCoords, setLocalCoords] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Custom scroll for 24h forecast
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (weatherMode === "local" && !localCoords) {
      addSystemLog?.(`[WEATHER_MONITOR] 正在抓取本地真实位置...`);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setLocalCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "本地真实环境" }),
          () => setWeatherMode("simulated")
        );
      } else {
        setWeatherMode("simulated");
      }
    }
  }, [weatherMode, localCoords]);

  useEffect(() => {
    let active = true;
    const fetchWeather = async () => {
      setLoading(true);
      let lat, lon, siteName;

      if (weatherMode === "local" && localCoords) {
        lat = localCoords.lat;
        lon = localCoords.lon;
        siteName = localCoords.name || "本地环境";
      } else {
        const site = WEATHER_SITES[siteIndex];
        lat = site.lat;
        lon = site.lon;
        siteName = site.name;
      }

      if (!lat) return;

      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("API failed");
        const data = await res.json();
        
        if (active) {
          setWeatherData(data);
          addSystemLog?.(`[WEATHER_API] 成功获取 "${siteName}" 高精度气象数据`);
        }
      } catch (err) {
        console.warn("Weather fetch failed", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    
    fetchWeather();
    return () => { active = false; };
  }, [siteIndex, weatherMode, localCoords]);

  if (!weatherData && loading) {
    return (
      <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-white/10 rounded-3xl p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (!weatherData) return null;

  const currentDetails = getWeatherCodeDetails(weatherData.current.weather_code);
  const CurrentIcon = currentDetails.icon;

  // Process 24h (next 24 hours starting from current hour)
  const currentHourString = weatherData.current.time || new Date().toISOString();
  const currentIndex = weatherData.hourly.time.findIndex((t: string) => t >= currentHourString) || 0;
  const next24h = weatherData.hourly.time.slice(currentIndex, currentIndex + 24).map((timeStr: string, idx: number) => {
    const realIdx = currentIndex + idx;
    return {
      time: new Date(timeStr).getHours().toString().padStart(2, '0') + ":00",
      temp: Math.round(weatherData.hourly.temperature_2m[realIdx]),
      icon: getWeatherCodeDetails(weatherData.hourly.weather_code[realIdx]).icon,
      pop: weatherData.hourly.precipitation_probability[realIdx]
    };
  });

  // Process next 7 days
  const next7Days = weatherData.daily.time.map((timeStr: string, idx: number) => {
    const date = new Date(timeStr);
    const isToday = idx === 0;
    const dayName = isToday ? "今日" : date.toLocaleDateString('zh-CN', { weekday: 'short' });
    return {
      day: dayName,
      max: Math.round(weatherData.daily.temperature_2m_max[idx]),
      min: Math.round(weatherData.daily.temperature_2m_min[idx]),
      icon: getWeatherCodeDetails(weatherData.daily.weather_code[idx]).icon,
      pop: weatherData.daily.precipitation_probability_max[idx]
    };
  });

  const site = weatherMode === "local" ? { name: localCoords?.name, coords: `${localCoords?.lat.toFixed(4)}°, ${localCoords?.lon.toFixed(4)}°` } : WEATHER_SITES[siteIndex];

  let suggestion = {
    title: "农事实况建议",
    message: "近期天气状况良好，适宜开展正常的除草、施肥及日常巡检作业。",
    icon: CloudSun,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    borderColor: "border-emerald-200 dark:border-emerald-500/20"
  };

  const maxPop24h = Math.max(...next24h.map((h: any) => h.pop));
  const maxTemp24h = Math.max(...next24h.map((h: any) => h.temp));
  const minTemp24h = Math.min(...next24h.map((h: any) => h.temp));

  if (maxPop24h > 60) {
    suggestion = {
      title: "降雨预警与对策",
      message: "预报显示将有明显降雨，请及时检查温室大棚防风防水性能，并做好田间排涝准备。",
      icon: CloudRain,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-500/10",
      borderColor: "border-blue-200 dark:border-blue-500/20"
    };
  } else if (maxTemp24h > 35) {
    suggestion = {
      title: "高温预警与对策",
      message: "预计气温较高，请增加灌溉频率，必要时开启温室遮阳网与湿帘降温系统。",
      icon: Sun,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-500/10",
      borderColor: "border-amber-200 dark:border-amber-500/20"
    };
  } else if (minTemp24h < 5) {
    suggestion = {
      title: "低温预警与对策",
      message: "夜间气温偏低，请检查大棚保温被是否覆盖严实，适时开启加温设备防冻。",
      icon: Thermometer,
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-500/10",
      borderColor: "border-purple-200 dark:border-purple-500/20"
    };
  }

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-white/10 rounded-3xl p-6 lg:p-8 text-slate-800 dark:text-white shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col gap-6 group transition-colors">
      <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 transition-opacity pointer-events-none">
        <Sun size={140} className="animate-spin-slow text-amber-500" />
      </div>

      {/* Header Panel */}
      <div className="flex flex-col gap-4 relative z-10 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 border border-emerald-500/10">
               <MapPin size={18} />
            </div>
            <div className="min-w-0">
               <div className="flex items-center gap-2">
                 <span className="block text-sm font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-widest font-mono truncate max-w-[160px]">{site.name}</span>
                 {loading && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
               </div>
               <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono">{site.coords}</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-100 dark:border-white/5">
          <button 
            onClick={() => setWeatherMode("simulated")}
            className={cn("flex-1 text-[10px] py-1.5 rounded-lg border font-bold transition-all", weatherMode === "simulated" ? "bg-emerald-500 text-white border-emerald-500 shadow-sm" : "bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-800")}
          >
            云端基站
          </button>
          <button 
            onClick={() => setWeatherMode("local")}
            className={cn("flex-1 text-[10px] py-1.5 rounded-lg border font-bold transition-all", weatherMode === "local" ? "bg-emerald-500 text-white border-emerald-500 shadow-sm" : "bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-800")}
          >
            本地实况
          </button>
        </div>

        {weatherMode === "simulated" && (
          <div className="flex gap-1.5">
            {WEATHER_SITES.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setSiteIndex(idx)}
                className={cn("px-2 py-1 text-[9px] font-black rounded-lg border transition-all flex-1 text-center truncate", siteIndex === idx ? "bg-emerald-500 max-w-[40%] text-white border-emerald-500" : "bg-white/5 text-slate-500 border-white/5")}
              >
                {s.name.replace("基地", "").replace("中心", "")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Temperature */}
      <div className="flex items-end justify-between py-2 relative z-10 select-none">
        <div className="flex flex-col">
           <div className="flex items-start gap-1">
              <span className="text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-none transition-colors">{Math.round(weatherData.current.temperature_2m)}</span>
              <span className="text-xl font-black text-emerald-500 dark:text-emerald-400 mt-2">°C</span>
           </div>
           <div className="flex items-center gap-3 mt-4">
             <span className="text-sm font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{currentDetails.label}</span>
             <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 font-mono">
               <Droplets size={12} className="text-blue-400" /> {Math.round(weatherData.current.relative_humidity_2m)}%
             </div>
             <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 font-mono">
               <Wind size={12} className="text-teal-400" /> {weatherData.current.wind_speed_10m}m/s
             </div>
           </div>
        </div>
        <CurrentIcon size={56} strokeWidth={1.5} className="text-amber-500 dark:text-amber-400 drop-shadow-xl" />
      </div>

      {/* 24 Hours Forecast (Horizontal Scroll) */}
      <div className="relative z-10 mt-2">
        <div className="flex items-center justify-between mb-3">
           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">未来24小时态势</span>
           <ArrowRight size={12} className="text-slate-400" />
        </div>
        <div ref={scrollRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-2 snap-x cursor-grab active:cursor-grabbing">
          {next24h.map((h, i) => {
            const Icon = h.icon;
            return (
              <div key={i} className="flex-shrink-0 w-[64px] bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-2 border border-slate-100 dark:border-white/5 snap-start">
                 <span className="text-[10px] font-black text-slate-500 font-mono">{h.time}</span>
                 <Icon size={18} className="text-emerald-500 dark:text-emerald-400 my-1" />
                 <span className="text-sm font-black text-slate-900 dark:text-white">{h.temp}°</span>
                 <div className="w-full flex items-center justify-center gap-1 mt-1">
                   <Droplets size={8} className="text-blue-400/70" />
                   <span className="text-[8px] font-mono font-bold text-blue-500/80">{h.pop}%</span>
                 </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 7 Days Forecast */}
      <div className="space-y-3 relative z-10 pt-4 border-t border-slate-100 dark:border-white/5">
         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">7日中长期预报</span>
        {next7Days.map((d, i) => {
          const Icon = d.icon;
          return (
            <div key={i} className="flex items-center justify-between group/day cursor-default py-1">
              <span className={cn("text-xs font-black uppercase tracking-widest w-12", i === 0 ? "text-emerald-500" : "text-slate-500 dark:text-slate-400 group-hover/day:text-slate-800 dark:group-hover/day:text-white transition-colors")}>
                {d.day}
              </span>
              <div className="flex items-center w-16 gap-1">
                <Droplets size={10} className={d.pop > 30 ? "text-blue-400" : "text-slate-300 dark:text-slate-700"} />
                <span className="text-[10px] font-mono font-bold text-slate-400">{d.pop}%</span>
              </div>
              <div className="flex-1 flex justify-center">
                 <Icon size={16} className={cn("transition-transform group-hover/day:scale-110", i === 0 ? "text-emerald-500" : "text-slate-400 dark:text-slate-500")} />
              </div>
              <div className="flex items-center justify-end gap-3 w-20">
                <span className="text-[11px] font-black text-slate-400 font-mono">{d.min}°</span>
                <div className="w-6 h-1 rounded-full bg-gradient-to-r from-blue-400/20 to-red-400/20" />
                <span className="text-[11px] font-black text-slate-800 dark:text-white font-mono">{d.max}°</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Smart Agricultural Suggestion */}
      <div className={cn("relative z-10 mt-2 p-4 rounded-2xl border", suggestion.bg, suggestion.borderColor)}>
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-xl bg-white/50 dark:bg-black/20", suggestion.color)}>
            <suggestion.icon size={20} />
          </div>
          <div className="flex-1">
            <h4 className={cn("text-xs font-black mb-1", suggestion.color)}>{suggestion.title}</h4>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
              {suggestion.message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
