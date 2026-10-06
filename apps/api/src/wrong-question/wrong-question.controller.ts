import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { WrongQuestionDto, WrongQuestionListDto, WrongQuestionReviewDto, WrongQuestionStatsDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import {
  CreateWrongQuestionDto,
  CreateWrongQuestionReviewDto,
  ListWrongQuestionDto,
  SetMasteryDto,
  UpdateNotesDto,
  UpdateWrongQuestionDto,
} from './dto';
import { WrongQuestionService } from './wrong-question.service';

// /wrong-questions（对照上游 /api/error-items、/api/error-items/[id]/{mastery,notes,reviews}）
@UseGuards(JwtAuthGuard)
@Controller('wrong-questions')
export class WrongQuestionController {
  constructor(private readonly wrongQuestion: WrongQuestionService) {}

  @Get()
  async list(
    @CurrentUser() actor: RequestActor,
    @Query() query: ListWrongQuestionDto,
  ): Promise<WrongQuestionListDto> {
    return this.wrongQuestion.list(actor, query);
  }

  @Post()
  async create(
    @CurrentUser() actor: RequestActor,
    @Body() dto: CreateWrongQuestionDto,
  ): Promise<WrongQuestionDto> {
    return this.wrongQuestion.create(actor, dto);
  }

  @Get('stats')
  async stats(@CurrentUser() actor: RequestActor): Promise<WrongQuestionStatsDto> {
    return this.wrongQuestion.stats(actor);
  }

  @Get(':id')
  async get(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<WrongQuestionDto> {
    return this.wrongQuestion.getById(actor, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: UpdateWrongQuestionDto,
  ): Promise<WrongQuestionDto> {
    return this.wrongQuestion.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<void> {
    await this.wrongQuestion.remove(actor, id);
  }

  @Patch(':id/mastery')
  async setMastery(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: SetMasteryDto,
  ): Promise<WrongQuestionDto> {
    return this.wrongQuestion.setMastery(actor, id, dto.masteryLevel);
  }

  @Patch(':id/notes')
  async updateNotes(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: UpdateNotesDto,
  ): Promise<WrongQuestionDto> {
    return this.wrongQuestion.updateNotes(actor, id, dto.userNotes);
  }

  @Get(':id/reviews')
  async listReviews(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
  ): Promise<WrongQuestionReviewDto[]> {
    return this.wrongQuestion.listReviews(actor, id);
  }

  @Post(':id/reviews')
  async createReview(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: CreateWrongQuestionReviewDto,
  ): Promise<WrongQuestionReviewDto> {
    return this.wrongQuestion.createReview(actor, id, dto);
  }
}
