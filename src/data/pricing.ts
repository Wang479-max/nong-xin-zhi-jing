/**
 * @file pricing.ts
 * @description 农芯智境商业模式「单一数据源」（前后端共用，纯数据/纯函数，禁止引用 DOM）。
 *
 * 对应商业模式三大板块：
 *   ① SaaS 订阅（主要收入 60%）：免费基础版 / 年费专业版 / 私有化企业定制
 *   ② 硬件销售：传感器套件（含网关）/ 灌溉控制器等配件
 *   ③ 增值服务：AI 高级诊断包 / 定制化种植方案报告 / 农业技术咨询
 *
 * 门控以「演示模式」可一键切换（见 commerce demo 开关），支付走「模拟支付」
 * 并预留真实支付提供商接口占位（PAYMENT_PROVIDERS）。
 */

// ---------------------------------------------------------------------------
// 一、SaaS 套餐
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'pro' | 'enterprise';

/** 受控功能点：未达套餐档位时被门控锁定 */
export type FeatureKey =
  | 'monitoring-basic'      // 基础环境监测（所有档位开放）
  | 'ai-diagnosis'          // AI 病害诊断 / 智能识别（专业版+）
  | 'digital-twin-advanced' // 数字孪生高级视图（专业版+）
  | 'advanced-analytics'    // 高级数据分析 / 报表（专业版+）
  | 'private-deploy';       // 私有化部署 / 专属模型（企业版）

export interface PlanDef {
  id: PlanId;
  /** 规范展示名 */
  name: string;
  /** 营销副标题 */
  tagline: string;
  /** 价格展示文本 */
  priceLabel: string;
  /** 单价（元/年/地块）；企业版为 -1 表示定制报价 */
  pricePerPlotPerYear: number;
  /** 地块数量上限；-1 表示不限 */
  plotLimit: number;
  /** 每月 AI 识别配额；-1 表示不限 */
  aiMonthlyQuota: number;
  /** 该档开放的功能点 */
  features: FeatureKey[];
  /** 卖点清单（用于价格卡） */
  highlights: string[];
  /** 是否主推（图中 SaaS 60% 高亮） */
  recommended?: boolean;
  /** 强调色（Tailwind 调色板键） */
  accent: 'slate' | 'emerald' | 'violet';
}

export const PLAN_DEFS: PlanDef[] = [
  {
    id: 'free',
    name: '免费基础版',
    tagline: '零成本体验智慧农业',
    priceLabel: '免费',
    pricePerPlotPerYear: 0,
    plotLimit: 2,
    aiMonthlyQuota: 5,
    features: ['monitoring-basic'],
    highlights: [
      '限 2 个地块',
      '基础环境监测',
      'AI 识别 5 次/月',
      '社区知识库',
    ],
    accent: 'slate',
  },
  {
    id: 'pro',
    name: '年费专业版',
    tagline: '全功能 + AI 诊断，按地块订阅',
    priceLabel: '¥1999 /年/地块',
    pricePerPlotPerYear: 1999,
    plotLimit: 50,
    aiMonthlyQuota: -1,
    features: ['monitoring-basic', 'ai-diagnosis', 'digital-twin-advanced', 'advanced-analytics'],
    highlights: [
      '全部功能解锁',
      'AI 病害诊断不限量',
      '数字孪生高级视图',
      '高级数据分析与报表',
      '优先技术支持',
    ],
    recommended: true,
    accent: 'emerald',
  },
  {
    id: 'enterprise',
    name: '私有化企业定制',
    tagline: '私有化部署 + 专属模型',
    priceLabel: '定制报价',
    pricePerPlotPerYear: -1,
    plotLimit: -1,
    aiMonthlyQuota: -1,
    features: ['monitoring-basic', 'ai-diagnosis', 'digital-twin-advanced', 'advanced-analytics', 'private-deploy'],
    highlights: [
      '不限地块数量',
      '私有化 / 本地化部署',
      '专属 AI 模型微调',
      '专属客户成功经理',
      'SLA 服务保障',
    ],
    accent: 'violet',
  },
];

/** 兼容历史中文 plan 字段及英文别名，统一归一为 PlanId */
export function normalizePlan(plan?: string | null): PlanId {
  if (!plan) return 'free';
  const p = String(plan).trim().toLowerCase();
  if (['企业版', '私有化企业定制', 'enterprise', 'enterprise plan'].includes(p) || p.includes('企业')) return 'enterprise';
  if (['专业版', '年费专业版', 'pro', 'pro plan'].includes(p) || p.includes('专业')) return 'pro';
  return 'free';
}

export function getPlanDef(plan?: string | null): PlanDef {
  const id = normalizePlan(plan);
  return PLAN_DEFS.find(p => p.id === id) || PLAN_DEFS[0];
}

export function getPlanName(plan?: string | null): string {
  return getPlanDef(plan).name;
}

/** 该 plan 是否开放某功能点（不含演示模式覆盖，演示模式在调用层处理） */
export function planAllowsFeature(plan: string | null | undefined, feature: FeatureKey): boolean {
  return getPlanDef(plan).features.includes(feature);
}

export function getPlotLimit(plan?: string | null): number {
  return getPlanDef(plan).plotLimit;
}

export function getAiMonthlyQuota(plan?: string | null): number {
  return getPlanDef(plan).aiMonthlyQuota;
}

// ---------------------------------------------------------------------------
// 二、硬件销售
// ---------------------------------------------------------------------------

