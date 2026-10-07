import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { GrowthCardService } from './growth-card.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';

/**
 * Daily growth card endpoints (idempotent).
 *  GET  /growth-cards/today   -> read only (never generates); card: null when not claimed yet
 *  POST /growth-cards/today   -> claim/generate once per day; { regenerateImage: true } retries image only
 */
@Controller('growth-cards')
@UseGuards(JwtAuthGuard)
export class GrowthCardController {
  constructor(private readonly service: GrowthCardService) {}

  @Get('today')
  async today(@CurrentUser() actor: RequestActor) {
    return { card: await this.service.getToday(actor.sub) };
  }

  @Post('today')
  async claim(@CurrentUser() actor: RequestActor, @Body() body: { regenerateImage?: boolean }) {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: 'family_required' });
    }
    return {
      card: await this.service.claimToday(
        actor.sub,
        actor.familyId,
        Boolean(body?.regenerateImage),
      ),
    };
  }
}