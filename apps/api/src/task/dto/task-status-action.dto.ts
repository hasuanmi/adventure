import { IsIn } from 'class-validator';
import { TaskStatusAction } from '@huahua/shared-types';

export class TaskStatusActionDto {
  @IsIn(['start', 'complete', 'resume'])
  action!: TaskStatusAction;
}
