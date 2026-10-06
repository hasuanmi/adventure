// 「今日成长卡」—— 儿童完成当天全部任务后领取的每日纪念卡（**不是考勤**）
//
// 产品口径（2026-10-06 用户明确）：
//  · 卡片结构固定：标题 → 像素图 → 一句话 → 领取按钮；**每天只变「图片」与「一句话」**；
//  · 只有当天任务 100% 完成才能领取，**每天最多一张**（业务规则沿用现有打卡记录表，不改规则）；
//  · 不出现"签退/打卡时间/考勤/打卡成功"等成人考勤表达。
//
// 这里只放**纯函数**（日期 → 图片序号 + 文案），不含任何 IO → Web / Mobile / 服务端都能复用。

/** 一句话文案（用户给定；按日期轮换，避免每天手写） */
export const GROWTH_CARD_COPIES = [
  '小小的坚持，也会变成很大的成长。',
  '今天走了一小步，你已经比昨天更厉害了。',
  '每一次认真完成，都是给未来自己的礼物。',
  '不必一下子走很远，坚持走下去就好。',
  '今天的努力，会在未来开出花来。',
  '勇敢的冒险者，又完成了一天的旅程。',
  '星星不会催你赶路，它只会陪你慢慢发光。',
  '每完成一个小目标，你都离自己的梦想更近一步。',
  '今天的冒险结束啦，勇敢的冒险者，明天继续出发！',
] as const;

/** 固定标题（不随日期变化） */
export const GROWTH_CARD_TITLE = '今日成长卡';

/** 可用卡片图数量（apps/web/public/cards/card-01..06.png；新增素材只需加图并改这里） */
export const GROWTH_CARD_IMAGE_COUNT = 6;

export interface GrowthCard {
  /** 距离 1970-01-01 的天数（稳定、与时区无关，仅用于轮换） */
  dayIndex: number;
  /** 图片序号（1 起，对应 card-XX.png） */
  imageNo: number;
  /** 当日一句话 */
  copy: string;
  /** 日期（YYYY-MM-DD） */
  date: string;
}

/** 由 YYYY-MM-DD 派生当天卡片（同一天恒等：图片与文案都不随刷新变化） */
export function growthCardOf(date: string): GrowthCard {
  const [y, m, d] = date.split('-').map(Number);
  const days = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
  const dayIndex = Number.isFinite(days) ? days : 0;
  const positive = ((dayIndex % 1_000_000) + 1_000_000) % 1_000_000;
  return {
    dayIndex,
    imageNo: (positive % GROWTH_CARD_IMAGE_COUNT) + 1,
    copy: GROWTH_CARD_COPIES[positive % GROWTH_CARD_COPIES.length],
    date,
  };
}
