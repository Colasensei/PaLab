/**
 * 音乐播放器单例
 * - 音频元素与播放状态独立于 UI 组件存活：关闭播放卡片 → 音乐继续播放
 * - 只有显式调用 stopMusicPlayback()（离开主界面）才停止
 * - 模块级 Audio 元素，后台/切屏不受组件卸载影响
 */
import { loadCharts } from './chartDB';
import { syncMediaSession, clearMediaSession, onMediaControl, MediaControlEvent } from './mediaSession';
import type { ChartPackage } from '@/components/ChartLibrary';

export interface MusicTrack {
  title: string;
  artist: string;
  url: string;
  coverUrl: string | null;
  duration: number; // ms，0 = 未知
}

export type PlayMode = 'list' | 'single' | 'shuffle';

export interface MusicState {
  tracks: MusicTrack[];
  index: number;
  mode: PlayMode;
  playing: boolean;
  currentTime: number; // ms
  duration: number;    // ms
}

const LS_INDEX = 'palab_mp_index';
const LS_MODE = 'palab_mp_mode';

const audio = new Audio();
const listeners = new Set<() => void>();

let tracks: MusicTrack[] = [];
let index = -1;
let mode: PlayMode = 'list';
let playing = false;
let currentTime = 0;
let duration = 0;
let lastSync = 0;
let listLoaded = false;

function loadIndex(): number {
  try { const v = parseInt(localStorage.getItem(LS_INDEX) || '0'); return isNaN(v) ? 0 : Math.max(0, v); } catch { return 0; }
}
function loadMode(): PlayMode {
  try { const m = localStorage.getItem(LS_MODE); return m === 'single' || m === 'shuffle' || m === 'list' ? m : 'list'; } catch { return 'list'; }
}
function persist() {
  try { localStorage.setItem(LS_INDEX, String(index)); } catch { /* ignore */ }
  try { localStorage.setItem(LS_MODE, mode); } catch { /* ignore */ }
}

function emit() { listeners.forEach(l => l()); }

function getState(): MusicState {
  return { tracks, index, mode, playing, currentTime, duration };
}

function sync(includeCover: boolean) {
  const tr = tracks[index];
  if (!tr) return;
  syncMediaSession({
    title: tr.title,
    artist: tr.artist,
    duration,
    position: currentTime,
    playing,
    coverUrl: includeCover ? tr.coverUrl || undefined : undefined,
  });
}

// ═══ 对外 API ═══

export function subscribeMusicPlayer(cb: () => void): () => void {
  listeners.add(cb);
  cb();
  return () => { listeners.delete(cb); };
}

export function getMusicPlayerState(): MusicState { return getState(); }

/** 打开播放器：首次加载谱面库音乐列表，并恢复/开始播放 */
export async function openMusicPlayer(): Promise<void> {
  if (!listLoaded) {
    listLoaded = true;
    try {
      const charts: ChartPackage[] = await loadCharts();
      tracks = charts
        .filter(c => c.songUrl)
        .map(c => ({
          title: c.title || c.fileName,
          artist: c.artist || '',
          url: c.songUrl!,
          coverUrl: c.coverUrl,
          duration: 0,
        }));
      index = loadIndex();
      if (tracks.length > 0 && (index < 0 || index >= tracks.length)) index = 0;
      emit();
      loadDurations();
    } catch { /* ignore */ }
  }
  if (tracks.length > 0 && (!audio.src || audio.paused)) {
    const idx = index >= 0 && index < tracks.length ? index : 0;
    playMusic(idx);
  }
  emit();
}

/** 关闭播放器卡片：音乐继续播放 */
export function closeMusicPlayer(): void {
  persist();
  // 不停止播放
}

/** 离开主界面：停止播放并清空媒体会话 */
export function stopMusicPlayback(): void {
  audio.pause();
  playing = false;
  clearMediaSession();
  emit();
}

export function setMusicVolume(v: number): void {
  audio.volume = Math.max(0, Math.min(1, v / 100));
}

