import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { WRONG_QUESTION_SUBJECTS } from '@huahua/shared-types';

export class ListKnowledgeTagDto {
  @IsOptional() @IsIn(WRONG_QUESTION_SUBJECTS as unknown as string[]) subject?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBooleanString() tree?: string;
}

export class CreateKnowledgeTagDto {
  @IsString() name!: string;
  @IsIn(WRONG_QUESTION_SUBJECTS as unknown as string[]) subject!: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() code?: string | null;
}
