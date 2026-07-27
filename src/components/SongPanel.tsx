import React, { useState } from 'react';
import {
  GameConfig, TimingWindows, KEY_DISPLAY, HighScoreRecord,
  constantToDifficulty,
} from '@/types';
import { t, Lang } from '@/utils/lang';

interface SongPanelProps {
  config: GameConfig;
  highScore: number;
  highPP: number;
  highRating: string;
  history: HighScoreRecord[];
  onStart: () => void;
  onClearConfig: () => void;
  onConfigChange: (config: GameConfig) => void;
  onBack: () => void;
  onSettings: () => void;
  lang: Lang;
  isTrial?: boolean;
}

export const SongPanel: React.FC<SongPanelProps> = ({
  config,
  highScore,
  highPP,
  highRating,
  history,
  onStart,
  onClearConfig,
  onConfigChange,
  onBack, onSettings,
  lang,
  isTrial = false,
}) => {
  const [speed, setSpeed] = useState(config.speedMultiplier);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTimingHelp, setShowTimingHelp] = useState(false);

  // 判定窗口，可手动改（
  const [timeA, setTimeA] = useState(config.timingWindows.timeA);
  const [timeB, setTimeB] = useState(config.timingWindows.timeB);
  const [timeC, setTimeC] = useState(config.timingWindows.timeC);

  const diffLabel = constantToDifficulty(config.chartConstant);

  const handleSpeedChange = (delta: number) => {
    const newSpeed = Math.max(0.5, Math.min(10.0, speed + delta));
    setSpeed(newSpeed);
    onConfigChange({ ...config, speedMultiplier: newSpeed });
  };

  const handleTimingApply = () => {
    const windows: TimingWindows = { timeA, timeB, timeC };
    onConfigChange({ ...config, timingWindows: windows });
  };

  // 有历史就亮统计（
  const hasHistory = highPP > 0;

  return (
    <div className="screen song-panel-screen">
      <div className="sp-container">
        {/* ── 横屏双栏 ── */}
        <div className="sp-layout">
        {/* ── 左 ── */}
          <div className="sp-left">
            {/* 难度大牌牌 */}
            <div className="sp-diff-hero" style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="sp-diff-badge" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                {diffLabel}
              </div>
              <div className="sp-diff-name" style={{ color: '#fff' }}>
                {lang === 'zh'
                  ? ({EZ:'简单',NM:'普通',HD:'困难',IN:'疯狂',AT:'崩坏'} as Record<string,string>)[diffLabel] || diffLabel
                  : ({EZ:'EASY',NM:'NORMAL',HD:'HARD',IN:'INSANE',AT:'ANOTHER'} as Record<string,string>)[diffLabel] || diffLabel}
              </div>
              <div className="sp-diff-constant" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {lang === 'zh' ? '定数' : 'Const'} {config.chartConstant.toFixed(1)}
              </div>
            </div>

            {/* 信息条条 */}
            <div className="sp-chips">
              <div className="sp-chip">
                <span className="sp-chip-label">BPM</span>
                <span className="sp-chip-value">{config.bpm}</span>
              </div>
              <div className="sp-chip">
                <span className="sp-chip-label">BEAT</span>
                <span className="sp-chip-value">{config.timeSignature}</span>
              </div>
              <div className="sp-chip">
                <span className="sp-chip-label">TRACKS</span>
                <span className="sp-chip-value">{config.trackCount}K</span>
              </div>
              <div className="sp-chip">
                <span className="sp-chip-label">KEYS</span>
                <span className="sp-chip-value">{KEY_DISPLAY[config.trackCount]}</span>
              </div>
              {config.songFileName && (
                <div className="sp-chip sp-chip-song">
                  <span className="sp-chip-label">SONG</span>
                  <span className="sp-chip-value">{config.songFileName}</span>
                </div>
              )}
            </div>

            {/* 快速设置 */}
            <div className="sp-card sp-card-glow" style={{ '--glow': 'rgba(255,255,255,0.15)' } as React.CSSProperties}>
              <div className="sp-card-row">
                <span className="sp-card-label">{t('speed', lang)}</span>
                <div className="sp-speed-row">
                  <button className="sp-speed-btn" onClick={() => handleSpeedChange(-0.1)}>−</button>
                  <input type="range" min={0.5} max={10.0} step={0.1} value={speed}
                    onChange={e => { const v = parseFloat(e.target.value); setSpeed(v); onConfigChange({ ...config, speedMultiplier: v }); }}
                    className="sp-slider" style={{ accentColor: '#aaa' }} />
                  <button className="sp-speed-btn" onClick={() => handleSpeedChange(0.1)}>+</button>
                  <span className="sp-speed-val" style={{ color: '#fff' }}>{speed.toFixed(1)}x</span>
                </div>
              </div>
              <div className="sp-card-row">
                <span className="sp-card-label">{t('auto.play', lang)}</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.autoPlay} onChange={e => onConfigChange({ ...config, autoPlay: e.target.checked })} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              {isTrial && (
                <div className="sp-card-row">
                  <span className="sp-card-label">{lang === 'zh' ? '对齐节拍' : 'Snap to beat'}</span>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={config.snapToBeat ?? false} onChange={e => onConfigChange({ ...config, snapToBeat: e.target.checked })} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              )}
            </div>

            {/* 高级，折叠的 */}
            <div className="sp-advanced-wrap">
              <button className="sp-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
                <span className={`sp-advanced-arrow ${showAdvanced ? 'open' : ''}`}>▶</span>
                {t('advanced', lang)}
                <span className="sp-help-icon" onClick={e => { e.stopPropagation(); setShowTimingHelp(!showTimingHelp); }} title={lang === 'zh' ? '了解各项设置的作用' : 'Learn about each setting'}>?</span>
              </button>
              {showTimingHelp && (
                <div className="sp-tooltip">
                  {lang === 'zh' ? (
                    <>
                      <p><b>速度</b> — 音符下落速度，越高越快越密</p>
                      <p><b>打击音量</b> — 按下音符时的反馈音效音量</p>
                      <p><b>自动演奏</b> — 机器人自动打歌，用于听歌或测试</p>
                      <p><b>判定窗口</b> — P=Perfect, G=Good, B=Bad 的判定容忍时间(ms)</p>
                      <p><b>颜色</b> — 自定义音符/长按/背景/判定线的颜色</p>
                    </>
                  ) : (
                    <>
                      <p><b>Speed</b> — Note fall speed. Higher = faster & denser</p>
                      <p><b>Hit Volume</b> — Feedback sound volume when hitting notes</p>
                      <p><b>Auto Play</b> — Auto-play for listening or testing</p>
                      <p><b>Timing</b> — P=Perfect, G=Good, B=Bad tolerance (ms)</p>
                      <p><b>Colors</b> — Customize note/hold/bg/judge line colors</p>
                    </>
                  )}
                </div>
              )}
              <div className={`sp-advanced-body ${showAdvanced ? 'open' : ''}`}>
                <div className="sp-adv-section">
                  <span className="sp-adv-label">{t('timing.ms', lang)}</span>
                  <div className="sp-adv-timing">
                    <div className="sp-adv-timing-item">
                      <span className="sp-adv-timing-letter" style={{ color: '#FFD700' }}>P</span>
                      <input type="number" value={timeB} onChange={e => setTimeB(+e.target.value)} min={10} max={200} className="sp-adv-input" />
                    </div>
                    <div className="sp-adv-timing-item">
                      <span className="sp-adv-timing-letter" style={{ color: '#66DD66' }}>G</span>
                      <input type="number" value={timeA} onChange={e => setTimeA(+e.target.value)} min={30} max={500} className="sp-adv-input" />
                    </div>
                    <div className="sp-adv-timing-item">
                      <span className="sp-adv-timing-letter" style={{ color: '#FFBB33' }}>B</span>
                      <input type="number" value={timeC} onChange={e => setTimeC(+e.target.value)} min={50} max={500} className="sp-adv-input" />
                    </div>
                    <button className="sp-adv-btn" onClick={handleTimingApply}>{t('apply', lang)}</button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 清空 + 设置 ── */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <button className="sp-adv-clear" onClick={onClearConfig} style={{ flex: 1, marginTop: 0 }}>{t('reset.config', lang)}</button>
              <button onClick={onSettings} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-secondary)', padding: '8px 16px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-main)', textAlign: 'center', letterSpacing: 2 }}>{lang === 'zh' ? '设置' : 'Settings'}</button>
            </div>
          </div>
        </div>

        {/* ── START，永远全宽 ── */}
        <div className="sp-start-row">
          {isTrial && (
            <p className="sp-trial-notice">
              {lang === 'zh' ? '本次试玩不计入任何成绩' : 'Trial play — scores will not be recorded'}
            </p>
          )}
          <button className="sp-start-btn" onClick={onStart}
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
            }}>
            <span className="sp-start-icon">▶</span>
            {isTrial ? (lang === 'zh' ? '开始试玩' : 'Start Trial') : t('start', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
