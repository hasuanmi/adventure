import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubmitCompletionRequest } from '@huahua/shared-types';

export class SubmitCompletionDto implements SubmitCompletionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsObject()
  evidenceJson?: Record<string, unknown>;
}
