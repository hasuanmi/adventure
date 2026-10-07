import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImagesService, ImageGenerationError } from '../images/images.service';
import { FilesService } from '../files/files.service';

/**
 * 每日成长卡生成服务（2026-10-07 用户方案 B）
 *
 * 流程（严格按用户需求）：
 *  1) 幂等：当天已有记录 -> 直接返回历史（**刷新页面不重新生成**）
 *  2) 采集当天数据（只读，不改任何业务逻辑）：完成数 / 学习类任务 / 预计时长 / 今日 XP / 连续天数 / 特殊任务
 *  3) 主题判定（确定性）：特殊任务 > 大量学习 > 连续冒险 > 普通完成
 *  4) 文本生成（AI）-> **服务端强校验**（title 4~10 字、message 15~30 字、禁说教表达）-> 不合规用**内置备用**
 *  5) 图片生成（ImagesService）-> 失败**不产出半成品**：保留文本结果，status=image_pending，
 *     前端提示「成长卡正在准备中，请稍后再试」，并提供重试（**不重复扣记录**）
 */
export const GROWTH_CARD_THEMES = [
  '冒险',
  '坚持',
  '勇气',
  '探索',
  '成长',
  '不怕犯错',
  '陪伴',
  '小小成就',
  '宝藏',
  '发光',
] as const;
export type GrowthCardTheme = (typeof GROWTH_CARD_THEMES)[number];

export const GROWTH_CARD_STATUS = {
  READY: 'ready',
  TEXT_READY_IMAGE_PENDING: 'text_ready_image_pending',
} as const;

/** 内置备用文案（文本生成失败 / 校验不通过时使用）——同样是 RPG 成就口吻，不说教 */
const FALLBACK: Record<GrowthCardTheme, { title: string; message: string; scene: string }> = {
  冒险: { title: '出发吧小冒险家', message: '今天的路你一步一步走过来了，真好。', scene: 'a small hero setting off on a winding forest path at sunrise' },
  坚持: { title: '坚持的脚印', message: '你没有停下，脚印一直延伸向远方。', scene: 'a trail of small footprints leading up a gentle hill' },
  勇气: { title: '小小勇气', message: '你迈出的那一步，比想象中更有力量。', scene: 'a tiny hero facing a wide river with a wooden bridge' },
  探索: { title: '发现新大陆', message: '今天你多认识了一点点这个世界。', scene: 'a misty valley with a waterfall and hidden ruins' },
  成长: { title: '又长高一点', message: '悄悄变化的你，自己也许还没发现。', scene: 'a young sprout growing beside a big old tree' },
  不怕犯错: { title: '再来一次的勇气', message: '跌倒也很有趣，因为你又站起来啦。', scene: 'a cheerful hero brushing off dust on a grassy hill' },
  陪伴: { title: '有人陪着你', message: '有人和你一起走，路就变得轻快。', scene: 'two tiny friends walking together under warm evening light' },
  小小成就: { title: '小小成就', message: '一件小事做成了，值得记下来。', scene: 'a small treasure chest glowing softly in a meadow' },
  宝藏: { title: '今日宝藏', message: '最珍贵的东西，是你今天认真过的样子。', scene: 'a hidden treasure glowing between mossy rocks' },
  发光: { title: '闪闪发光的你', message: '你努力的时候，是会发光的呀。', scene: 'a hero surrounded by warm fireflies at dusk' },
};

/** 学习类任务类型（用于"大量学习"判定；与任务类型改造保持一致） */
const STUDY_TYPES = ['TYPE_SCIENCE_HUMANITIES', 'TYPE_DAILY'];
const BOUNTY_TYPE = 'TYPE_BOUNTY';

export interface GrowthCardDto {
  date: string;
  theme: string;
  title: string;
  message: string;
  imageUrl: string | null;
  status: string;
  generatedAt: string | null;
}

@Injectable()
export class GrowthCardService {
  private readonly logger = new Logger(GrowthCardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagesService,
    private readonly files: FilesService,
  ) {}

  /** 本地日期（YYYY-MM-DD）；成长卡按"自然日"归属 */
  private today(): { iso: string; date: Date } {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return { iso, date: new Date(`${iso}T00:00:00.000Z`) };
  }

