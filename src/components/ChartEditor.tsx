import React, { useState, useRef, useEffect } from 'react';
import { t, Lang } from '@/utils/lang';
import { GameConfig, Note, constantToDifficulty, getDiffColor } from '@/types';
import JSZip from 'jszip';
import { saveZipBlob } from '@/utils/zipSave';

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
  const baseConst = config.chartConstant;

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

  const diffLabel = constantToDifficulty(config.chartConstant);
  const diffColor = getDiffColor(diffLabel) || '#FFF';

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      const info = {
        title: title || config.songFileName || 'Untitled',
        artist, author,
        difficulty: diffLabel,
        chartConstant: chartConst,
        description,
        config: { bpm: config.bpm, trackCount: config.trackCount, chartConstant: chartConst, speed: config.speedMultiplier, splits: config.splits },
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

      const blob = await zip.generateAsync({ type: 'blob' });
      const name = (title || 'chart').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') + '.zip';
      await saveZipBlob(blob, name);
    } catch (err) {
      alert(lang === 'zh' ? '导出失败' : 'Export failed');
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

        {/* 难度调节（±5） */}
        <div className="st-card ce-locked">
          <div className="ce-locked-row"><span className="st-label">{lang === 'zh' ? '难度' : 'Difficulty'}</span><span className="ce-locked-val" style={{ color: diffColor, fontWeight: 700 }}>{constantToDifficulty(chartConst)}</span></div>
          <div className="ce-locked-row">
            <span className="st-label">{lang === 'zh' ? '定数' : 'Const'}</span>
            <div className="ce-const-adj">
              <button className="ce-const-btn" onClick={() => setChartConst(c => Math.max(1, c - 0.5))} disabled={chartConst <= Math.max(1, baseConst - 5)}>−</button>
              <span className="ce-const-val">{chartConst.toFixed(1)}</span>
              <button className="ce-const-btn" onClick={() => setChartConst(c => Math.min(25, c + 0.5))} disabled={chartConst >= Math.min(25, baseConst + 5)}>+</button>
            </div>
          </div>
          <div className="ce-locked-row"><span className="st-label">BPM</span><span className="ce-locked-val">{config.bpm}</span></div>
          <div className="ce-locked-row ce-locked-row-last"><span className="st-label">{lang === 'zh' ? '轨道' : 'Tracks'}</span><span className="ce-locked-val">{config.trackCount}K</span></div>
          <p className="ce-locked-hint">{lang === 'zh' ? '难度和参数不可更改' : 'Difficulty & params are locked'}</p>
        </div>

        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}
          style={{ width: '100%', padding: 14, fontSize: 15, letterSpacing: 3 }}>
          {exporting ? (lang === 'zh' ? '打包中...' : 'Exporting...') : (lang === 'zh' ? '保存为 Zip' : 'Save as Zip')}
        </button>
      </div>
    </div>
  );
};
