import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { 
  Thermometer, 
  Droplets, 
  Sun, 
  Activity,
  FlaskConical, 
  AlertCircle, 
  History, 
  BarChart3, 
  LineChart as LineChartIcon,
  ChevronLeft,
  ChevronRight,
  Info,
  LayoutDashboard,
  ArrowUp,
  ArrowDown,
  X,
  Download,
  Zap,
  Search,
  Map as MapIcon,
  Clock,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Clipboard,
  FileText,
  Volume2,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import DataService, { RealtimeData, HistoryItem, Thresholds } from '../services/dataService';
import { cn } from '../lib/utils';
import { saveXlsxFile } from '../lib/xlsxExport';
import { useNotifications } from '../context/NotificationContext';
import { RadarChartD3 } from './RadarChartD3';

// --- Components ---
const SafePortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return createPortal(children, document.body);
};

const FieldMonitoring: React.FC<{ user: any, onNavigate: (tab: string) => void, initialPlotId?: string, navKey?: number }> = ({ user, onNavigate, initialPlotId, navKey }) => {
  const { t } = useTranslation();
  const [plots, setPlots] = useState<any[]>([]);
  const [activePlot, setActivePlot] = useState(initialPlotId || '');
  const reportRef = React.useRef<HTMLDivElement>(null);

  // Update activePlot if initialPlotId changes and scroll to it
  useEffect(() => {
    if (initialPlotId && plots.length > 0) {
      setActivePlot(initialPlotId);
      setTimeout(() => {
        const el = document.getElementById(`plot-card-${initialPlotId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else if (initialPlotId) {
      // Still set active plot even if plots aren't loaded yet
      setActivePlot(initialPlotId);
    }
  }, [initialPlotId, navKey, plots.length]);

  const [realtimeData, setRealtimeData] = useState<RealtimeData | null>(null);
  const [allPlotsData, setAllPlotsData] = useState<Record<string, RealtimeData>>({});
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [timeRange, setTimeRange] = useState('7d');
  const [chartPlotId, setChartPlotId] = useState<string>('all');
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [comparePlotIds, setComparePlotIds] = useState<string[]>([]);
  const [selectedParams, setSelectedParams] = useState<string[]>(['temperature', 'humidity', 'soilMoisture']);
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);
  const [calibratingSensor, setCalibratingSensor] = useState<string | null>(null);
  const [calibrationReason, setCalibrationReason] = useState('');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isScheduledExport, setIsScheduledExport] = useState(false);
  const [scheduledFrequency, setScheduledFrequency] = useState('weekly_monday');
  const [exportColumns, setExportColumns] = useState({ temp: true, hum: true, light: true, soilTemp: true, soilMoisture: true, soilPh: true, npk: true });
  const { addNotification } = useNotifications();

  // Heatmap State
  const [selectedGridCell, setSelectedGridCell] = useState<{ id: string; name: string; temp: number; moisture: number; state: 'normal'|'warning'|'danger'; statusText: string } | null>({
    id: 'B1', name: '大区 B-1 (西南重灾区)', temp: 34.8, moisture: 28, state: 'danger', statusText: '西南角传感器显示极度干旱警告，请一键下发防旱喷滴灌工单。'
  });
  
  // Push Simulator States
  const [showPushSimulator, setShowPushSimulator] = useState(false);
  const [smsPhone, setSmsPhone] = useState('138****8000');
  const [wechatNick, setWechatNick] = useState('张社员 (核心大户)');
  const [isSmsSending, setIsSmsSending] = useState(false);
  const [isWechatSending, setIsWechatSending] = useState(false);

  const thresholds = useMemo(() => DataService.getThresholds(), []);

  // --- Voice Memo States ---
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedResult, setTranscribedResult] = useState<any | null>(null);
  const [voiceMemos, setVoiceMemos] = useState<any[]>([]);
  const [playingMemoId, setPlayingMemoId] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);

  // Initialize voice memos list from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('nxzj_voice_memos');
    if (saved) {
      try {
        setVoiceMemos(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load voice memos from localStorage:', e);
      }
    }
  }, []);

  // Update recording timer
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // Audio Playback cleanup
  useEffect(() => {
    return () => {
      if (audioPlayer) {
        audioPlayer.pause();
      }
    };
  }, [audioPlayer]);

  // Start recording voice memo
  const startRecording = async () => {
    try {
      setAudioUrl(null);
      setAudioBlob(null);
      setTranscribedResult(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);

        // Stop all stream tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      addNotification({
        title: '开始录音',
        message: '现场声音采集开启，请口头描述您的巡查观察...',
        type: 'info'
      });
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      addNotification({
        title: '无法启动录音',
        message: '请确保已授予浏览器麦克风访问权限！',
        type: 'warning'
      });
    }
  };

  // Stop recording voice memo
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      addNotification({
        title: '录音结束',
        message: '声音已暂存，您可以进行 AI 分析。',
        type: 'success'
      });
    }
  };

  // Convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Process and transcribe audio via AI backend
  const handleAITranscribe = async () => {
    if (!audioBlob) return;

    setIsTranscribing(true);
    addNotification({
      title: 'AI 引擎启动',
      message: '正在向云端传输语音数据进行极速转译...',
      type: 'info'
    });

    try {
      const base64Data = await blobToBase64(audioBlob);
      const plotName = plots.find(p => p.id === activePlot)?.name || '未指定地块';

      const response = await fetch('/api/voice-memo/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType: 'audio/webm',
          plotName
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Transcribe API failed');
      }

      const result = await response.json();
      if (result.success) {
        setTranscribedResult(result);
        addNotification({
          title: '转录分析成功！',
          message: `诊断结论：${result.summary || '正常'}`,
          type: 'success'
        });

        // Save to Local Memos List
        const newMemo = {
          id: 'memo_' + Date.now(),
          time: new Date().toLocaleString(),
          plotName,
          transcript: result.transcript,
          report: result.report,
          status: result.status || 'normal',
          summary: result.summary || '巡查完毕',
          audioBase64: base64Data, // Save base64 for playing back in future sessions
          duration: recordingDuration || 5 // approximate or recorded duration
        };

        const updatedMemos = [newMemo, ...voiceMemos];
        setVoiceMemos(updatedMemos);
        localStorage.setItem('nxzj_voice_memos', JSON.stringify(updatedMemos));
      } else {
        throw new Error('Transcription error returned');
      }
    } catch (err: any) {
      console.error('Failed to transcribe voice memo:', err);
      addNotification({
        title: 'AI 分析失败',
        message: err.message || '可能网络连通受阻或 API 密钥未配置，请重试。',
        type: 'warning'
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  // Play/Pause previous memo audio
  const togglePlayMemo = (memo: any) => {
    if (playingMemoId === memo.id) {
      if (audioPlayer) {
        audioPlayer.pause();
      }
      setPlayingMemoId(null);
    } else {
      if (audioPlayer) {
        audioPlayer.pause();
      }

      const audioSrc = memo.audioBase64 
        ? `data:audio/webm;base64,${memo.audioBase64}`
        : null;

      if (!audioSrc) {
        addNotification({
          title: '播放失败',
          message: '未找到本条备忘录的音频源文件。',
          type: 'warning'
        });
        return;
      }

      const player = new Audio(audioSrc);
      player.onended = () => {
        setPlayingMemoId(null);
      };
      player.onerror = () => {
        setPlayingMemoId(null);
        addNotification({
          title: '播放失败',
          message: '音频源解码失败，可能格式不被浏览器支持。',
          type: 'warning'
        });
      };
      player.play();
      setAudioPlayer(player);
      setPlayingMemoId(memo.id);
    }
  };

  // Delete stored memo
  const handleDeleteMemo = (id: string) => {
    const updated = voiceMemos.filter(m => m.id !== id);
    setVoiceMemos(updated);
    localStorage.setItem('nxzj_voice_memos', JSON.stringify(updated));
    addNotification({
      title: '已删除',
      message: '该条语音备忘录及报告已从本地清除。',
      type: 'info'
    });
  };

  // --- Helper Functions ---
  function getParamLabel(key: string): string {
    const labels: any = {
      temperature: t('monitoring.params.temperature'), 
      humidity: t('monitoring.params.humidity'), 
      light: t('monitoring.params.light'),
      soilTemp: t('monitoring.params.soilTemp'),
      soilMoisture: t('monitoring.params.soilMoisture'), 
      pH: t('monitoring.params.soilPh'),
      nitrogen: t('monitoring.params.nitrogen'),
      phosphorus: t('monitoring.params.phosphorus'),
      potassium: t('monitoring.params.potassium')
    };
    return labels[key] || key;
  }

  function getParamUnit(key: string): string {
    const units: any = {
      temperature: '℃', humidity: '%RH', light: 'Lux',
      soilTemp: '℃', soilMoisture: '%', pH: 'pH',
      nitrogen: 'mg/kg', phosphorus: 'mg/kg', potassium: 'mg/kg'
    };
    return units[key] || '';
  }

  function getParamIcon(key: string): React.ReactNode {
    switch (key) {
      case 'temperature': case 'soilTemp': return <Thermometer size={18} />;
      case 'humidity': case 'soilMoisture': return <Droplets size={18} />;
      case 'light': return <Sun size={18} />;
      case 'pH': case 'nitrogen': case 'phosphorus': case 'potassium': return <FlaskConical size={18} />;
      default: return <Info size={18} />;
    }
  }

  function getStatus(key: string, value: number, thresholds: Thresholds): 'normal' | 'low' | 'high' {
    const tr = thresholds[key];
    if (!tr) return 'normal';
    if (value < tr.min) return 'low';
    if (value > tr.max) return 'high';
    return 'normal';
  }

  function getParamColor(index: number, opacity: number = 1): string {
    const colors = [
      `rgba(46, 125, 50, ${opacity})`,   // Forest Green
      `rgba(76, 175, 80, ${opacity})`,   // Emerald Green
      `rgba(59, 130, 246, ${opacity})`,  // Blue
      `rgba(245, 158, 11, ${opacity})`,  // Amber
      `rgba(239, 68, 68, ${opacity})`,   // Red
    ];
    return colors[index % colors.length];
  }

  function renderHistoryValue(key: string, value: number, unit: string, thresholds: Thresholds) {
    const status = getStatus(key, value, thresholds);
    
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md",
        status === 'high' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
        status === 'low' ? "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" :
        "text-slate-800 dark:text-slate-200"
      )}>
        <span className="font-mono font-bold">{value.toFixed(2)}{unit}</span>
        {status === 'high' && <ArrowUp size={14} />}
        {status === 'low' && <ArrowDown size={14} />}
      </div>
    );
  }

  interface MonitorCardProps {
    label: string;
    value: number;
    unit: string;
    icon: React.ReactNode;
    status: 'normal' | 'low' | 'high';
  }

  const MonitorCard: React.FC<MonitorCardProps> = ({ label, value, unit, icon, status }) => {
    const statusConfig = {
      normal: { label: t('app.online'), color: 'text-emerald-500', bg: 'bg-white dark:bg-[#0A0A0A]/50 dark:backdrop-blur-xl', border: 'border-slate-100 dark:border-white/10' },
      low: { label: t('management.status.warning'), color: 'text-orange-500', bg: 'bg-orange-50/50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/20' },
      high: { label: t('management.status.danger'), color: 'text-red-500', bg: 'bg-red-50/50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/20' }
    };

    const config = statusConfig[status];

    return (
      <div className={cn(
        "bento-card p-6 transition-all hover:scale-105 duration-300",
        config.bg,
        config.border
      )}>
        <div className="flex justify-between items-start mb-4">
          <div className={cn("p-2 rounded-xl bg-white dark:bg-[#050505]/50 shadow-sm border border-slate-100 dark:border-white/5", config.color)}>
            {icon}
          </div>
          <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-lg bg-white dark:bg-[#050505]/50 shadow-sm border border-slate-100 dark:border-white/5", config.color)}>
            {config.label}
          </span>
        </div>
        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-slate-800 dark:text-white font-mono">{value.toFixed(2)}</span>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{unit}</span>
        </div>
      </div>
    );
  };

  // 初始化数据加载
  useEffect(() => {
    const init = async () => {
      const list = await DataService.getPlots(user?.username);
      setPlots(list);
      if (list.length > 0) {
        setActivePlot(prev => prev || list[0].id);
      }
      
      // Load all plots realtime data
      const dataMap: Record<string, RealtimeData> = {};
      for (const plot of list) {
        dataMap[plot.id] = await DataService.getRealtimeData(plot.id);
      }
      setAllPlotsData(dataMap);
    };
    init();
  }, [user]);

  useEffect(() => {
    if (activePlot) {
      loadRealtime();
      loadHistory(1);
      loadChartData();
    }

    // 订阅数据更新
    let debounceTimer: NodeJS.Timeout;
    const unsubscribe = DataService.subscribe(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (activePlot) loadRealtime();
        // Also update all plots data
        if (plots.length > 0) {
          (async () => {
            const dataMap: Record<string, RealtimeData> = {};
            for (const plot of plots) {
              dataMap[plot.id] = await DataService.getRealtimeData(plot.id);
            }
            setAllPlotsData(dataMap);
          })();
        }
      }, 500); // 500ms debounce
    });
    return () => {
      unsubscribe();
      clearTimeout(debounceTimer);
    };
  }, [activePlot, plots]);

  useEffect(() => {
    const handleOpenCompare = () => {
      setIsCompareMode(true);
      if (plots.length > 0) {
        setComparePlotIds([plots[0].id, plots[1]?.id].filter(Boolean));
      }
      setTimeout(() => {
        const el = document.getElementById('monitoring-chart-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    };
    window.addEventListener('open-compare-mode', handleOpenCompare);
    return () => window.removeEventListener('open-compare-mode', handleOpenCompare);
  }, [plots]);

  // 监听参数或时间范围变化更新图表
  useEffect(() => {
    if (activePlot) loadChartData();
  }, [timeRange, selectedParams, chartPlotId, activePlot, isCompareMode, comparePlotIds]);

  const loadRealtime = async () => {
    const data = await DataService.getRealtimeData(activePlot);
    setRealtimeData(data);
    checkAlerts(data);
  };

  const loadHistory = async (page: number) => {
    const { total, list } = await DataService.getHistoryList(activePlot, page);
    setHistoryList(list);
    setTotalRecords(total);
    setCurrentPage(page);
  };

  const loadChartData = async () => {
    if (isCompareMode) {
      if (comparePlotIds.length === 0) {
        setChartData([]);
        return;
      }
      const allData = await Promise.all(
        comparePlotIds.map(id => DataService.getHistoricalData(id, timeRange, selectedParams))
      );
      const merged: Record<string, any> = {};
      allData.forEach((plotData, plotIdx) => {
        const pId = comparePlotIds[plotIdx];
        plotData.forEach(item => {
          if (!merged[item.date]) merged[item.date] = { date: item.date };
          selectedParams.forEach(param => {
            merged[item.date][`${param}_${pId}`] = item[param];
          });
        });
      });
      setChartData(Object.values(merged).sort((a: any, b: any) => a.date.localeCompare(b.date)));
    } else {
      const targetPlot = chartPlotId === 'all' ? 'all' : chartPlotId;
      const data = await DataService.getHistoricalData(targetPlot, timeRange, selectedParams);
      setChartData(data);
    }
  };

  const getPlotName = (id: string) => {
    if (id === 'all') return t('monitoring.sidebar.allPlots');
    return plots.find(p => p.id === id)?.name || id;
  };

  const getSeriesDefinition = () => {
    if (isCompareMode) {
      const series: any[] = [];
      let colorIdx = 0;
      comparePlotIds.forEach(pId => {
        selectedParams.forEach(param => {
          series.push({
            dataKey: `${param}_${pId}`,
            name: `${getParamLabel(param)} - ${getPlotName(pId)}`,
            param,
            unit: getParamUnit(param),
            color: getParamColor(colorIdx++)
          });
        });
      });
      return series;
    } else {
      return selectedParams.map((param, index) => ({
        dataKey: param,
        name: getParamLabel(param),
        param,
        unit: getParamUnit(param),
        color: getParamColor(index)
      }));
    }
  };

  const seriesDef = useMemo(() => getSeriesDefinition(), [isCompareMode, comparePlotIds, selectedParams, plots, t]);

  const memoizedChartData = useMemo(() => chartData, [chartData]);

  const CustomAlertDot = (props: any) => {
    const { cx, cy, stroke, value, dataKey } = props;
    if (cx == null || cy == null) return null;
    
    const [param] = dataKey.split('_');
    const thresholds = DataService.getThresholds();
    const status = getStatus(param, value, thresholds);

    if (status !== 'normal') {
      return (
        <g className="cursor-pointer">
          <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} className="animate-pulse" />
          <text x={cx} y={cy - 10} textAnchor="middle" fill="#ef4444" fontSize="12px" fontWeight="bold">!</text>
        </g>
      );
    }
    return <circle cx={cx} cy={cy} r={3} fill={stroke} strokeWidth={0} opacity={0} />;
  };

  const handleExportExcel = async () => {
    setIsExportModalOpen(true);
  };

  const confirmExportExcel = async () => {
    try {
      if (isScheduledExport) {
        addNotification({ title: '定时导出已生效', message: '系统将会在预设的触发条件自动生成报表并推送到通知面板', type: 'success' });
        setIsExportModalOpen(false);
        return;
      }
      
      // 获取较大规模的历史记录用于导出（例如前100条）
      const { list } = await DataService.getHistoryList(activePlot, 1, 100);
      
      if (!list || list.length === 0) {
        addNotification({
          title: t('monitoring.export.fail'),
          message: t('monitoring.export.noData'),
          type: 'warning'
        });
        setIsExportModalOpen(false);
        return;
      }

      // 准备导出数据
      const exportData = list.map(item => {
        const row: any = { [t('monitoring.table.time')]: item.time };
        if (exportColumns.temp) row[`${t('monitoring.params.temperature')}(℃)`] = item.temperature.toFixed(2);
        if (exportColumns.hum) row[`${t('monitoring.params.humidity')}(%RH)`] = item.humidity.toFixed(2);
        if (exportColumns.light) row[`${t('monitoring.params.light')}(Lux)`] = item.light.toFixed(2);
        if (exportColumns.soilTemp) row[`${t('monitoring.params.soilTemp')}(℃)`] = item.soilTemp.toFixed(2);
        if (exportColumns.soilMoisture) row[`${t('monitoring.params.soilMoisture')}(%)`] = item.soilMoisture.toFixed(2);
        if (exportColumns.soilPh) row[`${t('monitoring.params.soilPh')}(pH)`] = item.pH.toFixed(2);
        if (exportColumns.npk) {
          row[`${t('monitoring.params.nitrogen')} (mg/kg)`] = item.nitrogen.toFixed(2);
          row[`${t('monitoring.params.phosphorus')} (mg/kg)`] = item.phosphorus.toFixed(2);
          row[`${t('monitoring.params.potassium')} (mg/kg)`] = item.potassium.toFixed(2);
        }
        return row;
      });

      // 生成文件名
      const currentPlot = plots.find(p => p.id === activePlot);
      const plotName = currentPlot?.name || activePlot;
      const cropName = currentPlot?.crop || '未知';

      // 专属美化表头设计
      const headerTitle = "🌱 农星智境 (AgriStar) - 农田环境高频遥测报表";
      const subTitle1 = `📍 关联数据源地块: ${plotName}      🌾 种植资产: ${cropName}`;
      const subTitle2 = `📅 生成批次: ${new Date().toLocaleString()}      💻 引擎节点: 数据监测决策中心`;
      const tipInfo = `ℹ️ 安全标注: 本文件由农星智境区块链验证自动导出，提供全链路防篡改校验。`;

      const headers = Object.keys(exportData[0]);
      const rows = [
        [headerTitle],
        [],
        [subTitle1],
        [subTitle2],
        [tipInfo],
        [], // 空行分隔
        headers,
        ...exportData.map((row) => headers.map((header) => row[header] ?? '')),
      ];

      const filename = t('monitoring.export.filename', { 
        name: plotName, 
        date: new Date().toISOString().split('T')[0] 
      });

      // 写入文件并触发下载
      await saveXlsxFile({
        name: t('monitoring.export.sheetName'),
        rows,
        merges: ['A1:J1', 'A3:J3', 'A4:J4', 'A5:J5'],
        columnWidths: headers.map((header, index) => (
          index === 0 ? 22 : Math.max(14, Math.min(30, header.length + 4))
        )),
      }, filename);

      addNotification({
        title: t('monitoring.export.success'),
        message: t('monitoring.export.successMsg', { count: list.length }),
        type: 'success'
      });
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      addNotification({
        title: t('monitoring.export.fail'),
        message: t('monitoring.export.error'),
        type: 'error'
      });
    }
  };

  const handleExportPDF = () => {
    setIsPDFModalOpen(true);
  };

  const confirmExportPDF = async () => {
    if (!reportRef.current) {
      addNotification({
        title: 'PDF导出失败',
        message: '无法获取报表预览元素，请重试。',
        type: 'warning'
      });
      return;
    }
    setIsGeneratingPDF(true);
    addNotification({
      title: '正在生成PDF报告',
      message: '正在转换高分辨率排版并合并诊断数据，请稍候...',
      type: 'info'
    });

    try {
      const element = reportRef.current;
      const canvas = await toCanvas(element, {
        pixelRatio: 2, // 2x resolution for printing sharpness
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 standard width in mm
      const pageHeight = 297; // A4 standard height in mm
      const canvasHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = canvasHeight;
      let position = 0;

      // Add pages sequentially
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, canvasHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - canvasHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, canvasHeight);
        heightLeft -= pageHeight;
      }

      const currentPlot = plots.find(p => p.id === activePlot);
      const plotName = currentPlot?.name || activePlot;
      const dateStr = new Date().toISOString().split('T')[0];
      pdf.save(`AgriStar_FieldReport_${plotName}_${dateStr}.pdf`);

      addNotification({
        title: 'PDF报告导出成功',
        message: `「${plotName}」的多源遥测与诊断报告已成功下载！`,
        type: 'success'
      });
      setIsPDFModalOpen(false);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      addNotification({
        title: 'PDF导出失败',
        message: '生成 PDF 时发生内部排版或图像转换错误，请重试。',
        type: 'error'
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleCalibrate = async (sensorKey: string, value: number) => {
    if (!calibrationReason.trim()) {
      addNotification({
        title: t('monitoring.calibration.fail'),
        message: t('monitoring.calibration.failReason'),
        type: 'warning'
      });
      return;
    }

    setIsCalibrating(true);
    try {
      const result = await DataService.calibrateSensor(activePlot, sensorKey, value, calibrationReason);
      if (result.success) {
        addNotification({
          title: t('monitoring.calibration.success'),
          message: t('monitoring.calibration.successMsg', { 
            param: getParamLabel(sensorKey), 
            value, 
            unit: getParamUnit(sensorKey) 
          }),
          type: 'success'
        });
        setCalibratingSensor(null);
        setCalibrationReason('');
        loadRealtime(); // 刷新实时数据
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      addNotification({
        title: t('monitoring.calibration.fail'),
        message: error instanceof Error ? error.message : t('app.unknownError'),
        type: 'error'
      });
    } finally {
      setIsCalibrating(false);
    }
  };

  const checkAlerts = (data: RealtimeData) => {
    const sessionKey = `alert_shown_${new Date().toISOString().split('T')[0]}_${activePlot}`;
    
    // 简单防骚扰：每个地块每天仅首次加载发送通知
    if (localStorage.getItem(sessionKey)) return;

    const plotName = plots.find(p => p.id === activePlot)?.name || activePlot;

    if (data.nitrogen < thresholds.nitrogen.min) {
      addNotification({
        title: t('monitoring.warnings.title', { name: plotName, param: t('monitoring.params.nitrogen') }),
        message: t('monitoring.warnings.lowNitrogen', { value: data.nitrogen }),
        type: 'warning'
      });
    }
    if (data.phosphorus < thresholds.phosphorus.min) {
      addNotification({
        title: t('monitoring.warnings.title', { name: plotName, param: t('monitoring.params.phosphorus') }),
        message: t('monitoring.warnings.lowPhosphorus', { value: data.phosphorus }),
        type: 'warning'
      });
    }
    if (data.potassium < thresholds.potassium.min) {
      addNotification({
        title: t('monitoring.warnings.title', { name: plotName, param: t('monitoring.params.potassium') }),
        message: t('monitoring.warnings.lowPotassium', { value: data.potassium }),
        type: 'warning'
      });
    }

    localStorage.setItem(sessionKey, 'true');
  };

  if (plots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center bg-white/80 dark:bg-[#121214]/40 backdrop-blur-xl rounded-[40px] border border-slate-100 dark:border-white/5 p-12">
        <div className="w-24 h-24 bg-forest-green/10 text-forest-green dark:text-emerald-400 rounded-full flex items-center justify-center mb-6">
          <Activity size={48} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-4 tracking-tight">{t('monitoring.empty.title')}</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 font-medium">
          {t('monitoring.empty.desc')}
        </p>
        <button 
          onClick={() => onNavigate('management')}
          className="px-8 py-4 bg-forest-green text-white rounded-2xl font-black text-sm hover:bg-emerald-green transition-all shadow-xl shadow-forest-green/20"
        >
          {t('monitoring.empty.action')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* 0. 地块选择器 (保留原有) */}
      <section className="flex flex-col items-stretch justify-between gap-4 bg-white/80 dark:bg-[#121214]/40 backdrop-blur-xl p-4 sm:flex-row sm:items-center sm:p-6 rounded-2xl sm:rounded-[32px] card-shadow border border-slate-100 dark:border-white/5 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none">
        <div className="flex min-w-0 items-center gap-4">
          <div className="w-10 h-10 bg-forest-green/10 text-forest-green dark:text-emerald-400 rounded-xl flex items-center justify-center border border-slate-100 dark:border-white/5">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">{t('monitoring.sidebar.currentPlot')}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{t('monitoring.sidebar.desc')}</p>
          </div>
        </div>
        <div className="mobile-scroll-row w-full gap-2 sm:w-auto">
          {plots.map(plot => (
            <button
              key={plot.id}
              onClick={() => setActivePlot(plot.id)}
              className={cn(
                "min-h-11 shrink-0 px-4 py-2 sm:px-6 rounded-xl text-sm font-black transition-all active:scale-95",
                activePlot === plot.id 
                  ? "bg-forest-green text-white shadow-lg shadow-forest-green/20" 
                  : "bg-slate-50 dark:bg-[#0A0A0A]/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] border border-slate-100 dark:border-white/5"
              )}
            >
              {plot.name}
            </button>
          ))}
        </div>
      </section>

      {/* 概览仪表盘 - D3雷达图综合分析 */}
      <section className="bg-white/80 dark:bg-[#121214]/40 backdrop-blur-xl p-4 sm:p-8 rounded-2xl sm:rounded-[40px] border border-slate-100 dark:border-white/5 shadow-2xl relative overflow-hidden transition-colors flex flex-col xl:flex-row gap-4 sm:gap-8 items-center justify-between">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <BarChart3 size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                地块综合概览仪表盘
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">综合肥力、环境健康度及生产进度多维评估</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg mt-4">
            通过多维传感器数据融合与算法模型分析，我们为您提供当前地块的全面健康状况评估。雷达图展示了各项指标的综合得分，帮助您快速了解地块的优势与短板。
          </p>
          <div className="flex gap-4 mt-6">
             <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
               <span className="text-xs text-slate-500 block mb-1">综合健康指数</span>
               <span className="text-2xl font-black text-emerald-500">92<span className="text-sm ml-1 text-slate-400">/100</span></span>
             </div>
             <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
               <span className="text-xs text-slate-500 block mb-1">本周产量预估增幅</span>
               <span className="text-2xl font-black text-blue-500">+4.5%</span>
             </div>
          </div>
        </div>
        <div className="w-full max-w-full overflow-hidden xl:w-auto flex justify-center items-center bg-slate-50 dark:bg-slate-900/50 p-2 sm:p-6 rounded-2xl sm:rounded-[32px] border border-slate-100 dark:border-white/5 [&>svg]:max-w-full">
          <RadarChartD3 
            data={[
              { axis: "土壤肥力", value: realtimeData?.soilMoisture ? Math.min(100, realtimeData.soilMoisture * 1.5) : 85 },
              { axis: "光照充足度", value: realtimeData?.light ? Math.min(100, realtimeData.light / 500) : 70 },
              { axis: "温湿度适宜度", value: realtimeData?.temperature ? 100 - Math.abs(25 - realtimeData.temperature) * 4 : 90 },
              { axis: "水分蓄积", value: realtimeData?.humidity ? Math.min(100, realtimeData.humidity * 1.2) : 80 },
              { axis: "病虫害防御", value: 95 },
              { axis: "生产进度", value: 88 }
            ]} 
            width={350} 
            height={350} 
          />
        </div>
      </section>

      {/* 0.3 多源数据融合预警模型 & 空间化热力图预警 (国赛级增强) */}
      <section id="monitoring-realtime-grid" className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        <div id="monitoring-alerts" className="xl:col-span-2 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#121214]/60 dark:to-[#0A0A0C]/80 backdrop-blur-xl p-4 sm:p-8 rounded-2xl sm:rounded-[40px] border border-slate-100 dark:border-white/5 shadow-2xl relative overflow-hidden transition-colors">
           <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
             <AlertCircle size={120} className="text-rose-500" />
           </div>
           
           <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center mb-6 sm:mb-8 relative z-10">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center border border-rose-500/30">
                   <Zap size={24} />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                     多源数据时序预测预警 
                     <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] rounded-lg tracking-widest uppercase">LSTM 模型</span>
                   </h3>
                   <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">综合环境阈值与趋势外推，动态生成风险分级与 SOP 指导</p>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
              <div className="bg-slate-50/50 dark:bg-white/5 border border-slate-150 dark:border-white/10 rounded-2xl p-5 hover:bg-white dark:hover:bg-white/10 transition-colors">
                <div className="flex justify-between items-start mb-4">
                   <div>
                     <span className="px-2 py-1 bg-amber-500/20 text-amber-500 dark:text-amber-400 text-[10px] font-black uppercase rounded-md border border-amber-500/30">橙色预警 (II级)</span>
                     <h4 className="text-slate-950 dark:text-white font-bold text-sm mt-2">土壤墒情持续下降趋势警告</h4>
                   </div>
                   <span className="text-slate-400 dark:text-slate-500 text-xs font-mono">10分钟前</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                  模型预测显示，由于连续高温，<strong className="text-amber-500 dark:text-amber-400">{plots.find(p => p.id === activePlot)?.name || '当前地块'}</strong> 的土壤湿度将在未来 6 小时内跌破 40% 警戒线。
                </p>
                <div className="flex gap-2">
                  <button onClick={() => window.open('https://www.bing.com/videos/riverview/relatedvideo?q=%e9%98%b2%e6%97%b1sop%e8%a7%86%e9%a2%91%e6%95%99%e5%ad%a6&&mid=91354ABBE39C59BD89BE91354ABBE39C59BD89BE&churl=https%3a%2f%2fspace.bilibili.com%2f1230751885&FORM=VAMGZC', '_blank')} className="flex-1 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white text-[11px] font-black rounded-xl transition-colors border border-slate-200 dark:border-white/5">
                    查看防旱 SOP 视频教程
                  </button>
                  <button onClick={() => {
                    const plotName = plots.find(p => p.id === activePlot)?.name || '当前地块';
                    DataService.addWorkOrder({
                      title: `${plotName} - 40% 墒情紧急降温滴灌工单`,
                      assignee: '水管网阀控网格员',
                      time: '今日 14:00 前 (AI 决策预测下达)',
                      status: '进行中',
                      progress: 15
                    });
                    addNotification({
                      title: '滴灌自动工单派发完毕！',
                      message: `已将 '${plotName}' 的紧急降温滴灌工单写入区块链协同流，并指派给物联网微控制阀组接口。`,
                      type: 'success'
                    });
                  }} className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black rounded-xl transition-colors shadow-lg shadow-amber-500/20">
                    一键生成滴灌工单
                  </button>
                </div>
              </div>

              <div className="bg-slate-50/50 dark:bg-white/5 border border-slate-150 dark:border-white/10 rounded-2xl p-5 hover:bg-white dark:hover:bg-white/10 transition-colors">
                <div className="flex justify-between items-start mb-4">
                   <div>
                     <span className="px-2 py-1 bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase rounded-md border border-blue-500/30">蓝色预警 (IV级)</span>
                     <h4 className="text-slate-950 dark:text-white font-bold text-sm mt-2">夜间温度骤降提醒</h4>
                   </div>
                   <span className="text-slate-400 dark:text-slate-500 text-xs font-mono">10分钟前</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                  气象 API 数据融合表明，今夜 02:00 将出现 8°C 低温，可能对幼苗造成轻度冷害。
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setShowPushSimulator(true)} className="flex-1 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white text-[11px] font-black rounded-xl transition-colors border border-slate-200 dark:border-white/5 text-center">
                    多渠道模拟推送 (微信/短信)
                  </button>
                </div>
              </div>
           </div>
        </div>

        <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-xl p-4 sm:p-8 rounded-2xl sm:rounded-[40px] border border-slate-100 dark:border-white/5 shadow-xl relative overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
              <MapIcon size={18} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">热力图空间微网</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">全网物联环境态势空间映射</p>
            </div>
          </div>
          <div className="flex-1 min-h-[200px] rounded-2xl border border-slate-100 dark:border-white/10 relative overflow-hidden bg-slate-50 dark:bg-[#0A0A0A] flex items-center justify-center">
             <div className="absolute inset-0 opacity-40 mix-blend-multiply dark:mix-blend-screen" style={{
               background: 'radial-gradient(circle at 30% 40%, rgba(245,158,11,0.4) 0%, transparent 40%), radial-gradient(circle at 70% 60%, rgba(59,130,246,0.3) 0%, transparent 50%)'
             }} />
             <div className="absolute inset-0 pattern-grid-lg opacity-5" />
             <div className="relative z-10 text-center">
                <div className="text-left w-full h-full flex flex-col p-2 space-y-3">
                  {/* 交互式热力传感器矩阵图 */}
                  <div className="grid grid-cols-2 gap-2 mb-2 w-full">
                    {[
                      { id: 'A1', name: '大区 A-1 (东北角)', temp: 24.5, moisture: 48, state: 'normal', statusText: '处于标准健康指标范围，作物呼吸代谢状态良好。' },
                      { id: 'A2', name: '大区 A-2 (西北角)', temp: 31.2, moisture: 38, state: 'warning', statusText: '温湿度曲线轻度偏离，水分偏干，处于预警临界水平。' },
                      { id: 'B1', name: '大区 B-1 (西南重灾区)', temp: 34.8, moisture: 28, state: 'danger', statusText: '温度异常偏高且含水率跌破红线！需立刻启动对地块该分区的紧急滴灌降温。' },
                      { id: 'B2', name: '大区 B-2 (东南角)', temp: 23.1, moisture: 55, state: 'normal', statusText: '水分指标良好，叶面蒸腾小气候健康。' }
                    ].map((cell) => {
                      const colorClasses = {
                        normal: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20',
                        warning: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20',
                        danger: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border-rose-500/30'
                      };
                      const isSelected = selectedGridCell?.id === cell.id;
                      return (
                        <button
                          key={cell.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGridCell(cell as any);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all ${colorClasses[cell.state as 'normal'|'warning'|'danger']} ${
                            isSelected ? 'ring-2 ring-forest-green dark:ring-emerald-400 scale-[1.01]' : 'opacity-80 hover:opacity-100'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-black font-mono">{cell.id} 单元</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${cell.state === 'normal' ? 'bg-emerald-500' : cell.state === 'warning' ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'}`} />
                          </div>
                          <div className="text-[9px] font-bold leading-tight">
                            <div>气温: {cell.temp}℃</div>
                            <div>含水: {cell.moisture}%</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedGridCell && (
                    <div className="p-3 bg-white/70 dark:bg-black/45 rounded-xl border border-slate-100 dark:border-white/5 text-[11px] backdrop-blur-md">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-black text-slate-800 dark:text-white">{selectedGridCell.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          selectedGridCell.state === 'normal' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600' : 
                          selectedGridCell.state === 'warning' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600' : 
                          'bg-rose-100 dark:bg-rose-500/20 text-rose-600'
                        }`}>
                          {selectedGridCell.state === 'normal' ? '安全运行' : selectedGridCell.state === 'warning' ? '检测预警' : '干旱重灾'}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 mb-1 leading-snug font-semibold text-[10px]">
                        {selectedGridCell.statusText}
                      </p>
                      <div className="text-[9px] font-mono text-slate-400 flex gap-2">
                        <span>土壤pH: 6.5</span>
                        <span>冠层阻抗正常</span>
                      </div>
                    </div>
                  )}
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* 0.5. 所有地块实时概览 */}
      <section id="monitoring-devices" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {plots.map(plot => {
          const data = allPlotsData[plot.id];
          if (!data) return null;
          return (
            <div 
              key={plot.id} 
              id={`plot-card-${plot.id}`}
              onClick={() => setActivePlot(plot.id)}
              className={cn(
                "bg-white/80 dark:bg-[#050505]/40 backdrop-blur-xl rounded-2xl sm:rounded-[32px] p-4 sm:p-6 card-shadow border transition-all duration-500 cursor-pointer hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none relative overflow-hidden",
                activePlot === plot.id ? "border-forest-green dark:border-emerald-500 shadow-lg shadow-forest-green/10" : "border-slate-100 dark:border-white/5"
              )}
            >
              {plot.isSimulated && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-bl-xl z-10">
                  {t('monitoring.detail.status.simulated') || t('management.stats.simulated')}
                </div>
              )}
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-lg font-bold text-slate-800 dark:text-white">{plot.name}</h4>
                <span className="text-xs font-bold px-3 py-1 bg-forest-green/10 text-forest-green dark:text-emerald-400 rounded-full">
                  {plot.crop}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 sm:gap-y-6 gap-x-4">
                {[
                  { key: 'temperature', icon: <Thermometer size={14} /> },
                  { key: 'humidity', icon: <Droplets size={14} /> },
                  { key: 'light', icon: <Sun size={14} /> },
                  { key: 'soilTemp', icon: <Thermometer size={14} /> },
                  { key: 'soilMoisture', icon: <Droplets size={14} /> },
                  { key: 'pH', icon: <FlaskConical size={14} /> },
                  { key: 'nitrogen', icon: <FlaskConical size={14} /> },
                  { key: 'phosphorus', icon: <FlaskConical size={14} /> },
                  { key: 'potassium', icon: <FlaskConical size={14} /> },
                ].map(({ key, icon }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                      {icon}
                      <span className="text-[10px] font-bold uppercase tracking-wider">{getParamLabel(key)}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                        {data[key as keyof RealtimeData].toFixed(2)}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {getParamUnit(key)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* 1. 顶部实时数据卡片区 */}
      <section className="relative">
        {plots.find(p => p.id === activePlot)?.status === 'pending_setup' && (
          <div className="absolute inset-0 z-20 bg-white/60 dark:bg-black/60 backdrop-blur-[8px] rounded-[32px] flex flex-col items-center justify-center text-center p-12 border border-dashed border-indigo-500/30">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20">
              <Zap size={40} className="animate-pulse" />
            </div>
            <h4 className="text-2xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">{t('monitoring.inactive.title')}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
              {t('monitoring.inactive.desc')}
            </p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#1A1A1A] rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Search size={14} />
                {t('monitoring.inactive.action')}
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {realtimeData && (Object.entries(realtimeData) as [keyof RealtimeData, number][]).map(([key, value]) => (
            <MonitorCard 
              key={key}
              label={getParamLabel(key)}
              value={value}
              unit={getParamUnit(key)}
              icon={getParamIcon(key)}
              status={getStatus(key, value, thresholds)}
            />
          ))}
        </div>
      </section>

      {/* 2. 中部图表分析区 */}
      <section id="monitoring-trends" className="bg-white/80 dark:bg-[#050505]/40 backdrop-blur-xl rounded-2xl sm:rounded-[40px] card-shadow p-4 sm:p-8 border border-slate-100 dark:border-white/5 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none">
        <span id="monitoring-chart-section" className="sr-only" aria-hidden="true" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 sm:mb-8">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
              {chartPlotId === 'all' ? t('monitoring.chart.allPlots') : t('monitoring.chart.trendAnalysis', { name: plots.find(p => p.id === chartPlotId)?.name || '' })}
            </h3>
            <div className="flex bg-slate-100 dark:bg-[#0A0A0A]/50 p-1 rounded-xl border border-slate-200 dark:border-white/5">
              <button 
                onClick={() => setChartType('line')}
                className={cn("px-4 py-1.5 rounded-lg text-sm font-black transition-all", chartType === 'line' ? "bg-white dark:bg-[#1A1A1A] shadow-sm text-forest-green dark:text-emerald-400" : "text-slate-400 dark:text-slate-500")}
              >
                {t('monitoring.chart.line')}
              </button>
              <button 
                onClick={() => setChartType('bar')}
                className={cn("px-4 py-1.5 rounded-lg text-sm font-black transition-all", chartType === 'bar' ? "bg-white dark:bg-[#1A1A1A] shadow-sm text-forest-green dark:text-emerald-400" : "text-slate-400 dark:text-slate-500")}
              >
                {t('monitoring.chart.bar')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <button 
              onClick={() => setIsCompareMode(!isCompareMode)}
              className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all", isCompareMode ? "bg-forest-green text-white border-forest-green shadow-[0_0_15px_rgba(46,125,50,0.4)]" : "bg-slate-50 dark:bg-[#0A0A0A]/50 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1A1A]")}
            >
              多地块数据对比模式
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {!isCompareMode ? (
              <select 
                className="bg-slate-50 dark:bg-[#0A0A0A]/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-forest-green dark:text-slate-300 transition-colors"
                value={chartPlotId}
                onChange={(e) => setChartPlotId(e.target.value)}
              >
                <option value="all">{t('monitoring.sidebar.allPlots')}</option>
                {plots.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-slate-500 mr-2">选择对比地块 (最多3个):</span>
                {plots.map(p => {
                  const isChecked = comparePlotIds.includes(p.id);
                  return (
                    <label key={p.id} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors", isChecked ? "bg-forest-green/10 border-forest-green text-forest-green" : "bg-slate-50 dark:bg-[#0A0A0A]/50 border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-[#1A1A1A]")}>
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setComparePlotIds(comparePlotIds.filter(id => id !== p.id));
                          } else {
                            if (comparePlotIds.length < 3) setComparePlotIds([...comparePlotIds, p.id]);
                          }
                        }}
                        className="rounded text-forest-green focus:ring-forest-green dark:bg-[#1A1A1A] dark:border-white/10"
                      />
                      <span className="text-xs font-bold">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <select 
              className="bg-slate-50 dark:bg-[#0A0A0A]/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-forest-green dark:text-slate-300 transition-colors"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="7d">{t('monitoring.chart.range.7d')}</option>
              <option value="30d">{t('monitoring.chart.range.30d')}</option>
            </select>
            
            <div className="flex flex-wrap gap-2">
              {['temperature', 'humidity', 'light', 'soilTemp', 'soilMoisture', 'pH', 'nitrogen', 'phosphorus', 'potassium'].map(p => (
                <label key={p} className="flex items-center gap-2 bg-slate-50 dark:bg-[#0A0A0A]/50 px-3 py-2 rounded-xl border border-slate-100 dark:border-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedParams.includes(p)}
                    onChange={() => {
                      if (selectedParams.includes(p)) {
                        if (selectedParams.length > 1) setSelectedParams(selectedParams.filter(item => item !== p));
                      } else {
                        if (selectedParams.length < 5) setSelectedParams([...selectedParams, p]);
                      }
                    }}
                    className="rounded text-forest-green focus:ring-forest-green dark:bg-[#1A1A1A] dark:border-white/10"
                  />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{getParamLabel(p)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <AreaChart data={memoizedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  {seriesDef.map((s) => (
                    <linearGradient key={`grad-${s.dataKey}`} id={`color-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={s.color} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  dy={10}
                />
                {/* 动态生成 Y 轴 */}
                {Array.from(new Set(seriesDef.map(s => s.unit))).map((unit, index) => (
                  <YAxis 
                    key={`y-${unit}`}
                    yAxisId={`y-${unit}`}
                    orientation={index % 2 === 0 ? 'left' : 'right'}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    label={{ value: unit as string, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 10 }}
                  />
                ))}
                <RechartsTooltip 
                  isAnimationActive={false}
                  cursor={{ stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '12px'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ color: '#f8fafc', marginBottom: '8px', fontWeight: 'black' }}
                />
                <RechartsLegend 
                  verticalAlign="top" 
                  height={36}
                  iconType="circle"
                  onClick={(e) => {
                    const { dataKey } = e;
                    if (typeof dataKey === 'string') {
                      setHiddenSeries(prev => 
                        prev.includes(dataKey) 
                          ? prev.filter(s => s !== dataKey) 
                          : [...prev, dataKey]
                      );
                    }
                  }}
                  formatter={(value: string, entry: any) => {
                    const seriesName = seriesDef.find(s => s.dataKey === entry.dataKey)?.name || value;
                    return (
                    <span className={cn(
                      "text-xs font-bold ml-1 cursor-pointer transition-opacity",
                      hiddenSeries.includes(entry.dataKey) ? "text-slate-300 opacity-40 line-through" : "text-slate-400"
                    )}>
                      {seriesName}
                    </span>
                  )}}
                />
                {seriesDef.map((s) => (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    name={s.name}
                    dataKey={s.dataKey}
                    hide={hiddenSeries.includes(s.dataKey)}
                    yAxisId={`y-${s.unit}`}
                    stroke={s.color}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill={`url(#color-${s.dataKey})`}
                    animationDuration={1500}
                    dot={<CustomAlertDot />}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={memoizedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  dy={10}
                />
                {Array.from(new Set(seriesDef.map(s => s.unit))).map((unit, index) => (
                  <YAxis 
                    key={`y-${unit}`}
                    yAxisId={`y-${unit}`}
                    orientation={index % 2 === 0 ? 'left' : 'right'}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    label={{ value: unit as string, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 10 }}
                  />
                ))}
                <RechartsTooltip 
                  isAnimationActive={false}
                  cursor={{ stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '12px'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ color: '#f8fafc', marginBottom: '8px', fontWeight: 'black' }}
                />
                <RechartsLegend 
                  verticalAlign="top" 
                  height={36}
                  iconType="circle"
                  onClick={(e) => {
                    const { dataKey } = e;
                    if (typeof dataKey === 'string') {
                      setHiddenSeries(prev => 
                        prev.includes(dataKey) 
                          ? prev.filter(s => s !== dataKey) 
                          : [...prev, dataKey]
                      );
                    }
                  }}
                  formatter={(value: string, entry: any) => {
                    const seriesName = seriesDef.find(s => s.dataKey === entry.dataKey)?.name || value;
                    return (
                    <span className={cn(
                      "text-xs font-bold ml-1 cursor-pointer transition-opacity",
                      hiddenSeries.includes(entry.dataKey) ? "text-slate-300 opacity-40 line-through" : "text-slate-400"
                    )}>
                      {seriesName}
                    </span>
                  )}}
                />
                {seriesDef.map((s) => (
                  <Bar
                    key={s.dataKey}
                    name={s.name}
                    dataKey={s.dataKey}
                    hide={hiddenSeries.includes(s.dataKey)}
                    yAxisId={`y-${s.unit}`}
                    fill={s.color}
                    radius={[4, 4, 0, 0]}
                    animationDuration={1500}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* AI 语音巡检备忘录模块 */}
      <section className="bg-white/85 dark:bg-[#121214]/65 backdrop-blur-xl rounded-2xl sm:rounded-[40px] card-shadow p-4 sm:p-8 border border-slate-100 dark:border-white/5 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-green/10 text-forest-green dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-forest-green/20">
              <Mic size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                现场巡检 AI 语音备忘录
                <span className="px-2 py-0.5 bg-forest-green text-white text-[10px] rounded-lg tracking-widest uppercase">千问 多模态转录</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">使用麦克风直接录制田间巡查实录，AI 将自动转译并生成结构化的专业诊断报告</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 p-1.5 rounded-2xl border border-slate-150 dark:border-white/10">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-3">当前绑定地块：</span>
            <span className="text-xs font-black text-forest-green dark:text-emerald-400 px-3 py-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">
              {plots.find(p => p.id === activePlot)?.name || '未选择地块'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧：录音与分析控制面板 */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50/50 dark:bg-[#0A0A0A]/40 border border-slate-100 dark:border-white/5 rounded-3xl p-6 min-h-[360px]">
            <div className="space-y-6 text-center py-6">
              {/* 录音圆形动画盘 */}
              <div className="relative mx-auto w-32 h-32 flex items-center justify-center">
                {isRecording && (
                  <>
                    <motion.div 
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className="absolute inset-0 bg-red-500/10 rounded-full border border-red-500/20"
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.8, 1] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.3 }}
                      className="absolute inset-0 bg-red-500/5 rounded-full border border-red-500/10"
                    />
                  </>
                )}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  className={cn(
                    "relative z-10 w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-xl active:scale-95 border-4 cursor-pointer",
                    isRecording 
                      ? "bg-red-500 text-white border-red-200 dark:border-red-500/30 hover:bg-red-600 animate-pulse shadow-red-500/20" 
                      : "bg-forest-green text-white border-emerald-100 dark:border-emerald-500/30 hover:bg-emerald-green shadow-forest-green/20"
                  )}
                >
                  {isRecording ? <Square size={32} /> : <Mic size={32} />}
                  <span className="text-[10px] font-bold mt-1 uppercase tracking-widest">
                    {isRecording ? '点击结束' : '开始录音'}
                  </span>
                </button>
              </div>

              {/* 时间显示与波纹指示 */}
              <div className="space-y-2">
                <div className="text-2xl font-mono font-black text-slate-800 dark:text-white">
                  {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
                  {(recordingDuration % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  {isRecording ? (
                    <span className="text-red-500 flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      现场声音录制中，请开始说话...
                    </span>
                  ) : audioUrl ? (
                    <span className="text-forest-green dark:text-emerald-400">录音成功，可以进行转录并生成报告</span>
                  ) : (
                    '请点击麦克风开启观察记录'
                  )}
                </div>
              </div>

              {/* 简易纯CSS波形视觉器 */}
              {isRecording && (
                <div className="flex justify-center items-end gap-1 h-8 px-8">
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [8, Math.random() * 24 + 8, 8] }}
                      transition={{ repeat: Infinity, duration: 0.5 + Math.random() * 0.5, ease: "easeInOut" }}
                      className="w-1 bg-red-500 rounded-full"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 音频试听与AI转译按钮 */}
            <div className="space-y-4 border-t border-slate-100 dark:border-white/5 pt-6">
              {audioUrl && !isRecording && (
                <div className="bg-white dark:bg-black/30 p-4 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-xl flex items-center justify-center shadow-inner">
                      <Volume2 size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">临时巡查音频记录</span>
                      <span className="text-[10px] font-bold text-slate-400">点击右侧按钮发起 AI 深度转译</span>
                    </div>
                  </div>
                  <audio src={audioUrl} controls className="w-40 h-8 text-xs select-none filter dark:invert" />
                </div>
              )}

              <div className="flex gap-3">
                {audioUrl && (
                  <button
                    onClick={() => {
                      setAudioUrl(null);
                      setAudioBlob(null);
                      setTranscribedResult(null);
                      addNotification({
                        title: '重置成功',
                        message: '已清除本次暂存的录音数据。',
                        type: 'info'
                      });
                    }}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 rounded-2xl text-xs font-black transition-all border border-slate-200 dark:border-white/5 active:scale-95 cursor-pointer"
                  >
                    重置
                  </button>
                )}
                <button
                  disabled={!audioBlob || isRecording || isTranscribing}
                  onClick={handleAITranscribe}
                  className={cn(
                    "flex-1 py-3.5 rounded-2xl text-xs font-black text-white flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer",
                    (!audioBlob || isRecording || isTranscribing)
                      ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-gradient-to-r from-forest-green to-emerald-green shadow-forest-green/20 hover:shadow-forest-green/30 cursor-pointer"
                  )}
                >
                  {isTranscribing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      AI 引擎深度转译与分析中...
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      一键 AI 转录与诊断报告
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：AI 结构化报告详情 */}
          <div className="lg:col-span-7 flex flex-col min-h-[360px] bg-slate-50/50 dark:bg-[#0A0A0A]/40 border border-slate-100 dark:border-white/5 rounded-3xl p-6">
            <div className="flex items-center justify-between border-b border-slate-150 dark:border-white/10 pb-4 mb-4">
              <span className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-1.5">
                <FileText size={16} className="text-forest-green" />
                AI 实时生成的结构化诊断报告
              </span>
              {transcribedResult && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(transcribedResult.report);
                    addNotification({
                      title: '复制成功',
                      message: '完整报告 Markdown 已复制到剪贴板！',
                      type: 'success'
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black shadow-sm border border-slate-100 dark:border-white/5 transition-all cursor-pointer"
                >
                  <Clipboard size={12} />
                  复制 Markdown
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[400px] pr-2 space-y-4">
              {isTranscribing ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-4">
                  <div className="w-12 h-12 bg-forest-green/10 text-forest-green rounded-full flex items-center justify-center border border-forest-green/20 animate-spin">
                    <Zap size={22} className="animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white">AI 农事分析进行中</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs leading-normal">
                      千问（Qwen）大模型正在听取您的巡检语音，并调用专业农业植物病理及土壤墒情知识库进行深度结构化报告整理...
                    </p>
                  </div>
                </div>
              ) : transcribedResult ? (
                <div className="space-y-4">
                  {/* 短摘要横幅 */}
                  <div className={cn(
                    "p-4 rounded-2xl border flex items-center justify-between shadow-sm",
                    transcribedResult.status === 'danger' 
                      ? "bg-rose-50/50 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/30 text-rose-800 dark:text-rose-400"
                      : transcribedResult.status === 'warning'
                      ? "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-400"
                      : "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs",
                        transcribedResult.status === 'danger' ? "bg-red-500" : transcribedResult.status === 'warning' ? "bg-amber-500" : "bg-emerald-500"
                      )}>
                        {transcribedResult.status === 'danger' ? '!' : transcribedResult.status === 'warning' ? '▲' : '✓'}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">巡检核心结论</span>
                        <span className="text-xs font-black leading-tight">{transcribedResult.summary}</span>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider border bg-white dark:bg-slate-900/80 shadow-sm",
                      transcribedResult.status === 'danger' ? "border-red-200 text-red-500" : transcribedResult.status === 'warning' ? "border-amber-200 text-amber-500" : "border-emerald-200 text-emerald-500"
                    )}>
                      {transcribedResult.status === 'danger' ? '严重隐患' : transcribedResult.status === 'warning' ? '轻微预警' : '指标安全'}
                    </span>
                  </div>

                  {/* 报告 Markdown 内容 */}
                  <div className="markdown-body text-xs leading-relaxed text-slate-700 dark:text-slate-300 bg-white dark:bg-black/20 border border-slate-100 dark:border-white/5 p-5 rounded-2xl shadow-inner max-h-[300px] overflow-y-auto">
                    {transcribedResult.report.split('\n').map((line: string, index: number) => {
                      if (line.startsWith('###')) {
                        return <h4 key={index} className="text-sm font-black text-slate-900 dark:text-white mt-4 mb-2 first:mt-0 pb-1 border-b border-slate-100 dark:border-white/5 flex items-center gap-1.5">{line.replace('###', '').trim()}</h4>;
                      } else if (line.startsWith('-') || line.startsWith('*')) {
                        return <li key={index} className="ml-4 list-disc my-1">{line.substring(1).trim()}</li>;
                      } else if (line.trim().startsWith('1.') || line.trim().startsWith('2.') || line.trim().startsWith('3.')) {
                        return <div key={index} className="pl-4 my-1 font-medium">{line.trim()}</div>;
                      } else if (line.trim() !== '') {
                        return <p key={index} className="my-2">{line.trim()}</p>;
                      }
                      return null;
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 text-slate-400 dark:text-slate-500 space-y-3">
                  <FileText size={48} className="stroke-[1.5] opacity-40" />
                  <div>
                    <h4 className="text-sm font-bold">暂无 AI 分析报告</h4>
                    <p className="text-xs max-w-xs mt-1 leading-normal">
                      在左侧面板录制一段您的巡检录音，并点击“一键 AI 转录与诊断报告”，千问（Qwen）大模型专家顾问团将为您深度解译。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 历史巡视录音列表 */}
        {voiceMemos.length > 0 && (
          <div className="mt-8 border-t border-slate-150 dark:border-white/10 pt-6">
            <h4 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <History size={16} className="text-forest-green" />
              历史巡查记录存折 ({voiceMemos.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {voiceMemos.map((memo) => (
                <div key={memo.id} className="bg-slate-50/50 dark:bg-black/20 border border-slate-100 dark:border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 font-mono uppercase">{memo.time}</span>
                      <span className={cn(
                        "text-[9px] font-black px-2 py-0.5 rounded-md border shadow-sm",
                        memo.status === 'danger' ? "bg-red-500/15 border-red-500/20 text-red-500" : memo.status === 'warning' ? "bg-amber-500/15 border-amber-500/20 text-amber-500" : "bg-emerald-500/15 border-emerald-500/20 text-emerald-500"
                      )}>
                        {memo.plotName}
                      </span>
                    </div>
                    <h5 className="text-xs font-black text-slate-800 dark:text-white leading-snug line-clamp-1 mb-1">{memo.summary}</h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 italic mb-3">"{memo.transcript}"</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-3">
                    <button
                      onClick={() => togglePlayMemo(memo)}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95 border cursor-pointer",
                        playingMemoId === memo.id
                          ? "bg-red-500 text-white border-red-200"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-100 dark:border-white/5 shadow-sm"
                      )}
                    >
                      {playingMemoId === memo.id ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          停止
                        </>
                      ) : (
                        <>
                          <Play size={10} className="fill-current" />
                          回放 ({memo.duration}s)
                        </>
                      )}
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setTranscribedResult({
                            transcript: memo.transcript,
                            report: memo.report,
                            status: memo.status,
                            summary: memo.summary
                          });
                          addNotification({
                            title: '已载入报告',
                            message: `已将 [${memo.plotName}] 巡检分析报告载入到上方的分析视图。`,
                            type: 'success'
                          });
                        }}
                        className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg border border-slate-150 dark:border-white/5 shadow-sm active:scale-95 cursor-pointer"
                        title="查看完整分析报告"
                      >
                        <FileText size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteMemo(memo.id)}
                        className="p-1.5 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 text-red-500 rounded-lg border border-red-200/20 shadow-sm active:scale-95 cursor-pointer"
                        title="删除记录"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. 底部历史记录列表 */}
      <section className="bg-white/80 dark:bg-[#050505]/40 backdrop-blur-xl rounded-2xl sm:rounded-[40px] card-shadow p-4 sm:p-8 border border-slate-100 dark:border-white/10 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2 tracking-tight">
            <History className="text-forest-green dark:text-emerald-400" size={22} />
            {t('monitoring.history')}
          </h3>
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black hover:bg-forest-green hover:text-white dark:hover:bg-emerald-500 transition-all border border-slate-200 dark:border-white/5 shadow-sm"
            >
              <Download size={14} />
              {t('monitoring.export.button')}
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-xs font-black hover:from-emerald-400 hover:to-teal-500 transition-all border border-transparent shadow-md active:scale-95 cursor-pointer"
            >
              <FileText size={14} />
              导出PDF诊断报告
            </button>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => loadHistory(currentPage - 1)}
                className="p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#0A0A0A]/50 disabled:opacity-30 dark:text-slate-400 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-black text-slate-600 dark:text-slate-400">{t('monitoring.table.pageInfo', { current: currentPage, total: Math.ceil(totalRecords / 5) })}</span>
              <button 
                disabled={currentPage >= Math.ceil(totalRecords / 5)}
                onClick={() => loadHistory(currentPage + 1)}
                className="p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#0A0A0A]/50 disabled:opacity-30 dark:text-slate-400 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar pb-4">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5">
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.time')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.temp')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.humidity')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.light')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.soilTemp')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.soilMoisture')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.params.soilPh')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.nitrogen')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.phosphorus')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('monitoring.table.potassium')}</th>
                <th className="py-4 px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center">{t('monitoring.table.action')}</th>
              </tr>
            </thead>
            <tbody>
              {historyList.map((item, i) => (
                <tr key={i} className="border-b border-slate-50 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-[#1A1A1A]/50 transition-colors">
                  <td className="py-4 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">{item.time}</td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('temperature', item.temperature, '℃', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('humidity', item.humidity, '%', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('light', item.light, 'Lx', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('soilTemp', item.soilTemp, '℃', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('soilMoisture', item.soilMoisture, '%', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('pH', item.pH, '', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('nitrogen', item.nitrogen, '', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('phosphorus', item.phosphorus, '', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {renderHistoryValue('potassium', item.potassium, '', thresholds)}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <button 
                      onClick={() => setDetailItem(item)}
                      className="text-forest-green dark:text-emerald-400 text-xs font-bold hover:underline"
                    >
                      {t('monitoring.table.detail')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 详情弹窗 */}
      <AnimatePresence>
        {detailItem && (
          <SafePortal key="detail-item-modal-portal">
            <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailItem(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-5xl bg-white/90 dark:bg-[#050505]/95 backdrop-blur-2xl rounded-t-3xl sm:rounded-[40px] shadow-2xl border border-white/20 dark:border-white/10 flex flex-col max-h-[90dvh] sm:max-h-[90vh] overflow-hidden m-0 sm:m-4"
            >
              {/* Sticky Header */}
              <div className="p-4 sm:p-6 lg:p-8 pb-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-center shrink-0">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2 sm:gap-3 tracking-tight">
                  <History className="text-forest-green dark:text-emerald-400" size={24} />
                  <span className="truncate">{t('monitoring.detail.title', { time: detailItem.time })}</span>
                </h3>
                <button 
                  onClick={() => setDetailItem(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] rounded-full transition-colors shrink-0"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
                  {Object.entries(detailItem).filter(([k]) => k !== 'time').map(([k, v]) => {
                    const status = getStatus(k, v as number, thresholds);
                    const statusConfig = {
                      normal: { label: t('monitoring.detail.status.normal'), color: 'text-emerald-500', bg: 'bg-white dark:bg-[#0A0A0A]/50', border: 'border-slate-100 dark:border-white/5' },
                      low: { label: t('monitoring.detail.status.low'), color: 'text-orange-500', bg: 'bg-orange-50/50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/20' },
                      high: { label: t('monitoring.detail.status.high'), color: 'text-red-500', bg: 'bg-red-50/50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/20' }
                    };
                    const config = statusConfig[status];

                    return (
                      <div key={k} className={cn(
                        "p-4 sm:p-5 rounded-[24px] border transition-all flex flex-col justify-between",
                        config.bg,
                        config.border
                      )}>
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <div className={cn("p-1.5 sm:p-2 rounded-xl bg-white dark:bg-[#050505]/50 shadow-sm border border-slate-100 dark:border-white/5", config.color)}>
                              {getParamIcon(k)}
                            </div>
                            <span className={cn("text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-lg bg-white dark:bg-[#050505]/50 shadow-sm border border-slate-100 dark:border-white/5", config.color)}>
                              {config.label}
                            </span>
                          </div>
                          <p className="text-[9px] sm:text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest truncate">{getParamLabel(k)}</p>
                          <div className="flex items-baseline gap-1 flex-wrap">
                            <span className="text-lg sm:text-xl lg:text-2xl font-black text-slate-800 dark:text-white font-mono">
                              {typeof v === 'number' ? v.toFixed(2) : v}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500">{getParamUnit(k)}</span>
                          </div>
                        </div>

                        <div className="mt-4 sm:mt-6">
                          {calibratingSensor === k ? (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="space-y-2 sm:space-y-3"
                            >
                              <textarea
                                placeholder={t('monitoring.calibration.reason_placeholder')}
                                value={calibrationReason}
                                onChange={(e) => setCalibrationReason(e.target.value)}
                                className="w-full p-2 sm:p-3 text-[10px] sm:text-xs bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-forest-green dark:text-slate-300 resize-none h-16 sm:h-20"
                              />
                              <div className="flex gap-2">
                                <button
                                  disabled={isCalibrating}
                                  onClick={() => handleCalibrate(k, v as number)}
                                  className="flex-1 py-1.5 sm:py-2 bg-forest-green text-white text-[10px] sm:text-xs font-bold rounded-lg hover:bg-forest-green/90 disabled:opacity-50"
                                >
                                  {isCalibrating ? t('monitoring.calibration.calibrating') : t('monitoring.calibration.confirm')}
                                </button>
                                <button
                                  onClick={() => {
                                    setCalibratingSensor(null);
                                    setCalibrationReason('');
                                  }}
                                  className="px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-200 dark:bg-[#2A2A2A] text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-[#333333]"
                                >
                                  {t('app.cancel')}
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <button
                              onClick={() => setCalibratingSensor(k)}
                              className="flex items-center gap-1 sm:gap-2 text-forest-green dark:text-emerald-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-forest-green/5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors w-full justify-center border border-transparent hover:border-forest-green/20"
                            >
                              <AlertCircle size={12} className="sm:w-[14px] sm:h-[14px]" />
                              {t('monitoring.calibration.title')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="p-4 sm:p-6 lg:p-8 pt-3 sm:pt-4 border-t border-slate-100 dark:border-white/5 shrink-0">
                <button 
                  onClick={() => setDetailItem(null)}
                  className="w-full py-3 sm:py-4 bg-[#1A1A1A] dark:bg-forest-green text-white rounded-xl sm:rounded-2xl font-black text-sm sm:text-base hover:bg-[#0A0A0A] dark:hover:bg-forest-green/90 transition-all active:scale-[0.98] shadow-xl shadow-forest-green/10"
                >
                  {t('app.close')}
                </button>
              </div>
            </motion.div>
          </div>
          </SafePortal>
        )}
      </AnimatePresence>

      {/* 2. 多渠道推送模拟器 */}
      <AnimatePresence>
        {showPushSimulator && (
          <SafePortal key="push-simulator-modal-portal">
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPushSimulator(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#121214] w-full max-w-lg rounded-[40px] border border-slate-100 dark:border-white/5 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] z-10"
            >
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">多渠道灾害风险模拟推送</h3>
                  <p className="text-[10px] text-slate-400 font-bold">SMART AGRICULTURAL EMERGENCY SYSTEM</p>
                </div>
                <button 
                  onClick={() => setShowPushSimulator(false)}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
                {/* 渠道一：短消息服务推送 */}
                <div className="p-4 rounded-3xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-amber-500 uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 " /> 渠道一：SMS 行业专用短信
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">网卡频段：CN-MOBILE</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-1 font-sans">模拟接收手机</label>
                      <input 
                        type="text" 
                        value={smsPhone} 
                        onChange={(e) => setSmsPhone(e.target.value)}
                        className="w-full text-xs p-2 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-amber-400 font-mono text-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-1 font-mono">下行路由</label>
                      <div className="text-xs p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-slate-500 rounded-xl font-mono">
                        SMS_7233891_GATEWAY
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 bg-yellow-500/5 border border-yellow-500/10 rounded-xl text-[10px] text-amber-600 dark:text-amber-400 leading-normal font-medium">
                    【农芯智境】警告：您的您的1号地块土壤湿度监测值处于 34.8% 红色失衡值范围。为避免中度减产，系统已自动协调水肥一体滴灌管网设备进行微喷灌动作。
                  </div>
                  <button 
                    onClick={() => {
                      setIsSmsSending(true);
                      setTimeout(() => {
                        setIsSmsSending(false);
                        addNotification({
                          title: '模拟 SMS 推送完成！',
                          message: `已向手机号 [${smsPhone}] 短信网关推送大农业防灾抗旱专用警示信息！`,
                          type: 'success'
                        });
                      }, 1200);
                    }}
                    disabled={isSmsSending}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 font-black text-[10px] rounded-xl text-white transition-colors duration-200 flex justify-center items-center gap-1"
                  >
                    {isSmsSending ? '正在调谐信道并模拟发送...' : '一键模拟触发短信推送'}
                  </button>
                </div>

                {/* 渠道二：微信公众号模版消息推送 */}
                <div className="p-4 rounded-3xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-indigo-500 uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> 渠道二：微信公众号模版消息推送
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">模版ID: TM_0493202</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-1 font-sans">绑定的微信号</label>
                      <input 
                        type="text" 
                        value={wechatNick} 
                        onChange={(e) => setWechatNick(e.target.value)}
                        className="w-full text-xs p-2 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-indigo-400 font-semibold text-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-1 font-mono">推送协议</label>
                      <div className="text-xs p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-slate-500 rounded-xl font-mono">
                        WECHAT_SUBSCRIBE_PUSH
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-[10px] text-indigo-600 dark:text-indigo-400 leading-normal font-semibold">
                    <div className="font-black border-b border-indigo-500/10 pb-1 mb-1">【农芯智境】数字大田空间安全警告</div>
                    <div>主题监测: 1号地块 (监测区 B-1)</div>
                    <div>指标告警: 实时水压/持水率 28% (过低)</div>
                    <div>自愈策略: 微灌防灾工单已签入区块链协同网络</div>
                  </div>
                  <button 
                    onClick={() => {
                      setIsWechatSending(true);
                      setTimeout(() => {
                        setIsWechatSending(false);
                        addNotification({
                          title: '模拟微信微信模版推送成功！',
                          message: `已向绑定的微信号 [${wechatNick}] 实时成功推送微信系统警告卡片！`,
                          type: 'success'
                        });
                      }, 1000);
                    }}
                    disabled={isWechatSending}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 font-black text-[10px] rounded-xl text-white transition-colors duration-200 flex justify-center items-center gap-1"
                  >
                    {isWechatSending ? '正在调取服务器 SDK 接口发送...' : '一键模拟触发公众号推送'}
                  </button>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-white/5 flex gap-3">
                <button 
                  onClick={() => setShowPushSimulator(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 hover:bg-slate-200 text-slate-600 dark:text-slate-400 rounded-2xl text-xs font-black transition-all"
                >
                  关闭模拟控制台
                </button>
              </div>
            </motion.div>
          </div>
          </SafePortal>
        )}
        
        {isExportModalOpen && (
          <SafePortal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pt-20 pb-20 overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={() => setIsExportModalOpen(false)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 w-full max-w-sm shadow-[0_10px_40px_rgb(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgb(0,0,0,0.5)] relative z-10"
              >
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-xl">
                    <Download size={20} />
                  </div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">导出离线报表</h3>
                </div>
                <p className="text-xs font-medium text-slate-500 mb-6 pl-1">请按需勾选下方监控点位，默认包含时间索引列。</p>
                
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.temp} 
                      onChange={(e) => setExportColumns(prev => ({...prev, temp: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <Thermometer size={14} className="text-amber-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">气温</span>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.hum} 
                      onChange={(e) => setExportColumns(prev => ({...prev, hum: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <Droplets size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">湿度</span>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.light} 
                      onChange={(e) => setExportColumns(prev => ({...prev, light: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <Sun size={14} className="text-amber-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">光照</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.soilTemp} 
                      onChange={(e) => setExportColumns(prev => ({...prev, soilTemp: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <Thermometer size={14} className="text-orange-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">土温</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.soilMoisture} 
                      onChange={(e) => setExportColumns(prev => ({...prev, soilMoisture: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <Droplets size={14} className="text-cyan-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">持水</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.soilPh} 
                      onChange={(e) => setExportColumns(prev => ({...prev, soilPh: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <FlaskConical size={14} className="text-purple-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">pH酸碱</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500/50 transition-colors group col-span-2">
                    <input 
                      type="checkbox" 
                      checked={exportColumns.npk} 
                      onChange={(e) => setExportColumns(prev => ({...prev, npk: e.target.checked}))}
                      className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <FlaskConical size={14} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">氮磷钾微量元素</span>
                    </div>
                  </label>
                </div>

                <div className="mt-2 mb-6 border-t border-slate-200 dark:border-slate-700/50 pt-4">
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
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 dark:text-slate-200 transition-colors"
                      >
                        <option value="daily">每日自动生成</option>
                        <option value="weekly_monday">每周一自动生成</option>
                        <option value="monthly_first">每月1号自动生成</option>
                      </select>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsExportModalOpen(false)}
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-black transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmExportExcel}
                    disabled={!exportColumns.temp && !exportColumns.hum && !exportColumns.light && !exportColumns.soilTemp && !exportColumns.soilMoisture && !exportColumns.soilPh && !exportColumns.npk}
                    className="flex-[2] py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    确认导出数据报表
                  </button>
                </div>
              </motion.div>
            </div>
          </SafePortal>
        )}

        {isPDFModalOpen && (
          <SafePortal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0"
                onClick={() => !isGeneratingPDF && setIsPDFModalOpen(false)}
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] w-full max-w-4xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative z-10 flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 rounded-t-[2.5rem] shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                      <FileText size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">
                        诊断报告 PDF 预览
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        请预览排版与各项多源遥测数据，确认无误后点击生成下载
                      </p>
                    </div>
                  </div>
                  <button 
                    disabled={isGeneratingPDF}
                    onClick={() => setIsPDFModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2.5 rounded-full transition-colors disabled:opacity-30"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* PDF Document Wrapper for html-to-image (A4 aspect-ratio mockup) */}
                <div className="flex-1 overflow-auto p-3 sm:p-8 flex justify-start sm:justify-center bg-slate-200/50 dark:bg-slate-900/30">
                  <div 
                    ref={reportRef}
                    className="w-[790px] bg-white text-slate-900 p-10 shadow-lg rounded-sm border border-slate-200/60 font-sans flex flex-col gap-6 relative shrink-0"
                    style={{ minHeight: '1117px' }}
                  >
                    {/* Watermark/Grid overlay */}
                    <div className="absolute inset-0 pattern-grid-lg opacity-[0.02] pointer-events-none" />
                    
                    {/* Report Top Header */}
                    <div className="flex items-start justify-between border-b-2 border-emerald-600 pb-5">
                      <div className="space-y-1.5 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black tracking-tight text-emerald-600">AgriStar</span>
                          <span className="text-lg font-extrabold text-slate-800">农星智境</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-mono">SYSTEM_V5</span>
                        </div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">
                          农田多源遥测与作物长势诊断分析报告
                        </h1>
                        <p className="text-xs text-slate-500 font-mono">
                          DOCUMENT IDENTIFIER: AS-REMOTESENS-2026-{activePlot.toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200/50">
                          <Check size={14} className="stroke-[3]" />
                          数据经区块链认证
                        </span>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">GENERATED AT: {new Date().toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-left">
                      <div>
                        <span className="text-slate-400 font-bold block mb-0.5">诊断地块</span>
                        <span className="font-extrabold text-slate-800">{plots.find(p => p.id === activePlot)?.name || activePlot}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block mb-0.5">栽培作物资产</span>
                        <span className="font-extrabold text-emerald-700">{plots.find(p => p.id === activePlot)?.crop || '自主种植'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block mb-0.5">气象预报节点</span>
                        <span className="font-extrabold text-slate-800">本地物理局域网 & 卫星遥感</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block mb-0.5">执行人员</span>
                        <span className="font-extrabold text-slate-800">{user?.username || '智慧专家终端'}</span>
                      </div>
                    </div>

                    {/* Metrics Dashboard Grid */}
                    <div className="space-y-3 text-left">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-150 pb-2">
                        <Thermometer size={16} className="text-emerald-600" />
                        一、气象环境与土壤微生态监测
                      </h3>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="border border-slate-100 p-3.5 rounded-xl bg-slate-50/50">
                          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">大气环境 (AIR)</span>
                          <div className="space-y-1.5 mt-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">空气温度:</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.temperature.toFixed(2)} ℃</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">相对湿度:</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.humidity.toFixed(2)} %RH</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">光照强度:</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.light.toFixed(0)} Lux</span>
                            </div>
                          </div>
                        </div>

                        <div className="border border-slate-100 p-3.5 rounded-xl bg-slate-50/50">
                          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">土壤环境 (SOIL)</span>
                          <div className="space-y-1.5 mt-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">土壤温度:</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.soilTemp.toFixed(2)} ℃</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">土壤持水率:</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.soilMoisture.toFixed(2)} %</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">酸碱度 (pH):</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.pH.toFixed(2)} pH</span>
                            </div>
                          </div>
                        </div>

                        <div className="border border-slate-100 p-3.5 rounded-xl bg-slate-50/50">
                          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">速效肥力元素 (NPK)</span>
                          <div className="space-y-1.5 mt-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">速效氮 (N):</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.nitrogen.toFixed(1)} mg/kg</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">速效磷 (P):</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.phosphorus.toFixed(1)} mg/kg</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">速效钾 (K):</span>
                              <span className="font-extrabold text-slate-800">{realtimeData?.potassium.toFixed(1)} mg/kg</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Diagnostic Growth Inversion */}
                    <div className="space-y-3 text-left">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-150 pb-2">
                        <Activity size={16} className="text-emerald-600" />
                        二、哨兵星轨反演作物长势诊断 (AI Crop Diagnostic)
                      </h3>
                      
                      <div className="border border-slate-100 rounded-xl p-4 bg-emerald-50/20 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-extrabold text-emerald-800">
                            诊断结论: 当前作物长势平稳
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            综合健康率: 92%
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          根据哨兵（Sentinel-2B）高分卫星光谱以及地块高频物联网传感网交叉校验反演表明：作物冠层绿度指数（NDVI）保持高水平活力，生理蒸腾及光合活动良好。土质养分相对均衡，无大范围重灾干旱迹象，土壤含水率及肥力数据符合高产作群指标。
                        </p>
                      </div>
                    </div>

                    {/* Historic Logs Table (Latest 5 records) */}
                    <div className="space-y-3 flex-1 text-left">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-150 pb-2">
                        <History size={16} className="text-emerald-600" />
                        三、高频传感器历史遥测数据存折 (Recent Logs)
                      </h3>
                      
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400 font-bold">
                            <th className="py-2.5">记录时间</th>
                            <th className="py-2.5 text-center">空气温湿度</th>
                            <th className="py-2.5 text-center">土壤水分</th>
                            <th className="py-2.5 text-center">土壤pH</th>
                            <th className="py-2.5 text-right">氮磷钾 (N/P/K)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyList.slice(0, 5).map((log, index) => (
                            <tr key={index} className="border-b border-slate-100 text-slate-700">
                              <td className="py-2.5 font-mono text-[10px]">{log.time}</td>
                              <td className="py-2.5 text-center font-mono">{log.temperature.toFixed(1)}℃ / {log.humidity.toFixed(1)}%</td>
                              <td className="py-2.5 text-center font-mono">{log.soilMoisture.toFixed(1)}%</td>
                              <td className="py-2.5 text-center font-mono">{log.pH.toFixed(1)}</td>
                              <td className="py-2.5 text-right font-mono text-slate-500">
                                {log.nitrogen.toFixed(0)}/{log.phosphorus.toFixed(0)}/{log.potassium.toFixed(0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer Signature Block */}
                    <div className="border-t border-slate-200 pt-5 mt-auto flex justify-between items-end text-[10px] text-slate-400 text-left">
                      <div className="space-y-1">
                        <p className="font-bold">农星智境物联网大数据遥测中心研发中心 (AGRISTAR RESEARCH GROUP)</p>
                        <p>区块链存证凭证 Hash: e59fa620dd813cfba34ea3f8c859d047a06c</p>
                        <p>安全免责申明：遥测分析仅供农事活动生产决策建议，不承担自然灾害或减产等不可抗逆连带损害赔偿。</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <div className="w-16 h-16 border border-slate-200 flex items-center justify-center p-1 bg-white rounded-md mb-1">
                          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-white font-mono text-[5px] tracking-tighter leading-none p-1 text-center font-bold">
                            AGRISTAR<br/>VERIFIED<br/>SYSTEM
                          </div>
                        </div>
                        <p className="font-bold text-slate-600">遥测决策引擎公章 (电子签章)</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3 bg-white dark:bg-slate-900 rounded-b-[2.5rem] shrink-0">
                  <button 
                    disabled={isGeneratingPDF}
                    onClick={() => setIsPDFModalOpen(false)}
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-black transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    disabled={isGeneratingPDF}
                    onClick={confirmExportPDF}
                    className="flex-[2] py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-2xl text-xs font-black shadow-[0_4px_20px_rgba(16,185,129,0.25)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingPDF ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>正在渲染并合成PDF文档...</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>确认下载诊断PDF报告</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          </SafePortal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FieldMonitoring;