function playMusic(idx: number): void {
  if (idx < 0 || idx >= tracks.length) return;
  index = idx;
  currentTime = 0;
  audio.src = tracks[idx].url;
  audio.currentTime = 0;
  duration = tracks[idx].duration || 0;
  audio.play().then(() => { playing = true; emit(); }).catch(() => { playing = false; emit(); });
  sync(true);
  lastSync = performance.now();
  emit();
}

export function selectTrack(idx: number): void { playMusic(idx); }

export function toggleMusicPlay(): void {
  if (!audio.src) {
    if (tracks.length > 0) playMusic(index >= 0 && index < tracks.length ? index : 0);
    return;
  }
  if (audio.paused) {
    audio.play().then(() => { playing = true; emit(); }).catch(() => {});
  } else {
    audio.pause();
    playing = false;
    emit();
  }
}

export function nextMusic(): void {
  if (tracks.length === 0) return;
  if (mode === 'shuffle') {
    let ni = Math.floor(Math.random() * tracks.length);
    if (tracks.length > 1 && ni === index) ni = (ni + 1) % tracks.length;
    playMusic(ni);
  } else {
    playMusic((index + 1) % tracks.length);
  }
}

export function prevMusic(): void {
  if (tracks.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    currentTime = 0;
    emit();
    return;
  }
  playMusic((index - 1 + tracks.length) % tracks.length);
}

export function seekMusic(ms: number): void {
  audio.currentTime = ms / 1000;
  currentTime = ms;
  emit();
}

export function cycleMusicMode(): void {
  mode = mode === 'list' ? 'single' : mode === 'single' ? 'shuffle' : 'list';
  persist();
  emit();
}

// ═══ 音频事件 ═══

audio.addEventListener('timeupdate', () => {
  currentTime = audio.currentTime * 1000;
  const d = audio.duration && isFinite(audio.duration) ? audio.duration * 1000 : 0;
  if (d > 0) duration = d;
  const now = performance.now();
  if (now - lastSync > 1000) {
    lastSync = now;
    sync(false);
  }
  emit();
});

audio.addEventListener('play', () => { playing = true; emit(); });
audio.addEventListener('pause', () => { playing = false; emit(); });

audio.addEventListener('ended', () => {
  if (mode === 'single') {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    nextMusic();
  }
});

// 系统媒体控制（Android 锁屏/通知栏/耳机按键）
onMediaControl((e: MediaControlEvent) => {
  if (e.action === 'play') {
    audio.play().then(() => { playing = true; emit(); }).catch(() => {});
  } else if (e.action === 'pause') {
    audio.pause();
    playing = false;
    emit();
  } else if (e.action === 'next') {
    nextMusic();
  } else if (e.action === 'prev') {
    prevMusic();
  } else if (e.action === 'seek' && e.position != null) {
    seekMusic(e.position);
  }
});

// ═══ 时长加载：逐个轻量读取元数据（带超时保护，防卡死） ═══

function loadDurations(): void {
  let i = 0;
  const step = () => {
    while (i < tracks.length && tracks[i].duration > 0) i++;
    if (i >= tracks.length) return;
    const idx = i;
    const a = new Audio();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (ok && a.duration && isFinite(a.duration) && a.duration > 0) {
        tracks[idx] = { ...tracks[idx], duration: a.duration * 1000 };
        if (idx === index && duration <= 0) duration = a.duration * 1000;
        emit();
      }
      a.removeAttribute('src');
      try { a.load(); } catch { /* ignore */ }
      i++;
      setTimeout(step, 30);
    };
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => finish(true), { once: true });
    a.addEventListener('error', () => finish(false), { once: true });
    a.src = tracks[idx].url;
    try { a.load(); } catch { /* ignore */ }
    // 已就绪（同步触发的情况）
    if (a.readyState >= 1) finish(true);
    else setTimeout(() => finish(false), 4000); // 超时保护，4s 读不出就跳过
  };
  setTimeout(step, 50);
}
