import React, { useEffect, useRef, useState } from 'react';

/**
 * 启动动画（每次进入软件播一次）。
 *
 * 一镜到底的顺序：
 *   全黑 → 「PAGE Studio」淡入淡出 → xWhite.png 淡入淡出 → 「Palab」
 *
 * 最后这段 Palab 是**贴在主界面 logo 的真实位置上**画的：
 * 挂载时量一次 `.menu-logo` 的矩形，用同样的字体/渐变在那里重画一份，
 * 结束时只把黑底淡掉、这一份跟着卸载，下面主界面的 logo 一直在同一位置，
 * 所以看起来是同一个镜头连过去的。总时长约 5.6 秒。
 */

interface Phase { until: number; name: 'black' | 'page' | 'logo' | 'palab' | 'fade' }

const T = {
  pageIn: 120,
  pageHold: 1500,
  logoIn: 1560,
  logoHold: 3000,
  palab: 3020,
  palabHold: 4480,
  fade: 4900,
  done: 5600,
};

const PHASES: Phase[] = [
  { until: T.pageIn, name: 'black' },
  { until: T.logoIn, name: 'page' },
  { until: T.palab, name: 'logo' },
  { until: T.fade, name: 'palab' },
  { until: T.done, name: 'fade' },
];

interface Props {
  onDone: () => void;
}

export const StartupSplash: React.FC<Props> = ({ onDone }) => {
  const [elapsed, setElapsed] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);
  const startRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // 量出主界面 logo 的位置：最后一段 Palab 要贴在它上面
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('.menu-logo') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0) setRect({ left: r.left, top: r.top });
    };
    measure();
    // 首帧布局可能还没稳定，再量一次
    const t = window.setTimeout(measure, 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const e = now - startRef.current;
      setElapsed(e);
      if (e < T.done) raf = requestAnimationFrame(tick);
      else onDoneRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const phase = PHASES.find(p => elapsed < p.until)?.name ?? 'fade';
  const fading = phase === 'fade';

  return (
    <div className={`splash-root${fading ? ' splash-fading' : ''}`}>
      {/* PAGE Studio */}
      {phase === 'page' && (
        <div className="splash-page">PAGE Studio</div>
      )}

      {/* xWhite.png */}
      {phase === 'logo' && (
        <img className="splash-mark" src="xWhite.png" alt="" />
      )}

      {/* Palab：贴在主界面 logo 的位置上，与它完全重合 */}
      {phase === 'palab' && (
        <div
          className="menu-logo splash-logo"
          style={rect ? { left: rect.left, top: rect.top } : undefined}
        >
          <span className="brand-char">P</span><span className="brand-char">alab</span>
        </div>
      )}
    </div>
  );
};

export default StartupSplash;
