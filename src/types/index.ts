// ============ 游戏配置 ============

import { getDevOverride } from '@/utils/devOverrides';

export type TrackCount = 2 | 4 | 6 | 8;
export type TimeSignature = '2/4' | '3/4' | '4/4' | '6/8';

/** 谱面定数 → 难度标签映射 */
export function constantToDifficulty(c: number): string {
  const ezMax = getDevOverride('d_ezMax');
  const nmMax = getDevOverride('d_nmMax');
  const hdMax = getDevOverride('d_hdMax');
  const inMax = getDevOverride('d_inMax');
  if (c < ezMax) return 'EZ';
  if (c < nmMax) return 'NM';
  if (c < hdMax) return 'HD';
  if (c < inMax) return 'IN';
  return 'AT';
}

/** 难度标签对应的颜色 */
export function getDiffColor(diff: string): string {
  const colors: Record<string, string> = {
    EZ: getDevOverride('c_ezColor'),
    NM: getDevOverride('c_nmColor'),
    HD: getDevOverride('c_hdColor'),
    IN: getDevOverride('c_inColor'),
    AT: getDevOverride('c_atColor'),
  };
  return colors[diff] || '#888888';
}

/** @deprecated 使用 getDiffColor() 代替 */
export const DIFF_COLORS: Record<string, string> = {
  EZ: '#44BB44', NM: '#FFAA00', HD: '#FF4444', IN: '#AA44FF', AT: '#FF44AA',
};

export interface TimingWindows {
  /** Good判定窗口 (ms) — 默认120 */
  timeA: number;
  /** Perfect判定窗口 (ms) — 默认60 */
  timeB: number;
  /** Bad提前窗口上限 (ms) — 默认180 */
  timeC: number;
}

export interface GameConfig {
  bpm: number;
  timeSignature: TimeSignature;
  trackCount: TrackCount;
  /** 谱面定数 (1.0~18.0)，决定谱面难度的一切 */
  chartConstant: number;
  timingWindows: TimingWindows;
  /** 流速倍率，默认1.0 */
  speedMultiplier: number;
  /** 音符颜色 */
  noteColor: string;
  /** 按住音符颜色 */
  holdNoteColor: string;
  /** 背景颜色 */
  bgColor: string;
  /** 判定线颜色 */
  judgeLineColor: string;
  /** 导入的歌曲文件 (Object URL) */
  songUrl: string | null;
  /** 歌曲文件名 */
  songFileName: string | null;
  /** 自动演奏模式 */
  autoPlay: boolean;
  /** 音频分析节奏数据 */
  rhythmData?: { bpm: number; onsets: number[]; strengths: number[]; envelope: number[] };
  /** 节拍对齐（自动分析谱面用） */
  snapToBeat?: boolean;
  /** 是否生成 hold 长条（默认 true） */
  enableHolds?: boolean;
  /** 脑裂段（部分轨道反转）：编辑器/自动生成产生，游玩时视觉反转 */
  splits?: BrainSplitSection[];
  /** 谱面背景视频（dataURL/ObjectURL），优先于封面背景 */
  videoUrl?: string | null;
  /** 背景视频是否模糊（默认模糊） */
  videoBlur?: boolean;
  /** 背景视频是否播放声音（默认静音） */
  videoSound?: boolean;
  /** 自动生成时是否可能产生脑裂（16+ 定数且开启） */
  enableSplit?: boolean;
  /** 编辑器元数据（OSU 导入预填） */
  chartTitle?: string;
  chartArtist?: string;
  chartAuthor?: string;
  coverUrl?: string;
  coverFileName?: string;
}

// ============ 音符 ============

export type NoteType = 'tap' | 'hold';

export interface Note {
  id: number;
  type: NoteType;
  /** 轨道索引 (0-based) */
  track: number;
  /** 音符开始时间 (ms from song start) */
  startTime: number;
  /** 按住音符结束时间 (ms from song start)，tap音符等于startTime */
  endTime: number;
  /** 是否为双押/交互的一部分 */
  isDouble: boolean;
  /** 双押组ID (同组双押共享) */
  doubleGroupId: number | null;
}

// ============ 脑裂（部分轨道反转） ============

/**
 * 脑裂段：某轨道在 [startTime, endTime) 内判定线移到顶部、音符从底部反向上升。
 * 纯视觉反转，判定/判分照常（判定基于时间）。
 * endTime = -1 表示进行中（编辑器里尚未结束）
 */
export interface BrainSplitSection {
  id: number;
  /** 起始轨道 (0-based) */
  track: number;
  /** 脑裂开始时间 (ms from song start) */
  startTime: number;
  /** 脑裂结束时间 (ms)，-1 = 进行中未结束 */
  endTime: number;
}

