import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Lang } from '@/utils/lang';
import { loadAsset, ASSET_KEYS } from '@/utils/assetStore';

interface Props {
  currentOffset: number;
  onSave: (offset: number) => void;
  onBack: () => void;
  lang: Lang;
}

const INT = 500; const CD = 4; const TOT = 12;

export const LatencyCalibration: React.FC<Props> = ({ currentOffset, onSave, onBack, lang }) => {
  return (
    <div className="screen settings-screen">
      <div className="settings-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="st-back-btn" onClick={onBack}>{lang === 'zh' ? '返回' : 'Back'}</button>
          <h2 className="st-title" style={{ margin: 0, flex: 1 }}>{lang === 'zh' ? '谱面延时' : 'Latency'}</h2>
          <span style={{ width: 80 }} />
        </div>
        <LatencyInputPanel lang={lang} currentOffset={currentOffset} onSave={onSave} />
        <div style={{ height: 16 }} />
        <LatencyMusicPanel lang={lang} currentOffset={currentOffset} onSave={onSave} />
      </div>
    </div>
  );
};

// ==================== 输入延迟（tap-along + 去离群值） ====================
const LatencyInputPanel: React.FC<{ lang: Lang; currentOffset: number; onSave: (o: number) => void }> = ({ lang, currentOffset, onSave }) => {
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState('');
  const [flash, setFlash] = useState(false);
  const [saved, setSaved] = useState(false);

  const beatsRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef(0);
  const startRef = useRef(0);
  const cntRef = useRef(0);

  const stop = useCallback(() => { setRunning(false); clearTimeout(timerRef.current); ctxRef.current?.close(); ctxRef.current = null; }, []);
  useEffect(() => () => stop(), [stop]);

  const beep = (ctx: AudioContext) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = 880; o.type = 'sine'; g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.06); };

  const compute = () => {
    const diffs: number[] = [];
    for (let j = 0; j < Math.min(beatsRef.current.length, tapsRef.current.length); j++) {
      diffs.push(tapsRef.current[j] - beatsRef.current[j]);
    }
    if (diffs.length < 4) { setResult(lang === 'zh' ? '采样不足' : 'Too few taps'); return; }
    // 排序去头尾 2 个离群值
    diffs.sort((a, b) => a - b);
    const trimmed = diffs.slice(2, diffs.length - 2);
    const avg = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
    const no = currentOffset + avg;
    setResult(lang === 'zh'
      ? `+${avg}ms  ->  ${no}ms  (${trimmed.length}/${diffs.length} samples)`
      : `+${avg}ms  ->  ${no}ms  (${trimmed.length}/${diffs.length} samples)`);
    return no;
  };

  const sched = (ctx: AudioContext) => {
    const now = performance.now(); const target = startRef.current + CD * INT + cntRef.current * INT;
    timerRef.current = window.setTimeout(() => {
      if (!ctxRef.current) return;
      beep(ctxRef.current); beatsRef.current.push(performance.now());
      cntRef.current++; setCount(cntRef.current);
      setFlash(true); setTimeout(() => setFlash(false), 60);
      if (cntRef.current < TOT) sched(ctxRef.current);
      else { stop(); const no = compute(); }
    }, Math.max(0, target - now));
  };

  const start = () => { stop(); beatsRef.current = []; tapsRef.current = []; cntRef.current = 0; setCount(0); setResult(''); setSaved(false); setRunning(true); const ctx = new AudioContext(); ctxRef.current = ctx; startRef.current = performance.now(); for (let i = 0; i < CD; i++) setTimeout(() => { if (ctxRef.current) beep(ctxRef.current); }, i * INT); timerRef.current = window.setTimeout(() => sched(ctx), CD * INT); };

  const tap = () => { if (running) tapsRef.current.push(performance.now()); };

  // 空格键支持
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); tap(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running]);

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>{lang === 'zh' ? '输入延迟' : 'Input Latency'}</div>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{lang === 'zh' ? '跟随音效节拍按空格键或点击下方区域。自动去掉极端值。' : 'Tap space or area in sync with beeps. Outliers removed.'}</p>
      <div onClick={tap} style={{
        padding: 30, cursor: running ? 'pointer' : 'default', userSelect: 'none', minHeight: 160,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        border: `1px solid ${flash ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
        background: flash ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
        borderRadius: 6, transition: 'background 0.06s, border-color 0.06s',
      }}>
        {!running && !result && <><div style={{ fontSize: 36, opacity: 0.4 }}>{currentOffset}ms</div><div style={{ display: 'flex', gap: 8 }}><button className="st-action-btn" onClick={start}>{lang === 'zh' ? '开始校准' : 'Start'}</button><button className="st-action-btn" style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }} onClick={() => onSave(0)}>{lang === 'zh' ? '归零' : 'Zero'}</button></div></>}
        {running && <><div style={{ fontSize: 28, fontWeight: 700 }}>{count}/{TOT}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{lang === 'zh' ? '按空格键或点击此处' : 'Press Space or tap here'}</div></>}
        {result && !running && <><div style={{ fontSize: 14, fontWeight: 600, color: '#44BB44', textAlign: 'center' }}>{result}</div><div style={{ display: 'flex', gap: 8 }}>
          <button className="st-action-btn" onClick={start}>{lang === 'zh' ? '重试' : 'Retry'}</button>
          {!saved && <button className="st-save-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => { const no = parseInt(result.split('->')[1]) || currentOffset; onSave(no); setSaved(true); }}>{lang === 'zh' ? '保存' : 'Save'}</button>}
          <button className="st-action-btn" style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }} onClick={() => onSave(0)}>{lang === 'zh' ? '归零' : 'Zero'}</button>
        </div></>}
      </div>
    </div>
  );
};

// ==================== 音乐延迟（播放校准曲 + 偏移滑块） ====================
const LatencyMusicPanel: React.FC<{ lang: Lang; currentOffset: number; onSave: (o: number) => void }> = ({ lang, currentOffset, onSave }) => {
  const [playing, setPlaying] = useState(false);
  const [localOff, setLocalOff] = useState(currentOffset);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const calibUrl = loadAsset(ASSET_KEYS.calibSong) || '/审判曲？.mp3';

  const toggle = () => {
    if (!playing) {
      const a = new Audio(calibUrl);
      a.loop = true; a.volume = 0.5;
      a.play().catch(() => {});
      audioRef.current = a;
      setPlaying(true);
    } else {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
    }
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>{lang === 'zh' ? '音乐延迟' : 'Music Delay'}</div>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{lang === 'zh' ? '播放校准曲 (BPM 164)，拖动滑块使下落与音乐节拍对齐。' : 'Play calibration song (BPM 164), adjust slider to sync drops with beat.'}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <button className="st-action-btn" onClick={toggle} style={{ minWidth: 80 }}>{playing ? (lang === 'zh' ? '暂停' : 'Stop') : (lang === 'zh' ? '播放' : 'Play')}</button>
        <button className="st-action-btn" style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }} onClick={() => { setLocalOff(0); onSave(0); }}>{lang === 'zh' ? '归零' : 'Zero'}</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'rgba(255,255,255,0.01)' }}>
        <input type="range" className="st-range" min={-300} max={300} step={5} value={localOff} onChange={e => { const v = parseInt(e.target.value); setLocalOff(v); }} onMouseUp={() => onSave(localOff)} onTouchEnd={() => onSave(localOff)} />
        <span className="st-speed-val" style={{ color: '#fff' }}>{localOff}ms</span>
      </div>
    </div>
  );
};
