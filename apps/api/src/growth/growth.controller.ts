import { Controller, Get, UseGuards } from '@nestjs/common';
import { RewardGrantDto, UserGrowthDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { GrowthService } from './growth.service';

@UseGuards(JwtAuthGuard)
@Controller('growth')
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get('me')
  async me(@CurrentUser() actor: RequestActor): Promise<UserGrowthDto> {
    return this.growth.me(await this.growth.subjectUserId(actor));
  }

  @Get('grants')
  async grants(@CurrentUser() actor: RequestActor): Promise<RewardGrantDto[]> {
    return this.growth.grants(await this.growth.subjectUserId(actor));
  }
}
