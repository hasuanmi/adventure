// Growth 常量（P1；等级曲线 = v1.2 §18#3 产品规则）
import {
  DIM_LEVEL_BASE,
  DIM_LEVEL_STEP,
  XP_LEVEL_BASE,
  XP_LEVEL_STEP,
} from '@huahua/shared-types';

export { XP_LEVEL_BASE, XP_LEVEL_STEP, DIM_LEVEL_BASE, DIM_LEVEL_STEP };

/**
 * 基础奖励数值（占位默认值——**待产品定档**）。
 * v1.2 §18#3 确认了等级曲线/累计/升级规则，但未确认"分任务类型的基础奖励数值表"；
 * 历史规则草案中日常/世界/风物等类型各有基础值，P1 先以统一默认值打通发放链路。
 */
export const GROWTH_REWARD_DEFAULT = {
  xp: 10,
  intelligence: 2,
  logic: 2,
  expression: 2,
  exploration: 2,
  connection: 2,
  vitality: 2,
  coins: 10,
} as const;
