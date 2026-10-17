import React, { useEffect, useRef, useState } from 'react';

/**
 * 进入加载界面的转场。
 *
 * 屏幕级组件（在 App 里盖住当前界面），不是在加载界面内部渲染的——
 * 顺序必须是：平行四边形先在原界面上飞入 → 铺满整屏 → 这时才切到加载界面。
 *
 * 平行四边形是一块「全屏大小、始终带同样模糊」的图层，只用 clip-path 变形：
 *   - 用「小方块 + scale 放大」不行：filter 的模糊半径在 transform 之前生效，
 *     放大多少倍模糊就放大多少倍，铺满后和加载界面自己的背景对不上。
 *   - 这里的 filter / transform / background / 压暗层与 .ld-bg + .ld-overlay 完全一致，
 *     所以铺满后淡出是无缝的。
 *
 * 时序：
 *   1. clip-path 从右侧飞入，停在屏幕中央成平行四边形
 *   2. 定数 ≥ 24：LV.xx 从上方砸在平行四边形正中
 *   3. 数字淡出，clip-path 展开铺满整屏
 *   4. **铺满的那一刻** onCovered()：App 在这时切到加载界面
 *      （不能等淡出完再切，否则淡出露出的是原界面）
 *   5. 转场淡出，露出加载界面自己的 UI，然后 onDone() 卸载
 */

const HEAVY_LEVEL = 24;

/** 右侧屏幕外（元素是全屏大小，所以坐标按屏幕百分比算） */
const CLIP_OFF = 'polygon(150% 26%, 214% 26%, 164% 74%, 100% 74%)';
/** 屏幕中央的平行四边形 */
const CLIP_CENTER = 'polygon(42% 30%, 76% 30%, 58% 70%, 24% 70%)';
/** 铺满整屏 */
const CLIP_FULL = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';

interface Props {
  level: number;
  /** 展开后就是加载界面背景的那张图 */
  bgUrl?: string | null;
  /** 平行四边形铺满屏幕的瞬间（此时应切到加载界面） */
  onCovered: () => void;
  /** 转场淡出完毕，可以卸载 */
  onDone: () => void;
}

export const LoadingIntro: React.FC<Props> = ({ level, bgUrl, onCovered, onDone }) => {
  const heavy = level >= HEAVY_LEVEL;
  // 0 起始 | 1 飞入 | 3 数字砸下 | 4 数字淡出+展开 | 5 整体淡出
  const [phase, setPhase] = useState(0);
  const coveredRef = useRef(false);
  const onCoveredRef = useRef(onCovered);
  onCoveredRef.current = onCovered;

  useEffect(() => {
    // 展开动画 460ms，所以 onCovered 排在展开开始后约 470ms
    const steps: [number, number][] = heavy
      ? [[1, 16], [3, 900], [4, 1560], [5, 2080]]
      : [[1, 16], [4, 620], [5, 1140]];
    const coveredAt = heavy ? 2030 : 1090;
    const endAt = heavy ? 2380 : 1440;

    const timers = steps.map(([p, t]) => window.setTimeout(() => setPhase(p), t));
    const coverTimer = window.setTimeout(() => {
      if (coveredRef.current) return;
      coveredRef.current = true;
      onCoveredRef.current();
    }, coveredAt);
    const endTimer = window.setTimeout(onDone, endAt);
    return () => { timers.forEach(clearTimeout); clearTimeout(coverTimer); clearTimeout(endTimer); };
  }, [heavy, onDone]);

  const clip = phase >= 4 ? CLIP_FULL : phase >= 1 ? CLIP_CENTER : CLIP_OFF;
  const showNumber = heavy && phase >= 3;

  return (
    <div className={`li-root${phase >= 5 ? ' li-fading' : ''}`}>
      <div
        className="li-shape"
        style={{
          clipPath: clip,
          WebkitClipPath: clip,
          // 叠一层与 .ld-overlay 相同的压暗，保证和加载界面对得上
          backgroundImage: bgUrl
            ? `linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.18)), url(${bgUrl})`
            : undefined,
        }}
      />

      {showNumber && (
        <div className="li-lv" style={{ opacity: phase >= 4 ? 0 : 1, transition: 'opacity 0.25s ease' }}>
          <span className="li-lv-tag">LV.</span>
          <span className="li-lv-num">{level.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
};

export default LoadingIntro;
