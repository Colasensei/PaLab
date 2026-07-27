import Meyda from 'meyda';
import { analyze } from 'web-audio-beat-detector';

export interface RhythmData {
  bpm: number;
  onsets: number[];
  duration: number;
  beatInterval: number;
  strengths: number[];
  envelope: number[];
}

export async function analyzeAudio(file: File): Promise<RhythmData> {
  const arrayBuf = await file.arrayBuffer();
  const ctx = new AudioContext();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  const sampleRate = audioBuf.sampleRate;
  const channelData = audioBuf.getChannelData(0);
  const durationMs = (channelData.length / sampleRate) * 1000;

  // --- 1. BPM + 节拍网格 ---
  let bpm = 120;
  try { bpm = Math.round(await analyze(audioBuf)); } catch { bpm = 120; }
  bpm = Math.max(60, Math.min(220, bpm));
  const beatMs = 60000 / bpm;

  // 从 0 到完，每 beatMs 一格（
  const beatGrid: number[] = [];
  for (let t = 0; t < durationMs; t += beatMs) {
    beatGrid.push(t);
  }

  // --- 2. RMS 能量 ---
  Meyda.bufferSize = 2048;
  Meyda.sampleRate = sampleRate;
  Meyda.windowingFunction = 'hann';
  const totalFrames = Math.floor(channelData.length / 2048);
  const rmsEnvelope: number[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const frame = channelData.slice(i * 2048, (i + 1) * 2048);
    try { rmsEnvelope.push(Meyda.extract('rms', frame) as number); } catch { rmsEnvelope.push(0); }
  }
  const frameMs = (2048 / sampleRate) * 1000;

  // --- 3. 前奏检测 ---
  const introFrames = Math.floor(2000 / frameMs);
  const introAvg = introFrames > 0
    ? rmsEnvelope.slice(0, introFrames).reduce((s, v) => s + v, 0) / introFrames
    : 0;
  const globalMax = Math.max(...rmsEnvelope, 0.001);
  const introEnd = introAvg < globalMax * 0.15
    ? rmsEnvelope.findIndex((v, i) => i > introFrames && v > globalMax * 0.2)
    : 0;
  const introEndMs = introEnd > 0 ? introEnd * frameMs : 0;

  // --- 4. 峰值 → beat 过滤 ---
  const onsets: number[] = [];
  const strengths: number[] = [];
  let lastOnset = -Infinity;

  // 动态阈值：前 5 帧均值 × 1.8（
  for (let i = 5; i < rmsEnvelope.length - 1; i++) {
    const t = i * frameMs;
    const inIntro = introEndMs > 0 && t < introEndMs;
    const curr = rmsEnvelope[i];
    const prev = rmsEnvelope[i - 1];
    const next = rmsEnvelope[i + 1];
    const localAvg = rmsEnvelope.slice(Math.max(0, i - 5), i).reduce((s, v) => s + v, 0) / 5;

    const isPeak = curr > prev && curr >= next;
    const threshold = localAvg * (inIntro ? 3.0 : 1.8);
    const strongEnough = curr > threshold;

    if (isPeak && strongEnough) {
      // 在 beat ±30ms 内才算（
      const nearBeat = beatGrid.some(b => Math.abs(t - b) < 30);
      if (nearBeat && t - lastOnset >= beatMs * 0.35) {
        // 吸到最近的 beat（
        let bestBeat = t;
        let bestDist = Infinity;
        for (const b of beatGrid) {
          const d = Math.abs(t - b);
          if (d < 30 && d < bestDist) { bestBeat = b; bestDist = d; }
        }
        onsets.push(bestBeat);
        strengths.push(Math.min(1, curr / (globalMax || 1)));
        lastOnset = bestBeat;
      }
    }
  }

  ctx.close();
  return { bpm, onsets, duration: durationMs, beatInterval: beatMs, strengths, envelope: rmsEnvelope };
}
