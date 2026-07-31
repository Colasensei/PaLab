/**
 * 开发者参数覆盖系统
 * 所有参数存储在 localStorage:palab_dev_overrides
 * 运行时代码通过 getDevOverride() 读取，若无覆盖则使用源码默认值
 */

const STORAGE_KEY = 'palab_dev_overrides';

export interface DevOverrides {
  // ═══ 判定 ═══
  /** Perfect 窗口 (ms) */
  j_timeB: number;
  /** Good 窗口 (ms) */
  j_timeA: number;
  /** Bad 提前窗口 (ms) */
  j_timeC: number;
  /** Miss 延迟阈值 (ms) */
  j_missThreshold: number;
  /** 按下检测延迟上限偏移 (ms) */
  j_pressOffset: number;
  /** 提前按容差 (ms) */
  j_earlyTolerance: number;

  // ═══ Hold ═══
  /** Hold 松手合格比率 */
  h_releaseRatio: number;
  /** Hold 最小长度 (ms) */
  h_minLength: number;
  /** Hold 完成缓冲 (ms) */
  h_completeBuffer: number;
  /** Hold 松手宽恕窗口 (ms) — 松手后此时间内再按回仍算按住 */
  h_releaseForgiveness: number;

  // ═══ 计分 ═══
  /** 满分 */
  s_maxScore: number;
  /** Perfect 得分倍率 */
  s_perfectRatio: number;
  /** Good 得分倍率 */
  s_goodRatio: number;
  /** Good ACC 权重 */
  s_accGoodWeight: number;
  /** RKS ACC 门槛 */
  s_rksAccFloor: number;
  /** RKS 偏移常数 */
  s_rksOffset: number;
  /** RKS 除数常数 */
  s_rksDivisor: number;
  /** RKS Top N */
  s_rksTopN: number;
  /** RKS 显示门槛 (记录数) */
  s_rksMinRecords: number;
  /** K数难度因子 — 2K */
  s_kFactor2K: number;
  /** K数难度因子 — 4K */
  s_kFactor4K: number;
  /** K数难度因子 — 6K */
  s_kFactor6K: number;
  /** K数难度因子 — 8K */
  s_kFactor8K: number;
  /** S 评级分数门槛 */
  s_rankS: number;
  /** A 评级分数门槛 */
  s_rankA: number;
  /** B 评级分数门槛 */
  s_rankB: number;

  // ═══ 物理 ═══
  /** 基准下落时长 (ms) */
  p_fallDuration: number;
  /** 判定线 Y 偏移 (从底部) */
  p_judgeLineOffset: number;
  /** 游戏区顶部边距 (从底部) */
  p_gameTopMargin: number;
  /** 音符可见超前 (ms) */
  p_noteLookahead: number;
  /** 音符可见滞后 (ms) */
  p_noteLookbehind: number;
  /** 音符顶部裁剪 (px, 在判定线下) */
  p_noteClipTop: number;
  /** 游戏结束提前量 (ms) */
  p_gameEndEarly: number;

  // ═══ 音符 ═══
  /** Minimum track width (px) */
  n_trackMinW: number;
  /** Maximum track width (px) */
  n_trackMaxW: number;
  /** 游戏区水平外边距 */
  n_hMargin: number;
  /** 音符内部水平边距 */
  n_notePadX: number;
  /** Tap 音符圆角 */
  n_tapRadius: number;
  /** Tap 音符高度 */
  n_tapHeight: number;
  /** Hold 最小渲染高度 */
  n_holdMinH: number;
  /** Hold 进度环半径 */
  n_holdRingR: number;
  /** Hold 进度环描边宽 */
  n_holdRingW: number;
  /** Hold 进度环颜色 */
  n_holdRingColor: string;
  /** 判定线高度 (px) */
  n_judgeLineH: number;
  /** 判定线圆角 */
  n_judgeLineR: number;
  /** 判定内圈边框宽 */
  n_circleInnerW: number;
  /** 判定外圈边框宽 */
  n_circleOuterW: number;

  // ═══ 颜色 ═══
  /** 默认音符颜色 */
  c_noteColor: string;
  /** Hold 音符颜色 */
  c_holdNoteColor: string;
  /** 背景色 */
  c_bgColor: string;
  /** 判定线色 */
  c_judgeLineColor: string;
  /** Perfect 色 */
  c_perfectColor: string;
  /** Combo V 色 */
  c_volor: string;
  /** S 色 */
  c_sColor: string;
  /** A 色 */
  c_aColor: string;
  /** B 色 */
  c_bColor: string;
  /** C 色 */
  c_cColor: string;
  /** EZ 色 */
  c_ezColor: string;
  /** NM 色 */
  c_nmColor: string;
  /** HD 色 */
  c_hdColor: string;
  /** IN 色 */
  c_inColor: string;
  /** AT 色 */
  c_atColor: string;

