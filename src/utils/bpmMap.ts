/**
 * BPM 时间轴 —— 变速下的「时间 ↔ 节拍」映射
 *
 * 变速点的语义和音乐软件一致：**一个时间点 + 一个新 BPM**，
 * 从该点开始一直生效，直到下一个变速点。没有"结束时间"这回事，
 * 想回到原速就在那个时间点再写一个等于基准 BPM 的变速点。
 *
 * 传统做法是 `beat = time * bpm / 60`，只有一个 BPM 才成立。
 * 变速之后节拍必须**逐段积分**：每段里节拍按该段 BPM 前进，跨段时累积量不能重置，
 * 否则音符会整体错位。
 *
 * `bpmChanges` 为空 / 未定义 → 退化成单 BPM 的线性映射，和旧版完全一致（向后兼容）。
 */

export interface BpmChange {
  /** 变速发生的时刻（ms） */
  time: number;
  /** 从这一刻起生效的 BPM */
  bpm: number;
}

export const MIN_BPM = 10;
export const MAX_BPM = 1200;

function clampBpm(v: number): number {
  if (!Number.isFinite(v)) return 120;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, v));
}

/** 时间轴上的一个拐点：从 t 开始，节拍为 beat，BPM 为 bpm */
interface Breakpoint {
  t: number;
  beat: number;
  bpm: number;
}

export class BpmTimeline {
  readonly baseBpm: number;
  private bp: Breakpoint[] = [];
  /**
   * 拍 0 落在哪个音频时刻（ms）。
   * 绝大多数谱面是 0；Malody 谱面带 `offset` 时拍 0 不在音频起点，
   * 有了这个值，导入进来的音符才仍然落在整数拍上、吸附不会错位。
   */
  readonly origin: number;

  constructor(baseBpm: number, changes?: BpmChange[] | null, originMs = 0) {
    this.baseBpm = clampBpm(baseBpm || 120);
    this.origin = Number.isFinite(originMs) ? originMs : 0;

    // 1) 收集变速点：同一时刻写多次时后写的覆盖前面的
    const byTime = new Map<number, number>();
    for (const c of changes || []) {
      if (!c || !Number.isFinite(c.time) || !Number.isFinite(c.bpm)) continue;
      const t = Math.max(0, Math.round(c.time));
      byTime.set(t, clampBpm(c.bpm));
    }

    // 2) 起点（0ms）的 BPM：有 0 时刻的变速就用它，否则用基准
    let startBpm = this.baseBpm;
    if (byTime.has(0)) startBpm = byTime.get(0)!;
    this.bp = [{ t: 0, beat: 0, bpm: startBpm }];

    // 3) 按时间顺序逐段积分：每个拐点的节拍 = 上一拐点节拍 + 期间时长 × 上一段 BPM
    const times = [...byTime.keys()].filter(t => t > 0).sort((a, b) => a - b);
    for (const t of times) {
      const prev = this.bp[this.bp.length - 1];
      const bpm = byTime.get(t)!;
      this.bp.push({
        t,
        beat: prev.beat + ((t - prev.t) / 1000) * (prev.bpm / 60),
        bpm,
      });
    }
  }

  /** 是否有变速（没有就说明可以直接用线性公式） */
  get hasChanges(): boolean {
    return this.bp.length > 1 || this.bp[0].bpm !== this.baseBpm;
  }

  /** 展开成区间列表（供编辑器展示，末段的 endTime 用最后一个拐点的时间） */
  get segments(): { startTime: number; endTime: number; bpm: number; startBeat: number; endBeat: number }[] {
    const out: { startTime: number; endTime: number; bpm: number; startBeat: number; endBeat: number }[] = [];
    for (let i = 0; i < this.bp.length; i++) {
      const cur = this.bp[i];
      const next = this.bp[i + 1];
      out.push({
        startTime: cur.t + this.origin,
        endTime: next ? next.t + this.origin : cur.t + this.origin,
        bpm: cur.bpm,
        startBeat: cur.beat,
        endBeat: next ? next.beat : cur.beat,
      });
    }
    return out;
  }

  /** 某个时间点的 BPM */
  bpmAt(timeMs: number): number {
    const seg = this.findByTime(Math.max(0, timeMs - this.origin));
    return seg ? seg.bpm : this.baseBpm;
  }

  /** 时间(ms) → 节拍（可为小数；负时间按起始段外推） */
  timeToBeat(timeMs: number): number {
    if (!Number.isFinite(timeMs)) return 0;
    const rel = timeMs - this.origin;
    const seg = this.findByTime(rel);
    if (!seg) return (rel / 1000) * (this.bp[0].bpm / 60);
    return seg.beat + ((rel - seg.t) / 1000) * (seg.bpm / 60);
  }

  /** 节拍 → 时间(ms) */
  beatToTime(beat: number): number {
    if (!Number.isFinite(beat)) return 0;
    const seg = this.findByBeat(beat);
    const rel = seg
      ? seg.t + ((beat - seg.beat) * 60 / seg.bpm) * 1000
      : (beat * 60 / this.bp[0].bpm) * 1000;
    return rel + this.origin;
  }

  /** 二分找包含该时间的段 */
  private findByTime(t: number): Breakpoint | null {
    const bp = this.bp;
    if (bp.length === 0) return null;
    if (t < bp[0].t) return null;
    let lo = 0, hi = bp.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bp[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    return bp[lo];
  }

  /** 二分找包含该节拍的段 */
  private findByBeat(beat: number): Breakpoint | null {
    const bp = this.bp;
    if (bp.length === 0) return null;
    if (beat < bp[0].beat) return null;
    let lo = 0, hi = bp.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bp[mid].beat <= beat) lo = mid; else hi = mid - 1;
    }
    return bp[lo];
  }

  /**
   * 生成 [fromTime, toTime] 窗口里的节拍线。
   * @param step 每条线之间的节拍数（1 = 一拍，0.5 = 半拍，0.25 = 1/4 拍）
   * @param beatsPerMeasure 每小节几拍（用来标强拍和小节号）
   */
  beatLines(
    fromTime: number,
    toTime: number,
    step: number,
    beatsPerMeasure = 4,
  ): { beat: number; timeSec: number; strong: boolean; measure: number }[] {
    const out: { beat: number; timeSec: number; strong: boolean; measure: number }[] = [];
    if (!(step > 0) || toTime <= fromTime) return out;

    const startBeat = Math.floor(this.timeToBeat(fromTime) / step) * step;
    const endBeat = this.timeToBeat(toTime);

    const maxLines = 20000;   // 异常窗口的保护，别死循环
    let guard = 0;
    for (let b = startBeat; b <= endBeat + step * 0.5; b += step) {
      if (++guard > maxLines) break;
      const beat = Math.round(b / step) * step;
      const t = this.beatToTime(beat);
      if (t < fromTime - 1 || t > toTime + 1) continue;
      const measure = Math.floor(Math.abs(beat) / beatsPerMeasure) + 1;
      const isStrong = Math.abs(beat % beatsPerMeasure) < 1e-6;
      out.push({ beat, timeSec: t / 1000, strong: isStrong, measure });
    }
    return out;
  }
}

/** 便捷构造：没有变速时也返回可用的时间轴 */
export function makeTimeline(baseBpm: number, changes?: BpmChange[] | null, originMs = 0): BpmTimeline {
  return new BpmTimeline(baseBpm, changes, originMs);
}
