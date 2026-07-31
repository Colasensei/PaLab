import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  Note, GameConfig, GameResults, KEY_MAP, JudgmentType,
} from '@/types';
import { useGameEngine, useInput } from '@/hooks';
import { audioManager } from '@/utils';
import { t, Lang } from '@/utils/lang';
import { getDevOverride } from '@/utils/devOverrides';
import { generateBlurredBg } from '@/utils/blurImage';
import { getAssetUrl, loadAsset, ASSET_KEYS } from '@/utils/assetStore';
import { isOverlord } from '@/utils/overlord';


interface GamePlayProps {
  config: GameConfig;
  notes: Note[];
  duration: number;
  onFinish: (results: GameResults) => void;
  onBack: () => void;
  onRestart?: () => void;
  target?: 'none' | 'fc' | 'ap';
  showDoubleGlow?: boolean;
  latencyOffset?: number;
  lang: Lang;
  devMode?: boolean;
  showACC?: boolean;
  showWaveform?: boolean;
  coverUrl?: string | null;
  noteScale?: number;
  musicVolume?: number;
  uiBlur?: boolean;
  judgeLineThickness?: number;
  correctHitSound?: boolean;
  showAccuracyBar?: boolean;
  showFPS?: boolean;
}

const FALL_DURATION = 3000; // 实际从 devOverrides 读的后备值，别用这个（

const JUDGMENT_COLORS: Record<JudgmentType, string> = {
  perfect: '#FFD700',
  good: '#4488FF',
  bad: '#FF4444',
  miss: '#FF4444',
};

interface JEffect {
  id: string;
  type: JudgmentType;
  track: number;
  time: number;
}

// ═══════════════════════════════════════════════
// 低延迟打击音效 — 模块级缓存 + keep-alive
// ═══════════════════════════════════════════════

let audioCtx: AudioContext | null = null;
let hitBuffer: AudioBuffer | null = null;
let hitGain: GainNode | null = null;
let hitVolume = 1.0;
let audioPreloaded = false;

// 预缓存 gain 参数，避免每 hit 读 localStorage（同步 I/O）
let _cachedGainMax = 6.0;
let _cachedGainMul = 8.0;

// keep-alive：持续运行的静音 OscillatorNode，防止 Android 音频管线休眠
let _keepAliveOsc: OscillatorNode | null = null;
let _keepAliveGain: GainNode | null = null;
let _keepAliveRunning = false;

async function preloadAudio() {
  if (audioPreloaded) return;
  try {
    audioCtx = new AudioContext({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    // 缓存 gain 参数（只在 preload 时读一次 localStorage）
    _cachedGainMax = getDevOverride('a_hitGainMax');
    _cachedGainMul = getDevOverride('a_hitGainMul');

    let arrayBuf: ArrayBuffer;
    // 优先用用户自定义音效（localStorage），没有再 fetch 默认文件
    const customHit = loadAsset(ASSET_KEYS.hitSound);
    if (customHit) {
      const base64 = customHit.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      arrayBuf = bytes.buffer;
    } else {
      const resp = await fetch('/tab.ogg');
      arrayBuf = await resp.arrayBuffer();
    }
    hitBuffer = await audioCtx.decodeAudioData(arrayBuf);
    hitGain = audioCtx.createGain();
    hitGain.connect(audioCtx.destination);
    // 设初始 gain（之后只在 setHitVolume 里更新）
    hitGain.gain.value = Math.min(_cachedGainMax, hitVolume * _cachedGainMul);
    audioPreloaded = true;

    // 预热音频管线——无声爆一个脉冲，让 AudioContext 调度器"热起来"
    // Android WebView 首次 play 调度延迟可差 10-15ms，预热后稳定在 2-5ms
    const warmSrc = audioCtx.createBufferSource();
    warmSrc.buffer = hitBuffer;
    const warmGain = audioCtx.createGain();
    warmGain.gain.value = 0;
    warmSrc.connect(warmGain).connect(audioCtx.destination);
    warmSrc.start(0);
    warmSrc.onended = () => { try { warmSrc.disconnect(); warmGain.disconnect(); } catch {} };
  } catch { /* fallback to HTMLAudioElement */ }
}

/**
 * 启动 keep-alive：持续运行的静音 OscillatorNode。
 * Android 音频管线在 ~2 秒无活动后会休眠，
 * 下次 start(0) 多出 10-30ms 调度延迟。
 * 这个 1Hz 无声振荡器让管线永不睡眠。
 */
export function startHitKeepAlive() {
  if (!audioCtx || _keepAliveRunning) return;
  // 如果 suspend 了先拉起来
  if (audioCtx.state === 'suspended') audioCtx.resume();
  try {
    _keepAliveOsc = audioCtx.createOscillator();
    _keepAliveGain = audioCtx.createGain();
    _keepAliveGain.gain.value = 0;
    _keepAliveOsc.frequency.value = 1; // 1Hz, 完全听不到
    _keepAliveOsc.connect(_keepAliveGain).connect(audioCtx.destination);
    _keepAliveOsc.start();
    _keepAliveRunning = true;
  } catch { /* 不理 */ }
}

export function stopHitKeepAlive() {
  if (!_keepAliveRunning) return;
  try {
    _keepAliveOsc?.stop();
    _keepAliveOsc?.disconnect();
    _keepAliveGain?.disconnect();
  } catch { /* 不理 */ }
  _keepAliveOsc = null;
  _keepAliveGain = null;
  _keepAliveRunning = false;
}

export function setHitVolume(v: number) {
  hitVolume = v;
  // 只在音量变化时更新 GainNode，不在每 hit 热路径上做
  if (hitGain && audioCtx) {
    hitGain.gain.value = Math.min(_cachedGainMax, v * _cachedGainMul);
  }
}

export function getHitVolume() { return hitVolume; }

function playHitSound() {
  if (audioCtx && hitBuffer && hitGain) {
    // 快速 resume（移动端切后台回来可能 suspend）；先等 resume 完成再调度，避免掉音/延迟
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        const src = audioCtx!.createBufferSource();
        src.buffer = hitBuffer!;
        src.connect(hitGain!);
        src.start(0);
        src.onended = () => { try { src.disconnect(); } catch {} };
      }).catch(() => {});
      return;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = hitBuffer;
    src.connect(hitGain);
    src.start(0);
    src.onended = () => { try { src.disconnect(); } catch {} };
  } else {
    const src = getAssetUrl('tab.ogg', '/tab.ogg');
    const a = new Audio(src);
    a.volume = hitVolume;
    a.play().catch(() => {});
  }
}

