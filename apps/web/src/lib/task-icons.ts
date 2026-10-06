// 任务图标库（**由 visualasset/build_icon_library.py 生成，请勿手改**）
// 素材：quest_icons（本项目自研）+ Kenney Tiny Farm/Tiny Factory（CC0），统一 32×32。
// 登记见 docs/opensource-mapping.md §二点十一。

export interface TaskIconOption {
  key: string;
  label: string;
}

export const TASK_ICONS: TaskIconOption[] = [
  { key: 'daily', label: '日常学习' },
  { key: 'adventure', label: '长期挑战' },
  { key: 'world', label: '世界探索' },
  { key: 'nature', label: '自然风物' },
  { key: 'bounty', label: '特别任务' },
  { key: 'plant', label: '植物' },
  { key: 'tree', label: '树木' },
  { key: 'flower', label: '花朵' },
  { key: 'mushroom', label: '蘑菇' },
  { key: 'wheat', label: '麦子' },
  { key: 'tomato', label: '番茄' },
  { key: 'cabbage', label: '蔬菜' },
  { key: 'berry', label: '浆果' },
  { key: 'stone', label: '石头' },
  { key: 'hammer', label: '锤子' },
  { key: 'axe', label: '斧头' },
  { key: 'chest', label: '宝箱' },
  { key: 'barrel', label: '木桶' },
  { key: 'bag', label: '袋子' },
  { key: 'table', label: '桌子' },
  { key: 'bed', label: '床' },
  { key: 'sheep', label: '小羊' },
  { key: 'cow', label: '奶牛' },
  { key: 'chicken', label: '小鸡' },
  { key: 'mailbox', label: '信箱' },
  { key: 'well', label: '水井' },
  { key: 'bread', label: '面包' },
  { key: 'gear', label: '机械' },
  { key: 'robot', label: '机器人' },
  { key: 'crate', label: '箱子' },
  { key: 'screen', label: '屏幕' },
  { key: 'spring', label: '弹簧' },
  { key: 'machine', label: '设备' },
];

export const TASK_ICON_KEYS = TASK_ICONS.map((i) => i.key);

/** 未分类/未选择时的中性图标（避免所有任务都长成同一个默认图标） */
export const TASK_ICON_FALLBACK = 'crate';

export function taskIconUrl(key?: string | null): string {
  const k = key && TASK_ICON_KEYS.includes(key) ? key : TASK_ICON_FALLBACK;
  return `/icons/${k}.png`;
}

export function taskIconLabel(key?: string | null): string | undefined {
  return TASK_ICONS.find((i) => i.key === key)?.label;
}
