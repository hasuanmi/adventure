import type { RewardProfileCategory } from '@huahua/shared-types';
import { TASK_ICON_FALLBACK, TASK_ICON_KEYS } from './task-icons';

// 任务图标 / 任务类型的展示映射（对齐旧项目 Demo proto-kid-v2）：
//   · 卡片左上角 = 一枚 32×32 像素图标（**可由用户自选**；未选时退回类型图标，再退回中性图标）
//   · 卡片第二个 chip = **任务类型**（日常任务/世界任务/风物任务/悬赏任务/未分类）
// 素材与映射登记见 docs/opensource-mapping.md §二点十一，实施记录见 docs/p2-closure-record.md §14/§15。

/** 奖励档分类 → 任务类型图标 key（图标库前 5 枚即 quest_icons 自研图标） */
const ICON_KEY_BY_CATEGORY: Record<RewardProfileCategory, string> = {
  daily: 'daily',
  world: 'world',
  scenery: 'nature',
  bounty: 'bounty',
  physical: 'tree',
  custom: 'bounty',
};

/** 奖励档分类 → 类型文案（Demo 的第二个 chip） */
const TYPE_LABEL_BY_CATEGORY: Record<RewardProfileCategory, string> = {
  daily: '日常任务',
  world: '科学人文素养',
  scenery: '人际交往',
  bounty: '悬赏任务',
  physical: '体能锻炼',
  custom: '自定义任务',
};

/** 未设置奖励档（NULL）在 Demo 里显示为「未分类」 */
export const TASK_TYPE_UNCLASSIFIED = '未分类';

/**
 * 由奖励档 code 推断分类：code 前缀即分类（DAILY_/WORLD_/SCENERY_），其余（CUSTOM/未知）归 custom。
 * 与 shared-types 一致：`Task.rewardProfile = NULL` 业务上视为 CUSTOM。
 */
export function categoryFromRewardProfileCode(code?: string | null): RewardProfileCategory {
  const prefix = (code ?? 'CUSTOM').split('_')[0]?.toLowerCase();
  return prefix === 'daily' || prefix === 'world' || prefix === 'scenery' ? prefix : 'custom';
}

/** 任务类型文案；未设置奖励档 → 「未分类」 */
export function taskTypeLabel(rewardProfile?: string | null): string {
  if (!rewardProfile) return TASK_TYPE_UNCLASSIFIED;
  return TYPE_LABEL_BY_CATEGORY[categoryFromRewardProfileCode(rewardProfile)];
}

/** 任务卡左上角图标 URL：自选图标 > 类型图标 > 中性图标 */
export function taskTileIconUrl(task: { icon?: string | null; rewardProfile?: string | null }): string {
  if (task.icon && TASK_ICON_KEYS.includes(task.icon)) return `/icons/${task.icon}.png`;
  if (task.rewardProfile) return `/icons/${ICON_KEY_BY_CATEGORY[categoryFromRewardProfileCode(task.rewardProfile)]}.png`;
  return `/icons/${TASK_ICON_FALLBACK}.png`;
}

/** 「冒险」图标（HUD「今日冒险」装饰位）：图标库的 adventure */
export const TASK_ICON_ADVENTURE_URL = '/icons/adventure.png';

/** 奖励档分组标签用的类型图标（创建页下拉） */
export function categoryIconUrl(category: RewardProfileCategory): string {
  return `/icons/${ICON_KEY_BY_CATEGORY[category]}.png`;
}

/** 选中某奖励档时，触发器里显示的图标 */
export function rewardProfileIconUrl(code?: string | null): string {
  return categoryIconUrl(categoryFromRewardProfileCode(code));
}
