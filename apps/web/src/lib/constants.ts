// 前端常量（仅展示层；状态/奖励数值以 API 为准）
export const SUBJECT_OPTIONS = [
  { value: 'chinese', label: '语文', emoji: '📖' },
  { value: 'math', label: '数学', emoji: '➕' },
  { value: 'english', label: '英语', emoji: '🔤' },
  { value: 'olympiad', label: '奥数', emoji: '🧮' },
  { value: 'pet', label: 'PET 英语', emoji: '🎯' },
] as const;

export function subjectMeta(value?: string | null): { label: string; emoji: string } {
  const found = SUBJECT_OPTIONS.find((s) => s.value === value);
  return found ?? { label: value ?? '未分类', emoji: '📋' };
}

export const PRIORITY_OPTIONS = [
  { value: 2, label: '高' },
  { value: 1, label: '普通' },
  { value: 0, label: '低' },
] as const;

// 任务颜色 8 预设（huahuastudy TASK_COLOR_PRESETS 同源色板）
export const COLOR_PRESETS = [
  '#e38628', // 橙（冒险橙）
  '#4a9e6b', // 绿（完成绿）
  '#3b82f6', // 蓝
  '#8b5cf6', // 紫
  '#e05c5c', // 红
  '#f5c542', // 金黄
  '#2aa79e', // 青
  '#7a6752', // 棕
] as const;

// 周重复位映射（bit0=周一 … bit6=周日；与 shared-types repeatWeekdays 一致）
export const WEEKDAY_REPEAT_OPTIONS = [
  { bit: 1 << 0, label: '周一' },
  { bit: 1 << 1, label: '周二' },
  { bit: 1 << 2, label: '周三' },
  { bit: 1 << 3, label: '周四' },
  { bit: 1 << 4, label: '周五' },
  { bit: 1 << 5, label: '周六' },
  { bit: 1 << 6, label: '周日' },
] as const;