  /** 采集当天成长数据（只读） */
  private async collect(userId: string) {
    const { date } = this.today();
    const dayStart = new Date(date);
    const dayEnd = new Date(date.getTime() + 24 * 3600 * 1000);

    const [completedToday, studyTasks, bountyDone, grants, attendances] = await Promise.all([
      this.prisma.task.count({
        where: { childId: userId, status: 'completed', deletedAt: null },
      }),
      this.prisma.task.findMany({
        where: { childId: userId, deletedAt: null, rewardProfile: { in: STUDY_TYPES } },
        select: { estimatedMinutes: true },
      }),
      this.prisma.task.count({
        where: { childId: userId, status: 'completed', deletedAt: null, rewardProfile: BOUNTY_TYPE },
      }),
      this.prisma.rewardGrant.findMany({
        where: { userId, grantedAt: { gte: dayStart, lt: dayEnd } },
        select: { xp: true },
      }),
      this.prisma.attendance.findMany({
        where: { userId },
        select: { attendanceDate: true },
        orderBy: { attendanceDate: 'desc' },
        take: 60,
      }),
    ]);

    const studyMinutes = studyTasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);
    const xpToday = grants.reduce((sum, g) => sum + Number(g.xp ?? 0), 0);

    // 连续冒险天数（含今天）
    let streak = 0;
    const days = new Set(attendances.map((a) => new Date(a.attendanceDate).toISOString().slice(0, 10)));
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(date.getTime() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      if (days.has(d)) streak += 1;
      else if (i > 0) break;
    }

