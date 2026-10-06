import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JoinFamilyRequest } from '@huahua/shared-types';

/** 加入家庭：code = 家长 username（家庭邀请码） */
export class JoinFamilyDto implements JoinFamilyRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}
