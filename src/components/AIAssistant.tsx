import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send, X, Loader2, Bot, User, Sparkles, Mic, MicOff, Volume2, VolumeX, BellRing, BellOff, Settings, ChevronDown, Zap, AlertCircle, RefreshCw, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import DataService from '../services/dataService';
import { useNotifications } from '../context/NotificationContext';
import { useAIRequest } from '../hooks/useAIRequest';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIAssistant() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    (window as any).isAIAssistantOpen = isOpen;
    return () => {
      (window as any).isAIAssistantOpen = false;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    const handleClose = () => {
      setIsOpen(false);
      window.speechSynthesis?.cancel();
    };
    window.addEventListener('toggle-ai-assistant', handleToggle);
    window.addEventListener('close-ai-assistant', handleClose);
    return () => {
      window.removeEventListener('toggle-ai-assistant', handleToggle);
      window.removeEventListener('close-ai-assistant', handleClose);
    };
  }, []);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('ai_assistant.welcome') }
  ]);
  const [input, setInput] = useState('');
  const {
    request: chatRequest,
    retry: retryChat,
    isLoading,
    error: chatError,
    stepText: chatStepText,
    progress: chatProgress
  } = useAIRequest(DataService.chat);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [announceNotifications, setAnnounceNotifications] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const { notifications, addNotification } = useNotifications();
  const lastProcessedNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      if (lastProcessedNotificationId.current === null) {
        // First render, just set the id, don't speak old notifications
        lastProcessedNotificationId.current = latest.id;
      } else if (latest.id !== lastProcessedNotificationId.current) {
        lastProcessedNotificationId.current = latest.id;
        if (announceNotifications && autoSpeak) {
          let prefix = t('ai_assistant.system_notification');
          if (latest.type === 'warning') prefix = t('ai_assistant.warning_notification');
          if (latest.type === 'error') prefix = t('ai_assistant.error_notification');
          if (latest.type === 'success') prefix = t('ai_assistant.success_notification');
          speak(`${prefix}${latest.title}。${latest.message}`);
        }
      }
    }
  }, [notifications, announceNotifications, autoSpeak]);

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!('speechSynthesis' in window) || !window.speechSynthesis) {
      console.warn('Speech synthesis not supported in this browser environment');
      return;
    }
    const loadVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        const zhVoices = voices.filter(v => v.lang.includes('zh'));
        setAvailableVoices(zhVoices);
        
        setSelectedVoiceURI(prev => {
          if (prev) return prev; // 如果用户已经选择了，就不覆盖
          if (zhVoices.length > 0) {
            // 优先级打分系统，选出最接近真人的声音作为默认
            let bestVoice = zhVoices[0];
            let highestScore = -1;
            
            zhVoices.forEach(v => {
              let score = 0;
              const name = (v.name || '').toLowerCase();
              if (name.includes('natural') || name.includes('online')) score += 10;
              if (name.includes('xiaoxiao')) score += 5;
              if (name.includes('yunxi') || name.includes('yunjian')) score += 5;
              if (name.includes('tingting')) score += 3;
              
              if (score > highestScore) {
                highestScore = score;
                bestVoice = v;
              }
            });
            return bestVoice.voiceURI;
          }
          return '';
        });
      } catch (e) {
        console.error('Failed to load speech voices:', e);
      }
    };
    
    loadVoices();
    try {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    } catch (e) {
      console.warn('speechSynthesis.onvoiceschanged not supported:', e);
    }
  }, []);

  const cleanTextForSpeech = (rawText: string) => {
    return rawText
      .replace(/\*\*/g, '') // 移除 Markdown 加粗
      .replace(/\*/g, '')   // 移除 Markdown 斜体
      .replace(/#/g, '')    // 移除 Markdown 标题
      .replace(/`/g, '')    // 移除代码块符号
      .replace(/-/g, '')    // 移除列表横杠
      .replace(/\n+/g, '，') // 将换行替换为逗号，增加自然停顿
      .replace(/([。！？；])，/g, '$1') // 清理标点冲突
      .trim();
  };

  const speak = (text: string) => {
    try {
      if (!('speechSynthesis' in window) || !window.speechSynthesis) {
        console.warn('Browser does not support speech synthesis');
        return;
      }
      
      window.speechSynthesis.cancel();
      
      setTimeout(() => {
        const cleanedText = cleanTextForSpeech(text);
        if (!cleanedText) return;
        
        // Split text into smaller chunks to prevent SpeechSynthesis errors on long text
        const maxLength = 200;
        const textChunks = [];
        let currentChunk = '';
        
        const sentences = cleanedText.split(/([，。！？；])/);
        
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

        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
        const fallbackVoice = voices.filter(v => v.lang.includes('zh'))[0];
        
        const utterances: SpeechSynthesisUtterance[] = [];
        
        textChunks.forEach(chunk => {
          if (!chunk.trim()) return;
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = 'zh-CN';
          if (selectedVoice) utterance.voice = selectedVoice;
          else if (fallbackVoice) utterance.voice = fallbackVoice;
          
          utterance.rate = speechRate;  
          utterance.pitch = speechPitch; 
          utterance.volume = 1.0; 
          
          utterance.onerror = (e) => {
            console.warn('Speech error:', e);
          };
          
          utterances.push(utterance);
        });
        
        // Store the utterances in ref so they don't get garbage collected
        (utteranceRef as any).current = utterances;
        
        utterances.forEach(u => window.speechSynthesis.speak(u));
        
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 50);
    } catch (e) {
      console.error("Speech synthesis error:", e);
    }
  };

  const toggleListen = async () => {
    // 立即触发一次空的语音播报，以解锁浏览器的语音合成限制
    if ('speechSynthesis' in window) {
      const unlockUtterance = new SpeechSynthesisUtterance(''); 
      unlockUtterance.volume = 0.01;
      window.speechSynthesis.speak(unlockUtterance);
    }

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
        // Don't return here, let fallback to SpeechRecognition if possible, though it also might fail.
      } else {
        // 强制请求麦克风权限，解决 iframe 或部分浏览器下权限被静默拒绝的问题
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 获取权限后立即停止该 stream，因为 SpeechRecognition 会自己管理录音
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.warn('Microphone permission warning:', err);
      addNotification({
        title: t('ai_assistant.mic_permission_denied.title'),
        message: t('ai_assistant.mic_permission_denied.message'),
        type: 'warning'
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addNotification({
        title: t('ai_assistant.browser_not_supported.title'),
        message: t('ai_assistant.browser_not_supported.message'),
        type: 'warning'
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    // 使用 interimResults = true 可以让用户看到正在识别的过程，体验更好
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      // 我们只在最终结果时追加到输入框，避免重复
      if (finalTranscript) {
        setInput(prev => prev ? prev + ' ' + finalTranscript : finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          addNotification({
            title: t('ai_assistant.mic_permission_denied.title'),
            message: t('ai_assistant.mic_permission_denied.message'),
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

  const quickPrompts = t('ai_assistant.suggestions', { returnObjects: true }) as string[];

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    // 立即触发一次空的语音播报，以解锁浏览器的语音合成限制（解决异步请求后无法发声的问题）
    if (autoSpeak && 'speechSynthesis' in window) {
      const unlockUtterance = new SpeechSynthesisUtterance(''); 
      unlockUtterance.volume = 0.01; // 极小音量，避免被浏览器忽略
      window.speechSynthesis.speak(unlockUtterance);
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    }

    const userMessage = textToSend.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // 语音/文本指令拦截：地块监测
    if (userMessage.includes('检查') && userMessage.includes('地块')) {
      const match = userMessage.match(/检查(.+?)的(.*)/);
      const plotName = match ? match[1] : "目标地块";
      const metricName = match ? match[2] : "数据";
      
      setTimeout(() => {
        const reply = `收到指令，正在为您跳转到${plotName}的监测页面并显示${metricName}数据...`;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        if (autoSpeak) speak(reply);
        
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigateTab', { detail: 'monitoring' }));
          setIsOpen(false);
        }, 2000);
      }, 500);
      return;
    }

    // 语音/文本指令拦截：进入3D视图模式
    if (userMessage.includes('进入3D') || userMessage.includes('3D视图') || userMessage.includes('3d模式') || userMessage.includes('3d视图') || userMessage.includes('数字孪生')) {
      setTimeout(() => {
        const reply = `收到指令，正在为您开启3D数字孪生视图...`;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        if (autoSpeak) speak(reply);
        
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('setAppMode', { detail: '3d' }));
          setIsOpen(false);
        }, 2000);
      }, 500);
      return;
    }

    // 语音/文本指令拦截：查看地块对比报告
    if (userMessage.includes('对比报告') || userMessage.includes('地块对比') || userMessage.includes('对比分析')) {
      setTimeout(() => {
        const reply = `收到指令，正在为您切换到多地块对比分析报告视图...`;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        if (autoSpeak) speak(reply);
        
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigateTab', { detail: 'monitoring' }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-compare-mode'));
          }, 300);
          setIsOpen(false);
        }, 2000);
      }, 500);
      return;
    }

    try {
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const replyData = await chatRequest(userMessage, history);
      if (replyData) {
        if (replyData._optimizationTriggered) {
          addNotification({
            title: '系统链路自动优化',
            message: '由于当前引擎响应超时或异常，系统已自动切换至备用镜像节点，确保对话高可用。',
            type: 'info'
          });
        }
        setMessages(prev => [...prev, { role: 'assistant', content: replyData.text || replyData }]);
        if (autoSpeak) speak(replyData.text || replyData);
      }
    } catch (error: any) {
      console.error('AI Error:', error);
      // We don't need to add a message here because the UI will show the chatError state
    }
  };

  const handleRetry = async () => {
    if (isLoading) return;
    try {
      const reply = await retryChat();
      if (reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        if (autoSpeak) speak(reply);
      }
    } catch (error: any) {
      console.error('AI Retry Error:', error);
    }
  };

  const getErrorDetails = (error: string | null) => {
    if (!error) return null;
    
    if (error.includes('额度已耗尽') || error.includes('403') || error.includes('429')) {
      return {
        title: t('ai_assistant.errors.quota.title'),
        desc: t('ai_assistant.errors.quota.desc'),
        suggestions: t('ai_assistant.errors.quota.tips', { returnObjects: true }) as string[],
        action: { label: t('ai_assistant.errors.quota.action'), onClick: () => (window as any).openSettings?.('ai') }
      };
    }
    
    if (error.includes('API 密钥') || error.includes('401')) {
      return {
        title: t('ai_assistant.errors.invalid_key.title'),
        desc: t('ai_assistant.errors.invalid_key.desc'),
        suggestions: t('ai_assistant.errors.invalid_key.tips', { returnObjects: true }) as string[],
        action: { label: t('ai_assistant.errors.invalid_key.action'), onClick: () => (window as any).openSettings?.('ai') }
      };
    }

    if (error.includes('网络') || error.includes('Failed to fetch') || error.includes('无法连接')) {
      return {
        title: t('ai_assistant.errors.network.title'),
        desc: t('ai_assistant.errors.network.desc'),
        suggestions: t('ai_assistant.errors.network.tips', { returnObjects: true }) as string[],
        action: { label: t('ai_assistant.errors.network.action'), onClick: handleRetry }
      };
    }

    return {
      title: t('ai_assistant.errors.unknown.title'),
      desc: error,
      suggestions: t('ai_assistant.errors.unknown.tips', { returnObjects: true }) as string[],
      action: { label: t('ai_assistant.errors.unknown.action'), onClick: handleRetry }
    };
  };

  const errorDetails = getErrorDetails(chatError);

  return (
    <>
      {/* Floating Toggle Button */}
      <button 
        id="ai-assistant-ball"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-forest-green text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all z-[60] group"
      >
        <div className="absolute inset-0 bg-forest-green rounded-full animate-ping opacity-20 group-hover:hidden" />
        <MessageSquare size={28} />
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center">
          <Sparkles size={10} className="text-white" />
        </div>
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-end p-8 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#121214] rounded-[32px] shadow-2xl border border-slate-100 dark:border-white/5 flex flex-col overflow-hidden pointer-events-auto h-[600px]"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
                <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                
                <div className="relative z-10 flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center shadow-lg border border-white/30">
                    <Bot size={28} className="text-white" />
                  </div>
                  <div>
                    <h4 className="font-black text-lg tracking-tight leading-none mb-1">{t('app.brand')} AI</h4>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      <p className="text-[10px] opacity-80 font-black uppercase tracking-widest">{t('app.online')}</p>
                    </div>
                  </div>
                </div>
                
                <div className="relative z-10 flex items-center gap-1">
                  <button 
                    onClick={() => {
                      setAnnounceNotifications(!announceNotifications);
                      if (announceNotifications) window.speechSynthesis?.cancel();
                    }}
                    className={cn(
                      "p-2.5 rounded-xl transition-all active:scale-95",
                      announceNotifications ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10"
                    )}
                    title={announceNotifications ? t('ai_assistant.tooltips.announce_off') : t('ai_assistant.tooltips.announce_on')}
                  >
                    {announceNotifications ? <BellRing size={18} /> : <BellOff size={18} />}
                  </button>
                  <button 
                    onClick={() => {
                      setAutoSpeak(!autoSpeak);
                      if (autoSpeak) window.speechSynthesis?.cancel();
                    }}
                    className={cn(
                      "p-2.5 rounded-xl transition-all active:scale-95",
                      autoSpeak ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10"
                    )}
                    title={autoSpeak ? t('ai_assistant.tooltips.speak_off') : t('ai_assistant.tooltips.speak_on')}
                  >
                    {autoSpeak ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={cn(
                      "p-2.5 rounded-xl transition-all active:scale-95",
                      showSettings ? "bg-white/30 text-white shadow-inner" : "text-white/60 hover:bg-white/10"
                    )}
                    title={t('ai_assistant.tooltips.settings')}
                  >
                    <Settings size={18} />
                  </button>
                  <div className="w-px h-6 bg-white/20 mx-1" />
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      window.speechSynthesis?.cancel();
                      if (isListening) {
                        recognitionRef.current?.stop();
                        setIsListening(false);
                      }
                    }}
                    className="p-2.5 hover:bg-red-500 text-white rounded-xl transition-all active:scale-95"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Settings Panel */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-slate-50 dark:bg-[#1A1A1A] border-b border-slate-200 dark:border-white/10 overflow-hidden"
                  >
                    <div className="p-6 space-y-5">
                      {/* Voice Selection */}
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Volume2 size={12} className="text-emerald-500" />
                          {t('ai_assistant.voice_select')}
                        </label>
                        <div className="relative group/select">
                          <select 
                            value={selectedVoiceURI}
                            onChange={(e) => setSelectedVoiceURI(e.target.value)}
                            className="w-full bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all appearance-none cursor-pointer pr-10 shadow-sm"
                          >
                            {availableVoices.map(voice => (
                              <option key={voice.voiceURI} value={voice.voiceURI}>
                                {(voice.name || '').replace('Microsoft ', '')} {(voice.name || '').toLowerCase().includes('natural') ? '✨' : ''}
                              </option>
                            ))}
                            {availableVoices.length === 0 && (
                              <option value="">{t('app.online')}</option>
                            )}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover/select:text-emerald-500 transition-colors">
                            <ChevronDown size={16} />
                          </div>
                        </div>
                        {availableVoices.length === 0 && (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/20">
                            <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium leading-relaxed">您的浏览器未检测到额外的中文语音包，将使用系统默认声音。建议使用 Chrome 浏览器以获得最佳体验。</p>
                          </div>
                        )}
                      </div>

                      {/* Rate & Pitch */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('ai_assistant.speech_rate')}</label>
                            <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full">{speechRate.toFixed(1)}x</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.1"
                            value={speechRate}
                            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('ai_assistant.speech_pitch')}</label>
                            <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full">{speechPitch.toFixed(1)}</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.1"
                            value={speechPitch}
                            onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      </div>

                      {/* Toggles */}
                      <div className="flex items-center gap-3 pt-1">
                        <button 
                          onClick={() => setAnnounceNotifications(!announceNotifications)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2.5 py-3 rounded-2xl text-[10px] font-black transition-all border shadow-sm active:scale-95",
                            announceNotifications 
                              ? "bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20" 
                              : "bg-white dark:bg-[#2A2A2A] text-slate-500 border-slate-200 dark:border-white/10"
                          )}
                        >
                          {announceNotifications ? <BellRing size={14} /> : <BellOff size={14} />}
                          {t('ai_assistant.announce_notifications')}
                        </button>
                        <button 
                          onClick={() => setAutoSpeak(!autoSpeak)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2.5 py-3 rounded-2xl text-[10px] font-black transition-all border shadow-sm active:scale-95",
                            autoSpeak 
                              ? "bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20" 
                              : "bg-white dark:bg-[#2A2A2A] text-slate-500 border-slate-200 dark:border-white/10"
                          )}
                        >
                          {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
                          {t('ai_assistant.auto_speak')}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8FAFC] dark:bg-[#080808] custom-scrollbar relative"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.03),transparent)] pointer-events-none" />
                
                {messages.map((m, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-4 max-w-[90%] relative z-10",
                      m.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg border border-white/20",
                      m.role === 'user' ? "bg-slate-200 dark:bg-[#2A2A2A] text-slate-600 dark:text-slate-300" : "bg-emerald-600 text-white"
                    )}>
                      {m.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                    </div>
                    <div className={cn(
                      "p-5 rounded-[28px] text-sm leading-relaxed relative group shadow-sm border transition-all hover:shadow-md",
                      m.role === 'user' 
                        ? "bg-emerald-600 text-white rounded-tr-none border-emerald-500" 
                        : "glass-panel text-slate-700 dark:text-slate-300 rounded-tl-none"
                    )}>
                      {m.role === 'user' ? (
                        <p className="font-medium">{m.content}</p>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-strong:text-emerald-600 dark:prose-strong:text-emerald-400 prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-headings:text-slate-900 dark:prose-headings:text-white prose-headings:font-black">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                          
                          {/* 跨模块联动呈现 (国赛级增强: AI 与执行引擎联动) */}
                          {(m.content.includes('施肥') || m.content.includes('工单') || m.content.includes('滴灌')) && (
                            <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl flex items-start gap-4">
                              <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 rounded-xl">
                                <Activity size={20} />
                              </div>
                              <div className="flex-1">
                                <h5 className="text-[11px] font-black tracking-widest text-emerald-800 dark:text-emerald-300 uppercase mb-1">系统已提取执行意图</h5>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3 font-medium">
                                  {m.content.includes('施肥') ? '检测到施肥策略，是否一键下发 [磷酸二氢钾施肥] 自动执行工单至 1号主干地块？' : '检测到灌溉策略，是否联动硬件控制网关启动？'}
                                </p>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => addNotification({title: '指令下发成功', message: '已联动数字孪生系统启动工单。', type: 'success'})} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                                    一键生成并下发工单
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {m.role === 'assistant' && (
                        <div className="mt-4 flex items-center justify-end border-t border-slate-100 dark:border-white/5 pt-3">
                          <button
                            onClick={() => speak(m.content)}
                            className="flex items-center gap-2 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors font-black uppercase tracking-wider"
                            title={t('ai_assistant.tooltips.respeak')}
                          >
                            <Volume2 size={14} />
                            Play Audio
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                      <Bot size={20} />
                    </div>
                    <div className="p-5 bg-white dark:bg-[#1A1A1A] rounded-[28px] rounded-tl-none shadow-sm border border-slate-100 dark:border-white/5 w-full">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex gap-1">
                          <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        </div>
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{chatStepText || t('ai_assistant.thinking')}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${chatProgress}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {errorDetails && (
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                      <AlertCircle size={20} />
                    </div>
                    <div className="p-6 bg-rose-50 dark:bg-rose-900/10 rounded-[28px] rounded-tl-none border border-rose-100 dark:border-rose-900/20 w-full">
                      <h4 className="text-base font-black text-rose-800 dark:text-rose-400 mb-2">{errorDetails.title}</h4>
                      <p className="text-sm font-medium text-rose-600 dark:text-rose-400/70 mb-4">{errorDetails.desc}</p>
                      
                      <div className="bg-white/50 dark:bg-black/20 rounded-xl p-4 mb-4">
                        <p className="text-[10px] font-black text-rose-400 dark:text-rose-500 uppercase tracking-widest mb-2">建议操作</p>
                        <ul className="space-y-1.5">
                          {errorDetails.suggestions.map((s, i) => (
                            <li key={i} className="text-xs font-bold text-rose-700 dark:text-rose-300 flex gap-2">
                              <span className="text-rose-400">•</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button 
                        onClick={errorDetails.action.onClick}
                        className="flex items-center gap-2 px-6 py-3 bg-rose-500 text-white rounded-2xl text-xs font-black hover:bg-rose-600 transition-all shadow-xl shadow-rose-500/30 active:scale-95"
                      >
                        {errorDetails.action.label === '立即重试' ? <RefreshCw size={14} /> : <Zap size={14} />}
                        {errorDetails.action.label}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-[#121214] flex flex-col gap-4 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
                {messages.length === 1 && (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 -mx-2 px-2">
                    {quickPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(prompt)}
                        className="shrink-0 px-4 py-2 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center gap-2 shadow-sm whitespace-nowrap active:scale-95"
                      >
                        <Zap size={12} className="text-amber-500" />
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative flex items-center gap-3">
                  <button
                    onClick={toggleListen}
                    className={cn(
                      "w-14 h-14 rounded-2xl transition-all shrink-0 flex items-center justify-center border active:scale-90",
                      isListening 
                        ? "bg-rose-500 text-white border-rose-600 animate-pulse shadow-xl shadow-rose-500/40" 
                        : "bg-slate-50 dark:bg-[#2A2A2A] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-[#3A3A3A] shadow-inner"
                    )}
                    title={isListening ? t('ai_assistant.tooltips.mic_off') : t('ai_assistant.tooltips.mic_on')}
                  >
                    {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  <div className="relative flex-1 group">
                    <input 
                      type="text" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={isListening ? t('ai_assistant.listening') : t('ai_assistant.placeholder')}
                      className="w-full pl-6 pr-16 py-4 input-glass text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all disabled:opacity-50 shadow-inner"
                    />
                    <button 
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-11 h-11 btn-primary text-white rounded-2xl flex items-center justify-center active:scale-90"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
