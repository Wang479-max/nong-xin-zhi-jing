import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Bug, Sprout, BookOpen, ShoppingBag, BrainCircuit, Settings2, 
  FileBarChart, Users, Upload, Check, ChevronRight, Play, Eye, 
  Thermometer, Droplets, Sun, Activity, Search, ShieldAlert, Zap, 
  MessageSquare, Send, RotateCcw, Download 
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Types for props
interface InteractiveCenterProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
  onAddLog: (logText: string) => void;
  onNavigate?: (tab: string, query?: string) => void;
}

export default function InteractiveCenter({ isOpen, onClose, initialTab = 'pest', onAddLog, onNavigate }: InteractiveCenterProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const tabs = [
    { id: 'pest', label: '病虫害识别', icon: Bug, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10 dark:bg-rose-500/20' },
    { id: 'growth', label: '作物生长分析', icon: Sprout, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
    { id: 'encyclopedia', label: '农事百科', icon: BookOpen, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-500/20' },
    { id: 'mall', label: '农资商城', icon: ShoppingBag, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10 dark:bg-orange-500/20' },
    { id: 'decision', label: '智能决策', icon: BrainCircuit, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10 dark:bg-indigo-500/20' },
    { id: 'device', label: '设备控制', icon: Settings2, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 dark:bg-purple-500/20' },
    { id: 'report', label: '数据报表', icon: FileBarChart, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/10 dark:bg-cyan-500/20' },
    { id: 'expert', label: '专家咨询', icon: Users, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 dark:bg-amber-500/20' }
  ];

  // 1. 病虫害识别 State
  const [pestStage, setPestStage] = useState<'upload' | 'scanning' | 'result'>('upload');
  const [selectedLeaf, setSelectedLeaf] = useState<any>(null);
  const sampleLeaves = [
    { id: 'leaf_01', crop: '黄瓜', name: '黄瓜白粉病', severity: '重度', prob: '96.8%', img: '🍂', text: '叶片呈现典型粉斑，边缘呈波浪卷曲。' },
    { id: 'leaf_02', crop: '小麦', name: '小麦条锈病', severity: '中度', prob: '94.2%', img: '🌾', text: '叶鞘存在金黄色粉状条斑，长成长条突起。' },
    { id: 'leaf_03', crop: '番茄', name: '番茄晚疫病', severity: '轻度', prob: '89.1%', img: '🍅', text: '叶尖呈水渍状暗绿斑块，后变褐枯萎。' }
  ];

  const handleStartPestScan = () => {
    if (!selectedLeaf) return;
    setPestStage('scanning');
    setTimeout(() => {
      setPestStage('result');
      onAddLog(`[AI-DIAGNOSTIC] 病虫害检测完成: ${selectedLeaf.name} (概率 ${selectedLeaf.prob})。已生成优化药剂防治建议。`);
    }, 2500);
  };

  // 2. 作物生长分析 State
  const [growthSelectedPlot, setGrowthSelectedPlot] = useState('p1');
  const growthPlotData: Record<string, any> = {
    p1: { name: 'A-1 小麦区', ndvi: 0.81, chlorophyll: '52.4 SPAD', lai: 4.12, canopy: '88%', health: '优', recommendation: '目前冠层饱满，氮素代谢充足。建议延长现有灌溉周期。' },
    p2: { name: 'B-2 玉米区', ndvi: 0.58, chlorophyll: '41.2 SPAD', lai: 2.80, canopy: '62%', health: '中', recommendation: '冠层反射偏低，疑似叶绿素合成受阻，建议补充 0.3% 磷酸二氢钾。' },
    p3: { name: 'C-3 大豆区', ndvi: 0.74, chlorophyll: '48.9 SPAD', lai: 3.65, canopy: '80%', health: '优', recommendation: '处于分枝快速成长期，墒情良好，维持日常滴灌模式。' },
  };

  // 3. 农事百科 State
  const [wikiCategory, setWikiCategory] = useState<'grain' | 'economic' | 'greenhouse'>('grain');
  const [wikiSearch, setWikiSearch] = useState('');
  const wikiData = [
    { id: 'w1', title: '小麦水利灌溉与养分黄金配方', category: 'grain', temp: '12-25°C', ph: '6.0-7.2', irrigation: '拔节期单次 45 m³/亩', text: '冬小麦春季拔节期是决定亩穗数和穗粒数的关键。需配施高氮复合肥。' },
    { id: 'w2', title: '玉米大田全生命成长周期图谱', category: 'grain', temp: '18-32°C', ph: '5.5-6.8', irrigation: '大喇叭口期 50 m³/亩', text: '玉米大喇叭口期是需肥临界期，必须在行间深施速效尿素以保产量。' },
    { id: 'w3', title: '番茄温室大棚精细化管理指引', category: 'greenhouse', temp: '15-28°C', ph: '6.0-7.0', irrigation: '开花结果期 每天滴灌 1.5L/株', text: '棚内空气湿度需控制在50-60%间，谨防高湿高气温诱发霉斑、疫病。' },
    { id: 'w4', title: '苹果花期精量飞防与果实套袋', category: 'economic', temp: '14-26°C', ph: '5.8-7.5', irrigation: '萌芽至果实快速膨大期灌水', text: '花露红期一过，应以中量多抗生防试剂做预防喷洒。' }
  ];

  const filteredWiki = wikiData.filter(item => {
    const matchesCat = item.category === wikiCategory;
    const matchesSearch = item.title.includes(wikiSearch) || item.text.includes(wikiSearch);
    return matchesCat && (wikiSearch ? matchesSearch : true);
  });

  // 4. 农资商城 State & Custom Generator of 150 items
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [mallSearch, setMallSearch] = useState('');
  const [mallCategory, setMallCategory] = useState<'all' | 'seeds' | 'sensors' | 'pesticides' | 'fertilizers' | 'machinery'>('all');

  const shopItems = React.useMemo(() => {
    const items: Array<{id: string, name: string, price: number, stock: number, unit: string, desc: string, category: string, categoryName: string, icon: string}> = [];
    
    const categories = [
      { id: 'seeds', name: '特优作物种子', icon: '🌾',
        prefixes: ['天优麦', '科农玉', '楚双粳', '极光番茄', '香仙莓', '中黄矮豆', '抗热油麦', '鲁杂花', '新海棉'],
        adjectives: ['高抗折倒型', '复合抗旱白粉版', '特高产太空代', '拔节饱满型', '极高甜果蜜级', '双防速生抗旱株'],
        units: ['袋', '袋', '包', '袋', '罐', '包'],
        basePrice: 42,
        descTemplate: '国家一级繁育繁育，实验室芽率测试达99.6%，可增加前期抗倒伏比例18%。'
      },
      { id: 'sensors', name: '感知与测控智慧装备', icon: '📡',
        prefixes: ['LoRa无线土壤探针', '微型红外叶温遥测仪', '多深度探针式氮磷钾计', '高频变频微滴阀', '大棚自适应智能化卷拉帘', '全天候空气负氧气象站'],
        adjectives: ['Pro-X9极速型', 'NanoG3长寿命版', 'AgroSys物联网版', 'NX-F1集成款', 'AutoFeed微调型'],
        units: ['台', '台', '套', '个', '个', '套'],
        basePrice: 350,
        descTemplate: '即插即用，内建卫星多频LoRa对接组件，防尘抗污防水等级达IP68。'
      },
      { id: 'pesticides', name: '绿色生物生防制剂', icon: '🧪',
        prefixes: ['枯草芽孢杆菌悬乳粉', '哈茨木霉抗霉生防袋', '25%吡唑醚菌悬浮微乳', '大田捕线多糖活性制剂', '低毒环保高效多杀霉素', '黑霉素特种抑病配方'],
        adjectives: ['高倍稀释特制', '大田高浓度系列', '安全生物低害配方', '防白粉极速修复版'],
        units: ['瓶', '袋', '瓶', '袋', '瓶', '盒'],
        basePrice: 60,
        descTemplate: '农业委认可绿通药，靶向杀灭，对天敌无害，支持极低药害残留。'
      },
      { id: 'fertilizers', name: '高活性促渗微量肥料', icon: '💧',
        prefixes: ['超精磷酸二氢钾结析', '氨基酸微量元素复合液', '高能碳基灌溉冲施原液', '富硒益生促生长配方', '有机质黄腐酸根部促进素'],
        adjectives: ['15kg大配罐', '5L浓缩大田桶', '活性螯合高渗透型', '生长期速补微量包'],
        units: ['袋', '桶', '桶', '包', '袋'],
        basePrice: 110,
        descTemplate: '活性中微量复配加乘，直达植物根毛胞质，加快春灌春播对叶面绿植叶绿素的周转率。'
      },
      { id: 'machinery', name: '现代智农无人操作机械', icon: '🚜',
        prefixes: ['智能自主履带除草喷扫越野车', '八轴高负压双喷头飞防无人机', '智能激光测距土地平整机械车', '一体复合精密施肥耕种拖斗车'],
        adjectives: ['Tech-900AI极黑', 'AeroX-24精飞版', 'Navi-Beidou3代', 'CropCare-T80大田型'],
        units: ['台', '台', '套', '套'],
        basePrice: 1800,
        descTemplate: '搭载高清光谱红外航迹规划摄像头，支持北斗亚厘米高自导精准偏航控制。'
      }
    ];
    
    categories.forEach(cat => {
      for (let i = 1; i <= 30; i++) {
        const prefix = cat.prefixes[(i - 1) % cat.prefixes.length];
        const adj = cat.adjectives[(i + 4) % cat.adjectives.length];
        const unit = cat.units[(i + 2) % cat.units.length];
        
        const price = cat.basePrice + (i * 8) + ((i % 5) * 11);
        const stock = 20 + ((i * 7) % 180);
        
        const name = `${prefix} (${adj} #${i})`;
        const desc = `${cat.descTemplate} 规格: ${i * 4}${unit === '台' || unit === '套' || unit === '个' || unit === '支' ? '个/独立集成模组' : '0g纯度精封'}。`;
        
        items.push({
          id: `p_${cat.id}_${i}`,
          name,
          price,
          stock,
          unit,
          desc,
          category: cat.id,
          categoryName: cat.name,
          icon: cat.icon
        });
      }
    });
    
    return items;
  }, []);

  const filteredShopItems = React.useMemo(() => {
    return shopItems.filter(item => {
      const matchesCat = mallCategory === 'all' || item.category === mallCategory;
      const matchesSearch = (item.name || '').toLowerCase().includes((mallSearch || '').toLowerCase()) ||
                            (item.desc || '').toLowerCase().includes((mallSearch || '').toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [shopItems, mallCategory, mallSearch]);

  const addToCart = (id: string) => {
    setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => {
      const next = { ...prev };
      if (next[id] <= 1) delete next[id];
      else next[id]--;
      return next;
    });
  };

  const getCartTotal = () => {
    return Object.entries(cart).reduce((total, [id, qty]) => {
      const item = shopItems.find(i => i.id === id);
      return total + (item ? item.price * qty : 0);
    }, 0);
  };

  const handleCheckout = () => {
    const total = getCartTotal();
    if (total === 0) return;
    setShowOrderSuccess(true);
    onAddLog(`[SHOPPING] 农资集采订单确认成功! 合计金额 ¥${total}.00。系统已对接最近仓储网点排单配送。`);
    setTimeout(() => {
      setShowOrderSuccess(false);
      setCart({});
    }, 3000);
  };

  // 5. 智能决策 State
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const commonQuestions = [
    '未来有大风降温，应该对作物采取哪些抗寒保墒防御？',
    '连续多阴雨导致寡照低光敏，草莓果子不亮怎么办？',
    '农田粘性较强、容易积水泛氧，如何调整灌溉参数？'
  ];

  const generateAiAnswer = (questionText: string) => {
    setAiQuestion(questionText);
    setAiAnalyzing(true);
    setAiAnswer('');
    
    setTimeout(() => {
      setAiAnalyzing(false);
      let ans = '';
      if (questionText.includes('大风降温')) {
        ans = `💡 【气相防御专项建议 - 北方倒春寒】 \n1. 【保墒保温】：傍晚前提前喷洒 0.2% 磷酸二氢钾及抗逆油，提高细胞胞质浓度，防止叶绿体结冰碎裂。\n2. 【棚膜微闭】：提前锁定卷帘遮阳网，维持棚内高湿状态来缓和降温剧烈坡度。\n3. 【精孔滴灌】：在明日早8点，利用深井水进行少量(12m³/亩)短脉冲滴灌，通过深层水比热容有效垫高地表初始温，降温缓冲率可提升2.4-3°C。`;
      } else if (questionText.includes('连续多阴雨')) {
        ans = `💡 【寡照光合专项建议 - 草莓着色增甜】 \n1. 【高效补光】：开花结果期急需 430nm-460nm(蓝光) & 640nm-660nm(红光) 的脉冲复合光谱补光，以150LUX强度在清晨 6-9 点进行3小时早春晨补。\n2. 【温度调节】：阴雨天白昼降至18°C，夜间降低至10°C以促使光合淀粉在果实汇集，避免徒长浪费碳源。`;
      } else {
        ans = `💡 【重壤透气专项建议 - 排水排滞】 \n1. 【灌溉变频】：改长时期高强度漫灌为两段式短波间歇滴灌，关闭高泵恒压。每次仅15分钟以便重粘性土壤产生物理收缩裂隙透氧。\n2. 【物理松土】：建议行间浅耕10公分以隔断毛细吸水通道，促进底层游离根系生长。`;
      }
      setAiAnswer(ans);
      onAddLog(`[AI-DECISION] 专家系统回复了您的问题: "${questionText.slice(0,10)}..."`);
    }, 2000);
  };

  // 6. 设备控制 State
  const [devices, setDevices] = useState([
    { id: 'd01', name: 'A-1区 自适应智能脉冲滴灌泵', active: true, desc: '流速 30 L/h • 运行中' },
    { id: 'd02', name: '植保无人机 312号 (机库3)', active: false, desc: '电量 98% • 待命中' },
    { id: 'd03', name: 'D-3 育苗方舱 双向负压排风扇', active: true, desc: '频率 45Hz • 换气中' },
    { id: 'd04', name: 'D-3 温室 双向抗紫外遮阳帘卷轴', active: false, desc: '角度 0° • 闭合中' }
  ]);

  const toggleDevice = (id: string) => {
    setDevices(prev => prev.map(dev => {
      if (dev.id === id) {
        const nextState = !dev.active;
        onAddLog(`[DEVICE-CONTROL] 高频控制指令下发 - 设备: "${dev.name}" 已切换至 ${nextState ? '【启用在线运行】' : '【离线备用挂起】'}`);
        return { ...dev, active: nextState, desc: nextState ? '流速/频率已调整 • 运行中' : '设备就位 • 待命中' };
      }
      return dev;
    }));
  };

  // 7. 数据报表 State
  const [reportPeriod, setReportPeriod] = useState<'24h' | '7d'>('24h');
  const reportTelemetry = [
    { time: '01:00', temp: 18.2, hum: 65, soil: 58.1, light: 0 },
    { time: '05:00', temp: 17.1, hum: 68, soil: 57.9, light: 1200 },
    { time: '09:00', temp: 22.4, hum: 55, soil: 56.5, light: 32540 },
    { time: '13:00', temp: 27.2, hum: 42, soil: 54.2, light: 75420 },
    { time: '17:00', temp: 24.8, hum: 48, soil: 55.8, light: 18200 },
    { time: '21:00', temp: 20.3, hum: 60, soil: 57.4, light: 50 }
  ];

  const handleExportCsv = () => {
    // Generate a valid CSV string!
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Time,Temperature(C),Humidity(%),SoilMoisture(%),LightIntensity(Lux)\n";
    reportTelemetry.forEach(r => {
      csvContent += `${r.time},${r.temp},${r.hum},${r.soil},${r.light}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `NX_Farm_Telemetry_Report_${reportPeriod}.csv`);
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
    
    onAddLog(`[REPORT] 成功导出 [${reportPeriod}] CSV时序遥测台账报告。已就绪至本地磁盘空间。`);
  };

  // 8. 专家咨询 State
  const [messages, setMessages] = useState([
    { id: 1, sender: 'expert', name: '王院士 (国家设施农业首席科学家)', content: '你好，小叶。根据遥感谱段返还的光谱数据显示，3号地块（大豆核心区）的近红外谱段反射比例昨天有些降低，这表明植株的水分储留效率在降低。建议你在上午10:00前，使用我们的微变水肥模式滴灌20分钟。', time: '10:15' }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [expertIsTyping, setExpertIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expertIsTyping]);

  const handleSendMsg = () => {
    if (!inputMsg.trim()) return;
    const userMsg = inputMsg;
    setMessages(prev => [...prev, { id: Date.now(), sender: 'user', name: '园区网格员', content: userMsg, time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) }]);
    setInputMsg('');
    setExpertIsTyping(true);

    setTimeout(() => {
      setExpertIsTyping(false);
      let reply = '收到，小叶。正在分析。我们的设施物联网联动建议是：你可以首先查看该大棚的自适应遮阳网上升高度，目前日光辐射已达 4.5万 LUX。过高的直射强辐射确实会造成过呼吸作用。我已经为你在设备控制中激活了自适应遮阳帘的部分关闭命令，保持环境平衡。你可以观察看长势指数有无回升。';
      if (userMsg.includes('肥料') || userMsg.includes('配方') || userMsg.includes('尿素')) {
        reply = '关于你询问的水肥比例：针对拔节孕穗期的小麦，推荐中量高氮配方 N-P2O5-K2O 比例设定为 24:12:14，通过我们的物联网高精变频水密混合器注入。你可以直接在商城下单“螯合复合多维肥”进行试用。';
      } else if (userMsg.includes('虫') || userMsg.includes('斑') || userMsg.includes('锈病')) {
        reply = '听到你提到有斑点问题。建议尽快使用我们的病虫害识别系统，上传受害叶子的扫描片。叶子的脉络、霉层质感能迅速让我们分析到底是锈病还是叶霉病，早期的精准施药能节约 85% 以上挽损成本。';
      }
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'expert', name: '王院士', content: reply, time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) }]);
      onAddLog(`[EXPERTS-SAT] 成功接收国家农业专家线上指令反馈。`);
    }, 1800);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-6 lg:p-10 select-none">
        {/* Backdrop overlay */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/65 backdrop-blur-xl z-[99998]"
        />

        {/* Modal Outer Container */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 150 }}
          className="relative w-full max-w-[1280px] h-[88vh] max-h-[88vh] bg-white dark:bg-slate-900 rounded-[2.5rem] sm:rounded-[3.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] border border-slate-100/50 dark:border-white/5 flex overflow-hidden z-[99999]"
        >
          {/* Decorative subtle border line inside */}
          <div className="absolute inset-0 border border-slate-200/50 dark:border-white/5 rounded-[2.5rem] sm:rounded-[3.5rem] pointer-events-none z-50 overflow-hidden" />

          {/* Left Navigation Rails - Award Level Sleek Vertical Tabs */}
          <aside className="w-80 bg-slate-50 dark:bg-[#0b0c10] border-r border-slate-100 dark:border-white/5 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 shrink-0 hidden md:flex">
            <div className="space-y-8">
              <div className="flex flex-col gap-1.5 pl-2">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] font-mono leading-none">Intelligence Engine</span>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter italic">天算智农控制流</h3>
              </div>

              <div className="space-y-2">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-[1.8rem] text-left transition-all duration-300 relative overflow-hidden group/btn",
                      activeTab === tab.id 
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl shadow-slate-900/10 scale-[1.03]" 
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 dark:hover:bg-white/5 dark:hover:text-white"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center transition-transform group-hover/btn:rotate-12",
                      activeTab === tab.id ? "bg-emerald-500 text-white" : "bg-white dark:bg-slate-800 border border-slate-105 dark:border-white/5 shadow-sm"
                    )}>
                      <tab.icon size={20} />
                    </div>
                    <span className="text-sm font-black tracking-tight">{tab.label}</span>
                    <ChevronRight size={14} className={cn("ml-auto transition-transform", activeTab === tab.id ? "text-emerald-400 translate-x-0" : "text-slate-300 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-1")} />
                  </button>
                ))}
              </div>
            </div>

            {/* Quick System Badge */}
            <div className="border-t border-slate-100 dark:border-white/5 pt-6 mt-6 flex items-center gap-3 pl-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono">Satellite Node Active</span>
            </div>
          </aside>

          {/* Right Main Interactive Work Area */}
          <main className="flex-1 bg-white dark:bg-[#121216] p-6 sm:p-10 flex flex-col overflow-y-auto relative min-w-0">
            {/* Top Close Bar */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-white/5 mb-8 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-slate-900 dark:bg-white rounded-full" />
                <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight italic">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h4>
              </div>
              <button 
                onClick={onClose}
                className="w-12 h-12 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-application Modules Switcher */}
            <div className="flex-1 overflow-y-auto pr-1">
              
              {/* 1. 病虫害识别 */}
              {activeTab === 'pest' && (
                <div className="h-full flex flex-col gap-6">
                  {pestStage === 'upload' && (
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="space-y-6">
                        {/* National Award Level Dynamic Navigation Banner */}
                        <div className="p-6 bg-gradient-to-r from-rose-500 to-amber-500 text-white rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl shadow-rose-500/10 hover:shadow-rose-500/20 transition-all duration-300">
                          <div className="space-y-1">
                            <h5 className="font-black text-base tracking-tight flex items-center gap-2">
                              <span>🛸</span> AI 病虫害自主诊断高级控制流舱
                            </h5>
                            <p className="text-[11px] text-white/80 font-medium">
                              发现更复杂的病虫害或想针对自建的大田、土地图像实地拍摄诊断？本软件独创的脑神经多光谱比对模型，可提供顶级诊断书。
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              onClose();
                              onNavigate?.('ai');
                            }}
                            className="px-5 py-2.5 bg-white hover:bg-slate-900 text-rose-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 whitespace-nowrap shrink-0 flex items-center gap-1.5"
                          >
                            前往自主诊断模块 <ChevronRight size={14} />
                          </button>
                        </div>

                        <div className="p-6 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-3xl">
                          <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400 leading-relaxed">
                            💡 **操作提示**：本识别系统连接农业部顶级多光谱生防智库，支持亚微量霉斑点检测。点击下方精选病害实片，或上传田间病态叶子，即可运行全维度生防扫描诊断。
                          </p>
                        </div>
                        <h5 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 pr-2">选择现场病态标本作AI扫描：</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                          {sampleLeaves.map(leaf => (
                            <div 
                              key={leaf.id}
                              onClick={() => setSelectedLeaf(leaf)}
                              className={cn(
                                "p-6 rounded-[2rem] border cursor-pointer transition-all duration-300 relative overflow-hidden",
                                selectedLeaf?.id === leaf.id 
                                  ? "border-emerald-500 bg-emerald-50/20 dark:bg-emerald-500/10 shadow-xl shadow-emerald-500/5" 
                                  : "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-white/10"
                              )}
                            >
                              <div className="text-4xl mb-4">{leaf.img}</div>
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{leaf.crop} • {leaf.severity}度</span>
                              <h6 className="text-sm font-black text-slate-800 dark:text-white mt-1">{leaf.name}</h6>
                              <p className="text-xs text-slate-400 dark:text-slate-400 font-medium mt-2 leading-relaxed">{leaf.text}</p>
                              <div className="absolute top-4 right-4 text-xs font-mono font-black text-emerald-500">{leaf.prob}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-8 border-t border-slate-100 dark:border-white/5 flex justify-end">
                        <button
                          disabled={!selectedLeaf}
                          onClick={handleStartPestScan}
                          className={cn(
                             "px-10 py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3",
                             selectedLeaf 
                               ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl hover:bg-emerald-600 dark:hover:bg-emerald-500 active:scale-95" 
                               : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                          )}
                        >
                          <Play size={16} /> 开始智能扫描诊断
                        </button>
                      </div>
                    </div>
                  )}

                  {pestStage === 'scanning' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                      <div className="relative w-40 h-40 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[2.5rem] flex items-center justify-center mb-6 overflow-hidden">
                        <div className="text-7xl animate-pulse">{selectedLeaf?.img}</div>
                        {/* Interactive green scanning beam slider */}
                        <div className="absolute left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_15px_#10b981] animate-bounce" />
                      </div>
                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] font-mono animate-pulse">Running AI Multispectral Scan</span>
                      <h5 className="text-lg font-black text-slate-800 dark:text-white mt-2">正在提取叶脉反射率与色素斑纹深度物种特征...</h5>
                    </div>
                  )}

                  {pestStage === 'result' && (
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                        {/* Left Details */}
                        <div className="md:col-span-4 p-8 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[2.5rem] flex flex-col justify-center items-center text-center">
                          <div className="text-8s mb-4 font-mono">🩺</div>
                          <span className="text-[10px] font-black text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-3 py-1 rounded-full uppercase tracking-widest mb-2 font-mono">{selectedLeaf?.prob} 确信指数</span>
                          <h5 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{selectedLeaf?.name}</h5>
                          <p className="text-sm font-medium text-slate-400 dark:text-slate-500 mt-2">宿主：{selectedLeaf?.crop}</p>
                        </div>

                        {/* Right Prescriptions */}
                        <div className="md:col-span-8 space-y-6">
                          <div className="flex items-center gap-3">
                             <div className="w-1.5 h-6 bg-rose-500 rounded-full" />
                             <h6 className="text-lg font-black text-slate-800 dark:text-white">定制化生防化学与物理处方：</h6>
                          </div>

                          <div className="space-y-4">
                            <div className="p-5 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">飞防化学制剂 (Chemical Formula)</span>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">25% 吡唑醚菌酯悬浮剂 (1500x 稀释) 联合生物保护性多糖复剂。</p>
                            </div>
                            <div className="p-5 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">无损流变物理操控 (Agricultural Operation)</span>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">立即通过物联网自适应阀，降低对应地块日均湿度至48%以下，通风风机以 45Hz 连续运转排除高湿层。</p>
                            </div>
                            <div className="p-5 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">飞防气候风窗口 (Spraying Wind Window)</span>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">推荐在今日 16:30 后，大风停歇、气温稳定在 18°C 窗口进行飞防。预计减损率达 91%。</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-8 border-t border-slate-100 dark:border-white/5 flex justify-end gap-4">
                        <button
                          onClick={() => setPestStage('upload')}
                          className="px-6 py-4 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-slate-300 text-xs font-black uppercase tracking-widest transition-all"
                        >
                          重新诊断其他地块
                        </button>
                        <button
                          onClick={() => {
                            setPestStage('upload');
                            onClose();
                          }}
                          className="px-8 py-4 rounded-xl bg-slate-900 dark:bg-white hover:bg-emerald-600 dark:hover:bg-emerald-500 text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest shadow-lg transition-all"
                        >
                          应用环境控制方针并关闭
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. 作物生长分析 */}
              {activeTab === 'growth' && (
                <div className="space-y-8">
                  <div className="flex gap-3 pb-2 border-b border-slate-50 dark:border-white/5">
                    {Object.entries(growthPlotData).map(([id, info]) => (
                      <button
                        key={id}
                        onClick={() => setGrowthSelectedPlot(id)}
                        className={cn(
                          "px-6 py-2.5 rounded-2xl text-xs font-black transition-all",
                          growthSelectedPlot === id 
                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg" 
                            : "bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                        )}
                      >
                        {info.name}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-center">
                       <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">均一化绿植指数 (NDVI)</span>
                       <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter italic">{growthPlotData[growthSelectedPlot].ndvi}</span>
                       <div className="mt-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">正常健康区间 [0.55 - 0.90]</div>
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-center">
                       <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">叶绿素浓度指数</span>
                       <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter italic">{growthPlotData[growthSelectedPlot].chlorophyll}</span>
                       <div className="mt-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">正常健康区间 ≥ 38 SPAD</div>
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-center">
                       <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">叶面积指数 (LAI)</span>
                       <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter italic">{growthPlotData[growthSelectedPlot].lai}</span>
                       <div className="mt-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">预测亩均生物量 3.25吨</div>
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-center">
                       <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">冠层饱满覆盖率</span>
                       <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter italic">{growthPlotData[growthSelectedPlot].canopy}</span>
                       <div className="mt-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">健康状态评估: {growthPlotData[growthSelectedPlot].health}</div>
                    </div>
                  </div>

                  {/* National Award Level Growth Navigation Banner */}
                  <div className="p-6 bg-gradient-to-r from-emerald-500 to-indigo-500 text-white rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300">
                    <div className="space-y-1">
                      <h5 className="font-black text-base tracking-tight flex items-center gap-2">
                        <span>📊</span> 全区多维时空作物环境时序预测预警
                      </h5>
                      <p className="text-[11px] text-white/80 font-medium">
                        想查询未来一周或24小时内的完整环境物理波动时序图、土壤多维数据深度核算推荐？前往多源时序监测流即可。
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        onNavigate?.('monitoring');
                      }}
                      className="px-5 py-2.5 bg-white hover:bg-slate-900 text-emerald-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    >
                      前往多维监测预警模块 <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="p-8 bg-slate-900 rounded-[2.5rem] border border-white/5 relative overflow-hidden text-white mt-10">
                     <div className="absolute top-0 right-0 p-6 opacity-[0.05]">
                        <Sprout size={120} />
                     </div>
                     <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest font-mono">Expert Growth Modeling AI Prediction</span>
                     <h5 className="text-lg font-black tracking-tight mt-1 mb-4">作物生理状态研判与滴灌周期调整建议</h5>
                     <p className="text-sm font-medium text-slate-300 leading-relaxed font-sans">{growthPlotData[growthSelectedPlot].recommendation}</p>
                     
                     {/* Horizontal Progress Timeline */}
                     <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between gap-4">
                        {['拔节初期', '拔节后期', '孕穗扬花', '灌浆膨大 (下阶段)', '成熟收割'].map((stage, idx) => (
                           <div key={stage} className="flex-1 flex flex-col items-center gap-1.5 text-center">
                              <div className={cn("w-3 h-3 rounded-full border-2", idx <= 2 ? "bg-emerald-500 border-white" : "bg-transparent border-white/20")} />
                              <span className={cn("text-[10px] font-black tracking-tight", idx <= 2 ? "text-emerald-400" : "text-white/25")}>{stage}</span>
                           </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}

              {/* 3. 农事百科 */}
              {activeTab === 'encyclopedia' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
                    <div className="flex gap-2">
                      {[
                        { id: 'grain', name: '谷物粮食作物' },
                        { id: 'economic', name: '经济特色林果' },
                        { id: 'greenhouse', name: '大棚设施高附加' }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setWikiCategory(cat.id as any)}
                          className={cn(
                            "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                            wikiCategory === cat.id 
                              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow" 
                              : "bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                          )}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-64">
                       <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                       <input 
                         type="text" 
                         placeholder="词条搜索..." 
                         className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 pl-10 pr-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:bg-white dark:focus:bg-[#111] dark:text-white"
                         value={wikiSearch}
                         onChange={(e) => setWikiSearch(e.target.value)}
                       />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5">
                    {filteredWiki.map((item, i) => (
                      <div key={i} className="p-6 bg-slate-50/50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 rounded-3xl hover:border-slate-300 dark:hover:border-white/20 transition-all flex flex-col sm:flex-row items-start justify-between gap-6 group">
                        <div className="space-y-3 flex-1">
                          <h5 className="text-base font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{item.title}</h5>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic pr-4">最佳生长气温：{item.temp} | 适配土壤酸碱度：PH {item.ph}</p>
                          <p className="text-sm text-slate-500 font-medium leading-relaxed">{item.text}</p>
                        </div>
                        <div className="text-right whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 px-5 py-4 rounded-2xl shadow-sm text-xs font-bold">
                           <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-1 italic">水肥配方：</span>
                           <span className="font-semibold text-slate-700 dark:text-slate-300">{item.irrigation}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. 农资商城 */}
              {activeTab === 'mall' && (
                <div className="space-y-8">
                  {/* Top Partner Link Hyperbar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-gradient-to-r from-orange-500/10 to-amber-500/10 dark:from-orange-500/20 dark:to-amber-500/20 border border-orange-500/20 rounded-[2.5rem] gap-4 shadow-sm animate-pulse-subtle">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black text-xl shadow-md select-none">
                        🛒
                      </div>
                      <div>
                         <h5 className="text-sm font-black text-slate-800 dark:text-orange-400">惠农网官方合作伙伴大基地</h5>
                         <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">查看全国实时大宗农副产品、种子价格与供需渠道。如需寻找更多品种，请直达惠农网。</p>
                      </div>
                    </div>
                    <a 
                      href="https://www.cnhnb.com/" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="px-6 py-3 bg-orange-500 hover:bg-orange-600 dark:hover:bg-orange-400 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-2 hover:scale-[1.03] active:scale-[0.98] select-none"
                    >
                      🌐 直达惠农网商城中心 🚀
                    </a>
                  </div>

                  {showOrderSuccess ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-900 rounded-[3rem] text-center border border-slate-100 dark:border-white/5">
                       <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center animate-bounce mb-4 shadow-xl shadow-emerald-500/20">
                          <Check size={32} />
                       </div>
                       <h5 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">集采采购单确认下发成功！</h5>
                       <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-2">已与本地配送点进行排单对接中。</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                      
                      {/* Products Grid & Subcategory Selectors */}
                      <div className="xl:col-span-8 space-y-6">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
                          <div className="flex flex-wrap gap-2">
                            {[
                              { id: 'all', name: '全谱推荐 (150)' },
                              { id: 'seeds', name: '特优种子 (30)' },
                              { id: 'sensors', name: '智农物联 (30)' },
                              { id: 'pesticides', name: '生物生防 (30)' },
                              { id: 'fertilizers', name: '智能微肥 (30)' },
                              { id: 'machinery', name: '现代机装 (30)' }
                            ].map(cat => (
                              <button
                                key={cat.id}
                                onClick={() => setMallCategory(cat.id as any)}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                  mallCategory === cat.id 
                                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow" 
                                    : "bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100"
                                )}
                              >
                                {cat.name}
                              </button>
                            ))}
                          </div>

                          <div className="relative w-full sm:w-64">
                             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                             <input 
                               type="text" 
                               placeholder="过滤 150 个优选产品..." 
                               className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 pl-10 pr-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:bg-white dark:focus:bg-slate-950 transition-colors"
                               value={mallSearch}
                               onChange={(e) => setMallSearch(e.target.value)}
                             />
                          </div>
                        </div>

                        {/* Beautiful Grid Layout */}
                        <div className="max-h-[500px] overflow-y-auto pr-2 space-y-4 no-scrollbar">
                          {filteredShopItems.length === 0 ? (
                            <div className="py-20 text-center text-slate-400 font-bold text-xs flex flex-col items-center gap-2">
                               <span>🔍</span>
                               <span>未匹配到任何农资物料，请尝试其他关键词。</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              {filteredShopItems.map(item => (
                                <div key={item.id} className="p-6 bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[2rem] hover:bg-white dark:hover:bg-slate-900 hover:border-slate-200 dark:hover:border-white/10 hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-black/40 transition-all flex flex-col justify-between gap-6">
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest font-mono select-none">ID: {item.id}</span>
                                      <span className="text-sm select-none">{item.icon}</span>
                                    </div>
                                    <h6 className="text-[14px] font-black text-slate-800 dark:text-white tracking-tight mt-1 leading-tight">{item.name}</h6>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium leading-relaxed mt-2">{item.desc}</p>
                                  </div>

                                  <div className="flex items-center justify-between border-t border-slate-100/50 dark:border-white/5 pt-4">
                                    <span className="text-base font-black text-slate-900 dark:text-white">¥ {item.price} <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 not-italic uppercase">/{item.unit}</span></span>
                                    <button
                                      onClick={() => addToCart(item.id)}
                                      className="px-4 py-2 bg-slate-900 dark:bg-white hover:bg-emerald-600 dark:hover:bg-emerald-500 text-white dark:text-slate-900 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97]"
                                    >
                                      加入采购
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Shopping Cart Drawer */}
                      <div className="xl:col-span-4 p-8 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[2.5rem] flex flex-col justify-between h-fit gap-8 shadow-sm">
                        <div className="space-y-6">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                            <span className="text-xs font-black text-slate-400 dark:text-slate-505 block uppercase tracking-widest font-mono">集中采购清单</span>
                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded italic">SYS-Sync</span>
                          </div>

                          <div className="space-y-4 max-h-[250px] overflow-y-auto no-scrollbar">
                            {Object.keys(cart).length === 0 ? (
                              <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                                 <span>🛒</span>
                                 <span>采购清单暂无明细物料</span>
                              </div>
                            ) : (
                              Object.entries(cart).map(([id, qty]) => {
                                const item = shopItems.find(i => i.id === id);
                                if (!item) return null;
                                return (
                                  <div key={id} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-black text-slate-800 dark:text-white truncate leading-tight">{item.name}</p>
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 font-mono">¥{item.price} * {qty}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => removeFromCart(id)} className="w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-100">-</button>
                                      <span className="text-xs font-black font-mono dark:text-white">{qty}</span>
                                      <button onClick={() => addToCart(id)} className="w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-full flex items-center justify-center text-xs font-bold text-slate-505 hover:bg-slate-100">+</button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="pt-6 border-t border-slate-100 dark:border-white/5 space-y-4">
                           <div className="flex items-baseline justify-between">
                             <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">预算合计:</span>
                             <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">¥ {getCartTotal()}.00</span>
                           </div>
                           <button
                             onClick={handleCheckout}
                             disabled={Object.keys(cart).length === 0}
                             className={cn(
                               "w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                               Object.keys(cart).length > 0
                                 ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-emerald-600 active:scale-95 shadow-lg shadow-slate-200"
                                 : "bg-slate-150 text-slate-350 cursor-not-allowed"
                             )}
                           >
                             确认集中采购下发
                           </button>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* 5. 智能决策 */}
              {activeTab === 'decision' && (
                <div className="flex-1 flex flex-col justify-between gap-8 h-full">
                  <div className="space-y-6">
                    <div className="p-6 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/5 rounded-3xl relative">
                       <span className="text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest font-mono">National Agronomy Research Cloud Grid</span>
                       <h5 className="text-base font-black text-slate-900 dark:text-white tracking-tight mt-1 mb-3">农业部专家研研知识决策系统：</h5>
                       <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">智能引擎将深度比对全省、全网近 12 年的真实小气候物理演变与病虫害数据库。请选择以下高频遇到的异常难题，或输入具体疑难：</p>
                    </div>

                    <div className="space-y-3">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">近期高频农业环境决策（点击专家立即答复）：</span>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {commonQuestions.map(q => (
                             <button
                               key={q}
                               onClick={() => generateAiAnswer(q)}
                               className="p-5 text-left bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-2xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/10 dark:hover:bg-indigo-500/10 transition-all text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed tracking-tight"
                             >
                               {q}
                             </button>
                          ))}
                       </div>
                    </div>

                    <div className="flex gap-4">
                       <input 
                         type="text"
                         placeholder="输入您的田间微气相异象，例如：1号地拔节期温度突降10度、积水怎么防烂根？" 
                         className="flex-1 bg-slate-100 dark:bg-slate-800 border border-transparent rounded-2xl py-4.5 px-6 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 dark:focus:ring-white/10 dark:focus:border-white/20 transition-all focus:bg-white dark:focus:bg-slate-950 dark:text-white"
                         value={aiQuestion}
                         onChange={(e) => setAiQuestion(e.target.value)}
                         onKeyDown={(e) => { e.key === 'Enter' && generateAiAnswer(aiQuestion); }}
                       />
                       <button
                         disabled={!aiQuestion.trim() || aiAnalyzing}
                         onClick={() => generateAiAnswer(aiQuestion)}
                         className={cn(
                           "px-8 py-4.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
                           aiQuestion.trim() ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-indigo-600 dark:hover:bg-indigo-50 shadow" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                         )}
                       >
                         {aiAnalyzing ? '算力评估中...' : '开始AI决策'}
                       </button>
                    </div>
                  </div>

                  {/* Answer Presentation Box with clean typing animations and rich metadata */}
                  <AnimatePresence>
                    {(aiAnalyzing || aiAnswer) && (
                      <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 15 }}
                        className="p-8 bg-slate-900 text-white rounded-[2.5rem] border border-white/5 relative overflow-hidden flex-1 shadow-inner h-fit"
                      >
                         {aiAnalyzing ? (
                           <div className="flex flex-col items-center justify-center py-10 gap-3">
                              <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest font-mono">Expert Neural System Processing</span>
                           </div>
                         ) : (
                           <div className="space-y-4">
                             <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest font-mono italic">AI-DECISION MATCH #9254</span>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 font-mono">
                                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                   STABILIZED MODEL
                                </div>
                             </div>
                             <p className="text-sm font-medium leading-relaxed font-sans text-slate-300 pr-5 whitespace-pre-wrap">
                                {aiAnswer}
                             </p>
                           </div>
                         )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* 6. 设备控制 */}
              {activeTab === 'device' && (
                <div className="space-y-6">
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-3xl">
                     <p className="text-xs font-bold text-emerald-800 leading-relaxed">
                       📡 **操作提示**：控制台已安全加密锁入高阶灌排电磁阀。点击开关执行高频边缘命令会反馈到下方的 **NX 运行日志** 做即时指令记录。
                     </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
                    {devices.map(dev => (
                      <div 
                        key={dev.id} 
                        className={cn(
                          "p-6 hover:bg-white dark:hover:bg-slate-800/80 border rounded-[2rem] hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-black/50 transition-all flex items-center justify-between gap-6",
                          dev.active ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10" : "bg-slate-50 dark:bg-white/5 border-transparent dark:border-transparent"
                        )}
                      >
                        <div className="space-y-1 min-w-0">
                          <h6 className="text-[15px] font-black text-slate-800 dark:text-white tracking-tight leading-tight truncate">{dev.name}</h6>
                          <div className="flex items-center gap-2">
                             <div className={cn("w-1.5 h-1.5 rounded-full", dev.active ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-300 dark:bg-slate-600")} />
                             <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold font-mono tracking-wide">{dev.desc}</span>
                          </div>
                        </div>

                        {/* Beautiful iOS inspired switch */}
                        <button
                          onClick={() => toggleDevice(dev.id)}
                          className={cn(
                            "w-14 h-8 rounded-full p-1 transition-colors relative flex items-center",
                            dev.active ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                          )}
                        >
                          <motion.div 
                            layout
                            className="w-6 h-6 rounded-full bg-white shadow-md"
                            animate={{ x: dev.active ? 20 : 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 7. 数据报表 */}
              {activeTab === 'report' && (
                <div className="h-full flex flex-col justify-between gap-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/5">
                      <div className="flex gap-2">
                        {['24h', '7d'].map((p) => (
                          <button
                            key={p}
                            onClick={() => setReportPeriod(p as any)}
                            className={cn(
                              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                              reportPeriod === p 
                                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" 
                                : "bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                          >
                            {p === '24h' ? '24小时遥测台账' : '过去一周聚合时序'}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={handleExportCsv}
                        className="px-6 py-3 bg-slate-900 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow active:scale-95 flex items-center gap-2"
                      >
                        <Download size={14} /> 导出时序报表 (CSV)
                      </button>
                    </div>

                    <div className="border border-slate-100 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">
                              <th className="py-4.5 px-6">时间戳 (Node_ID)</th>
                              <th className="py-4.5 px-6">大气温度 (°C)</th>
                              <th className="py-4.5 px-6">相对湿度 (%)</th>
                              <th className="py-4.5 px-6">深层水分 (%)</th>
                              <th className="py-4.5 px-6">有效辐射 (Lux)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 dark:divide-white/5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {reportTelemetry.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="py-4 px-6 font-bold">{row.time} <span className="text-[9px] text-slate-300 dark:text-slate-600 font-bold ml-1">#00{idx+1}</span></td>
                                <td className="py-4 px-6 text-orange-500 font-bold">{row.temp} °C</td>
                                <td className="py-4 px-6 text-blue-500 font-bold">{row.hum} %</td>
                                <td className="py-4 px-6 text-emerald-500 font-bold">{row.soil} %</td>
                                <td className="py-4 px-6 text-amber-500 font-bold">{row.light} Lux</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 8. 专家咨询 */}
              {activeTab === 'expert' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-[550px]">
                  
                  {/* Left Column: Expert Chat Component */}
                  <div className="lg:col-span-7 flex flex-col justify-between border border-slate-100 dark:border-white/5 rounded-[2.5rem] bg-slate-50/20 dark:bg-slate-900/10 overflow-hidden shadow-inner">
                    
                    {/* Header bar describing live satellite connection */}
                    <div className="p-4 bg-amber-500/10 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                          <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest font-mono">Live Satellite Expert Node Active</span>
                       </div>
                       <span className="text-[9px] font-bold text-slate-400 font-mono italic">SYS_CONN_SECURE_92</span>
                    </div>

                    {/* Message Stream */}
                    <div className="flex-1 p-6 overflow-y-auto no-scrollbar space-y-5 max-h-[350px]">
                      {messages.map((m) => (
                        <div 
                          key={m.id} 
                          className={cn(
                            "flex flex-col max-w-[85%] rounded-[2rem] p-5 shadow-sm border text-sm leading-relaxed",
                            m.sender === 'expert'
                              ? "bg-white dark:bg-slate-950/40 border-slate-200 dark:border-white/5 text-slate-800 dark:text-slate-100 rounded-tl-none mr-auto"
                              : "bg-slate-900 dark:bg-white border-slate-900 text-slate-100 dark:text-slate-900 rounded-tr-none ml-auto"
                          )}
                        >
                          <div className="flex items-center justify-between gap-4 mb-2">
                             <span className={cn("text-[9px] font-black uppercase tracking-widest", m.sender === 'expert' ? "text-amber-500" : "text-emerald-500 dark:text-emerald-600")}>
                               {m.name}
                             </span>
                             <span className="text-[9px] font-bold text-slate-400 font-mono italic">{m.time}</span>
                          </div>
                          <p className="font-medium font-sans whitespace-pre-wrap">{m.content}</p>
                        </div>
                      ))}

                      {/* Expert typing state indicators */}
                      <AnimatePresence>
                        {expertIsTyping && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="mr-auto bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-500 rounded-[2rem] rounded-tl-none p-4 w-fit flex items-center gap-2 shadow-sm"
                          >
                            <span className="text-[10px] font-bold uppercase tracking-widest italic pr-1">王院士正在飞快分析决策中</span>
                            <div className="flex gap-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-100" />
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-200" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input form */}
                    <div className="p-4 bg-white dark:bg-slate-950/60 border-t border-slate-100 dark:border-white/5 flex gap-3 shrink-0">
                      <input 
                        type="text" 
                        placeholder="打字向国家级首席农业科学家咨询..." 
                        className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 pl-6 pr-4 py-3 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white dark:focus:bg-slate-950 dark:text-white transition-colors"
                        value={inputMsg}
                        onChange={(e) => setInputMsg(e.target.value)}
                        onKeyDown={(e) => { e.key === 'Enter' && handleSendMsg(); }}
                      />
                      <button
                        onClick={handleSendMsg}
                        className="px-6 py-3 bg-slate-900 dark:bg-white hover:bg-emerald-600 dark:hover:bg-emerald-500 text-white dark:text-slate-900 rounded-xl flex items-center justify-center transition-all shadow-md animate-pulse-subtle"
                      >
                        <Send size={15} />
                      </button>
                    </div>

                  </div>

                  {/* Right Column: 12316 Directive Public Services & Checklist Guide */}
                  <div className="lg:col-span-5 flex flex-col gap-6 max-h-[500px] overflow-y-auto pr-1 no-scrollbar text-slate-800 dark:text-slate-200">
                    
                    {/* Authoritative 12316 introduction card */}
                    <div className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-[2rem] space-y-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg font-black select-none">
                          ☎️
                        </div>
                        <div>
                          <h5 className="text-[15px] font-black tracking-tight text-amber-600 dark:text-amber-400">12316三农公益服务热线</h5>
                          <span className="text-[9px] font-black text-slate-400 tracking-wider">中华人民共和国农业农村部主管统一短号码</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                        **12316** 是覆盖我国各省、自治区、直辖市的全国农业系统综合公益热线。它是连接政府与农民、涉农企业的金桥纽带，不仅为广大农民解决田间地头的各种突发疑难，在农资假冒权益受侵、重大气象灾害、土地政策疑虑等多层面，均提供全国统一、最权威的专家解答。
                      </p>
                    </div>

                    {/* Operational Steps Checklists */}
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 pl-1">
                          <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
                          <h6 className="text-xs font-black uppercase tracking-widest text-slate-400">咨询自查与呼叫操作手册：</h6>
                       </div>

                       <div className="space-y-3">
                          {[
                            { step: '01', title: '环境遥测数据整备', detail: '拨打热线前，请查看我们软件实时监测的数据：例如目前大气温度（18-30°C），土壤深层相对湿度（55%-65%），方便口述提供专家分析。' },
                            { step: '02', title: '作物病灶精准描述', detail: '辨析受灾植株根、茎、叶受害表征。如叶面是否覆有灰白霉层（白粉病）、或长有铁锈色黄色突起粉斑（小麦条锈病），这能提高专家判断准确率。' },
                            { step: '03', title: '施肥灌溉历史溯源', detail: '准备好过去两周施用的肥料名称、氮磷钾比例（例如 24:12:14 配方肥）以及浇灌频次，专家能第一时间排除过肥烂根引起的缺素。' },
                            { step: '04', title: '拨打热线咨询对接', detail: '使用座机或手机直接拨打 12316 音频通话。话语简洁模板：“专家您好，我是天算智农园网格员，大豆3号地块目前传感器相对湿度60%，叶绿素48SPAD突然下降，疑似感染...”' }
                          ].map(item => (
                            <div key={item.step} className="p-4.5 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl flex items-start gap-3.5 transition-colors">
                              <span className="text-sm font-black font-mono text-amber-500 bg-amber-500/15 w-6 h-6 rounded-lg flex items-center justify-center shrink-0">{item.step}</span>
                              <div className="space-y-1">
                                <div className="text-xs font-black text-slate-800 dark:text-white block">{item.title}</div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">{item.detail}</p>
                              </div>
                            </div>
                          ))}
                       </div>
                    </div>

                    {/* Agricultural Science Knowledge base */}
                    <div className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[2rem] space-y-4">
                       <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
                          <span>💡</span>
                          <h6 className="text-[13px] font-black tracking-tight text-slate-800 dark:text-white">三农前沿科学备查包</h6>
                       </div>

                       <div className="space-y-4 text-xs">
                          <div className="space-y-1">
                             <span className="font-black text-amber-600 dark:text-amber-400 block p-0.5">🔥 1. 倒春寒/异常高温自救法则</span>
                             <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                               大风降温前，傍晚时分小剂量喷洒 **0.2％磷酸二氢钾+生物防冻素**，可提高植株细胞液态浓度，抵御植物胞膜微凝固，同时关闭部分大棚风机维持棚温。
                             </p>
                          </div>
                          
                          <div className="space-y-1">
                             <span className="font-black text-amber-600 dark:text-amber-400 block p-0.5">☘️ 2. 大田作物叶黄化缺素精准诊断</span>
                             <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                               病斑分布在老幼叶各异：下部老叶变黄而叶脉绿通常缺镁；幼嫩新叶黄化无干尖通常缺铁；而极度缺氮则表现为全株叶片细嫩发黄，可定向滴喷加施螯合氨基肥。
                             </p>
                          </div>

                          <div className="space-y-1">
                             <span className="font-black text-amber-600 dark:text-amber-405 block p-0.5">💦 3. 重壤透气与自调节滴灌要点</span>
                             <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                               重粘性土壤保水过剩导致根系无氧气窒息，应采用 **“间歇式小剂量智能分段滴灌”**，使粘土在微收缩间产生透气缝隙，能激发毛细根毛的携氧速率提升240%。
                             </p>
                          </div>
                       </div>
                    </div>

                  </div>

                </div>
              )}

            </div>
          </main>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
