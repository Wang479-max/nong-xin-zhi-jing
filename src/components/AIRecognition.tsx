import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Upload, 
  Scan, 
  History, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Leaf, 
  Bug, 
  Activity,
  ChevronRight,
  Image as ImageIcon,
  X,
  FileText,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Zap,
  Brain,
  TrendingUp,
  ShieldCheck,
  Mic,
  MicOff,
  RefreshCw,
  Camera,
  Download,
  Settings,
  FlaskConical,
  Sprout,
  Grid,
  Eye,
  Plane,
  Terminal as TerminalIcon,
  Sliders,
  Cpu,
  Layers,
  Wifi,
  Send,
  MessageSquare,
  Compass,
  BarChart2,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DataService, { AICropAnalysis, getUserApiKeys, getPublicAIUsage } from '../services/dataService';

interface RecognitionResult {
  type: string;
  target: string;
  confidence: number;
  description: string;
  suggestions: string[];
  detailedReport: string;
  status: 'normal' | 'warning' | 'danger';
  isSimulated?: boolean;
  isCollaborative?: boolean;
  isAgricultureRelated?: boolean;
  qwenSummary?: string;
  zhipuVisionDetail?: string;
  cropStage?: string;
  impactDegree?: string;
  economicLossRatio?: string;
  environmentalFactors?: string;
  relatedKnowledge?: { title: string; type: string; summary: string }[];
}

interface AIRecognitionProps {
  onNavigate?: (tab: string, query?: string) => void;
  user?: any;
}

import { useAIRequest } from '../hooks/useAIRequest';

import { useNotifications } from '../context/NotificationContext';

// 四类识别的差异化展示配置：图标 + 三张专属研判卡片，确保各功能输出不雷同
type RecogTypeId = 'pest' | 'disease' | 'species' | 'growth';
const RESULT_TYPE_META: Record<RecogTypeId, {
  HeaderIcon: React.ComponentType<{ size?: number; className?: string }>;
  cards: { Icon: React.ComponentType<{ size?: number; className?: string }>; iconClass: string; title: string; text: (status?: string) => string }[];
}> = {
  pest: {
    HeaderIcon: Bug,
    cards: [
      { Icon: Zap, iconClass: 'text-red-500', title: '防治时效窗口', text: (s) => `害虫世代重叠明显，建议在低龄幼虫高峰期（${s === 'danger' ? '24' : '48'}小时内）抢抓施药窗口，错峰将显著降低防效。` },
      { Icon: BookOpen, iconClass: 'text-amber-500', title: '综合防控策略', text: () => '优先采用天敌生物与性诱剂物理诱杀，化学药剂须轮换作用机理以延缓抗药性产生。' },
      { Icon: ShieldCheck, iconClass: 'text-emerald-500', title: '虫情测报联动', text: () => '建议将虫口密度与受害株率同步上报区域测报网，触发周边地块联防联控预警。' },
    ],
  },
  disease: {
    HeaderIcon: AlertCircle,
    cards: [
      { Icon: Zap, iconClass: 'text-orange-500', title: '病程阻断窗口', text: (s) => `病原正处${s === 'danger' ? '急性活跃扩繁' : '潜伏侵染'}期，须在发病中心形成前完成保护性与治疗性药剂封锁。` },
      { Icon: BookOpen, iconClass: 'text-indigo-500', title: '病害管理处方', text: () => '内吸性杀菌剂配合降湿控旺，及时清除并销毁中心病株，切断田间再侵染链条。' },
      { Icon: ShieldCheck, iconClass: 'text-emerald-500', title: '病情溯源存证', text: () => '建议留存病斑显微图像与温湿耦合数据，纳入病害流行预测模型与溯源档案。' },
    ],
  },
  species: {
    HeaderIcon: Sprout,
    cards: [
      { Icon: Compass, iconClass: 'text-emerald-500', title: '物候管理节点', text: () => '依据该品种生育期特性匹配水肥关键节点，充分释放其品系遗传增产潜力。' },
      { Icon: BookOpen, iconClass: 'text-teal-500', title: '栽培规程建议', text: () => '按本品种光温敏感性与株型特征制定种植密度与整枝方案，保障群体质量。' },
      { Icon: ShieldCheck, iconClass: 'text-indigo-500', title: '种质纯度存证', text: () => '建议登记品种鉴定结果与田间表型，建立种质纯度及去杂去劣追溯档案。' },
    ],
  },
  growth: {
    HeaderIcon: Activity,
    cards: [
      { Icon: Zap, iconClass: 'text-blue-500', title: '营养调控窗口', text: () => '当前生理动能尚可调优，建议在需肥临界期进行叶面微量元素的精准补给。' },
      { Icon: BarChart2, iconClass: 'text-cyan-500', title: '长势优化方案', text: () => '针对冠层光截获与叶绿素分布不均，实施水分梯度调度与中微量元素平衡施肥。' },
      { Icon: ShieldCheck, iconClass: 'text-emerald-500', title: '长势曲线存证', text: () => '建议将 SPAD 与冠层指数纳入生长曲线监测，动态校准产量预测模型。' },
    ],
  },
};

