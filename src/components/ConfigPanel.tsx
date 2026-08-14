import React, { useState, useRef } from 'react';
import { GameConfig, TrackCount, TimeSignature, TimingWindows, constantToDifficulty, getDiffColor } from '@/types';
import { t, Lang } from '@/utils/lang';
import { analyzeAudio } from '@/utils';

interface ConfigPanelProps {
  onConfirm: (config: GameConfig) => void;
  onBack: () => void;
  lang: Lang;
  devMode?: boolean;
}

const TRACK_COUNTS: TrackCount[] = [2, 4, 6, 8];
const TIME_SIGNATURES: TimeSignature[] = ['2/4', '3/4', '4/4', '6/8'];

function constantToLabel(c: number, advanced: boolean): string {
  if (c > 25.0) return '?';
  return constantToDifficulty(c);
}
function constantToColor(c: number, advanced: boolean): string {
  return getDiffColor(constantToLabel(c, advanced)) || '#FF44AA';
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ onConfirm, onBack, lang, devMode = false }) => {
  const [bpm, setBpm] = useState('120');
  const [timeSignature, setTimeSignature] = useState<TimeSignature>('4/4');
  const [trackCount, setTrackCount] = useState<TrackCount>(4);
  const [chartConstant, setChartConstant] = useState(8.0);
  const [enableHolds, setEnableHolds] = useState(true);
  const [enableSplit, setEnableSplit] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songName, setSongName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [rhythmData, setRhythmData] = useState<{ bpm: number; onsets: number[]; strengths: number[]; envelope: number[] } | null>(null);
  const [disclaimerFile, setDisclaimerFile] = useState<File | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const pendingRef = useRef<{ file: File; url: string; rd: { bpm: number; onsets: number[]; strengths: number[]; envelope: number[] } | null } | null>(null);

  const sliderMin = advanced ? 0 : 1.0;
  const sliderMax = 25.0; // 分析器上限放宽到 25.0，普通模式也支持
  const diffLabel = constantToLabel(chartConstant, advanced);
  const diffBg = 'rgba(255,255,255,0.12)';
  const diffText = '#fff';
  const diffValue = 'rgba(255,255,255,0.8)';
  const hasAudio = !!songUrl;
  const audioLocked = false; // BPM 始终可编辑

  const handleSongSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    // 1. 立即弹出加载界面
    setSongFile(file);
    setSongName(file.name);
    const url = URL.createObjectURL(file);
    setSongUrl(url);
    setAnalyzing(true);

    // 2. 分析音频
    let rd: { bpm: number; onsets: number[]; strengths: number[]; envelope: number[] } | null = null;
    try { rd = await analyzeAudio(file); } catch { /* */ }
    setAnalyzing(false);

    // 3. 返回并弹窗：存结果到 ref，弹出声明
    pendingRef.current = { file, url, rd };
    setShowDisclaimer(true);
  };

  const handleDisclaimerAgree = () => {
    if (!pendingRef.current) return;
    const { file, url, rd } = pendingRef.current;
    pendingRef.current = null;
    setShowDisclaimer(false);

    // 应用分析结果
    setSongFile(file);
    setSongName(file.name);
    setSongUrl(url);
    if (rd) {
      setRhythmData(rd);
      setBpm(String(rd.bpm));
    }
  };

  const handleDisclaimerCancel = () => {
    setShowDisclaimer(false);
    // 不同意：清理已设置的音频
    if (pendingRef.current) {
      URL.revokeObjectURL(pendingRef.current.url);
      pendingRef.current = null;
    }
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
    const defaultWindows: TimingWindows = { timeA: 160, timeB: 80, timeC: 280 };
    onConfirm({
      bpm: parseInt(bpm) || 120, timeSignature, trackCount, chartConstant,
      timingWindows: defaultWindows, speedMultiplier: 5.0,
      noteColor: '#35BFFF', holdNoteColor: '#35BFFF', bgColor: '#0a0a14', judgeLineColor: '#999999',
      songUrl, songFileName: songName || null, autoPlay: false,
      enableHolds,
      enableSplit,
      rhythmData: rhythmData ?? undefined,
    });
  };

  const clampedVal = Math.min(sliderMax, Math.max(sliderMin, chartConstant));

  return (
    <div className="screen config-screen">
      <div className="glass-panel config-panel">
        <div className="cp-section">
          <span className="cp-label">{t('bpm', lang)}{audioLocked ? (lang === 'zh' ? ' (自动)' : ' (Auto)') : ''}</span>
          <input type="number" className="cp-input"
            value={bpm} onChange={e => setBpm(e.target.value)} min={30} max={300} placeholder="120"
            disabled={audioLocked} style={audioLocked ? { opacity: 0.5 } : {}} />
        </div>

        <div className="cp-section">
          <span className="cp-label">{t('time.signature', lang)}{audioLocked ? (lang === 'zh' ? ' (自动)' : ' (Auto)') : ''}</span>
          <div className="cp-chips">
            {TIME_SIGNATURES.map(ts => (
              <button key={ts}
                className={`cp-chip ${timeSignature === ts ? 'active' : ''}`}
                disabled={audioLocked}
                style={audioLocked ? { opacity: 0.5 } : {}}
                onClick={() => setTimeSignature(ts)}>{ts}</button>
            ))}
          </div>
        </div>

        <div className="cp-section">
          <span className="cp-label">{t('song.optional', lang)}</span>
          <div className="cp-file-row">
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleSongSelect} className="file-input" id="song-file" disabled={analyzing} />
            <label htmlFor="song-file" className={`cp-file-btn cp-file-btn-compact${analyzing ? ' cp-file-btn-loading' : ''}`}>
              {analyzing ? (
                <><span className="cp-btn-spinner" />{lang === 'zh' ? '分析中...' : 'Analyzing...'}</>
              ) : (songName || t('select.audio', lang))}
            </label>
            {songName && !analyzing && <button className="cp-clear-btn" onClick={handleClearSong}>✕</button>}
          </div>
        </div>

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

        <div className="cp-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cp-label">{t('hold.notes', lang)}</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={enableHolds} onChange={e => setEnableHolds(e.target.checked)} />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <p className="cp-hint">{t('hold.notes.tip', lang)}</p>
        </div>

        <div className="cp-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cp-label">{lang === 'zh' ? '脑裂' : 'Brain split'}</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={enableSplit} onChange={e => setEnableSplit(e.target.checked)} />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <p className="cp-hint">{lang === 'zh' ? '开启后自动生成一定会插入一段部分轨道反转；关闭则不生成（默认关闭）' : 'On: auto-gen always inserts a partial track reverse; Off: never (default off)'}</p>
        </div>

        <div className="cp-section">
          <div className="cp-diff-header">
            <span className="cp-label">{t('difficulty', lang)}</span>
            <label className="cp-adv-toggle" title={lang === 'zh' ? '高级模式 (0~25)' : 'Advanced mode (0~25)'}>
              <input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} />
              <span className="cp-adv-label">{lang === 'zh' ? '高级' : 'ADV'}</span>
            </label>
          </div>
          {devMode && advanced ? (
            <div className="cp-diff-direct-wrap">
              <input
                type="number"
                className="cp-diff-direct"
                min={0} max={25} step={0.1}
                value={chartConstant}
                onChange={e => setChartConstant(parseFloat(e.target.value) || 0)}
              />
              <span className="cp-diff-direct-label" style={{ background: diffBg, color: diffText }}>
                {diffLabel}
              </span>
            </div>
          ) : (
            <div className="cp-diff-slider-wrap">
              <input
                type="range"
                className="cp-diff-slider"
                min={sliderMin}
                max={sliderMax}
                step={0.1}
                value={clampedVal}
                onChange={e => setChartConstant(parseFloat(e.target.value))}
                style={{ '--slider-color': diffText } as React.CSSProperties}
              />
              <span className="cp-diff-value" style={{ color: diffValue }}>
                {chartConstant.toFixed(1)}
              </span>
              <span className="cp-diff-label" style={{ background: diffBg, color: diffText }}>
                {diffLabel}
              </span>
            </div>
          )}
          <div className="cp-diff-desc">
            {lang === 'zh'
              ? '定数决定谱面的音符密度、配置复杂度、读谱难度与体力要求'
              : 'Chart constant determines note density, pattern complexity, readability & physical demands'}
          </div>
        </div>

        <button className="cp-submit" onClick={handleSubmit}>
          {t('confirm', lang)}
        </button>
      </div>

      {/* 版权声明弹窗 */}
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
