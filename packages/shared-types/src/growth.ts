// Growth 契约（P1；数值规则 = v1.2 §18#3 产品规则；无开源来源，标记自研）
// 规则：XP 门槛 100+20×(lv−1)；六维门槛 50+15×(lv−1)；初始 Lv.1/0 点；Lv.100 封顶；累计不扣除；大量获取自动连续升级。

export const SIX_DIMENSIONS = ['intelligence', 'logic', 'expression', 'exploration', 'connection', 'vitality'] as const;
export type Dimension = (typeof SIX_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  intelligence: '智识',
  logic: '逻辑',
  expression: '表达',
  exploration: '探索',
  connection: '羁绊',
  vitality: '体魄',
};

export const GROWTH_MAX_LEVEL = 100;
export const XP_LEVEL_BASE = 100;
export const XP_LEVEL_STEP = 20;
export const DIM_LEVEL_BASE = 50;
export const DIM_LEVEL_STEP = 15;

/** 升到 level 级所需的新增 XP（level≥1） */
export function xpNeedForLevel(level: number): number {
  return XP_LEVEL_BASE + XP_LEVEL_STEP * (level - 1);
}

/** 升到 level 级所需累计 XP（= sum_{i=1}^{level-1} xpNeedForLevel(i)） */
export function xpTotalToReach(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpNeedForLevel(i);
  return total;
}

/** 由累计 XP 派生等级（自动连续升级，Lv.100 封顶继续累积） */
export function levelFromXp(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < GROWTH_MAX_LEVEL) {
    const need = xpNeedForLevel(level);
    if (xp < total + need) break;
    total += need;
    level++;
  }
  return level;
}

/** 六维点数 → 属性等级（同 XP 规则，基数 50/步进 15） */
export function dimensionLevelFromPoints(points: number): number {
  let level = 1;
  let total = 0;
  while (level < GROWTH_MAX_LEVEL) {
    const need = DIM_LEVEL_BASE + DIM_LEVEL_STEP * (level - 1);
    if (points < total + need) break;
    total += need;
    level++;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  /** 当前等级内已积累 */
  current: number;
  /** 升到下一级所需 */
  needed: number;
  /** 0-1 进度 */
  ratio: number;
}

export function levelProgressFromXp(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = xpTotalToReach(level);
  const needed = xpNeedForLevel(level);
  const current = xp - floor;
  return { level, current, needed, ratio: needed > 0 ? Math.min(1, current / needed) : 1 };
}

export interface UserGrowthDto {
  userId: string;
  xp: number;
  intelligence: number;
  logic: number;
  expression: number;
  exploration: number;
  connection: number;
  vitality: number;
  coins: number;
  xpLevel: number;
  dimensionLevels: Record<Dimension, number>;
}

export interface RewardGrantDto {
  id: string;
  userId: string;
  taskId?: string | null;
  completionId?: string | null;
  type: string;
  xp: number;
  intelligence: number;
  logic: number;
  expression: number;
  exploration: number;
  connection: number;
  vitality: number;
  coins: number;
  grantedAt: string;
  grantedBy: string;
}
