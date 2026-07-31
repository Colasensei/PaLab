import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lang, t } from '@/utils/lang';
import { loadCharts } from '@/utils';
import type { ChartPackage } from './ChartLibrary';
import { syncMediaSession, clearMediaSession, onMediaControl, MediaControlEvent } from '@/utils/mediaSession';

interface Track {
  title: string;
  artist: string;
  url: string;
  coverUrl: string | null;
  duration: number; // ms，0 = 未知
}

interface Props {
  lang: Lang;
  uiBlur: boolean;
  /** 0~100 */
  musicVolume: number;
  onClose: () => void;
}

type PlayMode = 'list' | 'single' | 'shuffle';

const LS_INDEX = 'palab_mp_index';
const LS_MODE = 'palab_mp_mode';

function fmt(ms: number): string {
  if (!ms || isNaN(ms) || ms <= 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export const MusicPlayer: React.FC<Props> = ({ lang, uiBlur, musicVolume, onClose }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem(LS_INDEX) || '0'); return isNaN(v) ? 0 : Math.max(0, v); } catch { return 0; }
  });
  const [mode, setMode] = useState<PlayMode>(() => {
    try { const m = localStorage.getItem(LS_MODE); return (m === 'single' || m === 'shuffle' || m === 'list') ? m : 'list'; } catch { return 'list'; }
  });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current) audioRef.current = new Audio();

  const indexRef = useRef(index); indexRef.current = index;
  const modeRef = useRef(mode); modeRef.current = mode;
  const tracksRef = useRef(tracks); tracksRef.current = tracks;
  const lastSync = useRef(0);

  const current = index >= 0 && index < tracks.length ? tracks[index] : null;

  // 打开即捕获谱面库所有含歌的谱面
  useEffect(() => {
    let cancelled = false;
    loadCharts().then((charts: ChartPackage[]) => {
      if (cancelled) return;
      const list: Track[] = charts
        .filter(c => c.songUrl)
        .map(c => ({
          title: c.title || c.fileName,
          artist: c.artist || '',
          url: c.songUrl!,
          coverUrl: c.coverUrl,
          duration: 0,
        }));
      setTracks(list);
    });
    return () => { cancelled = true; };
  }, []);

  // 逐个轻量读取时长（只读元数据）
  useEffect(() => {
    if (tracks.length === 0) return;
    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled || i >= tracks.length) return;
      const idx = i;
      const tr = tracks[idx];
      if (tr.duration === 0) {
        const a = new Audio(tr.url);
        a.preload = 'metadata';
        const done = () => {
          if (!cancelled && a.duration && !isNaN(a.duration)) {
            setTracks(prev => {
              const n = [...prev];
              if (n[idx]) n[idx] = { ...n[idx], duration: a.duration * 1000 };
              return n;
            });
          }
          a.src = '';
          i++;
          setTimeout(step, 60);
        };
        a.addEventListener('loadedmetadata', done);
        a.addEventListener('error', done);
      } else { i++; setTimeout(step, 60); }
    };
    step();
    return () => { cancelled = true; };
  }, [tracks.length]);

  const playTrack = useCallback((idx: number) => {
    const list = tracksRef.current;
    if (idx < 0 || idx >= list.length) return;
    const a = audioRef.current!;
    setIndex(idx);
    setCurrentTime(0);
    a.src = list[idx].url;
    a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    // 切换歌曲 → 带封面完整同步
    syncMediaSession({
      title: list[idx].title,
      artist: list[idx].artist,
      duration: list[idx].duration,
      position: 0,
      playing: true,
      coverUrl: list[idx].coverUrl || undefined,
    });
    lastSync.current = performance.now();
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current!;
    if (!a.src) {
      if (tracksRef.current.length > 0) playTrack(indexRef.current >= 0 && indexRef.current < tracksRef.current.length ? indexRef.current : 0);
      return;
    }
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {});
    else { a.pause(); setPlaying(false); }
  }, [playTrack]);

  const nextTrack = useCallback(() => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    if (modeRef.current === 'shuffle') {
      let ni = Math.floor(Math.random() * list.length);
      if (list.length > 1 && ni === indexRef.current) ni = (ni + 1) % list.length;
      playTrack(ni);
    } else {
      playTrack((indexRef.current + 1) % list.length);
    }
  }, [playTrack]);

  const prevTrack = useCallback(() => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    const a = audioRef.current!;
    if (a.currentTime > 3) { a.currentTime = 0; setCurrentTime(0); return; }
    playTrack((indexRef.current - 1 + list.length) % list.length);
  }, [playTrack]);

  // 播完：单曲循环 / 切下一首
  useEffect(() => {
    const a = audioRef.current!;
    const onEnded = () => {
      if (modeRef.current === 'single') {
        a.currentTime = 0;
        a.play().then(() => setPlaying(true)).catch(() => {});
      } else {
        nextTrack();
      }
    };
    a.addEventListener('ended', onEnded);
    return () => a.removeEventListener('ended', onEnded);
  }, [nextTrack]);

  // 进度 + 节流同步系统媒体控件
  useEffect(() => {
    const a = audioRef.current!;
    const onTime = () => {
      setCurrentTime(a.currentTime * 1000);
      const d = a.duration && !isNaN(a.duration) ? a.duration * 1000 : 0;
      setDuration(d);
      const now = performance.now();
      if (now - lastSync.current > 1000) {
        lastSync.current = now;
        const tr = tracksRef.current[indexRef.current];
        if (tr) {
          syncMediaSession({
            title: tr.title, artist: tr.artist, duration: d, position: a.currentTime * 1000, playing: !a.paused,
          });
        }
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, []);

  // 音量
  useEffect(() => {
    audioRef.current!.volume = Math.max(0, Math.min(1, musicVolume / 100));
  }, [musicVolume]);

  // Android 系统媒体控制
  useEffect(() => {
    return onMediaControl((e: MediaControlEvent) => {
      const a = audioRef.current!;
      if (e.action === 'play') { a.play().then(() => setPlaying(true)).catch(() => {}); }
      else if (e.action === 'pause') { a.pause(); setPlaying(false); }
      else if (e.action === 'next') nextTrack();
      else if (e.action === 'prev') prevTrack();
      else if (e.action === 'seek' && e.position != null) { a.currentTime = e.position / 1000; setCurrentTime(e.position); }
    });
  }, [nextTrack, prevTrack]);

  // 首次挂载：恢复上次歌曲并自动播放（长按本身是用户手势，放行自动播放）
  useEffect(() => {
    if (tracks.length === 0) return;
    const idx = indexRef.current >= 0 && indexRef.current < tracks.length ? indexRef.current : 0;
    setIndex(idx);
    const tr = tracks[idx];
    const a = audioRef.current!;
    a.src = tr.url;
    a.play().then(() => setPlaying(true)).catch(() => {});
    syncMediaSession({
      title: tr.title, artist: tr.artist, duration: tr.duration, position: 0, playing: true, coverUrl: tr.coverUrl || undefined,
    });
    lastSync.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length]);

  // 卸载：持久化 + 停止 + 清媒体会话
  useEffect(() => {
    return () => {
      try { localStorage.setItem(LS_INDEX, String(indexRef.current)); } catch { /* ignore */ }
      try { localStorage.setItem(LS_MODE, modeRef.current); } catch { /* ignore */ }
      audioRef.current!.pause();
      clearMediaSession();
    };
  }, []);

  const cycleMode = () => setMode(prev => (prev === 'list' ? 'single' : prev === 'single' ? 'shuffle' : 'list'));

  const modeLabel = mode === 'list' ? t('music.list', lang) : mode === 'single' ? t('music.single', lang) : t('music.shuffle', lang);

  return (
    <div className={`music-player-overlay${uiBlur ? ' mp-blur' : ''}`} onClick={onClose}>
      <div className="music-player" onClick={e => e.stopPropagation()}>
        {/* 顶部：歌曲列表 */}
        <div className="mp-header">
          <span className="mp-title">{t('music.player.title', lang)}</span>
          <button className="mp-close" onClick={onClose}>{t('music.close', lang)}</button>
        </div>

        <div className="mp-list">
          {tracks.length === 0 && (
            <div className="mp-empty">{t('music.no.songs', lang)}</div>
          )}
          {tracks.map((tr, i) => (
            <div key={i} className={`mp-item${i === index ? ' active' : ''}`} onClick={() => playTrack(i)}>
              <div className="mp-item-cover">
                {tr.coverUrl ? <img src={tr.coverUrl} alt="" /> : <span className="mp-item-ph">{i + 1}</span>}
              </div>
              <div className="mp-item-info">
                <span className="mp-item-title">{tr.title}</span>
                <span className="mp-item-artist">{tr.artist}</span>
              </div>
              <span className="mp-item-dur">{fmt(tr.duration)}</span>
            </div>
          ))}
        </div>

        {/* 底部：媒体控制 */}
        <div className="mp-controls">
          <div className="mp-now">
            <div className="mp-now-cover">
              {current?.coverUrl ? <img src={current.coverUrl} alt="" /> : <span className="mp-now-ph">♪</span>}
            </div>
            <div className="mp-now-info">
              <span className="mp-now-title">{current?.title ?? '--'}</span>
              <span className="mp-now-artist">{current?.artist ?? ''}</span>
            </div>
          </div>

          <div className="mp-progress">
            <span className="mp-time">{fmt(currentTime)}</span>
            <input
              type="range"
              className="mp-range"
              min={0}
              max={Math.max(1, duration)}
              step={250}
              value={Math.min(currentTime, Math.max(1, duration))}
              onChange={e => {
                const v = parseFloat(e.target.value);
                audioRef.current!.currentTime = v / 1000;
                setCurrentTime(v);
              }}
            />
            <span className="mp-time">{fmt(duration)}</span>
          </div>

          <div className="mp-buttons">
            <button className={`mp-mode${mode !== 'list' ? ' on' : ''}`} onClick={cycleMode} title={modeLabel}>{modeLabel}</button>
            <button className="mp-btn" onClick={prevTrack} aria-label={lang === 'zh' ? '上一首' : 'Previous'}>«</button>
            <button className="mp-btn mp-btn-play" onClick={togglePlay} aria-label={playing ? (lang === 'zh' ? '暂停' : 'Pause') : (lang === 'zh' ? '播放' : 'Play')}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="mp-btn" onClick={nextTrack} aria-label={lang === 'zh' ? '下一首' : 'Next'}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
};
