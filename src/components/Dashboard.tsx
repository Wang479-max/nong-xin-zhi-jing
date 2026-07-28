import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Droplets,
  Thermometer,
  Sun,
  LayoutGrid,
  Search,
  Settings,
  Bell,
  User,
  Monitor,
  RefreshCcw,
  Zap,
  Map as MapIcon,
  HelpCircle,
  Trophy,
  Timer,
  Clock,
  Command,
  Keyboard,
  Bug,
  Sprout,
  BookOpen,
  ShoppingBag,
  BrainCircuit,
  Settings2,
  FileBarChart,
  Users,
  ChevronRight,
  Sparkles,
  Play,
  ArrowUpRight,
  TrendingUp,
  Wind,
  CloudSun,
  CloudRain,
  AlertCircle,
  Check,
  CheckCircle2,
  X,
  AlertTriangle,
  Download,
  GripVertical,
  CalendarDays,
  Scan
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { cn } from "../lib/utils";
import StatCard from "./dashboard/StatCard";
import CropGrowthChart from "./dashboard/CropGrowthChart";
import DataService, { RealtimeData } from "../services/dataService";
import { useNotifications } from "../context/NotificationContext";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DashboardProps {
  onNavigate: (tab: string, hash?: string) => void;
  user: any;
}

// Complex Weather Presets
import { TiltCard } from './ui/TiltCard';
import { WeatherWidgetPro } from './dashboard/WeatherWidgetPro';

const WEATHER_SITES = [
  {
    id: "site_01",
    name: "兰州精细农业科创中心",
    coords: "36.0617° N, 103.8343° E",
    temp: 24,
    condition: "多云转晴",
    humidity: 45,
    wind: "3.4 m/s 东北风",
    uv: "5.2 (中等)",
    evap: "4.2 mm/天 (蒸腾偏强)",
    tips: "光照通量渐强，光合作用速率峰值偏大，配合16:00微量肥混合叶面喷施效果最佳。傍晚气温回落，温室注意防风扣角。",
    forecast: [
      { time: "14:00", temp: 24, icon: Sun },
      { time: "18:00", temp: 21, icon: CloudSun },
      { time: "22:00", temp: 16, icon: Wind }
    ],
    threeDays: [
      { day: "明天", range: "15/26°C", icon: Sun },
      { day: "后天", range: "14/23°C", icon: CloudRain },
      { day: "周六", range: "12/21°C", icon: Wind }
    ]
  },
  {
    id: "site_02",
    name: "河南新乡设施核心农田区",
    coords: "35.3031° N, 113.8863° E",
    temp: 28,
    condition: "晴朗高热",
    humidity: 52,
    wind: "1.2 m/s 南风",
    uv: "8.6 (强辐射)",
    evap: "6.8 mm/天 (水汽剧烈)",
    tips: "高强太阳辐射，深层土壤含水量因强日照快速递减，建议提前启动A-1区地块补水阈值，暂停植保机露天高热作业。",
    forecast: [
      { time: "14:00", temp: 28, icon: Sun },
      { time: "18:00", temp: 25, icon: Sun },
      { time: "22:00", temp: 19, icon: CloudSun }
    ],
    threeDays: [
      { day: "明天", range: "18/29°C", icon: Sun },
      { day: "后天", range: "17/28°C", icon: Sun },
      { day: "周六", range: "16/25°C", icon: CloudSun }
    ]
  },
  {
    id: "site_03",
    name: "黑龙江绥化黑土大豆基地",
    coords: "46.6373° N, 126.9801° E",
    temp: 18,
    condition: "细雨微风",
    humidity: 82,
    wind: "4.8 m/s 北风",
    uv: "1.2 (极低)",
    evap: "1.8 mm/天 (低释循环)",
    tips: "持续微雨使黑土地表趋于饱和状态。建议在育苗区激活并延长双向透氧扇运转，严控外浸。无需开展任何灌溉作业。",
    forecast: [
      { time: "14:00", temp: 18, icon: CloudRain },
      { time: "18:00", temp: 16, icon: CloudRain },
      { time: "22:00", temp: 14, icon: Wind }
    ],
    threeDays: [
      { day: "明天", range: "12/19°C", icon: CloudRain },
      { day: "后天", range: "11/20°C", icon: CloudSun },
      { day: "周六", range: "13/22°C", icon: Sun }
    ]
  }
];

const CurrentTimeDisplay = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono">{time.toLocaleTimeString([], { hour12: false })}</span>;
};

