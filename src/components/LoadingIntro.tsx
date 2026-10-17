import React, { useEffect, useState } from 'react';

/**
 * 进入加载界面的转场。
 *
 * 放在 LoadingScreen 内部当「入场阶段」，所以任何进加载界面的路径都走同一套。
 *
 * 流程（定数 ≥ 24）：
 *   1. 平行四边形从右侧飞入屏幕中央（盖在原界面上）
 *   2. 停顿
 *   3. LV.xx 重重砸到平行四边形上
 *   4. 数字淡出，平行四边形展开铺满整屏（它直接变成加载界面的背景）
 *   5. 转场淡出，露出加载界面
 *
 * 定数 < 24：跳过 2~4 的数字部分，飞入后直接展开。
 */

const HEAVY_LEVEL = 24;

interface Props {
  level: number;
  /** 展开后作为加载界面背景的图（模糊图优先） */
  bgUrl?: string | null;
  onDone: () => void;
}

export const LoadingIntro: React.FC<Props> = ({ level, bgUrl, onDone }) => {
  const heavy = level >= HEAVY_LEVEL;
  // 0 初始 | 1 飞入 | 3 数字砸下 | 4 数字淡出并展开 | 5 整体淡出
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const steps: [number, number][] = heavy
      ? [[1, 0], [3, 900], [4, 1520], [5, 1820]]
      : [[1, 0], [4, 560], [5, 900]];
    const timers = steps.map(([p, t]) => window.setTimeout(() => setPhase(p), t));
    const end = window.setTimeout(onDone, heavy ? 2100 : 1160);
    return () => { timers.forEach(clearTimeout); clearTimeout(end); };
  }, [heavy, onDone]);

  const shapeIn = phase >= 1;
  const filled = phase >= 4;
  const fading = phase >= 5;
  const showNumber = heavy && phase >= 3;

  return (
    <div className={`li-root${fading ? ' li-fading' : ''}`}>
      {/* 模糊平行四边形 → 展开后就是加载界面的背景 */}
      <div
        className="li-shape"
        style={{
          backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
          transform: shapeIn
            ? (filled ? 'skewX(-14deg) translateX(0) scale(9)' : 'skewX(-14deg) translateX(0)')
            : 'skewX(-14deg) translateX(132vw)',
        }}
      />

      {/* LV.xx：砸在平行四边形上 */}
      {showNumber && (
        <div className="li-lv" style={{ opacity: phase >= 4 ? 0 : 1, transition: `opacity 0.22s ease` }}>
          <span className="li-lv-tag">LV.</span>
          <span className="li-lv-num">{level.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
};

export default LoadingIntro;
