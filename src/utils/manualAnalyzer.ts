/**
 * 手动谱面分析器
 *
 * 流程：
 * 1. 节拍对齐 — 将用户录入的音符吸附到最近的 BPM 节拍网格
 * 2. 双（多）押识别 — 时间相近的音符标记为多押
 * 3. 难度评定 — 基于物量、密度、Hold 比例等自动计算定数
 */

import { Note, TrackCount, constantToDifficulty } from '@/types';

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
): Note[] {
  const beatInterval = 60000 / bpm;
  // 默认允许偏差 1/3 拍，再大就离谱了（
  const maxDev = maxDeviationMs ?? beatInterval * 0.38;

  // 半拍网格，八分音符精度（
  const subBeat = beatInterval / 2;

  return inputs.map(note => {
    // 找最近的 sub-beat
    const nearestBeat = Math.round(note.startTime / subBeat) * subBeat;
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
 * 难度自动评定
 *
 * 基于以下指标映射到 chartConstant (1.0~18.0)：
 * - NPS (notes per second)：总物量 / 时长
 * - 双押比例：多押音符数 / 总音符数
 * - Hold 比例：Hold 音符数 / 总音符数
 * - 最大 NPS（峰值密度）
 */
export function estimateDifficulty(notes: Note[], durationMs: number, trackCount: number): number {
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

  // 轨道补偿：以 4K 为基准
  const trackFactor = 4 / Math.max(2, trackCount);

  // NPS → 基础定数
  // Low: NPS 1.0 → ~3, Mid: NPS 3.0 → ~9, High: NPS 6.0 → ~14
  let baseScore = 0;
  if (nps <= 1.5) {
    baseScore = 1.0 + (nps / 1.5) * 7.0; // 1.0~8.0
  } else if (nps <= 5.0) {
    baseScore = 8.0 + ((nps - 1.5) / 3.5) * 8.0; // 8.0~16.0
  } else {
    baseScore = 16.0 + Math.min(1, (nps - 5.0) / 2.0) * 2.0; // 16.0~18.0
  }

  // 轨道补偿，别让多轨欺负少轨（
  baseScore *= trackFactor;

  // 双押 +0~2
  const doubleBonus = doubleRatio * 2.0;

  // hold +0~1
  const holdBonus = holdRatio * 1.0;

  // 峰值 +0~2
  const peakBonus = Math.max(0, (maxWindowNps - 6) * 0.25);

  let finalScore = baseScore + doubleBonus + holdBonus + peakBonus;

  // 夹一夹别爆了（
  finalScore = Math.max(1.0, Math.min(18.0, finalScore));
  return Math.round(finalScore * 10) / 10;
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
  const chartConstant = estimateDifficulty(notes, durationMs, trackCount as number);
  const difficulty = constantToDifficulty(chartConstant);

  return { notes, chartConstant, difficulty };
}
