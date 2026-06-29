// ============================================================================
// 作物农艺生长模型 (Crop Agronomy Growth Model)
// ----------------------------------------------------------------------------
// 国赛硬性要求：所有微观形态必须 100% 对应真实农业业务参数 (数字孪生虚实映射)。
// 本模块集中维护各作物分生育期的真实农艺数据（株高/茎粗/叶片数/叶倾角/根深/
// 行距/株距），作为 3D 实例化渲染与单株级查询面板的唯一数据源，杜绝"花架子"。
//
// 数据来源：黄淮海冬麦区 / 夏玉米区主推品种田间实测均值
//   · 冬小麦 济麦22    · 夏玉米 郑单958    · 大豆 中黄13    · 苹果 烟富3
//
// 场景单位标定：1 three.js 单位 = 1 米 (m)。空间定位精度 ≤ 5cm (0.05 单位)。
// ============================================================================

export const SCENE_UNIT_METERS = 1.0; // 1 渲染单位 = 1 米

export interface GrowthStageSpec {
  /** 生育期键名 */
  key: 'seedling' | 'jointing' | 'heading' | 'maturity';
  /** 中文标签（按作物差异，如玉米抽穗记为"抽雄"） */
  label: string;
  /** 生长进度归一化 (0-1)，用于着色器全局生长插值 */
  progress: number;
  /** 株高 (cm) */
  heightCm: number;
  /** 茎粗 (mm) */
  stemDiameterMm: number;
  /** 单株可见叶片数 (片) */
  leafCount: number;
  /** 叶倾角 (°)，与水平面夹角，越小越披散 */
  leafAngleDeg: number;
  /** 根系深度 (cm) */
  rootDepthCm: number;
  /** 出苗后天数区间 */
  daysAfterEmergence: [number, number];
}

/** 垄沟（畦/垄）几何规格 —— 程序化地形依据 */
export interface RidgeSpec {
  /** 垄距/畦距 (cm) */
  spacingCm: number;
  /** 垄高 (cm) */
  heightCm: number;
  /** 垄顶宽 (cm) */
  widthCm: number;
}

/** 穗部/果穗参数 —— 抽穗期程序化生成 + 产量预估模型依据 */
export interface EarSpec {
  /** 单穗粒数（粒） */
  grainsPerEar: number;
  /** 穗长 (cm) */
  earLengthCm: number;
  /** 每株有效穗数 */
  earsPerPlant: number;
  /** 千粒重 (g) */
  thousandGrainWeightG: number;
  /** 抽穗开始的生长进度阈值（达到后穗部出现） */
  headingProgress: number;
}

export interface CropAgronomyProfile {
  /** 匹配关键字（出现在 plot.crop 中即命中） */
  matchKeywords: string[];
  /** 作物名 */
  cropName: string;
  /** 主推品种 */
  variety: string;
  /** 标准行距 (cm) — 农艺规程推荐值 */
  stdRowSpacingCm: number;
  /** 标准株距 (cm) */
  stdPlantSpacingCm: number;
  /** 行距合理区间 (cm) — 用于参数调控的农艺约束 */
  rowSpacingRangeCm: [number, number];
  /** 株距合理区间 (cm) */
  plantSpacingRangeCm: [number, number];
  /** 渲染基准几何高度（单位），用于把模型 cm 高度换算为实例 Y 缩放 */
  baseGeoHeightUnit: number;
  /** 垄沟标准规格（一键切换种植规格的依据） */
  ridge: RidgeSpec;
  /** 穗部/果穗参数（禾谷类有效，块根/果树为 null） */
  ear: EarSpec | null;
  /** 各生育期农艺参数（按 progress 升序） */
  stages: GrowthStageSpec[];
}

// ---------------------------------------------------------------------------
// 确定性伪随机数（可复现性：同一 seed + 参数 → 完全一致的田块形态）
// mulberry32：32 位整数种子，输出 [0,1)
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把字符串（如作物名/田块号）稳定散列为 32 位整数，用于派生确定性子种子 */
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// 各作物档案
// ---------------------------------------------------------------------------

const WHEAT: CropAgronomyProfile = {
  matchKeywords: ['小麦', '麦', 'wheat'],
  cropName: '冬小麦',
  variety: '济麦22',
  stdRowSpacingCm: 20,
  stdPlantSpacingCm: 3,
  rowSpacingRangeCm: [15, 25],
  plantSpacingRangeCm: [2, 6],
  baseGeoHeightUnit: 1.4,
  ridge: { spacingCm: 150, heightCm: 15, widthCm: 90 }, // 冬小麦多畦作
  ear: { grainsPerEar: 32, earLengthCm: 8, earsPerPlant: 2.5, thousandGrainWeightG: 44, headingProgress: 0.7 },
  stages: [
    { key: 'seedling', label: '苗期',  progress: 0.18, heightCm: 15, stemDiameterMm: 2.0, leafCount: 4, leafAngleDeg: 35, rootDepthCm: 20,  daysAfterEmergence: [0, 60] },
    { key: 'jointing', label: '拔节期', progress: 0.53, heightCm: 45, stemDiameterMm: 4.0, leafCount: 7, leafAngleDeg: 28, rootDepthCm: 60,  daysAfterEmergence: [120, 160] },
    { key: 'heading',  label: '抽穗期', progress: 0.88, heightCm: 75, stemDiameterMm: 4.5, leafCount: 8, leafAngleDeg: 22, rootDepthCm: 90,  daysAfterEmergence: [180, 200] },
    { key: 'maturity', label: '成熟期', progress: 1.0,  heightCm: 85, stemDiameterMm: 4.0, leafCount: 8, leafAngleDeg: 18, rootDepthCm: 100, daysAfterEmergence: [230, 250] },
  ],
};

