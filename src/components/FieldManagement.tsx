import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEntitlements } from '../hooks/usePlanGate';
import { getPlotLimit } from '../data/pricing';
import { 
  Plus, 
  BrainCircuit, 
  TrendingUp, 
  Zap, 
  Droplets, 
  Wind, 
  Flame, 
  CheckCircle2,
  Check,
  Loader2,
  Info,
  DollarSign,
  LayoutDashboard,
  Scale,
  Sun,
  CloudRain,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Target,
  BarChart3,
  ShieldCheck,
  Search,
  FlaskConical,
  Calendar,
  X,
  Globe,
  Link2,
  QrCode,
  ExternalLink,
  ClipboardList,
  Sparkles,
  Cpu,
  Download,
  Database,
  Activity,
  ArrowUpRight,
  PieChart,
  TrendingDown,
  Map as MapIcon
} from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import DataService, { AICropAnalysis, RealtimeData } from '../services/dataService';
import { useAIRequest } from '../hooks/useAIRequest';
import { useNotifications } from '../context/NotificationContext';
import DigitalTwin from './DigitalTwin';
import { EmptyState } from './ui/EmptyState';
import { CropGrowthTimeline } from './CropGrowthTimeline';

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

/**
 * @component FieldManagement
 * @description 农田管理模块。
 * 包含：地块统计、AI决策支持（智谱API预留）、经济效益分析、自动化硬件控制。
 */
