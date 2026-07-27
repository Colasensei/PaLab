import React, { useEffect, useState, useCallback } from 'react';
import { Lang } from '@/utils/lang';
import { Note, GameConfig, TrackCount, constantToDifficulty } from '@/types';
import { analyzeManualNotes } from '@/utils/manualAnalyzer';

interface Props {
  config: GameConfig;
  rawNotes: Note[];
  duration: number;
  onComplete: (notes: Note[], chartConstant: number) => void;
  lang: Lang;
}

export const ManualAnalyzer: React.FC<Props> = ({ config, rawNotes, duration, onComplete, lang }) => {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [skipAlign, setSkipAlign] = useState(false);
  const [skipDouble, setSkipDouble] = useState(false);

  const steps = [
    lang === 'zh' ? '节拍对齐...' : 'Beat alignment...',
    lang === 'zh' ? '双押识别...' : 'Double detection...',
    lang === 'zh' ? '难度评定...' : 'Difficulty rating...',
  ];

  const handleStart = useCallback(async () => {
    setRunning(true);
    setStep(skipAlign ? 0 : 1);
    await delay(500);
    if (!skipDouble) { setStep(2); await delay(500); }
    setStep(3);
    await delay(300);

    const result = analyzeManualNotes(
      rawNotes,
      config.bpm,
      duration,
      config.trackCount as TrackCount,
      { skipAlign, skipDouble },
    );

    await delay(600);
    onComplete(result.notes, result.chartConstant);
  }, [rawNotes, config, duration, onComplete, skipAlign, skipDouble]);

  return (
    <div className="screen ma-screen">
      <div className="ma-panel">
        <h2 className="ma-title">
          {running
            ? (lang === 'zh' ? '正在分析谱面' : 'Analyzing Chart')
            : (lang === 'zh' ? '分析选项' : 'Analysis Options')}
        </h2>

        <div className="ma-stats">
          <div className="ma-stat">
            <span className="ma-stat-label">{lang === 'zh' ? '音符总数' : 'Total Notes'}</span>
            <span className="ma-stat-value">{rawNotes.length}</span>
          </div>
          <div className="ma-stat">
            <span className="ma-stat-label">{lang === 'zh' ? 'BPM' : 'BPM'}</span>
            <span className="ma-stat-value">{config.bpm}</span>
          </div>
          <div className="ma-stat">
            <span className="ma-stat-label">{lang === 'zh' ? '时长' : 'Duration'}</span>
            <span className="ma-stat-value">{formatTime(duration)}</span>
          </div>
        </div>

        {!running ? (
          <>
            <div className="ma-options">
              <label className="ma-opt">
                <input type="checkbox" checked={skipAlign} onChange={e => setSkipAlign(e.target.checked)} />
                <span>{lang === 'zh' ? '跳过节拍对齐（保留原始录入时间）' : 'Skip beat alignment (keep raw timing)'}</span>
              </label>
              <label className="ma-opt">
                <input type="checkbox" checked={skipDouble} onChange={e => setSkipDouble(e.target.checked)} />
                <span>{lang === 'zh' ? '跳过双押识别（不自动合并多押）' : 'Skip double detection (no auto-grouping)'}</span>
              </label>
            </div>
            <button className="ma-start-btn" onClick={handleStart}>
              {lang === 'zh' ? '开始分析' : 'Start Analysis'}
            </button>
          </>
        ) : (
          <div className="ma-steps">
            {steps.map((s, i) => {
              // 被跳过的步骤
              const isSkipped = (i === 0 && skipAlign) || (i === 1 && skipDouble);
              const isActive = i === step - 1 && !isSkipped;
              const isDone = (i < step && !isSkipped) || isSkipped;
              return (
                <div key={i} className={`ma-step ${isActive ? 'ma-step-active' : ''} ${isDone ? 'ma-step-done' : ''} ${isSkipped ? 'ma-step-skipped' : ''}`}>
                  <span className="ma-step-dot" />
                  <span className="ma-step-label">{isSkipped ? (lang === 'zh' ? '已跳过' : 'Skipped') : s}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
