import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { REWARD_PROFILE_CATEGORIES, RewardProfileCategory, RewardProfilesResponse } from '@huahua/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RewardProfileService } from './reward-profile.service';

class ListQueryDto {
  @IsOptional()
  @IsIn(REWARD_PROFILE_CATEGORIES)
  category?: RewardProfileCategory;
}

@UseGuards(JwtAuthGuard)
@Controller('reward-profiles')
export class RewardProfileController {
  constructor(private readonly rewardProfile: RewardProfileService) {}

  /** 只返回 active；默认不含奖励数值（前端创建下拉不显示数值） */
  @Get()
  async list(@Query() query: ListQueryDto): Promise<RewardProfilesResponse> {
    return { profiles: await this.rewardProfile.listActive(query.category) };
  }
}
