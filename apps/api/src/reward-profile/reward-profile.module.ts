import { Module } from '@nestjs/common';
import { RewardProfileController } from './reward-profile.controller';
import { RewardProfileService } from './reward-profile.service';

@Module({
  controllers: [RewardProfileController],
  providers: [RewardProfileService],
  exports: [RewardProfileService],
})
export class RewardProfileModule {}