export interface ProductDef {
  id: string;
  name: string;
  category: 'hardware' | 'accessory';
  price: number;
  unit: string;
  /** 毛利率（内部参考，前台不强制展示） */
  grossMargin?: number;
  desc: string;
  specs: string[];
  badge?: string;
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'hw_sensor_kit',
    name: '传感器套件（含网关）',
    category: 'hardware',
    price: 2999,
    unit: '套',
    grossMargin: 0.4,
    desc: '一站式田间物联感知套件，含 LoRa 网关与多合一土壤/气象传感器，开箱即用接入平台。',
    specs: ['土壤温湿度 / pH / 氮磷钾', '空气温湿度 / 光照', 'LoRa 无线网关（含）', '太阳能供电，IP67 防护'],
    badge: '热销',
  },
  {
    id: 'hw_irrigation_ctrl',
    name: '智能灌溉控制器',
    category: 'accessory',
    price: 1299,
    unit: '台',
    grossMargin: 0.45,
    desc: '可选配件，支持水肥一体化远程控制，与平台硬件控制模块联动。',
    specs: ['4 路电磁阀控制', '水肥一体化', '远程/定时/阈值触发', 'RS485 / 无线双模'],
  },
  {
    id: 'hw_weather_station',
    name: '田间小型气象站',
    category: 'accessory',
    price: 3599,
    unit: '台',
    grossMargin: 0.4,
    desc: '可选配件，提供风速风向、雨量、蒸散量等农业气象要素监测。',
    specs: ['风速风向 / 雨量', '蒸散量 ET0 计算', '杆塔一体化', '4G 回传'],
  },
];

// ---------------------------------------------------------------------------
// 三、增值服务
// ---------------------------------------------------------------------------

export type ServiceBilling = 'per-use' | 'monthly' | 'hourly';

export interface ValueServiceDef {
  id: string;
  name: string;
  billing: ServiceBilling;
  price: number;
  unit: string;
  desc: string;
  /** 购买后解锁的能力（与功能门控/识别引擎联动） */
  unlocks?: 'advanced-ai-pack';
}

export const VALUE_SERVICES: ValueServiceDef[] = [
  {
    id: 'svc_ai_pro_pack',
    name: 'AI 高级诊断包',
    billing: 'per-use',
    price: 99,
    unit: '次',
    desc: '调用增强版多模型协同诊断，输出更细致的病害分级、防治处方与置信度分析。支持按次或包月。',
    unlocks: 'advanced-ai-pack',
  },
  {
    id: 'svc_ai_pro_pack_monthly',
    name: 'AI 高级诊断包（包月）',
    billing: 'monthly',
    price: 599,
    unit: '月',
    desc: '高级诊断不限次数，适合病害高发期密集排查。',
    unlocks: 'advanced-ai-pack',
  },
  {
    id: 'svc_custom_report',
    name: '定制化种植方案报告',
    billing: 'per-use',
    price: 500,
    unit: '份',
    desc: '由 AI 结合地块实时数据生成专属种植/施肥/ROI 方案报告，专家复核后交付。',
  },
  {
    id: 'svc_consulting',
    name: '农业技术咨询',
    billing: 'hourly',
    price: 200,
    unit: '小时',
    desc: '一对一农艺师在线咨询，按小时计费，预约后由专家团队对接。',
  },
];

// ---------------------------------------------------------------------------
// 四、收入构成（商业模式图中环形图）
// ---------------------------------------------------------------------------

export const REVENUE_BREAKDOWN: { key: string; label: string; percent: number; color: string }[] = [
  { key: 'saas', label: 'SaaS 订阅', percent: 60, color: '#2563eb' },
  { key: 'hardware', label: '硬件销售', percent: 30, color: '#60a5fa' },
  { key: 'service', label: '增值服务', percent: 10, color: '#bfdbfe' },
];

// ---------------------------------------------------------------------------
// 五、支付提供商占位（模拟支付 + 预留真实支付接口）
// ---------------------------------------------------------------------------

export type PaymentProviderId = 'mock' | 'wechat' | 'alipay';

export interface PaymentProviderConfig {
  id: PaymentProviderId;
  name: string;
  /** 是否启用：真实支付默认关闭，仅占位 */
  enabled: boolean;
  /** 真实接入时填写的网关地址（占位） */
  gateway?: string;
  description: string;
}

export const PAYMENT_PROVIDERS: PaymentProviderConfig[] = [
  {
    id: 'mock',
    name: '模拟支付（演示）',
    enabled: true,
    description: '本地模拟下单与支付回调，用于演示完整交易闭环，不产生真实扣款。',
  },
  {
    id: 'wechat',
    name: '微信支付',
    enabled: false, // 占位：接入真实商户号后置 true
    gateway: 'https://api.mch.weixin.qq.com/v3/pay/transactions/native',
    description: '预留微信支付 Native 下单接口，需配置商户号 / API v3 密钥后启用。',
  },
  {
    id: 'alipay',
    name: '支付宝',
    enabled: false, // 占位：接入真实 appId 后置 true
    gateway: 'https://openapi.alipay.com/gateway.do',
    description: '预留支付宝当面付接口，需配置 appId / 应用私钥后启用。',
  },
];

export type OrderType = 'subscription' | 'hardware' | 'service';

export interface OrderItem {
  refId: string;   // planId / productId / serviceId
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  username: string;
  type: OrderType;
  items: OrderItem[];
  amount: number;
  currency: 'CNY';
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  provider: PaymentProviderId;
  transactionId?: string;
  createdAt: string;
  paidAt?: string;
  meta?: Record<string, any>;
}