  // ═══ 特效 ═══
  /** Combo 字体大小 */
  e_comboFontSize: number;
  /** Score 字体大小 */
  e_scoreFontSize: number;
  /** 双押发光扩散 */
  e_doubleGlowSize: number;
  /** 双押发光强度 */
  e_doubleGlowAlpha: number;
  /** 双押发光色 */
  e_doubleGlowColor: string;
  /** 按键特效初始大小 */
  e_tapEffInitial: number;
  /** 按键特效最大扩散 */
  e_tapEffSpread: number;
  /** 按键特效透明度衰减 */
  e_tapEffFade: number;
  /** 外圈特效初始大小 */
  e_ringEffInitial: number;
  /** 外圈特效最大扩散 */
  e_ringEffSpread: number;
  /** 外圈特效透明度衰减 */
  e_ringEffFade: number;
  /** Combo 百倍脉冲时长 (ms) */
  e_comboPulseMs: number;
  /** 音符淡入时长 (s) */
  e_noteFadeIn: number;
  /** 音符淡出时长 (s) */
  e_noteFadeOut: number;
  /** Hold 脉冲时长 (s) */
  e_holdPulse: number;
  /** 特效清理间隔 (ms) */
  e_effCleanInterval: number;
  /** 特效最大寿命 (ms) */
  e_effMaxAge: number;

  // ═══ 音频 ═══
  /** 打击音最大增益 */
  a_hitGainMax: number;
  /** 打击音增益倍率 */
  a_hitGainMul: number;
  /** 延迟偏移 (ms) */
  a_latencyOffset: number;
  /** FFT 大小 */
  a_fftSize: number;
  /** 频谱平滑 */
  a_smoothing: number;
  /** 频谱柱数 */
  a_vizBars: number;
  /** 频谱高度系数 */
  a_vizHeightMul: number;
  /** 频谱柱透明度下限 */
  a_vizAlphaMin: number;
  /** 频谱柱透明度上限 */
  a_vizAlphaMax: number;

  // ═══ UI ═══
  /** 暂停双击窗口 (ms) */
  u_pauseDblWindow: number;
  /** 暂停倒计时初值 (s) */
  u_pauseCountdown: number;
  /** 暂停倒计时间隔 (ms) */
  u_pauseCountInterval: number;
  /** 游戏开始延迟 (ms) */
  u_gameStartDelay: number;
  /** 进度条高度 (px) */
  u_progressH: number;
  /** 进度条阴影 */
  u_progressShadow: string;
  /** 背景模糊度 (px) */
  u_bgBlur: number;
  /** 背景亮度 */
  u_bgBrightness: number;
  /** 背景缩放 */
  u_bgScale: number;
  /** 游戏区上边距 (CSS) */
  u_gameTopCss: number;
  /** 暂停面板最大宽 (px) */
  u_pauseMaxW: number;
  /** 暂停面板最小高 (px) */
  u_pauseMinH: number;
  /** 暂停标题字号 */
  u_pauseTitleFont: number;
  /** 暂停倒计时字号 */
  u_pauseCountFont: number;
  /** 暂停按钮宽 (px) */
  u_pauseBtnW: number;
  /** Combo 大数门槛 */
  u_comboKFormat: number;
  /** Score 大数门槛 */
  u_scoreKFormat: number;

  // ═══ 导航 ═══
  /** 导航动画时长 (ms) */
  x_navAnimMs: number;
  /** 层级缩放系数 */
  x_stackScale: number;
  /** 层级位移系数 (%) */
  x_stackShift: number;
  /** 层级透明度衰减 */
  x_stackOpacity: number;
  /** 层级模糊系数 (px) */
  x_stackBlur: number;

  // ═══ 加载 ═══
  /** 加载刷新间隔 (ms) */
  l_tickInterval: number;
  /** 加载 ease-out 指数 */
  l_easeOutExp: number;
  /** 加载 ease-in 指数 */
  l_easeInExp: number;
  /** 完成后延迟 (ms) */
  l_completeDelay: number;
  /** 阶段 0 目标 */
  l_stage0Target: number;
  /** 阶段 1 目标 */
  l_stage1Target: number;
  /** 阶段 2 目标 */
  l_stage2Target: number;
  /** 阶段 3 目标 */
  l_stage3Target: number;
  /** 阶段 0 时长下限 */
  l_stage0DurMin: number;
  /** 阶段 0 时长上限 */
  l_stage0DurMax: number;
  /** 加载阶段数 */
  l_stageCount: number;