export default function Dashboard({ onNavigate, user }: DashboardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [realtimeData, setRealtimeData] = useState<RealtimeData | null>(null);


  // 1. Site Weather Selection state
  const [siteIndex, setSiteIndex] = useState(0);
  const activeSite = WEATHER_SITES[siteIndex];
  const [weatherSearch, setWeatherSearch] = useState("");

  // Live weather fetched from Open-Meteo API
  const [weatherMode, setWeatherMode] = useState<"simulated" | "local">("simulated");
  const [localCoords, setLocalCoords] = useState<{ lat: number; lon: number; name?: string } | null>(null);

  const [liveWeather, setLiveWeather] = useState<{
    temp: number;
    condition: string;
    humidity: number;
    wind: string;
    icon: React.ComponentType<any>;
    forecast: any[];
    threeDays: any[];
    siteName: string;
    coordsStr: string;
    tips: string;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const { addNotification } = useNotifications();

  // 2. Interactive Operational Centers Tab state
  const [isInteractiveOpen, setIsInteractiveOpen] = useState(false);
  const [interactiveTab, setInteractiveTab] = useState("pest");

  // 3. Dynamic Interactive Land (Plot) Averages & Warning state
  const [plotWarnings, setPlotWarnings] = useState([
    { id: 1, name: "A-1区 丰产小麦地块", status: "optimal", desc: "常规范畴", moisture: 62.5, code: "OPT-01" },
    { id: 2, name: "B-2区 玉米抗逆试验田", status: "attention", desc: "干旱干热胁迫", moisture: 31.2, code: "STRESS-02" },
    { id: 3, name: "C-1区 优质大豆核心区", status: "optimal", desc: "微润平衡", moisture: 58.7, code: "OPT-03" }
  ]);
  const [plotSolveLoading, setPlotSolveLoading] = useState<number | null>(null);

  // 4. Autonomous System Running Logs Ticker
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | "iot" | "actions">("all");
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // 5. Dashboard Chart state
  const [dashboardPlots, setDashboardPlots] = useState<any[]>([]);
  const [activeDashboardPlot, setActiveDashboardPlot] = useState('all');
  const [dashboardTimeRange, setDashboardTimeRange] = useState<'24h' | '7d'>('24h');
  const [dashboardChartData, setDashboardChartData] = useState<any[]>([]);
  const [showTempCurve, setShowTempCurve] = useState(true);
  const [showHumCurve, setShowHumCurve] = useState(true);

  // 6. Config Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [statOrder, setStatOrder] = useState<string[]>(['temp', 'hum', 'light', 'moisture']);

  // 7. Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportColumns, setExportColumns] = useState({ temp: true, hum: true, light: true });
  const [isScheduledExport, setIsScheduledExport] = useState(false);
  const [scheduledFrequency, setScheduledFrequency] = useState('weekly_monday');

  useEffect(() => {
    const savedOrder = localStorage.getItem('dashboard_stat_order');
    if (savedOrder) {
      try {
        setStatOrder(JSON.parse(savedOrder));
      } catch (e) {
        console.error('Failed to parse stat order');
      }
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('dashboard_stat_order', JSON.stringify(statOrder));
    setIsConfigModalOpen(false);
    addNotification({ title: '设置成功', message: '布局偏好已保存', type: 'success' });
  };

  useEffect(() => {
    DataService.getPlots().then(setDashboardPlots);
  }, []);

  useEffect(() => {
    const targetPlot = activeDashboardPlot;
    const variation = targetPlot === 'all' ? 0 : (targetPlot.charCodeAt(targetPlot.length - 1) % 5) - 2;
    
    if (dashboardTimeRange === '7d') {
      const data7d = [
        { time: '6/18', temp: 22.5 + variation, hum: 58 + variation * 2, light: 600 + variation * 20 },
        { time: '6/19', temp: 23.1 + variation * 0.8, hum: 55 + variation * 2, light: 620 + variation * 20 },
        { time: '6/20', temp: 21.8 + variation * 1.2, hum: 64 + variation * 2.5, light: 580 + variation * 15 },
        { time: '6/21', temp: 24.2 + variation, hum: 50 + variation * 1.5, light: 650 + variation * 25 },
        { time: '6/22', temp: 25.0 + variation * 1.1, hum: 48 + variation * 1.2, light: 680 + variation * 30 },
        { time: '6/23', temp: 23.8 + variation * 0.9, hum: 52 + variation * 1.8, light: 610 + variation * 20 },
        { time: '6/24', temp: 22.9 + variation, hum: 56 + variation * 2, light: 630 + variation * 22 },
      ];
      setDashboardChartData(data7d);
    } else {
      const data24h = [
        { time: '00:00', temp: 15 + variation, hum: 60 + variation, light: 0 },
        { time: '03:00', temp: 14 + variation, hum: 65 + variation, light: 0 },
        { time: '06:00', temp: 16 + variation, hum: 70 + variation, light: 100 },
        { time: '09:00', temp: 22 + variation, hum: 55 + variation, light: 500 },
        { time: '12:00', temp: 28 + variation, hum: 45 + variation, light: 1200 },
        { time: '15:00', temp: 30 + variation, hum: 40 + variation, light: 1000 },
        { time: '18:00', temp: 25 + variation, hum: 50 + variation, light: 300 },
        { time: '21:00', temp: 20 + variation, hum: 58 + variation, light: 0 },
        { time: '24:00', temp: 16 + variation, hum: 62 + variation, light: 0 },
      ];
      setDashboardChartData(data24h);
    }
  }, [activeDashboardPlot, dashboardTimeRange]);

  const [activeTaskLoading, setActiveTaskLoading] = useState<string | null>(null);

  const handleQuickTask = (taskId: string, taskName: string) => {
    setActiveTaskLoading(taskId);
    setTimeout(() => {
      setActiveTaskLoading(null);
      addNotification({ title: '任务已添加', message: `已根据地块数据生成 "${taskName}" 提醒，并同步至日历。`, type: 'success' });
      addSystemLog(`已添加作业任务: ${taskName}`);
    }, 1200);
  };

  const handleExportDashboardData = () => {
    if (!dashboardChartData || dashboardChartData.length === 0) {
      addNotification({ title: '导出提示', message: t('monitoring.export.noData') || '无数据可导出', type: 'warning' });
      return;
    }
    setIsExportModalOpen(true);
  };

  const confirmExport = () => {
    try {
      if (isScheduledExport) {
        addNotification({ title: '定时导出已生效', message: '系统将会在预设的触发条件自动生成报表并推送到通知面板', type: 'success' });
        addSystemLog(`配置了定时导出任务: 触发条件 [${scheduledFrequency === 'daily' ? '每日' : scheduledFrequency === 'weekly_monday' ? '每周一' : '每月一号'}]`);
        setIsExportModalOpen(false);
        return;
      }
      
      const headers = ['time'];
      const headerNames = ['时间'];
      if (exportColumns.temp) {
        headers.push('temp');
        headerNames.push('温度(°C)');
      }
      if (exportColumns.hum) {
        headers.push('hum');
        headerNames.push('湿度(%)');
      }
      if (exportColumns.light) {
        headers.push('light');
        headerNames.push('光照(Lux)');
      }
      
      const csvRows = [
        headerNames.join(','),
        ...dashboardChartData.map(item => headers.map(header => item[header as keyof typeof item] || '').join(','))
      ];
      const csvContent = csvRows.join('\n');
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); // Add BOM for excel
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `dashboard_chart_${activeDashboardPlot}_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      addNotification({ title: '导出成功', message: '导出成功，已下载离线数据表', type: 'success' });
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      addNotification({ title: '导出失败', message: '导出失败，请重试', type: 'error' });
    }
  };

  // Add Log helper
  const addSystemLog = useCallback((text: string) => {
    DataService.addDashboardLog(text);
  }, []);

  useEffect(() => {
    setSystemLogs(DataService.getDashboardLogs());
    const unsubscribe = DataService.subscribe(() => {
      setSystemLogs(DataService.getDashboardLogs());
    });
    return () => unsubscribe();
  }, []);

  // Solve dry stress trigger
  const handleSolvePlotStress = (id: number) => {
    setPlotSolveLoading(id);
    addSystemLog(`[ACTUATOR_CMD] 启动针对 B-2 地块的自适应微压滴灌电液阀及高频变频水泵...`);
    
    setTimeout(() => {
      setPlotWarnings(prev => prev.map(plot => {
        if (plot.id === id) {
          return { ...plot, status: "optimal", desc: "已恢复平衡", moisture: 54.8 };
        }
        return plot;
      }));
      setPlotSolveLoading(null);
      addSystemLog(`[SENSING_FEEDBACK] B-2区土壤墒情自检通过！水分值升至 54.8%（常规适宜），干旱胁迫警报成功解除！`);
    }, 2500);
  };

  // Convert WMO code to friendly weather characteristics
  const getWeatherCodeDetails = (code: number) => {
    if (code === 0) return { label: "晴朗天空", icon: Sun };
    if (code >= 1 && code <= 3) return { label: "多云转晴", icon: CloudSun };
    if (code === 45 || code === 48) return { label: "大雾弥漫", icon: CloudSun };
    if (code >= 51 && code <= 55) return { label: "细雨微风", icon: CloudRain };
    if (code >= 61 && code <= 65) return { label: "小雨骤降", icon: CloudRain };
    if (code >= 80 && code <= 82) return { label: "局部阵雨", icon: CloudRain };
    if (code >= 95 && code <= 99) return { label: "雷阵冷雨", icon: CloudRain };
    return { label: "清朗天色", icon: Sun };
  };

  // Switch Site dynamically on typing searches
  const handleSearchSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weatherSearch.trim()) return;
    setWeatherMode("simulated"); // Switch to simulated on search
    const foundIdx = WEATHER_SITES.findIndex(w => w.name.includes(weatherSearch) || w.id.includes(weatherSearch));
    if (foundIdx !== -1) {
      setSiteIndex(foundIdx);
      addSystemLog(`[WEATHER_MONITOR] 面板卫星气象雷达已重新定向："${WEATHER_SITES[foundIdx].name}"`);
      setWeatherSearch("");
    } else {
      // Rotate index if search fails, simulating intelligent closest node finder
      const nextIdx = (siteIndex + 1) % WEATHER_SITES.length;
      setSiteIndex(nextIdx);
      addSystemLog(`[WEATHER_MONITOR] 未检索到相同定位，自动连接邻近地理主控节点："${WEATHER_SITES[nextIdx].name}"`);
      setWeatherSearch("");
    }
  };

  useEffect(() => {
    if (weatherMode === "local" && !localCoords) {
      addSystemLog(`[WEATHER_MONITOR] 正在通过地理雷达和IP高速骨干网检索当前实际位置...`);
      
      const tryIPGeolocation = async () => {
        try {
          const res = await fetch("https://api.ip.sb/geoip");
          if (!res.ok) throw new Error("SB-geoip fetch failed");
          const data = await res.json();
          if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            const cityName = data.city || data.region || "探测本地地区";
            setLocalCoords({ lat: data.latitude, lon: data.longitude, name: cityName });
            addSystemLog(`[WEATHER_MONITOR] 联接IP地理雷达成功！当前真实环境位置：${cityName} (纬度: ${data.latitude.toFixed(2)}° N, 经度: ${data.longitude.toFixed(2)}° E)`);
          } else {
             throw new Error("Invalid payload format");
          }
        } catch (ipErr) {
          addSystemLog(`[WEATHER_ERROR] 探测核心均遭禁闭，默认降级回精密预设示范区。`);
          setWeatherMode("simulated");
        }
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocalCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "GPS定位点" });
            addSystemLog(`[WEATHER_MONITOR] GPS高精雷达探测成功: ${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`);
          },
          async (err) => {
            addSystemLog(`[WEATHER_WARN] GPS探测通道受限，正在触发IP高速网络定位双保险...`);
            await tryIPGeolocation();
          },
          { timeout: 4000 }
        );
      } else {
        tryIPGeolocation();
      }
    }
  }, [weatherMode, localCoords, addSystemLog]);

  // Fetch real weather data from Open-Meteo
  useEffect(() => {
    let active = true;
    const fetchWeather = async () => {
      setWeatherLoading(true);

      let lat, lon, siteName, coordsStr, tips;

      if (weatherMode === "local") {
        if (!localCoords) {
           if (active) setWeatherLoading(false);
           return; // wait for local coords
        }
        lat = localCoords.lat;
        lon = localCoords.lon;
        siteName = (localCoords as any).name || "当前检测地区";
        coordsStr = `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`;
        tips = "真实本地天气雷达动态联接成功。您当前的真实气候已接入智境专家作物策略生成器中，请参考此地的农事。";
      } else {
        const site = WEATHER_SITES[siteIndex];
        lat = siteIndex === 0 ? 36.0617 : siteIndex === 1 ? 35.3031 : 46.6373;
        lon = siteIndex === 0 ? 103.8343 : siteIndex === 1 ? 113.8863 : 126.9801;
        siteName = site.name;
        coordsStr = site.coords;
        tips = site.tips;
      }

      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("API failed");
        const data = await res.json();

        if (!active) return;

        const currentDetails = getWeatherCodeDetails(data.current.weather_code);
        
        // Match 3 hourly forecasts starting around index 12, 16, 20
        const hourlyForecast = [
          { time: "14:00", temp: Math.round(data.hourly.temperature_2m[14] || data.current.temperature_2m), icon: getWeatherCodeDetails(data.hourly.weather_code[14] || 0).icon },
          { time: "18:00", temp: Math.round(data.hourly.temperature_2m[18] || data.current.temperature_2m - 2), icon: getWeatherCodeDetails(data.hourly.weather_code[18] || 0).icon },
          { time: "22:00", temp: Math.round(data.hourly.temperature_2m[22] || data.current.temperature_2m - 5), icon: getWeatherCodeDetails(data.hourly.weather_code[22] || 0).icon }
        ];

        // 3 Days daily dynamic forecasts
        const dayLabels = ["明天", "后天", "大后天"];
        const threeDays = dayLabels.map((day, idx) => {
          const maxTemp = Math.round(data.daily.temperature_2m_max[idx + 1] || 25);
          const minTemp = Math.round(data.daily.temperature_2m_min[idx + 1] || 15);
          const code = data.daily.weather_code[idx + 1] || 0;
          return {
            day,
            range: `${minTemp}/${maxTemp}°C`,
            icon: getWeatherCodeDetails(code).icon
          };
        });

        setLiveWeather({
          temp: Math.round(data.current.temperature_2m),
          condition: currentDetails.label,
          humidity: Math.round(data.current.relative_humidity_2m),
          wind: `${(data.current.wind_speed_10m * 1).toFixed(1)} m/s`,
          icon: currentDetails.icon,
          forecast: hourlyForecast,
          threeDays,
          siteName,
          coordsStr,
          tips
        });

        addSystemLog(`[WEATHER_API] 成功通过 Open-Meteo 精密调用第三方天气服务器，获取并自动重算 "${siteName}" 的真实高精度气象环境数据。`);
      } catch (err) {
        console.warn("Weather fetch failed, utilizing preset defaults:", err);
        setLiveWeather(null);
      } finally {
        if (active) setWeatherLoading(false);
      }
    };

    fetchWeather();
    return () => {
      active = false;
    };
  }, [siteIndex, weatherMode, localCoords, addSystemLog]);

  const recommendedTask = React.useMemo(() => {
    if (!realtimeData) return null;
    if (realtimeData.soilMoisture < 45) {
      return { id: 'water', name: '精准灌溉', reason: `当前土壤持水率过低 (${realtimeData.soilMoisture.toFixed(1)}%)，可能引发作物干旱胁迫，建议执行补水。`, icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' };
    }
    if (realtimeData.nitrogen < 40 || realtimeData.phosphorus < 20 || realtimeData.potassium < 30) {
      return { id: 'fertilize', name: '变量施肥', reason: `检测到部分营养元素含量偏低 (N: ${realtimeData.nitrogen.toFixed(0)}, P: ${realtimeData.phosphorus.toFixed(0)}, K: ${realtimeData.potassium.toFixed(0)})，建议执行变量追肥补充养分。`, icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' };
    }
    if (realtimeData.temperature > 32) {
      return { id: 'cool', name: '降温防暑', reason: `当前气温过高 (${realtimeData.temperature.toFixed(1)}℃)，存在热害风险，建议加强巡视并开启通风降温。`, icon: Thermometer, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' };
    }
    return { id: 'inspect', name: '全域巡检', reason: '当前各项环境指标均处于良好阈值范围内，无需紧急干预，建议执行常规例行巡检。', icon: Scan, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' };
  }, [realtimeData]);

  // Environment data automatic sync simulation
  const handleRefresh = useCallback(async () => {
    try {
      const data = await DataService.getRealtimeData('plot_001');
      setRealtimeData(data);
      addSystemLog(`[REFRESH] 数据重新校准。接收来自微机组的数据总线，算力健康度 99.1%。`);
    } catch (err) {
      console.error(err);
    }
  }, [addSystemLog]);



  // Periodic simulated sensor updates and events emission
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await handleRefresh();
      setLoading(false);
    };
    loadInitialData();

    // Fluctuations loop
    const fluctuationInterval = setInterval(() => {
      setRealtimeData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          temperature: prev.temperature + (Math.random() - 0.5) * 0.15,
          humidity: prev.humidity + (Math.random() - 0.5) * 0.8,
          light: Math.max(0, prev.light + (Math.random() - 0.5) * 200),
          soilMoisture: prev.soilMoisture + (Math.random() - 0.5) * 0.3
        };
      });
    }, 4000);

    // Logs ticker loop
    const logsTicker = setInterval(() => {
      const messages = [
        "[IOT_POLL] D-3区温室传感阵列读取已上报: 大气辐射 18.4千Lux, 根部液压系数 0.62 bar.",
        "[CONTROL_LOOP] A-1区主输流电磁管道稳定。输出流量 12.4 m³/h ✅",
        "[SATELLITE] 接收到高通多光谱红眼红外成像序列：植被叶面积指数(LAI)均值收敛于 3.52 稳定带。"
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      addSystemLog(randomMsg);
    }, 6000);

    return () => {
      clearInterval(fluctuationInterval);
      clearInterval(logsTicker);
    };
  }, [handleRefresh, addSystemLog]);

  // Autoscroll terminal container internally - avoids jumping/scrolling the entire page!
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [systemLogs]);

  // Quick operations 8 required cards data mapping to click-event launcher
  const operations = [
    { id: 'pest', name: '病虫害识别', desc: '光谱斑块扫描', icon: Bug, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10 dark:bg-rose-500/20' },
    { id: 'growth', name: '作物生长分析', desc: 'NDVI冠层评估', icon: Sprout, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
    { id: 'encyclopedia', name: '农事百科', desc: '种植管理指南', icon: BookOpen, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-500/20' },
    { id: 'mall', name: '农资商城', desc: '高精智联网采', icon: ShoppingBag, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10 dark:bg-orange-500/20' },
    { id: 'decision', name: '智能决策', desc: '海量病理比对', icon: BrainCircuit, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10 dark:bg-indigo-500/20' },
    { id: 'device', name: '设备控制', desc: '无线智能阀阀', icon: Settings2, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 dark:bg-purple-500/20' },
    { id: 'report', name: '数据报表', desc: '导出时序账单', icon: FileBarChart, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/10 dark:bg-cyan-500/20' },
    { id: 'expert', name: '专家咨询', desc: '卫星专家连线', icon: Users, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 dark:bg-amber-500/20' },
  ];

  const handleOpLaunch = (id: string) => {
    // Dispatch custom event to let AppContent render InteractiveCenter at the root level (no styling or clipping bugs)
    const event = new CustomEvent('open-interactive-center', { detail: { tab: id } });
    window.dispatchEvent(event);
    
    const opName = operations.find(op => op.id === id)?.name || id;
    addSystemLog(`[TERMINAL_ROUTE] 开启控制流子模块面板「${opName}」`);
  };

  // Resolve live weather details
  const displayTemp = liveWeather ? liveWeather.temp : activeSite.temp;
  const displayCondition = liveWeather ? liveWeather.condition : activeSite.condition;
  const displayHumidity = liveWeather ? liveWeather.humidity : activeSite.humidity;
  const displayWind = liveWeather ? liveWeather.wind : activeSite.wind;
  const displayForecast = liveWeather ? liveWeather.forecast : activeSite.forecast;
  const displayThreeDays = liveWeather ? liveWeather.threeDays : activeSite.threeDays;
  const displaySiteName = liveWeather ? liveWeather.siteName : activeSite.name;
  const displayCoords = liveWeather ? liveWeather.coordsStr : activeSite.coords;
  const displayTips = liveWeather ? liveWeather.tips : activeSite.tips;
  const DisplayIcon = liveWeather && liveWeather.icon ? liveWeather.icon : Sun;

  // Core stats variables averages
  const defaultStats = [
    { id: 'temp', label: "平均气温", value: realtimeData?.temperature ?? 22.32, unit: "°C", icon: Thermometer, color: "text-orange-500", trend: 1.2, description: "全场域传感器融合四维平均值" },
    { id: 'hum', label: "平均湿度", value: realtimeData?.humidity ?? 62.89, unit: "%", icon: Droplets, color: "text-blue-500", trend: -2.5, description: "全场区大气平均相对湿度" },
    { id: 'light', label: "光照强度", value: realtimeData?.light ?? 45620, unit: "LUX", icon: Sun, color: "text-amber-500", trend: 5.1, description: "光电转换累计辐射平均通量" },
    { id: 'moisture', label: "土壤水分", value: realtimeData?.soilMoisture ?? 58.20, unit: "%", icon: Activity, color: "text-emerald-500", trend: 0.8, description: "深层根系平均水分饱和能" }
  ];

  const stats = statOrder.map(id => defaultStats.find(s => s.id === id)).filter(Boolean) as typeof defaultStats;

  const filteredLogs = systemLogs.filter(log => {
    if (logFilter === 'all') return true;
    if (logFilter === 'iot') return log.includes('IOT_') || log.includes('SENSING') || log.includes('POLL');
    if (logFilter === 'actions') return log.includes('ACTUATOR') || log.includes('CMD') || log.includes('REFRESH') || log.includes('SHOPPING');
    return true;
  });

  const selectedPlotCrop = activeDashboardPlot === "all" ? "all" : (dashboardPlots.find(p => p.id === activeDashboardPlot)?.crop || "all");

  if (loading) return null;

  return (
    <div className="min-h-screen bg-transparent text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/20 overflow-x-hidden antialiased transition-colors duration-300">
      {/* Dynamic Award-level Ambient Background Lines */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[900px] h-[900px] bg-emerald-500/[0.03] blur-[160px] rounded-full" />
        <div className="absolute top-[40%] left-[-200px] w-[600px] h-[600px] bg-indigo-500/[0.02] blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative z-10 flex min-h-screen">

        {/* Home Dashboard Body Grid */}
        <main className="flex-1 p-3 sm:p-6 lg:p-14 space-y-5 sm:space-y-8 lg:space-y-12 overflow-x-hidden">
          
          {/* Top Integrated Interactive Cockpit Header */}
          <header className="flex flex-col xxl:flex-row xxl:items-center justify-between gap-8 select-none border-b border-slate-100 dark:border-slate-800 pb-8 transition-colors">
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-slate-950 dark:bg-slate-800 text-white text-[10px] font-black rounded-lg uppercase tracking-widest font-mono">
                    PRO MODEL V5.0
                  </div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tighter uppercase italic flex items-center gap-2">
                    <span className="text-emerald-500 not-italic font-black">NONG_XIN</span> 农芯智境系统
                  </h1>
               </div>
               <div className="flex items-center gap-4 text-slate-400 text-xs font-bold leading-none">
                  <div className="flex items-center gap-2">
                     <Clock size={14} className="text-emerald-500" />
                     <CurrentTimeDisplay />
                  </div>
                  <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-700" />
                  <span>智慧农业云互联集群 • 智慧农业数据协同中心</span>
               </div>
            </div>

            {/* Header Jump triggers & stats indicator */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
               <button 
                 onClick={() => setIsConfigModalOpen(true)}
                 className="flex-1 sm:flex-none justify-center px-4 py-4 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200/50 dark:border-white/10 rounded-2xl text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest transition-all flex items-center gap-2.5 shadow-sm active:scale-95"
                 title="配置视图"
               >
                 <Settings2 size={15} /> 配置
               </button>
               <button 
                 onClick={() => onNavigate('monitoring')}
                 className="flex-1 sm:flex-none justify-center px-6 py-4 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-white/10 rounded-2xl text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest transition-all flex items-center gap-2.5 shadow-sm active:scale-95"
               >
                 <Activity size={15} /> 实时遥测大看版
               </button>
               <button 
                 onClick={() => onNavigate('management')}
                 className="flex-1 sm:flex-none justify-center px-6 py-4 bg-slate-900 dark:bg-slate-800 hover:bg-emerald-600 dark:hover:bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 shadow-xl shadow-slate-200 dark:shadow-none active:scale-95"
               >
                 <MapIcon size={15} /> 地块全息高精孪生
               </button>
            </div>
          </header>

          {/* 1. Core 4 Stat indicators (平均数据) */}
          <section id="dashboard-indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-10">
             {stats.map((stat, i) => (
               <StatCard key={i} {...stat} delay={i * 0.1} />
             ))}
          </section>

          {/* Core Content Layout Area */}
          <div className="grid grid-cols-12 gap-5 sm:gap-8 lg:gap-12">
             
             {/* Left Compartment: Trend fluctuations + Quick commands + System Log Console */}
             <div id="dashboard-environment" className="col-span-12 xl:col-span-8 space-y-5 sm:space-y-8 lg:space-y-12">
                
                {/* 2. Overhauled 24-Hour Environment Fluctuations Line/Area Chart */}
                <div id="dashboard-chart-container" className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-2xl sm:rounded-[2rem] lg:rounded-[2.5rem] p-4 sm:p-6 lg:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative overflow-hidden flex flex-col gap-5 sm:gap-8 transition-colors">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-50 dark:border-slate-800 transition-colors">
                      <div className="flex items-center gap-3.5">
                         <div className="w-1.5 h-6 bg-slate-900 dark:bg-slate-100 rounded-full" />
                         <h3 className="text-lg sm:text-xl font-black text-slate-850 dark:text-slate-100 tracking-tight italic">
                           {dashboardTimeRange === '7d' ? '农田温湿度过去7天生长环境趋势' : '温湿度24小时多维物理波动图'}
                         </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
                        {/* Time Range Tabs */}
                        <div className="flex bg-slate-100 dark:bg-[#1A1A1A] p-1 rounded-xl border border-slate-200/50 dark:border-white/5 select-none">
                          <button
                            type="button"
                            onClick={() => setDashboardTimeRange('24h')}
                            className={cn(
                              "px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer",
                              dashboardTimeRange === '24h'
                                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                            )}
                          >
                            今日 24h
                          </button>
                          <button
                            type="button"
                            onClick={() => setDashboardTimeRange('7d')}
                            className={cn(
                              "px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer",
                              dashboardTimeRange === '7d'
                                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                            )}
                          >
                            过去 7 天
                          </button>
                        </div>
                        <select 
                          className="bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-forest-green dark:text-slate-300 transition-colors cursor-pointer"
                          value={activeDashboardPlot}
                          onChange={(e) => setActiveDashboardPlot(e.target.value)}
                        >
                          <option value="all">所有地块平均</option>
                          {dashboardPlots.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button 
                          onClick={handleExportDashboardData}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black hover:bg-forest-green hover:text-white dark:hover:bg-emerald-500 transition-all border border-slate-200 dark:border-white/5 shadow-sm"
                          title="导出为CSV或Excel"
                        >
                          <Download size={14} />
                          导出报表
                        </button>
                      </div>
                   </div>

                   {/* Interactive Environment Fluctuations Line/Area Chart using Recharts */}
                   <div className="h-[230px] sm:h-[280px] relative w-full border border-slate-50 dark:border-white/5 bg-slate-50/20 dark:bg-slate-950/20 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 pt-12 flex flex-col justify-between transition-colors">
                     <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 absolute left-6 top-6 uppercase tracking-[0.2em] font-mono z-10 transition-colors">{dashboardTimeRange === '7d' ? '7天温湿度趋势分析 (交互式)' : '温湿度实时监控'}</span>
                     {/* Clickable Legend to toggle lines */}
                     <div className="absolute right-6 top-4 flex items-center gap-2 sm:gap-3 z-10 select-none">
                       <button
                         type="button"
                         onClick={() => setShowTempCurve(!showTempCurve)}
                         className={cn(
                           "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-200 border cursor-pointer",
                           showTempCurve 
                             ? "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
                             : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 line-through opacity-60 hover:opacity-80"
                         )}
                         title="点击切换温度曲线显示/隐藏"
                       >
                         <span className={cn("w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full transition-all duration-200", showTempCurve ? "bg-orange-500 animate-pulse" : "bg-slate-400")} />
                         <span>温度</span>
                       </button>

                       <button
                         type="button"
                         onClick={() => setShowHumCurve(!showHumCurve)}
                         className={cn(
                           "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-200 border cursor-pointer",
                           showHumCurve 
                             ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                             : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 line-through opacity-60 hover:opacity-80"
                         )}
                         title="点击切换湿度曲线显示/隐藏"
                       >
                         <span className={cn("w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full transition-all duration-200", showHumCurve ? "bg-blue-500 animate-pulse" : "bg-slate-400")} />
                         <span>湿度</span>
                       </button>
                     </div>
                     
                     <div className="flex-1 w-full relative h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={dashboardChartData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }} />
                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.4} />
                            <Tooltip 
                              isAnimationActive={false}
                              cursor={{ stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                              contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', backgroundColor: 'var(--tw-colors-slate-900)', color: 'white', fontSize: '12px', fontWeight: 'bold' }}
                              itemStyle={{ padding: '4px 0', fontSize: '14px', fontWeight: 'bold' }}
                              labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                            />
                            <Area 
                              type="monotone" 
                              name="温度(°C)" 
                              dataKey="temp" 
                              stroke="#f97316" 
                              strokeWidth={3} 
                              fillOpacity={1} 
                              fill="url(#colorTemp)" 
                              hide={!showTempCurve}
                              isAnimationActive={true}
                              animationDuration={1800}
                              animationBegin={100}
                              animationEasing="ease-out"
                            />
                            <Area 
                              type="monotone" 
                              name="湿度(%)" 
                              dataKey="hum" 
                              stroke="#3b82f6" 
                              strokeWidth={3} 
                              fillOpacity={1} 
                              fill="url(#colorHum)" 
                              hide={!showHumCurve}
                              isAnimationActive={true}
                              animationDuration={1800}
                              animationBegin={400}
                              animationEasing="ease-out"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                     </div>
                   </div>
                </div>

                <CropGrowthChart 
                  selectedPlotCrop={selectedPlotCrop} 
                  onAddSystemLog={addSystemLog} 
                  onAddNotification={addNotification} 
                />

                {/* 3. Comprehensive Quick Actions 8 REQUIRED items Bento-grid Panel */}
                <div id="dashboard-quick-actions" className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative overflow-hidden flex flex-col gap-5 sm:gap-8">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-50 dark:border-slate-800 transition-colors select-none">
                      <div className="flex items-center gap-3.5">
                         <div className="w-1.5 h-6 bg-slate-900 dark:bg-slate-100 rounded-full" />
                         <h3 className="text-lg sm:text-xl font-black text-slate-850 dark:text-slate-100 tracking-tight italic">
                           天算天枢一体化控制指令中心
                         </h3>
                      </div>
                      <span className="self-start sm:self-auto text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-widest font-mono">
                         Precision Agri-Commands Grid
                      </span>
                   </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
                      {operations.map(op => {
                        const Icon = op.icon;
                        return (
                          <TiltCard 
                            key={op.id}
                            className="group cursor-pointer relative p-4 sm:p-6 border border-slate-100 dark:border-white/5 rounded-2xl sm:rounded-[2rem] bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-350 dark:hover:border-slate-600 hover:shadow-2xl hover:shadow-slate-200/60 dark:hover:shadow-black/40 h-42 overflow-hidden"
                          >
                             <div onClick={() => handleOpLaunch(op.id)} className="flex flex-col justify-between h-full">
                               <div className={cn(
                                 "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-sm",
                                 op.bg, op.color
                               )}>
                                  <Icon size={22} strokeWidth={2} />
                               </div>

                               <div>
                                  <h4 className="text-[15px] font-black text-slate-800 dark:text-slate-100 tracking-tight mt-4">{op.name}</h4>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-tight mt-1 leading-none">{op.desc}</p>
                               </div>

                               <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-3 group-hover:translate-x-0">
                                  <ArrowUpRight size={16} className="text-slate-400 dark:text-slate-500" />
                               </div>
                             </div>
                          </TiltCard>
                        );
                      })}
                   </div>
                </div>

                {/* 4. Autonomous System Running Logs Console */}
                <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-3xl p-6 lg:p-8 text-slate-800 dark:text-white shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col gap-6 transition-colors">
                   <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-5 text-slate-800 dark:text-white transition-opacity">
                      <Activity size={100} className="animate-pulse" />
                   </div>
                   
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5 select-none relative z-10 transition-colors">
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                         <h4 className="text-base font-black tracking-tight flex items-center gap-2">
                           天算智农物联网自治运行审计日志
                         </h4>
                      </div>

                      <div className="flex gap-2">
                         {['all', 'iot', 'actions'].map(f => (
                           <button
                             key={f}
                             onClick={() => setLogFilter(f as any)}
                             className={cn(
                               "px-4 py-1.5 rounded-xl text-[9px] font-black tracking-widest uppercase transition-all border",
                               logFilter === f 
                                 ? "bg-white text-slate-950 border-white shadow" 
                                 : "bg-white/5 text-slate-400 border-white/5 hover:text-white"
                             )}
                           >
                             {f === 'all' ? '全部日志' : f === 'iot' ? '微感巡检' : '控制动作'}
                           </button>
                         ))}
                      </div>
                   </div>

                   {/* Terminal Screen log logs display */}
                   <div ref={terminalContainerRef} className="h-60 overflow-y-auto no-scrollbar bg-slate-50 dark:bg-[#050505]/40 border border-slate-200 dark:border-white/5 p-6 rounded-2xl font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed relative z-10 shadow-inner dark:shadow-none transition-colors">
                      {filteredLogs.map((log, i) => {
                        const isActionLog = log.includes('[ACTUATOR') || log.includes('[SHOPPING') || log.includes('[REFRESH');
                        const isWarning = log.includes('STRESS') || log.includes('干旱');
                        return (
                          <div 
                            key={i} 
                            className={cn(
                              "pb-2 border-b border-slate-100 dark:border-white/[0.02] last:border-0",
                              isActionLog ? "text-emerald-600 dark:text-emerald-400" : isWarning ? "text-yellow-600 dark:text-yellow-400" : "text-slate-600 dark:text-slate-300"
                            )}
                          >
                            <span className="text-slate-400 dark:text-slate-500">{log.slice(0, 10)}</span>
                            <span>{log.slice(10)}</span>
                          </div>
                        );
                      })}

                   </div>
                </div>

             </div>

             {/* Right Compartment: Weather radar + Plot Observation alerts */}
             <div className="col-span-12 xl:col-span-4 space-y-5 sm:space-y-8 lg:space-y-12">
                
                 {/* 7. Quick Task Template Container */}
                 <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative overflow-hidden flex flex-col gap-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-50 dark:border-slate-800 select-none">
                       <div className="flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                          <h3 className="text-lg font-black text-slate-850 dark:text-slate-100 tracking-tight italic">
                            快速作业模板
                          </h3>
                       </div>
                       <span className="text-[9px] font-black text-slate-300 font-mono">一键日程提醒</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       {[
                         { id: 'water', name: '精准灌溉', icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
                         { id: 'fertilize', name: '变量施肥', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
                         { id: 'inspect', name: '全域巡检', icon: Scan, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
                         { id: 'harvest', name: '适时采收', icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                       ].map(task => {
                          const Icon = task.icon;
                          return (
                            <button
                              key={task.id}
                              onClick={() => handleQuickTask(task.id, task.name)}
                              disabled={activeTaskLoading === task.id}
                              className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group active:scale-95 shadow-sm hover:shadow-md"
                            >
                              <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110", task.bg, task.color)}>
                                {activeTaskLoading === task.id ? (
                                  <div className={cn("w-5 h-5 rounded-full border-2 border-t-transparent animate-spin", task.color.replace('text-', 'border-'))} />
                                ) : (
                                  <Icon size={20} />
                                )}
                              </div>
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                {task.name}
                              </span>
                            </button>
                          );
                       })}
                    </div>
                    <button 
                      onClick={() => handleQuickTask('custom', '自定义农活')}
                      disabled={activeTaskLoading === 'custom'}
                      className="w-full py-3.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-all flex items-center justify-center gap-2 mt-2"
                    >
                      {activeTaskLoading === 'custom' ? (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                      ) : (
                        <>
                          <CalendarDays size={16} /> 添加其他待办日程
                        </>
                      )}
                    </button>
                 </div>

                {/* 8. Smart Task Recommendation */}
                {recommendedTask && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 dark:from-emerald-500/20 dark:to-teal-500/10 backdrop-blur-2xl border border-emerald-500/20 dark:border-emerald-500/30 rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(16,185,129,0.1)] relative overflow-hidden flex flex-col gap-6"
                  >
                    <div className="flex items-center justify-between pb-4 border-b border-emerald-500/10 select-none">
                       <div className="flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                          <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-400 tracking-tight italic">
                            智能作业建议
                          </h3>
                       </div>
                       <span className="text-[9px] font-black text-emerald-600/60 dark:text-emerald-400/60 font-mono flex items-center gap-1">
                         <BrainCircuit size={10} /> AI驱动
                       </span>
                    </div>

                    <div className="flex gap-4 items-start">
                       <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", recommendedTask.bg, recommendedTask.color)}>
                         <recommendedTask.icon size={28} />
                       </div>
                       <div className="flex flex-col gap-2">
                         <h4 className="text-base font-black text-slate-800 dark:text-white">推荐执行：{recommendedTask.name}</h4>
                         <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                           {recommendedTask.reason}
                         </p>
                       </div>
                    </div>

                    <button 
                      onClick={() => handleQuickTask(recommendedTask.id, recommendedTask.name)}
                      disabled={activeTaskLoading === recommendedTask.id}
                      className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 mt-2"
                    >
                      {activeTaskLoading === recommendedTask.id ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                      ) : (
                        <>
                          <Play size={16} /> 一键执行建议
                        </>
                      )}
                    </button>
                  </motion.div>
                )}

                {/* 5. Detailed Weather Forecast & Agro Advice Cockpit */}
                <WeatherWidgetPro addSystemLog={addSystemLog} />

                {/* 6. Landscape Map Field Status Observation Alerts Container */}
                <div id="dashboard-alerts" className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative overflow-hidden flex flex-col gap-6">
                   <div className="flex items-center justify-between pb-4 border-b border-slate-50 dark:border-slate-800 select-none">
                      <div className="flex items-center gap-3">
                         <div className="w-1.5 h-6 bg-slate-900 dark:bg-slate-100 rounded-full" />
                         <h3 className="text-lg font-black text-slate-850 dark:text-slate-100 tracking-tight italic">
                           园区地块网格感知与防汛灾防
                         </h3>
                      </div>
                      <span className="text-[9px] font-black text-slate-300 font-mono">网格地块扫描</span>
                   </div>

                   {/* Plot lists rendering real-time simulation */}
                   <div className="space-y-4">
                     {plotWarnings.map(plot => (
                       <div 
                         key={plot.id}
                         className={cn(
                           "p-5.5 rounded-3xl border transition-all duration-300 flex flex-col gap-4 relative overflow-hidden",
                           plot.status === 'optimal' 
                             ? "bg-slate-50/50 dark:bg-slate-800/40 border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800" 
                             : "bg-red-500/5 dark:bg-red-500/10 border-red-500/10 dark:border-red-500/20"
                         )}
                       >
                         <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3.5 min-w-0">
                               <div className={cn(
                                 "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                 plot.status === 'optimal' ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400" : "bg-red-500 text-white"
                               )}>
                                 {plot.status === 'optimal' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                               </div>

                               <div className="min-w-0">
                                  <h6 className="text-[14px] font-black text-slate-850 dark:text-slate-100 truncate leading-tight transition-colors">{plot.name}</h6>
                                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest font-mono mt-1 transition-colors">Sensing Code: {plot.code}</p>
                               </div>
                            </div>

                            <div className="text-right">
                               <span className={cn(
                                 "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded leading-none block",
                                 plot.status === 'optimal' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400" : "bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400 animate-pulse"
                               )}>
                                 {plot.status === 'optimal' ? '状态：优' : '需关注'}
                               </span>
                            </div>
                         </div>

                         {/* Plot Water level bar and Alert detailed content block */}
                         <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 transition-colors">
                               <span>根部土壤含水量</span>
                               <span className={plot.status === 'optimal' ? 'text-slate-800 dark:text-slate-200' : 'text-red-500 dark:text-red-400 font-black font-mono'}>{plot.moisture}%</span>
                            </div>
                            
                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden transition-colors">
                               <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${plot.moisture}%` }}
                                 transition={{ duration: 1.5, ease: "easeOut" }}
                                 className={cn(
                                   "h-full rounded-full transition-all",
                                   plot.status === 'optimal' ? "bg-emerald-500" : "bg-red-500 dark:bg-red-400"
                                 )}
                               />
                            </div>
                         </div>

                         {/* Stress action solver button */}
                         {plot.status !== 'optimal' && (
                           <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5">
                              <p className="text-xs font-bold text-red-700 leading-relaxed pr-2">
                                ⚠️ **水分告急**：该试验点水分接近凋萎系数，作物根系叶绿素呼吸受阻。建议立即调蓄补水。
                              </p>
                              <button
                                onClick={() => handleSolvePlotStress(plot.id)}
                                disabled={plotSolveLoading === plot.id}
                                className="w-full py-3.5 bg-slate-900 border border-slate-900 hover:bg-emerald-600 hover:border-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow active:scale-95 flex items-center justify-center gap-1.5"
                              >
                                {plotSolveLoading === plot.id ? (
                                  <>
                                    <div className="w-3.5 h-3.5 rounded-full border border-white border-t-transparent animate-spin" />
                                    <span>云指令下发中...</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCcw size={12} /> 一键智联物联网滴灌
                                  </>
                                )}
                              </button>
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                </div>

             </div>
          </div>
        </main>

        {/* Global Floating Active trigger to sync refresh */}
        <div className="fixed bottom-10 right-10 z-[100] flex flex-col gap-4 select-none">
           <button 
             onClick={handleRefresh}
             className="w-15 h-15 bg-slate-900 hover:bg-emerald-600 text-white rounded-2xl shadow-3xl hover:shadow-emerald-500/40 flex items-center justify-center transition-all duration-300 active:scale-90 group"
           >
              <RefreshCcw size={24} className="group-hover:rotate-180 transition-transform duration-700" />
           </button>
        </div>

        {/* Removed duplicate InteractiveCenter to mount at the App root wrapper */}
      
      </div>
      {/* Modals and Overlays */}
      <AnimatePresence>
        {isConfigModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative"
            >
              <button 
                onClick={() => setIsConfigModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
              <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">指标卡片排序</h3>
              <p className="text-xs text-slate-500 mb-6">拖拽以调整概览页面的核心指标显示顺序。</p>
              
              <Reorder.Group 
                axis="y" 
                values={statOrder} 
                onReorder={setStatOrder} 
                className="flex flex-col gap-3"
              >
                {statOrder.map((id) => {
                  const stat = defaultStats.find(s => s.id === id);
                  if (!stat) return null;
                  const Icon = stat.icon;
                  return (
                    <Reorder.Item 
                      key={id} 
                      value={id}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between cursor-grab active:cursor-grabbing hover:border-emerald-500 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg bg-white dark:bg-slate-900", stat.color)}>
                          <Icon size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{stat.label}</span>
                      </div>
                      <GripVertical size={16} className="text-slate-400" />
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={saveConfig}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
                >
                  保存设置
                </button>
              </div>
            </motion.div>
          </div>
        )}
        
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative"
            >
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
              <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">导出监测数据</h3>
              <p className="text-xs text-slate-500 mb-6">请选择需要包含的特定指标列（时间列将默认包含）。</p>
              
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={exportColumns.temp} 
                    onChange={(e) => setExportColumns(prev => ({...prev, temp: e.target.checked}))}
                    className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <Thermometer size={16} className="text-amber-500" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">温度 (°C)</span>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={exportColumns.hum} 
                    onChange={(e) => setExportColumns(prev => ({...prev, hum: e.target.checked}))}
                    className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <Droplets size={16} className="text-blue-500" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">湿度 (%)</span>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={exportColumns.light} 
                    onChange={(e) => setExportColumns(prev => ({...prev, light: e.target.checked}))}
                    className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <Sun size={16} className="text-amber-400" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">光照 (Lux)</span>
                  </div>
                </label>
              </div>

              <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                    <Clock size={16} className="text-emerald-500" />
                    定时导出任务
                  </div>
                  <div className={cn("w-10 h-6 rounded-full transition-colors relative", isScheduledExport ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700")}>
                    <input 
                      type="checkbox"
                      className="sr-only"
                      checked={isScheduledExport}
                      onChange={(e) => setIsScheduledExport(e.target.checked)}
                    />
                    <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform", isScheduledExport ? "translate-x-4" : "translate-x-0")} />
                  </div>
                </label>
                
                {isScheduledExport && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4"
                  >
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">触发条件 / 频率</label>
                    <select
                      value={scheduledFrequency}
                      onChange={(e) => setScheduledFrequency(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 dark:text-slate-200 transition-colors"
                    >
                      <option value="daily">每日自动生成</option>
                      <option value="weekly_monday">每周一自动生成</option>
                      <option value="monthly_first">每月1号自动生成</option>
                    </select>
                  </motion.div>
                )}
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmExport}
                  disabled={!exportColumns.temp && !exportColumns.hum && !exportColumns.light}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
                >
                  确认导出
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
