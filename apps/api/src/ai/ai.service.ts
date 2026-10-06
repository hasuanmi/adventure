import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { AI_STATUS_REASON } from '@huahua/shared-types';
import { readAiConfig, isAiConfigured } from './ai.config';
import { ANALYZE_TAGS, REANSWER_TAGS, buildAnalyzePrompt, buildReanswerPrompt, extractTags } from './ai.prompt';
import { AI_ERROR, AiProviderError, createAiProvider } from './ai.provider';

export interface AiStatusDto {
  configured: boolean;
  provider: string;
  model: string;
  visionModel: string;
  /** 未配置时的原因码（前端据此显示"AI 未配置"，其余功能不受影响） */
  reason: string | null;
}

/**
 * AI 服务（P6-3 骨架）—— 用户决策："先搭好适配层，晚点接真模型"：
 *  · 未配置（缺 base_url / model / key）时：/ai/status 返回 configured=false + 明确 reason，
 *    调用类端点返回 ai_not_configured（**不静默失败**）；
 *  · 配置齐全后：走 OpenAI 兼容 provider，输出解析对照上游 9/6 个 XML 标签。
 */
@Injectable()
export class AiService {
  private provider(): ReturnType<typeof createAiProvider> {
    return createAiProvider(readAiConfig());
  }

  status(): AiStatusDto {
    const config = readAiConfig();
    const configured = isAiConfigured(config);
    return {
      configured,
      provider: configured ? config.provider : 'none',
      model: configured ? config.model : '',
      visionModel: configured ? config.visionModel : '',
      reason: configured ? null : AI_STATUS_REASON.NOT_CONFIGURED,
    };
  }

  /** 识题（对照上游 POST /api/analyze：图片 → 9 个 XML 标签） */
  async analyze(input: { imageBase64?: string | null; text?: string | null }): Promise<{
    raw: string;
    fields: Record<string, string | null>;
  }> {
    if (!input.imageBase64 && !input.text) {
      throw new BadRequestException({ error: 'bad_request', reason: 'ai_empty_input' });
    }
    const provider = this.provider();
    try {
      const raw = await provider.complete({
        system: buildAnalyzePrompt({}),
        user: input.text ?? '请识别并解析这道错题。',
        imageBase64: input.imageBase64 ?? null,
        vision: Boolean(input.imageBase64),
      });
      return { raw, fields: extractTags(raw, ANALYZE_TAGS) };
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  /** 重解（对照上游 POST /api/reanswer：6 个标签） */
  async reanswer(input: { questionText: string; wrongAnswerText?: string | null }): Promise<{
    raw: string;
    fields: Record<string, string | null>;
  }> {
    if (!input.questionText?.trim()) {
      throw new BadRequestException({ error: 'bad_request', reason: 'ai_empty_input' });
    }
    const provider = this.provider();
    try {
      const raw = await provider.complete({
        system: buildReanswerPrompt({ questionText: input.questionText, wrongAnswerText: input.wrongAnswerText ?? undefined }),
        user: input.questionText,
      });
      return { raw, fields: extractTags(raw, REANSWER_TAGS) };
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  private toHttp(error: unknown): Error {
    if (error instanceof AiProviderError) {
      if (error.code === AI_ERROR.NOT_CONFIGURED) {
        return new BadGatewayException({ error: 'bad_gateway', reason: error.code });
      }
      return new BadGatewayException({ error: 'bad_gateway', reason: error.code });
    }
    return new BadGatewayException({ error: 'bad_gateway', reason: AI_ERROR.UNKNOWN });
  }
}
