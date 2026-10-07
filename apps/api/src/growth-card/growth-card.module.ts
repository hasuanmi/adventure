import { Module } from '@nestjs/common';
import { GrowthCardController } from './growth-card.controller';
import { GrowthCardService } from './growth-card.service';

@Module({
  controllers: [GrowthCardController],
  providers: [GrowthCardService],
  exports: [GrowthCardService],
})
export class GrowthCardModule {}