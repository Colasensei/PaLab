/**
 * Malody 谱面解析器（.mc / .mcz）
 *
 * 格式要点（对着真实谱面和 Malody 序列化实现对过）：
 * - `.mcz` 就是个 zip，里面 `0/audio.ogg`（或 mp3）、`0/background.jpg`，
 *   以及**每个难度一个 `.mc`**。`.mc` 本身是 UTF-8 JSON。
 * - 拍坐标是三元组 `[a, b, c]`，实际拍位 = `a + b/c`。
 *   `a` 是整数拍（不是小节），`b/c` 是拍内分数，所以 500/250/125 就是 1/1、1/2、1/4 拍。
 * - 毫秒 = `-offset + 拍位 × 60000 / 该段 BPM`，`offset` 来自 `type === 1` 的音频事件；
 *   变速点写在 `time` 里（`{ beat, bpm }`），逐个生效直到下一个变速点。
 * - 音符是 `{ beat, column }`，长条多一个 `endbeat`；`column` 是 0-based 轨道号。
 * - `meta.mode === 0` 才是 Key（mania 式）模式，`meta.mode_ext.column` 是键数。
 *
 * 输出和 osuParser 对齐：绝对毫秒的 `Note[]` + 拆出来的 `bpmChanges`（毫秒坐标），
 * 这样可视化编辑器的节拍网格能直接用上分段 BPM，音符落点仍然是整数拍。
 */
import { Note } from '@/types';
import { BpmChange, MAX_BPM, MIN_BPM } from './bpmMap';
import { ensureDoubleGroups } from './manualAnalyzer';

/** Palab 支持的轨道数（和编辑器设置里的选项一致） */
const SUPPORTED_TRACKS = [2, 4, 6, 8];

/** Malody 拍坐标：a 为整数拍，b/c 为拍内分数，拍位 = a + b/c */
type McBeat = [number, number, number];

interface McTimePoint {
  beat: McBeat;
  bpm: number;
  /** 拍号分子（4/4 的 4），只影响显示 */
  sign?: number;
}

interface McNote {
  beat: McBeat;
  column?: number;
  endbeat?: McBeat;
  /** 1 = 音频事件，2 = 打击音，缺省是音符 */
  type?: number;
  sound?: string;
  vol?: number;
  /** 音频相对拍 0 的偏移（ms） */
  offset?: number;
}

export interface McMeta {
  version?: string;
  creator?: string;
  background?: string;
  mode?: number;
  song?: { title?: string; titleorg?: string; artist?: string; artistorg?: string };
  mode_ext?: { column?: number; bar_begin?: number };
}

export interface McFile {
  meta?: McMeta;
  time?: McTimePoint[];
  note?: McNote[];
  effect?: unknown[];
  extra?: Record<string, unknown>;
}

export interface MalodyParseResult {
  title: string;
  artist: string;
  creator: string;
  version: string;
  trackCount: number;
  /** 第一个变速点的 BPM（基准 BPM） */
  bpm: number;
  /** 后续变速点（毫秒坐标），空数组表示全曲恒速 */
  bpmChanges: BpmChange[];
  /**
   * 拍 0 所在的音频时刻（ms）。
   * Malody 用 `offset` 把整首谱面在音频上平移，绝大多数官方谱面都不是 0，
   * 交给编辑器的时间轴才能让导入的音符继续落在整数拍上。
   */
  beatOrigin: number;
  /** 音频文件名（来自 type === 1 的音频事件，可能为空） */
  audioFilename: string;
  /** 背景图文件名（可能为空） */
  backgroundFilename: string | null;
  notes: Note[];
}

/** 毫秒保留三位小数，避免浮点尾巴进到编辑器 */
function roundMs(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clampBpm(v: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, v));
}

/** `[a, b, c]` → `a + b/c`；非法返回 null */
function readBeat(v: unknown): number | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const a = Number(v[0]);
  const b = Number(v[1]);
  const c = Number(v[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || c <= 0) return null;
  return a + b / c;
}

/** 取原始语言的标题/艺术家（`*org` 存在时优先，没有就退回原字段） */
function pickText(org?: string, plain?: string): string {
  return ((org && org.trim()) || (plain && plain.trim()) || '').trim();
}

/** 从 .mc 里读出的轻量摘要（只解析 meta，用于导入前的列表与筛选） */
export interface McSummary {
  title: string;
  artist: string;
  version: string;
  creator: string;
  /** Malody 模式号，0 = Key */
  mode: number;
  /** 键数（Key 模式才有意义） */
  columns: number;
}

/** 只读 meta 的摘要；不是合法 JSON 返回 null */
export function readMcSummary(text: string): McSummary | null {
  try {
    const file = JSON.parse(text) as McFile;
    const meta = file.meta || {};
    const song = meta.song || {};
    return {
      title: pickText(song.titleorg, song.title) || 'Untitled',
      artist: pickText(song.artistorg, song.artist),
      version: (meta.version || '').trim(),
      creator: (meta.creator || '').trim(),
      mode: typeof meta.mode === 'number' ? meta.mode : 0,
      columns: Math.round(Number(meta.mode_ext?.column) || 0),
    };
  } catch {
    return null;
  }
}

