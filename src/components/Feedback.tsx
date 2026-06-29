import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  AlertCircle, 
  Lightbulb, 
  HelpCircle, 
  Camera, 
  X, 
  Send, 
  CheckCircle2,
  Loader2,
  Phone,
  TrendingUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import DataService from '../services/dataService';

type FeedbackType = 'issue' | 'suggestion' | 'other';

interface FeedbackProps {
  user: any;
}

const Feedback: React.FC<FeedbackProps> = ({ user }) => {
  const [type, setType] = useState<FeedbackType>('issue');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('图片大小不能超过 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshot(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('请填写反馈描述');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await DataService.submitFeedback({
        type,
        description,
        screenshot: screenshot || undefined,
        contact: contact || undefined
      });
      setIsSuccess(true);
      // Reset form
      setType('issue');
      setDescription('');
      setContact('');
      setScreenshot(null);
    } catch (err: any) {
      setError(err.message || '提交失败，请稍后再试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const feedbackTypes = [
    { id: 'issue', label: '问题反馈', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' },
    { id: 'suggestion', label: '功能建议', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'other', label: '其他意见', icon: HelpCircle, color: 'text-blue-500', bg: 'bg-blue-50' },
  ];

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6"
        >
          <CheckCircle2 className="w-12 h-12 text-green-600" />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">提交成功！</h2>
        <p className="text-gray-600 mb-8 max-w-md">
          感谢您的反馈！您的意见对我们非常重要，我们将认真评估并不断改进平台。
        </p>
        <button
          onClick={() => setIsSuccess(false)}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          继续反馈
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-600" />
          用户反馈
        </h1>
        <p className="text-gray-600 mt-1">
          在使用过程中遇到任何问题或有改进建议，请随时告诉我们。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 glass-panel p-8 rounded-2xl shadow-sm">
        {/* Feedback Type */}
        <div>
          <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">反馈类型</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {feedbackTypes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id as FeedbackType)}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left",
                  type === item.id 
                    ? "border-green-600 bg-green-50 ring-2 ring-green-100" 
                    : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                )}
              >
                <div className={cn("p-2 rounded-lg", item.bg)}>
                  <item.icon className={cn("w-5 h-5", item.color)} />
                </div>
                <span className={cn("font-medium", type === item.id ? "text-green-900" : "text-gray-700")}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            详细描述 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="请详细描述您遇到的问题或您的建议..."
            className="w-full input-glass p-4 transition-all resize-none"
          />
        </div>

        {/* Screenshot Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">上传截图 (可选)</label>
          <div className="flex flex-wrap gap-4">
            <AnimatePresence>
              {screenshot && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative w-32 h-32 rounded-xl overflow-hidden border border-gray-200"
                >
                  <img src={screenshot} alt="Screenshot" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={removeScreenshot}
                    className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            {!screenshot && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50/30 transition-all"
              >
                <Camera className="w-6 h-6" />
                <span className="text-xs font-medium">点击上传</span>
              </button>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <p className="text-xs text-gray-400 mt-2">支持 JPG, PNG 格式，大小不超过 5MB</p>
        </div>

        {/* Contact Info */}
        <div>
          <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-2">
            联系方式 (可选)
          </label>
          <div className="relative">
            <input
              type="text"
              id="contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="手机号、邮箱或微信号，方便我们联系您"
              className="w-full input-glass p-4 pl-12 transition-all"
            />
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-sm"
          >
            <AlertCircle className="w-4 h-4" />
            {error}
          </motion.div>
        )}

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "w-full btn-primary py-4 rounded-xl flex items-center justify-center gap-2",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                提交反馈
              </>
            )}
          </button>
        </div>
      </form>

      {/* 需求投票与 NPS 调研 (国赛增强) */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 用户需求墙 */}
        <div className="p-8 bg-white dark:bg-[#1A1A1A] rounded-[32px] border border-slate-100 dark:border-white/5 shadow-2xl shadow-blue-500/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
             <MessageSquare size={100} className="text-blue-500" />
          </div>
          <h3 className="font-black text-xl text-slate-800 dark:text-white mb-6 flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-500" />
            功能迭代需求墙
          </h3>
          <div className="space-y-4">
            {[
              { title: '大棚卷帘机一键联动', tag: '智能控制', votes: 342, status: '开发中' },
              { title: '农业植保无人机轨迹规划', tag: '数字孪生', votes: 218, status: '规划中' },
              { title: '农产品市场行情自定义订阅', tag: '数据中台', votes: 156, status: '已采纳' },
            ].map((item, i) => (
              <div key={i} className="group p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 flex items-center justify-between hover:border-emerald-500/30 transition-all cursor-pointer">
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm mb-1">{item.title}</h4>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase rounded-md">{item.tag}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{item.status}</span>
                  </div>
                </div>
                <button className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-[#2A2A2A] border border-slate-200 dark:border-white/10 shadow-sm group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 group-hover:border-emerald-200 dark:group-hover:border-emerald-800 transition-all text-slate-500 group-hover:text-emerald-600">
                  <TrendingUp size={14} className="mb-1" />
                  <span className="text-[10px] font-black">{item.votes}</span>
                </button>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between items-center text-xs font-bold text-slate-400">
             <span>NLP 模型已自动打标聚类 1,240 条建议</span>
             <button className="text-emerald-600 hover:text-emerald-700 uppercase">查看完整更新日志</button>
          </div>
        </div>

        {/* 净推荐值 (NPS) 调研 */}
        <div className="p-8 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-[32px] border border-emerald-100 dark:border-emerald-500/20 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
          <h3 className="font-black text-xl text-emerald-900 dark:text-emerald-300 mb-2 flex items-center gap-2 relative z-10">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            提升您的产品体验
          </h3>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium mb-6 relative z-10">
            您有多大可能会把“农芯智境”推荐给其他农场主或同行？
          </p>
          
          <div className="flex justify-between items-end gap-1 mb-2 relative z-10">
            {[0,1,2,3,4,5,6,7,8,9,10].map(score => (
              <button key={score} className="w-8 h-10 rounded-lg flex items-center justify-center font-mono font-black text-xs transition-all hover:-translate-y-1 focus:bg-emerald-500 focus:text-white bg-white/50 dark:bg-black/20 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                {score}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-widest relative z-10 mb-8">
            <span>极不可能</span>
            <span>非常可能</span>
          </div>

          <div className="bg-white/60 dark:bg-black/20 p-4 rounded-2xl border border-emerald-200/50 dark:border-emerald-800 flex items-center gap-4 relative z-10">
             <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30">
               <span className="font-black">🏅</span>
             </div>
             <div>
               <p className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">先锋体验官计划</p>
               <p className="text-[10px] text-emerald-700 dark:text-emerald-500 mt-0.5">参与调研可解锁“智农先锋”专属社区勋章与高级模型体验额度。</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Feedback;
