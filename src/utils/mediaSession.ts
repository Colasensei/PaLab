/**
 * Android 媒体控制（MediaSession）桥接
 * Web 端为 no-op；原生 Android 通过 MediaSessionPlugin 同步元数据、接收系统媒体控制
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface MediaSessionInfo {
  title: string;
  artist: string;
  /** 总时长 ms */
  duration: number;
  /** 当前进度 ms */
  position: number;
  playing: boolean;
  /** 封面 data URL，仅在切换歌曲时传入（避免每次进度同步都传大图） */
  coverUrl?: string;
}

export interface MediaControlEvent {
  action: 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'playFromId';
  position?: number;
  mediaId?: string;
}

let native: any = null;

function getNative(): any {
  if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) return null;
  if (!native) {
    native = registerPlugin('MediaSession');
  }
  return native;
}

/** 同步媒体元数据 + 播放状态到系统 */
export function syncMediaSession(info: MediaSessionInfo): void {
  const n = getNative();
  if (!n) return;
  try { n.update(info).catch(() => {}); } catch { /* ignore */ }
}

/** 清空媒体会话（关闭播放器时） */
export function clearMediaSession(): void {
  const n = getNative();
  if (!n) return;
  try { n.clear().catch(() => {}); } catch { /* ignore */ }
}

/** 监听系统媒体控制（锁屏/通知栏/耳机按键），返回取消函数 */
export function onMediaControl(cb: (e: MediaControlEvent) => void): () => void {
  const n = getNative();
  if (!n) return () => {};
  let handle: { remove: () => void } | null = null;
  try {
    n.addListener('control', (data: any) => {
      cb({ action: data?.action, position: data?.position, mediaId: data?.mediaId });
    }).then((h: any) => { handle = h; });
  } catch { /* ignore */ }
  return () => { handle?.remove(); };
}
