import React, { useEffect, useState, useRef } from 'react';
import { Lang } from '@/utils/lang';
import { getRandomTip } from '@/utils/tips';
import { generateBlurredBg } from '@/utils/blurImage';
import { runWithLoading } from '@/utils/loading';
import { getMlProgress } from '@/utils/mlLearner';

interface Props {
  onComplete: () => void;
  lang: Lang;
  uiBlur?: boolean;
  chartInfo?: { title: string; artist: string; difficulty: string; chartConstant: number; illustrationUrl: string | null; coverUrl: string | null } | null;
  coverOverride?: string | null;
  pageTitle?: string;
  /** 后台异步任务：加载期间并行执行。完成后一起结束。不提供则为纯定时假加载 */
  task?: () => Promise<void>;
  /** 最小时长 ms（默认 2500） */
  minDuration?: number;
  /** 机器学习学习进行中（显示学习进度） */
  mlLearning?: boolean;
}

export const LoadingScreen: React.FC<Props> = ({ onComplete, lang, uiBlur = true, chartInfo, coverOverride, pageTitle, task, minDuration, mlLearning = false }) => {
  const [tip] = useState(() => getRandomTip(lang));
  const [staticBg, setStaticBg] = useState<string | null>(null);
  // 机器学习学习进度
  const [mlText, setMlText] = useState('');
  useEffect(() => {
    if (!mlLearning) return;
    const iv = setInterval(() => {
      const p = getMlProgress();
      setMlText(p.total > 0
        ? `${lang === 'zh' ? '机器学习：分析谱面' : 'ML: learning chart'} ${p.cur}/${p.total}`
        : (lang === 'zh' ? '机器学习：学习中...' : 'ML: learning...'));
    }, 120);
    return () => clearInterval(iv);
  }, [mlLearning, lang]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // 背景：优先曲绘，无曲绘回退封面（模糊背景），再回退封面覆盖参数
  const bgImg = chartInfo?.illustrationUrl || chartInfo?.coverUrl || coverOverride || null;
  const coverImg = chartInfo?.coverUrl || null;

  // 静态模糊：设置禁用模糊时生成一张模糊图片
  useEffect(() => {
    if (!uiBlur && bgImg) { generateBlurredBg(bgImg, 60, 0.2).then(setStaticBg); }
  }, [uiBlur, bgImg]);

  // 加载计时 + 可选后台任务
  useEffect(() => {
    let cancelled = false;
    runWithLoading(task, minDuration).then(() => {
      if (!cancelled) onCompleteRef.current();
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen ld-screen">
      {bgImg && (
        <div className={`ld-bg${!uiBlur && staticBg ? ' ld-bg-static' : ''}`}
          style={{ backgroundImage: `url(${!uiBlur && staticBg ? staticBg : bgImg})` }}
        />
      )}
      <div className="ld-overlay" />

      {coverImg && (
        <div className="ld-cover">
          <img src={coverImg} alt="" />
        </div>
      )}

      {/* 左侧：信息 */}
      <div className="ld-info">
        {chartInfo ? (
          <>
            <div className="ld-title">{chartInfo.title}</div>
            <div className="ld-artist">{chartInfo.artist}</div>
            <div className="ld-meta">
              <span className="ld-diff">{chartInfo.difficulty}</span>
              <span className="ld-const">{chartInfo.chartConstant.toFixed(1)}</span>
            </div>
          </>
        ) : (
          <div className="ld-title">{pageTitle || (lang === 'zh' ? '自由模式' : 'Free Play')}</div>
        )}
      </div>

      {/* 左下角：随机 Tip */}
      <div className="ld-tip">
        <span className="ld-tip-label">TIP</span>
        <span className="ld-tip-text">{tip}</span>
      </div>

      {/* 右下角：LOADING 动画 */}
      <div className="ld-loading">
        <div className="ld-loading-wrap">
          <span className="ld-loading-text">LOADING</span>
          <div className="ld-loading-bar" />
        </div>
        {mlLearning && <div className="ld-ml">{mlText}</div>}
      </div>
    </div>
  );
};
