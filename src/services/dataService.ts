/**
 * @file DataService.ts
 * @description 农芯智境平台数据适配层。
 * 增加了共享状态管理，支持农田管理与监测模块的联动。
 */

// 获取 API 基础路径
const getApiBaseUrl = () => {
  // 在所有环境（云端开发、云端生产、PC桌面端）中，前端和后端都在同一个 host 下运行。
  // PC 桌面端通过 http://localhost:port 加载，云端通过域名加载。
  // 因此直接使用相对路径即可，浏览器会自动拼接正确的 host 和 port。
  return ''; 
};

export const API_BASE_URL = getApiBaseUrl();

// 商业模式静态目录（离线/降级时的回退数据源，单一数据源见 data/pricing.ts）
import { saasClient } from './saasClient';

// 演示模式开关，从 localStorage 读取
export const isDemoMode = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('nxzj_demo_mode') === 'true';
  }
  return false;
};

export const setDemoMode = (enabled: boolean) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('nxzj_demo_mode', enabled ? 'true' : 'false');
  }
};

// 演示模式自愈：当前处于演示模式时，节流探测服务端是否已恢复，
// 一旦探测成功则自动退出演示模式，避免因一次短暂掉线而永久离线。
let lastHealthProbe = 0;
const tryRecoverFromDemoMode = async (force = false): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  const now = Date.now();
  if (!force && now - lastHealthProbe < 4000) return false; // 节流，最多 4s 探测一次
  lastHealthProbe = now;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(t);
    if (resp.ok) {
      setDemoMode(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('demo-mode-recovered'));
      }
      console.info('[DataService] 已检测到服务端恢复，自动退出离线演示模式。');
      return true;
    }
  } catch (e) {
    // 仍不可达，保持演示模式
  }
  return false;
};

// 应用启动时调用：若当前被锁定在演示模式，立即（强制）探测一次服务端，恢复则退出演示模式。
export const ensureOnlineOnStartup = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (!isDemoMode()) return true; // 本来就在线
  return await tryRecoverFromDemoMode(true);
};

// 用户自定义 API Key 管理
export const getUserApiKeys = () => {
  if (typeof window !== 'undefined') {
    return {
      qwenKey: localStorage.getItem('nxzj_ai_qwen_key') || '',
      zhipuKey: localStorage.getItem('nxzj_ai_zhipu_key') || ''
    };
  }
  return { qwenKey: '', zhipuKey: '' };
};

export const getPublicAIUsage = () => {
  if (typeof window !== 'undefined') {
    return parseInt(localStorage.getItem('nxzj_public_ai_usage') || '0');
  }
  return 0;
};

export const incrementPublicAIUsage = () => {
  if (typeof window !== 'undefined') {
    const count = getPublicAIUsage();
    localStorage.setItem('nxzj_public_ai_usage', (count + 1).toString());
  }
};

export const getCurrentUsername = () => {
  return saasClient.currentSession()?.user.username ?? null;
};

export const setUserApiKeys = (qwenKey: string, zhipuKey: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('nxzj_ai_qwen_key', qwenKey);
    localStorage.setItem('nxzj_ai_zhipu_key', zhipuKey);
  }
};

// --- Advanced Client Fault-Tolerance Engine (Section 3.9) ---

// 1. 并发限制：最多 4 个并行网络请求
let activeRequestsCount = 0;
const requestQueue: (() => void)[] = [];

const acquireConcurrencySlot = (): Promise<void> => {
  if (activeRequestsCount < 4) {
    activeRequestsCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    requestQueue.push(resolve);
  });
};

const releaseConcurrencySlot = () => {
  activeRequestsCount--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift()!;
    activeRequestsCount++;
    next();
  }
};

// 2. 离线队列：断网写操作自动排队，有网自动重放
let offlineQueue: { url: string; options: any; timestamp: number }[] = [];

if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('nxzj_offline_queue');
    if (saved) offlineQueue = JSON.parse(saved);
  } catch (e) {}
}

const saveOfflineQueue = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('nxzj_offline_queue', JSON.stringify(offlineQueue));
  }
};

export const enqueueOfflineAction = (url: string, options: RequestInit) => {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    console.log(`[Offline Queue] 处于断网状态。已将写操作入队备份: ${url}`);
    offlineQueue.push({
      url,
      options: {
        method: options.method,
        headers: options.headers ? Object.fromEntries((new Headers(options.headers) as any).entries()) : undefined,
        body: options.body
      },
      timestamp: Date.now()
    });
    saveOfflineQueue();
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-action-queued', { detail: { url } }));
    }
  }
};

// 重放离线操作
export const replayOfflineActions = async () => {
  if (offlineQueue.length === 0) return;
  console.log(`[Offline Queue] 感知到网络恢复，正在重放 ${offlineQueue.length} 个写指令...`);
  
  const queueToProcess = [...offlineQueue];
  offlineQueue = [];
  saveOfflineQueue();
  
  for (const action of queueToProcess) {
    try {
      console.log(`[Offline Queue] 正在恢复执行: ${action.url}...`);
      await apiFetch(action.url, action.options);
      console.log(`[Offline Queue] 执行恢复成功: ${action.url}`);
    } catch (err) {
      console.error(`[Offline Queue] 执行恢复失败: ${action.url}:`, err);
    }
  }
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-actions-replayed'));
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    replayOfflineActions();
  });
}

