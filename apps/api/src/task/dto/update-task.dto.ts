import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { REWARD_PROFILE_CODES, UpdateTaskRequest } from '@huahua/shared-types';

export class UpdateTaskDto implements UpdateTaskRequest {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

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
  endAt?: string | null;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  repeatWeekdays?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsIn(REWARD_PROFILE_CODES)
  rewardProfile?: string | null;
}
