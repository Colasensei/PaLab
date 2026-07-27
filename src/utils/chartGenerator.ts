import { GameConfig, Note, NoteType, TrackCount } from '@/types';
import { alignToBeat } from './manualAnalyzer';

/**
 * 根据谱面定数计算难度参数
 * 对标 Phigros 实际密度曲线
 */
function getDifficultyParams(chartConstant: number): {
  noteProbability: number;
  holdProbability: number;
  doubleProbability: number;
  minSpacing: number;
  tripleProbability: number;
  stairProbability: number;
  trillProbability: number;
  jackProbability: number;
} {
  const t = Math.max(0, Math.min(1, (chartConstant - 1.0) / 17.0));
  const t3 = t * t * t;
  // 三次曲线：低难平缓、高难飚，对标 Phigros（
  return {
    noteProbability: 0.32 + t * 0.28 + t3 * 0.40,
    holdProbability: 0.03 + t * 0.15 + t3 * 0.12,
    doubleProbability: 0.01 + t * 0.20 + t3 * 0.32,
    minSpacing: Math.round(750 - t * 580),
    tripleProbability: chartConstant >= 15.0 ? (t - 0.82) * 0.55 : 0,
    stairProbability: 0.06 + t * 0.14,
    trillProbability: 0.04 + t * 0.14 + t3 * 0.10,
    jackProbability: t3 * 0.15,
  };
}

