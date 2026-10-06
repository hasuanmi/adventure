import type { RewardProfileCategory } from '@huahua/shared-types';

// 任务类型图标（visualasset/quest_icons 自研 32×32 像素图，登记见 docs/opensource-mapping.md §二点十一）
// 映射依据（quest_icons/README.md 的五类语义 ↔ 本项目奖励档分类）：
//   日常任务(daily)   : 每天要完成的学习与日常          → 奖励档 daily
//   世界任务(world)   : 阶段性重要目标与世界事件        → 奖励档 world
//   风物任务(nature)  : 户外活动、生活体验、观察自然    → 奖励档 scenery（风物）
//   悬赏任务(bounty)  : 临时发布、限时完成的特别任务    → 奖励档 custom（含未设置档位）
//   冒险任务(adventure): 长期成长、旅程与目标           → 无对应档位，用于「今日冒险」HUD 等装饰位
const BASE = '/quest';

export const QUEST_ICON_BY_CATEGORY: Record<RewardProfileCategory, string> = {
  daily: `${BASE}/01_daily.png`,
  world: `${BASE}/03_world.png`,
  scenery: `${BASE}/04_nature.png`,
  custom: `${BASE}/05_bounty.png`,
};

/** 「冒险」图标：无对应奖励档，用于 HUD「今日冒险」等装饰位 */
export const QUEST_ICON_ADVENTURE = `${BASE}/02_adventure.png`;

/**
 * 由奖励档 code 推断分类：code 前缀即分类（DAILY_/WORLD_/SCENERY_），其余（CUSTOM/未知）归 custom。
 * 与 shared-types 一致：`Task.rewardProfile = NULL` 业务上视为 CUSTOM。
 */
export function categoryFromRewardProfileCode(code?: string | null): RewardProfileCategory {
  const prefix = (code ?? 'CUSTOM').split('_')[0]?.toLowerCase();
  return prefix === 'daily' || prefix === 'world' || prefix === 'scenery' ? prefix : 'custom';
}

/** 任务卡/详情用的类型图标 */
export function questIconForRewardProfile(code?: string | null): string {
  return QUEST_ICON_BY_CATEGORY[categoryFromRewardProfileCode(code)];
}
