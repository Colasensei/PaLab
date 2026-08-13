import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  Note, GameConfig, GameResults, JudgmentType, TrackCount, resolveKeys,
} from '@/types';
import { useGameEngine, useInput } from '@/hooks';
import { audioManager } from '@/utils';
import { t, Lang } from '@/utils/lang';
import { getDevOverride } from '@/utils/devOverrides';
import { generateBlurredBg } from '@/utils/blurImage';
import { getAssetUrl, loadAsset, ASSET_KEYS } from '@/utils/assetStore';
import { isOverlord } from '@/utils/overlord';
import { isTrackSplit } from '@/utils/brainSplit';


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
  keyBindings?: Partial<Record<TrackCount, string[]>>;
  /** 游戏内界面缩放（轨道/音符/判定线/准度条，不含HUD） */
  gameUiScale?: number;
  /** 谱面视频背景开关：关闭时回退到封面模糊背景 */
  videoBg?: boolean;
  /** Hold 长条渐变透明 */
  holdGradient?: boolean;
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

// 音效池：WebAudio 不可用（移动端 fetch/decode 失败）时，用预加载的 Audio 元素
// 循环复用，避免每次 hit 都 new Audio()（每次重新加载解码 = 严重延迟）
let hitPool: HTMLAudioElement[] = [];
let hitPoolIdx = 0;
let hitPoolReady = false;

/** 稳定资源 URL：兼容 Capacitor 的 https://localhost / capacitor:// 等 scheme */
function assetBaseUrl(name: string): string {
  try { return new URL(name, document.baseURI || window.location.href).href; } catch { return '/' + name; }
}

/** hex 颜色 → rgba（用于长条渐变） */
function hexToRgba(hex: string, alpha: number): string {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(h, 16);
  if (isNaN(n)) return `rgba(255,255,255,${alpha})`;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function ensureHitPool() {
  if (hitPoolReady || hitPool.length > 0) return;
  try {
    const src = getAssetUrl(ASSET_KEYS.hitSound, assetBaseUrl('tab.ogg'));
    for (let i = 0; i < 4; i++) {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = hitVolume;
      hitPool.push(a);
    }
    hitPoolReady = true;
    for (const a of hitPool) { try { a.load(); } catch {} }
  } catch { /* 音频不可用 */ }
}

function playPoolHit() {
  if (hitPool.length === 0) { ensureHitPool(); return; }
  const a = hitPool[hitPoolIdx];
  hitPoolIdx = (hitPoolIdx + 1) % hitPool.length;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* 忽略 */ }
}

/** 首次触摸时唤醒音频：手势内 resume 即时生效，避免 hit 时才异步恢复 */
function warmupAudioOnGesture() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  ensureHitPool();
  startHitKeepAlive();
}

