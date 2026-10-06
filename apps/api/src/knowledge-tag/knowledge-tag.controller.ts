import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { KnowledgeTagDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { CreateKnowledgeTagDto, ListKnowledgeTagDto } from './dto';
import { KnowledgeTagService } from './knowledge-tag.service';

// /knowledge-tags（对照上游 /api/tags：列表含树形、新建自定义、删除）
@UseGuards(JwtAuthGuard)
@Controller('knowledge-tags')
export class KnowledgeTagController {
  constructor(private readonly tags: KnowledgeTagService) {}

  @Get()
  async list(
    @CurrentUser() actor: RequestActor,
    @Query() query: ListKnowledgeTagDto,
  ): Promise<KnowledgeTagDto[]> {
    return this.tags.list(actor, {
      subject: query.subject,
      parentId: query.parentId,
      tree: query.tree === 'true',
    });
  }

  @Post()
  async create(
    @CurrentUser() actor: RequestActor,
    @Body() dto: CreateKnowledgeTagDto,
  ): Promise<KnowledgeTagDto> {
    return this.tags.create(actor, dto);
  }

  /** 标签统计（上游 /api/tags/stats） */
  @Get('stats')
  async stats(
    @CurrentUser() actor: RequestActor,
    @Query() query: ListKnowledgeTagDto,
  ): Promise<{ id: string; name: string; subject: string; isSystem: boolean; count: number }[]> {
    return this.tags.stats(actor, query.subject);
  }

  /** 标签建议（上游 /api/tags/suggestions） */
  @Get('suggestions')
  async suggestions(
    @CurrentUser() actor: RequestActor,
    @Query() query: ListKnowledgeTagDto & { q?: string },
  ): Promise<{ id: string; name: string; count: number }[]> {
    return this.tags.suggestions(actor, { subject: query.subject, q: query.q });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<void> {
    await this.tags.remove(actor, id);
  }
}