// 封装 fetch，自动添加 API_BASE_URL 并添加超高可靠性防御 (10s/45s超时、指数退避重试、慢网告警、自动切演示模式)
const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  if (isDemoMode()) {
    // 尝试自愈：服务端若已恢复则自动退出演示模式并继续真实请求
    const recovered = await tryRecoverFromDemoMode();
    if (!recovered) {
      throw new Error('Demo mode is enabled, skipping network request');
    }
  }

  // 检测断网，直接进离线写队列
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueueOfflineAction(url, options);
    throw new Error('当前处于离线状态。已成功安排写入操作入队，待网络重连后自动重放。');
  }

  await acquireConcurrencySlot();

  // AI 请求 45s, 普通请求 10s
  const isAiRequest = url.includes('/ai/') || (options.body && String(options.body).includes('zhipuKey'));
  const timeoutLimit = isAiRequest ? 45000 : 10000;

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutLimit);

    // 慢网提示：5 秒无响应发事件
    const slowWarningTimeoutId = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('network-slow-warning', { detail: { url } }));
      }
    }, 5000);

    try {
      const response = await saasClient.fetchWithSession(fullUrl, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      clearTimeout(slowWarningTimeoutId);

      const contentType = response.headers.get('content-type');
      if (response.status === 429) {
        const rateLimitError = new Error(`Rate limit exceeded (429)`);
        (rateLimitError as any).status = 429;
        throw rateLimitError;
      }

      if (contentType && contentType.includes('text/html') && !url.includes('.html')) {
        if (response.status >= 400) {
          const err = new Error(`服务器或者网关返回了错误状态 (状态码: ${response.status})。`);
          (err as any).status = response.status;
          throw err;
        }
        const text = await response.text();
        console.warn(`[apiFetch] Expected JSON, got HTML for ${url}. Content snippet: ${text.substring(0, 100)}`);
        const err = new Error(`服务器配置响应类型不匹配 (状态码: ${response.status})。`);
        (err as any).status = response.status;
        throw err;
      }

      releaseConcurrencySlot();
      return response;

    } catch (error: any) {
      clearTimeout(timeoutId);
      clearTimeout(slowWarningTimeoutId);

      attempt++;

      const isUnreachable = error.message?.includes('Failed to fetch') || error.name === 'TypeError' || error.message?.includes('NetworkError');
      
      // 演示模式：服务器不可达自动切本地 Mock
      if (isUnreachable && attempt >= maxAttempts) {
        console.warn('[DataService] 服务器不可达。系统已经为您自动切换至【本地离线演示模式】！');
        setDemoMode(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('demo-mode-activated', { detail: { reason: 'server-unreachable' } }));
        }
      }

      if (attempt < maxAttempts && (error.name === 'AbortError' || isUnreachable)) {
        // 指数退避：2^n * 200ms 重试
        const backoffDelay = Math.pow(2, attempt - 1) * 200;
        console.warn(`[Network Retry] 访问请求失败。将在 ${backoffDelay}ms 后重试（${attempt}/${maxAttempts}）：${url}`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }

      releaseConcurrencySlot();
      
      if (error.name === 'AbortError') {
        throw new Error('服务器响应超时，请确认您的网络已就绪。');
      }
      throw error;
    }
  }

  releaseConcurrencySlot();
  throw new Error('网络连接重试失败，已最大化限制网络开销。');
};

export interface Plot {
  id: string;
  name: string;
  area: number;
  crop: string;
  growthStage?: string;
  plantingDate?: string;
  expectedHarvestDate?: string;
  nextTillageDate?: string;
  hardwareState?: any;
  sensorData?: any;
  lastFertilized?: string;
  isSimulated?: boolean;
}

export interface RealtimeData {
  temperature: number;
  humidity: number;
  light: number;
  soilTemp: number;
  soilMoisture: number;
  pH: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
}

export interface Threshold {
  min: number;
  max: number;
}

export interface Thresholds {
  [key: string]: Threshold;
}

export interface HistoryItem extends RealtimeData {
  time: string;
}

export interface AICropAnalysis {
  recommendedCrop: string;
  suitability: number;
  expectedProfit: number;
  reason: string;
  fertilizationAdvice?: {
    amount: string;
    timing: string;
    description: string;
  };
  roiAnalysis?: {
    growthCycle: string;
    marketRisk: string;
    waterUsage: string;
    costEstimate: string;
    details: string;
    suggestedArea?: number;
    suggestedSeedCost?: number;
    suggestedFertCost?: number;
    suggestedLaborCost?: number;
    suggestedPrice?: number;
    suggestedYield?: number;
    regionalAdvantage?: string;
    aiAdvice?: string;
  };
  alternatives: {
    crop: string;
    expectedProfit: number;
    suitability: number;
    growthCycle?: string;
    riskLevel?: string;
  }[];
}

