import React, { useState, useRef } from 'react';
import { GameConfig, TrackCount, TimingWindows } from '@/types';
import { t, Lang } from '@/utils/lang';
import { analyzeAudio } from '@/utils';

interface Props {
  onConfirm: (config: GameConfig) => void;
  onBack: () => void;
  lang: Lang;
}

const TRACK_COUNTS: TrackCount[] = [2, 4, 6, 8];

export const ManualConfig: React.FC<Props> = ({ onConfirm, onBack, lang }) => {
  const [bpm, setBpm] = useState('120');
  const [trackCount, setTrackCount] = useState<TrackCount>(4);
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songName, setSongName] = useState('');
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [rhythmData, setRhythmData] = useState<{ bpm: number; onsets: number[]; strengths: number[]; envelope: number[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAudio = !!songUrl;
  const audioLocked = false; // BPM 始终可编辑

  const handleSongSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setSongFile(file);
    setSongName(file.name);
    const url = URL.createObjectURL(file);
    setSongUrl(url);
    setAnalyzing(true);

    let rd: { bpm: number; onsets: number[]; strengths: number[]; envelope: number[] } | null = null;
    try { rd = await analyzeAudio(file); } catch { /* */ }
    setAnalyzing(false);

    if (rd) {
      setRhythmData(rd);
      setBpm(String(rd.bpm));
    }
  };

  const handleClearSong = () => {
    setSongFile(null);
    setSongName('');
    if (songUrl) URL.revokeObjectURL(songUrl);
    setSongUrl(null);
    setRhythmData(null);
    setBpm('120');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if (!songFile) return;
    const defaultWindows: TimingWindows = { timeA: 160, timeB: 80, timeC: 280 };
    onConfirm({
      bpm: parseInt(bpm) || 120,
      timeSignature: '4/4',
      trackCount,
      chartConstant: 8.0, // 占位，后续分析
      timingWindows: defaultWindows,
      speedMultiplier: 5.0,
      noteColor: '#35BFFF',
      holdNoteColor: '#35BFFF',
      bgColor: '#0a0a14',
      judgeLineColor: '#999999',
      songUrl,
      songFileName: songName || null,
      autoPlay: false,
      rhythmData: rhythmData ?? undefined,
    });
  };

  return (
    <div className="screen manual-config-screen">
      <div className="glass-panel config-panel" style={{ maxWidth: 420 }}>
        <h2 className="mc-title">{lang === 'zh' ? '手动制作' : 'Manual Creation'}</h2>

        {/* 歌曲选择 */}
        <div className="cp-section">
          <span className="cp-label">{t('song.optional', lang)}</span>
          <div className="cp-file-row">
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleSongSelect} className="file-input" id="mc-song-file" disabled={analyzing} />
            <label htmlFor="mc-song-file" className={`cp-file-btn cp-file-btn-compact${analyzing ? ' cp-file-btn-loading' : ''}`}>
              {analyzing ? (
                <><span className="cp-btn-spinner" />{lang === 'zh' ? '分析中...' : 'Analyzing...'}</>
              ) : (songName || t('select.audio', lang))}
            </label>
            {songName && !analyzing && <button className="cp-clear-btn" onClick={handleClearSong}>✕</button>}
          </div>
        </div>

        {/* BPM */}
        <div className="cp-section">
          <span className="cp-label">{t('bpm', lang)}{audioLocked ? (lang === 'zh' ? ' (自动)' : ' (Auto)') : ''}</span>
          <input type="number" className="cp-input"
            value={bpm} onChange={e => setBpm(e.target.value)} min={30} max={300} placeholder="120"
            disabled={audioLocked} style={audioLocked ? { opacity: 0.5 } : {}} />
        </div>

        {/* 轨道数 */}
        <div className="cp-section">
          <span className="cp-label">{t('tracks', lang)}</span>
          <div className="cp-chips">
            {TRACK_COUNTS.map(tc => (
              <button key={tc}
                className={`cp-chip ${trackCount === tc ? 'active' : ''}`}
                onClick={() => setTrackCount(tc)}>{tc}{lang === 'zh' ? '轨' : 'K'}</button>
            ))}
          </div>
          <p className="cp-hint">
            {trackCount === 2 ? 'F J' : trackCount === 4 ? 'D F J K' : trackCount === 6 ? 'S D F J K L' : 'A S D F J K L ;'}
          </p>
        </div>

        {/* 提示 */}
        <p className="mc-notice">
          {lang === 'zh'
            ? '选择音频后，跟随节拍按下对应按键录入谱面。支持长按（Hold）和双押。'
            : 'After selecting audio, tap keys along with the beat. Supports holds and double taps.'}
        </p>

        <div className="mc-actions">
          <button className="btn btn-outline" onClick={onBack}>{lang === 'zh' ? '返回' : 'Back'}</button>
          <button className="cp-submit" style={{ width: 'auto', flex: 1, marginTop: 0 }} onClick={handleSubmit} disabled={!songFile}>
            {lang === 'zh' ? '开始录入' : 'Start Recording'}
          </button>
        </div>
      </div>
    </div>
  );
};
