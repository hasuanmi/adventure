import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CreateTaskRequest, REWARD_PROFILE_CODES, TASK_ICON_KEYS } from '@huahua/shared-types';

export class CreateTaskDto implements CreateTaskRequest {
  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  subject?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  priority?: number;

  @IsOptional()
  @IsString()
  startAt?: string;

  @IsOptional()
  @IsString()
  endAt?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  estimatedMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  /** 任务图标 key 白名单（展示层；缺省 = 中性默认图标） */
  @IsOptional()
  @IsIn(TASK_ICON_KEYS)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  repeatWeekdays?: number;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsIn(REWARD_PROFILE_CODES)
  rewardProfile?: string;
}