// 模拟全局状态，用于模块间联动
let globalRealtimeData: RealtimeData = {
  temperature: 36.5, // High (threshold max: 35)
  humidity: 35,      // Low (threshold min: 40)
  light: 3200,
  soilTemp: 22.1,
  soilMoisture: 45,
  pH: 6.8,
  nitrogen: 45,      // Low (threshold min: 50)
  phosphorus: 25,
  potassium: 200
};

// 监听回调列表
const listeners: (() => void)[] = [];

const DataService = {
  isDemoMode,
  setDemoMode,
  ensureOnlineOnStartup,
  /**
   * 注册数据变化监听器
   */
  subscribe: (callback: () => void) => {
    listeners.push(callback);
    return () => {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  },

  /**
   * 通知所有监听器数据已更新
   */
  notify: () => {
    listeners.forEach(cb => cb());
  },

  /**
   * 更新用户头像
   */
  uploadAvatar: async (file: File, username?: string): Promise<string> => {
    void file; void username;
    throw new Error('该功能尚未接入安全账户服务');
  },

  /**
   * 获取系统运行日志
   */
  getSystemLogs: async (): Promise<any[]> => {
    try {
      const response = await apiFetch('/api/system/logs');
      if (!response.ok) throw new Error('Network response was not ok');
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      return await response.json();
    } catch (error) {
      console.warn('Using fallback system logs due to fetch error');
      return [
        { id: 'log_1', status: 'success', type: 'hardware', message: '1号地块灌溉阀门已自动开启，预计灌溉30分钟', time: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
        { id: 'log_2', status: 'warning', type: 'ai', message: 'AI诊断模型检测到2号地块存在轻微叶斑病风险', time: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
        { id: 'log_3', status: 'info', type: 'news', message: '已同步最新农业政策资讯 3 条', time: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
        { id: 'log_4', status: 'danger', type: 'hardware', message: '3号大棚温湿度传感器连接异常，请检查网络', time: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
        { id: 'log_5', status: 'success', type: 'system', message: '系统数据备份完成', time: new Date(Date.now() - 1000 * 60 * 240).toISOString() }
      ];
    }
  },

  /**
   * 获取所有地块列表
   */
  getPlots: async (username?: string): Promise<any[]> => {
    try {
      const url = username ? `/api/plots?username=${username}` : '/api/plots';
      const response = await apiFetch(url);
      if (!response.ok) throw new Error('获取地块失败');
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      return await response.json();
    } catch (error) {
      console.warn('Using fallback plots data due to fetch error');
      return [
        { id: 'plot_001', name: '地块 #1 - 核心区', area: 240, crop: '冬小麦' },
        { id: 'plot_002', name: '地块 #2 - 实验区', area: 120, crop: '玉米' },
      ];
    }
  },

  /**
   * 获取地块的三维地形高程数据 (Perlin Noise / Heightmap)
   */
  getElevationData: async (plotId: string): Promise<number[][]> => {
    try {
      const response = await apiFetch(`/api/plots/${plotId}/elevation`);
      if (!response.ok) throw new Error('Failed to fetch elevation data');
      return await response.json();
    } catch (error) {
      console.warn('Using fallback elevation data due to fetch error');
      // Generate deterministic fallback perlin-like noise for the terrain based on plotId
      const seed = plotId === 'plot_001' ? 1 : 2;
      const size = 32; // 32x32 resolution for terrain mesh
      const data: number[][] = [];
      for (let i = 0; i < size; i++) {
        const row: number[] = [];
        for (let j = 0; j < size; j++) {
          // Simple pseudo-random wave combination to mimic terrain
          const x = (i / size) * Math.PI * 4;
          const y = (j / size) * Math.PI * 4;
          let elevation = Math.sin(x + seed) * Math.cos(y + seed) * 0.15;
          elevation += Math.sin(x * 2.5) * Math.cos(y * 1.5) * 0.1;
          elevation += Math.sin(x * 0.5) * Math.cos(y * 0.8) * 0.15;
          // Flatten edges slightly to blend with surrounding plot borders
          const edgeDist = Math.max(Math.abs(i - size/2), Math.abs(j - size/2)) / (size/2);
          const edgeBlend = Math.max(0, 1.0 - Math.pow(edgeDist, 4));
          row.push(elevation * edgeBlend);
        }
        data.push(row);
      }
      return data;
    }
  },

  /**
   * 获取控制台日志
   */
  getDashboardLogs: (): string[] => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('nxzj_dashboard_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      "[07:00:12] [SATELLITE_PASS] Sentinel-2B 脉冲感知载荷通过园区上空，光谱校准良好。",
      "[07:05:43] [IOT_GATEWAY] 128 个无线微气相传感节点电量正常，均处于14ms边缘同步态。",
      "[07:15:30] [ALGORITHM_ENGINE] A-1区地块水分指数评估通过。光合作用能量转换率 88%"
    ];
  },

  /**
   * 添加控制台日志
   */
  addDashboardLog: (log: string): string[] => {
    if (typeof window === 'undefined') return [];
    const currentLogs = DataService.getDashboardLogs();
    const formattedLog = `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${log}`;
    const updated = [formattedLog, ...currentLogs].slice(0, 100); // keep last 100
    localStorage.setItem('nxzj_dashboard_logs', JSON.stringify(updated));
    setTimeout(() => {
      DataService.notify();
    }, 10);
    return updated;
  },

  /**
   * 获取多主体协作工单
   */
  getWorkOrders: (): any[] => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('nxzj_work_orders');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    const defaultOrders = [
      { id: 1, title: '全地块灌溉阀门巡检', assignee: '张建国 (社员)', time: '今日 14:00 前', progress: 75, status: '进行中' },
      { id: 2, title: '2号地块水阀传感器校准', assignee: '李技师', time: '逾期 2小时', progress: 0, status: '已延误' },
      { id: 3, title: '大棚病害自动排查与打药', assignee: '无人机自动化编队', time: '明日 06:00', progress: 0, status: '待执行' }
    ];
    localStorage.setItem('nxzj_work_orders', JSON.stringify(defaultOrders));
    return defaultOrders;
  },

  /**
   * 派发新工单
   */
  addWorkOrder: (order: { title: string, assignee: string, time: string, status: string, progress: number }): any[] => {
    if (typeof window === 'undefined') return [];
    const currentList = DataService.getWorkOrders();
    const newOrder = { id: Date.now(), ...order };
    const updated = [newOrder, ...currentList];
    localStorage.setItem('nxzj_work_orders', JSON.stringify(updated));
    // Let listeners know we've updated data (sync across components)
    setTimeout(() => {
      DataService.notify();
    }, 10);
    return updated;
  },

  /**
   * 更新工作工单
   */
  updateWorkOrderStatus: (id: number, status: string, progress: number): any[] => {
    if (typeof window === 'undefined') return [];
    const currentList = DataService.getWorkOrders();
    const updated = currentList.map(o => o.id === id ? { ...o, status, progress } : o);
    localStorage.setItem('nxzj_work_orders', JSON.stringify(updated));
    setTimeout(() => {
      DataService.notify();
    }, 10);
    return updated;
  },

  /**
   * 添加新地块
   */
  addPlot: async (plot: { name: string; area: number; crop: string; nextTillageDate?: string; plantingDate?: string; expectedHarvestDate?: string }, username?: string): Promise<any> => {
    try {
      const response = await apiFetch('/api/plots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plot, username })
      });
      if (!response.ok) throw new Error('添加地块失败');
      return await response.json();
    } catch (error) {
      console.error(error);
      return { id: `plot_${Date.now()}`, ...plot };
    }
  },

  /**
   * 连接地块设备（传感器、硬件）
   */
  connectPlotDevices: async (plotId: string, devices: string[]): Promise<any> => {
    try {
      const response = await apiFetch(`/api/plots/${plotId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices })
      });
      if (!response.ok) throw new Error('连接设备失败');
      return await response.json();
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  /**
   * 获取指定地块的实时监测数据
   */
  getRealtimeData: async (plotId: string): Promise<RealtimeData> => {
    if (!plotId) {
      return { ...globalRealtimeData };
    }
    try {
      const response = await apiFetch(`/api/monitoring/realtime?plotId=${plotId}`);
      if (!response.ok) throw new Error('获取实时数据失败');
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      return await response.json();
    } catch (error) {
      console.warn('Using fallback realtime data due to fetch error');
      // Fallback to local mock if server fails, add some variation based on plotId
      const variation = (plotId.charCodeAt(plotId.length - 1) % 5) - 2;
      return { 
        ...globalRealtimeData,
        temperature: Number((globalRealtimeData.temperature + variation * 0.5).toFixed(2)),
        humidity: Number((globalRealtimeData.humidity + variation * 2).toFixed(2)),
        soilMoisture: Number((globalRealtimeData.soilMoisture + variation * 1.5).toFixed(2)),
        light: Number((globalRealtimeData.light + variation * 100).toFixed(2)),
      }; 
    }
  },

  /**
   * 智谱AI分析接口
   */
  analyzeCropSuitability: async (plotId: string, targetCrop?: string): Promise<AICropAnalysis> => {
    const currentData = await DataService.getRealtimeData(plotId);
    try {
      const { zhipuKey } = getUserApiKeys();
      const username = getCurrentUsername();
      const isTurbo = typeof window !== 'undefined' && localStorage.getItem('ai_turbo_mode') === 'true';
      const response = await apiFetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plotId, 
          currentData, 
          targetCrop,
          userZhipuKey: zhipuKey,
          username,
          turbo: isTurbo
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.message || errorData.error || 'AI 分析接口调用失败';
        const err = new Error(msg);
        (err as any).status = response.status;
        (err as any).data = errorData;
        throw err;
      }
      return await response.json();
    } catch (error: any) {
      // Throw all API errors (4xx and 5xx) so the UI can show them.
      // Only use fallback for actual network failures (where status is undefined).
      if (error.status) {
        throw error;
      }
      console.warn('Using fallback AI analysis due to fetch error:', error);
      return {
        recommendedCrop: targetCrop || '冬小麦',
        suitability: 85,
        expectedProfit: 1200,
        reason: '根据当前土壤温湿度和养分数据，该地块非常适合种植该作物。',
        fertilizationAdvice: {
          amount: '复合肥 20kg/亩',
          timing: '建议在未来3天内，结合灌溉进行追肥。',
          description: '当前土壤氮磷钾含量略低于最佳水平，适量补充复合肥有助于作物生长。'
        },
        roiAnalysis: {
          growthCycle: '100-120天',
          marketRisk: '稳健/低风险',
          waterUsage: '中等水量',
          costEstimate: '¥600/亩',
          details: '由于市场需求稳定，且具备政策补贴支持。投资回报周期较短，是理想的换季推荐品种。'
        },
        alternatives: [
          { crop: '玉米', suitability: 75, expectedProfit: 1000, growthCycle: '90-110天', riskLevel: '中等' },
          { crop: '大豆', suitability: 70, expectedProfit: 900, growthCycle: '110-130天', riskLevel: '较低' }
        ]
      };
    }
  },

  /**
   * 自动化施肥控制
   */
  executeFertilization: async (plotId: string) => {
    try {
      const response = await apiFetch('/api/hardware/fertilize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plotId })
      });
      if (!response.ok) throw new Error('施肥失败');
      const result = await response.json();
      DataService.notify();
      return result;
    } catch (error: any) {
      console.error(error);
      return { success: false, message: error.message || "施肥系统连接失败" };
    }
  },

  /**
   * 远程硬件控制
   */
  controlHardware: async (plotId: string, type: 'irrigation' | 'ventilation' | 'heating' | 'lighting' | 'fertilization', action: 'start' | 'stop') => {
    try {
      const response = await apiFetch('/api/hardware/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plotId, type, action })
      });
      if (!response.ok) throw new Error('硬件控制失败');
      const result = await response.json();
      DataService.notify();
      return result;
    } catch (error: any) {
      console.error(error);
      return { success: false, message: error.message || '硬件控制失败' };
    }
  },

  getHardwareParams: async (plotId: string) => {
    const fallback = {
      irrigation: { mode: 'auto', threshold: 45, duration: 15 },
      ventilation: { mode: 'auto', tempThreshold: 28, humidityThreshold: 75 },
      lighting: { mode: 'timer', startTime: '18:00', endTime: '22:00' },
      heating: { mode: 'auto', threshold: 12 }
    };

    try {
      const response = await apiFetch(`/api/hardware/params?plotId=${plotId}`);
      if (!response.ok) {
        if (response.status !== 429) {
          console.warn(`Hardware params API returned status ${response.status}`);
        }
        return fallback;
      }
      return await response.json();
    } catch (error) {
      console.warn('Using fallback hardware params due to fetch error:', error);
      return fallback;
    }
  },

  updateHardwareParams: async (plotId: string, type: string, params: any) => {
    try {
      const response = await apiFetch('/api/hardware/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plotId, type, params })
      });
      if (!response.ok) throw new Error('更新硬件参数失败');
      const result = await response.json();
      DataService.notify();
      return result;
    } catch (error) {
      console.error(error);
      return { success: false };
    }
  },

  /**
   * 获取历史数据用于图表分析
   */
  getHistoricalData: async (plotId: string, timeRange: string, params: string[]): Promise<any[]> => {
    const days = timeRange === '7d' ? 7 : 30;
    const data = [];
    const now = new Date();
    
    // Use plotId to create a simple deterministic variation
    const variation = plotId === 'all' ? 0 : (plotId.charCodeAt(plotId.length - 1) % 5) - 2;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const entry: any = { date: dateStr };
      params.forEach(param => {
        if (param === 'temperature') entry[param] = Number((20 + variation + Math.random() * 10).toFixed(2));
        else if (param === 'humidity') entry[param] = Number((50 + variation * 2 + Math.random() * 30).toFixed(2));
        else if (param === 'light') entry[param] = Number((20000 + variation * 1000 + Math.random() * 30000).toFixed(2));
        else if (param === 'soilTemp') entry[param] = Number((18 + variation + Math.random() * 8).toFixed(2));
        else if (param === 'soilMoisture') entry[param] = Number((30 + variation * 1.5 + Math.random() * 20).toFixed(2));
        else if (param === 'pH') entry[param] = Number((6.0 + variation * 0.1 + Math.random() * 1.5).toFixed(2));
        else if (param === 'nitrogen') entry[param] = Number((40 + variation * 5 + Math.random() * 100).toFixed(2));
        else if (param === 'phosphorus') entry[param] = Number((10 + variation * 2 + Math.random() * 40).toFixed(2));
        else if (param === 'potassium') entry[param] = Number((100 + variation * 10 + Math.random() * 200).toFixed(2));
        else entry[param] = Number((Math.random() * 100).toFixed(2));
      });
      data.push(entry);
    }
    return data;
  },

  /**
   * 获取分页历史记录列表
   */
  getHistoryList: async (plotId: string, page: number = 1, pageSize: number = 5) => {
    const total = 23;
    const list: HistoryItem[] = [];
    const now = new Date();

    for (let i = 0; i < pageSize; i++) {
      const time = new Date(now);
      time.setHours(time.getHours() - (page - 1) * pageSize - i);
      
      // Make some data occasionally out of bounds for demonstration
      const isOutlier = i % 3 === 0;
      
      list.push({
        time: time.toLocaleString(),
        temperature: Number((isOutlier ? 36 + Math.random() * 2 : 24 + Math.random() * 2).toFixed(2)),
        humidity: Number((isOutlier ? 30 + Math.random() * 5 : 60 + Math.random() * 10).toFixed(2)),
        light: Number((3000 + Math.random() * 500).toFixed(2)),
        soilTemp: Number((21 + Math.random() * 2).toFixed(2)),
        soilMoisture: Number((40 + Math.random() * 10).toFixed(2)),
        pH: Number((6.5 + Math.random() * 0.5).toFixed(2)),
        nitrogen: Number((isOutlier ? 40 + Math.random() * 5 : 110 + Math.random() * 20).toFixed(2)),
        phosphorus: Number((20 + Math.random() * 10).toFixed(2)),
        potassium: Number((180 + Math.random() * 40).toFixed(2))
      });
    }

    return { total, list };
  },

  /**
   * 传感器校准
   */
  calibrateSensor: async (plotId: string, sensorKey: string, newValue: number, reason: string) => {
    try {
      const response = await apiFetch('/api/monitoring/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plotId, sensorKey, newValue, reason })
      });
      if (!response.ok) throw new Error('校准失败');
      const result = await response.json();
      DataService.notify();
      return result;
    } catch (error) {
      console.error(error);
      return { success: false, message: '校准请求失败' };
    }
  },

  /**
   * AI 图像识别与诊断 (调用后端多引擎协同接口)
   */
  recognizeImage: async (inputData: string, type: 'pest' | 'disease' | 'species' | 'growth', plotData?: any, username?: string, options?: { isTextOnly?: boolean }) => {
    try {
      const { qwenKey, zhipuKey } = getUserApiKeys();
      
      // If using public keys, increment usage
      if (!qwenKey || !zhipuKey) {
        incrementPublicAIUsage();
      }

      const isTurbo = typeof window !== 'undefined' && localStorage.getItem('ai_turbo_mode') === 'true';
      const response = await apiFetch('/api/ai/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: options?.isTextOnly ? null : inputData, 
          textData: options?.isTextOnly ? inputData : null,
          isTextOnly: options?.isTextOnly,
          type, 
          plotData, 
          username,
          userQwenKey: qwenKey,
          userZhipuKey: zhipuKey,
          turbo: isTurbo
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.message || errorData.error || '识别请求失败';
        const err = new Error(msg);
        (err as any).status = response.status;
        (err as any).data = errorData;
        throw err;
      }
      return await response.json();
    } catch (error: any) {
      // Throw all API errors (4xx and 5xx) so the UI can show them.
      // Only use fallback for actual network failures (where status is undefined).
      if (error.status) {
        throw error;
      }
      
      console.warn('Backend reachability issue, using local failsafe fallback:', error);
      
      // Final fallback to mock data
      return {
        isAgricultureRelated: true,
        type: type === 'pest' ? '叶斑病' : type === 'species' ? '小麦' : '生长良好',
        target: type === 'pest' ? '小麦叶斑病' : type === 'species' ? '冬小麦' : '正常生长',
        confidence: 0.92,
        description: '（环境受限模式）识别结果为静态评估。',
        detailedReport: '由于当前环境网络异常，AI 引擎连接受限。系统已启动离线专家模型进行初步评估。',
        suggestions: ['建议检查网络连接', '确保 API 密钥配置正确', '可尝试重新上传图片'],
        status: type === 'pest' ? 'danger' : 'normal',
        isMock: true
      };
    }
  },

  /**
   * AI 智能助手聊天 (调用后端智谱 AI 接口)
   */
  chat: async (message: string, history: any[]) => {
    try {
      const { zhipuKey } = getUserApiKeys();
      const username = getCurrentUsername();
      const response = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message, 
          history,
          userZhipuKey: zhipuKey,
          username
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.message || errorData.error || '聊天请求失败';
        const err = new Error(msg);
        (err as any).status = response.status;
        (err as any).data = errorData;
        throw err;
      }
      const data = await response.json();
      if (data._optimizationTriggered) {
        return data; // Return full object so UI can check _optimizationTriggered
      }
      return data.text || data.reply || '抱歉，未能获取到有效回复。';
    } catch (error: any) {
      // Throw all API errors (4xx and 5xx) so the UI can show them.
      // Only use fallback for actual network failures (where status is undefined).
      if (error.status) {
        throw error;
      }
      console.warn('Backend reachability issue, falling back to local chat mock:', error);
      
      return '（演示模式）您好！我是农芯智境 AI 助手。当前连接云端大模型出现了间歇性中断，系统无法实时调用最新的智谱 AI 引擎作为知识库参考，此为系统离线反馈的占位文本。请检查您的网络或服务端配置。';
    }
  },

  /**
   * 获取知识库推荐
   */
  getKnowledgeRecommendations: async (category: string, page: number, limit: number = 6, seed?: number, ids?: string) => {
    try {
      let url = `/api/knowledge/recommendations?page=${page}&limit=${limit}${seed !== undefined ? `&seed=${seed}` : ''}${category !== '全部' ? `&category=${encodeURIComponent(category)}` : ''}`;
      if (ids) url += `&ids=${encodeURIComponent(ids)}`;
      const response = await apiFetch(url);
      if (!response.ok) throw new Error('获取推荐失败');
      return await response.json();
    } catch (error) {
      console.error('Knowledge Recommendations error:', error);
      throw error;
    }
  },

  /**
   * 搜索知识库 (AI 增强)
   */
  searchKnowledge: async (query: string) => {
    try {
      const { zhipuKey } = getUserApiKeys();
      const username = getCurrentUsername();
      const response = await apiFetch(`/api/knowledge/search?q=${encodeURIComponent(query)}&userZhipuKey=${encodeURIComponent(zhipuKey)}&username=${encodeURIComponent(username || '')}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || '搜索失败');
      }
      return await response.json();
    } catch (error) {
      console.error('Knowledge Search error:', error);
      throw error;
    }
  },

  /**
   * 获取各指标的预警阈值
   */
  getThresholds: (): Thresholds => {
    return {
      temperature: { min: 15, max: 35 },
      humidity: { min: 40, max: 80 },
      light: { min: 2000, max: 10000 },
      soilTemp: { min: 10, max: 30 },
      soilMoisture: { min: 30, max: 70 },
      pH: { min: 5.5, max: 7.5 },
      nitrogen: { min: 50, max: 200 },
      phosphorus: { min: 10, max: 50 },
      potassium: { min: 80, max: 300 }
    };
  },

  /**
   * 强制同步资讯
   */
  syncNews: async (): Promise<boolean> => {
    try {
      const resp = await apiFetch('/api/news/sync', { method: 'POST' });
      return resp.ok;
    } catch {
      return false;
    }
  },

  /**
   * 获取农业资讯
   */
  getNews: async (source: 'mara' | 'tianxing' | 'gov-service'): Promise<any[]> => {
    try {
      const response = await apiFetch(`/api/news/${source}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      return await response.json();
    } catch (error) {
      console.warn(`Using fallback news for ${source} due to fetch error`);
      return [
        {
          id: 'news_1',
          title: '农业农村部部署推进春季农业生产工作',
          summary: '强调要抓好春季田管和春耕备耕，确保全年粮食和农业生产开好局起好步。',
          source: '农业农村部',
          time: new Date().toISOString().split('T')[0],
          link: '#'
        },
        {
          id: 'news_2',
          title: '2026年中央一号文件发布：全面推进乡村振兴',
          summary: '文件指出，要强化科技和改革双轮驱动，加快建设农业强国。',
          source: '新华社',
          time: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          link: '#'
        },
        {
          id: 'news_3',
          title: '智慧农业新技术在多地推广应用',
          summary: '无人机植保、智能温室等新技术有效提升了农业生产效率。',
          source: '科技日报',
          time: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
          link: '#'
        }
      ];
    }
  },

  /**
   * 获取天气数据
   */
  getWeather: async (lat: number = 36.103, lon: number = 103.718): Promise<any> => {
    try {
      // 默认：兰州市安宁区坐标
      const response = await apiFetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&timezone=Asia%2FShanghai`);
      if (!response.ok) throw new Error('Network response was not ok');
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      return await response.json();
    } catch (error) {
      console.warn('Using fallback weather data due to fetch error');
      // Return mock data fallback
      return {
        current: {
          temperature_2m: 24.5,
          relative_humidity_2m: 60,
          apparent_temperature: 25,
          is_day: 1,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 12,
          wind_direction_10m: 180
        },
        hourly: {
          time: Array.from({length: 24}, (_, i) => new Date(Date.now() + i * 3600000).toISOString()),
          temperature_2m: Array.from({length: 24}, () => 20 + Math.random() * 10),
          precipitation_probability: Array.from({length: 24}, () => Math.floor(Math.random() * 30)),
          weather_code: Array.from({length: 24}, () => 0)
        },
        daily: {
          time: Array.from({length: 7}, (_, i) => new Date(Date.now() + i * 86400000).toISOString()),
          weather_code: [0, 1, 2, 3, 0, 1, 2],
          temperature_2m_max: [28, 27, 26, 25, 29, 30, 28],
          temperature_2m_min: [18, 17, 16, 15, 19, 20, 18],
          sunrise: Array.from({length: 7}, () => "06:00"),
          sunset: Array.from({length: 7}, () => "19:00"),
          uv_index_max: [6, 5, 4, 3, 7, 8, 6],
          precipitation_probability_max: [10, 20, 30, 40, 10, 5, 15]
        }
      };
    }
  },

  /**
   * 用户登录
   */
  login: async (payload: any) => {
    const session = await saasClient.login({ username: payload.username, password: payload.password });
    return { ok: true, data: session };
  },

  /**
   * 用户注册
   */
  register: async (payload: any) => {
    const session = await saasClient.register({ username: payload.username, password: payload.password });
    return { ok: true, data: session };
  },

  /**
   * 提交用户反馈
   */
  submitFeedback: async (feedback: { type: string; description: string; screenshot?: string; contact?: string }) => {
    try {
      const response = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...feedback, timestamp: new Date().toISOString() })
      });
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '反馈提交失败');
      }
      return await response.json();
    } catch (error) {
      console.warn('Simulating feedback submission in demo mode:', error);
      return { success: true, message: '反馈提交成功（演示模式）' };
    }
  },

  /**
   * 获取 AI 识别历史记录
   */
  getRecognitionHistory: async () => {
    try {
      const response = await apiFetch('/api/recognition/history');
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      if (!response.ok) throw new Error('获取识别历史失败');
      return await response.json();
    } catch (error) {
      console.warn('Using mock recognition history due to fetch error or demo mode:', error);
      return [
        {
          id: 'rec_1',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          type: 'pest',
          target: '小麦叶斑病',
          confidence: 0.95,
          description: '在叶片上发现典型的椭圆形褐色病斑，边缘有黄色晕圈。',
          image: 'https://picsum.photos/seed/pest1/400/300',
          plotId: 'plot_sim_1'
        },
        {
          id: 'rec_2',
          timestamp: new Date(Date.now() - 172800000).toISOString(),
          type: 'species',
          target: '冬小麦',
          confidence: 0.98,
          description: '植株生长健壮，分蘖正常，处于拔节初期。',
          image: 'https://picsum.photos/seed/crop1/400/300',
          plotId: 'plot_sim_2'
        }
      ];
    }
  },

  /**
   * 保存 AI 识别历史记录
   */
  saveRecognitionHistory: async (historyItem: { 
    type: string; 
    target: string; 
    confidence: number; 
    description: string; 
    image: string; 
    plotId: string;
    result: any;
  }) => {
    try {
      const response = await apiFetch('/api/recognition/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historyItem)
      });
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML instead of JSON');
      }
      if (!response.ok) throw new Error('保存识别历史失败');
      return await response.json();
    } catch (error) {
      console.warn('Simulating recognition history save in demo mode:', error);
      return { id: `rec_demo_${Date.now()}`, ...historyItem, timestamp: new Date().toISOString() };
    }
  },

  /**
   * 开启双重身份验证
   */
  enable2FA: async (username: string) => {
    void username;
    throw new Error('该功能尚未接入安全账户服务');
  },

  /**
   * 关闭双重身份验证
   */
  disable2FA: async (username: string) => {
    void username;
    throw new Error('该功能尚未接入安全账户服务');
  },

  /**
   * 获取用户资料
   */
  getUserProfile: async (username?: string) => {
    const context = await saasClient.me();
    if (username && username !== context.user.username) throw new Error('无权读取其他用户资料');
    return { ...context.user, organization: context.organization, membership: context.membership, entitlement: context.entitlement };
  },

  /**
   * 更新用户资料
   */
  updateUserProfile: async (profile: any) => {
    void profile;
    throw new Error('该功能尚未接入安全账户服务');
  },

  /**
   * 修改密码
   */
  changePassword: async (payload: any) => {
    void payload;
    throw new Error('该功能尚未接入安全账户服务');
  },

  /**
   * 获取用户收藏列表
   */
  getFavorites: async (username?: string) => {
    const identity = username ?? getCurrentUsername();
    if (!identity || typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(`nxzj_favorites_${identity}`) ?? '[]'); } catch { return []; }
  },

  /**
   * 添加收藏
   */
  addFavorite: async (articleId: string, username?: string) => {
    const identity = username ?? getCurrentUsername();
    if (!identity || typeof window === 'undefined') throw new Error('无法确定当前用户');
    const key = `nxzj_favorites_${identity}`;
    const current = await DataService.getFavorites(identity);
    if (!current.some((item: any) => item.id === articleId)) current.push({ id: articleId });
    localStorage.setItem(key, JSON.stringify(current));
    return { success: true };
  },

  /**
   * 移除收藏
   */
  removeFavorite: async (articleId: string, username?: string) => {
    const identity = username ?? getCurrentUsername();
    if (!identity || typeof window === 'undefined') throw new Error('无法确定当前用户');
    const current = await DataService.getFavorites(identity);
    localStorage.setItem(`nxzj_favorites_${identity}`, JSON.stringify(current.filter((item: any) => item.id !== articleId)));
    return { success: true };
  },

  // ===== 商业模式：订阅 / 硬件 / 增值服务 =====

  /** 获取商品/套餐/服务目录 */
  getStoreCatalog: async () => {
    return saasClient.catalog();
  },

  /** 获取当前用户权益快照 */
  getEntitlements: async (username?: string) => {
    void username;
    return saasClient.entitlements();
  },

  /** 我的订单 */
  getCommerceOrders: async (username?: string) => {
    void username;
    return saasClient.listOrders();
  },

  /** 统一下单（type: subscription | hardware | service） */
  createOrder: async (payload: { productId: string; quantity: number; idempotencyKey: string }) => {
    return saasClient.createOrder(payload);
  },

  /** 真实支付回调（演示用：手动结算待支付订单） */
  notifyPayment: async (orderId: string) => {
    return saasClient.settleOrder(orderId);
  },

  /** 商业演示模式（门控一键切换，服务端持久化） */
  getCommerceDemo: async (): Promise<boolean> => {
    return false;
  },
  setCommerceDemo: async (enabled: boolean): Promise<boolean> => {
    void enabled;
    throw new Error('商业演示开关已停用');
  },

  getUserApiKeys,
  setUserApiKeys
};

export default DataService;
