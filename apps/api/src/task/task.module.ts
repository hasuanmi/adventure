import { Module } from '@nestjs/common';
import { CompletionModule } from '../completion/completion.module';
import { RewardProfileModule } from '../reward-profile/reward-profile.module';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

@Module({
  imports: [CompletionModule, RewardProfileModule],
  controllers: [TaskController],
  providers: [TaskService],
})
export class TaskModule {}
