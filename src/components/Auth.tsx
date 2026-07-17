import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Lock, 
  Shield,
  ArrowRight,
  Loader2,
  Sparkles, 
  Eye, 
  EyeOff, 
  Activity,
  Map as MapIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SaasApiError, saasClient } from '../services/saasClient';
import type { SaasSession } from '../types/saas';
import { useTranslation } from 'react-i18next';
import loginHero from '../assets/brand/login-hero.jpg';
import loginBanner from '../assets/brand/login-banner.jpg';
import appIcon from '../assets/brand/app-icon-512.png';

interface AuthProps {
  onLogin: (session: SaasSession, mode?: 'data' | '3d') => void;
}

const ParticleLayer1 = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {Array.from({ length: 30 }).map((_, i) => (
      <div 
        key={i}
        className="absolute rounded-full bg-emerald-700/20 blur-sm"
        style={{
          width: `${Math.random() * 40 + 10}px`,
          height: `${Math.random() * 40 + 10}px`,
          left: `${Math.random() * 100}%`,
          bottom: `-100px`,
          animation: `authFloatUp ${Math.random() * 15 + 10}s linear infinite`,
          animationDelay: `${Math.random() * 10}s`
        }}
      />
    ))}
  </div>
);

const ParticleLayer2 = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {Array.from({ length: 40 }).map((_, i) => (
      <div 
        key={i}
        className="absolute rounded-full bg-yellow-400/40 blur-[1px]"
        style={{
          width: `${Math.random() * 4 + 2}px`,
          height: `${Math.random() * 4 + 2}px`,
          left: `${Math.random() * 100}%`,
          bottom: `-20px`,
          animation: `authFloatUp ${Math.random() * 10 + 5}s ease-in infinite`,
          animationDelay: `${Math.random() * 5}s`
        }}
      />
    ))}
  </div>
);

