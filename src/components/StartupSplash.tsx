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

/**
 * 启动动画配音：public 下有三组各 4 个变体的 wav，对应动画的三个阶段。
 * 每次启动时每组各随机挑一个播放，这样每次开头的念白都不完全一样。
 */
const SPLASH_VOICES = {
  page: [
    'pagestudio_12000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'pagestudio_14000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'pagestudio_28000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'pagestudio_30000_50_0.7_euler_rmvpe_0key_v=0.wav',
  ],
  mark: [
    'atomusic_12000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'atomusic_14000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'atomusic_28000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'atomusic_30000_50_0.7_euler_rmvpe_0key_v=0.wav',
  ],
  palab: [
    'palab_12000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'palab_14000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'palab_28000_50_0.7_euler_rmvpe_0key_v=0.wav',
    'palab_30000_50_0.7_euler_rmvpe_0key_v=0.wav',
  ],
} as const;

type VoiceStage = keyof typeof SPLASH_VOICES;

/** 从一组里随机挑一个（文件名带 = 号，做一次 URL 编码） */
function pickVoice(stage: VoiceStage): string {
  const list = SPLASH_VOICES[stage];
  return encodeURI(list[Math.floor(Math.random() * list.length)]);
}

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
    return () => { cancelAnimationFrame(raf); };
  }, []);

  // ── 配音 ──
  // 挂载时就把三段各自随机选好的文件预加载好（preload），
  // 到时间点再 play()，否则临时 new Audio() 要现下载解码，容易错过时间点。
  const voicesRef = useRef<Record<VoiceStage, HTMLAudioElement> | null>(null);
  const playedRef = useRef<Record<VoiceStage, boolean>>({ page: false, mark: false, palab: false });
  /** 被自动播放策略挡下的段：等用户第一次点击/按键时补播 */
  const blockedRef = useRef<VoiceStage[]>([]);

  useEffect(() => {
    const stages: VoiceStage[] = ['page', 'mark', 'palab'];
    const made = {} as Record<VoiceStage, HTMLAudioElement>;
    stages.forEach(s => {
      const a = new Audio(pickVoice(s));
      a.preload = 'auto';
      a.volume = 0.85;
      try { a.load(); } catch { /* ignore */ }
      made[s] = a;
    });
    voicesRef.current = made;

    // 浏览器不允许无交互自动播放时，第一次交互补播还没播的段
    const unlock = () => {
      const list = blockedRef.current.splice(0);
      list.forEach(s => {
        const a = made[s];
        if (!a) return;
        try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* ignore */ }
      });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stages.forEach(s => { try { made[s]?.pause(); } catch { /* ignore */ } });
    };
  }, []);

  const playVoice = (stage: VoiceStage) => {
    if (playedRef.current[stage]) return;
    playedRef.current[stage] = true;
    const a = voicesRef.current?.[stage];
    if (!a) return;
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err: unknown) => {
        // 多半是自动播放被拦（NotAllowedError）：记下来等首次交互补播
        console.warn('[splash] 配音播放被拦截:', stage, err);
        blockedRef.current.push(stage);
      });
    }
  };

  const showPage = elapsed >= T.pageStart && elapsed < T.markStart;
  const showMark = elapsed >= T.markStart && elapsed < T.palabStart;
  const showPalab = elapsed >= T.palabStart && elapsed < T.unmount;
  const fadeBlack = elapsed >= T.blackFade;

  if (showPage) playVoice('page');
  if (showMark) playVoice('mark');
  if (showPalab) playVoice('palab');

  return (
    <div className="splash-root">
      {/* 黑底单独一层：只让它淡，字不跟着淡 */}
      <div className={`splash-black${fadeBlack ? ' splash-black-out' : ''}`} />

      {showPage && <div className="splash-page"><span>PAGE</span><span>Studio</span></div>}
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
