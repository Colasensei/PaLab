import { GameConfig, Note, NoteType, BrainSplitSection } from '@/types';
import { alignToBeat, constantToNps } from './manualAnalyzer';

/**
 * 根据谱面定数计算难度参数
 *
 * 核心思路：以「目标 NPS」驱动密度，与分析器 estimateDifficulty 完全对版。
 * 给定定数 c → 期望 NPS → 换算成每 tick 的落键概率，保证 round-trip 自洽。
 */
interface DiffParams {
  noteProbability: number;
  holdProbability: number;
  doubleProbability: number;
  minSpacing: number;
  tripleProbability: number;
  stairProbability: number;
  trillProbability: number;
  jackProbability: number;
}

function getDifficultyParams(
  chartConstant: number,
  trackCount: number,
  bpm: number,
  beatsPerMeasure: number,
): DiffParams {
  const c = chartConstant;
  const t = Math.max(0, Math.min(1, (c - 1.0) / 17.0));
  const t2 = t * t;
  const t3 = t2 * t;

  // 轨道因子：与分析器 estimateDifficulty 一致（4K 基准）
  const trackFactor = Math.pow(4 / Math.max(2, trackCount), 0.25);

  // 期望总 NPS：把双押/hold/峰值加成折算掉（约 0.35 定数）
  const effC = Math.max(1.0, (c - 0.35) / trackFactor);
  const targetNps = constantToNps(effC);

  // 每拍 tick 数 → 每秒 tick 数
  const subdivision = Math.max(2, beatsPerMeasure + Math.floor(c / 3));
  const beatMs = 60000 / bpm;
  const ticksPerSec = subdivision / (beatMs / 1000);

  // 平均强拍加权（downbeat ×2 / mid ×1.5 / 其它 ×1）
  const avgBeatWeight = (2.0 + 1.5 + Math.max(0, subdivision - 2) * 1.0) / subdivision;

  // 每 tick 基础落键概率：目标 NPS / (每秒tick数 × 平均加权 × 放置效率系数)
  // 效率系数随密度上升（高难间距/轨冲突更多，需补偿）
  const acceptance = 1.12 + t * 0.55;
  let noteProbability = Math.min(1, targetNps / ticksPerSec / avgBeatWeight * acceptance);
  // 低难别完全空，给个地板
  noteProbability = Math.max(0.02, noteProbability);

  return {
    noteProbability,
    holdProbability: 0.04 + t * 0.12,
    doubleProbability: 0.05 + t * 0.22,
    minSpacing: Math.round(720 - t * 620),
    tripleProbability: c >= 15.0 ? (t - 0.82) * 0.5 : 0,
    stairProbability: 0.05 + t * 0.12,
    trillProbability: 0.04 + t * 0.12 + t3 * 0.08,
    jackProbability: t2 * 0.12,
  };
}

export function generateChart(config: GameConfig, durationMs: number | null, enableHolds: boolean = true): { notes: Note[]; splits: BrainSplitSection[] } {
  const strengthAt = config.rhythmData && config.rhythmData.onsets.length > 0
    ? buildStrengthAt(config.rhythmData)
    : null;

  let notes = generateTicks(config, durationMs ?? 120_000, enableHolds, strengthAt);

  // 节拍对齐，吸到半拍网格上（
  if (config.snapToBeat) {
    notes = alignToBeat(notes, config.bpm);
  }

  // 脑裂段：16+ 定数且开启开关时可能生成（4~8 小节、通常两个轨道）
  const splits = generateSplits(config, durationMs ?? 120_000);

  // 脑裂开始/结束前后各 2 拍留白（含段内起始 2 拍与收尾前 2 拍）：方向切换瞬间不要有音符
  if (splits.length > 0) {
    const beatMs = 60000 / Math.max(30, config.bpm);
    const buffer = beatMs * 2;
    notes = notes.filter(n =>
      !splits.some(s =>
        (n.startTime >= s.startTime - buffer && n.startTime <= s.startTime + buffer) ||
        (n.startTime >= s.endTime - buffer && n.startTime <= s.endTime + buffer)
      )
    );
  }

  return { notes, splits };
}