const ParticleLayer3 = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 flex justify-around items-end px-10">
    {Array.from({ length: 25 }).map((_, i) => (
      <div 
        key={i}
        className="bg-gradient-to-t from-emerald-600/40 to-emerald-400/10 rounded-t-full origin-bottom"
        style={{
          width: `${Math.random() * 3 + 1}px`,
          height: `${Math.random() * 150 + 50}px`,
          animation: `authSway ${Math.random() * 4 + 3}s ease-in-out infinite alternate`,
          animationDelay: `${Math.random() * 2}s`
        }}
      />
    ))}
  </div>
);

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [entryMode, setEntryMode] = useState<'data' | '3d'>('3d');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let strength = 0;
    if (pass.length >= 12) strength += 20;
    if (/[a-z]/.test(pass)) strength += 20;
    if (/[A-Z]/.test(pass)) strength += 20;
    if (/[0-9]/.test(pass)) strength += 20;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 20;
    return strength;
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!username || !password) {
        setError(t('auth.errorEmpty'));
        setIsLoading(false);
        return;
      }
      if (!isLogin && getPasswordStrength(password) < 100) {
        setError('密码至少 12 位，并须包含小写字母、大写字母、数字和符号。');
        return;
      }
      const session = isLogin
        ? await saasClient.login({ username, password })
        : await saasClient.register({ username, password });
      onLogin(session, entryMode);
    } catch (err) {
      setError(err instanceof SaasApiError ? `${err.message}（${err.code}）` : err instanceof Error ? err.message : t('auth.errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminPrefill = () => {
    setUsername('admin');
    setPassword('');
    setIsLogin(true);
    setError('请输入部署时配置的管理员密码。');
  };

  const titleChars = ["农", "芯", "智", "境"];

  return (
    <div className="min-h-screen w-full relative flex overflow-hidden bg-[#020617] font-sans selection:bg-emerald-500/30">
      <style>{`
        @keyframes authFloatUp {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-120vh) rotate(360deg); opacity: 0; }
        }
        @keyframes authSway {
          0% { transform: rotate(-8deg); }
          100% { transform: rotate(8deg); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(200%); opacity: 0; }
        }
        @keyframes authShimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .shimmer-text {
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: authShimmer 1.5s linear 1.5s 1 forwards;
          background-image: linear-gradient(
            90deg,
            #ffffff 0%,
            #ffffff 45%,
            rgba(16, 185, 129, 1) 50%,
            #ffffff 55%,
            #ffffff 100%
          );
        }
      `}</style>
      
      {/* 1. LEFT BANNERS FOR LARGE SCREENS - GORGEOUS SPLIT SCREEN IMAGE & CAPACITY SHOWCASE */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col justify-between p-16 overflow-hidden border-r border-white/5 bg-[#01040a] z-10 select-none">
        {/* Background Image with warm, high-contrast digital agriculture twilight lighting */}
        <div className="absolute inset-0 z-0">
          <img
            src={loginHero}
            alt="智慧农田数字孪生鸟瞰"
            className="absolute inset-0 w-full h-full object-cover opacity-80 scale-105 transition-all duration-[20s] ease-out hover:scale-110"
          />
          {/* Cinematic gradients to fade into dark and infuse a verdant emerald glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#020617]/65 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.22),transparent_60%)]" />
        </div>

        {/* Top Header inside Left Panel */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden ring-1 ring-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
            <img src={appIcon} alt="农芯智境" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg font-black tracking-widest text-white uppercase">农芯智境</span>
        </div>

        {/* Center content with beautiful quote, features list and stats badges */}
        <div className="relative z-10 my-auto max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[10px] uppercase font-bold tracking-widest text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              农业无人园区数字化控制终端 v1.0.4
            </div>
            
            <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight">
              智慧农艺，<br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent">用数据预见长势</span>
            </h2>

            <p className="text-slate-400 text-sm leading-relaxed max-w-md">
              农芯智境搭载高分辨率 3D 农田数字孪生地图、物联网立体高维传感、阿里云百炼病害视觉诊断，为现代无人农业提供秒级研判保障，助您精算每一方水肥。
            </p>

            {/* Quick feature grid */}
            <div className="grid grid-cols-2 gap-4 pt-4">
              {[
                { label: '3D 遥感双生', desc: '全天情境漫游监控' },
                { label: 'AI 百炼诊断', desc: '毫秒响应病害防治' },
                { label: '微候感知流', desc: '物联环境温湿测算' },
                { label: '溯源安全码', desc: '区块链全程信誉上链' }
              ].map((badge, idx) => (
                <div key={idx} className="bg-white/5 border border-white/5 p-4 rounded-2xl hover:bg-white/10 hover:border-emerald-500/20 transition-all duration-300 group/badge">
                  <div className="text-xs font-black text-emerald-400 mb-0.5 group-hover/badge:text-emerald-300 transition-colors">{badge.label}</div>
                  <div className="text-[10px] text-slate-500 font-bold">{badge.desc}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer info inside Left Panel */}
        <div className="relative z-10 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
          POWERED BY ALIBABA BAILIAN & ZHIPU AI
        </div>
      </div>

      {/* 2. RIGHT LOGIN SCREEN WITH BEAUTIFUL AMBIENT BACKGROUND ON ALL SCREEN SIZES */}
      <div className="w-full lg:w-1/2 xl:w-[45%] relative flex flex-col justify-center items-center p-6 sm:p-12 z-10 bg-[#020617] h-full min-h-screen">
        {/* Underlay Image: Show beautiful field backdrop behind the card with a clean dark vignette and blur */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={loginHero}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-25 md:opacity-30 scale-110 transition-all duration-1000 blur-[3px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/75 to-[#020617]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,#020617_90%)]" />
        </div>

        {/* Cinematic particle layers and grid background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {/* Subtle animated grid overlay */}
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] mix-blend-screen" />
          
          {/* Neon orbs */}
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-950/30 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-teal-950/20 rounded-full blur-[120px]" />

          <ParticleLayer1 />
          <ParticleLayer2 />
          <ParticleLayer3 />
        </div>

        <div className="relative z-10 w-full max-w-[420px] mx-auto flex flex-col items-center">
          
          {/* Brand header for login form */}
          <div className="flex flex-col items-center justify-center mb-8 w-full relative z-10">
            <motion.div
              initial={{ y: -40, opacity: 0, filter: "blur(10px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 20 }}
              className="lg:hidden w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-4 relative"
            >
              <img src={appIcon} alt="农芯智境" className="w-full h-full object-cover" />
            </motion.div>
            
            <h1 className="text-4xl sm:text-5xl font-black tracking-widest flex items-center justify-center gap-1 w-full text-center drop-shadow-2xl">
              {titleChars.map((char, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, y: 20, filter: "blur(15px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.5 + index * 0.08, duration: 0.4, ease: "easeOut" }}
                  className={index === 0 ? "shimmer-text font-black text-transparent" : "text-white font-black"} 
                >
                  {char}
                </motion.span>
              ))}
            </h1>
            <motion.div
              initial={{ opacity: 0, letterSpacing: "2px" }}
              animate={{ opacity: 0.8, letterSpacing: "6px" }}
              transition={{ delay: 0.9, duration: 0.6 }}
              className="text-[9px] font-mono text-emerald-400 font-bold uppercase mt-3 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)] text-center pl-[6px]"
            >
              Smart Agri Control Room
            </motion.div>
          </div>

          {/* Glassmorphism Login Card wrapper */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full relative group"
          >
            {/* Ambient gradient glow ring breathing behind the glass card */}
            <div className="absolute -inset-[1px] rounded-[33px] bg-gradient-to-br from-emerald-500/40 via-teal-400/10 to-cyan-500/30 opacity-50 blur-md group-hover:opacity-80 transition-opacity duration-700 pointer-events-none" />

            {/* Holographic scanner laser */}
            <div className="absolute inset-0 overflow-hidden rounded-[32px] pointer-events-none z-20">
              <div 
                className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-30 shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                style={{ animation: 'scanline 6s linear infinite' }} 
              />
            </div>

            {/* Main glass box body */}
            <div className="w-full bg-[#050e09]/75 backdrop-blur-[24px] saturate-[180%] border border-white/5 dark:border-emerald-500/20 rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] p-8 sm:p-9 relative overflow-hidden transition-all duration-500 hover:border-emerald-500/30">
              
              {/* Highlight spots inside form */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-[40px] opacity-40 rounded-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-teal-500/10 blur-[40px] opacity-30 rounded-full pointer-events-none" />

              {/* Rounded High-Tech Agriculture Banner Image */}
              <div className="relative w-full h-32 rounded-2xl overflow-hidden mb-6 border border-emerald-500/20 group/banner shadow-[0_0_20px_rgba(16,185,129,0.1)] transition-all duration-300 hover:border-emerald-500/40">
                <img
                  src={loginBanner}
                  alt="作物长势孪生监测"
                  className="w-full h-full object-cover opacity-90 group-hover/banner:scale-110 transition-all duration-1000 brightness-[0.95] saturate-[120%]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050e09] via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 border border-emerald-500/30 px-2.5 py-1 rounded-full backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest pl-0.5">DRONE MONITOR // FEED SUCCESSFUL</span>
                </div>
              </div>

              {/* Module Selector */}
              <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                <button
                  type="button"
                  onClick={() => setEntryMode('data')}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 gap-2 relative overflow-hidden group/mode",
                    entryMode === 'data' 
                      ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                      : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300", entryMode === 'data' ? "bg-emerald-500/20 text-emerald-400" : "bg-black/40 text-slate-400 group-hover/mode:text-slate-300")}>
                    <Activity size={20} />
                  </div>
                  <div className="text-center">
                    <div className={cn("text-xs font-black tracking-widest mb-0.5 transition-colors", entryMode === 'data' ? "text-emerald-400" : "text-slate-400")}>数据控制台</div>
                    <div className="text-[9px] text-slate-500 font-bold">图表与报表概览</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('3d')}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 gap-2 relative overflow-hidden group/mode",
                    entryMode === '3d' 
                      ? "bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]" 
                      : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300", entryMode === '3d' ? "bg-cyan-500/20 text-cyan-400" : "bg-black/40 text-slate-400 group-hover/mode:text-slate-300")}>
                    <MapIcon size={20} />
                  </div>
                  <div className="text-center">
                    <div className={cn("text-xs font-black tracking-widest mb-0.5 transition-colors", entryMode === '3d' ? "text-cyan-400" : "text-slate-400")}>3D孪生视图</div>
                    <div className="text-[9px] text-slate-500 font-bold">沉浸式农场巡检</div>
                  </div>
                </button>
              </div>

              {/* Login/Register Toggle Panel */}
              <div className="flex bg-black/35 p-1 rounded-2xl mb-7 relative border border-white/[0.04] shadow-inner z-10 font-bold">
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute inset-y-1 rounded-xl bg-white/5 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                  style={{ 
                    width: 'calc(50% - 4px)',
                    left: isLogin ? '4px' : 'calc(50%)'
                  }}
                  transition={{ type: "spring", bounce: 0.12, duration: 0.45 }}
                >
                  <div className="absolute bottom-0 inset-x-4 h-[1.5px] bg-emerald-400 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                </motion.div>
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setError(''); }}
                  className={cn(
                    "flex-1 py-2.5 text-[11px] uppercase tracking-widest rounded-xl transition-all duration-300 relative z-10 select-none font-black",
                    isLogin ? "text-white" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {t('auth.loginTab')}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setError(''); }}
                  className={cn(
                    "flex-1 py-2.5 text-[11px] uppercase tracking-widest rounded-xl transition-all duration-300 relative z-10 select-none font-black",
                    !isLogin ? "text-white" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {t('auth.registerTab')}
                </button>
              </div>

              {/* Login core form */}
              <AnimatePresence mode="wait">
                <motion.form 
                  key={isLogin ? 'login' : 'register'}
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleSubmit}
                  className="space-y-4 relative z-10"
                >
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-950/50 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs font-bold backdrop-blur-md"
                    >
                      <Shield size={14} className="shrink-0" />
                      {error}
                    </motion.div>
                  )}

                  {/* Username Field */}
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-20">
                      <User size={16} className="text-slate-500 group-focus-within/input:text-emerald-400 transition-colors duration-300" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-[#020503]/50 border border-white/5 rounded-2xl py-3.5 pl-11 pr-4 text-white text-sm font-semibold focus:outline-none focus:border-emerald-500/40 focus:bg-[#020503]/85 transition-all duration-300 placeholder:text-transparent peer shadow-[inset_0_2px_10px_rgba(0,0,0,0.4)]"
                      placeholder="用户名"
                    />
                    <label className="absolute left-10 top-3.5 text-slate-500 font-semibold text-xs pointer-events-none transition-all duration-300 peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-[9px] peer-focus:text-emerald-400 peer-focus:bg-[#061810] peer-focus:px-2 peer-focus:rounded peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-[9px] peer-[:not(:placeholder-shown)]:text-emerald-400 peer-[:not(:placeholder-shown)]:bg-[#061810] peer-[:not(:placeholder-shown)]:px-2 peer-[:not(:placeholder-shown)]:rounded z-30">
                      {t('auth.usernameLabel')}
                    </label>
                  </div>

                  {/* Password Field */}
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-20">
                      <Lock size={16} className="text-slate-500 group-focus-within/input:text-emerald-400 transition-colors duration-300" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#020503]/50 border border-white/5 rounded-2xl py-3.5 pl-11 pr-11 text-white text-sm font-semibold focus:outline-none focus:border-emerald-500/40 focus:bg-[#020503]/85 transition-all duration-300 placeholder:text-transparent peer shadow-[inset_0_2px_10px_rgba(0,0,0,0.4)]"
                      placeholder="password"
                    />
                    <label className="absolute left-10 top-3.5 text-slate-500 font-semibold text-xs pointer-events-none transition-all duration-300 peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-[9px] peer-focus:text-emerald-400 peer-focus:bg-[#061810] peer-focus:px-2 peer-focus:rounded peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-[9px] peer-[:not(:placeholder-shown)]:text-emerald-400 peer-[:not(:placeholder-shown)]:bg-[#061810] peer-[:not(:placeholder-shown)]:px-2 peer-[:not(:placeholder-shown)]:rounded z-30">
                      {t('auth.passwordLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-emerald-400 transition-colors z-20 duration-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    
                    {/* Password Level Bar */}
                    {!isLogin && password && (
                      <div className="absolute -bottom-3 left-1 right-1 flex gap-1 h-0.5">
                        {[20, 40, 60, 80, 100].map((level) => (
                          <div 
                            key={level} 
                            className={cn(
                              "flex-1 rounded-full transition-colors duration-500",
                              passwordStrength >= level 
                                ? (passwordStrength <= 25 ? "bg-red-500" : passwordStrength <= 50 ? "bg-orange-500" : passwordStrength <= 75 ? "bg-yellow-500" : "bg-emerald-500")
                                : "bg-white/10"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {!isLogin && <p className="px-1 text-[10px] leading-relaxed text-slate-400">密码要求：至少 12 位，包含小写字母、大写字母、数字和符号。</p>}

                  {/* Action Button */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full relative group/btn overflow-hidden rounded-2xl bg-emerald-500 border border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:shadow-[0_0_25px_rgba(16,185,129,0.45)] hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-400 to-emerald-600 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
                      
                      {/* Laser shine animation */}
                      <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                        <div className="w-[150%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-[authShimmer_1.5s_infinite] skew-x-12" />
                      </div>

                      <div className="relative py-3.5 flex items-center justify-center gap-1.5 text-[#010905] font-black uppercase tracking-widest text-xs">
                        {isLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>{t('auth.verifying')}</span>
                          </>
                        ) : (
                          <>
                            <span>{isLogin ? t('auth.loginBtn') : t('auth.registerBtn')}</span>
                            <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform duration-300" />
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </motion.form>
              </AnimatePresence>
              
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="mt-6 w-full max-w-[420px]"
          >
            <button
              onClick={handleAdminPrefill}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/30 text-slate-400 hover:text-emerald-400 font-bold text-xs tracking-widest transition-all duration-300 group"
            >
              <Sparkles size={14} className="group-hover:text-amber-400 transition-colors" />
              填入管理员账号（密码由部署方提供）
            </button>
          </motion.div>

          {/* Bottom Footer Info */}
          <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: 1.3 }}
             className="mt-8 text-center text-slate-500 font-bold text-[10px] flex flex-row items-center gap-3 justify-center tracking-wider select-none uppercase"
          >
             <span>© 2026 {t('app.brand')}</span>
             <span className="w-1 h-1 rounded-full bg-slate-800" />
             <span>{t('auth.footer')}</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}; 

export default Auth;