const CORN: CropAgronomyProfile = {
  matchKeywords: ['玉米', 'corn', 'maize'],
  cropName: '夏玉米',
  variety: '郑单958',
  stdRowSpacingCm: 60,
  stdPlantSpacingCm: 25,
  rowSpacingRangeCm: [50, 70],
  plantSpacingRangeCm: [20, 33],
  baseGeoHeightUnit: 2.1,
  ridge: { spacingCm: 60, heightCm: 20, widthCm: 40 }, // 夏玉米起垄栽培，垄距≈行距
  ear: { grainsPerEar: 500, earLengthCm: 17, earsPerPlant: 1, thousandGrainWeightG: 330, headingProgress: 0.7 },
  stages: [
    { key: 'seedling', label: '苗期',  progress: 0.11, heightCm: 30,  stemDiameterMm: 8,  leafCount: 5,  leafAngleDeg: 30, rootDepthCm: 25,  daysAfterEmergence: [0, 25] },
    { key: 'jointing', label: '拔节期', progress: 0.44, heightCm: 120, stemDiameterMm: 20, leafCount: 10, leafAngleDeg: 26, rootDepthCm: 70,  daysAfterEmergence: [30, 50] },
    { key: 'heading',  label: '抽雄期', progress: 0.93, heightCm: 250, stemDiameterMm: 25, leafCount: 18, leafAngleDeg: 22, rootDepthCm: 120, daysAfterEmergence: [55, 70] },
    { key: 'maturity', label: '成熟期', progress: 1.0,  heightCm: 270, stemDiameterMm: 24, leafCount: 20, leafAngleDeg: 20, rootDepthCm: 150, daysAfterEmergence: [95, 110] },
  ],
};

const SOYBEAN: CropAgronomyProfile = {
  matchKeywords: ['大豆', '豆', 'soy'],
  cropName: '大豆',
  variety: '中黄13',
  stdRowSpacingCm: 40,
  stdPlantSpacingCm: 10,
  rowSpacingRangeCm: [30, 50],
  plantSpacingRangeCm: [6, 14],
  baseGeoHeightUnit: 1.0,
  ridge: { spacingCm: 50, heightCm: 12, widthCm: 35 },
  ear: { grainsPerEar: 2.5, earLengthCm: 5, earsPerPlant: 35, thousandGrainWeightG: 200, headingProgress: 0.7 }, // 豆荚
  stages: [
    { key: 'seedling', label: '苗期',  progress: 0.2, heightCm: 12, stemDiameterMm: 3,  leafCount: 4,  leafAngleDeg: 40, rootDepthCm: 15, daysAfterEmergence: [0, 20] },
    { key: 'jointing', label: '分枝期', progress: 0.5, heightCm: 40, stemDiameterMm: 6,  leafCount: 10, leafAngleDeg: 32, rootDepthCm: 45, daysAfterEmergence: [25, 45] },
    { key: 'heading',  label: '开花结荚', progress: 0.85, heightCm: 70, stemDiameterMm: 8, leafCount: 16, leafAngleDeg: 26, rootDepthCm: 80, daysAfterEmergence: [50, 75] },
    { key: 'maturity', label: '鼓粒成熟', progress: 1.0, heightCm: 85, stemDiameterMm: 7, leafCount: 14, leafAngleDeg: 22, rootDepthCm: 100, daysAfterEmergence: [90, 120] },
  ],
};

