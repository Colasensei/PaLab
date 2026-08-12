import React, { useState, useRef, useEffect } from 'react';
import { t, Lang } from '@/utils/lang';
import { GameConfig, Note, constantToDifficulty } from '@/types';
import JSZip from 'jszip';
import { saveZipBlob } from '@/utils/zipSave';
import { loadCharts, saveCharts } from '@/utils/chartDB';
import type { ChartPackage } from '@/components/ChartLibrary';

/** 难度选项（导出时可自由选择，对应定数区间） */
const DIFF_OPTIONS = ['EZ', 'NM', 'HD', 'IN', 'AT'];
/** 选择难度时设定的推荐定数（各难度区间中值，与 constantToDifficulty 阈值一致） */
const DIFF_RECOMMEND: Record<string, number> = {
  EZ: 3.0, NM: 7.0, HD: 10.5, IN: 14.0, AT: 17.0,
};

interface Props {
  config: GameConfig;
  notes: Note[];
  onBack: () => void;
  lang: Lang;
}


export const ChartEditor: React.FC<Props> = ({ config, notes, onBack, lang }) => {
  const [title, setTitle] = useState(config.chartTitle || config.songFileName?.replace(/\.[^.]+$/, '') || '');
  const [artist, setArtist] = useState(config.chartArtist || '');
  const [author, setAuthor] = useState(config.chartAuthor || '');
  const [description, setDescription] = useState('');
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState('');
  const [illusDataUrl, setIllusDataUrl] = useState<string | null>(null);
  const [illusFileName, setIllusFileName] = useState('');
  const [songDataUrl, setSongDataUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [chartConst, setChartConst] = useState(config.chartConstant);

  // 预先将 blob URL 转为稳定的 data URL
  useEffect(() => {
    if (!config.songUrl) return;
    if (config.songUrl.startsWith('blob:')) {
      fetch(config.songUrl).then(r => r.blob()).then(b => {
        const reader = new FileReader();
        reader.onload = () => setSongDataUrl(reader.result as string);
        reader.readAsDataURL(b);
      }).catch(() => {});
    } else {
      setSongDataUrl(config.songUrl);
    }
  }, [config.songUrl]);

  // 预填曲绘（OSU 导入的 blob URL → data URL，保证导出可用）
  useEffect(() => {
    if (!config.coverUrl) return;
    if (config.coverUrl.startsWith('blob:')) {
      fetch(config.coverUrl).then(r => r.blob()).then(b => {
        const reader = new FileReader();
        reader.onload = () => { setCoverDataUrl(reader.result as string); setCoverFileName(config.coverFileName || 'cover.png'); };
        reader.readAsDataURL(b);
      }).catch(() => {});
    } else {
      setCoverDataUrl(config.coverUrl);
      setCoverFileName(config.coverFileName || 'cover.png');
    }
  }, [config.coverUrl, config.coverFileName]);
  const coverRef = useRef<HTMLInputElement>(null);
  const illusRef = useRef<HTMLInputElement>(null);

  const diffLabel = constantToDifficulty(chartConst);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleIllusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIllusFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setIllusDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  // 打包谱面为 zip（导出 / 导出并导入共用）
  const buildChartZip = async () => {
    const zip = new JSZip();
    // 背景视频：把 config.videoUrl（编辑器导入时是 ObjectURL）转成 zip 内文件 video.<ext>
    let videoBlob: Blob | null = null;
    if (config.videoUrl) {
      try { videoBlob = await (await fetch(config.videoUrl)).blob(); } catch { videoBlob = null; }
    }
    const rawVExt = videoBlob ? (videoBlob.type.split('/')[1] || '').split(';')[0] : '';
    const videoExt = videoBlob ? (/^[a-z0-9]{2,5}$/i.test(rawVExt) ? rawVExt : 'mp4') : null;
    const info = {
      title: title || config.songFileName || 'Untitled',
      artist, author,
      difficulty: diffLabel,
      chartConstant: chartConst,
      description,
      config: { bpm: config.bpm, trackCount: config.trackCount, chartConstant: chartConst, speed: config.speedMultiplier, splits: config.splits, videoUrl: videoBlob && videoExt ? `video.${videoExt}` : undefined, videoBlur: config.videoBlur ?? true, videoSound: config.videoSound ?? false },
    };
    zip.file('info.json', JSON.stringify(info, null, 2));
    zip.file('chart.json', JSON.stringify(notes));
    if (songDataUrl) {
      const base64 = songDataUrl.split(',')[1];
      const mime = songDataUrl.split(';')[0].split(':')[1] || 'audio/mpeg';
      const extMap: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac' };
      const fallbackExt = config.songFileName?.split('.').pop() || '';
      const ext = extMap[mime] || (/^[a-z0-9]{2,5}$/i.test(fallbackExt) ? fallbackExt : 'mp3');
      zip.file(`song.${ext}`, base64, { base64: true });
    }
    if (coverDataUrl) {
      const base64 = coverDataUrl.split(',')[1];
      zip.file('cover.png', base64, { base64: true });
    }
    if (illusDataUrl) {
      const base64 = illusDataUrl.split(',')[1];
      zip.file('illustration.png', base64, { base64: true });
    }
    if (videoBlob && videoExt) {
      zip.file(`video.${videoExt}`, videoBlob);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const name = (title || 'chart').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') + '.zip';
    return { blob, name, info };
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, name } = await buildChartZip();
      await saveZipBlob(blob, name);
    } catch (err) {
      alert(lang === 'zh' ? '导出失败' : 'Export failed');
    }
    setExporting(false);
  };

  // 导出并同步导入至谱面库（省去手动再导入）
  const handleExportToLibrary = async () => {
    setExporting(true);
    try {
      const { blob, name, info } = await buildChartZip();
      const zip = await JSZip.loadAsync(blob);
      const chartJson = await zip.file('chart.json')!.async('string');
      const songFile = zip.file('song.mp3') || zip.file('song.wav') || zip.file('song.ogg') || zip.file('song.m4a') || zip.file('song.flac') || zip.file('song.aac') ||
        (() => { let sf: any = null; zip.forEach((p, f) => { if (!sf && /^song\./.test(p)) sf = f; }); return sf; })();
      const coverFile = zip.file('cover.png') || zip.file('cover.jpg');
      const illusFile = zip.file('illustration.png') || zip.file('illustration.jpg');
      const videoFile = (() => { let vf: any = null; zip.forEach((p, f) => { if (!vf && !f.dir && /^video\./i.test(p)) vf = f; }); return vf; })();

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
      let videoUrl: string | null = null;
      if (videoFile) {
        const b64 = await videoFile.async('base64');
        const vext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
        const vMimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', flv: 'video/x-flv', mov: 'video/quicktime' };
        videoUrl = `data:${vMimeMap[vext] || 'video/mp4'};base64,${b64}`;
      }

      const pkg: ChartPackage = {
        fileName: name, title: info.title || 'Unknown', artist: info.artist || '', author: info.author || '',
        difficulty: info.difficulty || 'NM', chartConstant: info.chartConstant || 8.0,
        description: info.description || '', coverUrl, illustrationUrl, songUrl, videoUrl, chartData: chartJson,
        config: JSON.stringify(info.config || {}),
        speed: info.config?.speed ?? 5.0,
      };
      const charts = await loadCharts();
      await saveCharts([...charts, pkg]);
      alert(lang === 'zh' ? '已导出并导入至谱面库' : 'Exported & added to chart library');
    } catch (err) {
      alert(lang === 'zh' ? '导出并导入失败' : 'Export & import failed');
    }
    setExporting(false);
  };

  return (
    <div className="screen" style={{ padding: '60px 20px 20px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ letterSpacing: 4, fontSize: 17, textAlign: 'center' }}>{lang === 'zh' ? '谱面编辑器' : 'Chart Editor'}</h2>

        {/* 封面 */}
        <div className="ce-cover-section">
          <div className="ce-cover-box" onClick={() => coverRef.current?.click()}>
            {coverDataUrl ? (
              <img src={coverDataUrl} alt="" />
            ) : (
              <span>{lang === 'zh' ? '点击上传封面' : 'Tap to upload cover'}</span>
            )}
          </div>
          <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverChange} style={{ display: 'none' }} />
          {coverFileName && <p className="ce-cover-name">{coverFileName}</p>}
        </div>

        {/* 曲绘 */}
        <div className="ce-cover-section">
          <div className="ce-cover-box ce-illus-box" onClick={() => illusRef.current?.click()}>
            {illusDataUrl ? (
              <img src={illusDataUrl} alt="" />
            ) : (
              <span>{lang === 'zh' ? '点击上传曲绘' : 'Tap to upload illustration'}</span>
            )}
          </div>
          <input ref={illusRef} type="file" accept="image/*" onChange={handleIllusChange} style={{ display: 'none' }} />
          {illusFileName && <p className="ce-cover-name">{illusFileName}</p>}
          <p className="ce-illus-hint">{lang === 'zh' ? '曲绘在游玩时作为模糊背景显示' : 'Blurred background during gameplay'}</p>
        </div>

        <div className="st-card">
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '标题' : 'Title'}</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="ce-input" placeholder={lang === 'zh' ? '歌名' : 'Song title'} /></div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '曲师' : 'Artist'}</span>
            <input value={artist} onChange={e => setArtist(e.target.value)} className="ce-input" placeholder="Artist" /></div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '谱师' : 'Author'}</span>
            <input value={author} onChange={e => setAuthor(e.target.value)} className="ce-input" placeholder={lang === 'zh' ? '你的名字' : 'Your name'} /></div>
          <div className="st-row st-row-noborder"><span className="st-label">{lang === 'zh' ? '简介' : 'Desc'}</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="ce-input ce-textarea"
              placeholder={lang === 'zh' ? '谱面说明...' : 'Description...'} /></div>
        </div>

        {/* 难度与定数（可自由编辑） */}
        <div className="st-card ce-locked">
          <div className="ce-locked-row"><span className="st-label">{lang === 'zh' ? '难度' : 'Difficulty'}</span>
            <select className="ce-select" value={diffLabel} onChange={e => setChartConst(DIFF_RECOMMEND[e.target.value])}>
              {DIFF_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="ce-locked-row">
            <span className="st-label">{lang === 'zh' ? '定数' : 'Const'}</span>
            <div className="ce-const-adj">
              <button className="ce-const-btn" onClick={() => setChartConst(c => Math.max(1, c - 0.5))} disabled={chartConst <= 1}>−</button>
              <span className="ce-const-val">{chartConst.toFixed(1)}</span>
              <button className="ce-const-btn" onClick={() => setChartConst(c => Math.min(25, c + 0.5))} disabled={chartConst >= 25}>+</button>
            </div>
          </div>
          <div className="ce-locked-row"><span className="st-label">BPM</span><span className="ce-locked-val">{config.bpm}</span></div>
          <div className="ce-locked-row ce-locked-row-last"><span className="st-label">{lang === 'zh' ? '轨道' : 'Tracks'}</span><span className="ce-locked-val">{config.trackCount}K</span></div>
          <p className="ce-locked-hint">{lang === 'zh' ? '难度与定数可自由调整' : 'Difficulty & const are editable'}</p>
        </div>

        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}
          style={{ width: '100%', padding: 14, fontSize: 15, letterSpacing: 3 }}>
          {exporting ? (lang === 'zh' ? '打包中...' : 'Exporting...') : (lang === 'zh' ? '保存为 Zip' : 'Save as Zip')}
        </button>
        <button className="btn btn-primary" onClick={handleExportToLibrary} disabled={exporting}
          style={{ width: '100%', padding: 14, fontSize: 15, letterSpacing: 3, background: 'linear-gradient(135deg,#3d5afe,#7c4dff)', border: 'none' }}>
          {exporting ? (lang === 'zh' ? '打包中...' : 'Exporting...') : (lang === 'zh' ? '导出并导入至谱面库' : 'Export & Add to Library')}
        </button>
      </div>
    </div>
  );
};
