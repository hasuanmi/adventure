import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { FamilyDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { JoinFamilyDto } from './dto';
import { FamilyService } from './family.service';

/** 最小家庭入口（P2；无 Family 表，仅 users.family_id 单列） */
@UseGuards(JwtAuthGuard)
@Controller('family')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  /** 家长创建家庭（familyId = 自己；邀请码 = 自己的 username） */
  @Post('create')
  @HttpCode(201)
  async create(@CurrentUser() actor: RequestActor): Promise<FamilyDto> {
    return this.family.create(actor);
  }

  /** 加入家庭（code = 家长 username） */
  @Post('join')
  async join(@CurrentUser() actor: RequestActor, @Body() dto: JoinFamilyDto): Promise<FamilyDto> {
    return this.family.join(actor, dto.code);
  }

  /** 我的家庭与成员列表 */
  @Get('me')
  async me(@CurrentUser() actor: RequestActor): Promise<FamilyDto> {
    return this.family.me(actor);
  }
}