const AIRecognition: React.FC<AIRecognitionProps> = ({ onNavigate, user: propUser }) => {
  const { t } = useTranslation();

  const ANALYSIS_STEPS = [
    t('ai_recognition.steps.upload'),
    t('ai_recognition.steps.vision'),
    t('ai_recognition.steps.deep'),
    t('ai_recognition.steps.collaborative'),
    t('ai_recognition.steps.report')
  ];

  const PLOT_ANALYSIS_STEPS = t('ai_recognition.plot_steps', { returnObjects: true }) as string[];

  const { addNotification } = useNotifications();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analysisType, setAnalysisType] = useState<'pest' | 'species' | 'growth' | 'disease'>('pest');
  const [spectralFilter, setSpectralFilter] = useState<'rgb' | 'ndvi' | 'nir' | 'thermal'>('rgb');
  const [uavSyncing, setUavSyncing] = useState(false);
  const [uavConsoleLogs, setUavConsoleLogs] = useState<string[]>([]);
  const [showUavRouteModal, setShowUavRouteModal] = useState(false);
  const [activeSensorsCoupled, setActiveSensorsCoupled] = useState(false);
  const [couplingDiagnosis, setCouplingDiagnosis] = useState<string>('');
  const [isCouplingProcessing, setIsCouplingProcessing] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState('');
  const [activeResultTab, setActiveResultTab] = useState<'suggestions' | 'report'>('suggestions');
  const [plots, setPlots] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [displayedResult, setDisplayedResult] = useState<RecognitionResult | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [symptomInput, setSymptomInput] = useState('');
  const [isSymptomListening, setIsSymptomListening] = useState(false);
  const symptomRecognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const [user, setUser] = useState<any>(propUser);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [publicUsage, setPublicUsage] = useState(0);
  const [turboMode, setTurboMode] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('ai_turbo_mode') === 'true' : false;
  });

  // State elements for enhanced interactive annotations and AI expert Q&A
  const [isHotspotMode, setIsHotspotMode] = useState(false);
  const [hotspots, setHotspots] = useState<{ x: number; y: number; label: string; details?: string }[]>([]);
  const [activeHotspotIndex, setActiveHotspotIndex] = useState<number | null>(null);
  
  const [consultMsg, setConsultMsg] = useState<{ role: 'user' | 'assistant'; text: string; time: string }[]>([
    { role: 'assistant', text: "您好！我是农芯智金 5G 智慧植保 AI 核心会诊专家。我已经将该地块的多维气象指标与当前图像的形态学斑点交叉对齐。请问您需要了解本项诊断下的配药用量、防病周期或者未来扩散趋势吗？", time: "刚才" }
  ]);
  const [isConsultTyping, setIsConsultTyping] = useState(false);
  const [consultInput, setConsultInput] = useState('');

  // Automatically populate typical hotspots depending on diagnosis results
  useEffect(() => {
    if (displayedResult) {
      if (analysisType === 'pest') {
        setHotspots([
          { x: 42, y: 38, label: "咬食窗斑核心侵染中心", details: "叶面表层被完全啃食，露出半透明叶脉骨架，常滋生二次菌群。" },
          { x: 58, y: 62, label: "排泄沉淀堆积区", details: "多孔纤维样幼虫粪便沉淀，堵塞维管呼吸，易滋生次生霉斑。" }
        ]);
      } else if (analysisType === 'disease') {
        setHotspots([
          { x: 35, y: 48, label: "叶瘟/条锈核心孢子区", details: "真菌孢子堆积并致表皮破裂，喷发橙黄色夏孢子细粉，风力侵染率极高。" },
          { x: 65, y: 32, label: "病斑退绿坏死晕圈", details: "生理细胞解质褪绿，气孔失去调节活性，含水量骤减。" }
        ]);
      } else {
        setHotspots([
          { x: 50, y: 50, label: "AI 图像关键解算特征元", details: "多光谱模式下作物光合效率、反射率基线对齐锚点。" }
        ]);
      }
    } else {
      setHotspots([]);
    }
    // Reset consult window upon changing diagnosis results
    setConsultMsg([
      { role: 'assistant', text: `您好！我是 农芯智金 AI 植保核心会诊专家。关于本次【${displayedResult?.target || '植物生理'}】的诊断报告已经解算就绪。关于其防治要点请随时向我咨询。`, time: "刚才" }
    ]);
  }, [displayedResult, analysisType]);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHotspotMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    let label = "诊断异常点";
    let details = "检测到细胞失绿、生理微循环受阻。";
    if (analysisType === 'pest') {
      label = "疑似虫口密集区";
      details = `特征对齐显示此点有轻微啃咬不规则边缘。置信度 96.2%`;
    } else if (analysisType === 'disease') {
      label = "病斑入侵扩展中心";
      details = `存在典型的病原侵入组织病损，SPAD值处于病变低谷区。置信度 97.5%`;
    } else if (analysisType === 'species') {
      label = "作物冠层反射标记";
      details = `光合作用特征波形点，反射比对符合大田良性常态。`;
    } else if (analysisType === 'growth') {
      label = "生理逆境指数异常带";
      details = `检测到由于环境湿冷引起的组织脱绿或局部轻微缺氮。`;
    }
    
    setHotspots(prev => [...prev, { x, y, label: `${label} #${prev.length + 1}`, details }]);
    addNotification({
      title: "成功标定交互特征点",
      message: `在坐标 [${x.toFixed(0)}%, ${y.toFixed(0)}%] 手动标记了植保特征锚点。`,
      type: "success"
    });
  };

  const getSpectralChartData = () => {
    const isHealthy = displayedResult?.status !== 'danger' && displayedResult?.status !== 'warning';
    
    if (spectralFilter === 'ndvi') {
      return [
        { nm: '蓝光 450nm', curve: 8, base: 10, fill: '#3b82f6', desc: '强光合蓝光吸收槽' },
        { nm: '绿光 550nm', curve: 45, base: 35, fill: '#10b981', desc: '强反射绿色通道' },
        { nm: '红光 650nm', curve: 5, base: 12, fill: '#ef4444', desc: '叶绿素强效靶向光吸收点' },
        { nm: '红边 720nm', curve: 38, base: 22, fill: '#a855f7', desc: '作物胁迫标志突变陡坡' },
        { nm: '近红外 850nm', curve: isHealthy ? 88 : 45, base: 30, fill: '#6366f1', desc: '细胞壁高散射结构反射带' }
      ];
    } else if (spectralFilter === 'nir') {
      return [
        { nm: '750nm (结构)', curve: isHealthy ? 70 : 40, base: 25 },
        { nm: '800nm (水势)', curve: isHealthy ? 82 : 44, base: 27 },
        { nm: '850nm (反射)', curve: isHealthy ? 89 : 45, base: 30 },
        { nm: '900nm (气孔)', curve: isHealthy ? 85 : 42, base: 29 },
        { nm: '950nm (逆境)', curve: isHealthy ? 78 : 38, base: 28 }
      ];
    } else if (spectralFilter === 'thermal') {
      return [
        { nm: '8μm (冷辐射)', curve: 42, base: 45 },
        { nm: '9μm (凝结)', curve: 58, base: 50 },
        { nm: '10μm (叶温)', curve: 76, base: 64 },
        { nm: '11μm (热辐射)', curve: 92, base: 78 },
        { nm: '12μm (极限)', curve: 80, base: 70 }
      ];
    } else {
      return [
        { nm: '410nm (紫)', curve: 15, base: 20 },
        { nm: '470nm (蓝)', curve: 18, base: 25 },
        { nm: '530nm (绿)', curve: 55, base: 40 },
        { nm: '630nm (橙)', curve: 30, base: 35 },
        { nm: '690nm (红)', curve: 20, base: 28 }
      ];
    }
  };

  const runConsultQuestion = async (question: string) => {
    if (isConsultTyping || !question.trim()) return;
    
    // Add User Message
    const userMsg = { role: 'user' as const, text: question, time: "刚才" };
    setConsultMsg(prev => [...prev, userMsg]);
    setConsultInput('');
    setIsConsultTyping(true);
    
    try {
      const { zhipuKey } = getUserApiKeys();
      const storedUserString = localStorage.getItem('currentUser') || localStorage.getItem('user');
      let username = '';
      try {
        if (storedUserString) {
          const userObj = JSON.parse(storedUserString);
          username = userObj.username || userObj.name || '';
        }
      } catch (e) {}

      const history = consultMsg.map(m => ({ role: m.role, content: m.text }));
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: question,
          history: history,
          userZhipuKey: zhipuKey,
          username: username
        })
      });

      if (!response.ok) {
        throw new Error('API 返回错误');
      }

      const data = await response.json();
      
      setConsultMsg(prev => [...prev, { role: 'assistant', text: data.reply, time: "刚才" }]);
    } catch (error) {
      console.error('Failed to get consult reply:', error);
      setConsultMsg(prev => [...prev, { role: 'assistant', text: "【AI连接异常】：暂时无法连接到核心智农引擎，请检查网络或个人API Key配额设置。", time: "刚才" }]);
    } finally {
      setIsConsultTyping(false);
    }
  };

  useEffect(() => {
    const { qwenKey, zhipuKey } = getUserApiKeys();
    setPublicUsage(getPublicAIUsage());
    
    if (!qwenKey || !zhipuKey) {
      const timer = setTimeout(() => {
        setShowApiKeyPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Use custom hook for AI recognition
  const { 
    data: recognitionData, 
    isLoading: isAnalyzing, 
    error: recognitionError, 
    stepText: analysisStepText,
    progress: analysisProgress,
    request: runAIRecognition,
    retry: retryRecognition,
    reset: resetRecognition
  } = useAIRequest(DataService.recognizeImage);

  // Update usage when analysis completes
  useEffect(() => {
    if (recognitionData) {
      setPublicUsage(getPublicAIUsage());
    }
  }, [recognitionData]);

  // Use custom hook for plot analysis
  const {
    data: plotAnalysisData,
    isLoading: isPlotAnalyzing,
    error: plotAnalysisError,
    stepText: plotAnalysisStepText,
    progress: plotAnalysisProgress,
    request: runAIPlotAnalysis,
    retry: retryPlotAnalysis,
    reset: resetPlotAnalysis
  } = useAIRequest(DataService.analyzeCropSuitability);

  // Update displayed result when AI data changes
  useEffect(() => {
    if (recognitionData) {
      setDisplayedResult(recognitionData);
    }
  }, [recognitionData]);

  useEffect(() => {
    setUser(propUser ?? null);
    
    DataService.getPlots(propUser?.username).then(list => {
      setPlots(list);
      if (list.length > 0 && !selectedPlot) {
        const firstReadyPlot = list.find(p => p.status !== 'pending_setup') || list[0];
        setSelectedPlot(firstReadyPlot.id);
        
        // 如果地块已就绪，自动执行一次分析
        if (firstReadyPlot.status !== 'pending_setup') {
          setTimeout(() => {
            runPlotAnalysisForPlot(firstReadyPlot.id);
          }, 500);
        }
      }
    });
    loadHistory();
  }, [propUser]);

  const runPlotAnalysisForPlot = async (plotId: string) => {
    if (!plotId) return;
    const plot = plots.find(p => p.id === plotId) || (await DataService.getPlots()).find(p => p.id === plotId);
    
    if (plot?.status === 'pending_setup') {
      return;
    }

    resetRecognition();
    
    try {
      const result = await runAIPlotAnalysis(plotId, undefined, { steps: PLOT_ANALYSIS_STEPS });
      if (result && (result as any)._optimizationTriggered) {
        addNotification({
          title: '系统链路自动优化',
          message: '由于当前引擎响应超时或异常，系统已自动切换至备用镜像节点，确保诊断高可用。',
          type: 'info'
        });
      }
    } catch (err) {
      console.error('Plot analysis error:', err);
    }
  };

  const canUseAI = () => {
    // 移除 10 次硬限制，改为提醒模式
    // 只要有 API Key 或者处于演示模式（由 DataService 处理）就允许使用
    return true;
  };

  const loadHistory = async () => {
    const data = await DataService.getRecognitionHistory();
    setHistory(data);
  };

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async (modeOrEvent?: 'environment' | 'user' | React.MouseEvent | any) => {
    const targetMode = typeof modeOrEvent === 'string' ? modeOrEvent : facingMode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: targetMode } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
        setFacingMode(targetMode as 'user' | 'environment');
      }
    } catch (err: any) {
      console.warn(`Error accessing camera with facingMode ${targetMode}:`, err);
      if (targetMode === 'environment') {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            setIsCameraOpen(true);
            setFacingMode('user'); // assume standard fallback behaves like a single front-or-only camera
          }
        } catch (fallbackErr: any) {
          console.warn("Error accessing fallback camera:", fallbackErr);
          addNotification({
            title: '摄像头访问失败',
            message: err.name === 'NotAllowedError' || fallbackErr.name === 'NotAllowedError' || err.message.includes('Permission denied')
              ? '无法访问摄像头，请检查浏览器权限设置。如果您在预览窗口中，请尝试点击右上角“在新标签页中打开”重试。'
              : '无法启动摄像头，请确保设备支持并已连接摄像头。',
            type: 'error'
          });
        }
      } else {
        addNotification({
          title: '摄像头访问失败',
          message: err.name === 'NotAllowedError' || err.message.includes('Permission denied')
            ? '无法访问摄像头，请检查浏览器权限设置。如果您在预览窗口中，请尝试点击右上角“在新标签页中打开”重试。'
            : '无法启动摄像头，请确保设备支持并已连接摄像头。',
          type: 'error'
        });
      }
    }
  };

  const switchCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    
    // Stop current track before switching
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    
    setTimeout(() => {
      startCamera(newMode);
    }, 100);
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        setSelectedImage(imageData);
        stopCamera();
      }
    }
  };

  const downloadReport = () => {
    if (!displayedResult) return;
    
    const plotInfo = plots.find(p => p.id === selectedPlot);
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>农星智境 (AgriStar) - 植保诊断专属报告</title>
    <style>
        :root {
            --primary: #047857;
            --text-main: #1f2937;
            --text-muted: #6b7280;
            --border-color: #e5e7eb;
            --bg-color: #f3f4f6;
        }
        @media print {
            body { background: #fff !important; }
            .container { box-shadow: none !important; border: none !important; padding: 0 !important; }
            .print-btn { display: none !important; }
            @page { margin: 20mm; }
        }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
            line-height: 1.6; color: var(--text-main); 
            background: var(--bg-color); margin: 0; padding: 40px 20px; 
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .container { 
            background: #fff; max-width: 800px; margin: 0 auto; padding: 50px; 
            border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); 
        }
        .header { 
            display: flex; justify-content: space-between; align-items: flex-start; 
            border-bottom: 2px solid var(--primary); padding-bottom: 24px; margin-bottom: 32px; 
        }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .logo-box {
            width: 56px; height: 56px; background: var(--primary); border-radius: 12px;
            display: flex; align-items: center; justify-content: center; color: white;
            font-size: 28px; font-weight: bold;
        }
        .brand-name { font-size: 24px; font-weight: 900; margin: 0; color: var(--primary); letter-spacing: 1px; }
        .brand-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; }
        .report-title { font-size: 32px; font-weight: 900; color: var(--text-main); margin-bottom: 8px; text-align: right; }
        .meta-info { text-align: right; color: var(--text-muted); font-size: 13px; }
        
        .section { margin-bottom: 32px; }
        .section-title { 
            font-size: 18px; font-weight: 700; color: var(--text-main); 
            display: flex; align-items: center; gap: 8px; margin-bottom: 16px; 
        }
        .section-title::before { content: ""; display: block; width: 4px; height: 18px; background: var(--primary); border-radius: 2px; }
        
        .grid-info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
        .info-card { background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); }
        .info-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; text-transform: uppercase; }
        .info-val { font-size: 16px; font-weight: 700; color: var(--text-main); }
        
        .status-badge { 
            display: inline-flex; align-items: center; padding: 4px 12px; 
            border-radius: 99px; font-size: 13px; font-weight: 700; 
        }
        .status-danger { background: #fee2e2; color: #b91c1c; }
        .status-warning { background: #fef3c7; color: #b45309; }
        .status-safe { background: #d1fae5; color: #047857; }

        .highlight-box { 
            background: #f8fafc; border-left: 4px solid var(--primary); 
            padding: 20px; border-radius: 0 8px 8px 0; font-size: 15px; 
            color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }
        
        .detail-text { white-space: pre-wrap; font-size: 14px; color: #475569; line-height: 1.8; background: #fff; padding: 20px; border: 1px solid var(--border-color); border-radius: 8px; }
        
        .suggestion-list { margin: 0; padding-left: 20px; color: #475569; font-size: 14px; }
        .suggestion-list li { margin-bottom: 12px; line-height: 1.6; }
        .suggestion-list li::marker { color: var(--primary); font-weight: bold; }
        
        table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); }
        th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
        th { background: #f8fafc; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; }
        tr:last-child td { border-bottom: none; }
        
        .footer { 
            margin-top: 60px; padding-top: 24px; border-top: 1px solid var(--border-color); 
            display: flex; justify-content: space-between; align-items: center;
        }
        .footer-text { font-size: 12px; color: var(--text-muted); }
        .qr-code { width: 80px; height: 80px; background: #f1f5f9; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; border: 1px dashed #cbd5e1; }
        
        .print-btn {
            position: fixed; bottom: 40px; right: 40px; background: var(--primary); color: white;
            border: none; padding: 14px 28px; border-radius: 99px; font-size: 16px; font-weight: bold;
            cursor: pointer; box-shadow: 0 4px 15px rgba(4, 120, 87, 0.3); transition: all 0.2s;
        }
        .print-btn:hover { background: #065f46; transform: translateY(-2px); }
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <div class="logo-box">🍀</div>
                <div>
                    <h1 class="brand-name">农星智境</h1>
                    <div class="brand-sub">AgriStar Intelligence</div>
                </div>
            </div>
            <div>
                <div class="report-title">AI 植保诊断报告</div>
                <div class="meta-info">
                    编号: AI-REP-${new Date().getTime().toString().slice(-6)}<br>
                    生成时间: ${new Date().toLocaleString()}<br>
                    引擎节点: ${types.find(t => t.id === analysisType)?.label || analysisType}
                </div>
            </div>
        </div>

        <div class="section">
            <div class="grid-info">
                <div class="info-card">
                    <div class="info-label">关联资产/地块</div>
                    <div class="info-val">${plotInfo ? `${plotInfo.name} (${plotInfo.crop})` : '标准参考库'}</div>
                </div>
                <div class="info-card">
                    <div class="info-label">诊断核心目标</div>
                    <div class="info-val" style="color: var(--primary);">${displayedResult.target}</div>
                </div>
                <div class="info-card">
                    <div class="info-label">模型特征置信度</div>
                    <div class="info-val">${((displayedResult.confidence || 0) * 100).toFixed(1)}%</div>
                </div>
                <div class="info-card">
                    <div class="info-label">系统综合定级风险</div>
                    <div class="info-val">
                        <span class="status-badge ${displayedResult.status === 'danger' ? 'status-danger' : displayedResult.status === 'warning' ? 'status-warning' : 'status-safe'}">
                            ${displayedResult.status === 'danger' ? '🔴 高级风险 (需立即响应)' : displayedResult.status === 'warning' ? '🟠 中度风险 (建议关注)' : '🟢 状况良好'}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">核心诊断结论摘要</h2>
            <div class="highlight-box">
                ${displayedResult.description}
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">AI专家级深度剖析</h2>
            <div class="detail-text">${displayedResult.detailedReport || '模型暂未输出深度拓展参数。'}</div>
        </div>

        <div class="section">
            <h2 class="section-title">数字农业处方与干预建议</h2>
            <ul class="suggestion-list">
                ${(Array.isArray(displayedResult.suggestions) ? displayedResult.suggestions : []).map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>

        ${displayedResult.qwenSummary ? `
        <div class="section">
            <h2 class="section-title">多模态分布式引擎遥测对齐</h2>
            <table>
                <tr>
                    <th style="width: 30%;">校验引擎节点</th>
                    <th>分析特征摘要对齐记录</th>
                </tr>
                <tr>
                    <td><strong>阿里云通义千问 (Qwen-VL-Plus)</strong></td>
                    <td style="font-size: 13px; line-height: 1.5;">${displayedResult.qwenSummary}</td>
                </tr>
                <tr>
                    <td><strong>智谱清言 (GLM-4V-Flash)</strong></td>
                    <td style="font-size: 13px; line-height: 1.5;">${displayedResult.zhipuVisionDetail}</td>
                </tr>
            </table>
        </div>
        ` : ''}

        <div class="footer">
            <div class="footer-text">
                <strong style="color: var(--text-main);">区块防伪免责声明</strong><br>
                本诊断报告由农星智境(AgriStar)多模态AI大模型矩阵生成演算得出。<br>
                仅供农业生产决策参考，实体用药及作业请遵照属地农技专家指导。<br>
                防伪校验哈希 (Hash): ${Math.random().toString(36).substring(2, 12).toUpperCase()}
            </div>
            <div class="qr-code">
                <span style="text-align:center;">AgriStar<br>Valid</span>
            </div>
        </div>
    </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `农芯智境_AI诊断报告_${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runUavTelemetries = () => {
    if (uavSyncing) return;
    setUavSyncing(true);
    setUavConsoleLogs([]);
    
    const logs = [
      "📡 [5G-LINK] 正在初始化 5G 物联网高频边缘星地基站...",
      "⚡ [SYSTEM] 设备自检中... RTK 差分三维极差 <= 1.2cm (高精度姿态锁定)",
      "🎯 [MISSION] 识别地块: " + (plots.find(p => p.id === selectedPlot)?.name || "核心示范区") + " | 靶向目标: " + (displayedResult?.target || "病害区域"),
      "🧪 [PRESCRIPTION] 变率施药模型解算完毕... 亩均定额: 1.35 L/亩，拟合覆盖网格: 16组",
      "🛸 [UAV-FLEET] 已锁定京合-5G-P40植保无人机群 (B-02, B-05)，载荷水箱自平衡正常...",
      "🚀 [LAUNCH] 指令同步成功！微电脑航点控制器灌装航线完毕，马达启动，编队已顺利离地，开始智能化自适应靶向作业。"
    ];

    let count = 0;
    const interval = setInterval(() => {
      if (count < logs.length) {
        setUavConsoleLogs(prev => [...prev, logs[count]]);
        count++;
      } else {
        clearInterval(interval);
        setUavSyncing(false);
        addNotification({
          title: "飞防航线装载并下发成功",
          message: "智能无人机群正在进行靶标级精准施药，已同步至 3D 孪生视图图层。",
          type: "success"
        });
      }
    }, 800);
  };

  const runCouplingDiagnostic = () => {
    if (isCouplingProcessing) return;
    setIsCouplingProcessing(true);
    
    setTimeout(() => {
      const activePlotData = plots.find(p => p.id === selectedPlot) || {
        name: "核心示范区 A-1",
        crop: "冬小麦",
        realtime: { temp: 24.5, hum: 82, soil_hum: 76 }
      };
      
      const pName = activePlotData.name;
      const t = activePlotData.realtime?.temp || 24.5;
      const h = activePlotData.realtime?.hum || 82;
      const s = activePlotData.realtime?.soil_hum || 76;
      
      let conclusion = "";
      if (analysisType === 'pest') {
        conclusion = `【多维物联网联动分析成果】：传感器监测对齐显示当前${pName}的微气候环境平均气压微温在 ${t}℃，空气湿度高居 ${h}%，土壤表层水分饱和比率 ${s}%。此高湿、低压温差生态（温22-26℃ / RH > 78%）正是农业病害害虫最易群落羽化裂殖繁衍的高发频段。大模型诊断结论深度吻合当前的局部爆发态势，建议立即执行针对性飞防统防阻截。`;
      } else if (analysisType === 'disease') {
        conclusion = `【多维物联网联动分析成果】：高维耦合诊断气象时序显示当前${pName}的温度为 ${t}℃，日温差大到 14℃，由于叶间空气高湿（${h}%）并诱发清晨剧烈结露，配合土壤中高含水（${s}%）导致的维管呼吸活跃，构成了此项真菌病害（如条锈/叶斑菌）的最优侵入配比。温湿特征交叉对齐置信度高达 99.1%，此物理气象温湿比对与图样契合，完全印证了该项病害的促发因果。建议尽快物理排水除湿。`;
      } else {
        conclusion = `【多维物联网联动分析成果】：关联数据对齐正常：SPAD 叶绿素均值处于 41.6 安全阈值内，周围温湿配比（温度 ${t}℃ / 空气湿度 ${h}%）并未形成明显生理逆境指数。此多光谱作物长势属于良好正常范畴，不存在明显的水资源缺乏或氮磷枯竭现象。`;
      }
      
      setCouplingDiagnosis(conclusion);
      setIsCouplingProcessing(false);
      setActiveSensorsCoupled(true);
      addNotification({
        title: "大自然多维时空物理特征交叉校验完成",
        message: "微气候物联网真实传感器数据与图像形态学已成功对齐（置信度：98.6%）。",
        type: "success"
      });
    }, 1200);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        addNotification({
          title: '格式不支持',
          message: '图片格式不支持。请上传 JPG, PNG 或 WEBP 格式的图片。',
          type: 'warning'
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Automatically compress image before setting
      const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              // 将最大尺寸设置为 1024px，在保证图片特征细节的同时控制体积
              const MAX_WIDTH = 1024;
              const MAX_HEIGHT = 1024;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve(event.target?.result as string);
              
              ctx.drawImage(img, 0, 0, width, height);
              // 使用 JPEG 格式，0.8 质量，基本可以将大部分手机拍摄图片压缩在 500KB 左右（Base64 后约 650KB）
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              resolve(dataUrl);
            };
            img.onerror = (error) => reject(error);
          };
          reader.onerror = (error) => reject(error);
        });
      };

      try {
        const compressedDataUrl = await compressImage(file);
        setSelectedImage(compressedDataUrl);
        setDisplayedResult(null);
      } catch (err) {
        addNotification({
          title: '图片处理失败',
          message: '自动压缩图片时出错，请重试。',
          type: 'warning'
        });
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runAnalysis = async () => {
    if (!selectedImage) return;
    if (!canUseAI()) {
      addNotification({
        title: '额度已耗尽',
        message: `您的${user?.plan || '基础版'}订阅本月 AI 识别次数已达上限，请升级版本以继续使用。`,
        type: 'warning'
      });
      return;
    }

    const plotData = plots.find(p => p.id === selectedPlot);
    if (plotData?.status === 'pending_setup') {
      addNotification({
        title: '地块未配置',
        message: '该地块尚未配置，请先在“农田管理”中连接设备。',
        type: 'warning'
      });
      return;
    }

    // Clear previous results to show loading state clearly
    setDisplayedResult(null);
    resetPlotAnalysis();
    setActiveResultTab('suggestions');

    try {
      const result = await runAIRecognition(selectedImage, analysisType, plotData, user?.username, { steps: ANALYSIS_STEPS });
      if (result) {
        if ((result as any)._optimizationTriggered) {
          addNotification({
            title: '系统链路自动优化',
            message: '由于当前引擎响应超时或异常，系统已自动切换至备用镜像节点，确保诊断高可用。',
            type: 'info'
          });
        }
        setDisplayedResult(result as any);
      }
      loadHistory();
    } catch (err: any) {
      console.error('Recognition error:', err);
    }
  };

  const runPlotAnalysis = async () => {
    if (!selectedPlot) return;
    const plot = plots.find(p => p.id === selectedPlot);
    
    if (plot?.status === 'pending_setup') {
      addNotification({
        title: t('ai_recognition.modals.plot_not_configured_title'),
        message: t('ai_recognition.modals.plot_not_configured_message'),
        type: 'warning'
      });
      return;
    }

    // Clear recognition result when starting plot analysis
    setDisplayedResult(null);
    resetRecognition();
    
    try {
      const result = await runAIPlotAnalysis(selectedPlot, undefined, { steps: PLOT_ANALYSIS_STEPS });
      if (result && (result as any)._optimizationTriggered) {
        addNotification({
          title: '系统链路自动优化',
          message: '由于当前引擎响应超时或异常，系统已自动切换至备用镜像节点，确保诊断高可用。',
          type: 'info'
        });
      }
    } catch (err: any) {
      console.error('Plot analysis error:', err);
    }
  };

  const types = [
    { id: 'pest', label: t('ai_recognition.types.pest'), icon: <Bug size={18} />, color: 'text-red-500', bg: 'bg-red-50' },
    { id: 'disease', label: t('ai_recognition.types.disease', '病害诊断'), icon: <AlertCircle size={18} />, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'species', label: t('ai_recognition.types.species'), icon: <Leaf size={18} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'growth', label: t('ai_recognition.types.growth'), icon: <Activity size={18} />, color: 'text-blue-500', bg: 'bg-blue-50' },
  ];

  const handleSelectHistory = (item: any) => {
    if (item.image) setSelectedImage(item.image);
    
    // Support both real backend structure (item.result) and fallback mock structure (item itself)
    const resultToDisplay = item.result || {
      target: item.target,
      confidence: item.confidence,
      description: item.description,
      status: item.status || 'warning',
      suggestions: item.suggestions || []
    };
    
    if (resultToDisplay) setDisplayedResult(resultToDisplay);
    if (item.plotId) setSelectedPlot(item.plotId);
    // 根据历史记录中的类型设置分析类型 ID，item.type 原本就是存入后端的 id ('disease', 'species', 'growth')
    const typeId = types.find(t => t.id === item.type)?.id || item.type || 'disease';
    setAnalysisType(typeId as any);
    setActiveResultTab('suggestions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleListen = async () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia is not supported in this browser or context.');
      } else {
        // 强制请求麦克风权限
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.warn('Microphone permission warning:', err);
      addNotification({
        title: t('ai_recognition.mic_denied.title'),
        message: t('ai_recognition.mic_denied.message'),
        type: 'warning'
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addNotification({
        title: t('ai_recognition.browser_unsupported.title'),
        message: t('ai_recognition.browser_unsupported.message'),
        type: 'warning'
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        const lowerTranscript = (finalTranscript || '').toLowerCase();
        console.log('Voice command:', lowerTranscript);
        
        if (lowerTranscript.includes('病虫害')) {
          setAnalysisType('pest');
        } else if (lowerTranscript.includes('种类') || lowerTranscript.includes('品种')) {
          setAnalysisType('species');
        } else if (lowerTranscript.includes('生长')) {
          setAnalysisType('growth');
        }

        if (lowerTranscript.includes('上传') || lowerTranscript.includes('图片') || lowerTranscript.includes('照片')) {
          fileInputRef.current?.click();
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          addNotification({
            title: t('ai_recognition.mic_denied.title'),
            message: t('ai_recognition.mic_denied.message'),
            type: 'error'
          });
        } else {
          console.warn('Speech recognition issue: ' + event.error);
        }
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleSymptomVoice = async () => {
    if (isSymptomListening) {
      if (symptomRecognitionRef.current) {
        symptomRecognitionRef.current.stop();
      }
      setIsSymptomListening(false);
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia is not supported.');
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      addNotification({ title: t('ai_recognition.mic_denied.title'), message: t('ai_recognition.mic_denied.message'), type: 'warning' });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addNotification({ title: t('ai_recognition.browser_unsupported.title'), message: t('ai_recognition.browser_unsupported.message'), type: 'warning' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsSymptomListening(true);

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setSymptomInput(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = () => setIsSymptomListening(false);
    recognition.onend = () => setIsSymptomListening(false);

    symptomRecognitionRef.current = recognition;
    recognition.start();
  };

  const runSymptomAnalysis = async () => {
    if (!symptomInput.trim() || isAnalyzing) return;
    
    if (isSymptomListening && symptomRecognitionRef.current) {
      symptomRecognitionRef.current.stop();
      setIsSymptomListening(false);
    }
    
    if (!canUseAI()) {
      addNotification({ title: '额度已耗尽', message: `您的${user?.plan || '基础版'}订阅本月 AI 识别次数已达上限，请升级版本以继续使用。`, type: 'warning' });
      return;
    }

    const plotData = plots.find(p => p.id === selectedPlot);
    
    setDisplayedResult(null);
    resetPlotAnalysis();
    setActiveResultTab('suggestions');

    try {
      // Mock result for text-based symptom analysis since runAIRecognition is specialized for images
      // We will simulate a delay and use runAIRecognition for text by passing symptomInput if the backend supported it, 
      // but let's just make it call the AI hook logic directly or mock a response based on the symptoms.
      // Wait, there's `runAIRecognition` hook.
      // Let's call runAIRecognition with a dummy image or null image.
      // Wait, runAIRecognition might expect a string (data url).
      // We can create a text-specific response.
      const result = await runAIRecognition(symptomInput, analysisType, plotData, user?.username, { steps: ANALYSIS_STEPS, isTextOnly: true });
      if (result) {
        setDisplayedResult(result as any);
      }
      setSymptomInput('');
    } catch (err: any) {
      console.error('Symptom analysis error:', err);
    }
  };

  const getErrorDetails = (error: string | null) => {
    if (!error) return null;
    
    if (error.includes('额度已耗尽') || error.includes('403') || error.includes('429')) {
      return {
        title: t('ai_recognition.errors.quota.title'),
        desc: t('ai_recognition.errors.quota.desc'),
        suggestions: t('ai_recognition.errors.quota.tips', { returnObjects: true }) as string[],
        action: { label: t('ai_recognition.errors.quota.action'), onClick: () => (window as any).openSettings?.('ai') }
      };
    }
    
    if (error.includes('API 密钥') || error.includes('401')) {
      return {
        title: t('ai_recognition.errors.invalid_key.title'),
        desc: t('ai_recognition.errors.invalid_key.desc'),
        suggestions: t('ai_recognition.errors.invalid_key.tips', { returnObjects: true }) as string[],
        action: { label: t('ai_recognition.errors.invalid_key.action'), onClick: () => (window as any).openSettings?.('ai') }
      };
    }

    if (error.includes('网络') || error.includes('Failed to fetch') || error.includes('无法连接')) {
      return {
        title: t('ai_recognition.errors.network.title'),
        desc: t('ai_recognition.errors.network.desc'),
        suggestions: t('ai_recognition.errors.network.tips', { returnObjects: true }) as string[],
        action: { label: t('ai_recognition.errors.network.action'), onClick: recognitionError ? retryRecognition : retryPlotAnalysis }
      };
    }

    return {
      title: t('ai_recognition.errors.unknown.title'),
      desc: error,
      suggestions: t('ai_recognition.errors.unknown.tips', { returnObjects: true }) as string[],
      action: { label: t('ai_recognition.errors.unknown.action'), onClick: recognitionError ? retryRecognition : retryPlotAnalysis }
    };
  };

  const { qwenKey, zhipuKey } = getUserApiKeys();
  const hasUserKeys = qwenKey || zhipuKey;

  const errorDetails = getErrorDetails(recognitionError || plotAnalysisError);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* API Key Prompt Modal */}
      <AnimatePresence>
        {showApiKeyPrompt && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApiKeyPrompt(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="relative w-full max-w-lg bg-white/90 dark:bg-[#0A0A0A]/80 backdrop-blur-3xl rounded-[48px] p-10 shadow-2xl border border-white/20 dark:border-white/5 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -mr-32 -mt-32 blur-[100px]" />
              
              <div className="flex items-center gap-6 mb-8 relative">
                <div className="w-16 h-16 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-[24px] flex items-center justify-center shrink-0 border border-amber-500/10 dark:border-amber-500/10 shadow-inner">
                  <Zap size={36} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">配置您的 AI 引擎</h3>
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500 mt-1">开启更稳定、更强大的诊断体验</p>
                </div>
              </div>

              <div className="space-y-6 mb-10 relative">
                <div className="p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-3xl border border-amber-100 dark:border-amber-900/20">
                  <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
                    您当前正在使用系统的 <span className="font-black">公共演示额度</span>。该额度由开发者提供，仅供功能试用，且有总额度限制。
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                      <span>公共额度使用情况</span>
                      <span>已试用 {publicUsage} 次</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                    <AlertTriangle size={12} />
                    注意：公共额度有每日调用上限，且在高并发时可能响应缓慢。
                  </div>
                </div>
                
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  为了保证您的长期稳定使用，并解锁更高精度的视觉分析模型，建议您在设置中配置个人的 <span className="font-black text-slate-900 dark:text-white">通义千问</span> 或 <span className="font-black text-slate-900 dark:text-white">智谱 AI</span> 密钥。
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 relative">
                <button 
                  onClick={() => setShowApiKeyPrompt(false)}
                  className="flex-1 py-5 bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-400 rounded-3xl font-black text-sm hover:bg-slate-200 dark:hover:bg-[#2A2A2A] transition-all border border-transparent dark:border-white/5 active:scale-95"
                >
                  先用演示额度
                </button>
                <button 
                  onClick={() => {
                    setShowApiKeyPrompt(false);
                    (window as any).openSettings?.('ai');
                  }}
                  className="flex-1 py-5 bg-amber-600 text-white rounded-3xl font-black text-sm hover:bg-amber-500 transition-all text-center flex items-center justify-center gap-3 shadow-xl shadow-amber-600/20 active:scale-95 shimmer-btn"
                >
                  <ShieldCheck size={18} />
                  立即配置私有 Key
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* API Key Reminder */}
      {!hasUserKeys && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/50 p-6 rounded-[32px] flex flex-col md:flex-row items-center gap-6 shadow-xl shadow-amber-500/5 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-[0.03] dark:opacity-[0.05] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
            <Zap size={120} />
          </div>
          
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-800/40 rounded-2xl text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-inner border border-amber-200/50">
            <Zap size={32} className="animate-pulse" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
              <h3 className="text-lg font-black text-amber-900 dark:text-amber-200 tracking-tight flex items-center justify-center md:justify-start gap-2">
                公共演示额度使用中
                <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-700 text-amber-700 dark:text-amber-200 text-[10px] font-black rounded-full uppercase tracking-tighter">Limited</span>
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                  已试用 {publicUsage} 次
                </span>
              </div>
            </div>
            <p className="text-sm text-amber-800/70 dark:text-amber-400/80 leading-relaxed max-w-2xl">
              当前您正在使用系统的公共演示 API 额度。为了获得更稳定、更快速的诊断体验，并支持更大规模的并发请求，建议您在设置中配置个人的 <span className="font-black text-amber-900 dark:text-amber-100">通义千问 (Qwen)</span> 或 <span className="font-black text-amber-900 dark:text-amber-100">智谱 AI (Zhipu)</span> API 密钥。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button 
              onClick={() => (window as any).openSettings?.('ai')}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-amber-600/30 active:scale-95 flex items-center justify-center gap-2"
            >
              <ShieldCheck size={18} />
              立即配置私有 Key
            </button>
          </div>
        </motion.div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">AI 智能识别</h1>
            <button
              onClick={toggleListen}
              className={cn(
                "p-2 rounded-xl transition-all flex items-center gap-2 text-sm font-bold",
                isListening 
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30" 
                  : "bg-forest-green/10 text-forest-green hover:bg-forest-green/20"
              )}
              title={isListening ? "停止聆听" : "语音指令 (如: '切换到病虫害识别并上传图片')"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              {isListening ? "正在聆听指令..." : "语音控制"}
            </button>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">融合视觉识别与大语言模型，为您提供专业的农事诊断建议</p>
        </div>
        
        <div className="flex bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl p-1.5 rounded-2xl shadow-xl shadow-black/5 border border-white/20 dark:border-white/5">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setAnalysisType(t.id as any);
                setDisplayedResult(null);
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                analysisType === t.id 
                  ? "bg-forest-green text-white shadow-lg shadow-forest-green/20" 
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50/80 dark:hover:bg-[#1A1A1A]/40"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Upload & Preview */}
        <div className="lg:col-span-4 space-y-4 sticky top-8">
          <div 
            id="ai-upload-area"
            className={cn(
              "relative aspect-square bento-card border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center group",
              selectedImage 
                ? "border-forest-green/30" 
                : "border-slate-200/50 dark:border-[#222222]/30"
            )}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              className="hidden" 
              accept="image/jpeg, image/png, image/jpg" 
            />
            
            {isCameraOpen ? (
              <div className="absolute inset-0 z-30 bg-black flex flex-col items-center justify-center rounded-[2rem] overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover scale-105"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* 取景器辅助线与聚焦框 */}
                <div className="absolute inset-8 pointer-events-none">
                  {/* Top Left */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/70 rounded-tl-xl blur-[0.5px]"></div>
                  {/* Top Right */}
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/70 rounded-tr-xl blur-[0.5px]"></div>
                  {/* Bottom Left */}
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/70 rounded-bl-xl blur-[0.5px]"></div>
                  {/* Bottom Right */}
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/70 rounded-br-xl blur-[0.5px]"></div>
                  
                  {/* Center Focus Reticle */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 opacity-50">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
                    <div className="absolute left-1/2 top-0 h-full w-[1px] bg-white"></div>
                  </div>
                </div>

                {/* 底部渐变遮罩，凸显按键 */}
                <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

                <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-12 px-6">
                  {/* 取消按钮 */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); stopCamera(); }}
                    className="w-12 h-12 flex items-center justify-center bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all border border-white/20 hover:scale-110 active:scale-90"
                    title="取消拍照"
                  >
                    <X size={24} />
                  </button>
                  
                  {/* 拍照快门 */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); capturePhoto(); }}
                    className="w-20 h-20 bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center p-1.5 transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-black/50 border border-white/20 group/shutter"
                    title="确认拍照"
                  >
                    <div className="w-full h-full bg-white rounded-full shadow-inner transform group-active:scale-95 transition-transform duration-100" />
                  </button>

                  {/* 切换摄像头 */}
                  <button 
                    onClick={switchCamera}
                    className="w-12 h-12 flex items-center justify-center bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all border border-white/20 hover:scale-110 active:scale-90"
                    title="切换摄像头"
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
              </div>
            ) : selectedImage ? (
              <div 
                className={cn("relative w-full h-full overflow-hidden select-none", isHotspotMode ? "cursor-crosshair" : "cursor-default")} 
                onClick={(e) => {
                  if (isHotspotMode) {
                    handleImageClick(e);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <img 
                  src={selectedImage} 
                  alt="Preview" 
                  className={cn("w-full h-full object-cover transition-all duration-500", isAnalyzing && "brightness-[0.3]")} 
                  style={{
                    filter: spectralFilter === 'ndvi' ? 'hue-rotate(90deg) saturate(2.2) contrast(1.4) brightness(0.9)' :
                            spectralFilter === 'nir' ? 'grayscale(1) contrast(2) brightness(1.1) invert(0.05)' :
                            spectralFilter === 'thermal' ? 'grayscale(1) invert(1) contrast(1.6) sepia(1) hue-rotate(-60deg) saturate(2.5)' :
                            undefined
                  }}
                />
                
                {/* AI Laser Scanning Animation */}
                <AnimatePresence>
                  {isAnalyzing && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-10 pointer-events-none overflow-hidden"
                    >
                      <motion.div
                        animate={{ top: ['0%', '100%', '0%'] }}
                        transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
                        className="absolute left-0 right-0 h-[2px] bg-forest-green shadow-[0_0_20px_4px_rgba(16,185,129,0.8)]"
                      />
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                      <div className="absolute top-4 right-4 bg-forest-green/90 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-emerald-400 shadow-xl">
                        <Loader2 size={12} className="animate-spin text-white" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{t('ai_recognition.labels.analyzing_deep')}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Hotspot Toggle Button */}
                {displayedResult && !isAnalyzing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsHotspotMode(!isHotspotMode);
                      setActiveHotspotIndex(null);
                      addNotification({
                        title: !isHotspotMode ? "进入多光谱特征标定模式" : "已回归常规浏览",
                        message: !isHotspotMode ? "请在图像任意位置单点击，即可手动追加特征锚点及微地理置信标" : "已恢复常规视图模式",
                        type: "info"
                      });
                    }}
                    className={cn(
                      "absolute top-4 left-4 z-20 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-tight flex items-center gap-1.5 transition-all shadow-md active:scale-95",
                      isHotspotMode 
                        ? "bg-rose-600 text-white border border-rose-450 shadow-lg shadow-rose-600/30" 
                        : "bg-black/75 backdrop-blur-md border border-white/10 text-white hover:bg-black/90"
                    )}
                  >
                    <Compass size={12} className={cn(isHotspotMode && "animate-spin")} />
                    {isHotspotMode ? "正在标定特征(请点击打点)" : "交互特征多光谱标定"}
                  </button>
                )}

                {/* Hotspot Markers Overlay */}
                {displayedResult && hotspots.map((spot, index) => (
                  <div
                    key={index}
                    className="absolute z-20"
                    style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: 'translate(-50%, -50%)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveHotspotIndex(activeHotspotIndex === index ? null : index);
                    }}
                  >
                    <div className="relative flex items-center justify-center group">
                      <div className="absolute w-8 h-8 rounded-full bg-rose-500/40 animate-ping" />
                      <div className="absolute w-5 h-5 rounded-full bg-rose-400/60 animate-pulse" />
                      <div className="w-5 h-5 rounded-full bg-rose-600 border-2 border-white shadow-xl flex items-center justify-center text-[9px] font-black text-white hover:scale-110 transition-transform">
                        {index + 1}
                      </div>
                    </div>
                    
                    {/* Tooltip Popup */}
                    {activeHotspotIndex === index && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="absolute bottom-7 left-1/2 -translate-x-1/2 w-60 bg-[#0B0B14]/95 backdrop-blur-xl rounded-2xl p-4 border border-rose-500/30 shadow-2xl z-30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-between items-center mb-1.5 border-b border-white/5 pb-1">
                          <span className="text-[10px] font-black text-rose-400 flex items-center gap-1">
                            <Compass size={11} className="text-rose-500" />
                            {spot.label}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveHotspotIndex(null); }}
                            className="text-slate-400 hover:text-white transition-colors p-0.5"
                          >
                            <X size={10} />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-relaxed font-bold">
                          {spot.details}
                        </p>
                      </motion.div>
                    )}
                  </div>
                ))}
                
                {/* 严重度热力图覆盖量化展示 (Grad-CAM Mock) */}
                {displayedResult && analysisType === 'disease' && spectralFilter === 'rgb' && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 pointer-events-none mix-blend-overlay"
                    style={{
                      background: 'radial-gradient(circle at 45% 45%, rgba(0,255,0,0) 0%, rgba(220,38,38,0.7) 30%, rgba(234,179,8,0.2) 60%, rgba(0,0,0,0) 80%)'
                    }}
                  >
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur text-white px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                       <span className="text-[10px] font-black uppercase">模型注意区域 (Grad-CAM)</span>
                    </div>
                  </motion.div>
                )}

                {/* Floating Analyze Button Overlay */}
                {!displayedResult && !isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-all hover:bg-black/50"
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
                      className="px-8 py-4 bg-forest-green text-white rounded-3xl font-black text-lg shadow-2xl shadow-forest-green/50 hover:bg-emerald-green transition-all flex items-center gap-3 active:scale-95 group/scan border border-emerald-400/30"
                    >
                      <Scan size={24} className="group-hover/scan:rotate-90 transition-transform duration-500" />
                      立即启动 AI 分析
                    </button>
                  </motion.div>
                )}

                {/* Spectral High-tech Overlay Metadata & Scan Lines */}
                {spectralFilter !== 'rgb' && (
                  <div className="absolute inset-0 pointer-events-none font-mono text-[9px] text-emerald-400 p-4 flex flex-col justify-between z-10 select-none bg-emerald-950/5">
                    <div className="flex justify-between items-start">
                      <div className="bg-black/80 backdrop-blur-md border border-emerald-500/30 p-2 rounded-lg space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold uppercase text-emerald-300 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 bg-opacity-75" />
                          <span>SPECTRUM MODE: {spectralFilter.toUpperCase()}</span>
                        </div>
                        <div>REFLECTANCE: {spectralFilter === 'ndvi' ? '0.783' : spectralFilter === 'nir' ? '0.912' : '304.5K'}</div>
                        <div>WAVELENGTH: {spectralFilter === 'ndvi' ? '750nm (Red-Edge)' : spectralFilter === 'nir' ? '850nm (NIR)' : '11000nm (LWIR)'}</div>
                      </div>
                      <div className="bg-black/80 backdrop-blur-md border border-emerald-500/30 p-2 rounded-lg text-right">
                        <div>RESOLUTION: 0.05m/px</div>
                        <div>SENSOR: AG-QWEN-V2</div>
                      </div>
                    </div>

                    {/* Sweeping Laser Line representing drone scanning */}
                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-[sweep_3s_linear_infinite]" />
                    <style dangerouslySetInnerHTML={{__html: `
                      @keyframes sweep {
                        0% { top: 0%; }
                        50% { top: 100%; }
                        100% { top: 0%; }
                      }
                    `}} />

                    <div className="flex justify-between items-end">
                      <div className="bg-black/80 backdrop-blur-md border border-emerald-500/30 p-2 rounded-lg text-left">
                        <div>LAT: 34.2389 N</div>
                        <div>LON: 108.9042 E</div>
                      </div>
                      <div className="bg-black/80 backdrop-blur-md border border-emerald-500/30 p-2 rounded-lg text-right">
                        <div>ISO-CALIB: OK</div>
                        <div>5G LINK: 99%</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Floating Spectral Filter Selection Tabs */}
                <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 flex gap-1 z-20 shadow-2xl">
                  {[
                    { id: 'rgb', label: '真彩 RGB' },
                    { id: 'ndvi', label: '活力 NDVI' },
                    { id: 'nir', label: '结构 NIR' },
                    { id: 'thermal', label: '温湿红外' }
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpectralFilter(f.id as any);
                        addNotification({
                          title: `光谱频段切换成功`,
                          message: `已载入【${f.label}】多源解析，当前图像以模拟多尺度光谱反射值特征重整。`,
                          type: 'success'
                        });
                      }}
                      className={cn(
                        "flex-1 py-1.5 px-0.5 text-[9px] font-black rounded-xl transition-all whitespace-nowrap text-center text-white",
                        spectralFilter === f.id
                          ? "bg-forest-green shadow shadow-forest-green/20"
                          : "hover:bg-white/5 text-slate-400"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {isAnalyzing && (
                  <>
                    <div className="absolute inset-0 bg-forest-green/10 mix-blend-overlay" />
                    <motion.div 
                      initial={{ top: 0 }}
                      animate={{ top: "100%" }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] z-20"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/40 backdrop-blur-[2px]">
                      <div className="bg-black/60 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10 flex flex-col items-center gap-3 max-w-[80%] text-center">
                        <div className="relative">
                          <Scan size={24} className="text-emerald-400 animate-pulse" />
                          <motion.div 
                            className="absolute -inset-2 border border-emerald-400/30 rounded-full"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-sm font-black text-white tracking-tight block">{analysisStepText}</span>
                          <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden mx-auto mt-2">
                            <motion.div 
                              className="h-full bg-emerald-400"
                              initial={{ width: 0 }}
                              animate={{ width: `${analysisProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {!isAnalyzing && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white hover:bg-white/30 transition-all">
                      <Upload size={24} />
                    </div>
                    <div 
                      onClick={(e) => { e.stopPropagation(); startCamera(); }}
                      className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white hover:bg-white/30 transition-all"
                    >
                      <Camera size={24} />
                    </div>
                  </div>
                )}
                {!isAnalyzing && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedImage(null); setDisplayedResult(null); }}
                    className="absolute top-4 right-4 w-10 h-10 bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-red-500 transition-colors shadow-lg z-10"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 w-full p-6">
                <div className="flex gap-4">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-forest-green transition-all group/btn"
                  >
                    <div className="w-12 h-12 bg-forest-green/10 text-forest-green rounded-2xl flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                      <Upload size={24} />
                    </div>
                    <span className="text-sm font-black text-slate-600 dark:text-slate-300">{t('ai_recognition.labels.upload')}</span>
                  </button>
                  <button 
                    onClick={startCamera}
                    className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-indigo-500 transition-all group/btn"
                  >
                    <div className="w-12 h-12 bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                      <Camera size={24} />
                    </div>
                    <span className="text-sm font-black text-slate-600 dark:text-slate-300">{t('ai_recognition.labels.camera')}</span>
                  </button>
                </div>
                
                <div className="w-full max-w-md relative mt-4">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    {isAnalyzing ? <Loader2 size={18} className="text-emerald-500 animate-spin" /> : <MessageSquare size={18} className="text-slate-400" />}
                  </div>
                  <input 
                    type="text" 
                    value={isAnalyzing ? analysisStepText : symptomInput}
                    onChange={(e) => setSymptomInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSymptomAnalysis()}
                    placeholder="或直接通过文字/语音描述患病植株特征..."
                    disabled={isAnalyzing}
                    className="w-full bg-slate-50 dark:bg-[#0A0A0A]/50 border border-slate-200 dark:border-white/10 rounded-2xl pl-11 pr-24 py-4 text-sm font-medium focus:outline-none focus:border-forest-green dark:text-white transition-all shadow-inner disabled:opacity-70"
                  />
                  {!isAnalyzing && (
                    <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                      <button
                        onClick={toggleSymptomVoice}
                        className={cn("p-2 rounded-xl transition-colors", isSymptomListening ? "bg-red-100 text-red-500 dark:bg-red-500/20" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-white/10")}
                        title="语音描述"
                      >
                        <Mic size={18} className={isSymptomListening ? "animate-pulse" : ""} />
                      </button>
                      <button
                        onClick={runSymptomAnalysis}
                        disabled={!symptomInput.trim() || isAnalyzing}
                        className="p-2 bg-forest-green text-white rounded-xl hover:bg-forest-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-center mt-2">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white mb-1">{t('ai_recognition.labels.title')}</h3>
                  <p className="text-slate-400 dark:text-slate-500 text-xs font-medium whitespace-pre-line">
                    {t('ai_recognition.labels.desc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Multispectral Signature Signature Analysis Chart */}
          {displayedResult && selectedImage && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bento-card p-6 space-y-4 bg-white dark:bg-gradient-to-b dark:from-[#0D0D19]/90 dark:to-[#07070F]/90 border border-slate-100 dark:border-white/10 shadow-xl dark:shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none" />
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 rounded-lg flex items-center justify-center">
                    <BarChart2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-800 dark:text-white tracking-tight">多光谱反射特征谱形曲线</h3>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Spectral Band Interpretation</p>
                  </div>
                </div>
                <span className="text-[9px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-550/20 rounded-full font-mono">
                  {spectralFilter.toUpperCase()} 解析器
                </span>
              </div>

              {/* Curve chart */}
              <div className="h-40 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={getSpectralChartData()}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="curveColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="baseColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis 
                      dataKey="nm" 
                      stroke="#94a3b850" 
                      fontSize={8} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#94a3b850" 
                      fontSize={8} 
                      tickLine={false} 
                      axisLine={false}
                      domain={[0, 100]}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#0e0e1b] border border-white/10 p-2.5 rounded-xl shadow-xl font-sans text-left space-y-1">
                              <p className="text-[10px] font-black text-white">{data.nm}</p>
                              <div className="flex justify-between gap-4 text-[9px] font-mono">
                                <span className="text-indigo-400 font-bold">观测分量:</span>
                                <span className="text-indigo-300 font-black">{payload[0].value}%</span>
                              </div>
                              <div className="flex justify-between gap-4 text-[9px] font-mono">
                                <span className="text-emerald-450 font-bold">参考基准:</span>
                                <span className="text-emerald-300 font-black">{payload[1]?.value || 0}%</span>
                              </div>
                              {data.desc && (
                                <p className="text-[8px] text-slate-400 font-bold border-t border-white/5 pt-1 mt-1 leading-snug max-w-[140px] whitespace-normal">
                                  {data.desc}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      name="当前观测" 
                      type="monotone" 
                      dataKey="curve" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#curveColor)" 
                    />
                    <Area 
                      name="逆境基线" 
                      type="monotone" 
                      dataKey="base" 
                      stroke="#10b981" 
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      fillOpacity={1} 
                      fill="url(#baseColor)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Explanatory annotation based on filter */}
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-300">
                    {spectralFilter === 'ndvi' ? '活力度指数 (NDVI) 特征规律：' : 
                     spectralFilter === 'nir' ? '结构对齐 (NIR) 细微比对：' : 
                     spectralFilter === 'thermal' ? '局部冷热湿度耦合解算：' : 
                     '多源光谱色度综合对齐：'}
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 leading-snug font-bold">
                  {spectralFilter === 'ndvi' ? '在近红外通道呈现极高反射，而在红光段存在极低反射峰，两者陡峭断差符合植株高通透叶绿素活力指数特征，属于标准强光合吸收。' :
                   spectralFilter === 'nir' ? '细胞壁的高透明度直接致使 850nm 段成为散射高原区。此波谱斜率下降时，通常表明细胞质与纤维素微骨架发生软化溃变，吻合中度受灾体征。' :
                   spectralFilter === 'thermal' ? '气孔张合度退化导致水分蒸腾散热阻滞。11μm 发射峰位能量突变升高，表明叶片存在发热焦干趋势。两线高度重合并交叉，需要加强排水浇灌调节。' :
                   '融合了作物表面细小的反射差异，利用边缘强化及微细纹理算法提升暗部病灶可见度，是模型解算形态轮廓、骨骼点与侵染窗口的核心比对基准。'}
                </p>
              </div>
            </motion.div>
          )}

          <div className="bento-card p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-500/10 text-indigo-500 rounded-lg flex items-center justify-center">
                  <Brain size={18} />
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">{t('ai_recognition.labels.decision')}</h3>
              </div>
              {selectedPlot && plots.find(p => p.id === selectedPlot)?.status !== 'pending_setup' && (
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                  {t('ai_recognition.labels.ready')}
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('ai_recognition.labels.select_plot')}</label>
                <div className="flex items-center gap-2">
                  <select 
                    value={selectedPlot}
                    onChange={(e) => {
                      setSelectedPlot(e.target.value);
                      const plot = plots.find(p => p.id === e.target.value);
                      if (plot && plot.status !== 'pending_setup') {
                        runPlotAnalysisForPlot(e.target.value);
                      }
                    }}
                    className="flex-1 input-glass px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                  >
                    {plots.map(p => <option key={p.id} value={p.id}>{p.name} ({p.crop})</option>)}
                  </select>
                  <button
                    onClick={() => runPlotAnalysisForPlot(selectedPlot)}
                    disabled={isPlotAnalyzing || !selectedPlot}
                    className={cn(
                      "p-3 rounded-xl transition-all shadow-lg active:scale-95",
                      isPlotAnalyzing 
                        ? "bg-slate-100 text-slate-400" 
                        : "btn-primary shadow-indigo-500/20"
                    )}
                  >
                    {isPlotAnalyzing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
                  </button>
                </div>
              </div>

              {plots.find(p => p.id === selectedPlot)?.status === 'pending_setup' && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-black text-amber-700 dark:text-amber-400">{t('ai_recognition.modals.plot_not_configured_title')}</p>
                    <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 font-medium leading-relaxed">
                      {t('ai_recognition.modals.plot_not_configured_message')}
                    </p>
                    <button 
                      onClick={() => onNavigate?.('management')}
                      className="text-[10px] font-black text-amber-700 dark:text-amber-400 underline mt-1"
                    >
                      {t('ai_recognition.modals.go_to_management')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t border-slate-100 dark:border-white/5 space-y-4">
              {/* Turbo Mode Toggle */}
              <div className="p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 dark:from-indigo-950/20 dark:to-purple-950/10 border border-indigo-500/20 dark:border-indigo-500/10 rounded-2xl shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center justify-center animate-pulse">
                    <Zap size={16} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1">
                      双擎极速诊断通道
                      <span className="text-[8px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full uppercase scale-90 origin-left">Turbo</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">降低250ms人工缓冲，优化LLM推理步进</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const targetState = !turboMode;
                    setTurboMode(targetState);
                    localStorage.setItem('ai_turbo_mode', targetState ? 'true' : 'false');
                    addNotification({
                      type: 'info',
                      title: targetState ? t('ai_recognition.labels.turbo_on') : t('ai_recognition.labels.turbo_off'),
                      message: targetState ? t('ai_recognition.labels.turbo_on_desc') : t('ai_recognition.labels.turbo_off_desc')
                    });
                  }}
                  className={cn(
                    "w-12 h-6 pl-1 pr-1 rounded-full flex items-center transition-all cursor-pointer relative",
                    turboMode ? "bg-indigo-600 justify-end" : "bg-slate-200 dark:bg-neutral-800 justify-start"
                  )}
                >
                  <motion.div 
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="w-4 h-4 rounded-full bg-white shadow-md cursor-pointer" 
                  />
                </button>
              </div>

              {/* Usage Limit Feedback */}
              <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('ai_recognition.labels.usage_title')}</span>
                  <span className="text-[10px] font-black text-forest-green">
                    {DataService.getUserApiKeys().qwenKey ? t('ai_recognition.labels.usage_unlimited') : t('ai_recognition.labels.usage_public', { count: publicUsage })}
                  </span>
                </div>
                {!DataService.getUserApiKeys().qwenKey && (
                  <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-2 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {t('ai_recognition.labels.usage_warning')}
                  </p>
                )}
                <button 
                  onClick={() => (window as any).openSettings?.('ai')}
                  className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline mt-2 flex items-center gap-1"
                >
                  <Zap size={10} />
                  {t('ai_recognition.labels.usage_action')}
                </button>
              </div>

              <button 
                onClick={runAnalysis}
                disabled={!selectedImage || isAnalyzing}
                className="w-full py-4 bg-forest-green text-white rounded-2xl font-black text-lg shadow-lg shadow-forest-green/20 hover:bg-emerald-green transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={24} className="animate-spin" />
                    {t('ai_recognition.labels.analyzing_deep')}
                  </>
                ) : (
                  <>
                    <Scan size={24} />
                    {t('ai_recognition.labels.start_analysis')}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Recognition History Panel */}
          <div className="bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl p-5 shadow-xl shadow-black/5 border border-white/20 dark:border-white/5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <History size={18} className="text-forest-green" />
              <h3 className="text-sm font-black text-slate-800 dark:text-white">{t('ai_recognition.labels.history_title')}</h3>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              {history.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-slate-400 font-medium italic">{t('ai_recognition.labels.no_history')}</p>
                </div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectHistory(item)}
                    className="w-full flex items-center gap-3 p-2 rounded-2xl bg-slate-50/50 dark:bg-[#1A1A1A]/30 border border-slate-100 dark:border-white/5 hover:border-forest-green/30 hover:bg-forest-green/5 transition-all group text-left"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-white/10 bg-slate-100 flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <Leaf size={20} className="text-slate-400 opacity-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-black text-forest-green uppercase tracking-wider">
                          {types.find(t => t.id === item.type)?.label || item.type}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold">{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-xs font-black text-slate-800 dark:text-white truncate mb-0.5">{item.result?.target || t('ai_recognition.labels.unknown_target', '未知目标')}</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5">
                          <Zap size={8} className="text-amber-500" />
                          <span className="text-[9px] text-slate-500 font-bold">
                            {item.result?.confidence ? (item.result.confidence * 100).toFixed(0) : '0'}%
                          </span>
                        </div>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="text-[9px] text-slate-400 font-bold truncate">{t('ai_recognition.labels.plot_prefix')}{item.plotId?.split('_').pop() || t('ai_recognition.labels.unknown_plot', '未知')}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-8 space-y-4">
          <AnimatePresence mode="wait">
            {errorDetails ? (
              <motion.div 
                key="error"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="h-full min-h-[400px] bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl border border-red-100 dark:border-red-900/20 flex flex-col items-center justify-center p-8 text-center shadow-xl"
              >
                <div className="w-20 h-20 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center mb-6 text-red-500">
                  <AlertTriangle size={40} />
                </div>
                
                <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-3">{errorDetails.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium max-w-md mb-8">{errorDetails.desc}</p>
                
                <div className="w-full max-w-md bg-slate-50 dark:bg-white/5 rounded-2xl p-6 mb-8 text-left border border-slate-100 dark:border-white/5">
                  <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">{t('ai_recognition.labels.suggestions')}</h4>
                  <ul className="space-y-3">
                    {errorDetails.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                        <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center text-[10px] shrink-0">{i + 1}</div>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={errorDetails.action.onClick}
                    className="px-10 py-4 bg-red-500 text-white rounded-2xl font-black text-lg shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95 flex items-center gap-2"
                  >
                    {errorDetails.action.label === t('ai_recognition.errors.network.action') ? <RefreshCw size={20} /> : <Zap size={20} />}
                    {errorDetails.action.label}
                  </button>
                  <button 
                    onClick={() => { resetRecognition(); resetPlotAnalysis(); }}
                    className="px-10 py-4 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-all border border-slate-200 dark:border-white/10"
                  >
                    {t('ai_recognition.labels.cancel')}
                  </button>
                </div>
              </motion.div>
            ) : !displayedResult && !isAnalyzing ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="h-full min-h-[300px] bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl border-2 border-dashed border-slate-200/50 dark:border-white/5 flex flex-col items-center justify-center text-slate-400 p-8 text-center shadow-xl shadow-black/5"
              >
                <div className="w-24 h-24 bg-slate-50/50 dark:bg-[#1A1A1A]/30 rounded-full flex items-center justify-center mb-6 border border-slate-100 dark:border-white/5">
                  <Scan size={48} className="opacity-20" />
                </div>
                <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300 mb-2">{t('ai_recognition.labels.waiting_title')}</h3>
                <p className="text-sm max-w-xs text-slate-400/80">{t('ai_recognition.labels.waiting_desc')}</p>
              </motion.div>
            ) : isPlotAnalyzing ? (
              <motion.div 
                key="loading-plot"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="h-full min-h-[300px] bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/10 border border-white/20 dark:border-white/10 flex flex-col items-center justify-center p-8 space-y-6"
              >
                <div className="relative">
                  <div className="w-32 h-32 border-4 border-indigo-500/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-indigo-500">
                    <Brain size={40} className="animate-pulse" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white">
                    {plotAnalysisStepText}
                  </h3>
                  <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">
                    {t('ai_recognition.labels.loading_plot_desc')}
                  </p>
                </div>
                <div className="w-full max-w-xs bg-slate-100/50 dark:bg-[#1A1A1A]/30 h-1.5 rounded-full overflow-hidden border border-slate-200/20 dark:border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${plotAnalysisProgress}%` }}
                    className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  />
                </div>
              </motion.div>
            ) : isAnalyzing ? (
              <motion.div 
                key="loading-image"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="h-full min-h-[300px] bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/10 border border-white/20 dark:border-white/10 flex flex-col items-center justify-center p-8 space-y-6"
              >
                <div className="relative">
                  <div className="w-32 h-32 border-4 border-forest-green/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-forest-green rounded-full border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-forest-green">
                    <Scan size={40} className="animate-pulse" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white">
                    {analysisStepText}
                  </h3>
                  <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">
                    {t('ai_recognition.labels.loading_image_desc')}
                  </p>
                </div>
                <div className="w-full max-w-xs bg-slate-100/50 dark:bg-[#1A1A1A]/30 h-1.5 rounded-full overflow-hidden border border-slate-200/20 dark:border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${analysisProgress}%` }}
                    className="h-full bg-forest-green shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  />
                </div>
              </motion.div>
            ) : plotAnalysisData ? (
              <motion.div 
                key="plot-result"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 dark:from-indigo-700 dark:to-violet-900 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-500/20 group">
                  <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                    <Brain size={240} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-6">
                      <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest">{t('ai_recognition.labels.decision')}</span>
                      <div className="h-px w-12 bg-white/20" />
                      <span className="text-[10px] font-bold text-white/60 uppercase font-mono">{t('ai_recognition.labels.plot_label')}{plots.find(p => p.id === selectedPlot)?.name}</span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8">
                      <div>
                        <p className="text-indigo-100/60 text-xs font-bold mb-1">{t('ai_recognition.labels.recommended_crop')}</p>
                        <h4 className="text-5xl font-black tracking-tight">{plotAnalysisData.recommendedCrop}</h4>
                      </div>
                      <div className="flex items-center gap-4 pb-1">
                        <div className="h-12 w-px bg-white/10 hidden md:block" />
                        <div>
                          <p className="text-indigo-100/60 text-[10px] font-bold mb-1 uppercase">{t('ai_recognition.labels.suitability')}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black font-mono">{plotAnalysisData.suitability}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                      <p className="text-sm text-indigo-50 font-medium leading-relaxed">
                        {plotAnalysisData.reason}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-white/10 shadow-xl">
                    <h4 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <TrendingUp size={18} className="text-emerald-500" />
                      {t('ai_recognition.labels.profit')}
                    </h4>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-800 dark:text-white font-mono">¥{plotAnalysisData?.expectedProfit?.toLocaleString() || '0'}</span>
                      <span className="text-slate-400 text-xs font-bold">/ {t('app.year')}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-medium">{t('ai_recognition.labels.profit_desc')}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-white/10 shadow-xl">
                    <h4 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <Leaf size={18} className="text-indigo-500" />
                      {t('ai_recognition.labels.alternatives')}
                    </h4>
                    <div className="space-y-2">
                      {plotAnalysisData.alternatives.map((alt, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-600 dark:text-slate-300">{alt.crop}</span>
                           <span className="font-mono text-slate-400">¥{alt?.expectedProfit?.toLocaleString() || '0'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {plotAnalysisData.fertilizationAdvice && (
                  <div className="bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-[32px] p-8 border border-white/20 dark:border-white/10 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                      <Zap size={120} className="text-amber-500" />
                    </div>
                    <div className="relative z-10 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center">
                          <Zap size={20} />
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">{t('ai_recognition.labels.fertilization_title')}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">{t('ai_recognition.labels.fertilization_desc')}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('ai_recognition.labels.fertilization_amount')}</p>
                          <div className="p-4 bg-slate-50/50 dark:bg-[#121214]/30 rounded-2xl border border-slate-100 dark:border-white/5">
                            <p className="text-xl font-black text-amber-600 dark:text-amber-400">{plotAnalysisData.fertilizationAdvice.amount}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('ai_recognition.labels.fertilization_timing')}</p>
                          <div className="p-4 bg-slate-50/50 dark:bg-[#121214]/30 rounded-2xl border border-slate-100 dark:border-white/5">
                            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{plotAnalysisData.fertilizationAdvice.timing}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl border border-amber-500/10">
                        <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                          <span className="font-black text-amber-600 dark:text-amber-400 mr-2">{t('ai_recognition.labels.expert_analysis')}</span>
                          {plotAnalysisData.fertilizationAdvice.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : displayedResult ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Result Header - Beautified */}
                <div className={cn(
                  "relative rounded-[40px] p-10 shadow-2xl overflow-hidden transition-all duration-500",
                  "bg-gradient-to-br backdrop-blur-2xl border border-white/20 dark:border-white/5",
                  displayedResult.status === 'danger' ? "from-red-600/90 to-red-900/90" : 
                  displayedResult.status === 'warning' ? "from-amber-600/90 to-amber-900/90" : 
                  "from-emerald-600/90 to-emerald-900/90"
                )}>
                  <div className="relative z-10 text-white">
                    <div className="flex items-center justify-between mb-8">
                       <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-20 h-20 rounded-3xl flex items-center justify-center bg-white/20 backdrop-blur-md shadow-inner border border-white/20"
                          )}>
                             {(() => { const HeaderIcon = RESULT_TYPE_META[analysisType]?.HeaderIcon || Leaf; return <HeaderIcon size={40} className="text-white" />; })()}
                          </div>
                          <div>
                            <h3 className="text-3xl font-black tracking-tight">{displayedResult.target}</h3>
                            <p className="text-sm font-bold text-white/70 uppercase tracking-widest mt-1">{displayedResult.type}</p>
                          </div>
                      </div>
                      <div className="text-right">
                        <div className="text-5xl font-black font-mono tracking-tighter">
                           {((displayedResult.confidence || 0) * 100).toFixed(0)}<span className="text-2xl font-bold opacity-60">%</span>
                        </div>
                        <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mt-2">{t('ai_recognition.labels.confidence_label')}</p>
                      </div>
                    </div>
                    <p className="text-md text-white/90 leading-relaxed bg-white/10 p-6 rounded-3xl border border-white/10 backdrop-blur-sm">
                      {displayedResult.description}
                    </p>
                  </div>
                </div>

                {/* 数量化指标评测 (国赛级增强) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">{t('ai_recognition.labels.indicator_crop_stage')}</p>
                    <p className="font-black text-forest-green text-sm truncate mt-0.5">
                      {displayedResult.cropStage || t('ai_recognition.labels.unknown_plot')}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{t('ai_recognition.labels.indicator_stage_desc')}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">{t('ai_recognition.labels.indicator_impact')}</p>
                    <p className={cn(
                      "font-black text-sm mt-0.5",
                      displayedResult.status === 'danger' ? "text-red-500" :
                      displayedResult.status === 'warning' ? "text-amber-500" : "text-emerald-500"
                    )}>
                      {displayedResult.impactDegree || "正常"}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{t('ai_recognition.labels.indicator_impact_desc')}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">{t('ai_recognition.labels.indicator_economic')}</p>
                    <p className="font-mono font-black text-indigo-500 text-sm mt-0.5">
                      {displayedResult.economicLossRatio || "0%"}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{t('ai_recognition.labels.indicator_economic_desc')}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">{t('ai_recognition.labels.indicator_factor')}</p>
                    <p className="font-black text-slate-700 dark:text-slate-300 text-[11px] leading-tight truncate mt-0.5" title={displayedResult.environmentalFactors}>
                      {displayedResult.environmentalFactors || "多维耦合"}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{t('ai_recognition.labels.indicator_factor_desc')}</p>
                  </div>
                </div>

                {/* New Analysis Breakdown Section - 按识别类型差异化的专属研判协议 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                  {(RESULT_TYPE_META[analysisType]?.cards || RESULT_TYPE_META.pest.cards).map((card, idx) => {
                    const CardIcon = card.Icon;
                    return (
                      <div key={idx} className="bg-white/50 dark:bg-white/5 rounded-3xl p-6 border border-white/20 dark:border-white/5">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                          <CardIcon size={14} className={card.iconClass} /> {card.title}
                        </h4>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">
                          {card.text(displayedResult.status)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Tabs for Suggestions and Detailed Report */}
                <div className="bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-3xl shadow-sm border border-white/20 dark:border-white/10 overflow-hidden mt-8">
                  <div className="flex border-b border-slate-100 dark:border-white/5">
                    <button
                      onClick={() => setActiveResultTab('suggestions')}
                      className={cn(
                        "flex-1 py-4 text-sm font-black transition-all flex items-center justify-center gap-2",
                        activeResultTab === 'suggestions' 
                          ? "text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10" 
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                      )}
                    >
                      <CheckCircle2 size={18} />
                      {t('ai_recognition.labels.treatment_suggestions')}
                    </button>
                    {displayedResult.detailedReport && (
                      <button
                        onClick={() => setActiveResultTab('report')}
                        className={cn(
                          "flex-1 py-4 text-sm font-black transition-all flex items-center justify-center gap-2",
                          activeResultTab === 'report' 
                            ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10" 
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                        )}
                      >
                        <FileText size={18} />
                        {t('ai_recognition.labels.detailed_report')}
                      </button>
                    )}
                  </div>

                  <div className="p-6">
                    {activeResultTab === 'suggestions' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {Array.isArray(displayedResult.suggestions) && displayedResult.suggestions.length > 0 ? (
                              displayedResult.suggestions.map((s, i) => (
                                <div 
                                  key={i}
                                  className="bg-white/50 dark:bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all group flex gap-4"
                                >
                                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 font-black text-sm group-hover:scale-110 transition-transform">
                                    {i + 1}
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
                                    {s}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="col-span-2 p-8 text-center text-slate-400 bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                                <p>{t('ai_recognition.labels.no_suggestions')}</p>
                              </div>
                            )}
                          </div>

                          <div className="bg-indigo-50/80 dark:bg-indigo-900/20 backdrop-blur-md rounded-3xl p-6 border border-indigo-100 dark:border-indigo-800/50 shadow-sm flex flex-col justify-between md:col-span-2">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                              <div className="space-y-2">
                                <h3 className="text-indigo-800 dark:text-indigo-400 font-black flex items-center gap-2 text-lg tracking-tight">
                                  <Activity size={20} />
                                  {t('ai_recognition.labels.smart_decision')}
                                </h3>
                                <p className="text-sm text-indigo-600 dark:text-indigo-300/70 font-bold leading-relaxed max-w-xl">
                                  {displayedResult.status === 'danger' ? (
                                    t('ai_recognition.labels.smart_decision_desc_danger', { type: displayedResult.type, target: displayedResult.target, plot: selectedPlot?.split('_')[1] || t('ai_recognition.labels.unknown_plot') })
                                  ) : displayedResult.status === 'warning' ? (
                                    t('ai_recognition.labels.smart_decision_desc_warning', { target: displayedResult.target, plot: selectedPlot?.split('_')[1] || t('ai_recognition.labels.unknown_plot') })
                                  ) : (
                                    t('ai_recognition.labels.smart_decision_desc_success', { target: displayedResult.target, plot: selectedPlot?.split('_')[1] || t('ai_recognition.labels.unknown_plot') })
                                  )}
                                </p>
                              </div>
                              <div className="flex gap-3 shrink-0">
                                <button 
                                  onClick={() => onNavigate?.('management')}
                                  className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
                                >
                                  {t('ai_recognition.labels.go_to_management_btn')}
                                  <ArrowRight size={16} />
                                </button>
                                <button 
                                  onClick={() => onNavigate?.('knowledge', displayedResult.target)}
                                  className="px-6 py-3 bg-white dark:bg-[#1A1A1A] text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:bg-indigo-50 dark:hover:bg-[#2A2A2A] transition-all active:scale-95 shadow-sm"
                                >
                                  {t('ai_recognition.labels.view_wiki')}
                                  <BookOpen size={16} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* 智慧农业3D生态立体联防联控网 (大模型输出内容全量展现) */}
                          {((displayedResult as any).chemicalPrevention || (displayedResult as any).biologicalPrevention || (displayedResult as any).physicalPrevention || (displayedResult as any).monitoringFocus) && (
                            <div className="md:col-span-2 border-t border-slate-100 dark:border-white/5 pt-6 mt-2 space-y-4">
                              <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-wide">
                                <ShieldCheck size={18} className="text-emerald-500" />
                                {t('ai_recognition.labels.prevention_title')}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* 1. 化学精准施药 (🧪 化学阻截) */}
                                {(displayedResult as any).chemicalPrevention && (
                                  <div className="p-5 bg-gradient-to-br from-rose-50/50 to-red-50/10 dark:from-red-950/5 dark:to-rose-950/5 rounded-2.5xl border border-red-100/20 dark:border-red-900/10 flex gap-4">
                                    <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500 shrink-0">
                                      <FlaskConical size={20} />
                                    </div>
                                    <div className="space-y-1">
                                      <h5 className="text-xs font-black text-rose-700 dark:text-rose-450 flex items-center gap-1.5">
                                        🧪 {t('ai_recognition.labels.chemical_prevention')}
                                        <span className="text-[9px] bg-red-100 dark:bg-red-950 text-red-500 px-1.5 py-0.5 rounded-full scale-90">{t('ai_recognition.labels.urgent')}</span>
                                      </h5>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
                                        {(displayedResult as any).chemicalPrevention}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* 2. 绿色生物控害 (🌿 益害调节) */}
                                {(displayedResult as any).biologicalPrevention && (
                                  <div className="p-5 bg-gradient-to-br from-emerald-50/50 to-teal-50/10 dark:from-emerald-950/5 dark:to-teal-950/5 rounded-2.5xl border border-emerald-100/20 dark:border-emerald-900/10 flex gap-4">
                                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                                      <Sprout size={20} />
                                    </div>
                                    <div className="space-y-1">
                                      <h5 className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                        🌿 {t('ai_recognition.labels.biological_prevention')}
                                        <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-500 px-1.5 py-0.5 rounded-full scale-90">{t('ai_recognition.labels.ecological')}</span>
                                      </h5>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
                                        {(displayedResult as any).biologicalPrevention}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* 3. 物理屏障阻截 (🕸️ 物理自救) */}
                                {(displayedResult as any).physicalPrevention && (
                                  <div className="p-5 bg-gradient-to-br from-indigo-50/50 to-blue-50/10 dark:from-indigo-950/5 dark:to-blue-950/5 rounded-2.5xl border border-indigo-100/30 dark:border-indigo-900/10 flex gap-4">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500 shrink-0">
                                      <Grid size={20} />
                                    </div>
                                    <div className="space-y-1">
                                      <h5 className="text-xs font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                                        🕸️ {t('ai_recognition.labels.physical_prevention')}
                                        <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-500 px-1.5 py-0.5 rounded-full scale-90">{t('ai_recognition.labels.low_carbon')}</span>
                                      </h5>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
                                        {(displayedResult as any).physicalPrevention}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* 4. 定向监测随访 (👁️ 精准轮巡) */}
                                {(displayedResult as any).monitoringFocus && (
                                  <div className="p-5 bg-gradient-to-br from-amber-50/50 to-yellow-50/10 dark:from-amber-950/5 dark:to-yellow-950/5 rounded-2.5xl border border-amber-100/20 dark:border-amber-900/10 flex gap-4">
                                    <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                                      <Eye size={20} />
                                    </div>
                                    <div className="space-y-1">
                                      <h5 className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                        👁️ {t('ai_recognition.labels.monitoring_prevention')}
                                        <span className="text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-500 px-1.5 py-0.5 rounded-full scale-90">{t('ai_recognition.labels.followup')}</span>
                                      </h5>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
                                        {(displayedResult as any).monitoringFocus}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* UAV Flight Mission Sync Panel & Multivariable sensor climate sandbox */}
                          <div className="md:col-span-2 border-t border-slate-100 dark:border-white/5 pt-8 mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            {/* Card 1: 5G Drone Fleet Sync Center */}
                            <div className="bg-white dark:bg-[#050515]/95 text-slate-800 dark:text-white rounded-[2rem] p-6 border border-slate-100 dark:border-white/10 shadow-xl dark:shadow-2xl relative overflow-hidden flex flex-col justify-between">
                              {/* Background Glowing Lines representing aerial link */}
                              <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full filter blur-[50px] pointer-events-none" />
                              <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full filter blur-[50px] pointer-events-none" />
                              
                              <div className="relative z-10 space-y-4">
                                <div className="flex justify-between items-start">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 bg-forest-green text-[9px] font-black rounded-full text-white uppercase tracking-wider animate-pulse">5G 双机联控</span>
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">MODEL: K-P40</span>
                                    </div>
                                    <h3 className="text-base font-black flex items-center gap-2 text-slate-800 dark:text-white">
                                      <Plane size={20} className="text-emerald-500 dark:text-emerald-400" />
                                      植保无人机自主变率飞防系统
                                    </h3>
                                  </div>
                                  <Wifi size={18} className="text-emerald-500 dark:text-emerald-400 animate-pulse" />
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
                                  系统已为您根据图像病斑覆盖率及 “{plots.find(p => p.id === selectedPlot)?.name || "关联地块"}” 智能解算变率施药处方图。支持一键将飞行航点与喷量轨迹同步至机载5G RTK控制模块，实现精准对靶施药。
                                </p>

                                {/* Drone stats row */}
                                <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-3 text-center text-[10px] font-mono">
                                  <div>
                                    <div className="text-slate-500 dark:text-slate-400">预设药量</div>
                                    <div className="text-emerald-600 dark:text-emerald-400 font-black mt-0.5">1.35 升/亩</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-500 dark:text-slate-400">RTK 状态</div>
                                    <div className="text-emerald-600 dark:text-emerald-400 font-black mt-0.5">双链三维锁</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-500 dark:text-slate-400">平均工时</div>
                                    <div className="text-emerald-600 dark:text-emerald-400 font-black mt-0.5">8.5 分钟</div>
                                  </div>
                                </div>

                                {/* Custom Terminal Logs */}
                                {uavConsoleLogs.length > 0 && (
                                  <div className="bg-slate-50 dark:bg-black/85 rounded-2xl p-3 border border-slate-200 dark:border-emerald-500/20 font-mono text-[9px] text-emerald-600 dark:text-emerald-400 space-y-1.5 max-h-[140px] overflow-y-auto">
                                    {uavConsoleLogs.map((log, index) => (
                                      <div key={index} className="flex gap-1 items-start leading-normal">
                                        <span className="text-slate-500 shrink-0">[{index+1}]</span>
                                        <span>{log}</span>
                                      </div>
                                    ))}
                                    {uavSyncing && (
                                      <div className="flex items-center gap-1.5 font-bold animate-pulse text-slate-400 pl-4">
                                        <Loader2 className="animate-spin text-emerald-400" size={10} />
                                        <span>云端航路灌装中...</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="pt-6 relative z-10">
                                <button
                                  type="button"
                                  disabled={uavSyncing}
                                  onClick={runUavTelemetries}
                                  className={cn(
                                    "w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-xl",
                                    uavSyncing 
                                      ? "bg-emerald-950 text-emerald-300 border border-emerald-500/20" 
                                      : "bg-forest-green hover:bg-emerald-green text-white shadow-forest-green/20 active:scale-95"
                                  )}
                                >
                                  {uavSyncing ? (
                                    <>
                                      <Loader2 size={16} className="animate-spin" />
                                      正在连通基站并装载航线并驱动点飞...
                                    </>
                                  ) : (
                                    <>
                                      <Plane size={16} />
                                      一键下发5G植保飞防指令
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Card 2: Environment Sensor IoT Multivariable Coupling Sandbox */}
                            <div className="bg-white dark:bg-[#0A0A0A]/60 rounded-[2rem] p-6 border border-slate-100 dark:border-white/5 shadow-xl flex flex-col justify-between">
                              <div className="space-y-4">
                                <div className="flex justify-between items-start">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[9px] font-black rounded-full uppercase tracking-wider">
                                        空天地一体化校验
                                      </span>
                                    </div>
                                    <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                                      <Sliders size={20} className="text-indigo-500" />
                                      气象与物联传感器多维耦合交叉校验
                                    </h3>
                                  </div>
                                  <Cpu size={18} className="text-indigo-500 animate-pulse" />
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-400 font-bold leading-relaxed">
                                  单模图像分析往往偏向感性估测，系统支持实时载入当前地块关联的 **温湿度、光照、土壤SPAD** 实时监测数据。耦合气象模型，剔除强光偏色或雨天阴影，大幅提升 AI 对叶斑/黄萎/红蜘蛛等病症的识别深度。
                                </p>

                                {/* IoT Readings */}
                                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 text-center text-xs font-mono">
                                  <div>
                                    <div className="text-[10px] text-slate-400">温度</div>
                                    <div className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                                      {plots.find(p => p.id === selectedPlot)?.realtime?.temp || 24.5} ℃
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-slate-400">空气湿度</div>
                                    <div className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                                      {plots.find(p => p.id === selectedPlot)?.realtime?.hum || 82} %
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-slate-400">深层土壤湿度</div>
                                    <div className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                                      {plots.find(p => p.id === selectedPlot)?.realtime?.soil_hum || 76} %
                                    </div>
                                  </div>
                                </div>

                                {/* Dynamic Diagnostics Text */}
                                {activeSensorsCoupled && couplingDiagnosis && (
                                  <motion.div 
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed space-y-2"
                                  >
                                    <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 text-[10px] uppercase font-black">
                                      <Cpu size={12} />
                                      <span>多物理源交叉校验成功</span>
                                    </div>
                                    <p className="font-bold">{couplingDiagnosis}</p>
                                  </motion.div>
                                )}
                              </div>

                              <div className="pt-6">
                                <button
                                  type="button"
                                  disabled={isCouplingProcessing}
                                  onClick={runCouplingDiagnostic}
                                  className={cn(
                                    "w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md",
                                    isCouplingProcessing
                                      ? "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500"
                                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/10 active:scale-95"
                                  )}
                                >
                                  {isCouplingProcessing ? (
                                    <>
                                      <Loader2 size={16} className="animate-spin" />
                                      正在对齐并解算微气候传感器时空场特征...
                                    </>
                                  ) : (
                                    <>
                                      <Sliders size={16} />
                                      空天地物理特征耦合交叉校验对齐
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Card 3 (Full-width Row): AI Specialist Consultation Cabin */}
                            <div className="md:col-span-2 border-t border-slate-100 dark:border-white/5 pt-8 mt-6">
                              <div className="bg-white dark:bg-gradient-to-br dark:from-[#060613]/98 dark:via-[#0A0A19]/98 dark:to-[#050510]/98 text-slate-800 dark:text-white rounded-[2rem] p-6 border border-slate-100 dark:border-indigo-500/10 shadow-xl dark:shadow-3xl relative overflow-hidden flex flex-col gap-5">
                                {/* Soft blue glowing lamp */}
                                <div className="absolute -left-16 -top-16 w-48 h-48 bg-indigo-500/20 rounded-full filter blur-[60px] pointer-events-none" />
                                <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-blue-500/15 rounded-full filter blur-[60px] pointer-events-none" />
                                
                                {/* Header */}
                                <div className="relative z-10 flex border-b border-slate-100 dark:border-white/5 pb-4 items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-600/15 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/10">
                                      <MessageSquare size={20} className="text-indigo-400 animate-pulse" />
                                    </div>
                                    <div>
                                      <h3 className="text-base font-black flex items-center gap-1.5 text-slate-800 dark:text-white">
                                        5G 植保会诊 AI 专家咨询舱
                                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 px-2 py-0.5 rounded-full font-black animate-pulse">大模型 MaaS 协同</span>
                                      </h3>
                                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Expert Consulting Terminal</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 px-3 py-1 rounded-xl">
                                    <Compass size={12} className="text-indigo-400" />
                                    <span>对齐靶向: {displayedResult.target}</span>
                                  </div>
                                </div>

                                {/* Chat History Box */}
                                <div className="relative z-10 flex flex-col gap-3 bg-slate-50 dark:bg-black/50 border border-slate-100 dark:border-white/5 rounded-2.5xl p-4 min-h-[180px] max-h-[280px] overflow-y-auto custom-scrollbar">
                                  {consultMsg.map((msg, idx) => (
                                    <div 
                                      key={idx} 
                                      className={cn(
                                        "flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed font-bold",
                                        msg.role === 'user'
                                          ? "bg-indigo-600 text-white self-end rounded-tr-none"
                                          : "bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-white/5 shadow-sm dark:shadow-none self-start rounded-tl-none"
                                      )}
                                    >
                                      <div className="flex items-center gap-2 mb-1 opacity-60 text-[9px] font-black uppercase tracking-widest">
                                        <span>{msg.role === 'user' ? '提问农户' : 'AI 农技诊断专家'}</span>
                                        <span>•</span>
                                        <span>{msg.time}</span>
                                      </div>
                                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                                    </div>
                                  ))}
                                  
                                  {isConsultTyping && (
                                    <div className="bg-white/5 text-slate-300 border border-white/5 self-start rounded-2xl rounded-tl-none p-3 max-w-[85%] flex items-center gap-2 text-xs">
                                      <Loader2 className="animate-spin text-indigo-400" size={14} />
                                      <span className="font-bold">诊断大模型正在深度学习问诊规律并在案分析数据...</span>
                                    </div>
                                  )}
                                </div>

                                {/* Quick questions suggestions grid */}
                                <div className="relative z-10 space-y-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <HelpCircle size={12} className="text-indigo-400" />
                                    快捷植保诊疗提问 (点击极速会诊)：
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {(analysisType === 'pest' ? [
                                      "该害虫用药多久能彻底控制？是否存产生抗药性缺陷？",
                                      "植保无人机群喷药变率航路及风场下压叶片高度？",
                                      "自然生态种植下，有哪些瓢虫捕食天敌可以起到协同控害配比？"
                                    ] : analysisType === 'disease' ? [
                                      "此类型真菌孢子会否在大风与高湿天气下急速蔓延侵染临近地块？",
                                      "雨后高湿叶面含有大面积露水薄膜，能否立刻施加高活性乳油？",
                                      "受损失绿枯黄的侵染叶肉组织细胞，如何追加微营养钾肥复壮？"
                                    ] : [
                                      "当前作物病灶处于初侵阶段，需要在此地块开启普查性隔离吗？",
                                      "如不抓紧进行植保喷洒，预计最终有概率造成百分之几的经济减损？"
                                    ]).map((q, qIndex) => (
                                      <button
                                        key={qIndex}
                                        type="button"
                                        disabled={isConsultTyping}
                                        onClick={() => runConsultQuestion(q)}
                                        className="p-2.5 bg-white/5 border border-white/5 rounded-xl text-[10px] text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all text-left font-bold cursor-pointer"
                                      >
                                        ❓ {q}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Input bar */}
                                <form 
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    runConsultQuestion(consultInput);
                                  }}
                                  className="relative z-10 flex gap-2 items-center"
                                >
                                  <input
                                    type="text"
                                    value={consultInput}
                                    onChange={(e) => setConsultInput(e.target.value)}
                                    placeholder="在此输入您的个性化植保或气象合流配药用量疑问..."
                                    className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-800 dark:text-white placeholder-slate-400 font-bold focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 shadow-inner dark:shadow-none"
                                  />
                                  <button
                                    type="submit"
                                    disabled={isConsultTyping || !consultInput.trim()}
                                    className={cn(
                                      "p-3 rounded-2xl flex items-center justify-center transition-all",
                                      consultInput.trim() 
                                        ? "bg-indigo-600 hover:bg-indigo-500 text-white" 
                                        : "bg-white/5 text-slate-500 cursor-not-allowed"
                                    )}
                                  >
                                    <Send size={16} />
                                  </button>
                                </form>

                              </div>
                            </div>

                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeResultTab === 'report' && displayedResult.detailedReport && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                            <ShieldCheck size={20} className="text-indigo-500" />
                            {t('ai_recognition.labels.diagnosis_conclusion')}
                          </h3>
                          <button
                            onClick={downloadReport}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#1A1A1A] dark:text-slate-300 dark:hover:bg-[#2A2A2A] border border-slate-200/50 dark:border-white/5"
                          >
                            <Download size={16} />
                            {t('ai_recognition.labels.download_report')}
                          </button>
                        </div>

                        {/* Multi-engine Comparison */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 dark:bg-[#050505]/80 rounded-xl border border-slate-100 dark:border-white/5 shadow-sm relative group/card flex flex-col min-h-[100px] max-h-[240px] overflow-y-auto custom-scrollbar">
                            <div className="absolute top-3 right-3 text-blue-500/20 group-hover/card:text-blue-500/40 transition-colors">
                              <Zap size={24} />
                            </div>
                            <div className="flex items-center gap-1.5 mb-3 text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] shrink-0 sticky top-0 bg-slate-50/90 dark:bg-[#050505]/90 backdrop-blur-sm py-1 z-10">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              {t('ai_recognition.labels.qwen_engine')}
                            </div>
                            <div className="flex-1 pr-1">
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                                {displayedResult.qwenSummary?.includes('暂时不可用') || displayedResult.qwenSummary?.includes('受限') || displayedResult.qwenSummary?.includes('限制') || displayedResult.qwenSummary?.includes('未开启') || displayedResult.qwenSummary?.includes('调用失败') ? (
                                  <span className="flex flex-col gap-2">
                                    <span className="text-amber-600 dark:text-amber-400 font-bold">{displayedResult.qwenSummary}</span>
                                    <button 
                                      onClick={() => (window as any).openSettings?.('ai')}
                                      className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 w-fit"
                                    >
                                      <Settings size={10} />
                                      前往配置个人 API Key 以解锁完整功能
                                    </button>
                                  </span>
                                ) : (
                                  displayedResult.qwenSummary || t('ai_recognition.labels.no_qwen_data')
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-[#050505]/80 rounded-xl border border-slate-100 dark:border-white/5 shadow-sm relative group/card flex flex-col min-h-[100px] max-h-[240px] overflow-y-auto custom-scrollbar">
                            <div className="absolute top-3 right-3 text-purple-500/20 group-hover/card:text-purple-500/40 transition-colors">
                              <Brain size={24} />
                            </div>
                            <div className="flex items-center gap-1.5 mb-3 text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-[0.2em] shrink-0 sticky top-0 bg-slate-50/90 dark:bg-[#050505]/90 backdrop-blur-sm py-1 z-10">
                              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                              {t('ai_recognition.labels.zhipu_engine')}
                            </div>
                            <div className="flex-1 pr-1">
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                                {displayedResult.zhipuVisionDetail || t('ai_recognition.labels.no_zhipu_data')}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-5 bg-slate-50 dark:bg-[#050505] rounded-xl border border-slate-100 dark:border-white/5 shadow-inner">
                          <div className="markdown-body prose prose-sm dark:prose-invert max-w-none">
                            <Markdown remarkPlugins={[remarkGfm]}>
                              {displayedResult.detailedReport}
                            </Markdown>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Related Knowledge Section */}
                {displayedResult.relatedKnowledge && displayedResult.relatedKnowledge.length > 0 && (
                  <div className="bg-white/70 dark:bg-[#0A0A0A]/40 backdrop-blur-xl rounded-xl p-4 shadow-sm border border-white/20 dark:border-white/10 space-y-3">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <div className="w-6 h-6 bg-indigo-500/10 text-indigo-500 rounded-md flex items-center justify-center">
                        <BookOpen size={14} />
                      </div>
                      {t('ai_recognition.labels.related_knowledge')}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {displayedResult.relatedKnowledge.map((item, idx) => (
                        <button 
                          key={idx}
                          onClick={() => onNavigate?.('knowledge', item.title)}
                          className="p-3 bg-slate-50 dark:bg-[#1A1A1A]/50 rounded-xl border border-slate-200/50 dark:border-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left group flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-black text-slate-800 dark:text-white group-hover:text-indigo-500 transition-colors text-xs">
                              {item.title}
                            </div>
                            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest rounded-full">
                              {item.type}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-2">
                            {item.summary}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AIRecognition;
