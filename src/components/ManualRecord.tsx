import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lang } from '@/utils/lang';
import { GameConfig, Note, KEY_MAP, TrackCount } from '@/types';
import { audioManager } from '@/utils/audioManager';

interface Props {
  config: GameConfig;
  duration: number;
  onComplete: (notes: Note[]) => void;
  onBack: () => void;
  lang: Lang;
  latencyOffset?: number;
}

interface RawInput {
  track: number;
  startTime: number;
  endTime: number;
}

/** Hold 判定最短时长 (ms) */
const HOLD_THRESHOLD = 500;

export const ManualRecord: React.FC<Props> = ({ config, duration, onComplete, onBack, lang, latencyOffset = 0 }) => {
  const tk = config.trackCount as number;
  const keys = KEY_MAP[config.trackCount];
  const hasSong = !!config.songUrl;

  const [phase, setPhase] = useState<'ready' | 'recording' | 'finished'>('ready');
  const [currentTime, setCurrentTime] = useState(0);
  const [pressedTracks, setPressedTracks] = useState<Set<number>>(new Set());
  const [rawInputs, setRawInputs] = useState<RawInput[]>([]);
  const [showExitDialog, setShowExitDialog] = useState(false);

  const startWallRef = useRef<number>(0);
  const animRef = useRef<number>(0);
  const pressedRef = useRef<Set<number>>(new Set());
  const trackStartRef = useRef<Map<number, number>>(new Map());
  const inputsRef = useRef<RawInput[]>([]);
  const finishedRef = useRef(false);
  const offsetRef = useRef(latencyOffset);
  offsetRef.current = latencyOffset;

  /** 获取当前时间 (ms) */
  const getTime = useCallback((): number => {
    if (hasSong) return audioManager.getCurrentTime();
    return performance.now() - startWallRef.current;
  }, [hasSong]);

  /** 按下轨道：开始计时 */
  const pressTrack = useCallback((idx: number) => {
    if (phase !== 'recording') return;
    if (pressedRef.current.has(idx)) return;
    const t = getTime();
    pressedRef.current.add(idx);
    trackStartRef.current.set(idx, t);
    setPressedTracks(new Set(pressedRef.current));
  }, [phase, getTime]);

  /** 松开轨道：记录音符 */
  const releaseTrack = useCallback((idx: number) => {
    if (phase !== 'recording') return;
    if (!pressedRef.current.has(idx)) return;
    const startT = trackStartRef.current.get(idx) ?? getTime();
    const endT = getTime();
    const isHold = endT - startT > HOLD_THRESHOLD;
    const adjStart = Math.max(0, startT - offsetRef.current);
    const adjEnd = isHold ? Math.max(adjStart, endT - offsetRef.current) : adjStart;
    const input: RawInput = { track: idx, startTime: adjStart, endTime: adjEnd };
    inputsRef.current.push(input);
    setRawInputs([...inputsRef.current]);
    pressedRef.current.delete(idx);
    trackStartRef.current.delete(idx);
    setPressedTracks(new Set(pressedRef.current));
  }, [phase, getTime]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const idx = keys.indexOf(e.key.toUpperCase());
      if (idx === -1) return;
      e.preventDefault();
      pressTrack(idx);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const idx = keys.indexOf(e.key.toUpperCase());
      if (idx === -1) return;
      e.preventDefault();
      releaseTrack(idx);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // ESC 退出
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'recording') {
        e.preventDefault();
        setShowExitDialog(true);
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [phase, keys, pressTrack, releaseTrack]);

  // 动画循环
  useEffect(() => {
    if (phase !== 'recording') return;

    const update = () => {
      const t = getTime();
      setCurrentTime(t);

      if (t >= duration && !finishedRef.current) {
        finishRecording();
      } else {
        animRef.current = requestAnimationFrame(update);
      }
    };
    animRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, duration, getTime]);

  // 结束录制
  const finishRecording = useCallback(() => {
    finishedRef.current = true;
    cancelAnimationFrame(animRef.current);
    audioManager.stop();
    setPhase('finished');

    // 处理残留的 hold
    const finalInputs = [...inputsRef.current];
    const now = getTime();
    for (const [track, startT] of trackStartRef.current) {
      const adjStart = Math.max(0, startT - offsetRef.current);
      finalInputs.push({ track, startTime: adjStart, endTime: Math.max(adjStart, now - offsetRef.current) });
    }

    let noteId = 0;
    const notes: Note[] = finalInputs
      .sort((a, b) => a.startTime - b.startTime)
      .map(raw => ({
        id: noteId++,
        type: raw.endTime > raw.startTime + HOLD_THRESHOLD ? 'hold' as const : 'tap' as const,
        track: raw.track,
        startTime: raw.startTime,
        endTime: raw.endTime > raw.startTime + HOLD_THRESHOLD ? raw.endTime : raw.startTime,
        isDouble: false,
        doubleGroupId: null,
      }));

    onComplete(notes);
  }, [getTime, onComplete]);

  const handleStart = async () => {
    setRawInputs([]);
    inputsRef.current = [];
    pressedRef.current = new Set();
    trackStartRef.current = new Map();
    finishedRef.current = false;

    if (config.songUrl) {
      await audioManager.load(config.songUrl);
    }
    audioManager.play(1);
    startWallRef.current = performance.now();
    setPhase('recording');
  };

  const handleFinish = () => {
    if (phase !== 'recording') return;
    finishRecording();
  };

  const trackLabels = keys;

  // 进度条
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="screen mr-screen">
      {/* 顶栏 */}
      <div className="mr-topbar">
        {phase === 'ready' && (
          <>
            <button className="mr-back-btn" onClick={onBack}>{lang === 'zh' ? '返回' : 'Back'}</button>
            <span className="mr-title">{lang === 'zh' ? '录制谱面' : 'Record Chart'}</span>
            <button className="mr-start-btn" onClick={handleStart}>{lang === 'zh' ? '开始' : 'Start'}</button>
          </>
        )}
        {phase === 'recording' && (
          <>
            <span className="mr-title">{lang === 'zh' ? '录制中...' : 'Recording...'}</span>
            <div className="mr-progress-wrap">
              <div className="mr-progress-bar" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="mr-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <button className="mr-finish-btn" onClick={handleFinish}>{lang === 'zh' ? '完成' : 'Finish'}</button>
            <button className="mr-back-btn" onClick={() => { audioManager.pause(); setShowExitDialog(true); }}>{lang === 'zh' ? '退出' : 'Exit'}</button>
          </>
        )}
        {phase === 'finished' && (
          <span className="mr-title">{lang === 'zh' ? '录制完成，正在分析...' : 'Recording done, analyzing...'}</span>
        )}
      </div>

      {/* 主体区域 */}
      <div className="mr-body">
        {phase === 'ready' && (
          <div className="mr-ready-hint">
            <p className="mr-ready-text">{lang === 'zh' ? '点击「开始」后，音乐将播放。' : 'Tap "Start" and the music will play.'}</p>
            <p className="mr-ready-sub">{lang === 'zh' ? '跟随节拍按下对应的按键即可录入音符。' : 'Press the corresponding keys along with the beat to record notes.'}</p>
            <div className="mr-key-preview">
              {keys.map((k, i) => (
                <span key={i} className="mr-key-hint">{k}</span>
              ))}
            </div>
          </div>
        )}

        {phase === 'recording' && (
          <div className="mr-recording-area">
            <div className="mr-beat-indicator">
              <div className="mr-beat-dot" style={{ animationDuration: `${60000 / config.bpm}ms` }} />
            </div>
            <p className="mr-recording-hint">
              {lang === 'zh' ? '按节奏按下按键！' : 'Press keys to the beat!'}
            </p>
            <p className="mr-note-count">
              {rawInputs.length} {lang === 'zh' ? '个音符' : ' notes'}
            </p>
          </div>
        )}
      </div>

      {/* 底部按键 */}
      <div className={`mr-keys ${phase === 'recording' ? 'mr-keys-active' : ''}`}>
        {keys.map((k, i) => {
          const isPressed = pressedTracks.has(i);
          return (
            <button
              key={i}
              className={`mr-key ${isPressed ? 'mr-key-pressed' : ''}`}
              onMouseDown={() => pressTrack(i)}
              onMouseUp={() => releaseTrack(i)}
              onMouseLeave={() => {
                if (pressedRef.current.has(i)) releaseTrack(i);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                pressTrack(i);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                releaseTrack(i);
              }}
            >
              <span className="mr-key-label">{k}</span>
            </button>
          );
        })}
      </div>

      {/* 退出弹窗 */}
      {showExitDialog && (
        <div className="mr-dialog-overlay" onClick={() => setShowExitDialog(false)}>
          <div className="mr-dialog" onClick={e => e.stopPropagation()}>
            <p className="mr-dialog-text">{lang === 'zh' ? '确定要退出吗？已录制的数据将丢失。' : 'Exit? Recorded data will be lost.'}</p>
            <div className="mr-dialog-actions">
              <button className="cp-btn cp-btn-secondary" onClick={() => setShowExitDialog(false)}>
                {lang === 'zh' ? '继续录制' : 'Continue'}
              </button>
              <button className="cp-btn cp-btn-primary" onClick={() => { audioManager.stop(); onBack(); }}>
                {lang === 'zh' ? '退出' : 'Exit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
