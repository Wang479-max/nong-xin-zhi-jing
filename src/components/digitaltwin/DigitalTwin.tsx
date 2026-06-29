import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import CesiumMacroView from './CesiumMacroView';
import ThreeJsMicroView from './ThreeJsMicroView';
import HUD from './HUD';
import { DigitalTwinProps } from './shared/types';

export default function DigitalTwin(props: DigitalTwinProps) {
  const [viewMode, setViewMode] = useState<'macro' | 'micro'>('macro');
  const [loading, setLoading] = useState(true);
  const [isImmersive, setIsImmersive] = useState(false);

  useEffect(() => {
    // Initial loading animation
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const toggleImmersive = () => setIsImmersive(prev => !prev);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isImmersive) {
        setIsImmersive(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImmersive]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black font-sans text-white">
      {/* 引擎层 */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${viewMode === 'macro' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
        <CesiumMacroView {...props} viewMode={viewMode} isImmersive={isImmersive} />
      </div>
      
      <div className={`absolute inset-0 transition-opacity duration-1000 ${viewMode === 'micro' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
        <ThreeJsMicroView {...props} viewMode={viewMode} isImmersive={isImmersive} />
      </div>

      {/* HUD 覆盖层 */}
      <div className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-700 ${isImmersive ? 'opacity-0' : 'opacity-100'}`}>
        <HUD 
          {...props} 
          viewMode={viewMode} 
          onToggleView={() => setViewMode(v => v === 'macro' ? 'micro' : 'macro')} 
          isImmersive={isImmersive}
          onToggleImmersive={toggleImmersive}
        />
      </div>

      {/* 沉浸模式退出按钮 */}
      {isImmersive && (
        <div className="absolute top-6 right-6 z-50">
          <button 
            onClick={toggleImmersive}
            className="px-4 py-2 bg-slate-900/60 backdrop-blur-md border border-cyan-500/50 text-cyan-300 rounded-xl hover:bg-slate-800/80 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)] text-sm font-medium tracking-widest flex items-center gap-2"
          >
            退出沉浸模式 [Esc]
          </button>
        </div>
      )}

      {/* 加载动画骨架屏 */}
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-50 bg-[#020617] flex flex-col"
          >
            {/* Header Skeleton */}
            <div className="flex justify-between p-6">
              <div className="flex flex-col gap-2">
                <div className="w-32 h-8 bg-slate-800/50 rounded-lg animate-pulse" />
                <div className="w-40 h-8 bg-slate-800/50 rounded-lg animate-pulse" />
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="w-64 h-10 bg-slate-800/50 rounded-lg animate-pulse" />
                <div className="w-48 h-6 bg-slate-800/50 rounded-lg animate-pulse mt-2" />
              </div>
            </div>

            {/* Main Content Area Skeleton */}
            <div className="flex-1 flex justify-between px-6 pb-6 mt-10">
              {/* Left Panel Skeleton */}
              <div className="w-80 flex flex-col gap-4">
                <div className="h-32 bg-slate-800/40 rounded-xl border border-slate-700/30 animate-pulse p-4 flex flex-col gap-3">
                  <div className="w-24 h-4 bg-slate-700/50 rounded" />
                  <div className="w-full h-2 bg-slate-700/30 rounded mt-2" />
                  <div className="w-full h-2 bg-slate-700/30 rounded" />
                  <div className="w-3/4 h-2 bg-slate-700/30 rounded" />
                </div>
                <div className="h-48 bg-slate-800/40 rounded-xl border border-slate-700/30 animate-pulse p-4 flex flex-col gap-3">
                  <div className="w-24 h-4 bg-slate-700/50 rounded" />
                  <div className="flex-1 flex items-end gap-2 mt-4">
                    <div className="w-1/6 h-1/3 bg-slate-700/30 rounded-t-sm" />
                    <div className="w-1/6 h-2/3 bg-slate-700/30 rounded-t-sm" />
                    <div className="w-1/6 h-1/2 bg-slate-700/30 rounded-t-sm" />
                    <div className="w-1/6 h-full bg-slate-700/30 rounded-t-sm" />
                    <div className="w-1/6 h-3/4 bg-slate-700/30 rounded-t-sm" />
                  </div>
                </div>
                <div className="flex-1 bg-slate-800/40 rounded-xl border border-slate-700/30 animate-pulse p-4">
                   <div className="w-24 h-4 bg-slate-700/50 rounded mb-6" />
                   <div className="w-32 h-32 rounded-full border-[12px] border-slate-700/30 mx-auto" />
                </div>
              </div>

              {/* Right Panel Skeleton */}
              <div className="w-80 flex flex-col gap-4">
                <div className="h-48 bg-slate-800/40 rounded-xl border border-slate-700/30 animate-pulse p-4 flex flex-col gap-3">
                   <div className="w-24 h-4 bg-slate-700/50 rounded" />
                   <div className="flex-1 bg-slate-700/20 rounded-lg mt-2" />
                </div>
                <div className="flex-1 bg-slate-800/40 rounded-xl border border-slate-700/30 animate-pulse p-4 flex flex-col gap-4">
                   <div className="w-24 h-4 bg-slate-700/50 rounded mb-2" />
                   {[1,2,3,4].map(i => (
                     <div key={i} className="w-full h-10 bg-slate-700/30 rounded-lg" />
                   ))}
                </div>
              </div>
            </div>

            {/* Center Loading Indicator */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <div className="relative w-48 h-48 mb-6">
                <div className="absolute inset-0 border-t-2 border-r-2 border-cyan-500 rounded-full animate-spin [animation-duration:2s]" />
                <div className="absolute inset-2 border-b-2 border-l-2 border-emerald-500 rounded-full animate-spin [animation-duration:3s] mix-blend-screen" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="text-cyan-400 font-mono text-xl tracking-widest animate-pulse font-light">3D TWIN</div>
                </div>
              </div>
              <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: '100%' }} 
                  transition={{ duration: 1.8, ease: "easeInOut" }}
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 to-emerald-400 shadow-[0_0_15px_#22d3ee]"
                />
              </div>
              <p className="mt-4 text-cyan-400/80 font-mono text-xs tracking-[0.3em] uppercase animate-pulse">数字孪生双引擎架构渲染中...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
