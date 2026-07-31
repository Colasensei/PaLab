import React, { useState, useRef } from 'react';
import { Lang } from '@/utils/lang';
import { analyzeAudio } from '@/utils';
import { Note } from '@/types';
import JSZip from 'jszip';
import { parseOsuBeatmap, extractOsuLabel } from '@/utils/osuParser';

interface EditorConfig {
  bpm: number;
  trackCount: number;
  songUrl: string;
  songFileName: string;
  existingNotes?: Note[];
  title?: string;
  artist?: string;
  author?: string;
  coverUrl?: string;
  coverFileName?: string;
}

interface Props {
  onConfirm: (config: EditorConfig) => void;
  onBack: () => void;
  lang: Lang;
}

const TRACK_COUNTS = [2, 4, 6, 8];

export const EditorSetup: React.FC<Props> = ({ onConfirm, onBack, lang }) => {
  const [bpm, setBpm] = useState('120');
  const [trackCount, setTrackCount] = useState(4);
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songName, setSongName] = useState('');
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const osuInputRef = useRef<HTMLInputElement>(null);
  const osuZipRef = useRef<JSZip | null>(null);
  const [importingOsu, setImportingOsu] = useState(false);
  const [osuChoices, setOsuChoices] = useState<{ path: string; label: string }[] | null>(null);
  const pendingRef = useRef<{ file: File; url: string; rd: { bpm: number } | null } | null>(null);
  const existingNotesRef = useRef<Note[] | undefined>(undefined);

  const handleSongSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setSongFile(file);
    setSongName(file.name);
    const url = URL.createObjectURL(file);
    setSongUrl(url);
    setAnalyzing(true);

    let rd: { bpm: number } | null = null;
    try { rd = await analyzeAudio(file); } catch { /* */ }
    setAnalyzing(false);

    pendingRef.current = { file, url, rd };
    setShowDisclaimer(true);
  };

  const handleDisclaimerAgree = () => {
    if (!pendingRef.current) return;
    const { rd } = pendingRef.current;
    pendingRef.current = null;
    setShowDisclaimer(false);
    if (rd) setBpm(String(Math.round(rd.bpm)));
  };

  const handleDisclaimerCancel = () => {
    if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
    pendingRef.current = null;
    setShowDisclaimer(false);
    setSongFile(null);
    setSongName('');
    if (songUrl) { URL.revokeObjectURL(songUrl); setSongUrl(null); }
  };

  const handleClearSong = () => {
    setSongFile(null);
    setSongName('');
    if (songUrl) URL.revokeObjectURL(songUrl);
    setSongUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if (!songUrl) return;
    onConfirm({
      bpm: parseInt(bpm) || 120,
      trackCount,
      songUrl,
      songFileName: songName,
      existingNotes: existingNotesRef.current,
    });
  };

  // Zip 谱面包导入
  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingZip(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const infoFile = zip.file('info.json');
      const chartFile = zip.file('chart.json');
      if (!infoFile || !chartFile) { alert(lang === 'zh' ? '无效的谱面包' : 'Invalid chart package'); setImportingZip(false); return; }
      const info = JSON.parse(await infoFile.async('string'));
      const chartNotes: Note[] = JSON.parse(await chartFile.async('string'));
      // 尝试加载音频（已知格式 + 兜底：任意 song.* 文件）
      const songExts = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'wma', 'opus'];
      let songBlob: Blob | null = null;
      let songExt = 'mp3';
      for (const ext of songExts) {
        const f = zip.file(`song.${ext}`);
        if (f) { songBlob = await f.async('blob'); songExt = ext; break; }
      }
      // 兜底：遍历 zip 中所有以 song. 开头的文件
      if (!songBlob) {
        zip.forEach((relPath, file) => {
          if (!songBlob && /^song\./.test(relPath)) {
            const ext = relPath.split('.').pop() || 'mp3';
            file.async('blob').then(b => { songBlob = b; songExt = ext; });
          }
        });
        // 等待异步兜底完成
        await new Promise(r => setTimeout(r, 100));
      }
      if (songBlob) {
        const url = URL.createObjectURL(songBlob);
        if (songUrl) URL.revokeObjectURL(songUrl);
        setSongUrl(url);
        setSongName(info.title ? `${info.title}.${songExt}` : `song.${songExt}`);
        // 分析 BPM
        const audioFile = new File([songBlob], `song.${songExt}`, { type: `audio/${songExt}` });
        let rd: { bpm: number } | null = null;
        try { rd = await analyzeAudio(audioFile); } catch { /* */ }
        if (rd) setBpm(String(Math.round(rd.bpm)));
        else if (info.config?.bpm) setBpm(String(info.config.bpm));
      } else if (info.config?.bpm) {
        setBpm(String(info.config.bpm));
      }
      if (info.config?.trackCount) setTrackCount(info.config.trackCount);
      if (info.title) setSongName(info.title);
      existingNotesRef.current = chartNotes;
    } catch { alert(lang === 'zh' ? '导入失败' : 'Import failed'); }
    setImportingZip(false);
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  // osu! 谱面包导入 (.osz)
  const handleOsuImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingOsu(true);
    try {
      const zip = await JSZip.loadAsync(file);
      osuZipRef.current = zip;
      // 收集所有 .osu 谱面文件
      const osuFiles: { path: string }[] = [];
      zip.forEach((relPath, entry) => {
        if (!entry.dir && /\.osu$/i.test(relPath)) osuFiles.push({ path: relPath });
      });
      if (osuFiles.length === 0) {
        alert(lang === 'zh' ? '谱面包中未找到 .osu 谱面文件' : 'No .osu file found in the pack');
        setImportingOsu(false);
        if (osuInputRef.current) osuInputRef.current.value = '';
        return;
      }
      // 预解析出标题/难度，用于选择列表
      const labeled = await Promise.all(osuFiles.map(async f => {
        try {
          const text = await zip.file(f.path)!.async('string');
          return { path: f.path, label: extractOsuLabel(text) };
        } catch { return { path: f.path, label: f.path }; }
      }));
      if (labeled.length === 1) {
        await finishOsuImport(labeled[0].path);
      } else {
        setOsuChoices(labeled);
      }
    } catch {
      alert(lang === 'zh' ? 'OSU 谱面包解析失败' : 'Failed to parse osu! pack');
    }
    setImportingOsu(false);
    if (osuInputRef.current) osuInputRef.current.value = '';
  };

  const finishOsuImport = async (path: string) => {
    const zip = osuZipRef.current;
    setOsuChoices(null);
    if (!zip) return;
    try {
      const text = await zip.file(path)!.async('string');
      const parsed = parseOsuBeatmap(text);
      if (parsed.notes.length === 0) {
        alert(lang === 'zh' ? '该谱面没有音符' : 'This beatmap has no notes');
        return;
      }
      const audioEntry = findAudioInZip(zip, parsed.audioFilename);
      if (!audioEntry) {
        alert(lang === 'zh' ? '谱面包中未找到音频文件' : 'No audio file found in the pack');
        return;
      }
      const blob = await audioEntry.async('blob');
      const url = URL.createObjectURL(blob);
      if (songUrl) URL.revokeObjectURL(songUrl);
      // 提取曲绘（背景图）—— 补上图片 MIME，否则 blob → dataURL 会变成 text/plain 无法显示
      let coverUrl: string | undefined;
      let coverFileName: string | undefined;
      if (parsed.backgroundFilename) {
        const imgEntry = findImageInZip(zip, parsed.backgroundFilename);
        if (imgEntry) {
          const imgBlob = (await imgEntry.async('blob')) as Blob;
          const ext = (parsed.backgroundFilename.split('.').pop() || 'png').toLowerCase();
          const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
          const typed: Blob = imgBlob.type ? imgBlob : new Blob([imgBlob], { type: mimeMap[ext] || 'image/png' });
          coverUrl = URL.createObjectURL(typed);
          coverFileName = parsed.backgroundFilename;
        }
      }
      // 自动解析并进入编辑器（元数据预填：标题/作者/谱师/曲绘）
      onConfirm({
        bpm: parsed.bpm,
        trackCount: 4,
        songUrl: url,
        songFileName: parsed.title || path,
        existingNotes: parsed.notes,
        title: parsed.title,
        artist: parsed.artist,
        author: parsed.creator,
        coverUrl,
        coverFileName,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'not_mania') alert(lang === 'zh' ? '不是 mania 谱面（Mode 必须为 3）' : 'Not a mania beatmap (Mode must be 3)');
      else if (msg === 'not_4k') alert(lang === 'zh' ? '仅支持 4K 谱面（CircleSize 必须为 4）' : 'Only 4K beatmaps are supported');
      else alert(lang === 'zh' ? '导入失败：' + msg : 'Import failed: ' + msg);
    }
  };

  return (
    <div className="screen config-screen">
      <div className="glass-panel config-panel">
        <h2 className="cms-title" style={{ marginBottom: 16 }}>{lang === 'zh' ? '编辑器设置' : 'Editor Setup'}</h2>

        <div className="cp-section">
          <span className="cp-label">{lang === 'zh' ? '选择音频' : 'Select Audio'}</span>
          <div className="cp-file-row">
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleSongSelect} className="file-input" id="es-song-file" disabled={analyzing} />
            <label htmlFor="es-song-file" className={`cp-file-btn cp-file-btn-compact${analyzing ? ' cp-file-btn-loading' : ''}`}>
              {analyzing ? (
                <><span className="cp-btn-spinner" />{lang === 'zh' ? '分析中...' : 'Analyzing...'}</>
              ) : (songName || (lang === 'zh' ? '选择音频文件' : 'Select audio file'))}
            </label>
            {songName && !analyzing && <button className="cp-clear-btn" onClick={handleClearSong}>✕</button>}
          </div>
        </div>

        <div className="cp-section">
          <span className="cp-label">{lang === 'zh' ? '导入谱面包' : 'Import Package'}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="cp-file-row" style={{ flex: 1, minWidth: 0 }}>
              <input ref={zipInputRef} type="file" accept=".zip" onChange={handleZipImport} className="file-input" id="es-zip-file" disabled={importingZip} />
              <label htmlFor="es-zip-file" className={`cp-file-btn cp-file-btn-compact${importingZip ? ' cp-file-btn-loading' : ''}`}>
                {importingZip ? (
                  <><span className="cp-btn-spinner" />{lang === 'zh' ? '导入中...' : 'Importing...'}</>
                ) : (lang === 'zh' ? '导入 Zip 谱面包' : 'Import Zip')}
              </label>
            </div>
            <div className="cp-file-row" style={{ flex: 1, minWidth: 0 }}>
              <input ref={osuInputRef} type="file" accept=".osz,.zip" onChange={handleOsuImport} className="file-input" id="es-osu-file" disabled={importingOsu} />
              <label htmlFor="es-osu-file" className={`cp-file-btn cp-file-btn-compact${importingOsu ? ' cp-file-btn-loading' : ''}`}>
                {importingOsu ? (
                  <><span className="cp-btn-spinner" />{lang === 'zh' ? '导入中...' : 'Importing...'}</>
                ) : (lang === 'zh' ? '导入 OSU 谱面包' : 'Import osu! pack')}
              </label>
            </div>
          </div>
          <p className="cp-hint">{lang === 'zh' ? '导入已有的谱面包或 osu! (.osz) 谱面包进行编辑' : 'Import existing chart package or osu! (.osz) beatmap pack'}</p>
        </div>

        <div className="cp-section">
          <span className="cp-label">BPM</span>
          <input type="number" className="cp-input" value={bpm} onChange={e => setBpm(e.target.value)} min={30} max={300} placeholder="120" />
        </div>

        <div className="cp-section">
          <span className="cp-label">{lang === 'zh' ? '轨道数' : 'Tracks'}</span>
          <div className="cp-chips">
            {TRACK_COUNTS.map(tc => (
              <button key={tc} className={`cp-chip ${trackCount === tc ? 'active' : ''}`} onClick={() => setTrackCount(tc)}>{tc}{lang === 'zh' ? '轨' : 'K'}</button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleSubmit} disabled={!songUrl || analyzing}>
          {lang === 'zh' ? '进入编辑器' : 'Enter Editor'}
        </button>

        <button className="cms-back" onClick={onBack} style={{ marginTop: 8 }}>{lang === 'zh' ? '返回' : 'Back'}</button>
      </div>

      {/* 版权声明 */}
      {showDisclaimer && (
        <div className="cp-disclaimer-overlay" onClick={handleDisclaimerCancel}>
          <div className="cp-disclaimer" onClick={e => e.stopPropagation()}>
            <div className="cp-disclaimer-title">{lang === 'zh' ? '版权声明' : 'Copyright Notice'}</div>
            <div className="cp-disclaimer-body">
              {lang === 'zh' ? (
                <>
                  <p>您即将使用此音频制作谱面。</p>
                  <p><b>请确保您拥有该音频的合法使用权</b>，或该音频为原创、已获授权、或属于合理使用范围。</p>
                  <p>因使用未经授权的音频而产生的任何版权纠纷，<b>均由您自行承担法律责任</b>，与本软件及开发者无关。</p>
                  <p>点击「同意」即表示您已阅读并接受以上条款。</p>
                </>
              ) : (
                <>
                  <p>You are about to use this audio to create a chart.</p>
                  <p><b>Please ensure you have legal rights to use this audio</b>, or it is original, licensed, or falls under fair use.</p>
                  <p>Any copyright disputes arising from unauthorized use of audio are <b>your sole legal responsibility</b>.</p>
                  <p>Click "Agree" to confirm you have read and accept these terms.</p>
                </>
              )}
            </div>
            <div className="cp-disclaimer-actions">
              <button className="btn btn-outline" onClick={handleDisclaimerCancel}>{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleDisclaimerAgree}>{lang === 'zh' ? '同意' : 'Agree'}</button>
            </div>
          </div>
        </div>
      )}

      {/* OSU 多谱面选择 */}
      {osuChoices && (
        <div className="cp-disclaimer-overlay" onClick={() => setOsuChoices(null)}>
          <div className="cp-disclaimer" onClick={e => e.stopPropagation()}>
            <div className="cp-disclaimer-title">{lang === 'zh' ? '选择要导入的谱面' : 'Select a beatmap'}</div>
            <div className="cp-disclaimer-body" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {osuChoices.map(c => (
                <button key={c.path} className="osu-choice-btn" onClick={() => finishOsuImport(c.path)}>{c.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** 在 osu! 谱面包里定位音频文件（精确 → 按文件名 → 任意音频扩展名兜底） */
function findAudioInZip(zip: JSZip, audioFilename: string): JSZip.JSZipObject | null {
  if (audioFilename) {
    const exact = zip.file(audioFilename);
    if (exact) return exact;
    const base = audioFilename.split(/[\\/]/).pop() || audioFilename;
    let byBase: JSZip.JSZipObject | null = null;
    zip.forEach((relPath, file) => {
      if (!byBase && !file.dir && (relPath.split(/[\\/]/).pop() || '') === base) byBase = file;
    });
    if (byBase) return byBase;
  }
  const exts = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'wma', 'opus'];
  let fallback: JSZip.JSZipObject | null = null;
  zip.forEach((relPath, file) => {
    if (!fallback && !file.dir) {
      const ext = (relPath.split('.').pop() || '').toLowerCase();
      if (exts.includes(ext)) fallback = file;
    }
  });
  return fallback;
}

/** 定位曲绘/背景图（按文件名或 basename） */
function findImageInZip(zip: JSZip, filename: string): JSZip.JSZipObject | null {
  if (!filename) return null;
  const exact = zip.file(filename);
  if (exact) return exact;
  const base = filename.split(/[\\/]/).pop() || filename;
  let byBase: JSZip.JSZipObject | null = null;
  zip.forEach((relPath, file) => {
    if (!byBase && !file.dir && (relPath.split(/[\\/]/).pop() || '') === base) byBase = file;
  });
  return byBase;
}
