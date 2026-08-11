import React, { useState, useRef, useEffect } from 'react';
import { Lang } from '@/utils/lang';
import { loadCharts, saveCharts } from '@/utils';
import { HighScoreRecord } from '@/types';
import JSZip from 'jszip';
import { generateBlurredBg } from '@/utils/blurImage';
import { PREVIEW_VOLUME, PREVIEW_LOW_VOLUME, setPreviewVolume } from '@/utils/previewPlayer';

export interface ChartPackage {
  fileName: string;
  title: string;
  artist: string;
  author: string;
  difficulty: string;
  chartConstant: number;
  description: string;
  coverUrl: string | null;
  illustrationUrl: string | null;
  songUrl: string | null;
  /** 谱面背景视频（持久化为 dataURL，可选：旧谱面无） */
  videoUrl?: string | null;
  chartData: string;
  config: string;
  speed?: number;
}

interface Props {
  onPlay: (pkg: ChartPackage, speed: number, autoPlay: boolean, target: 'none' | 'fc' | 'ap', mirror: boolean, correctHitSound: boolean) => void;
  onSettings: () => void;
  onPreview: (url: string | null) => void;
  lang: Lang;
  highScores: Record<string, { score: number; rating: string; rks: number; acc: number }>;
  uiBlur: boolean;
}

const getDiffStyle = (diff: string): { bg: string; fg: string } => {
  switch (diff) {
    case 'EZ': return { bg: '#7EC8E3', fg: '#000' };
    case 'NM': return { bg: '#FFFFFF', fg: '#000' };
    case 'HD': return { bg: '#FF8C42', fg: '#000' };
    case 'IN': return { bg: '#E53E3E', fg: '#fff' };
    case 'AT': return { bg: '#1A1A1A', fg: '#fff' };
    default: return { bg: 'rgba(255,255,255,0.15)', fg: '#fff' };
  }
};

/** 跨挂载记住上次选中的歌曲索引 */
let lastSelectedIdx = -1;

