/**
 * 手动谱面分析器
 *
 * 流程：
 * 1. 节拍对齐 — 将用户录入的音符吸附到最近的 BPM 节拍网格
 * 2. 双（多）押识别 — 时间相近的音符标记为多押
 * 3. 难度评定 — 基于物量、密度、Hold 比例等自动计算定数
 */

import { Note, TrackCount, BrainSplitSection, constantToDifficulty } from '@/types';
import { getSplitCoverageMs } from './brainSplit';
import { BpmTimeline, BpmChange } from './bpmMap';

export interface AnalysisResult {
  notes: Note[];
  chartConstant: number;
  difficulty: string;
}

export interface AnalysisOptions {
  /** 跳过节拍对齐 */
  skipAlign?: boolean;
  /** 跳过双押识别 */
  skipDouble?: boolean;
}

/**
 * 节拍对齐
 * 将音符对齐到最近的节拍网格，超出阈值的不对齐
 */
export function alignToBeat(
  inputs: Note[],
  bpm: number,
  maxDeviationMs?: number,
  subDiv: number = 2, // 每拍细分：2=半拍（默认），4=1/4 拍，8=1/8 拍
  bpmChanges?: BpmChange[], // 变速段：给了就按分段积分后的节拍网格对齐
): Note[] {
  const beatInterval = 60000 / bpm;
  // 默认允许偏差 1/3 拍，再大就离谱了（
  const maxDev = maxDeviationMs ?? beatInterval * 0.38;

  // 节拍网格，subDiv 决定精度（
  const subBeat = beatInterval / subDiv;

  // 有变速时，网格位置必须走分段积分（timeToBeat / beatToTime），
  // 不能再用「时间除以 subBeat」——那样跨段处会整体错拍。
  // 没有变速时 BpmTimeline 退化成线性映射，结果和旧公式完全一致。
  const tl = bpmChanges && bpmChanges.length > 0 ? new BpmTimeline(bpm, bpmChanges) : null;

  return inputs.map(note => {
    // 找最近的 sub-beat
    const nearestBeat = tl
      ? tl.beatToTime(Math.round(tl.timeToBeat(note.startTime) * subDiv) / subDiv)
      : Math.round(note.startTime / subBeat) * subBeat;
    const startDev = Math.abs(note.startTime - nearestBeat);

    if (startDev <= maxDev) {
      const offset = nearestBeat - note.startTime;
      return {
        ...note,
        startTime: nearestBeat,
        endTime: note.type === 'hold' ? note.endTime + offset : nearestBeat,
      };
    }
    return note;
  });
}

/**
 * 双（多）押识别
 * 时间差 ≤ windowMs 且在不同轨道上的多个音符视为一组多押
 */
export function detectDoubles(notes: Note[], windowMs: number = 35): Note[] {
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  let doubleGroupId = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].doubleGroupId !== null) continue;

    const group: number[] = [i];
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].doubleGroupId !== null) continue;
      if (sorted[j].startTime - sorted[i].startTime > windowMs) break;
      // 同轨不算多押，那叫连打（
      if (sorted[j].track === sorted[i].track) continue;
      group.push(j);
    }

    if (group.length >= 2) {
      const gid = doubleGroupId++;
      for (const idx of group) {
        sorted[idx] = { ...sorted[idx], isDouble: true, doubleGroupId: gid };
      }
    }
  }

  return sorted;
}

// 扫一遍全谱，把漏标的、标错的、只标一半的 n 押全修好
// 别问为什么 35ms，问就是实测好用（
export function ensureDoubleGroups(notes: Note[], windowMs: number = 35): Note[] {
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  let nextGid = 1;
  for (const n of sorted) {
    if (n.doubleGroupId != null && n.doubleGroupId !== 0 && n.doubleGroupId >= nextGid) {
      nextGid = n.doubleGroupId + 1;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const group: number[] = [i];
    const seenTracks = new Set<number>([sorted[i].track]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].startTime - sorted[i].startTime > windowMs) break;
      if (seenTracks.has(sorted[j].track)) continue;
      seenTracks.add(sorted[j].track);
      group.push(j);
    }

    if (group.length >= 2) {
      // 看看组里有没有人已经标了，有就跟着用（别问为什么排除 0
      let gid: number | null = null;
      for (const idx of group) {
        const dg = sorted[idx].doubleGroupId;
        if (dg != null && dg !== 0) { gid = dg; break; }
      }
      if (gid === null) gid = nextGid++;

      for (const idx of group) {
        if (!sorted[idx].isDouble || sorted[idx].doubleGroupId !== gid) {
          sorted[idx] = { ...sorted[idx], isDouble: true, doubleGroupId: gid };
        }
      }

      i = group[group.length - 1];
    }
  }

  return sorted;
}