const FieldManagement: React.FC<{ user: any, onNavigate: (tab: string) => void, digitalTwinReadOnly: boolean, onUpgradeDigitalTwin: () => void }> = ({ user, onNavigate, digitalTwinReadOnly, onUpgradeDigitalTwin }) => {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const { ent } = useEntitlements(user);
  const [plots, setPlots] = useState<any[]>([]);
  const [activePlot, setActivePlot] = useState('');
  const {
    request: analyzeRequest,
    isLoading: isAnalyzing,
    error: analysisError,
    data: aiResult,
    stepText: analysisStepText,
    progress: analysisProgress
  } = useAIRequest(DataService.analyzeCropSuitability);
  const [realtimeData, setRealtimeData] = useState<RealtimeData | null>(null);
  const [hardwareStatus, setHardwareStatus] = useState<Record<string, boolean>>({
    irrigation: false,
    ventilation: false,
    heating: false,
    lighting: false,
    fertilization: false
  });
  const [hardwareParams, setHardwareParams] = useState<any>({});
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsType, setSettingsType] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [targetCrop, setTargetCrop] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | '3d'>('list');
  const [showConnectTutorial, setShowConnectTutorial] = useState(false);
  const [newPlot, setNewPlot] = useState({ 
    name: '', 
    area: '', 
    crop: '', 
    plantingDate: new Date().toISOString().split('T')[0],
    expectedHarvestDate: '',
    nextTillageDate: new Date().toISOString().split('T')[0] 
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const [workOrders, setWorkOrders] = useState([
    { id: 1, title: '全地块喷施磷酸二氢钾', assignee: '张建国 (社员)', time: '今日 14:00 前', progress: 75, status: '进行中', priority: '中', memo: '请按1:1000比例进行对水二次稀释。' },
    { id: 2, title: '2号地块水阀检修', assignee: '李技师 (工程部)', time: '逾期 2小时', progress: 0, status: '已延误', priority: '紧急', memo: '控制阀反馈无响应，怀疑感应电磁阀线圈烧毁。' },
    { id: 3, title: '玉米大斑病无人机打药', assignee: '无人机自动化编队', time: '明日 06:00', progress: 0, status: '待执行', priority: '一般', memo: '设定3号航线，全自动夜视避障打药。' }
  ]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  // ROI 精准核算计算书动态参数
  const [roiArea, setRoiArea] = useState<number>(100);
  const [roiSeedCost, setRoiSeedCost] = useState<number>(120);
  const [roiFertCost, setRoiFertCost] = useState<number>(230);
  const [roiLaborCost, setRoiLaborCost] = useState<number>(150);
  const [roiPrice, setRoiPrice] = useState<number>(3.2);
  const [roiYield, setRoiYield] = useState<number>(550);
  const [roiRiskFactor, setRoiRiskFactor] = useState<number>(1);

  // 动态环境风险因子
  const environmentalRiskAdjustment = useMemo(() => {
    if (!realtimeData) return 1;
    let risk = 1;
    // 温度过高或过低都会影响
    if (realtimeData.temperature > 35 || realtimeData.temperature < 5) risk *= 0.75;
    else if (realtimeData.temperature > 30) risk *= 0.9;
    
    // 湿度过高导致病虫害风险
    if (realtimeData.humidity > 85) risk *= 0.85;
    
    return risk;
  }, [realtimeData]);

  // Sync AI suggested parameters to ROI inputs for high realism
  useEffect(() => {
    if (aiResult && aiResult.roiAnalysis) {
      const roi = aiResult.roiAnalysis as any;
      if (roi.suggestedArea !== undefined && roi.suggestedArea !== null) setRoiArea(roi.suggestedArea);
      if (roi.suggestedSeedCost !== undefined && roi.suggestedSeedCost !== null) setRoiSeedCost(roi.suggestedSeedCost);
      if (roi.suggestedFertCost !== undefined && roi.suggestedFertCost !== null) setRoiFertCost(roi.suggestedFertCost);
      if (roi.suggestedLaborCost !== undefined && roi.suggestedLaborCost !== null) setRoiLaborCost(roi.suggestedLaborCost);
      if (roi.suggestedPrice !== undefined && roi.suggestedPrice !== null) setRoiPrice(roi.suggestedPrice);
      if (roi.suggestedYield !== undefined && roi.suggestedYield !== null) setRoiYield(roi.suggestedYield);
    }
  }, [aiResult]);

  // 派发新工单 Modal
  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false);
  const [newWorkOrderTitle, setNewWorkOrderTitle] = useState('');
  const [newWorkOrderAssignee, setNewWorkOrderAssignee] = useState('张建国 (社员)');
  const [newWorkOrderDeadline, setNewWorkOrderDeadline] = useState('今日下班前');
  const [newWorkOrderPriority, setNewWorkOrderPriority] = useState<'紧急' | '中' | '一般'>('中');
  const [newWorkOrderMemo, setNewWorkOrderMemo] = useState('');

  // 追溯码 Modal
  const [showTraceabilityModal, setShowTraceabilityModal] = useState(false);
  const [isGeneratingTraceCode, setIsGeneratingTraceCode] = useState(false);
  const [traceCodeData, setTraceCodeData] = useState<any>(null);

  // 比特币/联盟链 农芯分布式溯源存证网络
  const [blockchainLedger, setBlockchainLedger] = useState([
    { id: 1, action: '采收完成批次 A1 (第一号大田作物)', hash: '0x8f3cbb77ea19b9a1fd56a73c1c8cb5f3b79da91a', time: '2023-11-20 14:00', block: 10492, gas: 21390, data: '产出数量：12.5 吨; 品质等级：特等绿标; 检测项目：全部合格' },
    { id: 2, action: '有机硅生物肥精准施用记录', hash: '0x2a9de121e4c3a3bf294fae92b3bc1c8cb5f3b79d', time: '2023-10-15 09:30', block: 10488, gas: 18562, data: '品牌：国标免检生物有机肥; 亩用量：65 kg/亩; 增效：提高根系持水20%' },
    { id: 3, action: '土壤净化合规验证', hash: '0x4b7f99ee1d8ea3bbf105151ee68001e3b79da91a', time: '2023-08-01 08:00', block: 10451, gas: 21004, data: '检测机构：省土壤研究所; pH测定：6.85稳定; 有机质含量：4.2%' }
  ]);
  const [blockchainInputText, setBlockchainInputText] = useState('');
  const [blockchainInputData, setBlockchainInputData] = useState('');
  const [isCertifying, setIsCertifying] = useState(false);
  const [certificationStep, setCertificationStep] = useState(0); // 0: idle, 1: calculating SHA256 signature, 2: smart contract emitting, 3: confirmed
  const [selectedCertificate, setSelectedCertificate] = useState<any | null>(null);

  const thresholds = useMemo(() => DataService.getThresholds(), []);

  // 检查地块是否处于预警状态
  const getPlotStatus = (plot: any) => {
    if (plot.isSimulated) return 'simulated';
    if (!plot.sensorData) return 'healthy';
    
    const data = plot.sensorData;
    let isWarning = false;
    let isDanger = false;

    for (const [key, value] of Object.entries(data)) {
      const threshold = thresholds[key];
      if (threshold && typeof value === 'number') {
        const range = threshold.max - threshold.min;
        const dangerMargin = range * 0.2; // 超出阈值范围 20% 视为危险
        
        if (value < threshold.min - dangerMargin || value > threshold.max + dangerMargin) {
          isDanger = true;
        } else if (value < threshold.min || value > threshold.max) {
          isWarning = true;
        }
      }
    }
    
    if (isDanger) return 'danger';
    if (isWarning) return 'warning';
    return 'healthy';
  };

  // 加载地块列表
  const loadPlots = async () => {
    const list = await DataService.getPlots(user?.username);
    setPlots(list);
    if (list.length > 0 && (!activePlot || !list.find(p => p.id === activePlot))) {
      setActivePlot(list[0].id);
    }
  };

  // 检查是否可以添加地块（套餐地块上限，演示模式放行）
  const canAddPlot = () => {
    if (user?.platformRole === 'platform_admin') return true;
    const limit = ent?.limits.plots;
    if (typeof limit !== 'number') return false;
    return plots.length < limit;
  };

  // 加载数据
  const loadData = async () => {
    const data = await DataService.getRealtimeData(activePlot);
    setRealtimeData(data);
    
    const params = await DataService.getHardwareParams(activePlot);
    if (params) {
      setHardwareParams(params);
    }
  };

  // 加载AI分析数据
  const runAIAnalysis = async (customCrop?: string) => {
    if (!activePlot) return;
    try {
      await analyzeRequest(activePlot, customCrop);
    } catch (error) {
      console.error("AI Analysis failed:", error);
    }
  };

  const handleExportReport = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "报告生成时间," + new Date().toLocaleString() + "\n\n";
    csvContent += "设备类型,运行状态,最后更新\n";
    csvContent += `智能微喷灌溉,${hardwareStatus.irrigation ? '运行中' : '离线'},${new Date().toLocaleTimeString()}\n`;
    csvContent += `风机与通风系统,${hardwareStatus.ventilation ? '运行中' : '离线'},${new Date().toLocaleTimeString()}\n`;
    csvContent += `核心温控系统,${hardwareStatus.heating ? '运行中' : '离线'},${new Date().toLocaleTimeString()}\n`;
    csvContent += `光谱补光控制,${hardwareStatus.lighting ? '运行中' : '离线'},${new Date().toLocaleTimeString()}\n`;
    
    csvContent += "\n历史报错记录\n";
    csvContent += "时间,类型,描述\n";
    csvContent += "2023-11-20 08:30:00,WARNING,1号地块土壤湿度持续低于阈值\n";
    csvContent += "2023-11-21 14:15:00,ERROR,控制阀反馈无响应，怀疑感应电磁阀线圈烧毁\n";
    csvContent += "2023-11-22 09:00:00,INFO,设备例行巡检完成，状态正常\n";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `设备运行分析报告_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addNotification({ title: '成功', message: '分析报告已生成并开始下载', type: 'success' });
  };

  const handleToggleSelectDevice = (deviceId: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId) 
        : [...prev, deviceId]
    );
  };

  const handleToggleSelectAllDevices = () => {
    const allDeviceIds = ['irrigation', 'ventilation', 'heating', 'lighting'];
    if (selectedDevices.length === allDeviceIds.length) {
      setSelectedDevices([]);
    } else {
      setSelectedDevices(allDeviceIds);
    }
  };

  const handleBatchExportReports = async () => {
    if (selectedDevices.length === 0) {
      addNotification({ title: '提示', message: '请先在设备卡片左侧勾选需要导出的设备', type: 'info' });
      return;
    }

    try {
      addNotification({ title: '导出中', message: '正在打包设备分析报告，请稍候...', type: 'info' });
      const zip = new JSZip();
      
      // 1. 运行总览
      let summaryCsv = "\uFEFF";
      summaryCsv += "设备运行总览报告\n";
      summaryCsv += `报告生成时间,${new Date().toLocaleString()}\n`;
      summaryCsv += `导出地块ID,${activePlot || '未知'}\n\n`;
      summaryCsv += "设备名称,当前运行状态,最后更新时间\n";

      selectedDevices.forEach(id => {
        const name = id === 'irrigation' ? '智能微喷灌溉' :
                     id === 'ventilation' ? '风机与通风系统' :
                     id === 'heating' ? '核心温控系统' :
                     id === 'lighting' ? '光谱补光控制' : '未知设备';
        const statusStr = hardwareStatus[id as keyof typeof hardwareStatus] ? '运行中' : '离线';
        summaryCsv += `${name},${statusStr},${new Date().toLocaleString()}\n`;
      });
      zip.file("设备运行总览.csv", summaryCsv);

      // 2. 逐个设备生成详细报告
      selectedDevices.forEach(id => {
        let deviceCsv = "\uFEFF";
        const name = id === 'irrigation' ? '智能微喷灌溉' :
                     id === 'ventilation' ? '风机与通风系统' :
                     id === 'heating' ? '核心温控系统' :
                     id === 'lighting' ? '光谱补光控制' : '未知设备';
        const statusStr = hardwareStatus[id as keyof typeof hardwareStatus] ? '运行中' : '离线';
        
        deviceCsv += `设备运行健康分析报告 - ${name}\n`;
        deviceCsv += `报告生成时间,${new Date().toLocaleString()}\n`;
        deviceCsv += `运行状态,${statusStr}\n\n`;
        
        deviceCsv += "控制参数配置\n";
        if (id === 'irrigation') {
          deviceCsv += `单次灌溉时长,${hardwareParams.irrigation?.duration || 30} 分钟\n`;
          deviceCsv += `目标土壤湿度,${hardwareParams.irrigation?.targetMoisture || 60} %\n`;
          deviceCsv += "\n历史运行分析与健康度评估\n";
          deviceCsv += "监测指标,评估状态,详情\n";
          deviceCsv += "土壤湿度感应器,正常,已校准且数据反馈平稳\n";
          deviceCsv += "电磁控制阀,正常,动作响应延迟极低\n";
          deviceCsv += "日均喷淋喷灌量,3.2 吨,符合预设喷洒灌溉计划\n";
          deviceCsv += "整体健康评分,98 分,状态极佳\n";
        } else if (id === 'ventilation') {
          deviceCsv += `单次通风时长,${hardwareParams.ventilation?.duration || 15} 分钟\n`;
          deviceCsv += `目标温控阈值,${hardwareParams.ventilation?.targetTemp || 25} ℃\n`;
          deviceCsv += "\n历史运行分析与健康度评估\n";
          deviceCsv += "监测指标,评估状态,详情\n";
          deviceCsv += "风速反馈传感器,正常,低阻耗运行\n";
          deviceCsv += "温度平衡性,正常,温室内部无局部温差\n";
          deviceCsv += "电机寿命预测,良好,剩余可用寿命约 82%\n";
          deviceCsv += "整体健康评分,94 分,状态良好\n";
        } else if (id === 'heating') {
          deviceCsv += `单次加热时长,${hardwareParams.heating?.duration || 60} 分钟\n`;
          deviceCsv += `目标温度设置,${hardwareParams.heating?.targetTemp || 20} ℃\n`;
          deviceCsv += "\n历史运行分析与健康度评估\n";
          deviceCsv += "监测指标,评估状态,详情\n";
          deviceCsv += "高精度温度计校验,精确,无温飘现象\n";
          deviceCsv += "电加热功率平衡,正常,电网波形匹配度高\n";
          deviceCsv += "综合能效比,0.85,高效低损耗\n";
          deviceCsv += "整体健康评分,96 分,状态极佳\n";
        } else if (id === 'lighting') {
          deviceCsv += `单次补光时长,${hardwareParams.lighting?.duration || 120} 分钟\n`;
          deviceCsv += `目标光照强度,${hardwareParams.lighting?.targetLight || 50000} Lux\n`;
          deviceCsv += "\n历史运行分析与健康度评估\n";
          deviceCsv += "监测指标,评估状态,详情\n";
          deviceCsv += "光源发光流明衰减,极低,衰减系数符合出厂标准\n";
          deviceCsv += "光照面平衡性,优良,植物冠层光照全覆盖\n";
          deviceCsv += "叶绿素吸收光谱比,正常,红光/蓝光配比精确 3:1\n";
          deviceCsv += "整体健康评分,95 分,状态优良\n";
        }
        
        zip.file(`${name}_运行健康状态报告.csv`, deviceCsv);
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `设备健康状态分析报告_批量_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      addNotification({ title: '成功', message: `已成功打包并下载 ${selectedDevices.length} 个设备的健康状态报告`, type: 'success' });
    } catch (err) {
      console.error(err);
      addNotification({ title: '错误', message: '打包生成 ZIP 文件失败，请重试', type: 'error' });
    }
  };

  useEffect(() => {
    loadPlots();
    
    // 定期刷新数据以保持与服务器同步 (增加间隔并添加抖动，避免 429 错误)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadPlots();
        if (activePlot) {
          loadData();
        }
      }
    }, 15000 + Math.random() * 5000);
    
    return () => clearInterval(interval);
  }, [activePlot]);

  const analyzedPlotIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activePlot) {
      loadData();
      const currentPlot = plots.find(p => p.id === activePlot);
      
      // Prevent running AI analysis if we already ran it for tracking this specific plot change
      // or if it's pending setup
      if (currentPlot && currentPlot.status !== 'pending_setup' && analyzedPlotIdRef.current !== activePlot) {
        runAIAnalysis();
        analyzedPlotIdRef.current = activePlot;
      }
      
      if (currentPlot?.hardwareState) {
        setHardwareStatus(currentPlot.hardwareState);
      }
    }
    
    // 订阅数据更新
    const unsubscribe = DataService.subscribe(() => {
      if (activePlot) loadData();
    });
    const handleSet3D = () => {
      setViewMode('3d');
    };
    const handleSetList = () => {
      setViewMode('list');
      // optional: smooth scroll to AI section
      setTimeout(() => {
        document.getElementById('ai-roi-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    };
    window.addEventListener('set-view-mode-3d', handleSet3D);
    window.addEventListener('set-view-mode-list', handleSetList);
    return () => {
      unsubscribe();
      window.removeEventListener('set-view-mode-3d', handleSet3D);
      window.removeEventListener('set-view-mode-list', handleSetList);
    };
  }, [activePlot, plots]);

  // 由 3D 孪生「AI 中枢联动」跳转而来：挂载即生效（不依赖事件时序），切到列表并滚动至 AI·ROI 区
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__jumpToAiRoi) {
      (window as any).__jumpToAiRoi = false;
      setViewMode('list');
      setTimeout(() => {
        document.getElementById('ai-roi-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 450);
    }
  }, []);

  // 硬件控制逻辑
  const handleHardwareControl = async (type: 'irrigation' | 'ventilation' | 'heating' | 'lighting') => {
    const action = hardwareStatus[type] ? 'stop' : 'start';
    setActionLoading(type);
    try {
      const result = await DataService.controlHardware(activePlot, type as any, action);
      if (result.success === false) {
        addNotification({
          title: '控制失败',
          message: result.message || '无法连接到设备，请检查网络',
          type: 'error'
        });
        return;
      }
      setHardwareStatus(prev => ({ ...prev, [type]: !prev[type] }));
      addNotification({
        title: '设备控制成功',
        message: `${currentPlot?.name || '设备'} ${type === 'irrigation' ? '灌溉' : type === 'ventilation' ? '通风' : type === 'lighting' ? '补光' : '加热'}设备已${action === 'start' ? '开启' : '关闭'}`,
        type: 'success'
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 自动化施肥逻辑
  const handleFertilization = async () => {
    setActionLoading('fertilization');
    try {
      const result = await DataService.executeFertilization(activePlot);
      if (result.success === false) {
        addNotification({
          title: '控制失败',
          message: result.message || '无法连接到设备，请检查网络',
          type: 'error'
        });
        return;
      }
      setHardwareStatus(prev => ({ ...prev, fertilization: true }));
      addNotification({
        title: '设备控制成功',
        message: `${currentPlot?.name || '设备'} 施肥设备已开启`,
        type: 'success'
      });
      setTimeout(() => setHardwareStatus(prev => ({ ...prev, fertilization: false })), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  // 添加地块逻辑
  const handleOpenConnectModal = () => {
    setShowConnectModal(true);
    const hasSeenTutorial = localStorage.getItem('hasSeenConnectTutorial');
    if (!hasSeenTutorial) {
      setShowConnectTutorial(true);
    }
  };

  const handleCloseConnectTutorial = () => {
    setShowConnectTutorial(false);
    localStorage.setItem('hasSeenConnectTutorial', 'true');
  };

  const getPlanName = (plan: string) => {
    if (plan === '企业版' || plan === 'Enterprise Plan' || plan === 'Enterprise') return t('app.enterprisePlan');
    if (plan === '专业版' || plan === 'Pro Plan' || plan === 'Pro') return t('app.proPlan');
    return t('app.basicPlan');
  };

  const handleAddPlot = async () => {
    if (!canAddPlot()) {
      addNotification({
        title: t('management.modals.limitTitle'),
        message: t('management.modals.limitMessage', { plan: getPlanName(user?.plan || '') }),
        type: 'warning'
      });
      return;
    }
    if (!newPlot.name || !newPlot.area || !newPlot.crop) return;
    const result = await DataService.addPlot({
      name: newPlot.name,
      area: Number(newPlot.area),
      crop: newPlot.crop,
      plantingDate: newPlot.plantingDate,
      expectedHarvestDate: newPlot.expectedHarvestDate || undefined,
      nextTillageDate: newPlot.nextTillageDate || undefined
    }, user?.username);
    setPlots(prev => [...prev, result]);
    setShowAddModal(false);
    setNewPlot({ 
      name: '', 
      area: '', 
      crop: '', 
      plantingDate: new Date().toISOString().split('T')[0],
      expectedHarvestDate: '',
      nextTillageDate: new Date().toISOString().split('T')[0] 
    });
    setActivePlot(result.id);
  };

  // 连接设备逻辑
  const handleConnectDevices = async () => {
    if (selectedDevices.length === 0) return;
    setIsConnecting(true);
    try {
      // 模拟连接过程
      await new Promise(resolve => setTimeout(resolve, 2000));
      await DataService.connectPlotDevices(activePlot, selectedDevices);
      await loadPlots(); // 重新加载地块以获取最新状态
      setShowConnectModal(false);
      setSelectedDevices([]);
      runAIAnalysis(); // Trigger AI analysis now that it's unlocked
    } finally {
      setIsConnecting(false);
    }
  };

  const currentPlot = plots.find(p => p.id === activePlot);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-h-full animate-in fade-in duration-500">

      {viewMode === '3d' ? (
        <div id="management-map" className="flex-1 min-h-[70dvh] lg:min-h-[600px] rounded-2xl lg:rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
          <DigitalTwin 
            plots={plots}
            activePlotId={activePlot}
            onSelectPlot={setActivePlot}
            onControlHardware={handleHardwareControl}
            onFertilize={handleFertilization}
            hardwareStatus={hardwareStatus}
            realtimeData={realtimeData}
            aiResult={aiResult}
            readOnly={digitalTwinReadOnly}
            onUpgrade={onUpgradeDigitalTwin}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Plot Selector Sidebar */}
          <div id="management-fields" className="lg:col-span-4 space-y-4 lg:sticky lg:top-8">
          <div className="flex items-center justify-between mb-2 px-2">
            <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('management.list.title')}</h2>
            <span className="text-[10px] font-black text-forest-green bg-forest-green/10 px-2 py-0.5 rounded-full">
              {t('management.list.count', { count: plots.length })}
            </span>
          </div>
          
          <div id="field-plots-list" className="space-y-3 max-h-[55dvh] lg:max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
            {plots.length === 0 ? (
              <EmptyState 
                icon={<MapIcon size={48} />} 
                title="暂无地块" 
                description="点击下方按钮添加地块以开启数字化管理" 
              />
            ) : plots.map((plot) => {
              const status = getPlotStatus(plot);
              const isWarning = status === 'warning';
              const isDanger = status === 'danger';
              const isActive = activePlot === plot.id;

              return (
                <motion.button
                  key={plot.id}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActivePlot(plot.id)}
                  className={cn(
                    "w-full text-left p-5 rounded-[24px] transition-all relative group overflow-hidden border",
                    isActive
                      ? "bento-card border-forest-green/30 shadow-xl shadow-forest-green/5"
                      : "bg-white/50 dark:bg-[#0A0A0A]/30 border-transparent hover:bg-white/80 dark:hover:bg-[#121214]/50"
                  )}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="active-plot-indicator"
                      className="absolute left-0 top-0 bottom-0 w-1.5 bg-forest-green rounded-r-full"
                    />
                  )}
                  
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110",
                        isActive ? "bg-forest-green text-white" : "bg-slate-100 dark:bg-[#1A1A1A] text-slate-400"
                      )}>
                        <LayoutDashboard size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white">{plot.name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{plot.crop}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-pulse",
                      isDanger ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                      isWarning ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" :
                      "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    )} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{t('management.stats.soilMoisture')}</p>
                      <p className="text-xs font-black text-slate-700 dark:text-slate-300">{plot.sensorData?.soilMoisture?.toFixed(1) || '32.5'}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{t('management.stats.envTemp')}</p>
                      <p className="text-xs font-black text-slate-700 dark:text-slate-300">{plot.sensorData?.temperature?.toFixed(1) || '24.8'}°C</p>
                    </div>
                  </div>

                  {plot.isSimulated && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-500 text-[8px] font-black rounded uppercase tracking-tighter border border-indigo-500/20">
                      {t('management.stats.simulated')}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-full py-4 bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-[#2A2A2A] transition-all border border-dashed border-slate-300 dark:border-white/10"
          >
            <Plus size={18} />
            {t('management.list.addPlot')}
          </button>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-8">
          {/* Simulation Warning Banner */}
          {currentPlot?.isSimulated && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-10 dark:opacity-20" />
              <div className="relative p-8 rounded-[32px] border border-indigo-500/20 flex flex-col md:flex-row items-center justify-between gap-6 bg-white/40 dark:bg-black/20 backdrop-blur-md">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-indigo-600 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/20 animate-pulse">
                    <Zap size={32} />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-slate-800 dark:text-white mb-1">{t('management.modals.simulated_title')}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                      {t('management.modals.simulated_desc')}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleOpenConnectModal}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-3 active:scale-95"
                >
                  <Plus size={20} />
                  {t('management.connectDevice')}
                </button>
              </div>
            </motion.div>
          )}

          {/* Quick Stats Grid */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-4">
            <h2 className="text-xl font-black text-slate-800 dark:text-white">{currentPlot?.name || '数据概览'}</h2>
            <button
              onClick={() => {
                if (!currentPlot) {
                  addNotification({ title: '提醒', message: '请先选择一个地块', type: 'error' });
                  return;
                }
                setIsGeneratingTraceCode(true);
                setShowTraceabilityModal(true);
                setTimeout(() => {
                  setTraceCodeData({
                    id: `TRC-${currentPlot.id}-${Date.now().toString().slice(-6)}`,
                    plotName: currentPlot.name,
                    crop: currentPlot.crop,
                    area: currentPlot.area,
                    plantingDate: currentPlot.plantingDate || '2023-09-01',
                    harvestDate: currentPlot.expectedHarvestDate || '2024-06-15',
                    sensorHistory: realtimeData ? {
                      avgTemp: realtimeData.temperature.toFixed(1),
                      avgMoisture: realtimeData.soilMoisture.toFixed(1),
                      avgLight: realtimeData.light
                    } : null,
                    pests: [
                      { date: '2023-10-12', name: '轻微白粉病', treatment: '已喷施有机杀菌剂' },
                      { date: '2024-03-05', name: '蚜虫预警', treatment: '投放天敌昆虫（异色瓢虫）' }
                    ],
                    certifications: ['绿色食品认证', '有机转换期认证', '区块链存证']
                  });
                  setIsGeneratingTraceCode(false);
                }, 1500);
              }}
              className="min-h-11 w-full sm:w-auto px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20 text-sm"
            >
              <QrCode size={18} />
              生成追溯码
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
              label={t('management.stats.totalArea')} 
              value={plots.reduce((acc, p) => acc + p.area, 0).toString()} 
              unit={t('management.stats.unitArea')} 
              icon={<LayoutDashboard className="text-blue-500" size={20} />} 
              color="blue"
            />
            <StatCard 
              label={t('management.stats.currentArea')} 
              value={currentPlot?.area.toString() || "0"} 
              unit={t('management.stats.unitArea')} 
              icon={<Scale className="text-emerald-500" size={20} />} 
              color="emerald"
            />
            <StatCard 
              label={t('management.stats.activeDevices')} 
              value={Object.values(hardwareStatus).filter(v => v).length.toString()} 
              unit={t('management.stats.unitDevice')} 
              icon={<Zap className="text-amber-500" size={20} />} 
              color="amber"
            />
            <StatCard 
              label={t('management.stats.estimatedRevenue')} 
              value={aiResult ? aiResult.expectedProfit.toLocaleString() : "---"} 
              unit={t('management.stats.unitCurrency')} 
              icon={<TrendingUp className="text-indigo-500" size={20} />} 
              color="indigo"
            />
          </div>

          {/* Crop Growth Timeline Section */}
          <section id="crop-timeline-section">
            <CropGrowthTimeline plot={currentPlot} />
          </section>

        {/* AI Decision Support Section */}
        <section id="ai-roi-section" className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-[40px] blur opacity-20 group-hover:opacity-30 transition duration-1000 group-hover:duration-200" />
          <div className="relative bg-white/80 dark:bg-[#050505]/60 backdrop-blur-2xl rounded-[40px] border border-white/20 dark:border-white/10 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-8 border-b border-slate-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <BrainCircuit size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">AI 智能种植推荐与 ROI 核算中枢</h3>
                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 text-[10px] font-black rounded-lg uppercase tracking-widest border border-indigo-500/20">GLM-4-Flash / 投入产出核算</span>
                  </div>
                  <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">多维数据融合（历史产量/气象预测/市场价格）推荐最佳品种与精准投产比</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={18} />
                  </div>
                  <input 
                    type="text" 
                    value={targetCrop}
                    onChange={(e) => setTargetCrop(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runAIAnalysis(targetCrop)}
                    placeholder={t('management.ai.placeholder')}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-2xl text-sm outline-none focus:border-indigo-500 transition-all dark:text-white"
                  />
                </div>
                <button 
                  onClick={() => runAIAnalysis(targetCrop)}
                  disabled={isAnalyzing}
                  className="px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                  {targetCrop ? t('management.ai.targetAnalyze') : t('management.ai.smartRecommend')}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-8">
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="py-20 flex flex-col items-center justify-center text-center"
                  >
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse" />
                      <div className="relative w-24 h-24 bg-indigo-600 text-white rounded-[32px] flex items-center justify-center shadow-2xl shadow-indigo-500/40 animate-bounce">
                        <BrainCircuit size={48} />
                      </div>
                    </div>
                    <h4 className="text-xl font-black text-slate-800 dark:text-white mb-2">{analysisStepText || t('management.ai.analyzing')}</h4>
                    <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm">
                      {t('management.ai.analyzingDesc')}
                    </p>
                    <div className="mt-8 w-full max-w-xs h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${analysisProgress}%` }}
                        className="h-full bg-indigo-600"
                      />
                    </div>
                  </motion.div>
                ) : aiResult ? (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    {/* Recommendation Card */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      <div className="lg:col-span-7 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-500/20">
                        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                          <Target size={200} />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-6">
                            <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest">{t('management.ai.bestRecommend')}</span>
                            <div className="h-px w-12 bg-white/20" />
                            <span className="text-[10px] font-bold text-white/60 uppercase font-mono">{t('management.ai.plotId')}: {activePlot}</span>
                          </div>
                          
                          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8">
                            <div>
                              <p className="text-indigo-100/60 text-xs font-bold mb-1">{t('management.ai.suggestedCrop')}</p>
                              <h4 className="text-5xl font-black tracking-tight">{aiResult.recommendedCrop}</h4>
                            </div>
                            <div className="flex items-center gap-4 pb-1">
                              <div className="h-12 w-px bg-white/10 hidden md:block" />
                              <div>
                                <p className="text-indigo-100/60 text-[10px] font-bold mb-1 uppercase">{t('management.ai.matchingDegree')}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl font-black font-mono">{aiResult.suitability}%</span>
                                  <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${aiResult.suitability}%` }}
                                      className="h-full bg-emerald-400"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 p-1.5 bg-indigo-500/30 rounded-lg">
                                <Info size={16} className="text-indigo-200" />
                              </div>
                              <p className="text-sm text-indigo-50 font-medium leading-relaxed">
                                {aiResult.reason}
                              </p>
                            </div>
                          </div>

                          {aiResult.roiAnalysis && (
                            <div className="mt-6 p-6 bg-indigo-950/40 backdrop-blur-md rounded-2xl border border-indigo-500/20 relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                <TrendingUp size={80} />
                              </div>
                              <div className="flex justify-between items-center mb-4">
                                <h5 className="text-[11px] font-black tracking-widest text-indigo-300 uppercase flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  精准农事投入产出分析书 (含实时环境风险系数)
                                </h5>
                                <span className="text-[9px] font-mono bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded">实时计能芯片</span>
                              </div>

                              {/* 1. 动态可调节控制区 */}
                              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-indigo-900/15 p-4 rounded-xl border border-indigo-500/10 text-white">
                                <div className="space-y-1">
                                  <label className="text-[9px] text-indigo-300 font-bold block">种植总规模(亩)</label>
                                  <input 
                                    type="number" 
                                    value={roiArea} 
                                    onChange={(e) => setRoiArea(Math.max(1, Number(e.target.value)))}
                                    className="w-full text-xs p-1.5 bg-indigo-950/80 border border-indigo-500/20 rounded-md text-white font-mono outline-none focus:border-emerald-400"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-indigo-300 font-bold block">预期亩均单产(kg)</label>
                                  <input 
                                    type="number" 
                                    value={roiYield} 
                                    onChange={(e) => setRoiYield(Math.max(1, Number(e.target.value)))}
                                    className="w-full text-xs p-1.5 bg-indigo-950/80 border border-indigo-500/20 rounded-md text-white font-mono outline-none focus:border-emerald-400"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-indigo-300 font-bold block">销售单价(¥/kg)</label>
                                  <input 
                                    type="number" 
                                    step="0.1"
                                    value={roiPrice} 
                                    onChange={(e) => setRoiPrice(Math.max(0.1, Number(e.target.value)))}
                                    className="w-full text-xs p-1.5 bg-indigo-950/80 border border-indigo-500/20 rounded-md text-white font-mono outline-none focus:border-emerald-400"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-indigo-300 font-bold block">种子成本(¥/亩)</label>
                                  <input 
                                    type="number" 
                                    value={roiSeedCost} 
                                    onChange={(e) => setRoiSeedCost(Math.max(0, Number(e.target.value)))}
                                    className="w-full text-xs p-1.5 bg-indigo-950/80 border border-indigo-500/20 rounded-md text-white font-mono outline-none focus:border-emerald-400"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-indigo-300 font-bold block">植保肥料费(¥/亩)</label>
                                  <input 
                                    type="number" 
                                    value={roiFertCost} 
                                    onChange={(e) => setRoiFertCost(Math.max(0, Number(e.target.value)))}
                                    className="w-full text-xs p-1.5 bg-indigo-950/80 border border-indigo-500/20 rounded-md text-white font-mono outline-none focus:border-emerald-400"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-indigo-300 font-bold block">劳务水电费(¥/亩)</label>
                                  <input 
                                    type="number" 
                                    value={roiLaborCost} 
                                    onChange={(e) => setRoiLaborCost(Math.max(0, Number(e.target.value)))}
                                    className="w-full text-xs p-1.5 bg-indigo-950/80 border border-indigo-500/20 rounded-md text-white font-mono outline-none focus:border-emerald-400"
                                  />
                                </div>
                              </div>

                              {/* 2. 精算联动结果 - 布局紧凑化 */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4 relative z-10 text-white">
                                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                  <p className="text-[9px] text-indigo-300 font-bold">总投入成本</p>
                                  <p className="font-mono font-black text-rose-300 text-xs mt-0.5">¥{((roiSeedCost + roiFertCost + roiLaborCost) * roiArea).toLocaleString()}</p>
                                </div>
                                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                  <p className="text-[9px] text-indigo-300 font-bold">预期销售收入</p>
                                  <p className="font-mono font-black text-amber-300 text-xs mt-0.5">¥{(roiYield * environmentalRiskAdjustment * roiPrice * roiArea).toLocaleString()}</p>
                                </div>
                                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                  <p className="text-[9px] text-indigo-300 font-bold">预期净利润</p>
                                  <p className="font-mono font-black text-emerald-400 text-xs mt-0.5">¥{((roiYield * environmentalRiskAdjustment * roiPrice - (roiSeedCost + roiFertCost + roiLaborCost)) * roiArea).toLocaleString()}</p>
                                </div>
                                <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 p-2 rounded-lg border border-emerald-500/30 flex flex-col justify-center">
                                  <p className="text-[9px] text-emerald-300 font-bold">投产品比 ROI</p>
                                  <p className="font-mono font-black text-emerald-400 text-sm mt-0.5">
                                    {(roiSeedCost + roiFertCost + roiLaborCost) > 0 
                                      ? (((roiYield * environmentalRiskAdjustment * roiPrice) / (roiSeedCost + roiFertCost + roiLaborCost) * 100) - 100).toFixed(0) + '%'
                                      : '0%'
                                    }
                                  </p>
                                </div>
                              </div>
                              <div className="h-px w-full bg-indigo-500/20 mb-4" />
                              <p className="text-[11px] text-indigo-100/90 leading-relaxed font-semibold">
                                <strong className="text-emerald-300">智能决策建议: </strong>
                                当预期售价为 ¥{roiPrice}/kg 且产量维持在 {roiYield}kg/亩时，保本点为单产 
                                <span className="font-mono text-white mx-1 font-black underline">
                                  {((roiSeedCost + roiFertCost + roiLaborCost) / roiPrice).toFixed(1)}kg/亩
                                </span>。
                                {aiResult.roiAnalysis.aiAdvice || '建议在此作物生长的特定阶段结合环境监测数据实施水肥一体化作业，进一步拉升 ROI。'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="lg:col-span-5 grid grid-cols-1 gap-6">
                        {/* 1. 预估净收益核算卡 (Grand Prize Level Core Financial Core) */}
                        <div className="bg-white dark:bg-[#121214] rounded-[32px] p-6 border border-slate-200/60 dark:border-white/5 flex flex-col gap-5 shadow-2xl shadow-slate-100/40 dark:shadow-none relative overflow-hidden transition-all hover:border-amber-500/30">
                          {/* Ambient Decorative Light */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                          
                          <div className="flex justify-between items-start z-10">
                            <div>
                              <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 px-2.5 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                精准农事财政中枢
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg font-mono flex items-center gap-1">
                                <ArrowUpRight size={12} />
                                {aiResult?.roiAnalysis?.regionalAdvantage || '+16.5% 优于区域均值'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 z-10">
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                              <DollarSign size={14} className="text-amber-500" />
                              预估纯收益金额 ({roiArea} 亩总览)
                            </p>
                            <div className="flex items-baseline gap-2">
                              <p className="text-4xl font-black text-slate-800 dark:text-white tracking-tight font-mono">
                                ¥{((roiYield * environmentalRiskAdjustment * roiPrice - (roiSeedCost + roiFertCost + roiLaborCost)) * roiArea).toLocaleString()}
                              </p>
                              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">（全期）</span>
                            </div>
                          </div>

                          {/* Real-time Sub-metrics and environmental risk adjustment warning */}
                          <div className="p-3 bg-slate-50 dark:bg-[#1A1A1E] rounded-2xl border border-slate-100 dark:border-white/5 space-y-2.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 font-bold text-[10px]">综合利润率</span>
                              <span className="font-mono font-black text-emerald-500">
                                {(((roiYield * environmentalRiskAdjustment * roiPrice - (roiSeedCost + roiFertCost + roiLaborCost)) / (roiYield * environmentalRiskAdjustment * roiPrice)) * 100).toFixed(1)}%
                              </span>
                            </div>
                            {/* Visual Profit Bar */}
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
                              <div 
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" 
                                style={{ width: `${Math.min(100, Math.max(0, ((roiYield * environmentalRiskAdjustment * roiPrice - (roiSeedCost + roiFertCost + roiLaborCost)) / (roiYield * environmentalRiskAdjustment * roiPrice)) * 100))}%` }}
                              />
                            </div>
                            
                            {/* Environmental Loss Stress Indicator */}
                            {environmentalRiskAdjustment < 1 ? (
                              <div className="flex items-start gap-2 text-[10px] bg-rose-500/5 text-rose-500 p-2 rounded-xl border border-rose-500/10">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <p className="leading-tight font-medium">
                                  <strong>微气候胁迫减产风险:</strong> 局部温度/湿度高频振荡，单产系数衰减为 <span className="font-mono font-bold text-rose-400">{(environmentalRiskAdjustment * 100).toFixed(0)}%</span> (估算灾损: -¥{((1 - environmentalRiskAdjustment) * roiYield * roiPrice * roiArea).toLocaleString()})。
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2 text-[10px] bg-emerald-500/5 text-emerald-500 p-2 rounded-xl border border-emerald-500/10">
                                <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                                <p className="leading-tight font-medium">
                                  <strong>完美气候顺序:</strong> 园区温度与温湿度在作物绝佳增殖区间，无重大抗逆应激性减产损耗。
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Precise Farming Cost Segment Progress Layout */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">成本精算出流比</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="p-2.5 bg-slate-50 dark:bg-[#18181B] rounded-xl border border-slate-100 dark:border-white/5">
                                <p className="text-[9px] text-slate-400 font-bold mb-0.5">幼苗及种子</p>
                                <p className="text-[11px] font-mono font-black text-violet-500">¥{(roiSeedCost * roiArea).toLocaleString()}</p>
                                <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                  <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, (roiSeedCost / (roiSeedCost + roiFertCost + roiLaborCost + 0.1)) * 100)}%` }} />
                                </div>
                              </div>
                              <div className="p-2.5 bg-slate-50 dark:bg-[#18181B] rounded-xl border border-slate-100 dark:border-white/5">
                                <p className="text-[9px] text-slate-400 font-bold mb-0.5">水肥保鲜配施</p>
                                <p className="text-[11px] font-mono font-black text-amber-500">¥{(roiFertCost * roiArea).toLocaleString()}</p>
                                <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (roiFertCost / (roiSeedCost + roiFertCost + roiLaborCost + 0.1)) * 100)}%` }} />
                                </div>
                              </div>
                              <div className="p-2.5 bg-slate-50 dark:bg-[#18181B] rounded-xl border border-slate-100 dark:border-white/5">
                                <p className="text-[9px] text-slate-400 font-bold mb-0.5">人工及水用电</p>
                                <p className="text-[11px] font-mono font-black text-rose-500">¥{(roiLaborCost * roiArea).toLocaleString()}</p>
                                <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                  <div className="h-full bg-rose-500" style={{ width: `${Math.min(100, (roiLaborCost / (roiSeedCost + roiFertCost + roiLaborCost + 0.1)) * 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-1 pt-3 border-t border-slate-100 dark:border-white/5 text-xs">
                            <div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">估算毛销售总额</p>
                              <p className="text-sm font-mono font-black text-slate-700 dark:text-slate-200">¥{(roiYield * environmentalRiskAdjustment * roiPrice * roiArea).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">总预算投入成本</p>
                              <p className="text-sm font-mono font-black text-slate-700 dark:text-slate-200">¥{((roiSeedCost + roiFertCost + roiLaborCost) * roiArea).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>

                        {/* 2. 决策置信水平核算卡 (Grand Prize Level Core Trust Factor Dashboard) */}
                        <div className="bg-white dark:bg-[#121214] rounded-[32px] p-6 border border-slate-200/60 dark:border-white/5 flex flex-col gap-5 shadow-2xl shadow-slate-100/40 dark:shadow-none relative overflow-hidden transition-all hover:border-indigo-500/30">
                          {/* Ambient Glowing Circuit */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                          
                          <div className="flex justify-between items-start z-10">
                            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-2.5 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5">
                              <Cpu size={12} className="animate-spin-slow" />
                              智源多感核算引擎
                            </span>
                            <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              星地实时传感器数: 12
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-0.5 z-10">
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                              <ShieldCheck size={14} className="text-indigo-500" />
                              算法推荐决策置信水平 (Ensemble Score)
                            </p>
                            <div className="flex items-baseline gap-2">
                              <p className="text-4xl font-black text-slate-800 dark:text-white tracking-tight font-mono">94.2%</p>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-black">超强拟合度</span>
                            </div>
                            <p className="text-[9px] text-slate-400/80 leading-relaxed font-bold">采用多阶 Transformer-GRU 神经网络，结合空间遥感及近地物联网的归一化指数联合计算所得。</p>
                          </div>

                          {/* Standard Four-Layer Analytical Empirical System */}
                          <div className="space-y-3 mt-1.5">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">智算多维拟合层度</p>
                            
                            <div className="space-y-2.5">
                              {/* Layer 1: Satellite Retrieval */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">🛰️ 空天卫星红边植被指数反演</span>
                                  <span className="font-mono text-indigo-500">97.8%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: "97.8%" }} />
                                </div>
                              </div>

                              {/* Layer 2: Microclimate Weather */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">⏱️ 园区局部环境逆境极端拟合</span>
                                  <span className="font-mono text-emerald-500">95.2%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: "95.2%" }} />
                                </div>
                              </div>

                              {/* Layer 3: Expert Consensus */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">📜 农业科学院专家先验决策验证</span>
                                  <span className="font-mono text-violet-500">96.0%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400" style={{ width: "96%" }} />
                                </div>
                              </div>

                              {/* Layer 4: Close Ground Calibration */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">📡 近地多功能监测站流校准度</span>
                                  <span className="font-mono text-amber-500">98.5%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: "98.5%" }} />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Extra Status telemetries at footer */}
                          <div className="mt-1 pt-3 border-t border-slate-100 dark:border-white/5 flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500">
                            <span className="flex items-center gap-1"><Database size={10} className="text-indigo-400" /> 24个月历史样本库</span>
                            <span className="flex items-center gap-1"><Activity size={10} className="text-emerald-400" /> 网关高在线 (99.9%)</span>
                            <span className="flex items-center gap-1"><Sparkles size={10} className="text-amber-400" /> 先验熵拟合度高</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Yield Comparison Chart */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                      <div className="bg-white dark:bg-[#121214] rounded-[32px] p-8 border border-slate-100 dark:border-white/5 shadow-sm">
                        <h4 className="text-sm font-black text-slate-800 dark:text-white mb-8 flex items-center gap-2">
                          <BarChart3 size={18} className="text-indigo-600" />
                          {t('management.ai.revenueComparison')}
                        </h4>
                        <div className="h-[240px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={[
                                { name: aiResult.recommendedCrop, profit: aiResult.expectedProfit, isRecommended: true },
                                ...aiResult.alternatives.map(alt => ({ name: alt.crop, profit: alt.expectedProfit, isRecommended: false }))
                              ]}
                              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                                dy={10}
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8', fontFamily: 'monospace' }}
                                tickFormatter={(value) => `¥${value/1000}k`}
                              />
                              <Tooltip 
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ 
                                  borderRadius: '20px', 
                                  border: 'none', 
                                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                                  padding: '16px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                  backdropFilter: 'blur(8px)'
                                }}
                                itemStyle={{ color: '#1e293b', fontWeight: 800, fontFamily: 'monospace' }}
                                labelStyle={{ color: '#64748b', marginBottom: '4px', fontWeight: 700 }}
                                formatter={(value: number) => [`¥${value.toLocaleString()}`, t('management.stats.estimatedRevenue')]}
                              />
                              <Bar dataKey="profit" radius={[8, 8, 0, 0]} barSize={40}>
                                {[
                                  { isRecommended: true },
                                  ...aiResult.alternatives.map(() => ({ isRecommended: false }))
                                ].map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.isRecommended ? '#4f46e5' : '#cbd5e1'} className={entry.isRecommended ? '' : 'dark:fill-slate-700'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-[#1A1A1A] rounded-[32px] p-8 border border-slate-100 dark:border-white/5">
                        <h4 className="text-sm font-black text-slate-800 dark:text-white mb-6">{t('management.ai.altAnalysis')}</h4>
                        <div className="space-y-4">
                          {aiResult.alternatives.map((alt, i) => (
                            <div key={i} className="bg-white dark:bg-[#0A0A0A] rounded-2xl p-5 border border-slate-100 dark:border-white/5 flex flex-col justify-between group hover:border-indigo-500/30 transition-all">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-slate-50 dark:bg-[#1A1A1A] text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/20 group-hover:text-indigo-600 transition-colors">
                                    <Scale size={18} />
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-800 dark:text-white">{alt.crop}</p>
                                    <p className="text-[10px] font-bold text-slate-400 font-mono">{t('management.ai.matchingDegree')} {alt.suitability}%</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-black text-slate-800 dark:text-white font-mono">¥{alt?.expectedProfit?.toLocaleString() || '0'}</p>
                                  <p className="text-[10px] text-emerald-500 font-bold">{t('management.stats.estimatedRevenue')}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pt-3 border-t border-slate-50 dark:border-white/5">
                                 {alt.growthCycle ? (
                                   <span className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-white/5 font-bold text-slate-500 dark:text-slate-400 rounded-md">
                                     周期: {alt.growthCycle}
                                   </span>
                                 ) : (
                                   <span className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-white/5 font-bold text-slate-500 dark:text-slate-400 rounded-md">
                                     周期: 参考本地数据
                                   </span>
                                 )}
                                 {alt.riskLevel ? (
                                   <span className={cn(
                                     "text-[10px] px-2 py-1 rounded-md font-bold",
                                     alt.riskLevel.includes('低') || alt.riskLevel.includes('稳') ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                                     alt.riskLevel.includes('高') ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400" :
                                     "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                   )}>
                                     风险: {alt.riskLevel}
                                   </span>
                                 ) : (
                                   <span className="bg-slate-50 dark:bg-white/5 text-[10px] px-2 py-1 rounded-md font-bold text-slate-500">
                                     风险评估中
                                   </span>
                                 )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20">
                          <p className="text-[10px] font-bold text-indigo-900/70 dark:text-indigo-300/70 leading-relaxed">
                            <Zap size={12} className="inline mr-1 text-indigo-600" />
                            {t('management.ai.comparisonSummary', { recommended: aiResult.recommendedCrop, profitInc: '15.4%', riskDec: '8.2%' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="py-20 flex flex-col items-center justify-center text-center"
                  >
                    <div className="w-20 h-20 bg-slate-50 dark:bg-[#1A1A1A] text-slate-300 dark:text-slate-600 rounded-[32px] flex items-center justify-center mb-6 border border-dashed border-slate-200 dark:border-white/10">
                      <BrainCircuit size={40} />
                    </div>
                    <h4 className="text-xl font-black text-slate-800 dark:text-white mb-2">{t('management.ai.readyTitle')}</h4>
                    <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs mb-8">
                      {t('management.ai.readyDesc')}
                    </p>
                    <button 
                      onClick={() => runAIAnalysis()}
                      className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                    >
                      {t('management.ai.startAnalysis')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Hardware Control Section */}
        <section id="management-operations" className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 relative">
          {currentPlot?.status === 'pending_setup' && (
            <div className="absolute inset-0 z-20 bg-white/60 dark:bg-black/60 backdrop-blur-[4px] rounded-[32px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-indigo-500/30">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mb-4 border border-amber-200 dark:border-amber-500/30">
                <Zap size={32} />
              </div>
              <h4 className="text-xl font-black text-slate-800 dark:text-white mb-2">{t('management.hardware.unavailable')}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                {t('management.hardware.desc')}
              </p>
              <button 
                onClick={handleOpenConnectModal}
                className="px-6 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-black hover:bg-amber-700 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
              >
                {t('management.hardware.config')}
              </button>
            </div>
          )}
          {/* Remote Controls */}
          <div className="bg-white/80 dark:bg-[#050505]/60 backdrop-blur-2xl rounded-[40px] p-8 border border-white/20 dark:border-white/10 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 border-b border-slate-100 dark:border-white/5 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <Zap size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{t('management.hardware.remoteTitle')}</h3>
                  <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">{t('management.hardware.remoteSubtitle')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Select All Toggle */}
                <button
                  onClick={handleToggleSelectAllDevices}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm"
                >
                  {selectedDevices.length === 4 ? '取消全选' : '全选设备'}
                </button>

                {selectedDevices.length > 0 ? (
                  <button
                    onClick={handleBatchExportReports}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-sm font-black transition-all shadow-md shadow-emerald-500/20 animate-pulse-subtle"
                  >
                    <Download size={16} />
                    打包下载健康报告 ({selectedDevices.length}个) .zip
                  </button>
                ) : (
                  <button
                    onClick={handleExportReport}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 rounded-xl text-sm font-bold transition-colors shadow-sm"
                  >
                    <Download size={16} />
                    导出设备总览 (.csv)
                  </button>
                )}
              </div>
            </div>

            {selectedDevices.length > 0 && (
              <div className="mb-4 px-4 py-2.5 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-between">
                <span>已选中 {selectedDevices.length} 个设备的健康状态分析报告，点击上方按钮即可一键打包为 ZIP 压缩包。</span>
                <button 
                  onClick={() => setSelectedDevices([])}
                  className="hover:underline text-indigo-500 dark:text-indigo-300"
                >
                  清空选择
                </button>
              </div>
            )}

            <div className="space-y-4">
              <ControlToggle 
                label={t('management.hardware.irrigation')} 
                icon={<Droplets size={20} />} 
                active={hardwareStatus.irrigation}
                loading={actionLoading === 'irrigation'}
                onClick={() => handleHardwareControl('irrigation')}
                onSettingsClick={() => { setSettingsType('irrigation'); setShowSettingsModal(true); }}
                desc={t('management.hardware.irrigationDesc')}
                selected={selectedDevices.includes('irrigation')}
                onSelectToggle={() => handleToggleSelectDevice('irrigation')}
              />
              <ControlToggle 
                label={t('management.hardware.ventilation')} 
                icon={<Wind size={20} />} 
                active={hardwareStatus.ventilation}
                loading={actionLoading === 'ventilation'}
                onClick={() => handleHardwareControl('ventilation')}
                onSettingsClick={() => { setSettingsType('ventilation'); setShowSettingsModal(true); }}
                desc={t('management.hardware.ventilationDesc')}
                selected={selectedDevices.includes('ventilation')}
                onSelectToggle={() => handleToggleSelectDevice('ventilation')}
              />
              <ControlToggle 
                label={t('management.hardware.heating')} 
                icon={<Flame size={20} />} 
                active={hardwareStatus.heating}
                loading={actionLoading === 'heating'}
                onClick={() => handleHardwareControl('heating')}
                onSettingsClick={() => { setSettingsType('heating'); setShowSettingsModal(true); }}
                desc={t('management.hardware.heatingDesc')}
                selected={selectedDevices.includes('heating')}
                onSelectToggle={() => handleToggleSelectDevice('heating')}
              />
              <ControlToggle 
                label={t('management.hardware.lighting')} 
                icon={<Sun size={20} />} 
                active={hardwareStatus.lighting}
                loading={actionLoading === 'lighting'}
                onClick={() => handleHardwareControl('lighting')}
                onSettingsClick={() => { setSettingsType('lighting'); setShowSettingsModal(true); }}
                desc={t('management.hardware.lightingDesc')}
                selected={selectedDevices.includes('lighting')}
                onSelectToggle={() => handleToggleSelectDevice('lighting')}
              />
            </div>
          </div>

          {/* Automated Fertilization */}
          <div className="bg-white/80 dark:bg-[#050505]/60 backdrop-blur-2xl rounded-[40px] p-8 border border-white/20 dark:border-white/10 shadow-2xl relative overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <FlaskConical size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{t('management.hardware.fertilizationTitle')}</h3>
                  <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">{t('management.hardware.fertilizationSubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => { setSettingsType('fertilization'); setShowSettingsModal(true); }}
                className="p-3 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
              >
                <Target size={20} />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-[#1A1A1A] rounded-[32px] border border-slate-100 dark:border-white/5">
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all duration-500 border border-transparent dark:border-white/5",
                hardwareStatus.fertilization 
                  ? "bg-emerald-500 text-white scale-110 shadow-xl shadow-emerald-500/20" 
                  : "bg-white dark:bg-[#1A1A1A] text-slate-300 dark:text-slate-600 shadow-sm"
              )}>
                {actionLoading === 'fertilization' ? <Loader2 className="animate-spin" size={32} /> : <FlaskConical size={32} />}
              </div>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-[200px] font-medium">
                {hardwareStatus.fertilization ? t('management.hardware.fertilizationActive') : t('management.hardware.fertilizationInactive')}
              </p>
              <button 
                onClick={handleFertilization}
                disabled={!!actionLoading}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-2 active:scale-95",
                  hardwareStatus.fertilization 
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 cursor-default" 
                    : "bg-forest-green text-white hover:bg-emerald-green shadow-lg shadow-forest-green/20"
                )}
              >
                {hardwareStatus.fertilization ? t('management.hardware.fertilizing') : t('management.hardware.startFertilization')}
              </button>
            </div>
          </div>
        </section>

        {/* 农事工单与协作空间 & 区块链存证 (国赛增强) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 mt-4 sm:mt-8">
          {/* 任务工单与进度跟踪 */}
          <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-xl p-8 rounded-[40px] shadow-xl border border-slate-100 dark:border-white/5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                    <ClipboardList className="w-6 h-6 text-indigo-500" />
                    多主体协作工单
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">农事作业管理与精准协同空间</p>
                </div>
                <button 
                  onClick={() => setShowWorkOrderModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-indigo-500/10"
                >
                  + 新增协同工单
                </button>
              </div>
              
              <div className="space-y-4 relative z-10 flex-1 overflow-y-auto max-h-[420px] pr-2 custom-scrollbar">
                {workOrders.map((task) => (
                  <div key={task.id} className="p-4 bg-slate-50 dark:bg-[#1A1A1A]/80 rounded-2xl border border-slate-100 dark:border-white/5 hover:border-indigo-500/30 transition-all flex flex-col gap-2 group">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-black text-sm text-slate-800 dark:text-white">{task.title}</h4>
                          <span className={cn(
                            "text-[8px] px-2 py-0.5 rounded-full font-black uppercase",
                            task.priority === '紧急' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            task.priority === '中' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                          )}>
                            {task.priority || '中'}
                          </span>
                        </div>
                        {task.memo && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-medium line-clamp-2 leading-relaxed mb-1">
                            {task.memo}
                          </p>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          if (task.status === '已完成') return;
                          setWorkOrders(orders => orders.map(o => o.id === task.id ? { ...o, status: '已完成', progress: 100 } : o));
                          addNotification({
                            title: '农事协作工单更新！',
                            message: `工单【${task.title}】已确认为已完成状态并同步存档！`,
                            type: 'success'
                          });
                        }}
                        disabled={task.status === '已完成'}
                        className={cn(
                          "text-[9px] px-2.5 py-1.5 rounded-lg font-black uppercase transition-all whitespace-nowrap",
                          task.status === '进行中' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 cursor-pointer hover:scale-105' :
                          task.status === '已完成' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 cursor-default animate-pulse' :
                          task.status === '已延误' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 cursor-pointer hover:scale-105' :
                          'bg-slate-200 text-slate-600 dark:bg-white/5 dark:text-slate-400 cursor-pointer hover:scale-105'
                        )}
                        title={task.status !== '已完成' ? '点击一键确认为已完成' : ''}
                      >
                        {task.status}
                      </button>
                    </div>
                    
                    <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase border-t border-dashed border-slate-100 dark:border-white/5 pt-2">
                      <div>负责人: <span className="text-slate-700 dark:text-slate-300 font-extrabold">{task.assignee}</span></div>
                      <div>时限: <span className={task.status === '已延误' ? 'text-rose-500 font-extrabold' : 'text-slate-700 dark:text-slate-300 font-extrabold'}>{task.time}</span></div>
                      <div className="font-mono text-indigo-500">{task.progress}%</div>
                    </div>

                    <div className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden mt-1">
                      <div className={cn("h-full rounded-full transition-all duration-1000", task.status === '已完成' ? 'bg-emerald-500' : task.status === '已延误' ? 'bg-rose-500' : 'bg-indigo-500')} style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
          </div>

          {/* 区块链轻量级溯源存证 */}
          <div id="management-archive" className="bg-white/80 dark:bg-[#121214]/80 border border-slate-100 dark:border-white/5 p-4 sm:p-8 rounded-2xl sm:rounded-[40px] shadow-xl relative overflow-hidden flex flex-col justify-between transition-all duration-300">
            <div className="absolute top-0 right-0 p-8 opacity-5 dark:opacity-10 pointer-events-none">
              <Link2 size={120} className="text-emerald-500" />
            </div>
            
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 dark:border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.1)]">
                  <Link2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    区块链分布式溯源网络
                  </h3>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase">物理印签、防伪追溯存证</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-mono rounded-lg border border-emerald-500/10 dark:border-emerald-500/20 uppercase tracking-widest font-black">联盟链：SEC_P256K1</span>
            </div>

            {/* 实时存证输入 */}
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-3xl p-5 mb-5 relative z-10 space-y-4">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider">快捷区块档案存证系统</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] text-slate-500 dark:text-slate-400 font-bold block mb-1">物理事件/行为</label>
                  <input 
                    type="text" 
                    value={blockchainInputText} 
                    onChange={(e) => setBlockchainInputText(e.target.value)}
                    placeholder="例如: 玉米收获完成" 
                    className="w-full text-xs p-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-emerald-500 dark:focus:border-emerald-500 text-slate-800 dark:text-white font-semibold shadow-sm transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-500 dark:text-slate-400 font-bold block mb-1">指标特性数据 (Key-Value)</label>
                  <input 
                    type="text" 
                    value={blockchainInputData} 
                    onChange={(e) => setBlockchainInputData(e.target.value)}
                    placeholder="例如: 12.8吨;特等小麦" 
                    className="w-full text-xs p-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-emerald-500 dark:focus:border-emerald-500 text-slate-800 dark:text-white font-semibold shadow-sm transition-all"
                  />
                </div>
              </div>
              
              {isCertifying ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black">
                    <Loader2 size={12} className="animate-spin" />
                    {certificationStep === 1 ? '区块链正在加密事件并拼装哈希签名...' : 
                     certificationStep === 2 ? '正在调度智能合约，PBFT 节点共识达成中...' : 
                     '区块已持久化上链！'}
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-emerald-950/40 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${certificationStep === 1 ? 33 : certificationStep === 2 ? 66 : 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    if (!blockchainInputText) {
                      addNotification({
                        title: '提示',
                        message: '请至少输入上链物理事件描述。',
                        type: 'warning'
                      });
                      return;
                    }
                    setIsCertifying(true);
                    setCertificationStep(1);
                    
                    setTimeout(() => {
                      setCertificationStep(2);
                      setTimeout(() => {
                        setCertificationStep(3);
                        const randomHex = Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
                        const newId = Date.now();
                        const nextBlock = blockchainLedger.length > 0 ? blockchainLedger[0].block + 1 : 10100;
                        const gasFee = Math.floor(Math.random() * 5000) + 18000;
                        
                        const newRecord = {
                          id: newId,
                          action: blockchainInputText,
                          hash: '0x' + randomHex.substring(0, 4) + '...' + randomHex.substring(36),
                          time: new Date().toISOString().replace('T', ' ').substring(0,16),
                          block: nextBlock,
                          gas: gasFee,
                          data: blockchainInputData || '无补充数值属性指标'
                        };
                        
                        setBlockchainLedger([newRecord, ...blockchainLedger]);
                        setIsCertifying(false);
                        setBlockchainInputText('');
                        setBlockchainInputData('');
                        
                        addNotification({
                          title: '区块上链成功！',
                          message: `事件【${newRecord.action}】已成功持久化写入主链，生成签名哈希！`,
                          type: 'success'
                        });
                      }, 1000);
                    }, 800);
                  }}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-black text-xs rounded-xl text-white transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] flex justify-center items-center gap-1.5"
                >
                  签署并持久化防伪上链
                </button>
              )}
            </div>

            {/* 账本历史 */}
            <div className="space-y-3.5 relative z-10 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
               {blockchainLedger.map((record) => (
                 <div key={record.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-white/5 last:border-0 pl-4 relative">
                   <div className="absolute left-[-2px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                   <div>
                     <p className="font-extrabold text-xs text-slate-800 dark:text-slate-200 mb-0.5">{record.action}</p>
                     <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold font-mono">区块 #{record.block} | 消耗: {record.gas} Gwei</p>
                   </div>
                   <div 
                     onClick={() => setSelectedCertificate(record)}
                     className="bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors px-3 py-1.5 rounded-lg border border-slate-200/40 dark:border-white/10 cursor-pointer group flex items-center gap-1.5 shadow-sm"
                     title="查看链上物理身份证"
                   >
                     <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold group-hover:text-emerald-500 dark:group-hover:text-emerald-300">{record.hash}</span>
                     <ExternalLink size={10} className="text-slate-400 group-hover:text-emerald-500 dark:group-hover:text-emerald-400" />
                   </div>
                 </div>
               ))}
               <div className="mt-6 flex justify-between items-center bg-emerald-500/5 dark:bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/10 dark:border-emerald-500/20">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                     <QrCode size={18} />
                     <span className="text-[10px] font-black">农产品一码到底消费者扫码验证端</span>
                  </div>
                  <button 
                    onClick={() => {
                      if (blockchainLedger.length > 0) {
                        setSelectedCertificate(blockchainLedger[0]);
                      }
                    }}
                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-md active:scale-95"
                  >
                    生成证书防伪码
                  </button>
               </div>
            </div>
          </div>
        </section>

      </div>
      </div>
      )}

      {/* 硬件参数设置弹窗 */}
      <AnimatePresence>
        {showSettingsModal && settingsType && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#121214] rounded-t-3xl sm:rounded-[32px] p-4 sm:p-8 shadow-2xl border border-slate-100 dark:border-white/10"
            >
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-[#1A1A1A] rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Target size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white">参数设置</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {settingsType === 'irrigation' ? '灌溉系统' :
                     settingsType === 'ventilation' ? '通风系统' :
                     settingsType === 'heating' ? '加热系统' :
                     settingsType === 'lighting' ? '补光系统' : '施肥系统'}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {settingsType === 'irrigation' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">灌溉时长 (分钟)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.irrigation?.duration || 30}
                        onChange={e => setHardwareParams({ ...hardwareParams, irrigation: { ...hardwareParams.irrigation, duration: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">目标土壤湿度 (%)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.irrigation?.targetMoisture || 60}
                        onChange={e => setHardwareParams({ ...hardwareParams, irrigation: { ...hardwareParams.irrigation, targetMoisture: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                  </>
                )}
                {settingsType === 'ventilation' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">通风时长 (分钟)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.ventilation?.duration || 15}
                        onChange={e => setHardwareParams({ ...hardwareParams, ventilation: { ...hardwareParams.ventilation, duration: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">目标温度 (°C)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.ventilation?.targetTemp || 25}
                        onChange={e => setHardwareParams({ ...hardwareParams, ventilation: { ...hardwareParams.ventilation, targetTemp: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                  </>
                )}
                {settingsType === 'heating' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">加热时长 (分钟)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.heating?.duration || 60}
                        onChange={e => setHardwareParams({ ...hardwareParams, heating: { ...hardwareParams.heating, duration: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">目标温度 (°C)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.heating?.targetTemp || 20}
                        onChange={e => setHardwareParams({ ...hardwareParams, heating: { ...hardwareParams.heating, targetTemp: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                  </>
                )}
                {settingsType === 'lighting' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">补光时长 (分钟)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.lighting?.duration || 120}
                        onChange={e => setHardwareParams({ ...hardwareParams, lighting: { ...hardwareParams.lighting, duration: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">目标光照强度 (Lux)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.lighting?.targetLight || 50000}
                        onChange={e => setHardwareParams({ ...hardwareParams, lighting: { ...hardwareParams.lighting, targetLight: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                  </>
                )}
                {settingsType === 'fertilization' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">施肥量 (kg/亩)</label>
                      <input 
                        type="number" 
                        value={hardwareParams.fertilization?.amount || 15}
                        onChange={e => setHardwareParams({ ...hardwareParams, fertilization: { ...hardwareParams.fertilization, amount: Number(e.target.value) } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">肥料类型</label>
                      <select 
                        value={hardwareParams.fertilization?.type || '复合肥'}
                        onChange={e => setHardwareParams({ ...hardwareParams, fertilization: { ...hardwareParams.fertilization, type: e.target.value } })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                      >
                        <option value="复合肥">复合肥</option>
                        <option value="尿素">尿素</option>
                        <option value="磷酸二氢钾">磷酸二氢钾</option>
                        <option value="有机肥">有机肥</option>
                      </select>
                    </div>
                  </>
                )}
                
                <button 
                  onClick={async () => {
                    await DataService.updateHardwareParams(activePlot, settingsType, hardwareParams[settingsType]);
                    setShowSettingsModal(false);
                    addNotification({
                      title: '设置已保存',
                      message: '自动化执行参数已更新',
                      type: 'success'
                    });
                  }}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 mt-4"
                >
                  保存设置
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 添加地块弹窗 */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#0A0A0A] rounded-t-3xl sm:rounded-[32px] p-4 sm:p-10 shadow-2xl border border-transparent dark:border-white/10"
            >
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-8 flex items-center gap-3">
                <Plus className="text-forest-green dark:text-emerald-400" />
                {t('management.modals.addTitle')}
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t('management.modals.plotName')}</label>
                  <input 
                    type="text" 
                    value={newPlot.name}
                    onChange={e => setNewPlot({...newPlot, name: e.target.value})}
                    placeholder={t('management.modals.plotNamePlaceholder')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A]/50 text-slate-800 dark:text-white focus:border-forest-green dark:focus:border-emerald-500 focus:ring-2 focus:ring-forest-green/20 dark:focus:ring-emerald-500/20 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t('management.modals.plotArea')}</label>
                  <input 
                    type="number" 
                    value={newPlot.area}
                    onChange={e => setNewPlot({...newPlot, area: e.target.value})}
                    placeholder={t('management.modals.plotAreaPlaceholder')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A]/50 text-slate-800 dark:text-white focus:border-forest-green dark:focus:border-emerald-500 focus:ring-2 focus:ring-forest-green/20 dark:focus:ring-emerald-500/20 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t('management.modals.currentCrop')}</label>
                  <input 
                    type="text" 
                    value={newPlot.crop}
                    onChange={e => setNewPlot({...newPlot, crop: e.target.value})}
                    placeholder={t('management.modals.currentCropPlaceholder')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A]/50 text-slate-800 dark:text-white focus:border-forest-green dark:focus:border-emerald-500 focus:ring-2 focus:ring-forest-green/20 dark:focus:ring-emerald-500/20 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t('management.modals.nextTillage')}</label>
                  <input 
                    type="date" 
                    value={newPlot.nextTillageDate}
                    onChange={e => setNewPlot({...newPlot, nextTillageDate: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A]/50 text-slate-800 dark:text-white focus:border-forest-green dark:focus:border-emerald-500 focus:ring-2 focus:ring-forest-green/20 dark:focus:ring-emerald-500/20 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">播种日期</label>
                    <input 
                      type="date" 
                      value={newPlot.plantingDate}
                      onChange={e => setNewPlot({...newPlot, plantingDate: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A]/50 text-slate-800 dark:text-white focus:border-forest-green dark:focus:border-emerald-500 focus:ring-2 focus:ring-forest-green/20 dark:focus:ring-emerald-500/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">预计收获</label>
                    <input 
                      type="date" 
                      value={newPlot.expectedHarvestDate}
                      onChange={e => setNewPlot({...newPlot, expectedHarvestDate: e.target.value})}
                      placeholder="可选"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A]/50 text-slate-800 dark:text-white focus:border-forest-green dark:focus:border-emerald-500 focus:ring-2 focus:ring-forest-green/20 dark:focus:ring-emerald-500/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-10">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="py-4 rounded-xl font-bold text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-[#1A1A1A] transition-colors"
                >
                  {t('app.cancel')}
                </button>
                <button 
                  onClick={handleAddPlot}
                  className="py-4 bg-forest-green text-white rounded-xl font-bold hover:bg-emerald-green transition-all shadow-lg shadow-forest-green/20"
                >
                  {t('management.modals.confirmAdd')}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showConnectModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowConnectModal(false);
                setShowConnectTutorial(false);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#0A0A0A] rounded-t-3xl sm:rounded-[40px] p-4 sm:p-10 shadow-2xl border border-transparent dark:border-white/10"
            >
              <AnimatePresence>
                {showConnectTutorial && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute -top-6 left-1/2 -translate-x-1/2 w-[110%] bg-indigo-600 text-white p-6 rounded-3xl shadow-2xl z-50 flex items-start gap-4"
                  >
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                      <Info size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-black mb-2">{t('management.modals.tutorialTitle')}</h4>
                      <p className="text-sm text-indigo-100 leading-relaxed mb-4">
                        {t('management.modals.tutorialDesc')}
                      </p>
                      <button 
                        onClick={handleCloseConnectTutorial}
                        className="px-6 py-2 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors"
                      >
                        {t('management.modals.tutorialConfirm')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('management.modals.connectTitle')}</h3>
                    <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">{t('management.modals.connectSubtitle', { name: currentPlot?.name })}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowConnectModal(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] rounded-full transition-colors"
                >
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                {[
                  { id: 'sensor_hub', name: t('management.hardware.devices.sensorHub.name'), type: 'sensor', desc: t('management.hardware.devices.sensorHub.desc') },
                  { id: 'soil_probe', name: t('management.hardware.devices.soilProbe.name'), type: 'sensor', desc: t('management.hardware.devices.soilProbe.desc') },
                  { id: 'irrigation_valve', name: t('management.hardware.devices.irrigationValve.name'), type: 'actuator', desc: t('management.hardware.devices.irrigationValve.desc') },
                  { id: 'ventilation_system', name: t('management.hardware.devices.ventilationSystem.name'), type: 'actuator', desc: t('management.hardware.devices.ventilationSystem.desc') },
                  { id: 'lighting_array', name: t('management.hardware.devices.lightingArray.name'), type: 'actuator', desc: t('management.hardware.devices.lightingArray.desc') },
                  { id: 'fertilizer_injector', name: t('management.hardware.devices.fertilizerInjector.name'), type: 'actuator', desc: t('management.hardware.devices.fertilizerInjector.desc') }
                ].map(device => {
                  const isSelected = selectedDevices.includes(device.id);
                  return (
                    <div 
                      key={device.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDevices(selectedDevices.filter(id => id !== device.id));
                        } else {
                          setSelectedDevices([...selectedDevices, device.id]);
                        }
                      }}
                      className={cn(
                        "p-5 rounded-3xl border-2 cursor-pointer transition-all flex items-start gap-4 hover:scale-[1.02] active:scale-95",
                        isSelected 
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" 
                          : "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-[#1A1A1A]/50 hover:border-slate-200 dark:hover:border-white/10"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        isSelected ? "bg-indigo-600 text-white" : "bg-white dark:bg-[#0A0A0A] text-slate-400 border border-slate-100 dark:border-white/5"
                      )}>
                        {device.type === 'sensor' ? <Search size={20} /> : <Zap size={20} />}
                      </div>
                      <div>
                        <p className={cn("font-bold text-sm mb-1", isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-white")}>
                          {device.name}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">{device.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConnectModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-400 rounded-2xl font-black hover:bg-slate-200 dark:hover:bg-[#222] transition-all"
                >
                  {t('app.cancel')}
                </button>
                <button 
                  onClick={handleConnectDevices}
                  disabled={isConnecting || selectedDevices.length === 0}
                  className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 size={24} className="animate-spin" />
                      {t('management.modals.connecting')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      {t('management.modals.confirmConnect')} ({selectedDevices.length})
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 派发新农事工单 Modal Overlay */}
        {showWorkOrderModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWorkOrderModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#121214] rounded-t-3xl sm:rounded-[32px] p-4 sm:p-8 shadow-2xl border border-slate-100 dark:border-white/5 z-10"
            >
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                <ClipboardList className="text-indigo-500" />
                派发多主体协作工单
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">工单任务主题</label>
                  <input 
                    type="text" 
                    value={newWorkOrderTitle}
                    onChange={(e) => setNewWorkOrderTitle(e.target.value)}
                    placeholder="请输入简洁的农事任务名 (例如：底施硅肥、3号渠水肥)"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-slate-800 dark:text-white text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">执行主体 / 协作员</label>
                    <select 
                      value={newWorkOrderAssignee}
                      onChange={(e) => setNewWorkOrderAssignee(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-slate-800 dark:text-white text-sm outline-none focus:border-indigo-500"
                    >
                      <option value="张建国 (社员)">张建国 (社员)</option>
                      <option value="李技师 (工程部)">李技师 (工程部)</option>
                      <option value="1号农机合作社">1号农机合作社</option>
                      <option value="无人机自动化编队">无人机自动化编队</option>
                      <option value="智能滴灌中央控制组">智能滴灌中央控制组</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">任务截止时间</label>
                    <input 
                      type="text" 
                      value={newWorkOrderDeadline}
                      onChange={(e) => setNewWorkOrderDeadline(e.target.value)}
                      placeholder="今日下班前 / 明日 08:00"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-slate-800 dark:text-white text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">优先级响应划分</label>
                  <div className="flex gap-3">
                    {(['一般', '中', '紧急'] as const).map((pri) => (
                      <button
                        key={pri}
                        type="button"
                        onClick={() => setNewWorkOrderPriority(pri)}
                        className={cn(
                          "flex-1 py-2 text-xs font-bold rounded-xl border transition-all",
                          newWorkOrderPriority === pri 
                            ? "border-indigo-500 bg-indigo-500/10 text-indigo-500" 
                            : "border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 text-slate-500"
                        )}
                      >
                        {pri}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">农事操作细则备注 (Memo)</label>
                  <textarea 
                    value={newWorkOrderMemo}
                    onChange={(e) => setNewWorkOrderMemo(e.target.value)}
                    placeholder="请输入工单执行要点，例如配比、作业幅宽、航向等技术指标..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-slate-800 dark:text-white text-sm outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8">
                <button 
                  onClick={() => setShowWorkOrderModal(false)}
                  className="py-3.5 rounded-xl font-bold text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1A1A1A] transition-colors text-sm"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    if (!newWorkOrderTitle.trim()) {
                      addNotification({
                        title: '提示',
                        message: '请输入工单任务主题。',
                        type: 'warning'
                      });
                      return;
                    }
                    const newId = Date.now();
                    const newOrder = {
                      id: newId,
                      title: newWorkOrderTitle,
                      assignee: newWorkOrderAssignee,
                      time: newWorkOrderDeadline || '今日下班前',
                      progress: 0,
                      status: '待执行' as const,
                      priority: newWorkOrderPriority,
                      memo: newWorkOrderMemo
                    };
                    setWorkOrders([newOrder, ...workOrders]);
                    setShowWorkOrderModal(false);
                    setNewWorkOrderTitle('');
                    setNewWorkOrderMemo('');
                    
                    addNotification({
                      title: '新协同作业工单已下发！',
                      message: `工单【${newOrder.title}】已成功分派至【${newOrder.assignee}】，系统已开启进度全天候监控。`,
                      type: 'success'
                    });
                  }}
                  className="py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm"
                >
                  确认下发并指派负责主体
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 链上物理质量防伪证书 Modal Overlay */}
        {selectedCertificate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCertificate(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950 rounded-[36px] p-8 shadow-2xl border border-emerald-500/20 dark:border-emerald-500/30 text-slate-800 dark:text-white z-10 transition-colors duration-300"
            >
              {/* Certificate Border decoration */}
              <div className="absolute inset-4 rounded-[28px] border border-dashed border-emerald-500/20 dark:border-emerald-500/10 pointer-events-none" />
              
              <div className="text-center relative z-10">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30 shadow-inner mx-auto mb-4">
                  <ShieldCheck size={36} className="animate-pulse" />
                </div>
                <h4 className="text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-wider">农芯链·绿色农产品质量追溯通行证</h4>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Decentralized Agricultural Quality Passport</p>
              </div>

              <div className="my-6 space-y-3.5 bg-slate-50 dark:bg-black/30 p-5 rounded-2xl border border-slate-100 dark:border-white/5 relative z-10 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-150 dark:border-white/5">
                  <span className="text-slate-500 dark:text-slate-400">链上哈希记录</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 select-all font-bold">{selectedCertificate.hash}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">锚定物理行为</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-100">{selectedCertificate.action}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">联盟链共识高度</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-300 font-bold">Block #{selectedCertificate.block}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">链上存证哈希写入时间</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300">{selectedCertificate.time}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Gas 精算消耗</span>
                  <span className="font-mono text-amber-600 dark:text-amber-300 font-bold">{selectedCertificate.gas} Gwei</span>
                </div>
                <div className="pt-2 border-t border-slate-150 dark:border-white/5 space-y-1.5">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1 font-semibold">多维度环境与投入品安全检测数据</span>
                  <div className="bg-white dark:bg-black/40 rounded-lg p-2.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-500/10 leading-relaxed max-h-[85px] overflow-y-auto font-semibold shadow-inner">
                    {selectedCertificate.data}
                  </div>
                </div>
              </div>

              {/* Verified QR design */}
              <div className="flex justify-center items-center gap-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-250/50 dark:border-slate-800 relative z-10 w-4/5 mx-auto shadow-sm">
                <div className="w-20 h-20 bg-white dark:bg-[#0b0c0e] p-1.5 rounded-lg flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-850 shadow-inner">
                  {/* QR dot visual matrix */}
                  <div className="grid grid-cols-5 gap-1 w-full h-full p-2 bg-emerald-950 dark:bg-emerald-950/70 rounded">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "rounded-sm",
                          (i % 3 === 0 || i % 7 === 0 || i === 0 || i === 4 || i === 20 || i === 24) ? "bg-emerald-400" : "bg-transparent"
                        )} 
                      />
                    ))}
                  </div>
                </div>
                <div className="text-slate-800 dark:text-slate-100 text-left">
                  <p className="text-[11px] font-black tracking-tight text-slate-900 dark:text-white leading-tight">100% 链上数字存证印签</p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 leading-normal">消费者扫码直达本系统背书溯源中心，确保证书不被伪造篡改。</p>
                </div>
              </div>

              <div className="flex gap-3 justify-center mt-7 relative z-10 font-sans">
                <button 
                  onClick={() => {
                    addNotification({
                      title: '通行安全证明已下载',
                      message: '防伪溯源电子证书 (PDF) 已成功导出到本地。',
                      type: 'success'
                    });
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-lg shadow-emerald-500/10 active:scale-95"
                >
                  下载防伪证书
                </button>
                <button 
                  onClick={() => setSelectedCertificate(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-300 font-extrabold rounded-xl text-xs transition-all active:scale-95 border border-slate-250/20 dark:border-0"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Traceability Code Modal */}
      <AnimatePresence>
        {showTraceabilityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTraceabilityModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-[#0A0A0A] rounded-[32px] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center">
                    <QrCode size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white">农产品全生命周期追溯档案</h3>
                    <p className="text-xs text-slate-500 font-medium">Scan for Origin Traceability</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isGeneratingTraceCode && traceCodeData && (
                    <button
                      onClick={async () => {
                        const content = document.getElementById('traceability-report-content');
                        if (!content) return;
                        addNotification({ title: '提示', message: '正在生成 PDF 报告，请稍候...', type: 'info' });
                        try {
                          const canvas = await toCanvas(content, { pixelRatio: 2, backgroundColor: '#ffffff' });
                          const imgData = canvas.toDataURL('image/jpeg', 0.95);
                          const pdf = new jsPDF({
                            orientation: 'portrait',
                            unit: 'px',
                            format: [canvas.width, canvas.height]
                          });
                          pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
                          pdf.save(`农业分析报告_${traceCodeData.plotName}.pdf`);
                          addNotification({ title: '成功', message: 'PDF 报告导出成功', type: 'success' });
                        } catch (err) {
                          console.error(err);
                          addNotification({ title: '失败', message: '生成 PDF 失败', type: 'error' });
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors"
                    >
                      <Download size={14} />
                      导出PDF周期报告
                    </button>
                  )}
                  <button
                    onClick={() => setShowTraceabilityModal(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div id="traceability-report-content" className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-white dark:bg-[#0A0A0A]">
                {isGeneratingTraceCode ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-16 h-16 relative mb-6">
                      <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-xl"></div>
                      <div className="absolute inset-0 border-4 border-emerald-500 rounded-xl border-t-transparent animate-spin"></div>
                      <QrCode size={24} className="absolute inset-0 m-auto text-emerald-500 animate-pulse" />
                    </div>
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-2">正在生成溯源数据区块...</h4>
                    <p className="text-sm text-slate-500">正在打包气象、土壤、农事及质检数据</p>
                  </div>
                ) : traceCodeData ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-[#121214] rounded-2xl border border-slate-200 dark:border-white/5">
                      <div className="w-48 h-48 bg-white p-2 rounded-xl shadow-sm mb-4 relative group">
                        <div className="w-full h-full bg-contain bg-center bg-no-repeat opacity-90 group-hover:opacity-100 transition-opacity" style={{ backgroundImage: `url('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TraceID:${traceCodeData.id}')`}}></div>
                        <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-xl pointer-events-none"></div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">全球唯一溯源编码</div>
                        <div className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-black px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10">
                          {traceCodeData.id}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-white/5 pb-2 mb-3">基本信息</h4>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                          <div className="text-slate-500">地块名称</div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">{traceCodeData.plotName}</div>
                          <div className="text-slate-500">作物种类</div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">{traceCodeData.crop}</div>
                          <div className="text-slate-500">种植面积</div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">{traceCodeData.area} 亩</div>
                          <div className="text-slate-500">定植时间</div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">{traceCodeData.plantingDate}</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-white/5 pb-2 mb-3">环境与品质标签</h4>
                        <div className="flex flex-wrap gap-2">
                          {traceCodeData.certifications.map((cert: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-500/20">
                              <CheckCircle2 size={12} />
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-white/5 pb-2 mb-3">病虫害与农事记录</h4>
                        <div className="space-y-3">
                          {traceCodeData.pests.map((pest: any, i: number) => (
                            <div key={i} className="bg-slate-50 dark:bg-[#121214] p-3 rounded-xl border border-slate-100 dark:border-white/5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-red-500 flex items-center gap-1"><AlertTriangle size={12}/> {pest.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{pest.date}</span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400">处理方案: {pest.treatment}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Helper Components ---

interface StatCardProps {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  color?: 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, unit, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: "hover:border-blue-500/30 dark:hover:border-blue-500/30",
    emerald: "hover:border-emerald-500/30 dark:hover:border-emerald-500/30",
    amber: "hover:border-amber-500/30 dark:hover:border-amber-500/30",
    indigo: "hover:border-indigo-500/30 dark:hover:border-indigo-500/30",
    rose: "hover:border-rose-500/30 dark:hover:border-rose-500/30",
  };

  const iconBgClasses = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    indigo: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    rose: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };

  return (
    <div className={cn(
      "bg-white/80 dark:bg-[#050505]/40 backdrop-blur-xl rounded-3xl p-5 card-shadow border border-white/20 dark:border-white/10 flex items-center gap-4 transition-all hover:scale-105 hover:shadow-xl group relative overflow-hidden",
      colorClasses[color]
    )}>
      <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-slate-500/5 dark:bg-white/5 rounded-full blur-2xl group-hover:bg-slate-500/10 dark:group-hover:bg-white/10 transition-colors" />
      <div className={cn(
        "w-12 h-12 rounded-2xl flex items-center justify-center border border-transparent dark:border-white/5 group-hover:scale-110 transition-transform shadow-inner",
        iconBgClasses[color]
      )}>
        {icon}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-black text-slate-800 dark:text-white font-mono tracking-tight">{value}</span>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{unit}</span>
        </div>
      </div>
    </div>
  );
};

interface ControlToggleProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  loading: boolean;
  onClick: () => void;
  onSettingsClick?: () => void;
  desc: string;
  selected?: boolean;
  onSelectToggle?: () => void;
}

const ControlToggle: React.FC<ControlToggleProps> = ({ label, icon, active, loading, onClick, onSettingsClick, desc, selected, onSelectToggle }) => {
  const { t } = useTranslation();
  return (
    <div className={cn(
      "p-6 rounded-[32px] border transition-all flex items-center justify-between group hover:shadow-2xl relative overflow-hidden",
      active 
        ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 dark:border-emerald-500/30" 
        : "border-slate-100 dark:border-white/5 bg-white/80 dark:bg-[#0A0A0A]/40 backdrop-blur-md hover:border-slate-200 dark:hover:border-white/10"
    )}>
      {active && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-0 right-0 p-3"
        >
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
        </motion.div>
      )}
      <div className="flex items-center gap-5">
        {onSelectToggle && (
          <div 
            onClick={onSelectToggle}
            className={cn(
              "w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors",
              selected 
                ? "bg-indigo-500 border-indigo-500 text-white" 
                : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
            )}
          >
            {selected && <Check size={14} strokeWidth={3} />}
          </div>
        )}
        <div className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center transition-all border border-transparent dark:border-white/5 group-hover:scale-110 shadow-inner",
          active 
            ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/30" 
            : "bg-slate-50 dark:bg-[#1A1A1A]/80 text-slate-400 dark:text-slate-500 group-hover:bg-slate-100 dark:group-hover:bg-[#2A2A2A]"
        )}>
          {loading ? <Loader2 className="animate-spin" size={24} /> : icon}
        </div>
        <div>
          <p className={cn("font-black text-base transition-colors tracking-tight", active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-white")}>{label}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="p-3 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <Target size={18} />
          </button>
        )}
        <button 
          onClick={onClick}
          disabled={loading}
          className={cn(
            "px-8 py-3 rounded-2xl text-sm font-black transition-all active:scale-95",
            active 
              ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 hover:bg-emerald-600" 
              : "bg-slate-100 dark:bg-[#1A1A1A] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#2A2A2A]"
          )}
        >
          {active ? t('management.hardware.active') : t('management.hardware.start')}
        </button>
      </div>
    </div>
  );
};

export default FieldManagement;