    return { completedToday, studyMinutes, xpToday, streak, bountyDone };
  }

  /** 主题判定：特殊任务 > 大量学习 > 连续冒险 > 普通完成 */
  private decideTheme(d: { studyMinutes: number; streak: number; bountyDone: number; completedToday: number }): GrowthCardTheme {
    if (d.bountyDone > 0) return '宝藏';
    if (d.studyMinutes >= 60) return '探索';
    if (d.streak >= 3) return '坚持';
    if (d.completedToday >= 5) return '成长';
    const pool: GrowthCardTheme[] = ['冒险', '勇气', '小小成就', '发光', '陪伴', '不怕犯错'];
    return pool[d.completedToday % pool.length];
  }

  /** 文本生成（走 AI 环境变量；失败返回 null，由调用方用内置备用文案） */
  private async generateText(
    theme: GrowthCardTheme,
    data: { completedToday: number; studyMinutes: number; xpToday: number; streak: number; bountyDone: number },
  ): Promise<{ title: string; message: string; imagePrompt: string } | null> {
    const baseUrl = (process.env.AI_BASE_URL ?? '').replace(/\/+$/, '');
    const apiKey = process.env.AI_API_KEY ?? '';
    const model = process.env.AI_MODEL ?? '';
    if (!baseUrl || !apiKey || !model) return null;

    const system =
      '你为儿童成长冒险游戏生成"每日成长卡"文案。只输出 JSON，不要解释、不要 markdown。' +
      'title 为 4~10 个中文字符，像 RPG 成就标题；message 为 15~30 个中文字符，温暖鼓励、面向儿童、不说教、' +
      '不得出现"你必须""你应该""学习成果""今日学习总结"等机械或施压表达；' +
      'imagePrompt 用英文描述一幅 16-bit 像素风格的儿童冒险场景插画（不含文字/UI/卡框/按钮/Logo）。';
    const user =
      `今日数据：完成任务 ${data.completedToday} 个；学习类任务预计共 ${data.studyMinutes} 分钟；` +
      `获得 XP ${data.xpToday}；连续冒险 ${data.streak} 天；特殊任务 ${data.bountyDone} 个。` +
      `主题：${theme}。请输出 JSON：{"theme","title","message","imagePrompt"}`;

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.9,
          max_tokens: Number(process.env.AI_MAX_TOKENS ?? 4096),
        }),
      });
      if (!res.ok) {
        this.logger.warn(`文本生成失败 ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as { title?: string; message?: string; imagePrompt?: string };
      const title = (parsed.title ?? '').trim();
      const message = (parsed.message ?? '').trim();
      const imagePrompt = (parsed.imagePrompt ?? '').trim();
      if (!this.validTitle(title) || !this.validMessage(message) || imagePrompt.length < 10) return null;
      return { title, message, imagePrompt };
    } catch (err) {
      this.logger.warn(`文本生成异常：${(err as Error).message}`);
      return null;
    }
  }

  private validTitle(t: string): boolean {
    return t.length >= 4 && t.length <= 10 && !/学习成果|今日学习总结|你应该|你必须/.test(t);
  }

  private validMessage(m: string): boolean {
    return m.length >= 15 && m.length <= 30 && !/你应该|你必须|学习成果|今日学习总结/.test(m);
  }

  private toDto(row: {
    cardDate: Date;
    theme: string;
    title: string;
    message: string;
    imageUrl: string | null;
    status: string;
    generatedAt: Date | null;
  }): GrowthCardDto {
    return {
      date: new Date(row.cardDate).toISOString().slice(0, 10),
      theme: row.theme,
      title: row.title,
      message: row.message,
      imageUrl: row.imageUrl,
      status: row.status,
      generatedAt: row.generatedAt ? new Date(row.generatedAt).toISOString() : null,
    };
  }

  /** 读取当天成长卡（不生成） */
  async getToday(userId: string): Promise<GrowthCardDto | null> {
    const { date } = this.today();
    const row = await this.prisma.growthCard.findUnique({
      where: { userId_cardDate: { userId, cardDate: date } },
    });
    return row ? this.toDto(row) : null;
  }

  /**
   * 领取/生成今天的成长卡（幂等）。
   * @param regenerateImage 仅重试图片（文本沿用已保存结果，不重新生成、不重复扣记录）
   */
  async claimToday(userId: string, familyId: string, regenerateImage = false): Promise<GrowthCardDto> {
    const actor = { sub: userId, familyId, role: 'child' };
    const { date } = this.today();
    const existing = await this.prisma.growthCard.findUnique({
      where: { userId_cardDate: { userId, cardDate: date } },
    });

    // 已存在且无需重试图片 -> 直接返回历史（刷新页面不会重新生成）
    if (existing && !(regenerateImage && existing.status === GROWTH_CARD_STATUS.TEXT_READY_IMAGE_PENDING)) {
      return this.toDto(existing);
    }

    let theme: GrowthCardTheme;
    let title: string;
    let message: string;
    let imagePrompt: string;

    if (existing && regenerateImage) {
      theme = existing.theme as GrowthCardTheme;
      title = existing.title;
      message = existing.message;
      imagePrompt = existing.imagePrompt ?? FALLBACK[theme].scene;
    } else {
      const data = await this.collect(userId);
      theme = this.decideTheme(data);
      const ai = await this.generateText(theme, data);
      const fb = FALLBACK[theme];
      title = ai?.title ?? fb.title;
      message = ai?.message ?? fb.message;
      imagePrompt = ai?.imagePrompt ?? fb.scene;
    }

    // 先生成图片：失败则不产出半成品（保留文本，status=image_pending，可重试）
    let imageUrl: string | null = existing?.imageUrl ?? null;
    let status: string = GROWTH_CARD_STATUS.TEXT_READY_IMAGE_PENDING;
    try {
      const img = await this.images.generateCardFace(imagePrompt);
      const saved = await this.saveImage(actor, userId, date, img.buffer, img.contentType);
      imageUrl = saved;
      status = GROWTH_CARD_STATUS.READY;
    } catch (err) {
      const reason = err instanceof ImageGenerationError ? err.reason : 'internal_error';
      this.logger.warn(`图片落盘/生成异常: ${(err as Error).message}`);
      this.logger.warn(`成长卡图片未生成（${reason}）：保留文本结果，等待重试`);
    }

    const payload = {
      familyId,
      userId,
      cardDate: date,
      theme,
      title,
      message,
      imagePrompt,
      imageUrl,
      status,
      generatedAt: new Date(),
    };
    const row = await this.prisma.growthCard.upsert({
      where: { userId_cardDate: { userId, cardDate: date } },
      create: payload,
      update: { theme, title, message, imagePrompt, imageUrl, status, generatedAt: new Date() },
    });
    return this.toDto(row);
  }

  /** 落盘生成图：直接复用 FilesService（同一存储布局与鉴权读取 URL /api/files?key=...） */
  private async saveImage(
    actor: { sub: string; familyId: string | null; role: string },
    userId: string,
    date: Date,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const stored = await this.files.save(actor as never, 'growth-card', {
      buffer,
      size: buffer.length,
      mimetype: contentType && contentType.startsWith('image/') ? contentType.split(';')[0].trim() : 'image/png',
      originalname: `growth-card-${userId}-${date.toISOString().slice(0, 10)}`,
    } as never);
    return stored.url;
  }}
