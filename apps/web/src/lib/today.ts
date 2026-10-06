// 「今日」范围纯函数（展示层规则，不改模型）
//
// 与日程投影（lib/schedule.ts taskAppliesToDay）同源，但今日页需要额外保住两类任务不消失：
//  1) 未安排任务（无 startAt 且无 dueDate）——归入今日待办
//  2) 逾期未完成（dueDate 早于今天且未完成）——必须仍可见
// 其余按 startAt（含周重复命中）/ dueDate 是否落在今天判断。
import type { TaskDto } from '@huahua/shared-types';
import { isSameDay, parseIso, startOfDay, taskAppliesToDay } from './schedule';

export function isOverdue(task: Pick<TaskDto, 'dueDate' | 'status'>, now: Date = new Date()): boolean {
  if (!task.dueDate || task.status === 'completed') return false;
  return startOfDay(parseIso(task.dueDate)).getTime() < startOfDay(now).getTime();
}

/** 任务是否属于「今日」范围 */
export function isTodayScope(task: TaskDto, now: Date = new Date()): boolean {
  if (!task.startAt && !task.dueDate) return true; // 未安排 → 今日待办
  if (isOverdue(task, now)) return true; // 逾期未完成 → 保留在今日
  if (task.dueDate && isSameDay(parseIso(task.dueDate), now)) return true;
  return taskAppliesToDay(task, now); // startAt 当天 / 周重复命中今天
}

/** 今日范围任务（保持后端返回顺序） */
export function todayTasks(tasks: TaskDto[], now: Date = new Date()): TaskDto[] {
  return tasks.filter((task) => isTodayScope(task, now));
}

export const TODAY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待开始' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'returned', label: '已退回' },
] as const;

export type TodayTabKey = (typeof TODAY_TABS)[number]['key'];
