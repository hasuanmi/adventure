import { z } from 'zod';

// Task 创建/编辑共享表单 schema（从 TaskFormPage 抽离；字段严格对齐 Task DTO，不新增）
export const taskFormSchema = z.object({
  title: z.string().min(1, '请填写标题').max(128, '标题过长'),
  description: z.string().max(2000, '描述过长').optional().or(z.literal('')),
  subject: z.string().optional().or(z.literal('')),
  priority: z.number().min(0).max(10),
  startAt: z.string().optional().or(z.literal('')),
  endAt: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  // 预计用时（分钟；number input 空值经 valueAsNumber 为 NaN）
  estimatedMinutes: z.union([z.number().int().min(1).max(1440), z.literal(''), z.nan()]).optional(),
  color: z.string().optional().or(z.literal('')),
  // 任务图标 key（图标库白名单；空串 = 中性默认图标）
  icon: z.string().optional().or(z.literal('')),
  // 周重复位掩码（0 = 不重复）
  repeatWeekdays: z.number().int().min(0).max(127),
  requiresApproval: z.boolean(),
  reviewerId: z.string().optional().or(z.literal('')),
  rewardProfile: z.string().optional().or(z.literal('')),
  childId: z.string().optional().or(z.literal('')),
});
export type TaskFormValues = z.infer<typeof taskFormSchema>;
