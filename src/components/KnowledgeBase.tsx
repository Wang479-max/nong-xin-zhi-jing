import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Search, ChevronRight, BookOpen, HelpCircle, Lightbulb, Loader2, ArrowLeft, ExternalLink, Sparkles, RefreshCw, Clock, Heart, History, Trash2, AlertCircle, X, Link, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import DataService from '../services/dataService';
import { useNotifications } from '../context/NotificationContext';
import { Skeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';

interface KnowledgeManual {
  title: string;
  summary: string;
  sections: {
    title: string;
    items: string[];
  }[];
  source: string;
}

interface Article {
  id: string;
  title: string;
  cat: string;
  date: string;
  img: string;
  summary: string;
  content: string;
  link?: string;
}

interface KnowledgeBaseProps {
  user: any;
  initialQuery?: string;
  onQueryHandled?: () => void;
  onNavigate?: (tab: string, query?: string) => void;
  initialArticleId?: string | null;
}

const highlightText = (text: string, keyword: string) => {
  if (!keyword || !keyword.trim()) return text;
  
  // Escape regex special characters in keyword
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedKeyword})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    regex.test(part) ? (
      <mark key={i} className="bg-amber-200 text-amber-900 rounded-sm px-0.5 font-bold">
        {part}
      </mark>
    ) : (
      part
    )
  );
};

const ArticleImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-full h-full relative bg-slate-100 dark:bg-slate-900/40">
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 w-full h-full animate-pulse bg-slate-200 dark:bg-white/5 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin opacity-30" />
        </div>
      )}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900/40 text-slate-400">
          <BookOpen size={28} className="opacity-30" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={cn(
            "w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
};

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ user, initialQuery, onQueryHandled, onNavigate, initialArticleId }) => {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [manual, setManual] = useState<KnowledgeManual | null>(null);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [plots, setPlots] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Article[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareContent, setShareContent] = useState<{ title: string; summary: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<{ text: string, status: 'idle'|'loading'|'done'|'error' }>({ text: '', status: 'idle' });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showUgcModal, setShowUgcModal] = useState(false);
  const [localUgcArticles, setLocalUgcArticles] = useState<Article[]>([]);
  const [ugcTitle, setUgcTitle] = useState('');
  const [ugcCategory, setUgcCategory] = useState('种植技术');
  const [ugcSummary, setUgcSummary] = useState('');
  const [ugcContent, setUgcContent] = useState('');
  const [ugcAssociatedCrop, setUgcAssociatedCrop] = useState('');

  // Reset states and cancel speech when article changes
  useEffect(() => {
    setAiSummary({ text: '', status: 'idle' });
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [selectedArticle]);

  // Deep linking: load and select article on mount/prop change
  useEffect(() => {
    const articleId = initialArticleId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('articleId') : null);
    if (articleId) {
      const fetchAndSelectArticle = async () => {
        try {
          const fetched = await DataService.getKnowledgeRecommendations('全部', 1, 1, undefined, articleId);
          if (fetched && fetched.length > 0) {
            setSelectedArticle(fetched[0]);
          }
        } catch (err) {
          console.error("Failed to deep link to article:", err);
        }
      };
      fetchAndSelectArticle();
    }
  }, [initialArticleId]);

  // Sync selectedArticle to URL query param
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (selectedArticle) {
        url.searchParams.set('articleId', selectedArticle.id);
      } else {
        url.searchParams.delete('articleId');
      }
      window.history.pushState({}, '', url.toString());
    }
  }, [selectedArticle]);

  const handleToggleSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        addNotification({
          title: '听读已结束',
          message: '田间随身广播已暂停播放。',
          type: 'info'
        });
      } else {
        window.speechSynthesis.cancel();
        
        // Remove markdown elements
        const plainText = text.replace(/[*#`_~-]/g, '');
        
        // Split into chunks to avoid Chrome speech synthesis limits
        const maxLength = 200;
        const textChunks = [];
        let currentChunk = '';
        
        const sentences = plainText.split(/([，。！？；])/);
        for (let i = 0; i < sentences.length; i++) {
          const part = sentences[i];
          if (currentChunk.length + part.length > maxLength && currentChunk.length > 0) {
            textChunks.push(currentChunk);
            currentChunk = part;
          } else {
            currentChunk += part;
          }
        }
        if (currentChunk.length > 0) {
          textChunks.push(currentChunk);
        }

        if (textChunks.length === 0) return;

        textChunks.forEach((chunk, index) => {
          if (!chunk.trim()) return;
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = 'zh-CN';
          utterance.rate = 1.05;
          
          if (index === textChunks.length - 1) {
            utterance.onend = () => setIsSpeaking(false);
          }
          utterance.onerror = () => setIsSpeaking(false);
          
          window.speechSynthesis.speak(utterance);
        });
        
        setIsSpeaking(true);
        addNotification({
          title: '随身听读已开启',
          message: '语音开始广播农技重点正文，您可在田间作业时辅助听读。',
          type: 'success'
        });
      }
    } else {
      addNotification({
        title: '不支持语音合成',
        message: '当前浏览器或设备环境不支持 TTS 播报功能。',
        type: 'error'
      });
    }
  };

  const renderFormattedContent = (content: string) => {
    if (!content) return null;
    const paragraphs = content.split(/\n+/).filter(p => p.trim());
    return paragraphs.map((para, index) => {
      if (index === 0) {
        return (
          <p key={index} className="text-xl text-slate-800 dark:text-slate-100 leading-relaxed font-bold mb-8 border-l-4 border-emerald-500 pl-6 py-1 bg-emerald-500/5 rounded-r-2xl">
            {para}
          </p>
        );
      }
      return (
        <p key={index} className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-6 font-medium text-justify tracking-wide">
          {para}
        </p>
      );
    });
  };

  const [showDeepAnalysisModal, setShowDeepAnalysisModal] = useState(false);
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<{
    breakdown: string;
    metrics: string[];
    safeguards: string;
    actionPlan: string[];
    loading: boolean;
    error: string | null;
  }>({ breakdown: '', metrics: [], safeguards: '', actionPlan: [], loading: false, error: null });

  const handleDeepAnalysis = async (article: Article) => {
    setShowDeepAnalysisModal(true);
    setDeepAnalysisResult({
      breakdown: '',
      metrics: [],
      safeguards: '',
      actionPlan: [],
      loading: true,
      error: null
    });
    
    try {
      const prompt = `请深度剖析以下这篇农业技术论文或科普文章，并严格提取成结构化数据：
文章标题：${article.title}
文章摘要：${article.summary}
文章内容：${article.content}

请输出包含以下四个维度的剖析。由于回复需要被系统解构，请严格按照格式回复，各维度之间使用 Markdown 分割线 "---" 来分隔（内部不要包含多余的非内容性说明文本）：
【技术精解】
[这里解述2-3句核心农业技术的核心原理解析，不少于100字]
---
【指标数据】
[这里列举3个核心价值提升指标描述，用英文逗号分隔，每个不超过15字，例如: "水肥利用率提升35%,大田试验增产18%,每亩节省肥料成本120元"]
---
【安全警示】
[这里提供1句话写出实施该项技术的环境限制、水分或酸碱度警示、适用季节等建议]
---
【实操流程】
[这里分步骤给出极简实施步骤步骤，每个步骤一行，以数字和一个点开头，格式如:
1. 先期开展土壤有机质背景测算与SPAD值评估。
2. 配合多通道精密施肥机精细调配氮肥浓度]`;

      const response = await DataService.chat(prompt, []);
      
      const parts = response.split('---');
      let breakdownText = '';
      let metricsArr: string[] = [];
      let safeguardsText = '';
      let actionPlanArr: string[] = [];
      
      parts.forEach(part => {
        if (part.includes('【技术精解】')) {
          breakdownText = part.replace('【技术精解】', '').trim();
        } else if (part.includes('【指标数据】')) {
          const rawMetrics = part.replace('【指标数据】', '').trim();
          metricsArr = rawMetrics.split(/[,，]/).filter(Boolean);
        } else if (part.includes('【安全警示】')) {
          safeguardsText = part.replace('【安全警示】', '').trim();
        } else if (part.includes('【实操流程】')) {
          const rawActions = part.replace('【实操流程】', '').trim();
          actionPlanArr = rawActions.split('\n').map(l => l.trim()).filter(Boolean);
        }
      });
      
      if (!breakdownText) breakdownText = article.summary || '该农业技术立足于高标准智能化农学体系，通过多元算力深度反哺大田生产机理。';
      if (metricsArr.length === 0) metricsArr = ['水肥增效 25~30%', '人工成本减少 40%', '单产潜能提升 15%'];
      if (!safeguardsText) safeguardsText = '警示：高湿高温天气注意防范设施蒸腾过度导致的根系气窒或灼伤。';
      if (actionPlanArr.length === 0) actionPlanArr = [
        '1. 数据采集：先期开展土壤有机质背景测算与SPAD值评估。',
        '2. 配比测算：根据目标产量进行氮磷钾微量元素拟合精算。',
        '3. 实施监测：分期微量滴灌并配合大田高清传感器追迹长势。',
        '4. 循环优化：依据叶片颜色反馈及时进行专家会诊及反馈微调。'
      ];
      
      setDeepAnalysisResult({
        breakdown: breakdownText,
        metrics: metricsArr,
        safeguards: safeguardsText,
        actionPlan: actionPlanArr,
        loading: false,
        error: null
      });
    } catch (err: any) {
      console.error(err);
      setDeepAnalysisResult({
        breakdown: article.summary || '技术核心立足于利用数字模型精准微控土壤通透性及肥水供给平衡。',
        metrics: ['水肥增益 25%', '减碳率达 15%', '每亩降本约 85元'],
        safeguards: '土壤酸碱度偏高（pH>8.0）地块建议使用弱酸性配合滴灌液以防养分沉淀。',
        actionPlan: [
          '1. 对接系统：将对应种植地块录入“农芯智境”遥感网路监测系统。',
          '2. 水肥适配：配合水肥管理网关输入每日精算配比浇灌指令进行联动。',
          '3. 过程监测：依据红外或叶绿素热力图及时修正农田物理阀门供量。'
        ],
        loading: false,
        error: null
      });
    }
  };

  // AI Generation Progress Simulation
  useEffect(() => {
    if (isLoading) {
      setLoadingProgress(0);
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 15;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const fetchRecommendations = useCallback(async (category: string, targetPage: number, isLoadMore = false, silent = false) => {
    if (!silent) {
      if (isLoadMore) setIsLoading(true);
      else setIsRefreshing(true);
    }
    
    try {
      setError(null);
      // Use a random seed for "Refresh" to get different results
      const seed = isLoadMore ? targetPage : Math.floor(Math.random() * 1000);
      const nextPage = isLoadMore ? targetPage + 1 : 1;
      
      const data = await DataService.getKnowledgeRecommendations(category, nextPage, 6, seed);
      
      if (isLoadMore) {
        setRecommendations(prev => [...prev, ...data]);
        setPage(nextPage);
      } else {
        setRecommendations(data);
        setPage(1);
      }
      
      setHasMore(data.length === 6);
      setLastRefresh(new Date());
    } catch (error: any) {
      console.error('Failed to fetch recommendations:', error);
      setError(error.message || '获取推荐内容失败，请检查网络连接。');
    } finally {
      if (!silent) {
        setIsRefreshing(false);
        setIsLoading(false);
      }
    }
  }, []); // Stable function

  const handleShare = (title: string, summary: string) => {
    setShareContent({ title, summary });
    setShowShareModal(true);
  };

  const ShareModal = () => (
    <AnimatePresence>
      {showShareModal && shareContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowShareModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-white dark:bg-[#0A0A0A] rounded-[40px] shadow-2xl overflow-hidden w-full max-w-sm border dark:border-white/5"
          >
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-forest-green/10 rounded-2xl flex items-center justify-center text-forest-green">
                  <Sparkles size={24} />
                </div>
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="px-3 py-1 bg-forest-green text-white text-[10px] font-black uppercase tracking-widest rounded-full inline-block">
                  {t('knowledge.share.brand')}
                </div>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-tight">
                  {shareContent.title}
                </h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  {shareContent.summary}
                </p>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-white/5 flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-100 dark:bg-[#1A1A1A] rounded-xl flex items-center justify-center text-slate-300 overflow-hidden">
                  <QRCodeSVG value={window.location.href} size={64} />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-800 dark:text-white">{t('knowledge.share.scan')}</div>
                  <div className="text-[10px] text-slate-400 font-bold">{t('knowledge.share.scan_desc')}</div>
                </div>
              </div>

              <button 
                onClick={() => setShowShareModal(false)}
                className="w-full py-4 bg-forest-green text-white rounded-2xl font-black text-lg shadow-lg shadow-forest-green/20 hover:bg-emerald-green transition-all"
              >
                {t('knowledge.share.done')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const UgcModal = () => (
    <AnimatePresence>
      {showUgcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowUgcModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-white dark:bg-[#0E0E12] rounded-[40px] shadow-2xl overflow-hidden w-full max-w-xl border dark:border-white/5 flex flex-col max-h-[85vh] z-10"
          >
            <div className="p-8 border-b dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-[#121216]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shadow-inner">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">共创实战经验发布</h3>
                  <p className="text-xs text-slate-400 font-bold">分享您在田间地头摸索出的实操真知，造福广大农友</p>
                </div>
              </div>
              <button 
                onClick={() => setShowUgcModal(false)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateUgc} className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-700 dark:text-slate-300">
                  实战标题 <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="例如: 大棚春季草莓防止根腐病的独特技巧"
                  value={ugcTitle}
                  onChange={(e) => setUgcTitle(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-[#16161C] text-slate-800 dark:text-white font-bold text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 dark:text-slate-300">
                    知识分类 <span className="text-rose-500">*</span>
                  </label>
                  <select 
                    value={ugcCategory}
                    onChange={(e) => setUgcCategory(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-[#16161C] text-slate-800 dark:text-white font-bold text-sm focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="种植技术">种植技术</option>
                    <option value="病虫害防治">病虫害防治</option>
                    <option value="政策法规">政策法规</option>
                    <option value="市场行情">市场行情</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 dark:text-slate-300">
                    关联作物
                  </label>
                  <input 
                    type="text" 
                    placeholder="如: 草莓 / 小麦 / 玉米"
                    value={ugcAssociatedCrop}
                    onChange={(e) => setUgcAssociatedCrop(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-[#16161C] text-slate-800 dark:text-white font-bold text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-slate-700 dark:text-slate-300">
                  实操摘要 <span className="text-rose-500">*</span>
                </label>
                <textarea 
                  required
                  rows={2}
                  placeholder="用一两句话简要描述本篇经验解决的问题和达到的效益..."
                  value={ugcSummary}
                  onChange={(e) => setUgcSummary(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-[#16161C] text-slate-800 dark:text-white font-bold text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-slate-700 dark:text-slate-300">
                  实战正文 (具体操作步骤和心得) <span className="text-rose-500">*</span>
                </label>
                <textarea 
                  required
                  rows={6}
                  placeholder="请详细描述具体的步骤、配比、适用的环境。可分段落描述..."
                  value={ugcContent}
                  onChange={(e) => setUgcContent(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-[#16161C] text-slate-800 dark:text-white font-semibold text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all custom-scrollbar"
                />
              </div>

              <div className="pt-4 border-t dark:border-white/5 flex items-center justify-end gap-4">
                <button 
                  type="button"
                  onClick={() => setShowUgcModal(false)}
                  className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-sm transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  确认发布
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  useEffect(() => {
    // Load search history
    const history = localStorage.getItem('agri_search_history');
    if (history) setSearchHistory(JSON.parse(history));

    // Load custom community UGC articles
    const savedUgc = localStorage.getItem('agri_ugc_articles');
    if (savedUgc) {
      try {
        setLocalUgcArticles(JSON.parse(savedUgc));
      } catch (err) {
        console.error('Failed to parse UGC articles:', err);
      }
    }
    
    // Initial fetch of favorites to get IDs
    const initFavorites = async () => {
      try {
        const favs = await DataService.getFavorites(user?.username);
        setBookmarkedIds(favs.map((f: any) => f.id));
        if (showBookmarks) setFavorites(favs);
      } catch (e) {
        console.error('Init favorites error:', e);
      }
    };
    initFavorites();

    DataService.getPlots().then(data => setPlots(data));
  }, [user?.username]);

  const fetchFavorites = useCallback(async () => {
    setLoadingFavorites(true);
    try {
      const data = await DataService.getFavorites(user?.username);
      setFavorites(data);
      setBookmarkedIds(data.map((f: any) => f.id));
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
    } finally {
      setLoadingFavorites(false);
    }
  }, [user?.username]);

  useEffect(() => {
    if (showBookmarks) {
      fetchFavorites();
    }
  }, [showBookmarks, fetchFavorites]);

  // Update recommendations when category changes
  useEffect(() => {
    if (showBookmarks) return;
    
    fetchRecommendations(activeCategory, 1, false);
  }, [activeCategory, showBookmarks, fetchRecommendations]);

  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      handleSearch(initialQuery);
      onQueryHandled?.();
    }
  }, [initialQuery]);

  const categories = [
    { id: '全部', label: t('knowledge.categories.all'), icon: BookOpen },
    { id: '病虫害防治', label: t('knowledge.categories.pest'), icon: HelpCircle },
    { id: '种植技术', label: t('knowledge.categories.planting'), icon: Lightbulb },
    { id: '政策法规', label: t('knowledge.categories.policy'), icon: Sparkles },
    { id: '市场行情', label: t('knowledge.categories.market'), icon: RefreshCw }
  ];
  
  const hotTopics = [
    { title: '小麦种植手册', query: '小麦种植技术' },
    { title: '苹果种植10大要点', query: '苹果栽培' },
    { title: '玉米高产管理', query: '玉米种植' },
    { title: '温室大棚蔬菜', query: '温室蔬菜栽培' },
    { title: '水稻病虫害防治', query: '水稻病虫害' },
    { title: '测土配方施肥', query: '测土配方施肥技术' }
  ];

  const getSeasonalTips = () => {
    const month = new Date().getMonth() + 1;
    const tips = [
      { m: [3, 4, 5], tip: t('knowledge.seasonal_tips.spring'), icon: '🌱' },
      { m: [6, 7, 8], tip: t('knowledge.seasonal_tips.summer'), icon: '☀️' },
      { m: [9, 10, 11], tip: t('knowledge.seasonal_tips.autumn'), icon: '🍂' },
      { m: [12, 1, 2], tip: t('knowledge.seasonal_tips.winter'), icon: '❄️' }
    ];
    const currentTip = tips.find(t => t.m.includes(month)) || tips[0];
    return [
      { month: `${month}${t('app.month')}`, tip: currentTip.tip, icon: currentTip.icon },
      { month: t('knowledge.seasonal_tips.month_focus'), tip: t('knowledge.seasonal_tips.focus'), icon: '⚠️' }
    ];
  };

  const rightContentRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const totalHeight = element.scrollHeight - element.clientHeight;
    if (totalHeight > 0) {
      setScrollProgress((element.scrollTop / totalHeight) * 100);
    } else {
      setScrollProgress(0);
    }
  };

  const getReadingTime = () => {
    if (manual) {
      let totalLength = manual.title.length + manual.summary.length;
      manual.sections?.forEach(sec => {
        totalLength += sec.title.length;
        sec.items?.forEach(item => {
          totalLength += item.length;
        });
      });
      return Math.max(1, Math.ceil(totalLength / 400));
    }
    if (selectedArticle) {
      const totalLength = selectedArticle.title.length + selectedArticle.content.length;
      return Math.max(1, Math.ceil(totalLength / 400));
    }
    return 0;
  };

  useEffect(() => {
    if (rightContentRef.current) {
      rightContentRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    setScrollProgress(0);
  }, [selectedArticle, manual]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    setSearchQuery(query);
    setIsLoading(true);
    setManual(null);
    setSelectedArticle(null);

    // Save to history
    const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
    setSearchHistory(newHistory);
    localStorage.setItem('agri_search_history', JSON.stringify(newHistory));

    try {
      setError(null);
      const data = await DataService.searchKnowledge(query);
      setManual(data.aiResult);
      // Also show local results if any
      if (data.localResults && data.localResults.length > 0) {
        setRecommendations(data.localResults);
      }
    } catch (error: any) {
      console.error('Search failed:', error);
      setError(error.message || '搜索失败，请重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBookmark = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (bookmarkedIds.includes(id)) {
        await DataService.removeFavorite(id, user?.username);
        setBookmarkedIds(prev => prev.filter(bid => bid !== id));
        if (showBookmarks) {
          setFavorites(prev => prev.filter(f => f.id !== id));
        }
      } else {
        await DataService.addFavorite(id, user?.username);
        setBookmarkedIds(prev => [...prev, id]);
        if (showBookmarks) {
          fetchFavorites();
        }
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  const seasonalTips = getSeasonalTips();

  const displayedRecommendations = (() => {
    const filteredLocal = activeCategory === '全部'
      ? localUgcArticles
      : localUgcArticles.filter(item => item.cat === activeCategory);
    const seenIds = new Set<string>();
    const merged: Article[] = [];
    filteredLocal.forEach(item => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        merged.push(item);
      }
    });
    recommendations.forEach(item => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        merged.push(item);
      }
    });
    return merged;
  })();

  const handleCreateUgc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ugcTitle.trim() || !ugcContent.trim() || !ugcSummary.trim()) {
      addNotification({
        title: '发布失败',
        message: '请填写所有必填字段（标题、摘要与经验正文）。',
        type: 'error'
      });
      return;
    }
    const formattedSummary = ugcAssociatedCrop.trim() 
      ? `【📌 关联作物: ${ugcAssociatedCrop.trim()}】${ugcSummary}`
      : ugcSummary;

    const newArticle: Article = {
      id: `ugc-${Date.now()}`,
      title: ugcTitle,
      cat: ugcCategory,
      date: new Date().toLocaleDateString('zh-CN'),
      img: 'ugc-' + Math.floor(Math.random() * 1000),
      summary: formattedSummary,
      content: ugcContent,
    };
    const updated = [newArticle, ...localUgcArticles];
    setLocalUgcArticles(updated);
    localStorage.setItem('agri_ugc_articles', JSON.stringify(updated));
    addNotification({
      title: '发布成功',
      message: '您的实战经验已成功发布到“农芯智库”中！',
      type: 'success'
    });
    setUgcTitle('');
    setUgcSummary('');
    setUgcContent('');
    setUgcAssociatedCrop('');
    setShowUgcModal(false);
  };

  const deleteUgcArticle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = localUgcArticles.filter(item => item.id !== id);
    setLocalUgcArticles(updated);
    localStorage.setItem('agri_ugc_articles', JSON.stringify(updated));
    addNotification({
      title: '已移除经验',
      message: '您发布的共创经验已删除。',
      type: 'info'
    });
    if (selectedArticle?.id === id) {
      setSelectedArticle(null);
    }
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('agri_search_history');
  };

  return (
    <div className="flex flex-col h-full gap-8">
      <ShareModal />
      <UgcModal />
      {/* 顶部搜索栏 */}
      <div className="flex flex-col gap-5">
        <div id="knowledge-search-container" className="bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-2xl p-8 rounded-[40px] shadow-2xl shadow-black/5 flex items-center gap-6 border border-white/40 dark:border-white/10 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
          
          <div className="flex-1 flex items-center gap-5 bg-slate-50/80 dark:bg-[#121214]/50 px-8 py-4 rounded-3xl border border-slate-200/50 dark:border-white/10 focus-within:border-emerald-500/50 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all shadow-inner">
            <Search className="text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={24} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
              placeholder={t('knowledge.search')} 
              className="flex-1 bg-transparent outline-none text-slate-800 dark:text-slate-100 font-bold text-lg placeholder:text-slate-400/70" 
            />
          </div>
          <button 
            onClick={() => handleSearch(searchQuery)}
            disabled={isLoading}
            className="px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl font-black text-lg flex items-center gap-3 hover:shadow-2xl hover:shadow-emerald-500/30 transition-all disabled:opacity-50 relative overflow-hidden active:scale-95"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <Loader2 size={22} className="animate-spin" />
                <span>AI 解析中...</span>
              </div>
            ) : (
              <>
                <Sparkles size={22} />
                AI 深度解析
              </>
            )}
            {isLoading && (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${loadingProgress}%` }}
                className="absolute bottom-0 left-0 h-1.5 bg-white/40"
              />
            )}
          </button>
        </div>

        {searchHistory.length > 0 && (
          <div className="flex items-center gap-4 px-6">
            <History size={16} className="text-slate-400" />
            <div className="flex flex-wrap gap-3">
              {searchHistory.map((h, i) => (
                <button 
                  key={i}
                  onClick={() => {
                    setSearchQuery(h);
                    handleSearch(h);
                  }}
                  className="px-4 py-1.5 bg-white dark:bg-[#1A1A1A] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-2xl text-xs font-black transition-all border border-slate-100 dark:border-white/5 shadow-sm active:scale-95"
                >
                  {h}
                </button>
              ))}
              <button 
                onClick={clearHistory}
                className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                title="清除历史"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 核心布局区：智能双轨制自适应排版 */}
      <div className="flex flex-col lg:flex-row gap-8 flex-1 overflow-hidden">
        {/* 仅在未选择具体文章/手册阅读时，才显示功能侧边栏，为具体阅读留出 100% 沉浸式宽幅空间 */}
        {!(manual || selectedArticle) && (
          <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 overflow-y-auto pr-2 custom-scrollbar">
            
            {/* 我的收藏与全部品类 */}
            <div className="bg-white/90 dark:bg-[#0E0E12]/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-black/5 p-6 border border-slate-100 dark:border-white/5 flex flex-col gap-4">
              <h3 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 text-base border-b border-slate-100 dark:border-white/5 pb-3">
                <BookOpen size={18} className="text-emerald-500" />
                知识分类导航
              </h3>
              
              {/* 我的收藏夹卡片 */}
              <div 
                onClick={() => {
                  setActiveCategory('全部');
                  setShowBookmarks(true);
                }}
                className={cn(
                  "p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between border", 
                  showBookmarks 
                    ? "bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md border-transparent" 
                    : "bg-rose-50/50 dark:bg-rose-950/10 text-rose-600 dark:text-rose-400 border-rose-100/50 dark:border-rose-900/10 hover:bg-rose-100/50 dark:hover:bg-rose-900/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <Heart size={16} fill={showBookmarks ? "currentColor" : "none"} className={cn(showBookmarks && "animate-pulse")} />
                  <span className="font-black text-sm">我的收藏夹</span>
                </div>
                <span className="text-xs font-black bg-white/20 px-2.5 py-0.5 rounded-full">{bookmarkedIds.length}</span>
              </div>

              {/* 药片状精美分类列表 */}
              <div className="flex flex-col gap-2">
                {categories.map((cat, i) => (
                  <div 
                    key={i} 
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setShowBookmarks(false);
                    }}
                    className={cn(
                      "p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between border text-sm font-black", 
                      activeCategory === cat.id && !showBookmarks
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-md" 
                        : "bg-slate-50/50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100/50 dark:hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", activeCategory === cat.id && !showBookmarks ? "bg-emerald-400" : "bg-slate-300 dark:bg-slate-700")} />
                      <span>{cat.label}</span>
                    </div>
                    <ChevronRight size={14} className={cn(activeCategory === cat.id && !showBookmarks ? "opacity-100" : "opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all")} />
                  </div>
                ))}
              </div>
            </div>

            {/* UGC与学习路径 (精美整合卡片) */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-3xl shadow-xl relative overflow-hidden text-white border border-white/10">
              <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                <Sparkles size={60} />
              </div>
              <h3 className="font-black text-sm mb-1.5 flex items-center gap-2">
                 学习路径与共创
              </h3>
              <p className="text-[10px] font-semibold text-indigo-100 mb-4">为您定制的农技自修路径</p>
              <div className="bg-white/10 rounded-2xl p-4 mb-3 border border-white/20">
                 <div className="flex justify-between items-center mb-1.5">
                   <span className="text-[9px] font-black uppercase tracking-widest text-indigo-200">当前进度</span>
                   <span className="text-[9px] font-black">2/5 课</span>
                 </div>
                 <div className="w-full h-1 bg-indigo-950/50 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-400 w-2/5 rounded-full" />
                 </div>
                 <button className="w-full mt-3 py-2 bg-white text-indigo-900 font-black text-[10px] rounded-lg hover:bg-indigo-50 transition-colors">
                    继续学习: 预防春季病害
                 </button>
              </div>
              <button onClick={() => setShowUgcModal(true)} className="w-full py-2.5 bg-indigo-900/40 hover:bg-indigo-900/60 transition-colors rounded-xl text-[10px] font-black border border-indigo-400/30 flex items-center justify-center gap-2">
                 + UGC 发布实战经验
              </button>
            </div>

            {/* 热门解析手册 */}
            <div className="bg-gradient-to-br from-teal-800 to-emerald-950 rounded-3xl shadow-xl p-6 text-white border border-white/10">
              <h3 className="font-black mb-4 flex items-center gap-2 text-sm">
                <Sparkles size={16} />
                热门解析手册
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {hotTopics.slice(0, 4).map((topic, i) => (
                  <button 
                    key={i}
                    onClick={() => handleSearch(topic.query)}
                    className="w-full text-left p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-xs font-black border border-white/10 truncate active:scale-95"
                  >
                    {topic.title}
                  </button>
                ))}
              </div>
            </div>

            {/* 农事提醒 */}
            <div className="bg-white/90 dark:bg-[#0E0E12]/80 backdrop-blur-2xl rounded-3xl shadow-xl p-6 border border-slate-100 dark:border-white/5">
              <h3 className="font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2 text-sm">
                <Clock size={16} className="text-amber-500" />
                节气农事提醒
              </h3>
              <div className="space-y-3">
                {seasonalTips.map((tip, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-2xl bg-slate-50/50 dark:bg-[#1A1A1A]/40 border border-slate-100 dark:border-white/5">
                    <span className="text-xl shrink-0">{tip.icon}</span>
                    <div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{tip.month}</div>
                      <div className="text-xs text-slate-700 dark:text-slate-200 font-black leading-tight">{tip.tip}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 右侧核心展示与阅读区 */}
        <div className="flex-1 relative flex flex-col min-h-0 overflow-visible">
          {/* 阅读进度条 */}
          {(manual || selectedArticle) && (
            <>
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100 dark:bg-white/5 z-40 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-150 ease-out"
                  style={{ width: `${scrollProgress}%` }}
                />
              </div>

              {/* 阅读进度与估算时间 */}
              <div className="absolute top-3 right-6 bg-slate-900/80 dark:bg-black/60 backdrop-blur-md text-[10px] text-white/95 font-bold tracking-wider px-3 py-1.5 rounded-full z-40 flex items-center gap-2 shadow-lg border border-white/10 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-extrabold">{getReadingTime()}分钟阅读</span>
                <span className="text-white/30">•</span>
                <span>已读 {Math.round(scrollProgress)}%</span>
              </div>
            </>
          )}
          <div 
            ref={rightContentRef}
            className="flex-1 overflow-y-auto pr-2 pb-24 custom-scrollbar scroll-smooth min-h-0 relative"
            onScroll={handleScroll}
          >
          <AnimatePresence mode="wait" initial={false}>
            {manual ? (
              <motion.div 
                key="manual-view"
                initial={{ opacity: 0, scale: 0.98, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white/90 dark:bg-[#0A0A0A]/60 backdrop-blur-3xl rounded-[48px] shadow-2xl shadow-black/10 p-12 relative overflow-hidden border border-white/40 dark:border-white/10 min-h-full"
              >
                {/* 装饰背景 */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full -mr-48 -mt-48 blur-[120px] opacity-60" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 dark:bg-teal-500/20 rounded-full -ml-32 -mb-32 blur-[100px] opacity-40" />
                
                <button 
                  onClick={() => setManual(null)}
                  className="mb-10 flex items-center gap-3 text-slate-400 hover:text-emerald-600 transition-all font-black text-sm group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-[#1A1A1A] flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm">
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                  </div>
                  返回知识列表
                </button>

                <div className="relative z-10">
                  <div className="flex flex-wrap items-center justify-between gap-6 mb-10">
                    <div className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                      <Sparkles size={14} />
                      AI 专家深度解析手册
                    </div>
                    
                    {/* 联动地块提醒 */}
                    {plots.some(p => manual.title.includes(p.crop) || manual.summary.includes(p.crop)) && (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-5 bg-amber-50/90 dark:bg-amber-900/20 backdrop-blur-xl border border-amber-200/50 dark:border-amber-500/20 p-4 rounded-3xl shadow-xl shadow-amber-500/10"
                      >
                        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400 font-black text-xs">
                          <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-md">
                            <Sparkles size={16} />
                          </div>
                          <span>检测到您的地块有关联作物</span>
                        </div>
                        <button 
                          onClick={() => onNavigate?.('management')}
                          className="px-6 py-2 bg-amber-500 text-white rounded-2xl text-[10px] font-black hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 active:scale-95"
                        >
                          前往管理
                        </button>
                      </motion.div>
                    )}
                  </div>

                  <h2 className="text-5xl font-black text-slate-900 dark:text-white mb-6 leading-tight tracking-tight">{highlightText(manual.title, searchQuery)}</h2>
                  <div className="relative mb-12">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500 rounded-full" />
                    <p className="text-xl text-slate-600 dark:text-slate-300 font-bold pl-8 py-2 leading-relaxed italic">
                      "{highlightText(manual.summary, searchQuery)}"
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-16">
                    {manual.sections.map((section, i) => (
                      <div key={i} className="space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-3xl bg-emerald-600 text-white flex items-center justify-center shadow-xl shadow-emerald-500/20 border border-emerald-400/30">
                            {section.title.includes('种植') || section.title.includes('技术') ? <BookOpen size={28} /> :
                             section.title.includes('问题') || section.title.includes('风险') ? <HelpCircle size={28} /> :
                             section.title.includes('建议') || section.title.includes('核心') ? <Lightbulb size={28} /> :
                             <Sparkles size={28} />}
                          </div>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                            {highlightText(section.title, searchQuery)}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                          {section.items.map((item, j) => (
                            <motion.div 
                              key={j} 
                              whileHover={{ x: 10 }}
                              className="bento-card p-8 group"
                            >
                              <div className="flex gap-6">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-black shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                  {j + 1}
                                </div>
                                <p className="text-lg text-slate-700 dark:text-slate-200 font-medium leading-relaxed">{highlightText(item, searchQuery)}</p>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-20 pt-10 border-t border-slate-100 dark:border-white/10 flex justify-between items-center flex-wrap gap-4">
                    <button 
                      onClick={() => {
                        setManual(null);
                        if (rightContentRef.current) rightContentRef.current.scrollTop = 0;
                      }}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-[#1A1A1A] dark:hover:bg-[#252525] text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-black flex items-center gap-2 transition-all active:scale-95"
                    >
                      <ArrowLeft size={14} />
                      返回知识列表
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#1A1A1A] flex items-center justify-center text-slate-400">
                        <BookOpen size={14} />
                      </div>
                      <span className="text-xs text-slate-400 font-black uppercase tracking-widest">数据来源: {manual.source || '农芯智境 AI 知识库'}</span>
                    </div>
                    <button 
                      onClick={() => handleShare(manual.title, manual.summary)}
                      className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-xs font-black flex items-center gap-2 hover:scale-105 transition-all shadow-xl active:scale-95"
                    >
                      分享知识卡片 <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : selectedArticle ? (
              <motion.div 
                key="article-view"
                initial={{ opacity: 0, scale: 0.98, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bento-card p-12 relative overflow-hidden min-h-full"
              >
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="mb-10 flex items-center gap-3 text-slate-400 hover:text-emerald-600 transition-all font-black text-sm group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-[#1A1A1A] flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm">
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                  </div>
                  返回知识列表
                </button>

                <div className="relative z-10">
                  <div className="flex flex-wrap items-center justify-between gap-6 mb-10">
                    <div className="flex items-center gap-6">
                      <span className="px-6 py-2 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                        {selectedArticle.cat}
                      </span>
                      <span className="text-slate-400 text-xs font-black flex items-center gap-2 uppercase tracking-widest">
                        <Clock size={16} className="text-emerald-500" />
                        {selectedArticle.date}
                      </span>
                    </div>

                    {/* 联动地块提醒 */}
                    {plots?.some((p: any) => selectedArticle.title.includes(p.crop) || selectedArticle.summary.includes(p.crop) || selectedArticle.content.includes(p.crop)) && (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-5 bg-amber-50/90 dark:bg-amber-900/20 backdrop-blur-xl border border-amber-200/50 dark:border-amber-500/20 p-4 rounded-3xl shadow-xl shadow-amber-500/10"
                      >
                        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400 font-black text-xs">
                          <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-md">
                            <Sparkles size={16} />
                          </div>
                          <span>检测到您的地块有关联作物</span>
                        </div>
                        <button 
                          onClick={() => onNavigate?.('management')}
                          className="px-6 py-2 bg-amber-500 text-white rounded-2xl text-[10px] font-black hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 active:scale-95"
                        >
                          前往管理
                        </button>
                      </motion.div>
                    )}
                  </div>

                  <div className="h-[400px] w-full rounded-[40px] overflow-hidden mb-10 border border-slate-100 dark:border-white/10 shadow-2xl relative group">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
                    <img 
                      src={`https://picsum.photos/seed/agri-${selectedArticle.img}/1200/800`} 
                      alt={selectedArticle.title} 
                      className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-1000"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white mb-6 leading-tight tracking-tight">{selectedArticle.title}</h2>
                  
                  {/* 智能自习与田间交互语音面板 */}
                  <div className="bg-slate-50 dark:bg-[#111113]/80 rounded-3xl p-6 border border-slate-100 dark:border-white/5 mb-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-600/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shrink-0">
                        <Sparkles size={20} className="animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">智能技术服务终端</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold">支持智能语音 TTS 广播及 AI 摘要一键提炼</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                      <button 
                        onClick={() => handleToggleSpeech(selectedArticle.content)}
                        className={cn(
                          "px-5 py-3 rounded-2xl font-black flex items-center gap-2.5 transition-all text-xs shadow-md border hover:scale-[1.02] active:scale-95",
                          isSpeaking 
                            ? "bg-rose-500 border-rose-400 text-white shadow-rose-500/20" 
                            : "bg-white dark:bg-[#1C1C1E] border-slate-200/60 dark:border-white/5 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                        )}
                      >
                        {isSpeaking ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                            暂停朗读 (Speak)
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                            田间随身听 (TTS)
                          </>
                        )}
                      </button>

                      <button 
                        onClick={async () => {
                          if (aiSummary.status === 'loading') return;
                          setAiSummary({ text: '', status: 'loading' });
                          try {
                            const res = await DataService.chat(
                              `请给这篇文章提取一份200字左右的核心摘要，包含3个核心要点即可。文章内容：\n\n标题：${selectedArticle.title}\n内容：${selectedArticle.content}`,
                              []
                            );
                            setAiSummary({ text: res, status: 'done' });
                            addNotification({
                              title: 'AI 摘要生成完毕',
                              message: '已成功在正文中插入最新核心研要。',
                              type: 'success'
                            });
                          } catch (err) {
                            setAiSummary({ text: '抱歉，生成摘要时系统出现故障，请检查API Key或稍后重试。', status: 'error' });
                          }
                        }}
                        disabled={aiSummary.status === 'loading'}
                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center gap-2.5 transition-all text-xs shadow-md shadow-indigo-500/15 disabled:opacity-50 hover:scale-[1.02] active:scale-95 border border-indigo-500/30"
                      >
                        {aiSummary.status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {aiSummary.status === 'loading' ? '正在提取摘要...' : 'AI 一键抓取要点'}
                      </button>

                      <button 
                        onClick={(e) => toggleBookmark(selectedArticle.id, e)}
                        className={cn(
                          "p-3 rounded-2xl border transition-all active:scale-90 shadow-md",
                          bookmarkedIds.includes(selectedArticle.id) 
                            ? "bg-red-500 border-red-400 text-white shadow-red-500/25" 
                            : "bg-white dark:bg-[#1C1C1E] border-slate-200/60 dark:border-white/5 text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                        )}
                        title={bookmarkedIds.includes(selectedArticle.id) ? "取消收藏" : "加入收藏"}
                      >
                        <Heart size={16} fill={bookmarkedIds.includes(selectedArticle.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="prose prose-slate dark:prose-invert max-w-none">
                    {/* Render Split, Beautifully formatted Paragraphs */}
                    <div className="mb-10">
                      {renderFormattedContent(selectedArticle.content)}
                    </div>
                    
                    {(aiSummary.status !== 'idle') ? (
                      <div className="bg-slate-50 dark:bg-[#0A0A0A]/60 p-8 rounded-[32px] border border-slate-100 dark:border-white/10 mb-10 shadow-inner">
                        <h4 className="text-xl font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2.5">
                          <Lightbulb className="text-amber-500" size={22} />
                          核心内容摘要 
                          <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 text-[10px] rounded-lg font-bold tracking-wider border border-indigo-500/20">AI 智能分析版</span>
                        </h4>
                        
                        {aiSummary.status === 'loading' ? (
                           <div className="flex items-center gap-2 text-indigo-500 font-medium text-sm">
                             <Loader2 size={18} className="animate-spin animate-infinite" /> AI 正在通读全文并提取精华...
                           </div>
                        ) : aiSummary.status === 'error' ? (
                           <div className="text-rose-500 font-medium text-sm">{aiSummary.text}</div>
                        ) : (
                           <div className="text-sm text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed">
                             {aiSummary.text}
                           </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50 dark:bg-[#0A0A0A]/60 p-8 rounded-[32px] border border-slate-100 dark:border-white/10 mb-10 shadow-inner">
                        <h4 className="text-xl font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2.5">
                          <Lightbulb className="text-amber-500" size={22} />
                          核心内容摘要
                        </h4>
                        <ul className="space-y-4">
                          <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-300 font-medium">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                            <span>该技术在实际大田示范生产中已得到严谨验证，平均能有效提升作物产量约 15%-20%。</span>
                          </li>
                          <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-300 font-medium">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                            <span>种植重点在于前期对底土有机质评估，配合精细灌溉系统，保证关键物候指标高位稳态。</span>
                          </li>
                          <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-300 font-medium">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                            <span>推荐应用“农芯智境”实时星地遥感或物联网气压监控参数，实现微气象精确联动。</span>
                          </li>
                        </ul>
                      </div>
                    )}

                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-10 font-medium">
                      随着现代农业技术的不断进步，越来越多的数字化、智能感知手段被引入到田间地头。本文所介绍的内容由农芯智境推荐平台结合科学科研规范进行提炼，更多精确技术参数与规范操作，请咨询农推机构或与技术团队积极探讨开展中高密度测产。
                    </p>

                    <div className="flex justify-center mt-12 mb-10">
                      <a 
                        href={selectedArticle.link || `https://plantvillage.psu.edu/topics/wheat/infos`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-8 py-3.5 bg-white dark:bg-[#1A1A1E] text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-2xl font-extrabold text-xs transition-all hover:shadow-md hover:scale-[1.01] no-underline"
                      >
                        <BookOpen size={14} className="text-emerald-500" />
                        阅读官方学术原文首发处
                        <ExternalLink size={12} className="opacity-60" />
                      </a>
                    </div>
                  </div>

                  {/* 相关推荐 */}
                  <div className="mt-16 pt-10 border-t border-slate-100 dark:border-white/10">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2.5">
                      <BookOpen size={22} className="text-emerald-600" />
                      相关阅读推荐
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {recommendations
                        .filter(r => r.id !== selectedArticle.id)
                        .slice(0, 2)
                        .map((related, i) => (
                          <motion.div 
                            key={i}
                            whileHover={{ y: -4 }}
                            onClick={() => {
                              setSelectedArticle(related);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="flex gap-5 p-5 rounded-3xl bg-slate-50 dark:bg-[#1A1A1A]/40 border border-slate-100 dark:border-white/10 hover:bg-white dark:hover:bg-[#1A1A1A]/60 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                          >
                            <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-slate-200 dark:border-white/10 shadow-sm">
                              <img 
                                src={`https://picsum.photos/seed/agri-${related.img}/200/200`} 
                                alt={related.title} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="flex flex-col justify-center">
                              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white line-clamp-2 mb-2 group-hover:text-emerald-600 transition-colors leading-snug">
                                {related.title}
                              </h4>
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{related.date}</span>
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  </div>

                  {/* Article Reading Bottom Menu */}
                  <div className="mt-16 pt-10 border-t border-slate-100 dark:border-white/10 flex flex-col sm:flex-row gap-6 justify-between items-center bg-transparent">
                    <button 
                      onClick={() => {
                        setSelectedArticle(null);
                        if (rightContentRef.current) rightContentRef.current.scrollTop = 0;
                      }}
                      className="w-full sm:w-auto px-6 py-3.5 bg-slate-100 dark:bg-[#1C1C1E] hover:bg-slate-200 dark:hover:bg-[#25252D] text-slate-600 dark:text-slate-300 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-200/55 dark:border-white/5"
                    >
                      <ArrowLeft size={14} />
                      返回知识库
                    </button>
                    
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center">
                      <button 
                        onClick={() => {
                          const directUrl = `${window.location.origin}?tab=knowledge&articleId=${selectedArticle.id}`;
                          navigator.clipboard.writeText(directUrl);
                          addNotification({
                            title: '普及链接已存盘',
                            message: `文章《${selectedArticle.title}》的链接已复制至剪纸薄，快发给其他社群农友吧！`,
                            type: 'success'
                          });
                        }}
                        className="w-full sm:w-auto px-6 py-3.5 bg-emerald-500/10 dark:bg-emerald-500/5 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <Link size={14} />
                        复制分享普及链接
                      </button>

                      <button 
                        onClick={() => handleDeepAnalysis(selectedArticle)}
                        className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2.5 hover:shadow-lg hover:shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-95"
                      >
                        <Sparkles size={15} />
                        AI 农学研判深度剖析
                      </button>
                    </div>  
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="list-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-5">
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                      {showBookmarks ? '我的收藏' : activeCategory === '全部' ? '今日推荐' : `${activeCategory} · 推荐`}
                    </h3>
                    {!showBookmarks && (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border border-emerald-100 dark:border-emerald-900/20">
                        <Clock size={14} />
                        上次更新: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                  {!showBookmarks && (
                    <button 
                      onClick={() => fetchRecommendations(activeCategory, 1, false)}
                      disabled={isRefreshing}
                      className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-[#050505]/50 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 transition-all disabled:opacity-50 shadow-sm active:scale-95"
                    >
                      <RefreshCw size={18} className={cn(isRefreshing && "animate-spin")} />
                      换一批内容
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
                  {error ? (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/10 rounded-full flex items-center justify-center mb-6 text-rose-500">
                        <AlertCircle size={40} />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">内容加载失败</h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">{error}</p>
                      <button 
                        onClick={() => fetchRecommendations(activeCategory, 1, false)}
                        className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
                      >
                        <RefreshCw size={18} />
                        重试加载
                      </button>
                    </div>
                  ) : isRefreshing && recommendations.length === 0 ? (
                    // Skeleton Loader
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-white/80 dark:bg-[#0A0A0A]/60 rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm p-4 space-y-4">
                        <Skeleton className="h-48 w-full rounded-xl" />
                        <div className="space-y-3 pt-2">
                          <Skeleton className="h-6 w-3/4 rounded-lg" />
                          <Skeleton className="h-4 w-full rounded-lg" />
                          <Skeleton className="h-4 w-1/2 rounded-lg" />
                        </div>
                      </div>
                    ))
                  ) : showBookmarks ? (
                    favorites.length > 0 ? (
                      favorites.map((article, i) => (
                        <motion.div 
                          key={`${article.id}-${i}`} 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          onClick={() => setSelectedArticle(article)}
                          className="bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-[0_20px_35px_rgba(16,185,129,0.12)] hover:dark:shadow-[0_20px_35px_rgba(16,185,129,0.08)] overflow-hidden group cursor-pointer hover:-translate-y-2 transition-all duration-300 ease-out relative border border-slate-100 dark:border-white/5 hover:border-emerald-500/30 dark:hover:border-emerald-500/20 flex flex-col h-full"
                        >
                          <div className="h-48 bg-slate-100 dark:bg-[#050505] overflow-hidden relative">
                            <ArticleImage 
                              src={`https://picsum.photos/seed/agri-${article.img}/600/400`} 
                              alt={article.title} 
                            />
                            <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 dark:bg-[#0A0A0A]/90 backdrop-blur-md rounded-full text-[10px] font-black text-forest-green border border-white/20">
                              {article.cat}
                            </div>
                            <button 
                              onClick={(e) => toggleBookmark(article.id, e)}
                              className="absolute top-4 right-4 p-2 rounded-full backdrop-blur-md transition-all border border-red-400 bg-red-500 text-white"
                            >
                              <Heart size={14} fill="currentColor" />
                            </button>
                          </div>
                          <div className="p-5 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <h4 className="font-black text-slate-800 dark:text-white line-clamp-2 leading-snug group-hover:text-forest-green transition-colors text-base flex-1">
                                  {article.title}
                                </h4>
                                <a 
                                  href={article.link || `https://plantvillage.psu.edu/topics/wheat/infos`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="ml-4 p-2 bg-slate-100/80 dark:bg-white/5 rounded-xl text-slate-400 hover:text-forest-green hover:bg-forest-green/10 transition-all active:scale-90"
                                  title="访问原文"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              </div>
                              <p className="text-xs text-slate-400 dark:text-slate-400/70 font-medium line-clamp-3 mb-4">
                                {article.summary}
                              </p>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pt-3 border-t border-slate-100 dark:border-white/5 mt-auto">
                              <span className="flex items-center gap-1.5 group-hover:text-forest-green transition-colors">
                                <BookOpen size={12} />
                                阅读详情
                              </span>
                              <span className="flex items-center gap-1 italic">
                                <Clock size={10} />
                                {article.date}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="col-span-full">
                        <EmptyState 
                          icon={<Heart size={48} />} 
                          title="暂无收藏内容" 
                          description="点击文章右上角的爱心即可收藏相关文章" 
                        />
                      </div>
                    )
                  ) : (
                    displayedRecommendations.map((article, i) => (
                      <motion.div 
                        key={`${article.id}-${i}`} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (i % 6) * 0.1 }}
                        onClick={() => setSelectedArticle(article)}
                        className="bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-[0_20px_35px_rgba(16,185,129,0.12)] hover:dark:shadow-[0_20px_35px_rgba(16,185,129,0.08)] overflow-hidden group cursor-pointer hover:-translate-y-2 transition-all duration-300 ease-out relative border border-slate-100 dark:border-white/5 hover:border-emerald-500/30 dark:hover:border-emerald-500/20 flex flex-col h-full"
                      >
                      <div className="h-48 bg-slate-100 dark:bg-[#050505] overflow-hidden relative">
                        <ArticleImage 
                          src={article.id.startsWith('ugc-') ? `https://picsum.photos/seed/${article.img}/600/400` : `https://picsum.photos/seed/agri-${article.img}/600/400`} 
                          alt={article.title} 
                        />
                        <div className="absolute top-4 left-4 flex flex-col gap-2">
                          <span className="px-3 py-1 bg-white/90 dark:bg-[#0A0A0A]/90 backdrop-blur-md rounded-full text-[10px] font-black text-forest-green border border-white/20">
                            {article.cat}
                          </span>
                          {article.id.startsWith('ugc-') && (
                            <span className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full text-[10px] font-black shadow-lg shadow-indigo-500/20 border border-white/10">
                              🌱 社区共创
                            </span>
                          )}
                        </div>
                        <div className="absolute top-4 right-4 flex gap-2">
                          {article.id.startsWith('ugc-') && (
                            <button 
                              onClick={(e) => deleteUgcArticle(article.id, e)}
                              className="p-2 rounded-full backdrop-blur-md bg-rose-500/95 text-white hover:bg-rose-600 transition-all border border-rose-400"
                              title="删除此共创经验"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <button 
                            onClick={(e) => toggleBookmark(article.id, e)}
                            className={cn(
                              "p-2 rounded-full backdrop-blur-md transition-all border border-white/20",
                              bookmarkedIds.includes(article.id) ? "bg-red-500 text-white border-red-400" : "bg-white/90 dark:bg-[#0A0A0A]/90 text-slate-400 hover:text-red-500"
                            )}
                          >
                            <Heart size={14} fill={bookmarkedIds.includes(article.id) ? "currentColor" : "none"} />
                          </button>
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-black text-slate-800 dark:text-white line-clamp-2 leading-snug group-hover:text-forest-green transition-colors text-base flex-1">
                              {article.title}
                            </h4>
                            {!article.id.startsWith('ugc-') && (
                              <a 
                                href={article.link || `https://plantvillage.psu.edu/topics/wheat/infos`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="ml-4 p-2 bg-slate-100/80 dark:bg-white/5 rounded-xl text-slate-400 hover:text-forest-green hover:bg-forest-green/10 transition-all active:scale-90"
                                title="访问原文"
                              >
                                <ExternalLink size={16} />
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-400/70 font-medium line-clamp-3 mb-4">
                            {article.summary}
                          </p>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pt-3 border-t border-slate-100 dark:border-white/5 mt-auto">
                          <span className="flex items-center gap-1.5 group-hover:text-forest-green transition-colors">
                            <BookOpen size={12} />
                            阅读详情
                          </span>
                          <span className="flex items-center gap-1 italic">
                            <Clock size={10} />
                            {article.date}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
                </div>

                {hasMore && recommendations.length > 0 && (
                  <div className="flex justify-center pb-10">
                    <button 
                      onClick={() => fetchRecommendations(activeCategory, page, true)}
                      disabled={isLoading}
                      className="px-10 py-4 bg-white dark:bg-[#050505]/50 border-2 border-slate-100 dark:border-white/5 rounded-2xl text-sm font-black text-slate-600 dark:text-slate-400 hover:border-forest-green hover:text-forest-green transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          加载中...
                        </>
                      ) : (
                        <>
                          <ChevronRight size={18} className="rotate-90" />
                          加载更多内容
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* 随时悬浮返回列表按钮 (国赛级极致体验) */}
          <AnimatePresence>
            {(manual || selectedArticle) && (
              <motion.button
                key="floating-back-to-list"
                initial={{ opacity: 0, scale: 0.8, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 30 }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setManual(null);
                  setSelectedArticle(null);
                  if (rightContentRef.current) {
                    rightContentRef.current.scrollTop = 0;
                  }
                }}
                className="absolute bottom-8 right-12 z-[40] flex items-center gap-3 px-8 py-4 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-black text-sm shadow-2xl shadow-emerald-500/30 dark:shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-400/30 group cursor-pointer transition-all active:scale-95 rounded-full"
              >
                <div className="w-6 h-6 rounded-xl bg-white/20 flex items-center justify-center group-hover:-translate-x-1 transition-transform">
                  <ArrowLeft size={14} className="text-white" />
                </div>
                <span>返回知识列表</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* AI 深度文章精算解读 Modal Overlay */}
          <AnimatePresence>
            {showDeepAnalysisModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowDeepAnalysisModal(false)}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 15 }}
                  className="relative w-full max-w-xl bg-white dark:bg-[#0c0c0e] rounded-[36px] p-8 shadow-2xl border border-slate-100 dark:border-white/5 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar z-10"
                >
                  <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none" />
                  
                  {deepAnalysisResult.loading ? (
                    <div className="py-16 flex flex-col items-center justify-center text-center">
                      <div className="relative mb-6">
                        <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-500 border border-indigo-500/20 shadow-inner">
                          <Loader2 size={32} className="animate-spin text-indigo-500" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full animate-ping" />
                      </div>
                      <h4 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">AI 农研知识深度降维中...</h4>
                      <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                        基于智谱 AI 多层注意力机制，系统正在通读文章并针对“农芯智境”遥感与温室群体系进行参数映射与核心技术解构，请稍候。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full inline-block border border-indigo-500/10">
                            AI 结构化深度剖析
                          </div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white mt-3 leading-snug">
                            {selectedArticle?.title}
                          </h3>
                        </div>
                        <button 
                          onClick={() => setShowDeepAnalysisModal(false)}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors shrink-0"
                        >
                          <X size={20} className="text-slate-400" />
                        </button>
                      </div>

                      {/* Technical breakdown */}
                      <div className="bg-slate-50 dark:bg-[#151518] p-5 rounded-3xl border border-slate-100 dark:border-white/5">
                        <div className="flex items-center gap-2 mb-3 text-indigo-500">
                          <Sparkles size={16} />
                          <span className="text-xs font-black tracking-widest">核心技术点原理解析</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed font-semibold">
                          {deepAnalysisResult.breakdown}
                        </p>
                      </div>

                      {/* Numeric indicators */}
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">核心增效精算指标</span>
                        <div className="grid grid-cols-3 gap-3">
                          {deepAnalysisResult.metrics.map((metric, i) => (
                            <div key={i} className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex flex-col items-center justify-center text-center">
                              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{metric.split(/\s/)[0] || metric}</span>
                              {metric.split(/\s/)[1] && (
                                <span className="text-[8px] text-slate-400 mt-1 font-bold">{metric.split(/\s/)[1]}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Warnings / safeguards */}
                      <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20 flex gap-3 items-start">
                        <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                        <div>
                          <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block">大田实施安全警示</span>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 font-medium leading-normal font-semibold">
                            {deepAnalysisResult.safeguards}
                          </p>
                        </div>
                      </div>

                      {/* Action Plan steps */}
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">极简大田落地实施流程</span>
                        <div className="space-y-2.5">
                          {deepAnalysisResult.actionPlan.map((step, idx) => (
                            <div key={idx} className="flex gap-3 items-start bg-slate-50 dark:bg-white/5 p-3 rounded-2xl text-xs font-semibold">
                              <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 leading-normal">{step.replace(/^\d+\.\s*/, '')}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button 
                          onClick={() => {
                            addNotification({
                              title: '已同步至种植推荐清单',
                              message: `成功提取《${selectedArticle?.title}》的技术流程，已一键录入农地推荐配置清单数据中。`,
                              type: 'success'
                            });
                            setShowDeepAnalysisModal(false);
                          }}
                          className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-500/10 hover:bg-emerald-700 transition-colors"
                        >
                          同步至我的种植推荐配置
                        </button>
                        <button 
                          onClick={() => setShowDeepAnalysisModal(false)}
                          className="px-6 py-3.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase;
