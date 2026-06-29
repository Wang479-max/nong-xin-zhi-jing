import React, { useState, useEffect } from 'react';
import { ShieldAlert, Check, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UserNoticeModalProps {
  onAccept: () => void;
}

const UserNoticeModal: React.FC<UserNoticeModalProps> = ({ onAccept }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 font-sans backdrop-blur-md"
      >
        <motion.div
           initial={{ opacity: 0, scale: 0.9, y: 20 }}
           animate={{ opacity: 1, scale: 1, y: 0 }}
           exit={{ opacity: 0, scale: 0.95, y: -20 }}
           transition={{ type: "spring", damping: 25, stiffness: 300 }}
           className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-900 border border-slate-700/50 shadow-2xl flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-800/50 px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">用户须知 (User Notice)</h2>
              <p className="text-xs text-slate-400 mt-0.5">开始使用系统前，请仔细阅读以下声明。</p>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 text-slate-300 space-y-5 text-sm leading-relaxed custom-scrollbar">
            
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 flex gap-3 text-cyan-100">
              <FileText className="shrink-0 text-cyan-400 mt-0.5" size={18} />
              <p>
                <strong>声明：</strong> 本产品目前作为 <strong>“中国大计算机设计大赛”</strong> 的参赛首发作品进行展示。作品凝结了多项前沿 AI 和数字孪生技术，具备极高的商业与学术价值，并具备后续推向市场的商业化潜力。
              </p>
            </div>

            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-2">1. 数据及隐私说明</h3>
            <p>
              系统中的所有三维映射坐标、气象模拟、土壤肥力推演及病虫害样例数据，均来自于课题环境假设及公开学术开源数据集，仅用于赛事演示。在当前阶段，应用不会擅自收集您的个人敏感信息，演示所用账号权限受限。
            </p>

            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-2">2. 大模型协同识别引擎</h3>
            <p>
              本系统核心植保识别和决策引擎，通过 <strong>阿里云百炼视觉引擎</strong> 和 <strong>智谱 AI 视觉与推理计算层</strong> 实现交叉推理。相关农技分析结果与施肥喷洒方案（包括详细的处方报告），系由人工智能基于多模态视觉数据自动生成。
            </p>

            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-2">3. 免责及安全性声明</h3>
            <p>
              鉴于 AI 引擎输出可能存在“幻觉”以及大语言模型当前的发展瓶颈，系统生成的农业病害报告、施肥剂量、灾害预警等诊断结果<strong>仅供学术探讨与技术展示参考，绝不构成任何实际农艺及生产行动的权威指导。</strong> 若在此阶段将本系统数据直接用于真实农业生产中，所产生的一切损失由用户自行承担。
            </p>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800 bg-slate-800/30 px-6 py-4 flex items-center justify-end">
            <button
              onClick={onAccept}
              className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 px-6 py-2.5 text-sm font-semibold text-white transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <Check size={18} />
              我已知晓并同意
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UserNoticeModal;
