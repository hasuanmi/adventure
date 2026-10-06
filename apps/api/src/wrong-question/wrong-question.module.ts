import { Module } from '@nestjs/common';
import { WrongQuestionController } from './wrong-question.controller';
import { WrongQuestionService } from './wrong-question.service';

@Module({
  controllers: [WrongQuestionController],
  providers: [WrongQuestionService],
})
export class WrongQuestionModule {}
