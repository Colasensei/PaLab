import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Lang } from '@/utils/lang';
import { getDevOverride } from '@/utils/devOverrides';
import { Note } from '@/types';

interface EditorConfig { bpm: number; trackCount: number; songUrl: string; songFileName: string; existingNotes?: Note[]; title?: string; artist?: string; author?: string; coverUrl?: string; coverFileName?: string; }
interface Props { config: EditorConfig; onBack: () => void; onSave: (notes: Note[]) => void; onTrial: (notes: Note[]) => void; lang: Lang; latencyOffset: number; }
type AlignMode = 'none' | 'beat' | 'half' | 'quarter';
interface PlacedNote { id: number; track: number; startBeat: number; endBeat: number; startTime: number; endTime: number; }

// 模块级存着，别让浮点往返误差坑了（
let _savedPlacedNotes: PlacedNote[] = [];
let _savedSettings: { align: string; speed: number; invertScroll: boolean } = { align: 'beat', speed: 5.0, invertScroll: true };
export function getSavedPlacedNotes() { return _savedPlacedNotes; }
export function getSavedEditorSettings() { return _savedSettings; }

export const VisualEditor: React.FC<Props> = ({ config: initialConfig, onBack, onSave, onTrial, lang, latencyOffset }) => {
  const [bpm, setBpm] = useState(initialConfig.bpm);
  const [speed, setSpeed] = useState(5.0);
  const [align, setAlign] = useState<AlignMode>('beat');
  const [notes, setNotes] = useState<PlacedNote[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredNote, setHoveredNote] = useState<number | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [invertScroll, setInvertScroll] = useState(true);
  const [selected, setSelected] = useState<{ track: number; beat: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null!);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const noteIdRef = useRef(0);
  const touchStartRef = useRef<{ y: number; count: number } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRafRef = useRef(0);
  const progressByUserRef = useRef(false);
  // 拖动状态：{ noteId, startY, origBeats Map<id→{sb,eb}>, shiftKey }
  const dragRef = useRef<{ ids: number[]; startY: number; orig: Map<number, { sb: number; eb: number }>; shift: boolean } | null>(null);
  // 框选起点
  const boxRef = useRef<{ sx: number; sy: number } | null>(null);

  const trackCount = initialConfig.trackCount;
  const trackMinW = useMemo(() => getDevOverride('n_trackMinW'), []);
  const trackMaxW = useMemo(() => getDevOverride('n_trackMaxW'), []);
  const hMargin = useMemo(() => getDevOverride('n_hMargin'), []);
  const notePadX = useMemo(() => Math.max(0, getDevOverride('n_notePadX')), []);
  const tapHeight = useMemo(() => getDevOverride('n_tapHeight'), []);
  const trackWidth = useMemo(() => Math.max(trackMinW, Math.min(trackMaxW, Math.floor((window.innerWidth - hMargin - 220) / trackCount))), [trackMinW, trackMaxW, hMargin, trackCount]);
  const totalWidth = trackCount * trackWidth;
  const JUDGE_Y = (window.innerHeight - 52) * 0.80;
  const PX_PER_SEC = speed * 100;

  useEffect(() => {
    // 优先用模块级存的原始节拍
    if (_savedPlacedNotes.length > 0) {
      noteIdRef.current = 0;
      setNotes(_savedPlacedNotes.map(n => ({ ...n, id: ++noteIdRef.current })));
      setAlign(_savedSettings.align as AlignMode);
      setSpeed(_savedSettings.speed);
      setInvertScroll(_savedSettings.invertScroll);
      _savedPlacedNotes = [];
      return;
    }
    if (initialConfig.existingNotes && initialConfig.existingNotes.length > 0) {
      noteIdRef.current = 0;
      setNotes(initialConfig.existingNotes.map(n => ({
        id: ++noteIdRef.current, track: n.track,
        startBeat: Math.round((n.startTime / 1000) * initialConfig.bpm / 60 * 100) / 100,
        endBeat: Math.round((n.endTime / 1000) * initialConfig.bpm / 60 * 100) / 100,
        startTime: n.startTime / 1000,
        endTime: n.endTime / 1000,
      })));
    }
  }, [initialConfig.existingNotes, initialConfig.bpm]);

  useEffect(() => {
    const a = new Audio(initialConfig.songUrl);
    audioRef.current = a;
    const onMeta = () => setDuration(a.duration);
    a.addEventListener('loadedmetadata', onMeta);
    return () => { a.removeEventListener('loadedmetadata', onMeta); a.pause(); a.src = ''; };
  }, [initialConfig.songUrl]);

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(tickRafRef.current); return; }
    const tick = () => {
      const t = (audioRef.current?.currentTime ?? 0) + latencyOffset / 1000;
      setCurrentTime(t);
      if (!progressByUserRef.current) setScrollOffset(t);
      tickRafRef.current = requestAnimationFrame(tick);
    };
    tickRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tickRafRef.current);
  }, [playing, latencyOffset]);

  const beatToTime = useCallback((beat: number) => beat * 60 / bpm, [bpm]);
  const timeToY = useCallback((t: number) => JUDGE_Y - (t - scrollOffset) * PX_PER_SEC, [scrollOffset, PX_PER_SEC]);
  const yToTime = useCallback((y: number) => scrollOffset + (JUDGE_Y - y) / PX_PER_SEC, [scrollOffset, PX_PER_SEC]);
  const yToBeat = useCallback((y: number) => yToTime(y) * bpm / 60, [yToTime, bpm]);
  const snap = useCallback((beat: number) => {
    if (align === 'none') return beat;
    const step = align === 'half' ? 0.5 : align === 'quarter' ? 0.25 : 1;
    return Math.round(beat / step) * step;
  }, [align]);

  // 全局 pointermove/pointerup — 拖动音符 & 框选
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!gameAreaRef.current) return;
      const rect = gameAreaRef.current.getBoundingClientRect();
      const cy = e.clientY - rect.top;
      const cx = e.clientX - rect.left;

      if (dragRef.current) {
        const d = dragRef.current;
        const rawBeat = yToBeat(cy);
        const targetBeat = d.shift ? rawBeat : snap(rawBeat);
        const dy = (d.startY - cy) / PX_PER_SEC; // 上拖 cy↓ → dy>0 → 时间更早 → 音符↑
        setNotes(prev => prev.map(n => {
          if (!d.orig.has(n.id)) return n;
          const o = d.orig.get(n.id)!;
          const ns = o.sb + dy * bpm / 60;
          const ne = o.eb + dy * bpm / 60;
          const sb = d.shift ? ns : snap(Math.max(0, ns));
          const eb = d.shift ? ne : snap(Math.max(0, ne));
          return { ...n, startBeat: sb, endBeat: eb, startTime: beatToTime(sb), endTime: beatToTime(eb) };
        }));
      } else if (boxRef.current) {
        setBoxRect({
          x: Math.min(boxRef.current.sx, cx), y: Math.min(boxRef.current.sy, cy),
          w: Math.abs(cx - boxRef.current.sx), h: Math.abs(cy - boxRef.current.sy),
        });
      }
    };
    const onUp = () => {
      if (dragRef.current) dragRef.current = null;
      if (boxRef.current && boxRect && gameAreaRef.current) {
        const ids = new Set<number>();
        notes.forEach(n => {
          const ny = timeToY(n.startTime);
          const nx = n.track * trackWidth + trackWidth / 2;
          if (nx >= boxRect!.x && nx <= boxRect!.x + boxRect!.w &&
              ny >= boxRect!.y && ny <= boxRect!.y + boxRect!.h) {
            ids.add(n.id);
          }
        });
        setSelectedIds(ids);
      }
      boxRef.current = null;
      setBoxRect(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [notes, bpm, snap, beatToTime, timeToY, yToBeat, PX_PER_SEC, trackWidth, boxRect]);

  const hasOverlap = useCallback((track: number, bStart: number, bEnd: number) => {
    const s = Math.min(bStart, bEnd), e = Math.max(bStart, bEnd);
    return notes.some(n => n.track === track && n.startBeat <= e && n.endBeat >= s);
  }, [notes]);

  const beatLines = useMemo(() => {
    const lines: { beat: number; y: number; strong: boolean; label?: string; timeSec: number; measure: number }[] = [];
    const step = align === 'quarter' ? 0.25 : align === 'half' ? 0.5 : 1;
    const songDur = duration || 180;
    const endBeat = songDur * bpm / 60;
    const beatsPerMeasure = 4; // 默认 4/4
    const vs = Math.max(0, scrollOffset - 6);
    const ve = Math.min(songDur, scrollOffset + 6);
    for (let b = Math.floor(vs * bpm / 60 / step) * step; b <= endBeat + step / 2; b += step) {
      const t = b * 60 / bpm;
      if (t < vs || t > ve + step) continue;
      if (b < 0) continue;
      const strong = Math.abs(b % 1) < 0.001;
      const measure = Math.floor(b / beatsPerMeasure) + 1;
      lines.push({ beat: b, y: timeToY(t), strong, timeSec: t, measure,
        label: b === 0 ? 'START' : Math.abs(t - songDur) < 0.15 ? 'END' : undefined });
    }
    return lines;
  }, [bpm, speed, scrollOffset, align, timeToY, duration]);

  const delNote = useCallback((id: number) => setNotes(prev => prev.filter(n => n.id !== id)), []);
  const toNotes = useCallback((): Note[] => {
    // 同一时刻不同轨道 → n 押，别漏了（
    const timeGroups = new Map<number, { startTime: number; tracks: Set<number>; indices: number[] }>();
    const raw = notes.map((n, i) => {
      const st = Math.round(Math.min(n.startTime, n.endTime) * 1000);
      const et = Math.round(Math.max(n.startTime, n.endTime) * 1000);
      const key = st;
      if (!timeGroups.has(key)) timeGroups.set(key, { startTime: st, tracks: new Set(), indices: [] });
      const g = timeGroups.get(key)!;
      g.tracks.add(n.track);
      g.indices.push(i);
      return { id: n.id, type: (Math.abs(n.endBeat - n.startBeat) < 0.001 ? 'tap' : 'hold') as 'tap' | 'hold', track: n.track, startTime: st, endTime: et };
    });
    // 同一时刻不同轨道 → n 押，别漏了（
    let nextGroupId = 1;
    const groupMap = new Map<number, number>(); // startTime → groupId
    for (const [st, g] of timeGroups) {
      if (g.tracks.size >= 2) { groupMap.set(st, nextGroupId++); }
    }
    return raw.map(n => {
      const gid = groupMap.get(n.startTime);
      return { ...n, isDouble: gid !== undefined, doubleGroupId: gid ?? null };
    });
  }, [notes]);

  // 第一下选点，第二下放（不排序）
  const placeAt = useCallback((track: number, rawBeat: number) => {
    const b = snap(Math.max(0, rawBeat));
    if (!selected) { setSelected({ track, beat: b }); return; }
    if (selected.track !== track) { setSelected({ track, beat: b }); return; }
    const start = selected.beat, end = b;
    setSelected(null);
    if (hasOverlap(track, Math.min(start, end), Math.max(start, end))) return;
    if (Math.abs(end - start) < 0.001)
      setNotes(prev => [...prev, { id: ++noteIdRef.current, track, startBeat: start, endBeat: start, startTime: beatToTime(start), endTime: beatToTime(start) }]);
    else
      setNotes(prev => [...prev, { id: ++noteIdRef.current, track, startBeat: start, endBeat: end, startTime: beatToTime(start), endTime: beatToTime(end) }]);
  }, [selected, snap, beatToTime, hasOverlap]);

  const handleBeatClick = useCallback((e: React.PointerEvent, beat: number) => {
    if (!gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const tx = e.clientX - rect.left;
    const track = Math.min(trackCount - 1, Math.max(0, Math.floor(tx / trackWidth)));
    placeAt(track, beat);
  }, [trackCount, trackWidth, placeAt]);

  const onNoteCtx = useCallback((e: React.MouseEvent, id: number) => {
    e.preventDefault();
    if (selectedIds.has(id) && selectedIds.size > 1) {
      // 右键已选中音符 → 批量删除全部选中
      setNotes(prev => prev.filter(n => !selectedIds.has(n.id)));
      setSelectedIds(new Set());
    } else {
      delNote(id);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [delNote, selectedIds]);

  // 音符按下 → 开始拖动
  const onNoteDown = useCallback((e: React.PointerEvent, id: number) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const shift = e.shiftKey;
    // 更新选中集
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shift) {
        if (next.has(id)) next.delete(id); else next.add(id);
      } else {
        if (!next.has(id)) { next.clear(); next.add(id); }
      }
      return next;
    });
    // 记录拖动起点
    const ids = shift
      ? (selectedIds.has(id) ? [...selectedIds].filter(x => x !== id) : [...selectedIds, id])
      : (selectedIds.has(id) ? [...selectedIds] : [id]);
    const orig = new Map<number, { sb: number; eb: number }>();
    notes.forEach(n => { if (ids.includes(n.id)) orig.set(n.id, { sb: n.startBeat, eb: n.endBeat }); });
    const rect = gameAreaRef.current!.getBoundingClientRect();
    dragRef.current = { ids, startY: e.clientY - rect.top, orig, shift };
  }, [selectedIds, notes]);

  // 游戏区空白处按下 → 框选 或 点击放置
  const onGameAreaDown = useCallback((e: React.PointerEvent) => {
    if (!gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // 点中了音符 → 不管（音符自己处理）
    if ((e.target as HTMLElement).closest('[data-note]')) return;
    // 点中节拍线 → 放置音符（原有逻辑）
    const beatLine = (e.target as HTMLElement).closest('[data-beat]');
    if (beatLine) {
      const beat = parseFloat(beatLine.getAttribute('data-beat')!);
      const track = Math.min(trackCount - 1, Math.max(0, Math.floor(cx / trackWidth)));
      placeAt(track, beat);
      return;
    }
    // 空白处 → 框选
    setSelectedIds(new Set());
    boxRef.current = { sx: cx, sy: cy };
  }, [trackCount, trackWidth, placeAt]);

  const seekTo = useCallback((t: number) => {
    const ct = Math.max(0, Math.min(duration || 180, t));
    setCurrentTime(ct); setScrollOffset(ct);
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, ct - latencyOffset / 1000);
  }, [duration, latencyOffset]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    seekTo(scrollOffset + (invertScroll ? -e.deltaY : e.deltaY) / PX_PER_SEC);
  }, [scrollOffset, PX_PER_SEC, seekTo, invertScroll]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) { touchStartRef.current = { y: e.touches[0].clientY, count: 2 }; return; }
    if (e.touches.length === 1 && gameAreaRef.current) {
      const rect = gameAreaRef.current.getBoundingClientRect();
      const tx = e.touches[0].clientX - rect.left;
      const track = Math.min(trackCount - 1, Math.max(0, Math.floor(tx / trackWidth)));
      placeAt(track, yToBeat(e.touches[0].clientY - rect.top));
    }
  }, [trackCount, trackWidth, yToBeat, placeAt]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current && e.touches.length === 2) {
      seekTo(scrollOffset - (e.touches[0].clientY - touchStartRef.current.y) / PX_PER_SEC);
      touchStartRef.current = { y: e.touches[0].clientY, count: 2 };
    }
  }, [scrollOffset, PX_PER_SEC, seekTo]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.currentTime = Math.max(0, currentTime - latencyOffset / 1000); setScrollOffset(currentTime); a.play().catch(() => {}); setPlaying(true); }
  }, [playing, currentTime, latencyOffset]);

  const progressWrapRef = useRef<HTMLDivElement>(null);
  const handleProgressDown = useCallback((e: React.PointerEvent) => {
    progressByUserRef.current = true;
    const el = progressWrapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (duration || 1));
    const onMove = (ev: PointerEvent) => { const r = el.getBoundingClientRect(); seekTo(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (duration || 1)); };
    const onUp = () => { progressByUserRef.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  }, [duration, seekTo]);

  const onNoteTS = useCallback((id: number) => { longPressRef.current = setTimeout(() => delNote(id), 600); }, [delNote]);
  const onNoteTE = useCallback(() => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } }, []);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="screen ve-screen">
      <div className="ve-main">
        <div className="ve-game-wrap" onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
          <div ref={gameAreaRef} className="ve-game-area" style={{ width: totalWidth }} onPointerDown={onGameAreaDown}>
            {Array.from({ length: trackCount }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: i * trackWidth, top: 0, bottom: 0, width: trackWidth, borderRight: i < trackCount - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }} />
            ))}
            {/* 可点击节拍线 + 标签 */}
            {beatLines.map((bl, i) => (
              <div key={i} data-beat={bl.beat} style={{ position: 'absolute', left: 0, width: totalWidth, top: bl.y - 8, height: 16, cursor: 'pointer', zIndex: 1 }}>
                <div style={{ position: 'absolute', left: 0, top: 8, width: '100%', height: bl.strong ? 2 : 1, background: bl.strong ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
                {bl.label && <span style={{ position: 'absolute', right: 4, top: 0, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, pointerEvents: 'none' }}>{bl.label}</span>}
                {/* 小节号 + 秒数 */}
                {bl.strong && <span style={{ position: 'absolute', left: 4, top: -2, fontSize: 8, color: 'rgba(255,255,255,0.22)', pointerEvents: 'none', lineHeight: 1 }}>{bl.measure} · {bl.timeSec.toFixed(1)}s</span>}
              </div>
            ))}
            <div style={{ position: 'absolute', left: 0, width: totalWidth, top: JUDGE_Y, height: 2, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none', zIndex: 5 }} />
            {selected && (
              <div style={{ position: 'absolute', left: selected.track * trackWidth + 4, top: timeToY(beatToTime(selected.beat)), width: trackWidth - 8, height: tapHeight, border: '2px dashed rgba(53,191,255,0.7)', borderRadius: 6, pointerEvents: 'none', zIndex: 4 }} />
            )}
            {notes.map(n => {
              const isHold = Math.abs(n.endBeat - n.startBeat) > 0.001;
              const y1 = timeToY(n.startTime);
              const y2 = timeToY(n.endTime);
              const top = Math.min(y1, y2);
              const h = isHold ? Math.max(tapHeight, Math.abs(y2 - y1)) : tapHeight;
              const sel = selectedIds.has(n.id);
              return (
                <div key={n.id} data-note={n.id}
                  onPointerDown={e => onNoteDown(e, n.id)}
                  onPointerEnter={() => setHoveredNote(n.id)} onPointerLeave={() => setHoveredNote(null)}
                  onContextMenu={e => onNoteCtx(e, n.id)}
                  onTouchStart={() => onNoteTS(n.id)} onTouchEnd={onNoteTE}
                  style={{ position: 'absolute', left: n.track * trackWidth + trackWidth / 2, top, width: trackWidth - notePadX, height: h, backgroundColor: isHold ? '#FF8844' : '#35BFFF', borderRadius: isHold ? '4px 4px 12px 12px' : 6, opacity: n.id === hoveredNote || sel ? 1 : 0.85, cursor: 'grab', zIndex: 2, boxShadow: sel ? '0 0 0 2px #fff, 0 0 14px rgba(53,191,255,0.7)' : n.id === hoveredNote ? '0 0 12px rgba(53,191,255,0.6)' : 'none', transform: 'translateX(-50%)', transition: 'box-shadow 0.1s, opacity 0.1s', touchAction: 'none' }} />
              );
            })}
            {/* 框选矩形 */}
            {boxRect && (
              <div style={{ position: 'absolute', left: boxRect.x, top: boxRect.y, width: boxRect.w, height: boxRect.h, border: '1px solid rgba(53,191,255,0.6)', background: 'rgba(53,191,255,0.08)', pointerEvents: 'none', zIndex: 10 }} />
            )}
          </div>
        </div>
        <div className="ve-panel">
          <div className="ve-panel-sec"><label className="ve-label">BPM</label><input type="number" className="ve-input" value={bpm} onChange={e => setBpm(parseInt(e.target.value) || 120)} min={30} max={300} /></div>
          <div className="ve-panel-sec"><label className="ve-label">{lang === 'zh' ? '流速' : 'Speed'}</label><input type="range" className="ve-range" min={1} max={12} step={0.5} value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} /><span className="ve-val">{speed.toFixed(1)}x</span></div>
          <div className="ve-panel-sec"><label className="ve-label">{lang === 'zh' ? '对齐' : 'Snap'}</label><div className="ve-align-row">{(['none','quarter','half','beat'] as AlignMode[]).map(m => (<button key={m} className={`ve-align-btn${align===m?' active':''}`} onClick={()=>setAlign(m)}>{m==='none'?(lang==='zh'?'无':'Off'):m==='quarter'?'1/4':m==='half'?'1/2':'1/1'}</button>))}</div></div>
          <div className="ve-panel-sec"><label className="ve-check-label"><input type="checkbox" checked={invertScroll} onChange={e => setInvertScroll(e.target.checked)} /><span>{lang === 'zh' ? '反转鼠标滚轮' : 'Invert Scroll'}</span></label></div>
          <div className="ve-panel-sec ve-panel-actions">
            <button className="ve-btn ve-btn-save" onClick={() => { _savedPlacedNotes = [...notes]; _savedSettings = { align, speed, invertScroll }; onSave(toNotes()); }}>{lang === 'zh' ? '保存并离开' : 'Save & Exit'}</button>
            <button className="ve-btn ve-btn-trial" onClick={() => { _savedPlacedNotes = [...notes]; _savedSettings = { align, speed, invertScroll }; onTrial(toNotes()); }}>{lang === 'zh' ? '试玩' : 'Trial'}</button>
            <button className="ve-btn ve-btn-reset" onClick={() => setShowReset(true)}>{lang === 'zh' ? '重置' : 'Reset'}</button>
            <button className="ve-btn ve-btn-back" onClick={() => setShowExit(true)}>{lang === 'zh' ? '返回（不保存）' : 'Back (Discard)'}</button>
          </div>
        </div>
      </div>
      <div className="ve-bar">
        <button className="ve-play-btn" onClick={togglePlay}>{playing ? (lang === 'zh' ? '暂停' : 'Pause') : (lang === 'zh' ? '播放' : 'Play')}</button>
        <div ref={progressWrapRef} className="ve-progress-wrap" onPointerDown={handleProgressDown}><div className="ve-progress-track"><div className="ve-progress-fill" style={{ width: `${pct}%` }} /><div className="ve-progress-thumb" style={{ left: `${pct}%` }} /></div></div>
        <span className="ve-time">{currentTime.toFixed(1)}s / {duration.toFixed(1)}s</span>
      </div>
      {showReset && (<div className="ve-overlay" onClick={() => setShowReset(false)}><div className="ve-dialog" onClick={e => e.stopPropagation()}><p>{lang === 'zh' ? '确定要清除所有音符吗？此操作不可撤销。' : 'Clear all notes? This cannot be undone.'}</p><div className="ve-dialog-actions"><button className="ve-btn ve-btn-reset" onClick={() => setShowReset(false)}>{lang === 'zh' ? '取消' : 'Cancel'}</button><button className="ve-btn ve-btn-save" onClick={() => { setNotes([]); noteIdRef.current = 0; setShowReset(false); }}>{lang === 'zh' ? '确定' : 'Confirm'}</button></div></div></div>)}
      {showExit && (<div className="ve-overlay" onClick={() => setShowExit(false)}><div className="ve-dialog" onClick={e => e.stopPropagation()}><p>{lang === 'zh' ? (notes.length > 0 ? `你有 ${notes.length} 个未保存的音符，确定要离开吗？` : '确定要离开编辑器吗？') : (notes.length > 0 ? `You have ${notes.length} unsaved notes. Leave?` : 'Leave the editor?')}</p><div className="ve-dialog-actions"><button className="ve-btn ve-btn-reset" onClick={() => setShowExit(false)}>{lang === 'zh' ? '取消' : 'Cancel'}</button><button className="ve-btn ve-btn-save" onClick={onBack}>{lang === 'zh' ? '离开' : 'Leave'}</button></div></div></div>)}
    </div>
  );
};
