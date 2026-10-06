// 时间重叠与日历车道打包（**纯函数**：只吃"当天分钟数"，不碰日期/时区/框架 → Web 与 Mobile 共用）
//
// 产品决策（2026-10-06 用户要求）：**允许**时间重叠（家庭场景常见，例如两件事并行），
// 但 ① 日程上必须**并排展示**（不能互相遮挡）② 必须**明确显示冲突** ③ 创建/编辑时给出冲突提示。
// 因此这里只提供判定与打包，不做"阻止保存"（是否阻止属产品策略，不放进契约层）。

export interface MinuteRange {
  id: string;
  /** 当天分钟数（如 09:30 → 570） */
  start: number;
  /** 当天分钟数（结束） */
  end: number;
  /** 可选标题，供提示文案使用 */
  title?: string;
}

export function overlapMinutes(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start);
}

/** 两个区间是否真重叠（首尾相接不算） */
export function isOverlapping(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return overlapMinutes(a, b) > 0;
}

/** 与 target 重叠的其它区间（创建/编辑时的冲突提示用） */
export function findOverlaps(
  target: { start: number; end: number },
  others: MinuteRange[],
): MinuteRange[] {
  return others.filter((o) => o.id && isOverlapping(target, o));
}

export interface LaneAssignment {
  id: string;
  /** 车道序号（0 起） */
  lane: number;
  /** 该连通组内共占几条车道；>1 即"该时段存在重叠" */
  laneCount: number;
}

/**
 * 车道打包：把重叠的区间分到不同车道，互不重叠的区间复用车道（区间图贪心着色）。
 * 返回每条的 lane 与所在连通组的 laneCount —— 渲染层据此并排显示并标记冲突。
 */
export function assignLanes(items: MinuteRange[]): LaneAssignment[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const out: LaneAssignment[] = [];
  let cluster: MinuteRange[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = (): void => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[lane] = it.end;
      }
      laneOf.set(it.id, lane);
    }
    for (const it of cluster) out.push({ id: it.id, lane: laneOf.get(it.id) ?? 0, laneCount: laneEnds.length });
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const it of sorted) {
    // 与当前连通组完全不重叠（起始 >= 组内最大结束）→ 收束本组，重新开一组
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

/** 某条区间是否与同组其它区间重叠（即 laneCount > 1 的组内成员） */
export function isConflicting(assignment: LaneAssignment): boolean {
  return assignment.laneCount > 1;
}
