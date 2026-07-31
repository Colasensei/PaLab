/**
 * 难度校准脚本
 * 测量：给定定数 c，生成器产出的谱面经 estimateDifficulty 分析后的定数
 * 目标：round-trip ≈ c（自洽），且符合 Phigros 体系
 */
import { generateChart, getChartDuration } from '../src/utils/chartGenerator';
import { estimateDifficulty, ensureDoubleGroups } from '../src/utils/manualAnalyzer';
import { GameConfig, Note, TrackCount } from '../src/types';

function makeConfig(c: number, trackCount: TrackCount = 4, bpm = 120, rhythmData?: any): GameConfig {
  return {
    bpm, timeSignature: '4/4', trackCount,
    chartConstant: c,
    timingWindows: { timeA: 160, timeB: 80, timeC: 280 },
    speedMultiplier: 5.0, noteColor: '#35BFFF', holdNoteColor: '#35BFFF',
    bgColor: '#0a0a14', judgeLineColor: '#999999',
    songUrl: null, songFileName: null, autoPlay: false,
    rhythmData,
  };
}

/** 合成节奏数据：模拟一首 120BPM 的歌，8 分音符为主、强弱交替 */
function synthRhythm(bpm: number, durationMs: number, subdivision = 2): { bpm: number; onsets: number[]; strengths: number[]; envelope: number[] } {
  const beatMs = 60000 / bpm;
  const onsets: number[] = [];
  const strengths: number[] = [];
  const step = beatMs / subdivision;
  const n = Math.floor(durationMs / step);
  for (let i = 0; i < n; i++) {
    const t = i * step;
    if (t < 3000 || t > durationMs - 3000) continue;
    // 强拍 (每拍开头) 和弱拍 (半拍偏移) 交替；偶尔空一拍
    const inBeat = i % subdivision;
    if (inBeat === 0) { onsets.push(t); strengths.push(0.9 + Math.random() * 0.1); }
    else if (Math.random() < 0.8) { onsets.push(t); strengths.push(0.5 + Math.random() * 0.2); }
  }
  return { bpm, onsets, strengths, envelope: [] };
}

function stats(notes: Note[], durMs: number): { nps: number; peak: number; doubles: number; holds: number } {
  const d = durMs / 1000;
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  let peak = 0;
  for (let i = 0; i < sorted.length; i++) {
    let cnt = 1;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].startTime - sorted[i].startTime <= 1000) cnt++; else break;
    }
    if (cnt > peak) peak = cnt;
  }
  return {
    nps: notes.length / d,
    peak,
    doubles: notes.filter(n => n.isDouble).length / Math.max(1, notes.length),
    holds: notes.filter(n => n.type === 'hold').length / Math.max(1, notes.length),
  };
}

function roundTrip(constants: number[], trackCount: TrackCount, bpm: number, useAudio: boolean, runs = 12) {
  console.log(`\n=== ${useAudio ? 'AUDIO(合成节奏)' : '程序生成'}  ${trackCount}K  ${bpm}BPM ===`);
  console.log('c    -> 分析定数(平均)  | NPS    peak  双押率  hold率');
  for (const c of constants) {
    let sum = 0, sumNps = 0, sumPeak = 0, sumDbl = 0, sumHold = 0;
    for (let r = 0; r < runs; r++) {
      const rd = useAudio ? synthRhythm(bpm, 120000) : undefined;
      const cfg = makeConfig(c, trackCount, bpm, rd);
      const notes = generateChart(cfg, useAudio ? null : 120000, true);
      const d = getChartDuration(notes);
      const est = estimateDifficulty(ensureDoubleGroups(notes), d, trackCount);
      const s = stats(notes, d);
      sum += est; sumNps += s.nps; sumPeak += s.peak; sumDbl += s.doubles; sumHold += s.holds;
    }
    const n = runs;
    console.log(`${String(c).padEnd(4)} -> ${(sum / n).toFixed(1).padEnd(10)}  | ${(sumNps / n).toFixed(2)}    ${(sumPeak / n).toFixed(1)}    ${(sumDbl / n * 100).toFixed(0)}%    ${(sumHold / n * 100).toFixed(0)}%`);
  }
}

function roundTripHoldsOff(constants: number[], trackCount: TrackCount, bpm: number, runs = 8) {
  console.log(`\n=== AUDIO 无长条  ${trackCount}K  ${bpm}BPM ===`);
  console.log('c    -> 分析定数(平均)  | NPS    peak  双押率  hold率');
  for (const c of constants) {
    let sum = 0, sumNps = 0, sumHold = 0;
    for (let r = 0; r < runs; r++) {
      const rd = synthRhythm(bpm, 120000);
      const cfg = makeConfig(c, trackCount, bpm, rd);
      const notes = generateChart(cfg, null, false);
      const d = getChartDuration(notes);
      const est = estimateDifficulty(ensureDoubleGroups(notes), d, trackCount);
      const s = stats(notes, d);
      sum += est; sumNps += s.nps; sumHold += s.holds;
    }
    console.log(`${String(c).padEnd(4)} -> ${(sum / runs).toFixed(1).padEnd(10)}  | ${(sumNps / runs).toFixed(2)}    ${(sumHold / runs * 100).toFixed(0)}%`);
  }
}

const constants = [2, 4, 6, 8, 10, 12, 14, 16];
roundTrip(constants, 4, 120, false);
roundTrip(constants, 4, 120, true);
roundTrip(constants, 6, 128, true);
roundTripHoldsOff(constants, 4, 120);