  // ═══ 谱面生成 ═══
  /** 难度归一化分母 */
  g_diffNorm: number;
  /** 难度归一化偏移 */
  g_diffOffset: number;
  /** noteProbability 基础 */
  g_noteProbBase: number;
  /** noteProbability t 系数 */
  g_noteProbT: number;
  /** noteProbability t³ 系数 */
  g_noteProbT3: number;
  /** holdProbability 基础 */
  g_holdProbBase: number;
  /** holdProbability t 系数 */
  g_holdProbT: number;
  /** holdProbability t³ 系数 */
  g_holdProbT3: number;
  /** doubleProbability 基础 */
  g_doubleProbBase: number;
  /** doubleProbability t 系数 */
  g_doubleProbT: number;
  /** doubleProbability t³ 系数 */
  g_doubleProbT3: number;
  /** minSpacing 基础 */
  g_minSpacingBase: number;
  /** minSpacing t 系数 */
  g_minSpacingT: number;
  /** 强拍概率倍率 */
  g_strongBeatMul: number;
  /** 半拍概率倍率 */
  g_halfBeatMul: number;
  /** 四押概率 */
  g_quadProb: number;
  /** Hold 时长倍率 */
  g_holdLenMul: number;
  /** 台阶长度下限 */
  g_stairMinLen: number;
  /** 交互轨重置概率 */
  g_trillResetProb: number;
  /** 叠键间距系数 */
  g_jackSpacingMul: number;
  /** 叠键绝对最小间距 */
  g_jackSpacingMin: number;

  // ═══ 音频分析 ═══
  /** BPM 下限 */
  aa_bpmMin: number;
  /** BPM 上限 */
  aa_bpmMax: number;
  /** 缓冲区大小 */
  aa_bufferSize: number;
  /** 前奏检测帧数 */
  aa_introFrames: number;
  /** 前奏能量比门槛 */
  aa_introEnergyRatio: number;
  /** 前奏结束门槛 */
  aa_introEndThresh: number;
  /** 节拍网格窗口 (ms) */
  aa_gridWindow: number;
  /** 节拍间距下限倍率 */
  aa_beatSpacingMin: number;
  /** 正常阈值倍率 */
  aa_threshNormal: number;
  /** 前奏阈值倍率 */
  aa_threshIntro: number;
  /** 局部平均帧数 */
  aa_localFrames: number;

  // ═══ 难度 ═══
  /** EZ/NM 分界 */
  d_ezMax: number;
  /** NM/HD 分界 */
  d_nmMax: number;
  /** HD/IN 分界 */
  d_hdMax: number;
  /** IN/AT 分界 */
  d_inMax: number;

  // ═══ 杂项 ═══
  /** Dev 模式连击次数 */
  devClicks: number;
  /** 试玩后延迟 (ms) */
  trialDelay: number;
  /** 结算后延迟 (ms) */
  resultDelay: number;
  /** 试玩最长时长 (ms) */
  trialMaxDuration: number;
  /** 默认无歌曲时长 (ms) */
  defaultDuration: number;
  /** EULA 滚动阈值 (px) */
  eulaScrollThreshold: number;
  /** 昵称最大长度 */
  profileNameMaxLen: number;
  /** 头像尺寸 */
  avatarSize: number;
  /** 保存提示时长 (ms) */
  saveToastMs: number;
  /** 状态更新节流 (帧) */
  stateThrottleFrames: number;

  // ═══ 性能 ═══
  /** 目标帧率 (0=不限制) */
  perf_targetFPS: number;
  /** 最大同屏音符数 */
  perf_maxVisibleNotes: number;
  /** 音符渲染超前窗口 (ms, 超过此时间不渲染) */
  perf_noteRenderWindow: number;
  /** 最大打击特效粒子数 */
  perf_maxParticles: number;
  /** 特效对象池大小 */
  perf_effectPoolSize: number;
  /** 渲染质量 (0=低 1=中 2=高) */
  perf_renderQuality: number;
  /** 背景封面渲染 */
  perf_bgCoverRender: boolean;
  /** 音频可视化渲染 */
  perf_audioVizRender: boolean;
  /** 打击特效渲染 */
  perf_hitEffectRender: boolean;
  /** Hold 拖尾光效 */
  perf_holdTrailRender: boolean;
  /** 音符外发光 (outline) */
  perf_noteOutlineRender: boolean;
  /** 音符阴影 */
  perf_noteShadowRender: boolean;
  /** CSS will-change 优化 */
  perf_useWillChange: boolean;
  /** GPU 加速 (translate3d) */
  perf_useGPUAccel: boolean;
  /** 低功耗模式 (关闭所有非必要特效) */
  perf_lowPowerMode: boolean;
  /** Canvas 像素比 (1=低 2=高 devicePixelRatio) */
  perf_canvasDPR: number;
  /** 强制 requestAnimationFrame 跳过帧数 */
  perf_skipFrames: number;