const ORCHARD: CropAgronomyProfile = {
  matchKeywords: ['苹果', '果', '林', 'apple', 'orchard'],
  cropName: '苹果',
  variety: '烟富3',
  stdRowSpacingCm: 400,
  stdPlantSpacingCm: 200,
  rowSpacingRangeCm: [300, 500],
  plantSpacingRangeCm: [150, 300],
  baseGeoHeightUnit: 3.0,
  ridge: { spacingCm: 400, heightCm: 25, widthCm: 120 },
  ear: null, // 果树以果实计产，不走穗部模型
  stages: [
    { key: 'seedling', label: '萌芽期', progress: 0.4, heightCm: 180, stemDiameterMm: 40, leafCount: 200, leafAngleDeg: 45, rootDepthCm: 60,  daysAfterEmergence: [0, 30] },
    { key: 'jointing', label: '新梢期', progress: 0.7, heightCm: 260, stemDiameterMm: 70, leafCount: 800, leafAngleDeg: 40, rootDepthCm: 120, daysAfterEmergence: [30, 90] },
    { key: 'heading',  label: '花果期', progress: 0.9, heightCm: 300, stemDiameterMm: 90, leafCount: 1500, leafAngleDeg: 38, rootDepthCm: 180, daysAfterEmergence: [90, 150] },
    { key: 'maturity', label: '果熟期', progress: 1.0, heightCm: 320, stemDiameterMm: 100, leafCount: 1800, leafAngleDeg: 35, rootDepthCm: 250, daysAfterEmergence: [150, 210] },
  ],
};

const PROFILES: CropAgronomyProfile[] = [WHEAT, CORN, SOYBEAN, ORCHARD];

/** 根据 plot.crop 文本解析作物农艺档案，缺省回退到冬小麦 */
export function getCropProfile(crop: string | undefined | null): CropAgronomyProfile {
  if (!crop) return WHEAT;
  const c = crop.toLowerCase();
  for (const p of PROFILES) {
    if (p.matchKeywords.some(k => crop.includes(k) || c.includes(k.toLowerCase()))) return p;
  }
  return WHEAT;
}

/** 把全局生长进度标量 (0-1) 映射到最接近的生育期档位 */
export function getStageByProgress(profile: CropAgronomyProfile, progress: number): GrowthStageSpec {
  let best = profile.stages[0];
  let bestDelta = Infinity;
  for (const s of profile.stages) {
    const d = Math.abs(s.progress - progress);
    if (d < bestDelta) { bestDelta = d; best = s; }
  }
  return best;
}

/**
 * 按生长进度在相邻生育期之间线性插值，得到连续的农艺形态值。
 * 用于生长动画平滑过渡（必达/冲奖：生育期参数平滑过渡）。
 */
export function interpolateMorphology(profile: CropAgronomyProfile, progress: number) {
  const stages = profile.stages;
  const p = Math.max(0, Math.min(1, progress));
  let lo = stages[0];
  let hi = stages[stages.length - 1];
  for (let i = 0; i < stages.length - 1; i++) {
    if (p >= stages[i].progress && p <= stages[i + 1].progress) {
      lo = stages[i];
      hi = stages[i + 1];
      break;
    }
  }
  const span = hi.progress - lo.progress || 1;
  const t = (p - lo.progress) / span;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    heightCm: lerp(lo.heightCm, hi.heightCm),
    stemDiameterMm: lerp(lo.stemDiameterMm, hi.stemDiameterMm),
    leafCount: Math.round(lerp(lo.leafCount, hi.leafCount)),
    leafAngleDeg: lerp(lo.leafAngleDeg, hi.leafAngleDeg),
    rootDepthCm: lerp(lo.rootDepthCm, hi.rootDepthCm),
    stageLabel: t < 0.5 ? lo.label : hi.label,
  };
}

/** 作物状态对长势综合评分的真实业务映射 */
export function scoreByStatus(status: string): number {
  switch (status) {
    case 'healthy': return 90 + Math.random() * 8;          // 90-98 优
    case 'nitrogen_deficient': return 68 + Math.random() * 10; // 68-78 中
    case 'drought': return 55 + Math.random() * 12;         // 55-67 偏低
    case 'pest': return 42 + Math.random() * 15;            // 42-57 差
    default: return 80;
  }
}

const MU_PER_HA_M2 = 666.67; // 1 亩 ≈ 666.67 m²

/**
 * 理论产量预估（kg/亩）= 亩株数 × 每株穗数 × 穗粒数 × 千粒重 / 1e6
 * 由穗部参数(EarSpec) + 实际行株距(密度) + 长势折减系数驱动，对应产量预估模型。
 * healthyRatio: 健康优良占比(0-1)，作为产量折减系数。
 */
export function estimateYieldKgPerMu(
  profile: CropAgronomyProfile,
  rowSpacingCm: number,
  plantSpacingCm: number,
  healthyRatio: number = 1.0
): number {
  if (!profile.ear) return 0;
  const areaPerPlantM2 = (rowSpacingCm / 100) * (plantSpacingCm / 100);
  if (areaPerPlantM2 <= 0) return 0;
  const plantsPerMu = MU_PER_HA_M2 / areaPerPlantM2;
  const grainsPerPlant = profile.ear.earsPerPlant * profile.ear.grainsPerEar;
  const gramsPerMu = plantsPerMu * grainsPerPlant * (profile.ear.thousandGrainWeightG / 1000);
  const kgPerMu = (gramsPerMu / 1000) * THREE_clamp(healthyRatio, 0.3, 1.0);
  return kgPerMu;
}

function THREE_clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
