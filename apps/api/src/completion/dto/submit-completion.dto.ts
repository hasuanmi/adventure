import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubmitCompletionRequest } from '@huahua/shared-types';

export class SubmitCompletionDto implements SubmitCompletionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsObject()
  evidenceJson?: Record<string, unknown>;

  /** 完成凭证：文字（与 proofFileKeys 至少填一项；可同时提供） */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proofText?: string;

  /** 完成凭证：上传后的文件 key 列表（**数量不限**，图片或文件皆可） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proofFileKeys?: string[];
}
