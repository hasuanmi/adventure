import { api } from './client';

export interface GrowthCardDto {
  date: string;
  theme: string;
  title: string;
  message: string;
  imageUrl: string | null;
  status: string;
  generatedAt: string | null;
}

/**
 * 每日成长卡接口（2026-10-07 方案 B）：
 *  · getToday：**只读**，页面刷新走这里，绝不触发生成
 *  · claimToday：领取/生成（幂等，同日只生成一次）；regenerateImage=true 表示仅重试图片
 */
export const growthCardsApi = {
  async getToday(): Promise<GrowthCardDto | null> {
    const res = await api.get<{ card: GrowthCardDto | null }>('/growth-cards/today');
    return res.card;
  },
  async claimToday(regenerateImage = false): Promise<GrowthCardDto> {
    const res = await api.post<{ card: GrowthCardDto }>('/growth-cards/today', { regenerateImage });
    return res.card;
  },
};