/** 自动生成脑裂段：开启必生成、关闭不生成（0.7.1+）；插入一段 4~8 小节脑裂（通常两个轨道） */
function generateSplits(config: GameConfig, durationMs: number): BrainSplitSection[] {
  if (!config.enableSplit || durationMs <= 4000) return [];
  const beatMs = 60000 / Math.max(30, config.bpm);
  const [beatsPerMeasure] = config.timeSignature.split('/').map(Number);
  const measureMs = beatMs * Math.max(2, beatsPerMeasure);
  const nMeasures = 4 + Math.floor(Math.random() * 5); // 4~8 小节
  const len = nMeasures * measureMs;
  const maxStart = Math.max(3000, durationMs - len - 3000);
  const start = 3000 + Math.random() * Math.max(1, maxStart - 3000);
  const tk = Math.max(2, config.trackCount as number);
  // 通常两个轨道（65% 两轨，35% 三轨），随机选择不重复
  const n = Math.min(tk, 2 + (Math.random() < 0.35 ? 1 : 0));
  const tracks = Array.from({ length: tk }, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, n);
  return tracks.map((t, i) => ({
    id: i, track: t,
    startTime: Math.round(start),
    endTime: Math.round(start + len),
  }));
}

/**
 * 统一的 tick 密度引擎
 * - strengthAt 为 null：程序生成，密度按定数均匀铺
 * - strengthAt 存在（音频）：有音乐的地方才铺，强度调制概率，密度仍由定数决定
 */
