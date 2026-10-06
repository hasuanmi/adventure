import { AI_PROVIDER_KINDS } from '@huahua/shared-types';
import { AiConfig, isAiConfigured } from './ai.config';

/** AI 调用失败归一化（上游 9 个错误码的等价集合，见盘点报告 §AI） */
export const AI_ERROR = {
  NOT_CONFIGURED: 'ai_not_configured',
  AUTH: 'ai_auth_error',
  CONNECTION: 'ai_connection_failed',
  TIMEOUT: 'ai_timeout_error',
  QUOTA: 'ai_quota_exceeded',
  SERVICE: 'ai_service_unavailable',
  RESPONSE: 'ai_response_error',
  UNKNOWN: 'ai_unknown_error',
} as const;
export type AiErrorCode = (typeof AI_ERROR)[keyof typeof AI_ERROR];

export class AiProviderError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface AiCompleteParams {
  system: string;
  user: string;
  /** data URL 或纯 base64（视觉模型用；上游 /api/analyze 传 imageBase64） */
  imageBase64?: string | null;
  /** 需要视觉模型（识题）时置 true */
  vision?: boolean;
}

export interface AiProvider {
  readonly kind: string;
  readonly model: string;
  complete(params: AiCompleteParams): Promise<string>;
}

/** 未配置时的 provider：任何调用都明确报 ai_not_configured（不静默失败） */
export class NullAiProvider implements AiProvider {
  readonly kind = 'none';
  readonly model = '';
  async complete(): Promise<string> {
    throw new AiProviderError(AI_ERROR.NOT_CONFIGURED, 'AI 未配置：缺少 AI_BASE_URL / AI_MODEL / AI_API_KEY');
  }
}

/**
 * OpenAI 兼容 Chat Completions provider（不引入新依赖，用全局 fetch）。
 * 上游支持 gemini / openai / azure 三选一（`src/lib/ai/index.ts`）；我们保留同一抽象，
 * 只要 base_url 兼容即可（大多数网关/自建代理都兼容），密钥只在服务端读取。
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly kind = AI_PROVIDER_KINDS[0];

  constructor(private readonly config: AiConfig) {}

  get model(): string {
    return this.config.model;
  }

  async complete(params: AiCompleteParams): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const model = params.vision ? this.config.visionModel : this.config.model;
    const content: unknown[] = [{ type: 'text', text: params.user }];
    if (params.imageBase64) {
      const url = params.imageBase64.startsWith('data:')
        ? params.imageBase64
        : `data:image/jpeg;base64,${params.imageBase64}`;
      content.push({ type: 'image_url', image_url: { url } });
    }

    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.vision || params.imageBase64 ? content : params.user },
          ],
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) throw new AiProviderError(AI_ERROR.AUTH, body);
        if (res.status === 429) throw new AiProviderError(AI_ERROR.QUOTA, body);
        if (res.status >= 500) throw new AiProviderError(AI_ERROR.SERVICE, body);
        throw new AiProviderError(AI_ERROR.RESPONSE, body);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new AiProviderError(AI_ERROR.RESPONSE, 'empty completion');
      return text;
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if ((error as Error).name === 'AbortError') throw new AiProviderError(AI_ERROR.TIMEOUT);
      throw new AiProviderError(AI_ERROR.CONNECTION, (error as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAiProvider(config: AiConfig): AiProvider {
  return isAiConfigured(config) ? new OpenAiCompatibleProvider(config) : new NullAiProvider();
}