export function generateChart(config: GameConfig, durationMs: number | null, enableHolds: boolean = true): Note[] {
  // 有音频数据 → 跟着波形走（
  let notes: Note[];
  if (config.rhythmData && config.rhythmData.onsets.length > 0) {
    notes = generateFromAudio(config, config.rhythmData, enableHolds);
  } else {

  const beatInterval = 60000 / config.bpm;
  const params = getDifficultyParams(config.chartConstant);
  const totalDuration = durationMs ?? 120_000;
  const [beatsPerMeasure] = config.timeSignature.split('/').map(Number);
  // 越难越密，tick 越多（
  const subdivision = Math.max(2, beatsPerMeasure + Math.floor(config.chartConstant / 3));

  notes = [];
  let noteId = 0;
  let doubleGroupId = 0;
  const lastNoteTime: number[] = new Array(config.trackCount).fill(-Infinity);

  const tickInterval = beatInterval / subdivision;
  const totalTicks = Math.floor(totalDuration / tickInterval);
  const tk = config.trackCount as number;

  // 轨数补偿：同定数下，轨道越多 → 单轨密度越低（总物量相近）
  const trackDensity = 4 / tk;  // 4K 基准
  // BPM 补偿：快歌 tick 多 → 降低单 tick 概率（难度不变）
  const bpmFactor = 120 / config.bpm;
  // 综合密度系数：定数一样 = 难度一样，无视轨数和 BPM
  const densityMul = trackDensity * bpmFactor;
  const adjMinSpacing = Math.round(params.minSpacing * bpmFactor);

  let stairDir = 0, stairLen = 0, lastTrack = -1;
  let trillTrack = -1, trillAlt = false;

  for (let i = 0; i < totalTicks; i++) {
    const time = i * tickInterval;
    if (time < 2000 || time > totalDuration - 2000) continue;

    const posInMeasure = i % subdivision;
    const isDownbeat = posInMeasure === 0;
    const isMidBeat = subdivision >= 4 && posInMeasure === Math.floor(subdivision / 2);
    // 强拍加权，定数唯一话事（
    const effProb = Math.min(1, (isDownbeat ? params.noteProbability * 2.0
      : isMidBeat ? params.noteProbability * 1.5
      : params.noteProbability) * densityMul);
    if (Math.random() > effProb) continue;

    const r = Math.random();

    // 四押，定数 > 18 才给（
    if (tk >= 4 && config.chartConstant > 18.0 && r < 0.008) {
      const trks = quadPress(tk);
      const sf = adjMinSpacing;
      if (trks.every(t => time - lastNoteTime[t] >= sf)) {
        for (const t of trks) {
          notes.push(mkN(noteId++, 'tap', t, time, 0, true, doubleGroupId));
          lastNoteTime[t] = time + sf;
        }
        doubleGroupId++; stairLen = 0; continue;
      }
    }

    // 三押，15 起步（
    if (tk >= 4 && params.tripleProbability > 0 && r < params.tripleProbability) {
      const trks = triplePress(tk);
      const sf = adjMinSpacing;
      if (trks.every(t => time - lastNoteTime[t] >= sf)) {
        for (const t of trks) {
          notes.push(mkN(noteId++, 'tap', t, time, 0, true, doubleGroupId));
          lastNoteTime[t] = time + sf;
        }
        doubleGroupId++; stairLen = 0; continue;
      }
    }

    // 台阶，左右左右（
    if (params.stairProbability > 0 && r < params.stairProbability && lastTrack >= 0 && tk >= 4) {
      if (stairLen === 0) stairDir = Math.random() > 0.5 ? 1 : -1;
      const nt = lastTrack + stairDir;
      const sf = adjMinSpacing;
      if (nt >= 0 && nt < tk && time - lastNoteTime[nt] >= sf) {
        const ntype = rHold(params.holdProbability, enableHolds);
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
    if (params.trillProbability > 0 && r < params.trillProbability && tk >= 4) {
      if (trillTrack < 0 || Math.random() < 0.3) trillTrack = Math.floor(Math.random() * (tk - 1));
      const tt = trillAlt ? trillTrack + 1 : trillTrack;
      trillAlt = !trillAlt;
      if (time - lastNoteTime[tt] >= adjMinSpacing) {
        notes.push(mkN(noteId++, 'tap', tt, time, 0, false, null));
        lastNoteTime[tt] = time + adjMinSpacing; lastTrack = tt; stairLen = 0; continue;
      }
    }

    // 叠键，同一轨连着敲（
    if (params.jackProbability > 0 && r < params.jackProbability && lastTrack >= 0) {
      const mj = Math.max(adjMinSpacing * 0.6, 150);
      if (time - lastNoteTime[lastTrack] >= mj) {
        notes.push(mkN(noteId++, 'tap', lastTrack, time, 0, false, null));
        lastNoteTime[lastTrack] = time + mj; stairLen = 0; continue;
      }
    }

    // 双押
    if (Math.random() < params.doubleProbability && tk >= 4) {
      const trks = selDbl(tk);
      if (trks.every(t => time - lastNoteTime[t] >= adjMinSpacing)) {
        for (const t of trks) {
          const ntype = rHold(params.holdProbability, enableHolds);
          const hl = ntype === 'hold' ? beatInterval * 2 : 0;
          notes.push(mkN(noteId++, ntype, t, time, hl, true, doubleGroupId));
          lastNoteTime[t] = ntype === 'hold' ? time + hl : time + adjMinSpacing;
        }
        doubleGroupId++; lastTrack = trks[1]; stairLen = 0; continue;
      }
    }

    // 单押，朴实无华（
    let track: number;
    if (lastTrack >= 0 && Math.random() < 0.3) {
      const cand: number[] = [];
      for (let t = 0; t < tk; t++) {
        if (Math.abs(t - lastTrack) >= 2 && time - lastNoteTime[t] >= adjMinSpacing) cand.push(t);
      }
      track = cand.length > 0 ? cand[Math.floor(Math.random() * cand.length)] : Math.floor(Math.random() * tk);
    } else {
      track = Math.floor(Math.random() * tk);
    }
    if (time - lastNoteTime[track] >= adjMinSpacing) {
      const ntype = rHold(params.holdProbability, enableHolds);
      const hl = ntype === 'hold' ? beatInterval * 2 : 0;
      notes.push(mkN(noteId++, ntype, track, time, hl, false, null));
      lastNoteTime[track] = ntype === 'hold' ? time + hl : time + adjMinSpacing;
      lastTrack = track;
    }
    stairLen = 0;
  }

  notes.sort((a, b) => a.startTime - b.startTime);
  } // 程序生成到此为止

  // 节拍对齐，吸到半拍网格上（
  if (config.snapToBeat) {
    notes = alignToBeat(notes, config.bpm);
  }

  return notes;
}

function rHold(prob: number, en: boolean): NoteType { return en && Math.random() < prob ? 'hold' : 'tap'; }

function mkN(id: number, type: NoteType, track: number, startTime: number, hLen: number, isDouble: boolean, dgId: number | null): Note {
  const hl = type === 'hold' ? Math.max(hLen, 100) : 0;
  return { id, type, track, startTime, endTime: startTime + hl, isDouble, doubleGroupId: dgId };
}

function selDbl(tc: number): [number, number] {
  if (tc <= 4) { const t1 = Math.floor(Math.random() * (tc - 1)); return [t1, t1 + 1 + Math.floor(Math.random() * (tc - t1 - 1))]; }
  const lc = Math.floor(tc / 2);
  return [Math.floor(Math.random() * lc), lc + Math.floor(Math.random() * lc)];
}

function triplePress(tc: number): number[] {
  if (tc <= 4) return selDbl(tc);
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
 * 基于完整波形能量包络自动生成谱面
 * 不再依赖离散 onset 点，而是直接遍历包络，在能量突增处放置音符
 */
function generateFromAudio(config: GameConfig, rhythm: { bpm: number; onsets: number[]; strengths: number[]; envelope: number[] }, enableHolds: boolean): Note[] {
  const notes: Note[] = [];
  let noteId = 0;
  let doubleGroupId = 0;
  const tk = config.trackCount;
  const lastNoteTime: number[] = new Array(tk).fill(-Infinity);
  const t = Math.max(0, Math.min(1, (config.chartConstant - 1.0) / 17.0));
  const beatMs = 60000 / rhythm.bpm;

  // 定数决定采多少音，跟波形走（
  const total = rhythm.onsets.length;
  const density = (4 / tk) * (120 / Math.max(60, rhythm.bpm));
  const takeCount = Math.floor(total * (0.12 + t * 0.88) * density);
  const step = Math.max(1, Math.floor(total / Math.max(1, takeCount)));

  const doubleProb = 0.01 + t * 0.20;
  const holdProb = 0.01 + t * 0.08;
  let lastTrack = -1;

  for (let idx = 0; idx < total; idx += step) {
    const timeMs = rhythm.onsets[idx];
    const strength = rhythm.strengths[idx] || 0.3;

    if (t > 0.3 && Math.random() < doubleProb * strength && tk >= 4) {
      const trks = selDbl(tk);
      if (trks.every(tr => timeMs - lastNoteTime[tr] >= beatMs * 0.4)) {
        for (const tr of trks) {
          const hl = enableHolds && Math.random() < holdProb ? Math.max(200, Math.floor(strength * 400)) : 0;
          notes.push(mkN(noteId++, hl > 0 ? 'hold' : 'tap', tr, timeMs, hl, true, doubleGroupId));
          lastNoteTime[tr] = timeMs;
        }
        doubleGroupId++; lastTrack = trks[1]; continue;
      }
    }

    let track: number;
    if (lastTrack >= 0 && Math.random() < 0.3) {
      const cand: number[] = [];
      for (let tr = 0; tr < tk; tr++) {
        if (Math.abs(tr - lastTrack) >= 2 && timeMs - lastNoteTime[tr] >= beatMs * 0.35) cand.push(tr);
      }
      track = cand.length > 0 ? cand[Math.floor(Math.random() * cand.length)] : Math.floor(Math.random() * tk);
    } else {
      track = Math.floor(Math.random() * tk);
    }
    if (timeMs - lastNoteTime[track] < beatMs * 0.3) continue;
    const hl = enableHolds && Math.random() < holdProb ? Math.max(200, Math.floor(strength * 400)) : 0;
    notes.push(mkN(noteId++, hl > 0 ? 'hold' : 'tap', track, timeMs, hl, false, null));
    lastNoteTime[track] = timeMs; lastTrack = track;
  }

  notes.sort((a, b) => a.startTime - b.startTime);
  return notes;
}

export function getChartDuration(notes: Note[]): number {
  if (notes.length === 0) return 120_000;
  const lastNote = notes[notes.length - 1];
  return lastNote.endTime + 2000;
}
