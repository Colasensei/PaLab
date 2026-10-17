import React, { useEffect, useRef, useState } from 'react';

/**
 * 启动动画（每次进入软件播一次），总长约 5.6 秒。
 *
 * 全黑 → 「PAGE Studio」淡入淡出 → xWhite.png 淡入淡出 → 「Palab」
 *
 * 一镜到底的关键：
 *   - 最后的 Palab 不是画在屏幕中心，而是贴在主界面 logo 的真实位置上（挂载时量 rect）。
 *   - 黑底和文字是**两个层**：文字出现之后就一直挂着，只让黑底淡出。
 *     所以淡出过程中文字和下面主界面的 logo 完全重合，看不到任何过渡。
 *   - 黑底彻底透明后再过一小会儿才卸载这一份，交接时两者像素一致，等于没切。
 */

interface Props {
  onDone: () => void;
}

const T = {
  pageStart: 100,
  markStart: 1500,
  palabStart: 2960,
  blackFade: 4360,   // 黑底开始淡出（文字保持不动）
  unmount: 5400,     // 这一份卸载（此时黑底已全透明，主界面 logo 与它重合）
  done: 5600,
};

export const StartupSplash: React.FC<Props> = ({ onDone }) => {
  const [elapsed, setElapsed] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);
  const startRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // 量出主界面 logo 的位置：最后一段 Palab 要完全盖在它上面
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('.menu-logo') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setRect({ left: r.left, top: r.top });
    };
    measure();
    const t1 = window.setTimeout(measure, 60);
    const t2 = window.setTimeout(measure, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
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

  const showPage = elapsed >= T.pageStart && elapsed < T.markStart;
  const showMark = elapsed >= T.markStart && elapsed < T.palabStart;
  const showPalab = elapsed >= T.palabStart && elapsed < T.unmount;
  const fadeBlack = elapsed >= T.blackFade;

  return (
    <div className="splash-root">
      {/* 黑底单独一层：只让它淡，字不跟着淡 */}
      <div className={`splash-black${fadeBlack ? ' splash-black-out' : ''}`} />

      {showPage && <div className="splash-page">PAGE Studio</div>}
      {showMark && <img className="splash-mark" src="xWhite.png" alt="" />}

      {showPalab && (
        <div
          className="menu-logo splash-logo"
          style={
            rect
              ? { left: rect.left, top: rect.top }
              : { left: '50%', top: '42%', transform: 'translateX(-50%)' }
          }
        >
          <span className="brand-char">P</span><span className="brand-char">alab</span>
        </div>
      )}
    </div>
  );
};

export default StartupSplash;
