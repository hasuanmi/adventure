import { DEFAULT_AI_MODEL, AI_PROVIDER_KINDS } from '@huahua/shared-types';

/** AI 配置（全部来自环境变量；密钥只进 .env，不入库、不进前端、不写日志） */
export interface AiConfig {
  provider: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  apiKey: string;
  timeoutMs: number;
}

export function readAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY ?? '';
  const baseUrl = (process.env.AI_BASE_URL ?? '').replace(/\/$/, '');
  const provider = process.env.AI_PROVIDER ?? AI_PROVIDER_KINDS[0];
  const model = process.env.AI_MODEL || DEFAULT_AI_MODEL;
  return {
    provider,
    baseUrl,
    model,
    visionModel: process.env.AI_VISION_MODEL || model,
    apiKey,
    // 上游 timeouts.analyze = 180000ms；我们保持同等容忍度，但改造为可配置
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 180_000),
  };
}

/** 是否已具备调用条件（缺任一即视为未配置 → 端点返回明确错误，不静默失败） */
export function isAiConfigured(config: AiConfig): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model);
}