function generateTicks(
  config: GameConfig,
  durationMs: number,
  enableHolds: boolean,
  strengthAt: ((t: number) => number) | null,
): Note[] {
  const beatInterval = 60000 / config.bpm;
  const [beatsPerMeasure] = config.timeSignature.split('/').map(Number);
  const params = getDifficultyParams(config.chartConstant, config.trackCount as number, config.bpm, beatsPerMeasure);

  // 休息段：中期/中后期插入一段 10~20 秒的低难度（约 5.0 定数），让人放松。
  // 主谱面定数 <5.0 时休息段取谱面定数（随谱面更简单）；>=5.0 时固定 5.0，明显轻松。
  const breakC = Math.min(config.chartConstant, 5.0);
  const breakParams = getDifficultyParams(breakC, config.trackCount as number, config.bpm, beatsPerMeasure);
  let breakStart = -1, breakEnd = -1;
  if (durationMs >= 25000) {
    const bLen = (10 + Math.random() * 10) * 1000; // 10~20 秒
    const lo = durationMs * 0.45;                  // 中期起点下限
    const hi = durationMs * 0.8 - bLen;            // 结束不贴尾部
    if (hi > lo + 1000) {
      breakStart = lo + Math.random() * (hi - lo);
      breakEnd = breakStart + bLen;
    }
  }

  // 越难越密，tick 越多（
  const subdivision = Math.max(2, beatsPerMeasure + Math.floor(config.chartConstant / 3));
  const tickInterval = beatInterval / subdivision;
  const totalTicks = Math.floor(durationMs / tickInterval);
  const tk = config.trackCount as number;

  const notes: Note[] = [];
  let noteId = 0;
  let doubleGroupId = 0;
  const lastNoteTime: number[] = new Array(tk).fill(-Infinity);

  let stairDir = 0, stairLen = 0, lastTrack = -1;
  let trillTrack = -1, trillAlt = false;

  for (let i = 0; i < totalTicks; i++) {
    const time = i * tickInterval;
    if (time < 2000 || time > durationMs - 2000) continue;

    // 音频：只在有音乐的地方落键，强度调制概率
    let strengthMod = 1;
    if (strengthAt) {
      const s = strengthAt(time);
      if (s <= 0.05) continue;
      strengthMod = 0.5 + 0.5 * s;
    }

    // 休息段内改用低难度参数：落键稀疏、无双押三押等高难模式
    const inBreak = breakStart >= 0 && time >= breakStart && time < breakEnd;
    const p = inBreak ? breakParams : params;
    const posInMeasure = i % subdivision;
    const isDownbeat = posInMeasure === 0;
    const isMidBeat = subdivision >= 4 && posInMeasure === Math.floor(subdivision / 2);
    // 强拍加权，定数唯一话事（
    const effProb = Math.min(1, p.noteProbability
      * (isDownbeat ? 2.0 : isMidBeat ? 1.5 : 1.0)
      * strengthMod);
    if (Math.random() > effProb) continue;

    const r = Math.random();
    const sf = p.minSpacing;

    // 四押，定数 > 18 才给（休息段不生成）
    if (tk >= 4 && !inBreak && config.chartConstant > 18.0 && r < 0.008) {
      const trks = quadPress(tk);
      if (trks.every(t => time - lastNoteTime[t] >= sf)) {
        for (const t of trks) {
          notes.push(mkN(noteId++, 'tap', t, time, 0, true, doubleGroupId));
          lastNoteTime[t] = time + sf;
        }
        doubleGroupId++; stairLen = 0; continue;
      }
    }

    // 三押，15 起步（
    if (tk >= 4 && p.tripleProbability > 0 && r < p.tripleProbability) {
      const trks = triplePress(tk);
      if (trks.every(t => time - lastNoteTime[t] >= sf)) {
        for (const t of trks) {
          notes.push(mkN(noteId++, 'tap', t, time, 0, true, doubleGroupId));
          lastNoteTime[t] = time + sf;
        }
        doubleGroupId++; stairLen = 0; continue;
      }
    }

    // 台阶，左右左右（
    if (p.stairProbability > 0 && r < p.stairProbability && lastTrack >= 0 && tk >= 4) {
      if (stairLen === 0) stairDir = Math.random() > 0.5 ? 1 : -1;
      const nt = lastTrack + stairDir;
      if (nt >= 0 && nt < tk && time - lastNoteTime[nt] >= sf) {
        const ntype = rHold(p.holdProbability, enableHolds);
        const hl = ntype === 'hold' ? beatInterval * 2 : 0;
        notes.push(mkN(noteId++, ntype, nt, time, hl, false, null));
        lastNoteTime[nt] = ntype === 'hold' ? time + hl : time + sf;
        lastTrack = nt;
        stairLen++;
        if (stairLen >= 3 + Math.floor(Math.random() * 3)) { stairLen = 0; stairDir *= -1; }
        continue;
      }
      stairLen = 0;
    }

    // 交互，左右左右左右（
    if (p.trillProbability > 0 && r < p.trillProbability && tk >= 4) {
      if (trillTrack < 0 || Math.random() < 0.3) trillTrack = Math.floor(Math.random() * (tk - 1));
      const tt = trillAlt ? trillTrack + 1 : trillTrack;
      trillAlt = !trillAlt;
      if (time - lastNoteTime[tt] >= sf) {
        notes.push(mkN(noteId++, 'tap', tt, time, 0, false, null));
        lastNoteTime[tt] = time + sf; lastTrack = tt; stairLen = 0; continue;
      }
    }

    // 叠键，同一轨连着敲（
    if (p.jackProbability > 0 && r < p.jackProbability && lastTrack >= 0) {
      const mj = Math.max(sf * 0.6, 150);
      if (time - lastNoteTime[lastTrack] >= mj) {
        notes.push(mkN(noteId++, 'tap', lastTrack, time, 0, false, null));
        lastNoteTime[lastTrack] = time + mj; stairLen = 0; continue;
      }
    }

    // 双押
    if (Math.random() < p.doubleProbability && tk >= 2) {
      const trks = selDbl(tk, time, lastNoteTime, sf);
      if (trks) {
        for (const t of trks) {
          const ntype = rHold(p.holdProbability, enableHolds);
          const hl = ntype === 'hold' ? beatInterval * 2 : 0;
          notes.push(mkN(noteId++, ntype, t, time, hl, true, doubleGroupId));
          lastNoteTime[t] = ntype === 'hold' ? time + hl : time + sf;
        }
        doubleGroupId++; lastTrack = trks[1]; stairLen = 0; continue;
      }
    }

    // 单押，选最近没用的轨（减少碰撞拒绝）
    const track = pickTrack(tk, time, lastNoteTime, sf, lastTrack);
    if (track < 0) { stairLen = 0; continue; }
    const ntype = rHold(p.holdProbability, enableHolds);
    const hl = ntype === 'hold' ? beatInterval * 2 : 0;
    notes.push(mkN(noteId++, ntype, track, time, hl, false, null));
    lastNoteTime[track] = ntype === 'hold' ? time + hl : time + sf;
    lastTrack = track;
    stairLen = 0;
  }

  notes.sort((a, b) => a.startTime - b.startTime);
  return notes;
}

