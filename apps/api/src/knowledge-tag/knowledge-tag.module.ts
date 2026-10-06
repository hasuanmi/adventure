import { Module } from '@nestjs/common';
import { KnowledgeTagController } from './knowledge-tag.controller';
import { KnowledgeTagService } from './knowledge-tag.service';

@Module({
  controllers: [KnowledgeTagController],
  providers: [KnowledgeTagService],
})
export class KnowledgeTagModule {}
