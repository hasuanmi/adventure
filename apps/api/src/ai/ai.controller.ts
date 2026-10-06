import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiStatusDto, AiService } from './ai.service';

// /ai（对照上游 /api/analyze、/api/reanswer、/api/ai/test|models；**均需登录**，密钥永不下发前端）
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status(): AiStatusDto {
    return this.ai.status();
  }

  @Post('analyze')
  async analyze(
    @Body() body: { imageBase64?: string | null; text?: string | null },
  ): Promise<{ raw: string; fields: Record<string, string | null> }> {
    return this.ai.analyze(body);
  }

  @Post('reanswer')
  async reanswer(
    @Body() body: { questionText: string; wrongAnswerText?: string | null },
  ): Promise<{ raw: string; fields: Record<string, string | null> }> {
    return this.ai.reanswer(body);
  }

  /** 相似题生成（对照上游 POST /api/practice/generate） */
  @Post('similar')
  async similar(
    @Body() body: { questionText: string; subject?: string | null; count?: number },
  ): Promise<{ raw: string; items: { question: string; answer: string | null; hint: string | null }[] }> {
    return this.ai.similar(body);
  }
}
