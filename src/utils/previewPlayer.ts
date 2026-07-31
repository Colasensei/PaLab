/**
 * 谱面预览播放器 — 基于 audioManager 单例，带渐入与音量档位
 * 预览音量比正常游玩略低；离开谱面库/开弹窗时进一步降低
 */
import { audioManager } from './audioManager';

/** 预览正常音量（比游玩略低） */
export const PREVIEW_VOLUME = 0.6;
/** 离开谱面库 / 打开弹窗时的音量 */
export const PREVIEW_LOW_VOLUME = 0.12;

let fadeTimer: ReturnType<typeof setInterval> | null = null;

function clearFade() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
}

/** 渐入播放预览（切换谱面时新歌渐入） */
export function playPreview(url: string, targetVol: number = PREVIEW_VOLUME) {
  clearFade();
  audioManager.load(url).then(() => {
    audioManager.setVolume(0);
    audioManager.play(1);
    // 渐入 250ms
    const start = performance.now();
    const dur = 250;
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / dur);
      audioManager.setVolume(targetVol * p);
      if (p >= 1) clearFade();
    }, 30);
  }).catch(() => { clearFade(); });
}

/** 直接设置预览音量（低档 / 正常档） */
export function setPreviewVolume(v: number) {
  clearFade();
  audioManager.setVolume(v);
}

/** 停止预览 */
export function stopPreview() {
  clearFade();
  audioManager.stop();
}