/**
 * NPS → 基础定数（对标 Phigros 实际密度曲线）
 *
 *   NPS 0.5 → ~2 (EZ)     NPS 1 → ~3     NPS 2 → ~5.5
 *   NPS 3   → ~8 (HD)     NPS 4 → ~9.8   NPS 5 → ~11.5 (IN)
 *   NPS 6   → ~13         NPS 7 → ~14.5  NPS 8 → ~16
 *   NPS 10  → ~18.4       NPS 12 → ~20.8 NPS 15 → ~24.4
 *   NPS 17  → ~26.8       NPS 20 → ~30.4（再往上由 softCapConstant 压到软天花板）
 *
 * 注意 8 以上这一段：旧版是 `16 + min(9, nps-8)`，NPS 17 就封顶 25，
 * 结果所有高密度谱面（尤其 osu! 转来的）全挤在 25 分不出来。
 * 现在改成继续线性外推，把 25~30 这段空间还给真正难的谱。
 */
export function npsToConstant(nps: number): number {
  if (nps <= 0) return 0;
  if (nps <= 1.0) return 1.0 + nps * 2.0;                    // NPS 0→1, 1→3
  if (nps <= 3.0) return 3.0 + (nps - 1.0) * 2.5;            // NPS 1→3, 3→8
  if (nps <= 5.0) return 8.0 + (nps - 3.0) * 1.75;           // NPS 3→8, 5→11.5
  if (nps <= 8.0) return 11.5 + (nps - 5.0) * 1.5;           // NPS 5→11.5, 8→16
  return 16.0 + (nps - 8.0) * 1.2;                            // NPS 8→16, 17→26.8, 20→30.4
}

/** 定数 → 期望 NPS（npsToConstant 的逆函数，供生成器校准用） */
export function constantToNps(c: number): number {
  if (c <= 3.0) return Math.max(0, (c - 1.0) / 2.0);
  if (c <= 8.0) return 1.0 + (c - 3.0) / 2.5;
  if (c <= 11.5) return 3.0 + (c - 8.0) / 1.75;
  if (c <= 16.0) return 5.0 + (c - 11.5) / 1.5;
  return 8.0 + (c - 16.0) / 1.2;                              // 16→8, 26.8→17
}

/**
 * 定数软天花板
 *
 * 定数区间对外是 0.0 ~ 30.0，但**30.0 是不可达的**：
 * 26 以下原样返回（完全线性），26 以上用 tanh 平滑压向 30，
 * 最后再兜一刀 29.5。这样：
 *   - 再难的谱也只会停在 29.0~29.5，永远不会出现"人人 29.9"
 *   - 也不会像旧版那样在 25 处硬封顶，把所有高难谱压成同一个数
 * 反推：要到 29.5 需要原始值 ≥ 40（约 NPS 28），现实里不存在。
 */
export const CONST_SOFT_KNEE = 26.0;
export const CONST_SOFT_MAX = 29.5;

export function softCapConstant(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw <= CONST_SOFT_KNEE) return Math.max(0, raw);
  const span = 30.0 - CONST_SOFT_KNEE;                       // 4
  const v = CONST_SOFT_KNEE + span * Math.tanh((raw - CONST_SOFT_KNEE) / span);
  return Math.min(CONST_SOFT_MAX, v);
}