// 音频可视化，不播只读（
const AudioViz: React.FC<{ active: boolean }> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const audio = audioManager.getAudioElement();
    if (!audio) return;
    let ctx: AudioContext;
    let analyser: AnalyserNode;
    try {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = getDevOverride('a_fftSize');
      analyser.smoothingTimeConstant = getDevOverride('a_smoothing');
      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    } catch { return; }
    return () => { ctx.close(); analyserRef.current = null; };
  }, [active]);

  useEffect(() => {
    if (!active || !analyserRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount; // 128 bins
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      const w = canvas.offsetWidth * 2;
      const h = canvas.offsetHeight * 2;
      canvas.width = w;
      canvas.height = h;
      ctx2d.clearRect(0, 0, w, h);

      const barCount = getDevOverride('a_vizBars');
      const binLimit = Math.floor(bufferLength * 0.4); // 只用低频 40%
      const gap = 1; // 柱间 1px 间隙
      const totalGaps = (barCount - 1) * gap;
      const availW = w - totalGaps;
      const barW = Math.floor(availW / barCount);
      // 让所有柱子均匀拉伸，剩余像素分给最右几根
      let x = 0;
      const extraEnd = availW - barW * barCount;
      for (let i = 0; i < barCount; i++) {
        const binIdx = Math.floor((i / (barCount - 1)) * (binLimit - 1));
        const val = dataArray[binIdx];
        const barH = (val / 255) * h * getDevOverride('a_vizHeightMul');
        const ww = barW + (i >= barCount - extraEnd ? 1 : 0);
        const alpha = getDevOverride('a_vizAlphaMin') + (val / 255) * getDevOverride('a_vizAlphaMax');
        ctx2d.fillStyle = `rgba(53,191,255,${alpha})`;
        ctx2d.fillRect(x, h - barH, ww, barH);
        x += ww + gap;
      }
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="audio-viz-canvas" />;
};

// ═══════════════════════════════════════════════
// 准度条 — 显示最近打击偏移
// ═══════════════════════════════════════════════

const AccuracyBar: React.FC<{ lastOffset: number }> = ({ lastOffset }) => {
  const caretRef = useRef<HTMLDivElement>(null);

  const timeB = useMemo(() => getDevOverride('j_timeB'), []); // perfect ±80ms
  const timeA = useMemo(() => getDevOverride('j_timeA'), []); // good ±160ms

  // 颜色分区：红每侧固定 10%，绿+黄每侧 40%，绿:黄 = timeB:(timeA-timeB)
  const redW = 10; // 每侧红区宽度 %
  const midW = 50 - redW; // 每侧绿+黄宽度 = 40%
  const ratioG = timeB / timeA; // 绿占绿+黄的比例 = 80/160 = 0.5
  const greenHW = midW * ratioG;  // 绿每侧宽度 = 20%
  const yellowHW = midW - greenHW; // 黄每侧宽度 = 20%

  const redL_end = redW;
  const yellowL_end = redW + yellowHW;
  const greenL_at_center = 50;
  const greenR_end = 50 + greenHW;
  const yellowR_end = greenR_end + yellowHW;

  // caret: -timeA..0→redW..50%, 0..+timeA→50%..(100-redW), 超出钳位
  const getPercent = useCallback((offset: number) => {
    if (offset <= -timeA) return 0;
    if (offset >= timeA) return 100;
    if (offset <= 0) return redW + ((offset + timeA) / timeA) * midW;
    return 50 + (offset / timeA) * midW;
  }, [timeA, redW, midW]);

  const pct = getPercent(lastOffset);

  useEffect(() => {
    if (caretRef.current) {
      caretRef.current.style.left = `${pct}%`;
      caretRef.current.style.transition = 'left 0.08s linear';
    }
  }, [lastOffset, pct]);

  const gradient = [
    `#FF4444 0%`,
    `#FF4444 ${redL_end}%`,
    `#FFD700 ${redL_end}%`,
    `#FFD700 ${yellowL_end.toFixed(1)}%`,
    `#44BB44 ${yellowL_end.toFixed(1)}%`,
    `#44BB44 ${greenR_end.toFixed(1)}%`,
    `#FFD700 ${greenR_end.toFixed(1)}%`,
    `#FFD700 ${yellowR_end.toFixed(1)}%`,
    `#FF4444 ${yellowR_end.toFixed(1)}%`,
    `#FF4444 100%`,
  ].join(', ');

  return (
    <div style={{
      position: 'absolute',
      bottom: 'clamp(28px, 3.5vh, 42px)',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'clamp(140px, 20vw, 280px)',
      zIndex: 20,
    }}>
      {/* 条 */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: 'clamp(5px, 0.7vh, 8px)',
        borderRadius: 'clamp(3px, 0.4vh, 5px)',
        outline: '2px solid rgba(255,255,255,0.6)',
        outlineOffset: 2,
        background: `linear-gradient(to right, ${gradient})`,
        opacity: 0.85,
      }}>
        {/* 中分线 */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: -3,
          bottom: -3,
          width: 2,
          background: '#fff',
          transform: 'translateX(-50%)',
          zIndex: 2,
        }} />
      </div>
      {/* 箭头 ▲ 向上指 */}
      <div ref={caretRef} style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderBottom: '6px solid #fff',
        marginTop: 2,
        willChange: 'left',
      }} />
    </div>
  );
};