async function preloadAudio() {
  if (audioPreloaded) return;
  try {
    audioCtx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

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
      // 用稳定 URL（兼容移动端 Capacitor 路径），避免 / 绝对路径取不到资源
      const resp = await fetch(assetBaseUrl('tab.ogg'));
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
  } catch { ensureHitPool(); }
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
  // 同步音效池音量（回退路径）
  for (const a of hitPool) { try { a.volume = v; } catch {} }
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
    playPoolHit();
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

const AccuracyBar: React.FC<{ lastOffset: number; scale?: number }> = ({ lastOffset, scale = 1 }) => {
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
      zoom: scale,
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
  config, notes, duration, onFinish, onBack, onRestart, target = 'none', showDoubleGlow = true, latencyOffset = 0, lang, devMode = false, showACC = false, showWaveform = false, coverUrl = null, noteScale = 1.0, musicVolume = 80, uiBlur = true, judgeLineThickness = 3, correctHitSound = false, showAccuracyBar = false, showFPS = false, keyBindings, gameUiScale = 1, videoBg = true, holdGradient = true,
}) => {
  // 键位：自定义优先，否则默认（useMemo 保证引用稳定，避免 useInput 监听重建）
  const keys = useMemo(() => resolveKeys(keyBindings, config.trackCount), [keyBindings, config.trackCount]);
  // 游戏内界面缩放（不含HUD）
  const gameScale = gameUiScale ?? 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const noteCanvasRef = useRef<HTMLCanvasElement>(null);
  // Hold 进度环 — 独立特效 canvas 层（zIndex 9，判定环之上）。
  // 进度环也是特效，不该画在音符层(z3)里被判定环(z8)挡住。
  const holdRingCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameStartRef = useRef<number>(0);
  const [effects, setEffects] = useState<JEffect[]>([]);
  const effectIdRef = useRef(0);

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const pauseTimeRef = useRef<number>(0);
  const totalPauseRef = useRef<number>(0);
  // 暂停时的冻结播放位置（canvas 时钟暂停时返回它）
  const pausedFrozenMsRef = useRef<number>(0);
  // 歌曲真正开始播放的 performance.now()（前摇结束后 / 无前摇直接开播时设置）。
  // 判定与视觉共用这个 perf 外推时钟，绕开 audio.currentTime 的读取延迟/粒度问题。
  const songStartPerfRef = useRef<number>(0);
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
  // 脑裂轨道判定线 Y（顶部，与底部判定线对称）；splits 为脑裂段
  const TOP_JUDGE_Y = judgeLineOffset;
  const splits = config.splits;

  useEffect(() => {
    const onResize = () => setGameHeight(window.innerHeight - gameTopMargin);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 获取游戏时间
  const getCurrentTime = useCallback((): number => {
    if (hasSong) {
      // 用 performance.now() 外推真实播放时间（而非 audio.currentTime）：
      // audio.currentTime 读取有延迟/粒度不均，直接用它会让音符一顿一顿，
      // 且与用 perf 的视觉时钟错位。前摇/未开始（songStartPerfRef=0）时保持 0。
      if (!songStartPerfRef.current) return 0;
      if (pausedRef.current) {
        // 暂停/恢复倒计时中：冻结在暂停位置（倒计时期间音符不得继续下落）
        return Math.max(0, pausedFrozenMsRef.current);
      }
      return Math.max(0, performance.now() - songStartPerfRef.current - totalPauseRef.current);
    }
    // 无歌时用性能时钟，前摇期间（leadInMs 内）保持 0；暂停/倒计时中冻结在暂停位置
    if (pausedRef.current) {
      return Math.max(0, pausedFrozenMsRef.current);
    }
    return Math.max(0, performance.now() - gameStartRef.current - leadInMsRef.current - totalPauseRef.current);
  }, [hasSong]);

  // 无敌娱乐模式 → 等同于 autoPlay
  const invincibleMode = useMemo(() => getDevOverride('invincibleMode'), []);
  // 霸王模式就是套一层 auto，但藏标、亮轨、记成绩（
  const effectiveConfig = useMemo(() => (invincibleMode || isOverlord()) ? { ...config, autoPlay: true } : config, [config, invincibleMode]);

  // ═══ 前摇（lead-in）：开局 1 秒内就有音符判定时，插入 4 拍空档再放歌，提升体验 ═══
  const leadInMs = useMemo(() => {
    if (notes.length === 0) return 0;
    const hasEarly = notes.some(n => n.startTime < 1000);
    if (!hasEarly) return 0;
    const bpm = Math.max(30, effectiveConfig.bpm || 120);
    return Math.round(4 * (60000 / bpm));
  }, [notes, effectiveConfig.bpm]);
  const leadInMsRef = useRef(0);
  leadInMsRef.current = leadInMs;
  const [leadInActive, setLeadInActive] = useState(false);
  // 供 canvas 循环同步读取（避免 React state 异步延迟导致音符抽搐）
  const leadInActiveRef = useRef(false);
  leadInActiveRef.current = leadInActive;
  const leadInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songStartedRef = useRef(true);

  // 开局统一入口：有前摇则延迟 leadInMs 放歌（期间谱面冻结、进度条不走、显示 READY?）
  const beginSong = useCallback(() => {
    if (leadInTimerRef.current) { clearTimeout(leadInTimerRef.current); leadInTimerRef.current = null; }
    // 歌曲真正开始播放的时刻 = perf 外推时钟的 0 点（与音符时间轴 0 对齐）
    const markStarted = () => { songStartPerfRef.current = performance.now(); };
    if (leadInMs > 0) {
      songStartedRef.current = false;
      leadInActiveRef.current = true;
      setLeadInActive(true);
      if (hasSong) audioManager.setVolume(musicVolume / 100);
      leadInTimerRef.current = setTimeout(() => {
        songStartedRef.current = true;
        // audio.play() 是异步的：先 play()，等音频真正开始播放（promise resolve）
        // 再标记起始时刻并解除冻结，保证音符时间轴与音频播放严格对齐
        // （避免 play 启动期 audio.currentTime 停 0 导致的漏判与卡顿）。
        const unstickLeadIn = () => {
          markStarted();
          leadInActiveRef.current = false;
          setLeadInActive(false);
        };
        if (hasSong) {
          const p = audioManager.play(1);
          if (p) p.then(unstickLeadIn).catch(unstickLeadIn);
          else unstickLeadIn();
        } else {
          unstickLeadIn();
        }
        leadInTimerRef.current = null;
      }, leadInMs);
    } else {
      songStartedRef.current = true;
      if (hasSong) {
        audioManager.setVolume(musicVolume / 100);
        const p = audioManager.play(1);
        if (p) p.then(markStarted).catch(markStarted);
        else markStarted();
      } else {
        markStarted();
      }
    }
  }, [leadInMs, hasSong, musicVolume]);

  // 引擎倒计时结束时恢复音频（前摇期间暂停后恢复 → 重跑前摇）
  const handleEngineResume = useCallback(() => {
    // 引擎 3 秒倒计时结束，真正恢复：把【暂停时长 + 倒计时时长】统一计入
    // totalPause，使 getCurrentTime 从暂停位置无缝继续（否则会多走一个
    // 倒计时时长 → 音符跳变到错误位置）。随后解除 canvas 暂停冻结。
    totalPauseRef.current += performance.now() - pauseTimeRef.current;
    setPaused(false);
    // 恢复背景视频（暂停时已被 doPause 暂停）
    videoBgRef.current?.play().catch(() => {});
    if (!hasSong) return;
    if (leadInMs > 0 && !songStartedRef.current) beginSong();
    else audioManager.resume();
  }, [hasSong, leadInMs, beginSong]);

  const { state, start, setPaused: engineSetPaused, handlePress, handleRelease, resultsRef: engineResultsRef, holdActiveRef: engineHoldsRef } = useGameEngine({
    config: effectiveConfig, notes, duration, onFinish: (r) => { stopHitKeepAlive(); onFinish(r); }, getCurrentTime, onPlayHitSound: playHitSound, latencyOffset, correctHitSound, onResume: handleEngineResume, getLeadFrozen: () => leadInActiveRef.current,
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
    warmupAudioOnGesture();
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
    keys,
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
      songStartPerfRef.current = 0;
      startHitKeepAlive();
      beginSong();
      start();
    }, gameStartDelay);
    return () => clearTimeout(timer);
  }, [start, hasSong, beginSong]);

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
        songStartPerfRef.current = 0;
        lastResultCountRef.current = 0;
        resetProgressTimer();
        setEffects([]);
        seenRef.current = new Set();
        setTimeout(() => {
          beginSong();
          start();
        }, 50);
      }, 1100);
    }
  }, [state.results, state.isFinished, target, start, hasSong, beginSong]);

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
      const rawElapsed = performance.now() - progressStartRef.current - totalPausedMsRef.current;
      const leadMs = leadInMsRef.current;
      if (leadMs > 0 && rawElapsed < leadMs) {
        // 前摇：进度条从满(100%) 逐渐变到 0，前摇结束刚好到 0
        const leadPct = 100 - Math.max(0, Math.min(100, (rawElapsed / leadMs) * 100));
        displayTimeRef.current = 0;
        if (progressBarRef.current) progressBarRef.current.style.width = `${leadPct}%`;
      } else {
        const elapsed = Math.max(0, rawElapsed - leadMs);
        displayTimeRef.current = elapsed;
        if (progressBarRef.current) {
          const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
          progressBarRef.current.style.width = `${pct}%`;
        }
      }
      const now = performance.now();
      if (now - devTimeThrottleRef.current > 200) {
        devTimeThrottleRef.current = now;
        setDevDisplayTime(displayTimeRef.current);
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
    // 有前摇：开局进度条从满开始倒数到 0；无前摇：从 0 开始
    if (progressBarRef.current) progressBarRef.current.style.width = leadInMsRef.current > 0 ? '100%' : '0%';
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

  // 过期特效该扫了（
  useEffect(() => {
    if (effects.length === 0) return;
    const iv = setInterval(() => {
      const now = performance.now();
      setEffects(prev => prev.filter(e => now - e.time < effMaxAge));
    }, effCleanInterval);
    return () => clearInterval(iv);
  }, [effects.length]);

  // 谱面背景视频引用（用于暂停/恢复同步）
  const videoBgRef = useRef<HTMLVideoElement>(null);

  const doPause = useCallback(() => {
    // 前摇期间暂停：取消待播的歌曲，避免暂停时突然出声
    if (leadInTimerRef.current) { clearTimeout(leadInTimerRef.current); leadInTimerRef.current = null; }
    audioManager.pause();
    // 背景视频一并暂停
    videoBgRef.current?.pause();
    // 记录暂停冻结位置（canvas 时钟暂停期间返回它）；无歌也用对应性能时钟的当前值
    pausedFrozenMsRef.current = hasSong && songStartPerfRef.current
      ? Math.max(0, performance.now() - songStartPerfRef.current - totalPauseRef.current)
      : Math.max(0, performance.now() - gameStartRef.current - leadInMsRef.current - totalPauseRef.current);
    engineSetPaused(true);
    setPaused(true);
    pauseTimeRef.current = performance.now();
  }, [engineSetPaused, hasSong]);

  const doResume = useCallback(() => {
    // 不在此累加 totalPause：若只扣到 doResume 时刻，恢复后时钟会多走一个
    // 倒计时时长（3s）→ 音符跳变。暂停+倒计时总时长统一在倒计时结束
    // （handleEngineResume）时扣除，使时钟从暂停位置无缝继续。
    engineSetPaused(false);
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

    const loop = () => {
      const w = totalWidth * gameScale + 10;
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
      // 视觉时钟 = 实时 getCurrentTime()（audio.currentTime），与引擎判定
      // 完全同源同刻。不引入 performance.now() 外推：perf 是真实时间，往往
      // 比 audio.currentTime 快（媒体时钟读取有延迟），混入外推会让视觉超前于
      // 判定（autoplay 看起来「过了判定线才按」），两者错位还会一顿一顿。
      // 直接跟随音频时间 → 视觉与判定严格同步，无提前/延后、无跳变。
      const now = getCurrentTime();
      const eff = fallDuration / config.speedMultiplier;
      const jy = JUDGMENT_LINE_Y;
      const fid = canvasFailedRef.current;
      // 用引擎【实时】判定结果（resultsRef / holdActiveRef），而非滞后的 React state：
      // 判定瞬间 ref 即更新，音符下一帧立即消失，与特效（React commit 后触发）同步，
      // 避免「特效已播但 tap 音符延后过线才消失」。
      const results = engineResultsRef.current;
      const activeHolds = engineHoldsRef.current;

      for (const note of s.activeNotes) {
        const result = results.get(note.id);
        const isBadOrMiss = result && (result.judgment.type === 'bad' || result.judgment.type === 'miss');
        // autoPlay：音符到判定线即算"已被判"（必然 perfect）。这消除 canvas 渲染
        // 与引擎判定之间的 1 帧时序差——否则音符会整个越过判定线才消失。
        const reachedLineInAuto = effectiveConfig.autoPlay && now >= note.startTime;
        const isHolding = note.type === 'hold' && (activeHolds.has(note.id) || reachedLineInAuto);
        const isHoldDone = note.type === 'hold' && !isHolding && (result && !isBadOrMiss || reachedLineInAuto);
        const isRed = !!isBadOrMiss || (note.id === fid && !result);
        const isFailed = note.id === fid && !result;

        // 脑裂：该轨道判定线在顶部，音符从底部反向上升（纯视觉，判分不变）
        const isSplit = isTrackSplit(splits, note.track, now);
        const noteJy = isSplit ? TOP_JUDGE_Y : jy;
        const originY = isSplit ? h - 50 : 50;
        // 下落距离 × gameScale：判定线固定贴底/贴顶，轨道向屏幕外延伸
        const fallDist = (noteJy - originY) * gameScale;
        const scaledTrackW = trackWidth * gameScale;
        const startY = noteJy - ((note.startTime - now) / eff) * fallDist;
        if (note.type === 'tap') {
          if (result && !isBadOrMiss) continue;
          // autoPlay 到线即消失（不依赖判定帧）
          if (reachedLineInAuto) continue;
          const noteW = (trackWidth - notePadX) * gameScale;
          const nx = note.track * scaledTrackW + scaledTrackW / 2 - noteW / 2;
          const ny = startY;
          const nh = tapHeight * gameScale;
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
          const endY = noteJy - ((note.endTime - now) / eff) * fallDist;
          const noteW = (trackWidth - notePadX) * gameScale;
          const nx = note.track * scaledTrackW + scaledTrackW / 2 - noteW / 2;

          // 长条区域：头部（判定线端）→ 尾部（远端 endY）
          let ny: number, nh: number;
          if (isHolding || isHoldDone || isRed) {
            // 按住 / 完成(松手) / miss(红)：头部锁定在判定线，画“尾部→判定线”这一段，
            // 随推进逐渐收拢。若展开成完整 startY→endY，startY 已越过判定线跑到屏外，
            // 渐变“远端透明”端点跟着出屏，屏幕内只剩实色 → 渐变突然消失。
            // 统一收拢形状可让渐变始终「判定线端实 → 尾部透明」，不跳变。
            // 正常轨道判定线在底部、尾部在上方(ny=endY)；脑裂轨道判定线在顶部、
            // 尾部在下方(ny=判定线)。统一取上端 min(endY,noteJy)，高度为两者差。
            ny = Math.min(endY, noteJy);
            nh = Math.abs(endY - noteJy);
            if (nh <= 0) continue;
          } else {
            ny = Math.min(startY, endY);
            nh = Math.abs(endY - startY);
            if (nh < holdMinH * gameScale) nh = holdMinH * gameScale;
          }
          if (ny + nh < -noteClipTop || ny > h + noteClipTop) continue;

          const baseAlpha = isRed ? 0.7 : isHoldDone ? 0.4 : 1;
          const holdColor = isFailed ? '#FF2222' : isRed ? '#FF3333' : config.holdNoteColor;
          const yTop = ny, yBot = ny + nh;
          const nearJudge = Math.abs(noteJy - yTop) <= Math.abs(noteJy - yBot) ? yTop : yBot;
          const farJudge = nearJudge === yTop ? yBot : yTop;

          if (holdGradient) {
            // 渐变长条：头部（判定线端）实色 → 尾部保留下限透明度（尾部仍有锐利形状）
            const grad = ctx.createLinearGradient(0, nearJudge, 0, farJudge);
            grad.addColorStop(0, hexToRgba(holdColor, baseAlpha));
            grad.addColorStop(1, hexToRgba(holdColor, 0.2));
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.fillRect(nx, ny, noteW, nh);
          } else {
            // 实心长条（无渐变）
            ctx.globalAlpha = baseAlpha;
            ctx.fillStyle = holdColor;
            ctx.fillRect(nx, ny, noteW, nh);
          }

          // 长条整体四边描边，全包住整个长条；双押时黄色描边全包住；
          // 按住后长条逐渐收拢，描边始终跟随不消失
          const isDoubleEdge = note.isDouble && showDoubleGlow && !isRed;
          ctx.strokeStyle = isDoubleEdge ? doubleGlowColor : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = isDoubleEdge ? 3 : 2;
          ctx.strokeRect(nx, ny, noteW, nh);
          // Hold 进度环已移入独立特效层（hold-ring-canvas，zIndex 9，判定环之上）
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [totalWidth, gameHeight, JUDGMENT_LINE_Y, TOP_JUDGE_Y, splits, trackWidth, notePadX, tapHeight, holdMinH, gameScale,
      doubleGlowColor, showDoubleGlow, config.noteColor, config.holdNoteColor, fallDuration, config.speedMultiplier, noteClipTop,
      getCurrentTime, engineResultsRef, engineHoldsRef, effectiveConfig.autoPlay, holdGradient]);

  // Hold 进度环 — 独立特效 canvas 层。与音符/判定共用 getCurrentTime() 时钟、
  // engine 实时 hold 状态（engineHoldsRef）；画在所有特效之上（zIndex 9）。
  useEffect(() => {
    const canvas = holdRingCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      const w = totalWidth * gameScale + 10;
      const h = gameHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, w, h);
      const now = getCurrentTime();
      const results = engineResultsRef.current;
      const activeHolds = engineHoldsRef.current;
      const s = canvasStateRef.current;
      for (const note of s.activeNotes) {
        if (note.type !== 'hold') continue;
        if (results.has(note.id)) continue; // 已判完不画
        // 与主 canvas 的 isHolding 一致：激活 或 autoplay 到线即视为按住
        const isHolding = activeHolds.has(note.id) || (effectiveConfig.autoPlay && now >= note.startTime);
        if (!isHolding) continue;
        const dur = note.endTime - note.startTime;
        const elapsed = now - note.startTime;
        const prog = dur > 0 ? Math.min(1, Math.max(0, elapsed / dur)) : 0;
        const rr = holdRingR * gameScale;
        const cx = note.track * (trackWidth * gameScale) + (trackWidth * gameScale) / 2;
        // 脑裂轨道：进度环画在顶部判定线
        const cy = isTrackSplit(splits, note.track, now) ? TOP_JUDGE_Y : JUDGMENT_LINE_Y;
        ctx.beginPath();
        ctx.arc(cx, cy, rr + 4 * gameScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = holdRingW * gameScale;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.strokeStyle = holdRingColor;
        ctx.lineWidth = holdRingW * gameScale;
        ctx.stroke();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [totalWidth, gameHeight, JUDGMENT_LINE_Y, TOP_JUDGE_Y, splits, trackWidth, holdRingR, holdRingW, holdRingColor, gameScale,
      getCurrentTime, engineResultsRef, engineHoldsRef, effectiveConfig.autoPlay]);

  const getNoteY = (noteTime: number): number => {
    const timeUntil = noteTime - state.currentTime;
    const eff = fallDuration / config.speedMultiplier;
    return JUDGMENT_LINE_Y - (timeUntil / eff) * (JUDGMENT_LINE_Y - 50);
  };

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
      {/* 背景：谱面视频优先（muted 硬件解码 + CSS 模糊，保证流畅），否则封面模糊图 */}
      {perfBgCover && videoBg && config.videoUrl && (
        <video
          ref={videoBgRef}
          className="gameplay-cover-bg gameplay-video-bg"
          src={config.videoUrl}
          autoPlay muted={!config.videoSound} loop playsInline preload="metadata"
          style={config.videoBlur === false ? { filter: 'brightness(0.45)' } : undefined}
        />
      )}
      {perfBgCover && (!videoBg || !config.videoUrl) && coverUrl && (
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
        {leadInActive ? (
          <span className="combo-count" style={{ ...comboStyle, fontSize: comboFontSize }}>READY?</span>
        ) : state.combo > 0 && <div className="hud-combo-wrap"><span className="combo-count" style={{ ...comboStyle, fontSize: comboFontSize }}>
          {state.combo >= comboKThreshold ? (state.combo / 1000).toFixed(1) + 'k' : state.combo}</span><span className="combo-label">COMBO</span></div>}
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
      {showAccuracyBar && state.isPlaying && <AccuracyBar lastOffset={state.lastOffset} scale={gameScale} />}

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

      {/* 游戏区域（游戏内缩放：渲染坐标×gameScale，判定线固定贴底/贴顶，轨道向屏幕外延伸） */}
      <div
        ref={containerRef}
        className="game-area"
        onContextMenu={e => e.preventDefault()}
        style={{ width: totalWidth * gameScale + 10, height: gameHeight, marginTop: gameTopCssVal, touchAction: 'none' }}
      >
        {/* Canvas 音符渲染层 */}
        <canvas
          ref={noteCanvasRef}
          className="note-canvas"
          style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}
        />

        {/* Hold 进度环特效层 — 置顶（zIndex 9），盖在判定环(z8)/判定线(z5)之上 */}
        <canvas
          ref={holdRingCanvasRef}
          className="hold-ring-canvas"
          style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none' }}
        />

        {/* 轨道线 */}
        <div className="tracks" style={{ left: 0, right: 0 }}>
          {Array.from({ length: config.trackCount }).map((_, i) => (
            <div
              key={i}
              className={`track${keysDown.has(i) ? ' track-active' : ''}`}
              style={{ width: trackWidth * gameScale, borderRight: i < config.trackCount - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}
            >
              <span className="track-key">{keys[i]}</span>
            </div>
          ))}
        </div>

        {/* 判定线 — 按轨道绘制，脑裂轨道在顶部（红色警示）；判定线固定不随缩放移动 */}
        {Array.from({ length: config.trackCount }, (_, i) => {
          const isSplit = isTrackSplit(splits, i, state.currentTime);
          const scaledTrackW = trackWidth * gameScale;
          return (
            <div key={i} className="judgment-line" style={{
              top: isSplit ? TOP_JUDGE_Y : JUDGMENT_LINE_Y,
              left: i * scaledTrackW,
              width: scaledTrackW,
              height: judgeLineThickness,
              background: isSplit ? '#FF7878' : config.judgeLineColor,
              borderRadius: Math.ceil(judgeLineThickness / 2),
            }} />
          );
        })}

        {/* 圆圈特效 */}
        {effects.filter(e => e.type === 'good' || e.type === 'perfect').map(eff => {
          const age = performance.now() - eff.time;
          const p = Math.min(age / (effMaxAge * 0.5), 1);
          const size = tapEffInitial + p * tapEffSpread;
          const opacity = Math.max(0, 1 - p * tapEffFade);
          const c = JUDGMENT_COLORS[eff.type];
          const outerSize = ringEffInitial + p * ringEffSpread;
          const outerOpacity = Math.max(0, 0.6 - p * ringEffFade);
          const effY = isTrackSplit(splits, eff.track, state.currentTime) ? TOP_JUDGE_Y : JUDGMENT_LINE_Y;
          const effX = eff.track * (trackWidth * gameScale) + (trackWidth * gameScale) / 2;
          return (
            <React.Fragment key={eff.id}>
              {/* 外圈 */}
              <div
                className="judgment-circle-outer"
                style={{
                  left: effX,
                  top: effY,
                  width: outerSize * gameScale, height: outerSize * gameScale,
                  borderColor: c, opacity: outerOpacity,
                  borderWidth: circleOuterW * gameScale,
                }}
              />
              {/* 内圈 */}
              <div
                className="judgment-circle"
                style={{
                  left: effX,
                  top: effY,
                  width: size * gameScale, height: size * gameScale,
                  borderColor: c, opacity,
                  borderWidth: circleInnerW * gameScale,
                  boxShadow: `0 0 ${size / 2 * gameScale}px ${c}88`,
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
