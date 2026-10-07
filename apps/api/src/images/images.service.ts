import { Injectable, Logger } from '@nestjs/common';

/**
 * 图片生成服务（2026-10-07 用户选定方案 B：每日成长卡卡面由图片模型生成）
 *
 * 供应商：SiliconFlow（`POST {IMAGE_BASE_URL}/images/generations`，模型 Kolors）
 * 环境变量（只从 .env / compose 读取，**绝不硬编码密钥**）：
 *   IMAGE_BASE_URL / IMAGE_API_KEY / IMAGE_MODEL / IMAGE_SIZE
 *
 * 关键约束（来自用户需求）：
 *  · 固定全局 Pixel RPG 风格提示词 + AI 生成的 imagePrompt 拼接
 *  · **不要文字、不要 UI、不要卡框、不要按钮、不要 Logo**；不要 3D／照片／现代扁平插画
 *  · image_size 默认 1024x576 —— 与卡框窗口 84%×48% ≈ 1.75:1 吻合，因此前端不会有空隙
 *  · 生成结果是**临时 URL（约 1 小时过期）**，必须立刻下载为二进制并落盘（交给 files 存储）
 */

/** 固定风格提示词：与项目现有 Pixel RPG 视觉保持一致 */
export const PIXEL_RPG_STYLE_PROMPT = [
  '16-bit pixel art',
  'retro RPG game style',
  'crisp square pixels, no anti-aliasing blur',
  'warm cozy color palette',
  'children adventure fantasy world',
  'healing and gentle atmosphere',
  'detailed but not overly complex',
  'consistent with a pixel RPG game UI',
  'no text',
  'no letters',
  'no watermark',
  'no UI',
  'no interface elements',
  'no frame',
  'no border',
  'no button',
  'no logo',
  'not 3D',
  'not photo',
  'not modern flat illustration',
].join(', ');

export interface GeneratedImage {
  buffer: Buffer;
  contentType: string;
  /** 记录生成参数，便于排查与复现 */
  meta: { model: string; size: string; prompt: string };
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_configured' | 'provider_error' | 'download_error' | 'empty_result',
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  private readonly baseUrl = (process.env.IMAGE_BASE_URL ?? '').replace(/\/+$/, '');
  private readonly apiKey = process.env.IMAGE_API_KEY ?? '';
  private readonly model = process.env.IMAGE_MODEL || 'Kwai-Kolors/Kolors';
  private readonly size = process.env.IMAGE_SIZE || '1024x576';

  /** 是否已配置（未配置时上层应走"图片待生成"分支，而不是报 500） */
  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  /**
   * 生成一张卡面插画并返回二进制。
   * @param imagePrompt AI 依据当天成长数据生成的场景描述（不含风格词）
   */
  async generateCardFace(imagePrompt: string): Promise<GeneratedImage> {
    if (!this.configured) {
      throw new ImageGenerationError('图片生成未配置（IMAGE_BASE_URL / IMAGE_API_KEY）', 'not_configured');
    }

    const prompt = `${PIXEL_RPG_STYLE_PROMPT}, ${imagePrompt}`.trim();
    const url = `${this.baseUrl}/images/generations`;

    let payload: unknown;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Enable-Watermark': '0',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          image_size: this.size,
          num_inference_steps: 20,
          guidance_scale: 7.5,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`图片接口返回 ${res.status}: ${text.slice(0, 200)}`);
        throw new ImageGenerationError(`图片接口返回 ${res.status}`, 'provider_error');
      }
      payload = await res.json();
    } catch (err) {
      if (err instanceof ImageGenerationError) throw err;
      this.logger.warn(`图片接口调用失败: ${(err as Error).message}`);
      throw new ImageGenerationError(`图片接口调用失败: ${(err as Error).message}`, 'provider_error');
    }

    const data = (payload as { data?: { url?: string }[] })?.data;
    const remoteUrl = data?.[0]?.url;
    if (!remoteUrl) {
      throw new ImageGenerationError('图片接口未返回 url', 'empty_result');
    }

    try {
      const imgRes = await fetch(remoteUrl);
      if (!imgRes.ok) throw new ImageGenerationError(`下载生成图失败 ${imgRes.status}`, 'download_error');
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) throw new ImageGenerationError('生成图为空', 'empty_result');
      return {
        buffer,
        contentType: imgRes.headers.get('content-type') ?? 'image/png',
        meta: { model: this.model, size: this.size, prompt },
      };
    } catch (err) {
      if (err instanceof ImageGenerationError) throw err;
      throw new ImageGenerationError(`下载生成图失败: ${(err as Error).message}`, 'download_error');
    }
  }
}