/**
 * 能不能被 Palab 导入。
 *
 * 官方谱包是**多模式混装**的：一个 .mcz 里同时有 Key / Catch / Pad / Ring / Slide
 * 以及 Taiko 的 .tja，十来二十个文件里往往只有几个是 4K Key。
 * 所以导入列表必须先按模式筛掉，否则用户会挑到 Catch 再吃一句「不是 Key 模式」。
 */
export function isMcImportable(s: McSummary): boolean {
  return s.mode === 0 && SUPPORTED_TRACKS.includes(s.columns);
}

export function parseMalodyChart(text: string): MalodyParseResult {
  let file: McFile;
  try {
    file = JSON.parse(text) as McFile;
  } catch {
    throw new Error('bad_json');
  }

  const meta = file.meta || {};
  const song = meta.song || {};
  // mode: 0 = Key（mania 式多键），其余是 Catch / Taiko / Ring / Slide 等，玩法对不上
  const mode = typeof meta.mode === 'number' ? meta.mode : 0;
  if (mode !== 0) throw new Error('not_key');
  const trackCount = Math.round(Number(meta.mode_ext?.column) || 0);
  if (!SUPPORTED_TRACKS.includes(trackCount)) throw new Error('unsupported_tracks');

  // ---- 1) BPM 分段 ----
  const timing = (Array.isArray(file.time) ? file.time : [])
    .map(p => ({ beat: readBeat(p?.beat), bpm: Number(p?.bpm) }))
    .filter(p => p.beat !== null && Number.isFinite(p.bpm) && p.bpm > 0)
    .sort((a, b) => (a.beat as number) - (b.beat as number)) as { beat: number; bpm: number }[];
  if (timing.length === 0) throw new Error('no_bpm');
  // Malody 允许首个变速点不在拍 0，那段时间沿用首个 BPM，等价于把它挪到拍 0
  timing[0].beat = 0;
  for (const p of timing) p.bpm = clampBpm(p.bpm);

  // ---- 2) 音频事件：拍 0 落在 -offset 毫秒 ----
  const cue = (Array.isArray(file.note) ? file.note : []).find(
    n => n && n.type === 1 && typeof n.sound === 'string',
  );
  const audioFilename = cue?.sound || '';
  const cueOffset = Number(cue?.offset);
  const t0 = Number.isFinite(cueOffset) ? -cueOffset : 0;

  // ---- 3) 拍 → 毫秒：逐段积分（和 bpmMap 的 BpmTimeline 同一套算法） ----
  const beatToMs = (beat: number): number => {
    let ms = t0;
    let prevBeat = 0;
    let curBpm = timing[0].bpm;
    for (let i = 1; i < timing.length; i++) {
      if (beat <= timing[i].beat) break;
      ms += ((timing[i].beat - prevBeat) * 60000) / curBpm;
      prevBeat = timing[i].beat;
      curBpm = timing[i].bpm;
    }
    return ms + ((beat - prevBeat) * 60000) / curBpm;
  };

  // ---- 4) 变速点转成毫秒坐标 ----
  const bpm = timing[0].bpm;
  const bpmChanges: BpmChange[] = [];
  for (let i = 1; i < timing.length; i++) {
    const prevBpm = bpmChanges.length > 0 ? bpmChanges[bpmChanges.length - 1].bpm : bpm;
    if (Math.abs(timing[i].bpm - prevBpm) < 1e-6) continue;
    const time = roundMs(beatToMs(timing[i].beat));
    // 0 毫秒之前没法表示，跳过后面的音符时间仍然按原始积分算，不影响同步
    if (time <= 0) continue;
    bpmChanges.push({ time, bpm: timing[i].bpm });
  }

  // ---- 5) 音符 ----
  const rawNotes: { track: number; startTime: number; endTime: number }[] = [];
  for (const n of Array.isArray(file.note) ? file.note : []) {
    if (!n || typeof n.column !== 'number' || !Number.isFinite(n.column)) continue;
    const track = Math.round(n.column);
    if (track < 0 || track >= trackCount) continue;
    const startBeat = readBeat(n.beat);
    if (startBeat === null) continue;
    const startTime = roundMs(beatToMs(startBeat));
    // 音频开始之前的音符没有可玩位置
    if (!(startTime >= 0)) continue;
    let endTime = startTime;
    if (n.endbeat) {
      const endBeat = readBeat(n.endbeat);
      if (endBeat !== null) {
        const e = roundMs(beatToMs(endBeat));
        if (e > startTime) endTime = e;
      }
    }
    rawNotes.push({ track, startTime, endTime });
  }
  rawNotes.sort((a, b) => a.startTime - b.startTime || a.track - b.track);

  const notes: Note[] = rawNotes.map(n => ({
    id: 0,
    type: n.endTime > n.startTime ? 'hold' : 'tap',
    track: n.track,
    startTime: n.startTime,
    endTime: n.endTime,
    isDouble: false,
    doubleGroupId: null,
  }));
  // id 在排序后统一编号，保证和图表顺一致
  for (let i = 0; i < notes.length; i++) notes[i].id = i;

  return {
    title: pickText(song.titleorg, song.title) || 'Untitled',
    artist: pickText(song.artistorg, song.artist),
    creator: (meta.creator || '').trim(),
    version: (meta.version || '').trim(),
    trackCount,
    bpm,
    bpmChanges,
    beatOrigin: t0,
    audioFilename,
    backgroundFilename: (meta.background || '').trim() || null,
    notes: ensureDoubleGroups(notes),
  };
}