/**
 * 难度自动评定
 *
 * 基于以下指标映射到 chartConstant (0.0~30.0，30 不可达，软天花板 29.5)，与自动生成器保持一致：
 * - NPS (notes per second)：总物量 / 时长（主指标，对标 Phigros）
 * - 双押比例：多押音符数 / 总音符数（读谱/协调加成）
 * - Hold 比例：Hold 音符数 / 总音符数
 * - 最大 NPS（峰值密度，爆发加成）
 */
export function estimateDifficulty(notes: Note[], durationMs: number, trackCount: number, splits?: BrainSplitSection[]): number {
  if (notes.length === 0 || durationMs <= 0) return 1.0;

  const durationSec = durationMs / 1000;
  const totalNotes = notes.length;
  const holdCount = notes.filter(n => n.type === 'hold').length;
  const doubleCount = notes.filter(n => n.isDouble).length;

  // NPS，每秒敲几个（
  const nps = totalNotes / durationSec;

  // 每秒窗口峰值 NPS，看看最密那秒有多疯（
  let maxWindowNps = 0;
  const windowMs = 1000;
  const sortedByTime = [...notes].sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < sortedByTime.length; i++) {
    let count = 1;
    for (let j = i + 1; j < sortedByTime.length; j++) {
      if (sortedByTime[j].startTime - sortedByTime[i].startTime <= windowMs) {
        count++;
      } else break;
    }
    if (count > maxWindowNps) maxWindowNps = count;
  }

  // 双押率
  const doubleRatio = totalNotes > 0 ? doubleCount / totalNotes : 0;
  // hold 率
  const holdRatio = totalNotes > 0 ? holdCount / totalNotes : 0;

  // 轨道补偿：4K 基准，轨少→单轨更密→略难；轨多→略降
  const trackFactor = Math.pow(4 / Math.max(2, trackCount), 0.25);

  // NPS → 基础定数
  let baseScore = npsToConstant(nps);
  baseScore *= trackFactor;

  // 双押 +0~1.2（协调/读谱）
  const doubleBonus = doubleRatio * 1.2;

  // hold +0~0.6
  const holdBonus = holdRatio * 0.6;

  // 峰值 +0~2.0（极限爆发）。旧版这条没有上限，密集谱面能白送 8 分，是"难谱全部爆表"的元凶之一
  const peakBonus = Math.min(2.0, Math.max(0, (maxWindowNps - 8) * 0.25));

  // 脑裂加成：脑裂覆盖率 × 大幅加成（上限 +2.0），脑裂显著提升读谱/协调难度
  let splitBonus = 0;
  if (splits && splits.length > 0) {
    const covered = getSplitCoverageMs(splits, durationMs);
    splitBonus = Math.min(2.0, (covered / Math.max(1, durationMs)) * 4.0);
  }

  // 校准：分析整体略偏高，统一 ×0.93（实际难度通常比分析低）
  const finalScore = (baseScore + doubleBonus + holdBonus + peakBonus + splitBonus) * 0.93;

  // 软天花板：0~30 的尺度，30 不可达（26 以下线性，26 以上平滑压向 29.5）
  return Math.round(softCapConstant(Math.max(0, finalScore)) * 10) / 10;
}

/**
 * 完整分析流程
 */
export function analyzeManualNotes(
  rawNotes: Note[],
  bpm: number,
  durationMs: number,
  trackCount: TrackCount,
  options?: AnalysisOptions,
  splits?: BrainSplitSection[],
): AnalysisResult {
  let notes = [...rawNotes];

  // 1. 节拍对齐
  if (!options?.skipAlign) {
    notes = alignToBeat(notes, bpm);
  }

  // 2. 排序去重
  notes.sort((a, b) => a.startTime - b.startTime);
  let noteId = 0;
  notes = notes.map(n => ({ ...n, id: noteId++ }));

  // 3. 双押识别
  if (!options?.skipDouble) {
    notes = detectDoubles(notes);
  }

  // 4. 定数
  const chartConstant = estimateDifficulty(notes, durationMs, trackCount as number, splits);
  const difficulty = constantToDifficulty(chartConstant);

  return { notes, chartConstant, difficulty };
}
