import React, { useEffect, useState } from 'react';

/**
 * 进入加载界面前的转场。
 *
 * 放在 LoadingScreen 内部当「入场阶段」用，所以任何进加载界面的路径都会走同一套。
 *
 * 流程：
 *   1. 屏幕压暗
 *   2. 定数 ≥ 24 的谱面：LV.xx 数字重重砸在看板娘身上（低定数跳过这一步）
 *   3. 模糊平行四边形从右往左滑到屏幕正中
 *   4. 平行四边形放大成铺满屏幕的方块，然后淡出，露出规范的加载界面
 */

const HEAVY_LEVEL = 24;

interface Props {
  level: number;
  /** 看板娘图（没有就只砸数字，不显示人物） */
  mascotUrl?: string | null;
  /** 背景模糊图（给平行四边形做个半透明底） */
  bgUrl?: string | null;
  onDone: () => void;
}

export const LoadingIntro: React.FC<Props> = ({ level, mascotUrl, bgUrl, onDone }) => {
  const heavy = level >= HEAVY_LEVEL;
  // 0=压暗 1=人物 2=砸数字 3=平行四边形滑入 4=铺满 5=淡出
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const steps: [number, number][] = heavy
      ? [[1, 60], [2, 260], [3, 820], [4, 1180], [5, 1500]]
      : [[3, 120], [4, 480], [5, 800]];
    const timers = steps.map(([p, t]) => window.setTimeout(() => setPhase(p), t));
    const end = window.setTimeout(onDone, heavy ? 1760 : 1040);
    return () => { timers.forEach(clearTimeout); clearTimeout(end); };
  }, [heavy, onDone]);

  const showMascot = heavy && !!mascotUrl && phase >= 1;
  const showNumber = heavy && phase >= 2;
  const shapeIn = phase >= 3;
  const filled = phase >= 4;
  const fading = phase >= 5;

  return (
    <div className={`li-root${fading ? ' li-fading' : ''}`}>
      {/* 压暗：只有高定数才压，低定数直接让平行四边形滑进来 */}
      <div className="li-dim" style={{ opacity: heavy && phase >= 1 ? 1 : 0 }} />

      {/* 看板娘：数字砸在她身上 */}
      {showMascot && (
        <img
          className={`li-mascot${phase >= 2 ? ' li-mascot-hit' : ''}`}
          src={mascotUrl!}
          alt=""
        />
      )}

      {/* LV.xx 数字 */}
      {showNumber && (
        <div className={`li-lv${phase >= 3 ? ' li-lv-out' : ''}`}>
          <span className="li-lv-tag">LV.</span>
          <span className="li-lv-num">{level.toFixed(1)}</span>
        </div>
      )}

      {/* 模糊平行四边形 → 铺满屏幕 */}
      <div
        className="li-shape"
        style={{
          backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
          transform: shapeIn
            ? (filled ? 'skewX(-14deg) translateX(0) scale(9)' : 'skewX(-14deg) translateX(0)')
            : 'skewX(-14deg) translateX(130vw)',
          opacity: shapeIn ? 1 : 0,
        }}
      />
    </div>
  );
};

export default LoadingIntro;
