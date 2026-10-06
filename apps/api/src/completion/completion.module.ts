import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { GrowthModule } from '../growth/growth.module';
import { CompletionController } from './completion.controller';
import { CompletionService } from './completion.service';

@Module({
  imports: [ApprovalModule, GrowthModule],
  controllers: [CompletionController],
  providers: [CompletionService],
  exports: [CompletionService],
})
export class CompletionModule {}
