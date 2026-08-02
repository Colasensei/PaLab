/**
 * 脑裂（部分轨道反转）辅助函数
 * 纯视觉机制：脑裂轨道判定线移到顶部、音符从底部反向上升；判定/判分不受影响。
 */
import { BrainSplitSection } from '@/types';

/** 脑裂段总覆盖时长（ms，重叠区间合并），供难度定级使用 */
export function getSplitCoverageMs(
  splits: BrainSplitSection[] | undefined | null,
  totalMs: number,
): number {
  if (!splits || splits.length === 0) return 0;
  const ranges = splits
    .filter(s => s.endTime >= 0 && s.startTime < totalMs)
    .map(s => [s.startTime, Math.min(s.endTime, totalMs)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let curEnd = -1;
  for (const [st, en] of ranges) {
    if (en <= curEnd) continue;
    if (st > curEnd) covered += en - st;
    else covered += en - curEnd;
    curEnd = en;
  }
  return covered;
}

/** 某轨道在某时刻是否处于脑裂（endTime = -1 视为进行中，永不结束） */
export function isTrackSplit(
  splits: BrainSplitSection[] | undefined | null,
  track: number,
  time: number,
): boolean {
  if (!splits) return false;
  for (const s of splits) {
    if (s.track !== track) continue;
    if (time < s.startTime) continue;
    if (s.endTime >= 0 && time >= s.endTime) continue;
    return true;
  }
  return false;
}

/** 某轨道当前脑裂段的起始时间；不在脑裂中返回 -1 */
export function getSplitStart(
  splits: BrainSplitSection[] | undefined | null,
  track: number,
  time: number,
): number {
  if (!splits) return -1;
  for (const s of splits) {
    if (s.track !== track) continue;
    if (time < s.startTime) continue;
    if (s.endTime >= 0 && time >= s.endTime) continue;
    return s.startTime;
  }
  return -1;
}

/** 归一化脑裂段（结束时间早于开始则丢弃；进行中 endTime=-1 保留），保证 id 连续 */
export function normalizeSplits(splits: BrainSplitSection[]): BrainSplitSection[] {
  let id = 0;
  const out: BrainSplitSection[] = [];
  for (const s of splits) {
    if (s.startTime < 0) continue;
    if (s.endTime >= 0 && s.endTime <= s.startTime) continue;
    out.push({ ...s, id: id++ });
  }
  return out;
}