export const ChartLibrary: React.FC<Props> = ({ onPlay, onSettings, onPreview, lang, highScores, uiBlur }) => {
  const [charts, setCharts] = useState<ChartPackage[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [selected, setSelected] = useState<number>(lastSelectedIdx);
  // 选中变化同步到 module 级变量，跨挂载保持
  useEffect(() => { lastSelectedIdx = selected; }, [selected]);

  useEffect(() => {
    loadCharts().then(data => {
      setCharts(data); setDbLoaded(true);
      // 边界检查：上次选中的索引可能因删除谱面而越界
      if (data.length > 0) {
        if (lastSelectedIdx < 0 || lastSelectedIdx >= data.length) setSelected(0);
      }
    });
  }, []);

  // 选曲预览：挂载 & 选中变化 → 上报 App 播放对应歌曲预览
  useEffect(() => {
    const pkg = selected >= 0 && selected < charts.length ? charts[selected] : null;
    onPreview(pkg?.songUrl ?? null);
  }, [selected, charts, onPreview]);
  const [speed, setSpeed] = useState(5.0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [target, setTarget] = useState<'none' | 'fc' | 'ap'>('none');
  const [mirror, setMirror] = useState(false);
  const [correctHitSound, setCorrectHitSound] = useState(false);
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);
  const [sortBy, setSortBy] = useState<'name' | 'difficulty' | 'rks' | 'score'>('name');
  const fileRef = useRef<HTMLInputElement>(null);

  // 列表选择框：绝对定位高亮条，随选中项平滑滑动。
  // 关键：用 useEffect（paint 后）测量 + React state 驱动 transform。若用
  // useLayoutEffect 在绘制前同步改样式，浏览器同一帧只看到最终位置，transition
  // 不会跨帧播放 → 选择框直接跳变（“闪”）。paint 后改值才能让浏览器从旧位置
  // 平滑过渡到新位置。
  const [selPos, setSelPos] = useState<{ top: number; height: number } | null>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = selectedItemRef.current;
    if (!el || selected < 0 || selected >= charts.length) { setSelPos(null); return; }
    setSelPos({ top: el.offsetTop, height: el.offsetHeight });
  }, [selected, charts, sortBy, landscape]);

  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ idx: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close); };
  }, [ctxMenu]);

  // ═══ 派生状态 ═══
  const sel: ChartPackage | null = selected >= 0 ? charts[selected] : null;

  // 音频时长
  const [songDuration, setSongDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!sel?.songUrl) { setSongDuration(null); return; }
    let cancelled = false;
    const audio = new Audio(sel.songUrl);
    const onMeta = () => { if (!cancelled) setSongDuration(audio.duration); };
    audio.addEventListener('loadedmetadata', onMeta);
    if (audio.duration && !isNaN(audio.duration)) setSongDuration(audio.duration);
    return () => { cancelled = true; audio.removeEventListener('loadedmetadata', onMeta); audio.src = ''; };
  }, [sel?.songUrl]);

  // 滑动删除（鼠标+触屏通用）
  const [swipedIdx, setSwipedIdx] = useState<number | null>(null);
  const dragStartX = useRef(0);
  const dragMoved = useRef(false);

  const onDragStart = (e: React.MouseEvent | React.TouchEvent, idx: number) => {
    const cx = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    dragStartX.current = cx;
    dragMoved.current = false;
  };
  const onDragMove = (e: React.MouseEvent | React.TouchEvent, idx: number) => {
    const cx = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const dx = dragStartX.current - cx;
    if (Math.abs(dx) < 10) return;
    dragMoved.current = true;
    if (dx > 30) setSwipedIdx(idx);
    else if (dx < -20) setSwipedIdx(null);
  };
  const onDragEnd = (idx: number) => {
    if (!dragMoved.current) {
      if (swipedIdx === idx) setSwipedIdx(null);
      else setSelected(idx);
    }
    dragStartX.current = 0;
    dragMoved.current = false;
  };

  // 模糊背景
  const bgImgSrc = sel?.illustrationUrl || sel?.coverUrl || null;
  const [staticBg, setStaticBg] = useState<string | null>(null);
  useEffect(() => {
    if (uiBlur || !bgImgSrc) { setStaticBg(null); return; }
    generateBlurredBg(bgImgSrc, 40, 0.25).then(setStaticBg);
  }, [uiBlur, bgImgSrc]);
  const wheelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchMoved = useRef(false);

  useEffect(() => {
    const onResize = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const info = JSON.parse(await zip.file('info.json')!.async('string'));
      const chartJson = await zip.file('chart.json')!.async('string');
      const songFile = zip.file('song.mp3') || zip.file('song.wav') || zip.file('song.ogg') || zip.file('song.m4a') || zip.file('song.flac') || zip.file('song.aac') ||
        (() => { let sf: any = null; zip.forEach((p, f) => { if (!sf && /^song\./.test(p)) sf = f; }); return sf; })();
      const coverFile = zip.file('cover.png') || zip.file('cover.jpg');
      const illusFile = zip.file('illustration.png') || zip.file('illustration.jpg');

      // 转换为 base64 data URL 以持久化存储
      let songUrl: string | null = null;
      if (songFile) {
        const b64 = await songFile.async('base64');
        const mimeMap: Record<string, string> = { ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wma: 'audio/x-ms-wma', opus: 'audio/opus' };
        const ext = songFile.name.split('.').pop() || 'mp3';
        const mime = mimeMap[ext] || 'audio/mpeg';
        songUrl = `data:${mime};base64,${b64}`;
      }
      let coverUrl: string | null = null;
      if (coverFile) {
        const b64 = await coverFile.async('base64');
        coverUrl = `data:image/png;base64,${b64}`;
      }
      let illustrationUrl: string | null = null;
      if (illusFile) {
        const b64 = await illusFile.async('base64');
        illustrationUrl = `data:image/png;base64,${b64}`;
      }
      // 背景视频（zip 内 video.*）→ dataURL 持久化
      const videoFile = (() => { let vf: any = null; zip.forEach((p, f) => { if (!vf && !f.dir && /^video\./i.test(p)) vf = f; }); return vf; })();
      let videoUrl: string | null = null;
      if (videoFile) {
        const b64 = await videoFile.async('base64');
        const vext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
        const vMimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', flv: 'video/x-flv', mov: 'video/quicktime' };
        videoUrl = `data:${vMimeMap[vext] || 'video/mp4'};base64,${b64}`;
      }

      const pkg: ChartPackage = {
        fileName: file.name, title: info.title || 'Unknown', artist: info.artist || '', author: info.author || '',
        difficulty: info.difficulty || 'NM', chartConstant: info.chartConstant || 8.0,
        description: info.description || '', coverUrl, illustrationUrl, songUrl, videoUrl, chartData: chartJson,
        config: JSON.stringify(info.config || {}),
        speed: info.config?.speed ?? 5.0,
      };
      const updated = [...charts, pkg];
      setCharts(updated);
      saveCharts(updated);
    } catch { alert(lang === 'zh' ? '导入失败' : 'Import failed'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const hs = sel ? highScores[sel.fileName] : null;

  // 选谱时用谱面自带流速
  useEffect(() => { if (sel) setSpeed(sel.speed ?? 5.0); }, [selected]);

  const handleDelete = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = charts.filter((_, idx) => idx !== i);
    setCharts(updated);
    saveCharts(updated);
    if (selected === i) setSelected(-1);
    else if (selected > i) setSelected(selected - 1);
  };

  const sortedCharts = [...charts].sort((a, b) => {
    const ha = highScores[a.fileName];
    const hb = highScores[b.fileName];
    switch (sortBy) {
      case 'difficulty': return b.chartConstant - a.chartConstant;
      case 'rks': return (hb?.rks ?? -1) - (ha?.rks ?? -1);
      case 'score': return (hb?.score ?? -1) - (ha?.score ?? -1);
      default: return a.title.localeCompare(b.title);
    }
  });
  // ═══════ 历史分数弹窗 ═══════
  const [showHistory, setShowHistory] = useState(false);
  const [showDiffInfo, setShowDiffInfo] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // 难度/历史弹窗开合 → 音量降档 / 恢复
  useEffect(() => {
    if (showDiffInfo || showHistory) setPreviewVolume(PREVIEW_LOW_VOLUME);
    else setPreviewVolume(PREVIEW_VOLUME);
  }, [showDiffInfo, showHistory]);
  useEffect(() => {
    if (!showHistory) return;
    const onK = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHistory(false); };
    window.addEventListener('keydown', onK);
    return () => window.removeEventListener('keydown', onK);
  }, [showHistory]);

  const _selTrackCount = sel ? (() => { try { return JSON.parse(sel.config).trackCount; } catch { return 4; } })() : 4;
  const historyForSong: HighScoreRecord[] = (() => {
    if (!sel) return [];
    try {
      const all: HighScoreRecord[] = JSON.parse(localStorage.getItem('palab_history') || '[]');
      return all.filter(h =>
        h.config &&
        h.config.chartConstant === sel.chartConstant &&
        h.config.trackCount === _selTrackCount
      ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30);
    } catch { return []; }
  })();

  // ═══════ 滚动列表 ═══════
  const scrollPanel = (
    <div className="cl-scroll">
      <div className="cl-wheel-header">
        <h3 className="cl2-list-title">{lang === 'zh' ? '谱面库' : 'Chart Library'}</h3>
        <input ref={fileRef} type="file" accept=".zip" onChange={handleImport} style={{ display: 'none' }} id="cl-import" />
        <label htmlFor="cl-import" className="btn btn-primary" style={{ cursor: 'pointer', padding: '5px 12px', fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', boxShadow: 'none' }}>{lang === 'zh' ? '导入' : 'Import'}</label>
      </div>
      {charts.length > 0 && (
        <div className="cl2-sort">
          {(['name','difficulty','rks','score'] as const).map(k => (
            <button key={k} className={`cl2-sort-btn ${sortBy === k ? 'active' : ''}`} onClick={() => setSortBy(k)}>
              {k === 'name' ? (lang === 'zh' ? '名称' : 'Name') : k === 'difficulty' ? (lang === 'zh' ? '难度' : 'Diff') : k === 'rks' ? 'RKS' : (lang === 'zh' ? '分数' : 'Score')}
            </button>
          ))}
        </div>
      )}
      {!dbLoaded ? (
        <div className="cl2-empty"><span>::</span><p>{lang === 'zh' ? '加载中...' : 'Loading...'}</p></div>
      ) : charts.length === 0 ? (
        <div className="cl2-empty">
          <span>::</span>
          <p>{lang === 'zh' ? '暂无谱面' : 'No charts'}</p>
          <p>{lang === 'zh' ? '点击导入添加 .zip 谱面' : 'Import a .zip chart'}</p>
        </div>
      ) : (
        <div className="cl-scroll-list">
          {/* 滑动选择框 — transform 驱动，平滑移动 */}
          <div className="cl2-selection" style={selPos ? { transform: `translateY(${selPos.top}px)`, height: selPos.height, opacity: 1 } : { opacity: 0 }} />
          {sortedCharts.map((c) => {
            const chs = highScores[c.fileName];
            const realIdx = charts.indexOf(c);
            const ds = getDiffStyle(c.difficulty);
            const isSwiped = swipedIdx === realIdx;
            return (
            <div key={c.fileName} ref={realIdx === selected ? selectedItemRef : null} style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, marginBottom: 2 }}>
              {/* iOS 滑动删除背景 */}
              {isSwiped && (
              <div style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: 64, background: '#CC2222', borderRadius: '0 10px 10px 0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: 0,
              }} onClick={(e) => { e.stopPropagation(); handleDelete(realIdx, e); setSwipedIdx(null); }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{lang === 'zh' ? '删除' : 'Del'}</span>
              </div>
              )}
              {/* 列表项主体 */}
              <div
                className={`cl2-item ${realIdx === selected ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); }}
                onDoubleClick={() => { if (c.songUrl) { lastSelectedIdx = realIdx; setSelected(realIdx); onPlay(c, c.speed ?? speed, autoPlay, target, mirror, correctHitSound); } }}
                onMouseDown={(e) => onDragStart(e, realIdx)}
                onMouseMove={(e) => { if (dragStartX.current) onDragMove(e, realIdx); }}
                onMouseUp={() => { if (dragStartX.current) onDragEnd(realIdx); }}
                onMouseLeave={() => { if (dragStartX.current) onDragEnd(realIdx); }}
                onTouchStart={(e) => onDragStart(e, realIdx)}
                onTouchMove={(e) => onDragMove(e, realIdx)}
                onTouchEnd={() => onDragEnd(realIdx)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ idx: realIdx, x: e.clientX, y: e.clientY }); }}
                style={{
                  position: 'relative', zIndex: 1,
                  transform: isSwiped ? 'translateX(-64px)' : 'translateX(0)',
                  transition: 'transform 0.2s ease',
                  // 选中高亮只由滑动选择框 .cl2-selection 负责；item 自身不再加背景，
                  // 否则点击瞬间 item 自身先“闪”出背景框，再叠加选择框平移，出现两个选框
                  background: isSwiped ? '#141414' : 'transparent',
                  borderRadius: isSwiped ? '10px 0 0 10px' : 10,
                }}
              >
                {/* 封面 */}
                <div className="cl2-item-cover">{c.coverUrl ? <img src={c.coverUrl} alt="" /> : <span>::</span>}</div>
                {/* 标题 + 作者 */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.artist}{c.author ? ` · ${c.author}` : ''}</div>
                </div>
                {/* 最高分 — 与难度方块同高 (48px) */}
                {chs && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: 48, minWidth: 44, flexShrink: 0,
                  }}>
                    <div style={{
                      fontSize: 24, fontWeight: 800, lineHeight: 1,
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      color: chs.rating === 'AP' ? '#FFD700' : chs.rating === 'V' ? '#00E5FF' : chs.rating === 'S' ? '#FF6B6B' : '#ccc',
                    }}>{chs.rating}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', marginTop: 1 }}>{chs.rks.toFixed(2)}</div>
                  </div>
                )}
                {/* 难度方块 */}
                <div style={{
                  width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                  background: ds.bg, color: ds.fg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{c.chartConstant.toFixed(1)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginTop: 1 }}>{c.difficulty} · {((): number => { try { return JSON.parse(c.config).trackCount; } catch { return 4; } })()}K</div>
                </div>
              </div>
            </div>
          )})}
        </div>
      )}
      {/* 右键菜单 */}
      {ctxMenu && (
        <div style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 999,
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: 4, minWidth: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <div
            onClick={(e) => { e.stopPropagation(); handleDelete(ctxMenu.idx, e as any); setCtxMenu(null); }}
            style={{
              padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
              color: '#E53E3E', fontSize: 13, fontWeight: 600,
            }}
          >{lang === 'zh' ? '删除' : 'Delete'}</div>
        </div>
      )}
    </div>
  );

  // ═══════ 详情 (封面左 + 信息右 + 控件下) ═══════
  const _diffStyle = sel ? getDiffStyle(sel.difficulty) : null;
  const _cfgBpm = sel ? (() => { try { return JSON.parse(sel.config).bpm; } catch { return '?'; } })() : '?';
  const _cfgKeys = sel ? (() => { try { return JSON.parse(sel.config).trackCount + 'K'; } catch { return '?K'; } })() : '?K';
  const _artSize = landscape
    ? 'clamp(140px, 15vw, 240px)'
    : 'clamp(120px, 32vw, 200px)';

  const detailPanel = sel ? (
    <div key={sel.fileName} className="cl2-detail-in" style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      padding: landscape ? 'clamp(14px,2vh,24px) clamp(18px,2vw,32px)' : '8px 10px',
      gap: 0,
    }}>
      {/* ═══ 上半部分：封面左 + 信息右 ═══ */}
      <div style={{ display: 'flex', gap: landscape ? 'clamp(14px,2vw,24px)' : 14, alignItems: 'stretch', flexShrink: 0 }}>
        {/* 封面 */}
        <div style={{
          width: _artSize, aspectRatio: '1', borderRadius: 'clamp(12px,1.5vw,20px)',
          overflow: 'hidden', flexShrink: 0,
          background: 'rgba(255,255,255,0.03)',
          boxShadow: '0 6px 32px rgba(0,0,0,0.5)',
        }}>
          {sel.coverUrl
            ? <img src={sel.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(28px,3vw,48px)', opacity: 0.08, color: '#fff' }}>::</div>
          }
        </div>

        {/* 右侧 3 层 — 与封面齐高，竖屏均分间距消空白 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: landscape ? 4 : 0, justifyContent: landscape ? undefined : 'space-evenly' }}>
          {/* Layer 1: 大标题 */}
          <div style={{
            fontSize: landscape ? 'clamp(20px,2.6vw,38px)' : 'clamp(16px,5vw,26px)',
            fontWeight: 800, color: '#fff', lineHeight: 1.15,
            wordBreak: 'break-word', flexShrink: 0,
          }}>{sel.title}</div>

          {/* Layer 2: 作者+谱师 — 横排，右边跟歌曲信息 */}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0, fontSize: landscape ? 'clamp(10px,1.2vw,14px)' : 'clamp(10px,2.5vw,12px)', color: '#666', alignItems: 'baseline' }}>
            {sel.artist && <span style={{ color: '#999' }}>{sel.artist}</span>}
            <span>{lang === 'zh' ? '谱师: ' : 'By: '}{sel.author || '-'}</span>
            <span style={{ marginLeft: 'auto', color: '#555', fontSize: landscape ? 'clamp(9px,0.9vw,11px)' : 10 }}>
              BPM {_cfgBpm}{songDuration != null && !isNaN(songDuration) ? ` · ${Math.floor(songDuration / 60)}:${String(Math.floor(songDuration % 60)).padStart(2, '0')}` : ''}
            </span>
          </div>

          {/* Layer 3a: 难度按钮 */}
          <div
            onClick={() => setShowDiffInfo(v => !v)}
            style={{
              cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.04)', borderRadius: 'clamp(6px,0.8vw,10px)',
              padding: 'clamp(6px,0.8vh,10px) clamp(8px,1vw,14px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ fontSize: landscape ? 'clamp(11px,1.2vw,15px)' : 13, fontWeight: 700, color: '#aaa', letterSpacing: 2 }}>
              {lang === 'zh' ? '难度' : 'Difficulty'}
            </span>
            <div style={{ display: 'flex', gap: 'clamp(4px,0.8vw,8px)', alignItems: 'center' }}>
              <span style={{
                background: _diffStyle!.bg, color: _diffStyle!.fg,
                fontSize: landscape ? 'clamp(11px,1.3vw,18px)' : 'clamp(11px,3.5vw,16px)',
                fontWeight: 800, padding: 'clamp(2px,0.3vw,5px) clamp(8px,1.2vw,14px)',
                borderRadius: 'clamp(4px,0.7vw,8px)', letterSpacing: 1,
              }}>{sel.difficulty}</span>
              <span style={{ fontSize: landscape ? 'clamp(16px,2vw,28px)' : 'clamp(15px,4.5vw,24px)', fontWeight: 800, color: '#fff' }}>{sel.chartConstant.toFixed(1)}</span>
            </div>
          </div>

          {/* 难度信息弹窗 */}
          {showDiffInfo && (
            <div onClick={() => setShowDiffInfo(false)} style={{
              position: 'fixed', inset: 0, zIndex: 1001,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: uiBlur ? 'blur(24px)' : 'none',
              WebkitBackdropFilter: uiBlur ? 'blur(24px)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: uiBlur ? 'rgba(22,22,22,0.75)' : '#161616',
                backdropFilter: uiBlur ? 'blur(20px)' : 'none',
                WebkitBackdropFilter: uiBlur ? 'blur(20px)' : 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 'clamp(10px,1.2vw,16px)', padding: 'clamp(16px,2vh,24px)',
                width: landscape ? 'clamp(280px,35vw,440px)' : 'clamp(250px,75vw,360px)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 'clamp(14px,1.5vw,18px)', fontWeight: 700, color: '#ddd' }}>
                    {lang === 'zh' ? '难度定数说明' : 'Chart Constant'}
                  </span>
                  <span onClick={() => setShowDiffInfo(false)} style={{ fontSize: 18, color: '#666', cursor: 'pointer' }}>✕</span>
                </div>
                <div style={{ fontSize: 'clamp(12px,1.2vw,14px)', color: '#999', lineHeight: 1.8 }}>
                  <p>{lang === 'zh' ? '难度定数范围：1.0 ~ 18.0' : 'Range: 1.0 ~ 18.0'}</p>
                  {(['EZ','NM','HD','IN','AT'] as const).map(d => {
                    const ds = getDiffStyle(d);
                    return (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ background: ds.bg, color: ds.fg, fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 4 }}>{d}</span>
                        <span style={{ color: '#777' }}>
                          {d === 'EZ' ? '1.0-4.9' : d === 'NM' ? '5.0-7.9' : d === 'HD' ? '8.0-11.9' : d === 'IN' ? '12.0-15.9' : '16.0-18.0'}
                          {d === sel.difficulty && <span style={{ color: '#fff', marginLeft: 6 }}>← {lang === 'zh' ? '当前' : 'current'}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Layer 3b: 历史按钮 */}
          <div
            onClick={() => { if (historyForSong.length > 0 || hs) setShowHistory(v => !v); }}
            style={{
              cursor: (historyForSong.length > 0 || hs) ? 'pointer' : 'default', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.04)', borderRadius: 'clamp(6px,0.8vw,10px)',
              padding: 'clamp(6px,0.8vh,10px) clamp(8px,1vw,14px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ fontSize: landscape ? 'clamp(11px,1.2vw,15px)' : 13, fontWeight: 700, color: '#aaa', letterSpacing: 2 }}>
              {lang === 'zh' ? '历史' : 'History'}
            </span>
            {hs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: landscape ? 'clamp(18px,2.2vw,28px)' : 'clamp(16px,5vw,24px)',
                  fontWeight: 800,
                  fontFamily: "'Georgia', 'Times New Roman', serif",
                  color: hs.rating === 'AP' ? '#FFD700' : hs.rating === 'V' ? '#00E5FF' : hs.rating === 'S' ? '#FF6B6B' : '#ccc',
                  lineHeight: 1,
                }}>{hs.rating}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: landscape ? 'clamp(11px,1.2vw,15px)' : 12, fontWeight: 700, color: '#ddd' }}>{hs.rks.toFixed(2)}</div>
                  <div style={{ fontSize: landscape ? 'clamp(8px,0.8vw,10px)' : 9, color: '#666' }}>{hs.score.toLocaleString()}</div>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 'clamp(10px,1vw,12px)', color: '#444' }}>{lang === 'zh' ? '暂无记录' : 'No record'}</span>
            )}
          </div>
        </div>
      </div>

      {/* 历史分数居中弹窗 */}
      {showHistory && historyForSong.length > 0 && (
        <div
          onClick={() => setShowHistory(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: uiBlur ? 'blur(24px)' : 'none',
            WebkitBackdropFilter: uiBlur ? 'blur(24px)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            ref={historyRef}
            onClick={e => e.stopPropagation()}
            style={{
              background: uiBlur ? 'rgba(22,22,22,0.75)' : '#161616',
              backdropFilter: uiBlur ? 'blur(20px)' : 'none',
              WebkitBackdropFilter: uiBlur ? 'blur(20px)' : 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 'clamp(10px,1.2vw,16px)', padding: 'clamp(14px,2vh,20px)',
              width: landscape ? 'clamp(300px,40vw,500px)' : 'clamp(260px,80vw,380px)',
              maxHeight: 'clamp(300px,50vh,500px)', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 6,
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 'clamp(14px,1.5vw,18px)', fontWeight: 700, color: '#ddd', letterSpacing: 1 }}>
                {lang === 'zh' ? '历史记录' : 'History'} — {sel.title}
              </span>
              <span onClick={() => setShowHistory(false)} style={{ fontSize: 18, color: '#666', cursor: 'pointer', padding: '0 4px' }}>✕</span>
            </div>
            {historyForSong.map((h, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 'clamp(6px,0.8vh,10px) 10px',
              borderRadius: 6, background: i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent',
            }}>
              <span style={{ fontSize: 'clamp(18px,2.5vw,28px)', fontWeight: 800, fontFamily: "'Georgia', 'Times New Roman', serif", color: h.rating === 'AP' ? '#FFD700' : h.rating === 'V' ? '#00E5FF' : h.rating === 'S' ? '#FF6B6B' : '#888', minWidth: 'clamp(28px,4vw,40px)' }}>{h.rating}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'clamp(10px,1.1vw,13px)', color: '#ccc' }}>{h.score.toLocaleString()}</div>
                <div style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: '#555' }}>
                  {(() => {
                    const t = h.perfect + h.good + h.bad + h.miss;
                    const acc = t > 0 ? (h.perfect + h.good * 0.65) / t : 0;
                    return `${(acc * 100).toFixed(2)}% · P${h.perfect} G${h.good} B${h.bad} M${h.miss} · ${h.date}`;
                  })()}
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* ═══ 下半部分：控件 ═══ */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: landscape ? undefined : 1,
        justifyContent: landscape ? undefined : 'space-evenly',
        marginTop: landscape ? 'auto' : 10,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: landscape ? 8 : 10,
        gap: landscape ? 8 : 0,
        minHeight: 0,
      }}>
        {/* 下半部分：左 Speed+Target | 右 Auto/Mirror 竖排 */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {/* 左：Speed + Target */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: landscape ? 6 : 12, minWidth: 0 }}>
            {/* Speed */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: '#999', fontWeight: 600, minWidth: 42 }}>SPEED</span>
              <input type="range" min={1} max={10} step={0.1} value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} style={{ flex: 1, accentColor: '#fff', height: 4 }} />
              <span style={{ fontSize: 'clamp(10px,1.1vw,13px)', fontWeight: 700, color: '#fff', minWidth: 36, textAlign: 'right' }}>{speed.toFixed(1)}x</span>
            </div>
            {/* Target */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: '#999' }}>{lang === 'zh' ? '目标' : 'Target'}</span>
              <div style={{ display: 'flex', gap: 2, flex: 1 }}>
                {(['none','fc','ap'] as const).map(t => (
                  <button key={t} onClick={() => setTarget(t)} style={{
                    flex: 1, padding: landscape ? 'clamp(3px,0.4vw,5px) 0' : 'clamp(6px,0.8vh,10px) 0',
                    borderRadius: 'clamp(4px,0.6vw,7px)',
                    border: target === t ? '1px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                    background: target === t ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: target === t ? '#fff' : '#666',
                    fontSize: 'clamp(10px,1vw,12px)', cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                    fontWeight: target === t ? 700 : 400,
                    letterSpacing: 1, transition: 'all 0.15s',
                  }}>{t === 'none' ? (lang === 'zh' ? '无' : 'None') : t.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          {/* 右：Auto play + Mirror 竖排 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: landscape ? 'clamp(4px,0.6vh,8px)' : 10, justifyContent: 'center', minWidth: landscape ? 'clamp(80px,9vw,110px)' : 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: '#999' }}>Auto play</span>
              <label className="toggle-switch"><input type="checkbox" checked={autoPlay} onChange={e => setAutoPlay(e.target.checked)} /><span className="toggle-slider" /></label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: '#999' }}>{lang === 'zh' ? '镜像' : 'Mirror'}</span>
              <label className="toggle-switch"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} /><span className="toggle-slider" /></label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: correctHitSound ? '#FFD700' : '#999' }}>{lang === 'zh' ? '正解音' : 'Correct SFX'}</span>
              <label className="toggle-switch"><input type="checkbox" checked={correctHitSound} onChange={e => setCorrectHitSound(e.target.checked)} /><span className="toggle-slider" /></label>
            </div>
          </div>
        </div>

        {/* Buttons — 全宽 */}
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={onSettings} style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'clamp(10px,1vw,14px)', color: '#999',
            fontSize: 'clamp(13px,1.3vw,16px)', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--font-main)', letterSpacing: 'clamp(2px,0.3vw,4px)',
            padding: 'clamp(10px,1vh,16px) 0',
          }}>{lang === 'zh' ? '设置' : 'Settings'}</button>
          <button onClick={() => { lastSelectedIdx = selected; onPlay(sel, speed, autoPlay, target, mirror, correctHitSound); }} disabled={!sel.songUrl} style={{
            flex: 2, border: 'none',
            borderRadius: 'clamp(10px,1vw,14px)',
            fontSize: 'clamp(14px,1.5vw,20px)', fontWeight: 800, cursor: sel.songUrl ? 'pointer' : 'default',
            fontFamily: 'var(--font-main)', letterSpacing: 'clamp(4px,0.5vw,6px)',
            padding: 'clamp(10px,1vh,16px) 0',
            background: sel.songUrl ? '#fff' : 'rgba(255,255,255,0.03)',
            color: sel.songUrl ? '#000' : '#444',
          }}>
            {sel.songUrl ? 'START' : (lang === 'zh' ? '无歌曲文件' : 'No song file')}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="cl2-detail cl2-detail-empty">
      <span>::</span>
      <p>{lang === 'zh' ? '选择左侧谱面' : 'Select a chart'}</p>
    </div>
  );

  return (
    <div className="screen cl-screen">
      <div className={landscape ? 'cl2-landscape' : 'cl2-portrait'}>
        <div className="cl2-panel cl2-panel-list">
          {scrollPanel}
        </div>
        <div className="cl2-panel cl2-panel-detail" style={
          staticBg ? { backgroundImage: `url(${staticBg})` } : undefined
        }>
          {/* 实时模糊背景层 — 不影响上层内容 */}
          {uiBlur && bgImgSrc && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0,
              backgroundImage: `url(${bgImgSrc})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(40px) brightness(0.25)',
            }} />
          )}
          {detailPanel}
        </div>
      </div>
    </div>
  );
};