export const GamePlay: React.FC<GamePlayProps> = ({
  config, notes, duration, onFinish, onBack, onRestart, target = 'none', showDoubleGlow = true, latencyOffset = 0, lang, devMode = false, showACC = false, showWaveform = false, coverUrl = null, noteScale = 1.0, musicVolume = 80, uiBlur = true, judgeLineThickness = 3, correctHitSound = false, showAccuracyBar = false, showFPS = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameStartRef = useRef<number>(0);
  const [effects, setEffects] = useState<JEffect[]>([]);
  const effectIdRef = useRef(0);

  const [paused, setPaused] = useState(false);
  const pauseTimeRef = useRef<number>(0);
  const totalPauseRef = useRef<number>(0);
  const hasSong = !!config.songUrl;

  // FC/AP 炸了 → 回旋镖动画
  const [retryAnim, setRetryAnim] = useState(false);
  // 上次翻车的音符，重试时标红（
  const [failedNoteId, setFailedNoteId] = useState<number | null>(null);

  // dev 面板折叠，长按触发（
  const [devCollapsed, setDevCollapsed] = useState(false);
  const devLongPressRef = useRef<number>(0);

  // 键盘按下的轨道
  const [keysDown, setKeysDown] = useState<Set<number>>(new Set());
  // combo 整百放大一下（
  const [comboPulse, setComboPulse] = useState(false);
  const prevComboRef = useRef(0);

  // 进度条直接操 DOM，别走 React 渲染，每帧 setState 顶不住（
  const progressBarRef = useRef<HTMLDivElement>(null);
  const displayTimeRef = useRef(0);
  const [devDisplayTime, setDevDisplayTime] = useState(0); // 仅 dev 面板用，节流更新

  // 动态尺寸
  const gameTopMargin = useMemo(() => getDevOverride('p_gameTopMargin'), []);
  const judgeLineOffset = useMemo(() => getDevOverride('p_judgeLineOffset'), []);
  const fallDuration = useMemo(() => getDevOverride('p_fallDuration'), []);
  const noteClipTop = useMemo(() => getDevOverride('p_noteClipTop'), []);
  const trackMinW = useMemo(() => getDevOverride('n_trackMinW'), []);
  const trackMaxW = useMemo(() => getDevOverride('n_trackMaxW'), []);
  const hMargin = useMemo(() => getDevOverride('n_hMargin'), []);
  const notePadX = useMemo(() => Math.max(0, getDevOverride('n_notePadX') / Math.max(0.5, noteScale)), [noteScale]);
  const tapHeight = useMemo(() => getDevOverride('n_tapHeight'), []);
  const tapRadius = useMemo(() => getDevOverride('n_tapRadius'), []);
  const holdMinH = useMemo(() => getDevOverride('n_holdMinH'), []);
  const holdRingR = useMemo(() => getDevOverride('n_holdRingR'), []);
  const holdRingW = useMemo(() => getDevOverride('n_holdRingW'), []);
  const holdRingColor = useMemo(() => getDevOverride('n_holdRingColor'), []);
  const circleInnerW = useMemo(() => getDevOverride('n_circleInnerW'), []);
  const circleOuterW = useMemo(() => getDevOverride('n_circleOuterW'), []);
  const comboFontSize = useMemo(() => getDevOverride('e_comboFontSize'), []);
  const scoreFontSize = useMemo(() => getDevOverride('e_scoreFontSize'), []);
  const gameStartDelay = useMemo(() => getDevOverride('u_gameStartDelay'), []);
  const pausePanelMaxW = useMemo(() => getDevOverride('u_pauseMaxW'), []);
  const pausePanelMinH = useMemo(() => getDevOverride('u_pauseMinH'), []);
  const pauseTitleFontSize = useMemo(() => getDevOverride('u_pauseTitleFont'), []);

  // 特效
  const doubleGlowColor = useMemo(() => getDevOverride('e_doubleGlowColor'), []);
  const tapEffInitial = useMemo(() => getDevOverride('e_tapEffInitial'), []);
  const tapEffSpread = useMemo(() => getDevOverride('e_tapEffSpread'), []);
  const tapEffFade = useMemo(() => getDevOverride('e_tapEffFade'), []);
  const ringEffInitial = useMemo(() => getDevOverride('e_ringEffInitial'), []);
  const ringEffSpread = useMemo(() => getDevOverride('e_ringEffSpread'), []);
  const ringEffFade = useMemo(() => getDevOverride('e_ringEffFade'), []);
  const comboPulseMs = useMemo(() => getDevOverride('e_comboPulseMs'), []);
  const noteFadeIn = useMemo(() => getDevOverride('e_noteFadeIn'), []);
  const noteFadeOut = useMemo(() => getDevOverride('e_noteFadeOut'), []);
  const holdPulseS = useMemo(() => getDevOverride('e_holdPulse'), []);
  const effCleanInterval = useMemo(() => getDevOverride('e_effCleanInterval'), []);
  const effMaxAge = useMemo(() => getDevOverride('e_effMaxAge'), []);

  // 音频可视化 - 使用 getDevOverride 直接在 useEffect 中读取

  // UI 布局
  const progressH = useMemo(() => getDevOverride('u_progressH'), []);
  const bgBlurVal = useMemo(() => getDevOverride('u_bgBlur'), []);
  const bgBrightnessVal = useMemo(() => getDevOverride('u_bgBrightness'), []);
  const bgScaleVal = useMemo(() => getDevOverride('u_bgScale'), []);
  const gameTopCssVal = useMemo(() => getDevOverride('u_gameTopCss'), []);
  const comboKThreshold = useMemo(() => getDevOverride('u_comboKFormat'), []);
  const scoreKThreshold = useMemo(() => getDevOverride('u_scoreKFormat'), []);

  // 模糊：开 → CSS 实时；关 → 预生成静态图（
  const [blurredBg, setBlurredBg] = useState<string | null>(null);
  useEffect(() => {
    if (uiBlur || !coverUrl) { setBlurredBg(null); return; }
    generateBlurredBg(coverUrl, bgBlurVal, bgBrightnessVal).then(setBlurredBg);
  }, [coverUrl, bgBlurVal, bgBrightnessVal, uiBlur]);

  const [gameHeight, setGameHeight] = useState(window.innerHeight - gameTopMargin);
  const JUDGMENT_LINE_Y = gameHeight - judgeLineOffset;

  useEffect(() => {
    const onResize = () => setGameHeight(window.innerHeight - gameTopMargin);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 获取游戏时间
  const getCurrentTime = useCallback((): number => {
    if (hasSong) return audioManager.getCurrentTime();
    return performance.now() - gameStartRef.current - totalPauseRef.current;
  }, [hasSong]);

  // 无敌娱乐模式 → 等同于 autoPlay
  const invincibleMode = useMemo(() => getDevOverride('invincibleMode'), []);
  // 霸王模式就是套一层 auto，但藏标、亮轨、记成绩（
  const effectiveConfig = useMemo(() => (invincibleMode || isOverlord()) ? { ...config, autoPlay: true } : config, [config, invincibleMode]);

  // 引擎倒计时结束时恢复音频
  const handleEngineResume = useCallback(() => {
    if (hasSong) audioManager.resume();
  }, [hasSong]);

  const { state, start, setPaused: engineSetPaused, handlePress, handleRelease } = useGameEngine({
    config: effectiveConfig, notes, duration, onFinish: (r) => { stopHitKeepAlive(); onFinish(r); }, getCurrentTime, onPlayHitSound: playHitSound, latencyOffset, correctHitSound, onResume: handleEngineResume,
  });

  // combo 颜色：全P金 / 有G蓝 / 断白
  const comboColor = state.hasBreak ? '#FFFFFF' : state.hasGood ? '#4488FF' : '#FFD700';
  const comboStyle: React.CSSProperties = {
    color: comboColor,
    textShadow: state.hasBreak
      ? '0 0 10px rgba(255,255,255,0.3)'
      : state.hasGood
        ? '0 0 20px rgba(68,136,255,0.5)'
        : '0 0 20px rgba(255,215,0,0.5)',
  };

  const onPressWithFX = useCallback((track: number) => {
    if (paused || effectiveConfig.autoPlay) return;
    const result = handlePress(track);
    if (result.hit) {
      // bad/miss 别响了也别闪了（
      if (result.judgmentType !== 'bad' && result.judgmentType !== 'miss') {
        // 正解音模式下引擎已到点播放正确音效，不响玩家自己的
        if (result.playSound && !correctHitSound) playHitSound();
        if (getDevOverride('perf_hitEffectRender')) {
          const id = String(effectIdRef.current++);
          const max = getDevOverride('perf_maxParticles');
          setEffects(prev => {
            const jt = result.judgmentType === 'good' ? 'good' : 'perfect';
            const next = [...prev, { id, type: jt as 'perfect' | 'good', track, time: performance.now() }];
            return next.length > max ? next.slice(-max) : next;
          });
        }
      }
    }
    setKeysDown(prev => new Set(prev).add(track));
  }, [paused, effectiveConfig.autoPlay, handlePress, correctHitSound]);

  const onReleaseWithFX = useCallback((track: number) => {
    if (effectiveConfig.autoPlay) return;
    handleRelease(track);
    setKeysDown(prev => { const n = new Set(prev); n.delete(track); return n; });
  }, [effectiveConfig.autoPlay, handleRelease]);

  useInput({
    trackCount: config.trackCount,
    onPress: onPressWithFX,
    onRelease: onReleaseWithFX,
  });

  // 预热音效 + 到点自动开（
  useEffect(() => {
    preloadAudio();
    const timer = setTimeout(() => {
      resetProgressTimer();
      gameStartRef.current = performance.now();
      totalPauseRef.current = 0;
      startHitKeepAlive();
      if (hasSong) { audioManager.setVolume(musicVolume / 100); audioManager.play(1); }
      start();
    }, gameStartDelay);
    return () => clearTimeout(timer);
  }, [start, hasSong]);

  // 离开页面 / 结算 → 停 keep-alive + 停音乐
  useEffect(() => {
    return () => { stopHitKeepAlive(); audioManager.stop(); };
  }, []);

  // FC/AP 炸了：停歌 → 动画 → 重开
  const lastResultCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAnimRef = useRef(false);
  useEffect(() => {
    if (target === 'none' || state.isFinished || retryAnimRef.current) return;
    const arr = Array.from(state.results.values());
    if (arr.length <= lastResultCountRef.current) return;
    lastResultCountRef.current = arr.length;
    const latest = arr[arr.length - 1];
    const failed = target === 'ap'
      ? latest.judgment.type !== 'perfect'
      : latest.judgment.type === 'bad' || latest.judgment.type === 'miss';
    if (failed) {
      audioManager.stop();
      retryAnimRef.current = true;
      setRetryAnim(true);
      setFailedNoteId(latest.note.id);
      retryTimerRef.current = setTimeout(() => {
        setRetryAnim(false);
        retryAnimRef.current = false;
        audioManager.stop();
        gameStartRef.current = performance.now();
        totalPauseRef.current = 0;
        lastResultCountRef.current = 0;
        resetProgressTimer();
        setEffects([]);
        seenRef.current = new Set();
        setTimeout(() => {
          if (hasSong) { audioManager.setVolume(musicVolume / 100); audioManager.play(1); }
          start();
        }, 50);
      }, 1100);
    }
  }, [state.results, state.isFinished, target, start, hasSong]);

  // 进度条
  const progressStartRef = useRef(0);
  const pauseStartRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const devTimeThrottleRef = useRef(0);

  // FPS 计数器
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!showFPS) return;
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) { setFps(frames); frames = 0; last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showFPS]);

  // 进度条
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const pauseRewindRef2 = useRef(state.pauseRewind);
  pauseRewindRef2.current = state.pauseRewind;
  useEffect(() => {
    let running = true;
    let raf = 0;
    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (pausedRef.current || pauseRewindRef2.current > 0) {
        if (!pauseStartRef.current) pauseStartRef.current = performance.now();
        return;
      }
      if (pauseStartRef.current) {
        totalPausedMsRef.current += performance.now() - pauseStartRef.current;
        pauseStartRef.current = 0;
      }
      const elapsed = Math.max(0, performance.now() - progressStartRef.current - totalPausedMsRef.current);
      displayTimeRef.current = elapsed;
      if (progressBarRef.current) {
        const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
        progressBarRef.current.style.width = `${pct}%`;
      }
      const now = performance.now();
      if (now - devTimeThrottleRef.current > 200) {
        devTimeThrottleRef.current = now;
        setDevDisplayTime(elapsed);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [duration]);

  const resetProgressTimer = () => {
    progressStartRef.current = performance.now();
    pauseStartRef.current = 0;
    totalPausedMsRef.current = 0;
    displayTimeRef.current = 0;
    setDevDisplayTime(0);
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  };

  // 新判定 → 哐叽特效
  const seenRef = useRef<Set<number>>(new Set());
  const perfHitEffect = useMemo(() => getDevOverride('perf_hitEffectRender'), []);
  const perfMaxParticles = useMemo(() => getDevOverride('perf_maxParticles'), []);
  const perfBgCover = useMemo(() => getDevOverride('perf_bgCoverRender'), []);
  const perfAudioViz = useMemo(() => getDevOverride('perf_audioVizRender'), []);
  // 音符自定义贴图
  const noteTapSkin = useMemo(() => loadAsset(ASSET_KEYS.noteTap), []);
  const noteHoldSkin = useMemo(() => loadAsset(ASSET_KEYS.noteHold), []);
  useEffect(() => {
    if (!perfHitEffect) return;
    if (!effectiveConfig.autoPlay) return;
    state.results.forEach((r, noteId) => {
      if (!seenRef.current.has(noteId)) {
        seenRef.current.add(noteId);
        const id = String(effectIdRef.current++);
        setEffects(prev => {
          const next = [...prev, { id, type: r.judgment.type, track: r.note.track, time: performance.now() }];
          return next.length > perfMaxParticles ? next.slice(-perfMaxParticles) : next;
        });
      }
    });
  }, [state.results, perfHitEffect, perfMaxParticles, effectiveConfig.autoPlay]);
  const prevResultCountRef = useRef(0);
  useEffect(() => {
    if (!isOverlord()) return;
    const resultsArr = Array.from(state.results.values());
    if (resultsArr.length > prevResultCountRef.current) {
      const newTracks = new Set<number>();
      for (let i = prevResultCountRef.current; i < resultsArr.length; i++) {
        newTracks.add(resultsArr[i].note.track);
      }
      if (newTracks.size > 0) {
        setKeysDown(prev => {
          const next = new Set(prev);
          newTracks.forEach(t => next.add(t));
          return next;
        });
        setTimeout(() => {
          setKeysDown(prev => {
            const next = new Set(prev);
            newTracks.forEach(t => next.delete(t));
            return next;
          });
        }, 80);
      }
    }
    prevResultCountRef.current = resultsArr.length;
  }, [state.results, effectiveConfig.autoPlay]);

  // 长条按住期间轨道也得亮着，不然谁知道在按（
  const heldTracksRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!isOverlord()) return;
    const currentHeld = new Set<number>();
    state.activeHolds.forEach(noteId => {
      const note = notes.find(n => n.id === noteId);
      if (note) currentHeld.add(note.track);
    });
    // 新进的 hold，亮
    currentHeld.forEach(t => {
      if (!heldTracksRef.current.has(t)) {
        heldTracksRef.current.add(t);
        setKeysDown(prev => new Set(prev).add(t));
      }
    });
    // 松开的 hold，灭
    heldTracksRef.current.forEach(t => {
      if (!currentHeld.has(t)) {
        heldTracksRef.current.delete(t);
        setKeysDown(prev => { const n = new Set(prev); n.delete(t); return n; });
      }
    });
  }, [state.activeHolds, notes]);

  // Combo 整百炸一下（
  useEffect(() => {
    const combo = state.combo;
    if (combo > 0 && combo % 100 === 0 && combo !== prevComboRef.current) {
      setComboPulse(true);
      setTimeout(() => setComboPulse(false), comboPulseMs);
    }
    prevComboRef.current = combo;
  }, [state.combo]);

  // 过期特效该扫了（
  useEffect(() => {
    if (effects.length === 0) return;
    const iv = setInterval(() => {
      const now = performance.now();
      setEffects(prev => prev.filter(e => now - e.time < effMaxAge));
    }, effCleanInterval);
    return () => clearInterval(iv);
  }, [effects.length]);

  const doPause = useCallback(() => {
    audioManager.pause();
    engineSetPaused(true);
    setPaused(true);
    pauseTimeRef.current = performance.now();
  }, [engineSetPaused]);

  const doResume = useCallback(() => {
    totalPauseRef.current += performance.now() - pauseTimeRef.current;
    engineSetPaused(false);
    setPaused(false);
  }, [engineSetPaused]);

  const handlePause = useCallback(() => {
    if (paused || state.isFinished) return;
    const now = Date.now();
    if (now - lastPauseClickRef.current < 400) {
      lastPauseClickRef.current = 0;
      doPause();
    } else {
      lastPauseClickRef.current = now;
    }
  }, [paused, state.isFinished, doPause]);

  const handleResume = useCallback(() => {
    doResume();
  }, [doResume]);

  const handleRetry = useCallback(() => {
    audioManager.stop();
    if (onRestart) onRestart();
    else onBack();
  }, [onRestart, onBack]);

  const handleQuit = useCallback(() => {
    audioManager.stop();
    onBack();
  }, [onBack]);

  // 暂停双击
  const lastPauseClickRef = useRef<number>(0);

  // Esc 暂停
  const lastEscRef = useRef<number>(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (paused) return;
      const now = Date.now();
      if (now - lastEscRef.current < 400) {
        lastEscRef.current = 0;
        doPause();
      } else {
        lastEscRef.current = now;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [paused, doPause]);

  // 轨道宽度，80~180px 自适应（
  const trackWidth = Math.max(trackMinW, Math.min(trackMaxW, Math.floor((window.innerWidth - hMargin) / config.trackCount)));
  const totalWidth = config.trackCount * trackWidth;

  // Canvas 音符渲染 — 只用 ref 读运行时状态，不重建 rAF
  const canvasStateRef = useRef(state);
  canvasStateRef.current = state;
  const canvasFailedRef = useRef(failedNoteId);
  canvasFailedRef.current = failedNoteId;

  useEffect(() => {
    const canvas = noteCanvasRef.current;
    if (!canvas) return;
    // DPR 封顶到 2：高分屏填充量最多 4x CSS 像素，足够清晰且性能好
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = canvas.getContext('2d')!;

    let raf = 0;
    // 平滑视觉时钟：音符位置跟随 performance.now()（显示刷新时钟），避免
    // audio.currentTime 的媒体时钟与 rAF 不同步导致「一顿一顿」（电脑高刷屏尤其明显）
    let clockBaseAudio = 0;   // 上次与音频同步时的音频时间 (ms)
    let clockBasePerf = 0;    // 对应 performance.now() (ms)
    let clockInited = false;
    let clockResync = 0;

    const loop = () => {
      const w = totalWidth + 10;
      const h = gameHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, w, h);

      const s = canvasStateRef.current;
      const rawMs = s.currentTime; // 音频时钟 (ms)
      const perf = performance.now();

      if (!clockInited) {
        clockInited = true;
        clockBaseAudio = rawMs;
        clockBasePerf = perf;
      } else if (s.paused || !s.isPlaying) {
        // 暂停/结束：直接锁到音频时间（音符静止）
        clockBaseAudio = rawMs;
        clockBasePerf = perf;
      } else {
        // 每 30 帧与音频重锁一次，防止长时间漂移（跳变在亚帧内，不可见）
        clockResync++;
        if (clockResync >= 30) {
          clockResync = 0;
          clockBaseAudio = rawMs;
          clockBasePerf = perf;
        }
      }

      // 视觉时间：播放中按显示时钟平滑推进；暂停/结束时跟随音频
      const now = (s.paused || !s.isPlaying) ? rawMs : clockBaseAudio + (perf - clockBasePerf);
      const eff = fallDuration / config.speedMultiplier;
      const jy = JUDGMENT_LINE_Y;
      const fid = canvasFailedRef.current;
      const results = s.results;
      const activeHolds = s.activeHolds;

      for (const note of s.activeNotes) {
        const result = results.get(note.id);
        const isBadOrMiss = result && (result.judgment.type === 'bad' || result.judgment.type === 'miss');
        const isHolding = note.type === 'hold' && activeHolds.has(note.id);
        const isHoldDone = note.type === 'hold' && result && !isBadOrMiss && !activeHolds.has(note.id);
        const isRed = !!isBadOrMiss || (note.id === fid && !result);
        const isFailed = note.id === fid && !result;

        const startY = jy - ((note.startTime - now) / eff) * (jy - 50);
        if (note.type === 'tap') {
          if (result && !isBadOrMiss) continue;
          const noteW = trackWidth - notePadX;
          const nx = note.track * trackWidth + trackWidth / 2 - noteW / 2;
          const ny = startY;
          const nh = tapHeight;
          if (ny + nh < -noteClipTop || ny > h + noteClipTop) continue;

          ctx.globalAlpha = isRed ? 0.7 : 1;
          ctx.fillStyle = isFailed ? '#FF2222' : isRed ? '#FF3333' : config.noteColor;
          const isDoubleNote = note.isDouble && showDoubleGlow && !isRed;
          ctx.fillRect(nx, ny, noteW, nh);
          if (isDoubleNote) {
            // 双押：黄色描边（无阴影，性能友好）
            ctx.strokeStyle = doubleGlowColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(nx, ny, noteW, nh);
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 2;
            ctx.strokeRect(nx, ny, noteW, nh);
          }

        } else {
          const endY = jy - ((note.endTime - now) / eff) * (jy - 50);
          const noteW = trackWidth - notePadX;
          const nx = note.track * trackWidth + trackWidth / 2 - noteW / 2;

          let ny: number, nh: number;
          if (isHolding) {
            // 按住：头部已过判定线（下方隐藏），只画尾部→判定线这一段
            // 尾部随下落逐渐靠近判定线 → 长条逐渐变短，落完整个消失
            ny = endY;
            nh = jy - endY;
            if (nh <= 0) continue;
          } else {
            ny = Math.min(startY, endY);
            nh = Math.abs(endY - startY);
            if (nh < holdMinH) nh = holdMinH;
          }
          if (ny + nh < -noteClipTop || ny > h + noteClipTop) continue;

          ctx.globalAlpha = isRed ? 0.7 : isHoldDone ? 0.4 : 1;
          ctx.fillStyle = isFailed ? '#FF2222' : isRed ? '#FF3333' : isHoldDone ? config.holdNoteColor + '66' : config.holdNoteColor;
          ctx.fillRect(nx, ny, noteW, nh);
          if (note.isDouble && showDoubleGlow && !isRed) {
            // 双押 hold：明显的黄边
            ctx.strokeStyle = doubleGlowColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(nx, ny, noteW, nh);
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 2;
            ctx.strokeRect(nx, ny, noteW, nh);
          }

          if (isHolding) {
            const dur = note.endTime - note.startTime;
            const elapsed = s.currentTime - note.startTime;
            const prog = dur > 0 ? Math.min(1, Math.max(0, elapsed / dur)) : 0;
            const rr = holdRingR;
            const cx = nx + noteW / 2;
            const cy = jy;
            ctx.beginPath();
            ctx.arc(cx, cy, rr + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = holdRingW;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
            ctx.strokeStyle = holdRingColor;
            ctx.lineWidth = holdRingW;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [totalWidth, gameHeight, JUDGMENT_LINE_Y, trackWidth, notePadX, tapHeight, holdMinH, holdRingR, holdRingW, holdRingColor,
      doubleGlowColor, showDoubleGlow, config.noteColor, config.holdNoteColor, fallDuration, config.speedMultiplier, noteClipTop]);

  const getNoteY = (noteTime: number): number => {
    const timeUntil = noteTime - state.currentTime;
    const eff = fallDuration / config.speedMultiplier;
    return JUDGMENT_LINE_Y - (timeUntil / eff) * (JUDGMENT_LINE_Y - 50);
  };

  const keys = KEY_MAP[config.trackCount];

  // 触控判定：基于游戏区域实际边界，支持多点触控
  const activeTouchesRef = useRef<Map<number, number>>(new Map()); // pointerId → track
  const getTrackFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current;
    if (!el) {
      return Math.floor((clientX / window.innerWidth) * config.trackCount);
    }
    const rect = el.getBoundingClientRect();
    const relX = clientX - rect.left;
    const frac = Math.max(0, Math.min(1, relX / rect.width));
    return Math.floor(frac * config.trackCount);
  }, [config.trackCount]);

  // 使用 pointer 事件统一鼠标+触控，pointerdown/up 比 touchstart/end 更灵敏
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const track = getTrackFromClientX(e.clientX);
      if (track < 0 || track >= config.trackCount) return;
      activeTouchesRef.current.set(e.pointerId, track);
      onPressWithFX(track);
    };
    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      const track = activeTouchesRef.current.get(e.pointerId);
      activeTouchesRef.current.delete(e.pointerId);
      if (track !== undefined && track >= 0 && track < config.trackCount) {
        onReleaseWithFX(track);
      }
    };
    const onCancel = (e: PointerEvent) => {
      const track = activeTouchesRef.current.get(e.pointerId);
      activeTouchesRef.current.delete(e.pointerId);
      if (track !== undefined && track >= 0 && track < config.trackCount) {
        onReleaseWithFX(track);
      }
    };
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointercancel', onCancel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [config.trackCount, onPressWithFX, onReleaseWithFX, getTrackFromClientX]);

  return (
    <div className="screen gameplay-screen" style={{ background: config.bgColor }}
    >
      {/* 模糊封面背景 */}
      {perfBgCover && coverUrl && (
        <div className="gameplay-cover-bg" style={{
          backgroundImage: `url(${uiBlur ? coverUrl : blurredBg})`,
          filter: uiBlur ? `blur(${bgBlurVal}px) brightness(${bgBrightnessVal})` : 'none',
          transform: `scale(${bgScaleVal})`,
        }} />
      )}

      {/* HUD */}
      <div className="hud-left">
        <button className="btn btn-small btn-pause" onClick={handlePause}>{lang === 'zh' ? '暂停' : 'Pause'}</button>
        {showFPS && <span className="fps-counter">{fps}<em>FPS</em></span>}
        {effectiveConfig.autoPlay && !isOverlord() && <span className="autoplay-badge">{invincibleMode ? 'INVINCIBLE' : 'AUTO'}</span>}
      </div>
      <div className="hud-center">
        {state.combo > 0 && <><span className={`combo-count${comboPulse ? ' combo-pulse' : ''}`} style={{ ...comboStyle, fontSize: comboFontSize }}>
          {state.combo >= comboKThreshold ? (state.combo / 1000).toFixed(1) + 'k' : state.combo}</span><span className="combo-label"> COMBO</span></>}
      </div>
      <div className="hud-right">
        <div className="hud-score" style={{ fontSize: scoreFontSize }}>
          {state.score >= scoreKThreshold ? (state.score / 1000).toFixed(1) + 'k' : Math.round(state.score).toLocaleString()}</div>
        {showACC && (
          <div className="hud-acc">
            {(() => {
              let p = 0, g = 0, total = 0;
              for (const r of state.results.values()) {
                total++;
                if (r.judgment.type === 'perfect') p++;
                else if (r.judgment.type === 'good') g++;
              }
              return `${total > 0 ? ((p + g * 0.65) / total * 100).toFixed(2) : '0.00'}%`;
            })()}
          </div>
        )}
      </div>

      {/* 左下角歌名 + 右下角等级 */}
      <div className="hud-song-info">
        <span className="hud-song-name">{config.songFileName || (lang === 'zh' ? '未命名' : 'Untitled')}</span>
        <span className="hud-song-diff">
          Lv.{config.chartConstant.toFixed(1)}&nbsp;
          <span style={{ color: config.chartConstant >= 16 ? '#FF44AA' : config.chartConstant >= 12.5 ? '#AA44FF' : config.chartConstant >= 9 ? '#FF4444' : config.chartConstant >= 5 ? '#FFAA00' : '#44BB44' }}>
            {config.chartConstant >= 16 ? 'AT' : config.chartConstant >= 12.5 ? 'IN' : config.chartConstant >= 9 ? 'HD' : config.chartConstant >= 5 ? 'NM' : 'EZ'}
          </span>
        </span>
      </div>

      {/* 准度条 */}
      {showAccuracyBar && state.isPlaying && <AccuracyBar lastOffset={state.lastOffset} />}

      {/* 顶部进度条，DOM 直驱不走 React */}
      <div className="progress-bar-container">
        <div ref={progressBarRef} className="progress-bar" style={{
          width: '0%',
          background: config.noteColor,
        }} />
      </div>

      {/* 音频可视化背景 */}
      {showWaveform && perfAudioViz && (
        <AudioViz active={state.isPlaying} />
      )}

      {/* 游戏区域 */}
      <div
        ref={containerRef}
        className="game-area"
        onContextMenu={e => e.preventDefault()}
        style={{ width: totalWidth + 10, height: gameHeight, marginTop: gameTopCssVal, touchAction: 'none' }}
      >
        {/* Canvas 音符渲染层 */}
        <canvas
          ref={noteCanvasRef}
          className="note-canvas"
          style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}
        />

        {/* 轨道线 */}
        <div className="tracks" style={{ left: 0, right: 0 }}>
          {Array.from({ length: config.trackCount }).map((_, i) => (
            <div
              key={i}
              className={`track${keysDown.has(i) ? ' track-active' : ''}`}
              style={{ width: trackWidth, borderRight: i < config.trackCount - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}
            >
              <span className="track-key">{keys[i]}</span>
            </div>
          ))}
        </div>

        <div className="judgment-line" style={{ top: JUDGMENT_LINE_Y, width: totalWidth, height: judgeLineThickness, background: config.judgeLineColor, borderRadius: Math.ceil(judgeLineThickness / 2), left: 0 }} />

        {/* 圆圈特效 */}
        {effects.filter(e => e.type === 'good' || e.type === 'perfect').map(eff => {
          const age = performance.now() - eff.time;
          const p = Math.min(age / (effMaxAge * 0.5), 1);
          const size = tapEffInitial + p * tapEffSpread;
          const opacity = Math.max(0, 1 - p * tapEffFade);
          const c = JUDGMENT_COLORS[eff.type];
          const outerSize = ringEffInitial + p * ringEffSpread;
          const outerOpacity = Math.max(0, 0.6 - p * ringEffFade);
          return (
            <React.Fragment key={eff.id}>
              {/* 外圈 */}
              <div
                className="judgment-circle-outer"
                style={{
                  left: eff.track * trackWidth + trackWidth / 2,
                  top: JUDGMENT_LINE_Y,
                  width: outerSize, height: outerSize,
                  borderColor: c, opacity: outerOpacity,
                  borderWidth: circleOuterW,
                }}
              />
              {/* 内圈 */}
              <div
                className="judgment-circle"
                style={{
                  left: eff.track * trackWidth + trackWidth / 2,
                  top: JUDGMENT_LINE_Y,
                  width: size, height: size,
                  borderColor: c, opacity,
                  borderWidth: circleInnerW,
                  boxShadow: `0 0 ${size / 2}px ${c}88`,
                }}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* FC/AP 目标失败 ⟳ 动画 */}
      {retryAnim && (
        <div className="retry-anim-overlay">
          <span className="retry-anim-icon">⟳</span>
        </div>
      )}

      {/* 暂停遮罩 */}
      {paused && state.pauseRewind <= 0 && (
        <div className="pause-overlay" onPointerDown={e => e.stopPropagation()}>
          <div className="glass-panel pause-panel" style={{ minWidth: pausePanelMaxW, minHeight: pausePanelMinH }}>
            <h2 style={{ fontSize: pauseTitleFontSize }}>{lang === 'zh' ? '暂停' : 'PAUSED'}</h2>
            <div className="pause-buttons">
              <button className="pause-sym-btn pause-sym-resume" onClick={handleResume} title={lang === 'zh' ? '继续' : 'Resume'}>▶</button>
              <button className="pause-sym-btn pause-sym-retry" onClick={handleRetry} title={lang === 'zh' ? '重试' : 'Retry'}>⟳</button>
              <button className="pause-sym-btn pause-sym-quit" onClick={handleQuit} title={t('quit', lang)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* 恢复倒计时 */}
      {state.pauseRewind > 0 && (
        <div className="rewind-overlay">
          <span className="rewind-count">{state.pauseRewind}</span>
        </div>
      )}

      {/* 开发者调试面板 */}
      {devMode && devCollapsed && (
        <button
          className="dev-toggle-btn"
          onClick={() => setDevCollapsed(false)}
        >DBG</button>
      )}
      {devMode && !devCollapsed && (
        <div className="dev-overlay"
          onPointerDown={() => { devLongPressRef.current = Date.now(); }}
          onPointerUp={() => { if (Date.now() - devLongPressRef.current > 600) setDevCollapsed(true); }}
        >
          <div className="dev-title">
            DEBUG
            <button className="dev-collapse-btn" onClick={() => setDevCollapsed(true)} title="Hide">_</button>
          </div>
          <div className="dev-row"><span>TIME</span>{devDisplayTime.toFixed(0)} / {duration}ms</div>
          <div className="dev-row"><span>SCORE</span>{Math.round(state.score).toLocaleString()}</div>
          <div className="dev-row"><span>COMBO</span>{state.combo} <em>max {state.maxCombo}</em></div>
          <div className="dev-row"><span>NOTES</span>{state.results.size} / {notes.length}</div>
          <div className="dev-row dev-sep"><span>ACCURACY</span></div>
          <div className="dev-row"><span>P / G / B / M</span>
            <span>
              {Array.from(state.results.values()).filter(r => r.judgment.type === 'perfect').length}/
              {Array.from(state.results.values()).filter(r => r.judgment.type === 'good').length}/
              {Array.from(state.results.values()).filter(r => r.judgment.type === 'bad').length}/
              {Array.from(state.results.values()).filter(r => r.judgment.type === 'miss').length}
            </span>
          </div>
          <div className="dev-row"><span>AVG OFFSET</span>
            {(() => {
              const valid = Array.from(state.results.values()).filter(r => r.judgment.offset !== Infinity);
              return valid.length > 0 ? `${(valid.reduce((s, r) => s + Math.abs(r.judgment.offset), 0) / valid.length).toFixed(1)}ms` : '-';
            })()}
          </div>
          <div className="dev-row"><span>LAST OFFSET</span>
            {(() => {
              const arr = Array.from(state.results.values()).filter(r => r.judgment.offset !== Infinity);
              return arr.length > 0 ? `${arr[arr.length - 1].judgment.offset > 0 ? '+' : ''}${arr[arr.length - 1].judgment.offset | 0}ms` : '-';
            })()}
          </div>
          <div className="dev-row dev-sep"><span>HOLDS</span></div>
          <div className="dev-row"><span>ACTIVE</span>{state.activeHolds.size}</div>
          <div className="dev-row dev-sep"><span>CONFIG</span></div>
          <div className="dev-row"><span>SPEED</span>{config.speedMultiplier.toFixed(1)}x</div>
          <div className="dev-row"><span>LATENCY</span>{latencyOffset}ms</div>
          <div className="dev-row"><span>TRACKS</span>{config.trackCount}K</div>
          <div className="dev-row"><span>AUTO PLAY</span>{config.autoPlay ? 'ON' : 'OFF'}</div>
          <div className="dev-row"><span>CHART CONST</span>{config.chartConstant.toFixed(1)}</div>
          <div className="dev-row"><span>LINE Y</span>{JUDGMENT_LINE_Y}px</div>
        </div>
      )}

      {/* 完成动画 — 从底部飞出大字 */}
      {state.isFinished && (
        <div className="game-finish-text">
          {state.hasBreak || state.hasGood ? (state.hasBreak ? 'COMPLETE' : 'FULL COMBO') : 'ALL PERFECT'}
        </div>
      )}
    </div>
  );
};
