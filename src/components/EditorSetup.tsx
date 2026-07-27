import React, { useState, useRef } from 'react';
import { Lang } from '@/utils/lang';
import { analyzeAudio } from '@/utils';
import { Note } from '@/types';
import JSZip from 'jszip';

interface EditorConfig {
  bpm: number;
  trackCount: number;
  songUrl: string;
  songFileName: string;
  existingNotes?: Note[];
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
          <span className="cp-label">{lang === 'zh' ? '导入 Zip 谱面包' : 'Import Zip Package'}</span>
          <div className="cp-file-row">
            <input ref={zipInputRef} type="file" accept=".zip" onChange={handleZipImport} className="file-input" id="es-zip-file" disabled={importingZip} />
            <label htmlFor="es-zip-file" className={`cp-file-btn cp-file-btn-compact${importingZip ? ' cp-file-btn-loading' : ''}`}>
              {importingZip ? (
                <><span className="cp-btn-spinner" />{lang === 'zh' ? '导入中...' : 'Importing...'}</>
              ) : (lang === 'zh' ? '选择 .zip 文件' : 'Select .zip file')}
            </label>
          </div>
          <p className="cp-hint">{lang === 'zh' ? '导入已有的谱面包进行编辑' : 'Import existing chart package to edit'}</p>
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
    </div>
  );
};
