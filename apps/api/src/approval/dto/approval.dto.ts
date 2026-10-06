import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { APPROVAL_BUSINESS_TYPES, ApprovalBusinessType, CreateApprovalRequest, DecideApprovalRequest } from '@huahua/shared-types';

export class CreateApprovalDto implements CreateApprovalRequest {
  @IsIn(APPROVAL_BUSINESS_TYPES)
  businessType!: ApprovalBusinessType;

  @IsUUID()
  businessId!: string;

  @IsUUID()
  applicantId!: string;

  @IsUUID()
  reviewerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** approve：comment 可选（不要求） */
export class DecideApprovalDto implements DecideApprovalRequest {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** reject：comment 必填（v1.2 产品规则：驳回必填意见） */
export class RejectApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comment!: string;
}