  // ═══ 娱乐 ═══
  /** 无敌模式：所有打击判 Perfect，不计分 */
  invincibleMode: boolean;
}

/** 所有参数的默认值（等同于源码硬编码值） */
export const DEFAULT_OVERRIDES: DevOverrides = {
  // Judgment
  j_timeB: 80,
  j_timeA: 160,
  j_timeC: 280,
  j_missThreshold: 300,
  j_pressOffset: 200,
  j_earlyTolerance: 50,

  // Hold
  h_releaseRatio: 0.78,
  h_minLength: 100,
  h_completeBuffer: 600,
  h_releaseForgiveness: 40,

  // Scoring
  s_maxScore: 100_000,
  s_perfectRatio: 1.0,
  s_goodRatio: 0.8,
  s_accGoodWeight: 0.65,
  s_rksAccFloor: 0.70,
  s_rksOffset: 55,
  s_rksDivisor: 45,
  s_rksTopN: 20,
  s_rksMinRecords: 20,
  s_kFactor2K: 0.35,
  s_kFactor4K: 1.00,
  s_kFactor6K: 2.20,
  s_kFactor8K: 3.50,
  s_rankS: 95_000,
  s_rankA: 90_000,
  s_rankB: 80_000,

  // Physics
  p_fallDuration: 3000,
  p_judgeLineOffset: 80,
  p_gameTopMargin: 120,
  p_noteLookahead: 10000,
  p_noteLookbehind: 15000,
  p_noteClipTop: 200,
  p_gameEndEarly: 500,

  // Note sizes
  n_trackMinW: 70,
  n_trackMaxW: 180,
  n_hMargin: 40,
  n_notePadX: 12,
  n_tapRadius: 6,
  n_tapHeight: 22,
  n_holdMinH: 30,
  n_holdRingR: 14,
  n_holdRingW: 2.5,
  n_holdRingColor: '#FFD700',
  n_judgeLineH: 3,
  n_judgeLineR: 1,
  n_circleInnerW: 3,
  n_circleOuterW: 1.5,

  // Colors
  c_noteColor: '#35BFFF',
  c_holdNoteColor: '#35BFFF',
  c_bgColor: '#0a0a14',
  c_judgeLineColor: '#999999',
  c_perfectColor: '#FFD700',
  c_volor: '#4488FF',
  c_sColor: '#FF69B4',
  c_aColor: '#FF4444',
  c_bColor: '#44BB44',
  c_cColor: '#888888',
  c_ezColor: '#44BB44',
  c_nmColor: '#FFAA00',
  c_hdColor: '#FF4444',
  c_inColor: '#AA44FF',
  c_atColor: '#FF44AA',

  // Effects
  e_comboFontSize: 28,
  e_scoreFontSize: 20,
  e_doubleGlowSize: 18,
  e_doubleGlowAlpha: 0.7,
  e_doubleGlowColor: '#FFFF00',
  e_tapEffInitial: 16,
  e_tapEffSpread: 80,
  e_tapEffFade: 1.2,
  e_ringEffInitial: 24,
  e_ringEffSpread: 100,
  e_ringEffFade: 0.7,
  e_comboPulseMs: 600,
  e_noteFadeIn: 0.2,
  e_noteFadeOut: 0.5,
  e_holdPulse: 0.4,
  e_effCleanInterval: 150,
  e_effMaxAge: 700,

  // Audio
  a_hitGainMax: 6.0,
  a_hitGainMul: 8,
  a_latencyOffset: 0,
  a_fftSize: 256,
  a_smoothing: 0.8,
  a_vizBars: 58,
  a_vizHeightMul: 0.5,
  a_vizAlphaMin: 0.03,
  a_vizAlphaMax: 0.12,

  // UI
  u_pauseDblWindow: 500,
  u_pauseCountdown: 3,
  u_pauseCountInterval: 1000,
  u_gameStartDelay: 1500,
  u_progressH: 3,
  u_progressShadow: '0 0 6px currentColor',
  u_bgBlur: 15,
  u_bgBrightness: 0.2,
  u_bgScale: 1.1,
  u_gameTopCss: 42,
  u_pauseMaxW: 280,
  u_pauseMinH: 200,
  u_pauseTitleFont: 32,
  u_pauseCountFont: 96,
  u_pauseBtnW: 240,
  u_comboKFormat: 10000,
  u_scoreKFormat: 1000000,

  // Navigation
  x_navAnimMs: 500,
  x_stackScale: 0.06,
  x_stackShift: 16,
  x_stackOpacity: 0.25,
  x_stackBlur: 20,

  // Loading
  l_tickInterval: 80,
  l_easeOutExp: 2.5,
  l_easeInExp: 1.8,
  l_completeDelay: 200,
  l_stage0Target: 15,
  l_stage1Target: 40,
  l_stage2Target: 65,
  l_stage3Target: 85,
  l_stage0DurMin: 300,
  l_stage0DurMax: 600,
  l_stageCount: 5,

  // Chart gen
  g_diffNorm: 17.0,
  g_diffOffset: 1.0,
  g_noteProbBase: 0.32,
  g_noteProbT: 0.28,
  g_noteProbT3: 0.40,
  g_holdProbBase: 0.03,
  g_holdProbT: 0.15,
  g_holdProbT3: 0.12,
  g_doubleProbBase: 0.01,
  g_doubleProbT: 0.20,
  g_doubleProbT3: 0.32,
  g_minSpacingBase: 750,
  g_minSpacingT: 580,
  g_strongBeatMul: 2.0,
  g_halfBeatMul: 1.5,
  g_quadProb: 0.008,
  g_holdLenMul: 2,
  g_stairMinLen: 3,
  g_trillResetProb: 0.3,
  g_jackSpacingMul: 0.6,
  g_jackSpacingMin: 150,

  // Audio analysis
  aa_bpmMin: 60,
  aa_bpmMax: 220,
  aa_bufferSize: 2048,
  aa_introFrames: 43,
  aa_introEnergyRatio: 0.15,
  aa_introEndThresh: 0.2,
  aa_gridWindow: 30,
  aa_beatSpacingMin: 0.35,
  aa_threshNormal: 1.8,
  aa_threshIntro: 3.0,
  aa_localFrames: 5,

  // Difficulty
  d_ezMax: 5.0,
  d_nmMax: 9.0,
  d_hdMax: 12.5,
  d_inMax: 16.0,

  // Other
  devClicks: 5,
  trialDelay: 2500,
  resultDelay: 2500,
  trialMaxDuration: 120_000,
  defaultDuration: 120_000,
  eulaScrollThreshold: 40,
  profileNameMaxLen: 16,
  avatarSize: 128,
  saveToastMs: 1500,
  stateThrottleFrames: 0,

  // Performance
  perf_targetFPS: 0,
  perf_maxVisibleNotes: 60,
  perf_noteRenderWindow: 5000,
  perf_maxParticles: 30,
  perf_effectPoolSize: 20,
  perf_renderQuality: 2,
  perf_bgCoverRender: true,
  perf_audioVizRender: true,
  perf_hitEffectRender: true,
  perf_holdTrailRender: true,
  perf_noteOutlineRender: true,
  perf_noteShadowRender: false,
  perf_useWillChange: true,
  perf_useGPUAccel: true,
  perf_lowPowerMode: false,
  perf_canvasDPR: 2,
  perf_skipFrames: 0,

  // Fun modes
  invincibleMode: false,
};

/** 加载开发者覆盖参数 */
export function loadDevOverrides(): DevOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OVERRIDES };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_OVERRIDES, ...parsed };
  } catch {
    return { ...DEFAULT_OVERRIDES };
  }
}

/** 保存开发者覆盖参数 */
export function saveDevOverrides(overrides: DevOverrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** 重置所有覆盖参数为默认值 */
export function resetDevOverrides(): DevOverrides {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_OVERRIDES };
}

/** 获取单个覆盖值（带内存缓存，避免频繁读 localStorage） */
let _cachedOverrides: DevOverrides | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 2000; // 2秒缓存

export function getDevOverride<K extends keyof DevOverrides>(
  key: K,
): DevOverrides[K] {
  const now = Date.now();
  if (!_cachedOverrides || now - _cacheTimestamp > CACHE_TTL) {
    _cachedOverrides = loadDevOverrides();
    _cacheTimestamp = now;
  }
  return _cachedOverrides[key];
}

/** 清除缓存（DevPanel保存后调用） */
export function invalidateDevCache(): void {
  _cachedOverrides = null;
}