// ============ 判定 ============

export type JudgmentType = 'miss' | 'bad' | 'good' | 'perfect';

export interface Judgment {
  type: JudgmentType;
  /** 偏差时间 (ms)，miss时为Infinity */
  offset: number;
  /** 判定时间点 (ms from song start) */
  time: number;
}

// ============ 按键映射 ============

export const KEY_MAP: Record<TrackCount, string[]> = {
  2: ['F', 'J'],
  4: ['D', 'F', 'J', 'K'],
  6: ['S', 'D', 'F', 'J', 'K', 'L'],
  8: ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'],
};

export const KEY_DISPLAY: Record<TrackCount, string> = {
  2: 'F J',
  4: 'D F J K',
  6: 'S D F J K L',
  8: 'A S D F J K L ;',
};

/** 解析有效键位：优先自定义（长度须匹配轨道数），否则用默认 KEY_MAP */
export function resolveKeys(
  keyBindings: Partial<Record<TrackCount, string[]>> | undefined,
  trackCount: TrackCount,
): string[] {
  const kb = keyBindings?.[trackCount];
  if (kb && kb.length === trackCount) return kb;
  return KEY_MAP[trackCount];
}

// ============ 游戏状态 ============

export interface NoteResult {
  note: Note;
  judgment: Judgment;
  score: number;
}

export interface GameResults {
  totalNotes: number;
  perfect: number;
  good: number;
  bad: number;
  miss: number;
  maxCombo: number;
  score: number;
  fullCombo: boolean;
  allPerfect: boolean;
  rating: RatingType;
  noteResults: NoteResult[];
  autoPlay: boolean;
  songName: string | null;
  difficulty: string;
  chartConstant: number;
  pp: number;  // 单曲 RKS
  acc: number;  // ACC (0-1)
}

/** 历史最高分记录 */
export interface HighScoreRecord {
  score: number;
  rating: string;
  perfect: number;
  good: number;
  bad: number;
  miss: number;
  maxCombo: number;
  date: string;
  time: number;  // timestamp ms
  config: {
    bpm: number;
    difficulty: string;
    chartConstant: number;
    trackCount: number;
    speed: number;
  };
  pp: number;
  /** 每个音符的判定偏移 (ms)，-1 表示 Miss */
  offsets: number[];
}

export type RatingType = 'C' | 'B' | 'A' | 'S' | 'AP' | 'V';

export type AppScreen = 'menu' | 'chart-library' | 'config' | 'song-panel' | 'loading' | 'page-loading' | 'gameplay' | 'results' | 'settings' | 'latency' | 'editor' | 'visual-editor' | 'editor-setup' | 'profile' | 'about' | 'records' | 'help' | 'dev' | 'update' | 'chart-mode-select' | 'manual-config' | 'manual-record' | 'manual-analyze';

/** 全局设置（持久化） */
export interface AppSettings {
  latencyOffset: number;
  showDoubleGlow: boolean;
  noteColor: string;
  holdNoteColor: string;
  bgColor: string;
  judgeLineColor: string;
  language: 'zh' | 'en';
  showACC: boolean;
  devMode: boolean;
  showWaveform: boolean;
  uiBlur: boolean;
  noPageLoading: boolean;
  noteScale: number;
  musicVolume: number;
  judgeLineThickness: number;
  /** 准度条：显示最近打击偏移 */
  showAccuracyBar: boolean;
  /** 主界面显示看板娘立绘 */
  showMascot: boolean;
  showFPS: boolean;
  /** 自定义电脑端键位（轨道数 → 键列表），未设置用默认 KEY_MAP */
  keyBindings?: Partial<Record<TrackCount, string[]>>;
  /** 全局 GUI 大小倍率（大1.2 / 中1.0 / 小0.8） */
  uiScale: number;
  /** 游戏内界面大小倍率（轨道/音符/判定线/准度条；不含 HUD） */
  gameUiScale: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  latencyOffset: 0,
  showDoubleGlow: true,
  noteColor: '#35BFFF',
  holdNoteColor: '#35BFFF',
  bgColor: '#0a0a14',
  judgeLineColor: '#999999',
  language: 'zh',
  showACC: false,
  devMode: false,
  showWaveform: true,
  uiBlur: true,  noPageLoading: false,  noteScale: 1.0,
  musicVolume: 50,
  judgeLineThickness: 3,
  showAccuracyBar: false,
  showMascot: true,
  showFPS: false,
  uiScale: 1,
  gameUiScale: 1,
};

// ============ 账号信息 ============

export interface AccountInfo {
  name: string;
  /** base64 data URL (圆形裁切后) */
  avatarUrl: string | null;
}
