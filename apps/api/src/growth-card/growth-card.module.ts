import { Module } from '@nestjs/common';
import { GrowthCardController } from './growth-card.controller';
import { GrowthCardService } from './growth-card.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [GrowthCardController],
  providers: [GrowthCardService],
  exports: [GrowthCardService],
})
export class GrowthCardModule {}