/** 优先选「最近没碰过」的轨，且倾向远离 lastTrack，降低单轨碰撞 */
function pickTrack(tk: number, time: number, lastNoteTime: number[], minSpacing: number, lastTrack: number): number {
  const cand: number[] = [];
  for (let t = 0; t < tk; t++) {
    if (time - lastNoteTime[t] >= minSpacing) cand.push(t);
  }
  if (cand.length === 0) return -1;
  if (lastTrack >= 0 && cand.length > 1 && Math.random() < 0.5) {
    const far = cand.filter(t => Math.abs(t - lastTrack) >= 2);
    if (far.length > 0) return far[Math.floor(Math.random() * far.length)];
  }
  return cand[Math.floor(Math.random() * cand.length)];
}

function rHold(prob: number, en: boolean): NoteType { return en && Math.random() < prob ? 'hold' : 'tap'; }

function mkN(id: number, type: NoteType, track: number, startTime: number, hLen: number, isDouble: boolean, dgId: number | null): Note {
  const hl = type === 'hold' ? Math.max(hLen, 100) : 0;
  return { id, type, track, startTime, endTime: startTime + hl, isDouble, doubleGroupId: dgId };
}

function selDbl(tc: number, time: number, lastNoteTime: number[], minSpacing: number): number[] | null {
  const avail: number[] = [];
  for (let t = 0; t < tc; t++) {
    if (time - lastNoteTime[t] >= minSpacing) avail.push(t);
  }
  if (avail.length < 2) return null;
  if (tc <= 4) {
    const i = Math.floor(Math.random() * (avail.length - 1));
    const t1 = avail[i];
    const rest = avail.filter(t => t !== t1);
    return [t1, rest[Math.floor(Math.random() * rest.length)]];
  }
  const lc = Math.floor(avail.length / 2);
  const left = avail.slice(0, Math.max(1, lc));
  const right = avail.slice(lc);
  if (left.length === 0 || right.length === 0) return [avail[0], avail[1]];
  return [left[Math.floor(Math.random() * left.length)], right[Math.floor(Math.random() * right.length)]];
}

function triplePress(tc: number): number[] {
  if (tc <= 4) { const t1 = Math.floor(Math.random() * (tc - 1)); return [t1, t1 + 1]; }
  const lc = Math.floor(tc / 2);
  if (Math.random() > 0.5) { const t1 = Math.floor(Math.random() * (lc - 1)); return [t1, t1 + 1, lc + Math.floor(Math.random() * lc)]; }
  const t1 = Math.floor(Math.random() * lc);
  return [t1, lc + Math.floor(Math.random() * (lc - 1)), lc + Math.floor(Math.random() * (lc - 1)) + 1];
}

function quadPress(tc: number): number[] {
  if (tc <= 4) return [0, 1, 2, 3];
  const lc = Math.floor(tc / 2);
  const t1 = Math.floor(Math.random() * (lc - 1));
  const t3 = lc + Math.floor(Math.random() * (lc - 1));
  return [t1, t1 + 1, t3, t3 + 1];
}

/**
 * 构建「给定时刻最近的 onset 强度」查询函数
 * onsets 升序，time 单调递增 → 用游标往前扫，O(1) 均摊
 */
function buildStrengthAt(rhythm: { onsets: number[]; strengths: number[] }): (t: number) => number {
  const ons = rhythm.onsets;
  const str = rhythm.strengths;
  let cursor = 0;
  return (t: number) => {
    while (cursor + 1 < ons.length && ons[cursor + 1] <= t) cursor++;
    let best = -1, bestD = Infinity;
    for (let k = Math.max(0, cursor - 2); k < ons.length && ons[k] <= t + 250; k++) {
      const d = Math.abs(ons[k] - t);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (bestD > 250) return 0;
    return str[best] ?? 0.5;
  };
}

export function getChartDuration(notes: Note[]): number {
  if (notes.length === 0) return 120_000;
  const lastNote = notes[notes.length - 1];
  return lastNote.endTime + 2000;
}
