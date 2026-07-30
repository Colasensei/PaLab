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
    // 快速 resume（移动端切后台回来可能 suspend）
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
  config, notes, duration, onFinish, onBack, onRestart, target = 'none', showDoubleGlow = true, latencyOffset = 0, lang, devMode = false, showACC = false, showWaveform = false, coverUrl = null, noteScale = 1.0, musicVolume = 80, uiBlur = true, judgeLineThickness = 3, correctHitSound = false, showAccuracyBar = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameStartRef = useRef<number>(0);
  const [effects, setEffects] = useState<JEffect[]>([]);
  const effectIdRef = useRef(0);

  // 暂停
  const [paused, setPaused] = useState(false);
  const [pauseCountdown, setPauseCountdown] = useState(0);
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
  const pauseCountdownInit = useMemo(() => getDevOverride('u_pauseCountdown'), []);
  const pauseCountInterval = useMemo(() => getDevOverride('u_pauseCountInterval'), []);
  const gameStartDelay = useMemo(() => getDevOverride('u_gameStartDelay'), []);

  // 特效
  const doubleGlowSize = useMemo(() => getDevOverride('e_doubleGlowSize'), []);
  const doubleGlowAlpha = useMemo(() => getDevOverride('e_doubleGlowAlpha'), []);
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
  const pausePanelMaxW = useMemo(() => getDevOverride('u_pauseMaxW'), []);
  const pausePanelMinH = useMemo(() => getDevOverride('u_pauseMinH'), []);
  const pauseTitleFontSize = useMemo(() => getDevOverride('u_pauseTitleFont'), []);
  const pauseCountFontSize = useMemo(() => getDevOverride('u_pauseCountFont'), []);
  const pauseBtnWidth = useMemo(() => getDevOverride('u_pauseBtnW'), []);
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

  const { state, start, setPaused: engineSetPaused, handlePress, handleRelease } = useGameEngine({
    config: effectiveConfig, notes, duration, onFinish: (r) => { stopHitKeepAlive(); onFinish(r); }, getCurrentTime, onPlayHitSound: playHitSound, latencyOffset, correctHitSound,
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
      audioManager.pause();
      engineSetPaused(true);
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
  }, [state.results, state.isFinished, target, start, hasSong, engineSetPaused]);

  // 进度条纯 performance.now()，扣掉暂停时长，直接写 DOM 不进 React
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const progressStartRef = useRef(0);
  const pauseStartRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const devTimeThrottleRef = useRef(0);
  useEffect(() => {
    let running = true;
    let raf = 0;
    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (pausedRef.current) {
        if (!pauseStartRef.current) pauseStartRef.current = performance.now();
        return;
      }
      if (pauseStartRef.current) {
        totalPausedMsRef.current += performance.now() - pauseStartRef.current;
        pauseStartRef.current = 0;
      }
      const elapsed = Math.max(0, performance.now() - progressStartRef.current - totalPausedMsRef.current);
      displayTimeRef.current = elapsed;
      // 直接更新 DOM 进度条宽度，不触发 React 渲染
      if (progressBarRef.current) {
        const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
        progressBarRef.current.style.width = `${pct}%`;
      }
      // dev 时间 200ms 刷一次够了（
      const now = performance.now();
      if (now - devTimeThrottleRef.current > 200) {
        devTimeThrottleRef.current = now;
        setDevDisplayTime(elapsed);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [duration]);

  // 开始/重启时重置进度计时
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

  // 霸王下让轨道跟着音符亮一下，autoplay 不亮（
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
    if (hasSong) { audioManager.setVolume(musicVolume / 100); audioManager.play(1); }
    engineSetPaused(false);
    setPaused(false);
  }, [hasSong, musicVolume, engineSetPaused]);

  // 暂停双击 400ms 防误触（
  const lastPauseClickRef = useRef<number>(0);
  const handlePause = useCallback(() => {
    if (pausedRef.current || state.isFinished) return;
    const now = Date.now();
    if (now - lastPauseClickRef.current < 400) {
      lastPauseClickRef.current = 0;
      doPause();
    } else {
      lastPauseClickRef.current = now;
    }
  }, [state.isFinished, doPause]);

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

  // Esc 键暂停（双击），暂停后不再支持 ESC 恢复
  const lastEscRef = useRef<number>(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (pausedRef.current) return; // 已暂停：不恢复
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
  }, [doPause]);

  // 轨道宽度，80~180px 自适应（
  const trackWidth = Math.max(trackMinW, Math.min(trackMaxW, Math.floor((window.innerWidth - hMargin) / config.trackCount)));
  const totalWidth = config.trackCount * trackWidth;

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
      if (paused) return;
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
  }, [paused, config.trackCount, onPressWithFX, onReleaseWithFX, getTrackFromClientX]);

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
        <AudioViz active={state.isPlaying && !paused} />
      )}

      {/* 游戏区域 — 触摸/鼠标事件仅在此区域内生效 */}
      <div
        ref={containerRef}
        className="game-area"
        onContextMenu={e => e.preventDefault()}
        style={{ width: totalWidth + 10, height: gameHeight, marginTop: gameTopCssVal, touchAction: 'none' }}
      >
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

        {/* 音符，同轨按时间排好防重叠 */}
        {[...state.activeNotes]
          .sort((a, b) => a.startTime - b.startTime)
          .map(note => {
          const startY = getNoteY(note.startTime);
          const result = state.results.get(note.id);
          const isBadOrMiss = result && (result.judgment.type === 'bad' || result.judgment.type === 'miss');
          const isHolding = note.type === 'hold' && state.activeHolds.has(note.id);
          if (note.type === 'tap' && result && !isBadOrMiss) return null;
          // 没按的 hold 别急着删，让它掉出屏幕再说（

          const endY = note.type === 'hold' ? getNoteY(note.endTime) : startY + tapHeight;
          const noteTop = note.type === 'hold' ? Math.min(startY, endY) : startY;
          const noteBottom = note.type === 'hold' ? Math.max(startY, endY) : startY + tapHeight;
          if (noteBottom < -noteClipTop || noteTop > gameHeight + noteClipTop) return null;

          // 按住时判线下不渲染，被吃掉了（
          const fullH = note.type === 'hold' ? Math.max(holdMinH, Math.abs(endY - startY)) : tapHeight;
          let nh: number;
          if (isHolding) {
            nh = JUDGMENT_LINE_Y - noteTop;
            if (nh <= 0) return null;
          } else {
            nh = fullH;
          }
          const isRed = !!isBadOrMiss || (note.id === failedNoteId && !result);
          const isHoldCompleted = note.type === 'hold' && result && !isBadOrMiss && !state.activeHolds.has(note.id);
          const isMarkedFailed = note.id === failedNoteId && !result;
          const bg = (isMarkedFailed ? '#FF2222'
            : isRed ? '#FF3333'
            : isHoldCompleted ? `${config.holdNoteColor}66`
            : note.type === 'hold' ? config.holdNoteColor
            : config.noteColor);

          // 自定义贴图（非失败状态）
          const skin = isRed || isMarkedFailed ? null
            : note.type === 'hold' ? noteHoldSkin
            : noteTapSkin;

          const noteLeft = note.track * trackWidth + trackWidth / 2;

          const noteStyle: React.CSSProperties = {
            left: noteLeft, top: noteTop, width: trackWidth - notePadX, height: nh,
            backgroundColor: skin ? 'transparent' : bg,
            backgroundImage: skin ? `url(${skin})` : undefined,
            backgroundSize: skin ? (note.type === 'hold' ? '100% 100%' : 'contain') : undefined,
            backgroundRepeat: skin ? 'no-repeat' : undefined,
            backgroundPosition: skin ? 'center' : undefined,
            borderRadius: note.type === 'hold' ? '6px 6px 14px 14px' : '6px',
            outline: skin ? 'none' : undefined,
            boxShadow: skin ? 'none'
              : note.isDouble && showDoubleGlow && !isRed
              ? `0 0 ${doubleGlowSize / 2}px ${doubleGlowColor}`  // 单层 shadow，移动端扛得住
              : isMarkedFailed ? '0 0 16px 6px rgba(255,30,30,0.8)'
              : isRed ? '0 0 10px 3px rgba(255,50,50,0.6)'
              : isHolding ? `0 0 14px 4px ${config.holdNoteColor}88`
              : `0 0 8px 2px ${config.noteColor}44`,
            opacity: isMarkedFailed ? 1 : isRed ? 0.7 : 1,
          };

          return (
            <React.Fragment key={note.id}>
              <div
                className={`note ${note.type} ${note.isDouble && showDoubleGlow ? 'double' : ''} ${isRed && !isMarkedFailed ? 'note-red' : ''} ${isHolding ? 'note-held' : ''} ${isHoldCompleted ? 'note-completed' : ''}`}
                style={noteStyle}
              />              {/* Hold 进度环 */}
              {isHolding && (() => {
                const dur = note.endTime - note.startTime;
                const elapsed = state.currentTime - note.startTime;
                const prog = dur > 0 ? Math.min(1, Math.max(0, elapsed / dur)) : 0;
                const r = holdRingR;
                const cx = r + 4;
                const circ = 2 * Math.PI * r;
                const threshold = getDevOverride('h_releaseRatio');
                const thresholdPos = circ * threshold;
                const thresholdLen = circ * 0.04; // 约 4% 的小弧段
                return (
                  <svg
                    style={{
                      position: 'absolute',
                      left: noteLeft - r - 4,
                      top: JUDGMENT_LINE_Y - r - 4,
                      width: (r + 4) * 2,
                      height: (r + 4) * 2,
                      zIndex: 6,
                      pointerEvents: 'none',
                      transform: 'rotate(-90deg)',
                    }}
                  >
                    {/* 底圈灰的 */}
                    <circle cx={cx} cy={cx} r={r} fill="none"
                      stroke="rgba(255,255,255,0.12)" strokeWidth={holdRingW} />
                    {/* 金的进度 */}
                    <circle cx={cx} cy={cx} r={r} fill="none"
                      stroke={holdRingColor} strokeWidth={holdRingW}
                      strokeDasharray={`${circ * prog} ${circ}`}
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 4px ${holdRingColor})` }} />
                    {/* 78% 阈值白线，可调（ */}
                    <circle cx={cx} cy={cx} r={r} fill="none"
                      stroke="rgba(255,255,255,0.7)" strokeWidth={holdRingW + 1.5}
                      strokeDasharray={`${thresholdLen} ${circ - thresholdLen}`}
                      strokeDashoffset={-(thresholdPos - thresholdLen / 2)}
                      strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.5))' }} />
                  </svg>
                );
              })()}
            </React.Fragment>
          );
        })}

        {/* 圆圈特效 — 快速扩散 */}
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
      {paused && (
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
