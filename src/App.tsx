import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameConfig, Note, GameResults, AppScreen, HighScoreRecord,
  AppSettings, DEFAULT_SETTINGS, constantToDifficulty, getDiffColor,
  AccountInfo, TrackCount,
} from '@/types';
import { generateChart, audioManager, loadCharts, ensureDoubleGroups } from '@/utils';
import { estimateDifficulty } from '@/utils/manualAnalyzer';
import { isOverlord, overlordRecord } from '@/utils/overlord';
import { t } from '@/utils/lang';
import JSZip from 'jszip';
import { saveZipBlob } from '@/utils/zipSave';
import { playPreview, setPreviewVolume, stopPreview, PREVIEW_VOLUME, PREVIEW_LOW_VOLUME } from '@/utils/previewPlayer';
import { ChartPackage } from '@/components/ChartLibrary';
import {
  MainMenu, ChartLibrary, ChartEditor,
  ConfigPanel, SettingsPanel, ProfileEditor, AboutScreen, RecordsScreen, HelpScreen, EULAModal, DevPanel,
  SongPanel, LoadingScreen, GamePlay, ResultsScreen,
  ChartModeSelect, ManualConfig, ManualRecord, ManualAnalyzer,
  VisualEditor, EditorSetup, UpdateScreen,
  MusicPlayer,
} from '@/components';
import { checkUpdate, getLocalVersion, UpdateInfo } from '@/utils/updateChecker';
import { App as CapacitorApp } from '@capacitor/app';
import '@/styles/global.css';

const STORAGE_KEY = 'palab_history';
const SETTINGS_KEY = 'palab_settings';
const RKS_KEY = 'palab_rks';
const PROFILE_KEY = 'palab_profile';
const CHART_SCORES_KEY = 'palab_chart_scores';

function loadHistory(): HighScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(records: HighScoreRecord[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
}

function loadRKS(): number {
  try { return parseFloat(localStorage.getItem(RKS_KEY) || '0'); } catch { return 0; }
}

function saveRKS(v: number) {
  try { localStorage.setItem(RKS_KEY, v.toFixed(2)); } catch {}
}

function loadAccount(): AccountInfo | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) return parsed;
    return null;
  } catch { return null; }
}

function loadEULA(): boolean {
  try { return localStorage.getItem('palab_eula') === '1'; } catch { return false; }
}

function saveAccount(info: AccountInfo) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(info)); } catch {}
}

type ChartScoreEntry = { score: number; rating: string; rks: number; acc: number; date: string };

function loadChartScores(): Record<string, ChartScoreEntry> {
  try { return JSON.parse(localStorage.getItem(CHART_SCORES_KEY) || '{}'); } catch { return {}; }
}
function saveChartScores(s: Record<string, ChartScoreEntry>) {
  try { localStorage.setItem(CHART_SCORES_KEY, JSON.stringify(s)); } catch {}
}

import { getDevOverride } from '@/utils/devOverrides';

function calcRKS(records: HighScoreRecord[]): number {
  const topN = getDevOverride('s_rksTopN');
  const minRecords = getDevOverride('s_rksMinRecords');
  const topPP = records
    .filter(r => (r.pp ?? 0) > 0)
    .sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0))
    .slice(0, topN);
  if (topPP.length < minRecords) return -1;
  const avg = topPP.reduce((s, v) => s + (v.pp ?? 0), 0) / topPP.length;
  return Math.round(avg * 100) / 100;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      // 强制覆盖为新配色
      parsed.noteColor = '#35BFFF';
      parsed.holdNoteColor = '#35BFFF';
      parsed.bgColor = '#0a0a14';
      parsed.judgeLineColor = '#999999';

      return parsed;
    }
    return DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: AppSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

const DEFAULT_CONFIG: GameConfig = {
  bpm: 120,
  timeSignature: '4/4',
  trackCount: 4,
  chartConstant: 8.0,
  timingWindows: { timeA: 160, timeB: 80, timeC: 280 },
  speedMultiplier: 5.0,
  noteColor: '#35BFFF',
  holdNoteColor: '#35BFFF',
  bgColor: '#0a0a14',
  judgeLineColor: '#999999',
  songUrl: null,
  songFileName: null,
  autoPlay: false,
};

/** 全屏页面（不显示压缩的前一页卡片，不显示顶栏） */
const FULLSCREEN_PAGES: AppScreen[] = ['loading', 'page-loading', 'gameplay', 'results', 'about', 'manual-record', 'manual-analyze', 'visual-editor', 'editor-setup'];

/** 独立页面：直接替换栈、不堆叠、但保留顶栏和返回键 */
const FLAT_PAGES: AppScreen[] = ['chart-library', 'dev', 'manual-config', 'editor-setup', 'visual-editor'];

/** 需要页面加载动画的页面 */
const PAGE_LOAD_TARGETS: AppScreen[] = ['chart-library', 'config'];

const App: React.FC = () => {


  const [screen, setScreen] = useState<AppScreen>('menu');
  const [screenStack, setScreenStack] = useState<AppScreen[]>(['menu']);
  const [animating, setAnimating] = useState(false);
  const animRef = useRef<number>(0);
  const [pageLoading, setPageLoading] = useState<AppScreen | null>(null);
  const [pageLoadingBg, setPageLoadingBg] = useState<string | null>(null);
  const [pageLoadingLabel, setPageLoadingLabel] = useState<string>('');
  const [playTime, setPlayTime] = useState<number>(() => parseFloat(localStorage.getItem('palab_playtime') || '0'));

  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [notes, setNotes] = useState<Note[]>([]);
  const [duration, setDuration] = useState<number>(getDevOverride('defaultDuration'));
  const [results, setResults] = useState<GameResults | null>(null);
  const [highScore, setHighScore] = useState(0);
  const [highPP, setHighPP] = useState(0);
  const [highRating, setHighRating] = useState('C');
  const [history, setHistory] = useState<HighScoreRecord[]>([]);
  const [rks, setRks] = useState(loadRKS);
  const [rksChange, setRksChange] = useState<{ old: number; new: number } | null>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [detailRecord, setDetailRecord] = useState<HighScoreRecord | null>(null);
  const [showOffsets, setShowOffsets] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(loadAccount);
  const [isTrial, setIsTrial] = useState(false);
  const [chartSource, setChartSource] = useState<{ fileName: string; title: string; artist: string; author: string; difficulty: string; chartConstant: number; trackCount: number; coverUrl: string | null; illustrationUrl: string | null } | null>(null);
  const [gameTarget, setGameTarget] = useState<'none' | 'fc' | 'ap'>('none');
  const [gameMirror, setGameMirror] = useState(false);
  const [gameCorrectHitSound, setGameCorrectHitSound] = useState(false);
  const [chartScores, setChartScores] = useState<Record<string, ChartScoreEntry>>(loadChartScores);
  const [chartListKey, setChartListKey] = useState(0);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateBar, setShowUpdateBar] = useState(false);

  const devMode = settings.devMode;

  // 启动时自动检查更新
  useEffect(() => {
    checkUpdate().then(result => {
      if (result.update) {
        setPendingUpdate(result.update);
        setShowUpdateBar(true);
      }
    });
  }, []);

  // 手动制作流程状态
  const [manualConfig, setManualConfig] = useState<GameConfig | null>(null);
  const [manualRawNotes, setManualRawNotes] = useState<Note[]>([]);
  const [manualDuration, setManualDuration] = useState<number>(0);

  // 可视化编辑器流程
  const [editorConfig, setEditorConfig] = useState<{ bpm: number; trackCount: number; songUrl: string; songFileName: string; existingNotes?: Note[] } | null>(null);
  const [editorNotes, setEditorNotes] = useState<Note[]>([]);
  const [fromEditor, setFromEditor] = useState(false);

  const toggleDevMode = useCallback(() => {
    setSettings(prev => {
      const next = { ...prev, devMode: !prev.devMode };
      saveSettings(next);
      return next;
    });
  }, []);

  const chartGeneratedRef = useRef(false);
  const devClickRef = useRef({ count: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const chartsCacheRef = useRef<{ coverUrl: string | null; illustrationUrl: string | null }[]>([]);
  const gameStartTimeRef = useRef<number>(0);
  /** 游戏加载期间的后台任务（音频预加载等），由 handleStart/handleRestart 设置 */
  const loadingTaskRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // 启动时加载谱面列表缓存（用于页面加载动画的随机背景）
  useEffect(() => {
    loadCharts().then(charts => {
      chartsCacheRef.current = charts.map(c => ({ coverUrl: c.coverUrl, illustrationUrl: c.illustrationUrl }));
    });
  }, []);

  /** 获取页面显示名称 */
  const getPageLabel = (s: AppScreen): string => {
    switch (s) {
      case 'chart-library': return lang === 'zh' ? '谱面库' : 'Chart Library';
      case 'config': return lang === 'zh' ? '制作谱面' : 'Chart Editor';
      case 'editor': return lang === 'zh' ? '制作谱面' : 'Chart Editor';
      case 'menu': return lang === 'zh' ? '主菜单' : 'Main Menu';
      default: return '';
    }
  };

  /** 从缓存中随机选一张曲绘（仅选有曲绘的歌曲，不用封面） */
  const pickRandomCover = () => {
    const pool = chartsCacheRef.current.filter(c => !!c.illustrationUrl);
    if (pool.length === 0) return null;
    const r = pool[Math.floor(Math.random() * pool.length)];
    return r.illustrationUrl;
  };

  const handleBrandDevClick = useCallback(() => {
    devClickRef.current.count++;
    clearTimeout(devClickRef.current.timer);
    if (devClickRef.current.count >= 5) {
      devClickRef.current.count = 0;
      toggleDevMode();
    } else {
      devClickRef.current.timer = setTimeout(() => { devClickRef.current.count = 0; }, 1500);
    }
  }, [toggleDevMode]);

  // 初始化加载历史
  useEffect(() => {
    const h = loadHistory();
    setHistory(h);
    if (h.length > 0) { setHighScore(h[0].score); setHighPP(h[0].pp ?? 0); setHighRating(h[0].rating); }
    setRks(loadRKS());
  }, []);

  // === 导航动画系统 ===
  const navigateTo = useCallback((next: AppScreen) => {
    if (animating || pageLoading) return;
    // 全屏页面直接替换栈
    if (FULLSCREEN_PAGES.includes(next)) {
      setScreen(next);
      setScreenStack([next]);
      return;
    }
    // 进需要 loading 的页面先过一遍动画（
    if (!settings.noPageLoading && PAGE_LOAD_TARGETS.includes(next)) {
      if (next === 'chart-library') setChartListKey(k => k + 1);
      setPageLoadingBg(pickRandomCover());
      setPageLoading(next);
      setPageLoadingLabel(getPageLabel(next));
      setScreen('page-loading');
      setScreenStack(['page-loading']);
      return;
    }
    // 独立页面：替换栈（无堆叠动画），单独界面
    if (FLAT_PAGES.includes(next)) {
      if (next === 'chart-library') setChartListKey(k => k + 1);
      clearTimeout(animRef.current);
      setAnimating(false);
      setScreen(next);
      setScreenStack([next]);
      return;
    }
    setAnimating(true);
    setScreen(next);
    setScreenStack(prev => [...prev, next]);
    clearTimeout(animRef.current);
    animRef.current = window.setTimeout(() => setAnimating(false), 500);
  }, [animating, pageLoading, settings.noPageLoading]);

  /** 页面加载完成：跳转到目标页面 */
  const handlePageLoadingComplete = useCallback(() => {
    const target = pageLoading;
    setPageLoading(null);
    setPageLoadingBg(null);
    if (target) {
      setScreen(target);
      setScreenStack([target]);
    }
  }, [pageLoading]);

  const navigateBack = useCallback(() => {
    if (animating || pageLoading) return;
    // 独立页回来看 loading 再回菜单
    if (!settings.noPageLoading && PAGE_LOAD_TARGETS.includes(screen)) {
      setPageLoadingBg(pickRandomCover());
      setPageLoading('menu');
      setPageLoadingLabel(getPageLabel('menu'));
      setScreen('page-loading');
      setScreenStack(['page-loading']);
      return;
    }
    // 栈短直接回 menu
    if (FLAT_PAGES.includes(screen)) {
      clearTimeout(animRef.current);
      setAnimating(false);
      setScreen('menu');
      setScreenStack(['menu']);
      return;
    }
    if (screenStack.length <= 1) return;
    // 从全屏页返回也直接替换
    if (FULLSCREEN_PAGES.includes(screen)) {
      // 手动录制/分析返回模式选择（菜单作为模糊背景层）
      if (screen === 'manual-record' || screen === 'manual-analyze') {
        audioManager.stop();
        setScreen('chart-mode-select');
        setScreenStack(['menu', 'chart-mode-select']);
        return;
      }
      const prev = screenStack.length > 1 ? screenStack[screenStack.length - 2] : 'menu';
      setScreen(prev);
      setScreenStack([prev]);
      return;
    }
    setAnimating(true);
    const prev = screenStack[screenStack.length - 2];
    setScreen(prev);
    setScreenStack(prev => prev.slice(0, -1));
    clearTimeout(animRef.current);
    animRef.current = window.setTimeout(() => setAnimating(false), 500);
  }, [animating, screen, screenStack]);

  // ============ 主菜单导航 ============
  const goToChartLib = useCallback(() => navigateTo('chart-library'), [navigateTo]);
  const goToConfig = useCallback(() => navigateTo('chart-mode-select'), [navigateTo]);
  const goToSettings = useCallback(() => navigateTo('settings'), [navigateTo]);
  const goToProfile = useCallback(() => navigateTo('profile'), [navigateTo]);
  const goToAbout = useCallback(() => navigateTo('about'), [navigateTo]);
  const goToRecords = useCallback(() => navigateTo('records'), [navigateTo]);
  const goToHelp = useCallback(() => navigateTo('help'), [navigateTo]);
  const goToDev = useCallback(() => navigateTo('dev'), [navigateTo]);
  const goToUpdate = useCallback(() => navigateTo('update'), [navigateTo]);

  // ═══ 谱面预览（选曲播放）═══
  const previewState = useRef<{ url: string | null; playing: boolean }>({ url: null, playing: false });
  // ═══ 音乐播放器（主菜单长按谱面库卡片）═══
  const [musicPlayerOpen, setMusicPlayerOpen] = useState(false);
  const handlePreview = useCallback((url: string | null) => {
    // 同一首不重启
    if (previewState.current.url === url && previewState.current.playing) return;
    previewState.current.url = url;
    if (!url) {
      stopPreview();
      previewState.current.playing = false;
      return;
    }
    previewState.current.playing = true;
    playPreview(url, PREVIEW_VOLUME);
  }, []);

  // 屏幕切换：谱面库满音量；子页低音量；主菜单/全屏页停止
  useEffect(() => {
    if (!previewState.current.playing) return;
    if (screen === 'chart-library') {
      setPreviewVolume(PREVIEW_VOLUME);
    } else if (screen === 'menu' || FULLSCREEN_PAGES.includes(screen)) {
      stopPreview();
      previewState.current.playing = false;
      previewState.current.url = null;
    } else {
      setPreviewVolume(PREVIEW_LOW_VOLUME);
    }
  }, [screen]);

  // Android 返回键 → 统一导航返回（无返回动作时忽略，不再直接退出）
  useEffect(() => {
    if (typeof (window as any).Capacitor === 'undefined') return;
    let handle: { remove: () => void } | null = null;
    CapacitorApp.addListener('backButton', () => {
      navigateBack();
    }).then(h => { handle = h; });
    return () => { handle?.remove(); };
  }, [navigateBack]);

  // 第一次来先看 EULA（
  const [eulaAccepted, setEulaAccepted] = useState(() => {
    try { return localStorage.getItem('palab_eula') === '1'; } catch { return false; }
  });

  // 没账号直接拱去个人信息（EULA 没过就算了）
  useEffect(() => {
    if (!loadAccount() && loadEULA()) {
      setAnimating(false);
      setScreen('profile');
      setScreenStack(['menu', 'profile']);
    }
  }, []); // 仅挂载时执行一次

  // ============ 设置 ============
  const handleSettingsSave = useCallback((s: AppSettings) => {
    setSettings(s);
    saveSettings(s);
    navigateBack();
  }, [navigateBack]);

  // ============ 配置确认 → 歌曲面板 ============
  const handleConfigConfirm = useCallback(async (cfg: GameConfig) => {
    setFromEditor(false); // 自动分析入口，清除编辑器标记
    const merged: GameConfig = {
      ...cfg,
      noteColor: settings.noteColor,
      holdNoteColor: settings.holdNoteColor,
      bgColor: settings.bgColor,
      judgeLineColor: settings.judgeLineColor,
    };
    setConfig(merged);
    if (merged.songUrl) {
      const dur = await audioManager.load(merged.songUrl);
      setDuration(dur);
      setIsTrial(true);  // 有歌曲 = 试玩模式
    } else {
      setDuration(getDevOverride('defaultDuration'));
      setIsTrial(false);
    }
    navigateTo('song-panel');
  }, [settings, navigateTo]);

  const handleClearConfig = useCallback(() => {
    audioManager.stop();
    chartGeneratedRef.current = false;
    setNotes([]);
    setResults(null);
    clearTimeout(animRef.current);
    setAnimating(false);
    setScreen('menu');
    setScreenStack(['menu']);
  }, []);

  const handleConfigChange = useCallback((newConfig: GameConfig) => {
    setConfig(newConfig);
    chartGeneratedRef.current = false;
  }, []);

  // ============ 手动制作流程 ============
  const goToAutoConfig = useCallback(() => navigateTo('config'), [navigateTo]);
  const goToManualConfig = useCallback(() => navigateTo('manual-config'), [navigateTo]);
  const goToEditorSetup = useCallback(() => navigateTo('editor-setup'), [navigateTo]);

  const handleEditorConfirm = useCallback((cfg: { bpm: number; trackCount: number; songUrl: string; songFileName: string; existingNotes?: Note[] }) => {
    setEditorConfig(cfg);
    navigateTo('visual-editor');
  }, [navigateTo]);

  // 编辑器 → 保存：进入元数据编辑界面
  const handleEditorSave = useCallback((notes: Note[]) => {
    if (!editorConfig) return;
    setEditorNotes(notes);
    // 提前加载歌，防止 ChartEditor 里 blob URL 挂（
    let songDataUrl: string | null = null;
    if (editorConfig.songUrl) {
      fetch(editorConfig.songUrl).then(r => r.blob()).then(b => {
        const reader = new FileReader();
        reader.onload = () => { songDataUrl = reader.result as string; };
        reader.readAsDataURL(b);
      }).catch(() => {});
    }
    // 用手动分析同款多因素难度算法（用音频时长）
    const durMs = duration > 0 ? duration : (notes.length > 1 ? (notes[notes.length - 1].endTime || notes[notes.length - 1].startTime) - notes[0].startTime : 60000);
    const chartConstant = estimateDifficulty(notes, Math.max(1000, durMs), editorConfig.trackCount);
    const cfg: GameConfig = {
      bpm: editorConfig.bpm, timeSignature: '4/4', trackCount: editorConfig.trackCount as TrackCount,
      chartConstant, timingWindows: { timeA: 160, timeB: 80, timeC: 280 },
      speedMultiplier: 5.0, noteColor: '#35BFFF', holdNoteColor: '#35BFFF',
      bgColor: '#0a0a14', judgeLineColor: '#999999',
      songUrl: editorConfig.songUrl, songFileName: editorConfig.songFileName,
      autoPlay: false,
    };
    setConfig(cfg);
    setNotes(ensureDoubleGroups(notes));
    setDuration(0);
    chartGeneratedRef.current = true;
    setIsTrial(false);
    setFromEditor(true);
    setEditorConfig(prev => prev ? { ...prev, existingNotes: notes } : null);
    setScreen('editor');
    setScreenStack(['chart-mode-select', 'visual-editor', 'editor']);
  }, [editorConfig]);

  // 编辑器试玩：进 SongPanel，不重新生成谱（
  const handleEditorTrial = useCallback(async (notes: Note[]) => {
    if (!editorConfig) return;
    setEditorNotes(notes);
    const durMs = duration > 0 ? duration : (notes.length > 1 ? (notes[notes.length - 1].endTime || notes[notes.length - 1].startTime) - notes[0].startTime : 60000);
    const cfg: GameConfig = {
      bpm: editorConfig.bpm, timeSignature: '4/4', trackCount: editorConfig.trackCount as TrackCount,
      chartConstant: estimateDifficulty(notes, Math.max(1000, durMs), editorConfig.trackCount), timingWindows: { timeA: 160, timeB: 80, timeC: 280 },
      speedMultiplier: 5.0, noteColor: '#35BFFF', holdNoteColor: '#35BFFF',
      bgColor: '#0a0a14', judgeLineColor: '#999999',
      songUrl: editorConfig.songUrl, songFileName: editorConfig.songFileName,
      autoPlay: false,
    };
    setConfig(cfg);
    setNotes(ensureDoubleGroups(notes));
    chartGeneratedRef.current = true;
    setFromEditor(true);
    if (editorConfig.songUrl) {
      audioManager.load(editorConfig.songUrl).then(d => setDuration(d));
    }
    setIsTrial(true);
    navigateTo('song-panel');
  }, [editorConfig, navigateTo]);

  const handleManualConfirm = useCallback(async (cfg: GameConfig) => {
    const merged: GameConfig = {
      ...cfg,
      noteColor: settings.noteColor,
      holdNoteColor: settings.holdNoteColor,
      bgColor: settings.bgColor,
      judgeLineColor: settings.judgeLineColor,
    };
    setManualConfig(merged);
    if (merged.songUrl) {
      const dur = await audioManager.load(merged.songUrl);
      setManualDuration(dur);
    }
    navigateTo('manual-record');
  }, [settings, navigateTo]);

  const handleManualRecordComplete = useCallback((notes: Note[]) => {
    setManualRawNotes(notes);
    navigateTo('manual-analyze');
  }, [navigateTo]);

  const handleManualAnalyzeComplete = useCallback((notes: Note[], chartConstant: number) => {
    if (!manualConfig) return;
    const finalConfig: GameConfig = { ...manualConfig, chartConstant };
    setConfig(finalConfig);
    setNotes(ensureDoubleGroups(notes));
    setDuration(manualDuration);
    chartGeneratedRef.current = true;
    setIsTrial(false);
    setScreen('editor');
    setScreenStack(['menu', 'editor']);
  }, [manualConfig, manualDuration]);

  const goToModeSelect = useCallback(() => navigateTo('chart-mode-select'), [navigateTo]);

  /** 手动录制返回：回到模式选择（菜单作为模糊背景层） */
  const handleManualRecordBack = useCallback(() => {
    audioManager.stop();
    setScreen('chart-mode-select');
    setScreenStack(['menu', 'chart-mode-select']);
  }, []);

  const handleStart = useCallback(() => {
    // 来自编辑器试玩：不重新生成谱面，用编辑器已有的音符
    if (!fromEditor) {
      const generatedNotes = generateChart(config, config.songUrl ? duration : null, config.enableHolds ?? true);
      setNotes(ensureDoubleGroups(generatedNotes));
    }
    chartGeneratedRef.current = true;
    // 设置加载任务：如果之前没有预加载过音频，则在加载画面期间加载
    if (config.songUrl) {
      loadingTaskRef.current = async () => {
        const d = await audioManager.load(config.songUrl!);
        setDuration(d);
      };
    } else {
      loadingTaskRef.current = undefined;
    }
    navigateTo('loading');
  }, [config, duration, navigateTo, fromEditor]);

  const handleLoadingComplete = useCallback(() => {
    gameStartTimeRef.current = performance.now();
    navigateTo('gameplay');
  }, [navigateTo]);

  const handleGameFinish = useCallback((gameResults: GameResults) => {
    audioManager.stop();
    setResults(gameResults);

    // 霸王模式是合法游玩，时长照记（
    if (!isTrial && (!config.autoPlay || isOverlord()) && !getDevOverride('invincibleMode')) {
      const elapsed = performance.now() - gameStartTimeRef.current;
      if (elapsed > 0 && elapsed < 7200000) { // 忽略异常值（>2小时视为计时错误）
        const prev = parseFloat(localStorage.getItem('palab_playtime') || '0');
        localStorage.setItem('palab_playtime', String(prev + elapsed));
        setPlayTime(prev + elapsed);
      }
    }

    // AutoPlay/试玩/无敌 统统不给记，霸王说了算（
    if (isTrial || (config.autoPlay && !isOverlord()) || (getDevOverride('invincibleMode') && !isOverlord()) || (isOverlord() && !overlordRecord())) {
      setTimeout(() => {
        navigateTo('results');
        setRksChange(null);
      }, getDevOverride('trialDelay'));
      return;
    }

    // 谱面库游戏：记录到谱面分数
    if (chartSource) {
      const entry: ChartScoreEntry = {
        score: gameResults.score, rating: gameResults.rating, rks: gameResults.pp,
        acc: gameResults.acc,
        date: new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US'),
      };
      const prev = chartScores[chartSource.fileName];
      if (!prev || gameResults.pp > (prev.rks ?? 0)) {
        const updated = { ...chartScores, [chartSource.fileName]: entry };
        setChartScores(updated);
        saveChartScores(updated);
      }
    }

    const oldRks = rks;

    const newRecord: HighScoreRecord = {
      score: gameResults.score,
      rating: gameResults.rating,
      perfect: gameResults.perfect,
      good: gameResults.good,
      bad: gameResults.bad,
      miss: gameResults.miss,
      maxCombo: gameResults.maxCombo,
      pp: gameResults.pp,
      offsets: gameResults.noteResults.map(r => r.judgment.offset === Infinity ? -1 : Math.round(r.judgment.offset)),
      date: new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US'),
      time: Date.now(),
      config: {
        bpm: config.bpm,
        difficulty: constantToDifficulty(config.chartConstant),
        chartConstant: config.chartConstant,
        trackCount: config.trackCount,
        speed: config.speedMultiplier,
      },
    };

    const updated = [newRecord, ...history].sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0));
    setHistory(updated);
    saveHistory(updated);

    const newRks = calcRKS(updated);
    setRks(newRks);
    saveRKS(newRks);

    if ((gameResults.pp ?? 0) > highPP) { setHighPP(gameResults.pp ?? 0); setHighScore(gameResults.score); setHighRating(gameResults.rating); }

    // 延迟跳转：等打完动画再进结算
    setTimeout(() => {
      navigateTo('results');
      setRksChange({ old: oldRks, new: newRks });
    }, getDevOverride('resultDelay'));
  }, [highScore, history, config, rks, navigateTo, chartScores, chartSource]);

  const handleRestart = useCallback(() => {
    setResults(null);
    if (chartSource) {
      // 谱面库游戏：把音频重新加载作为加载画面任务
      audioManager.stop();
      loadingTaskRef.current = config.songUrl ? async () => {
        const d = await audioManager.load(config.songUrl!);
        setDuration(d);
      } : undefined;
      navigateTo('loading');
    } else if (fromEditor) {
      audioManager.stop();
      loadingTaskRef.current = config.songUrl ? async () => { const d = await audioManager.load(config.songUrl!); setDuration(d); } : undefined;
      navigateTo('loading');
    } else {
      const generatedNotes = generateChart(config, config.songUrl ? duration : null, true);
      setNotes(ensureDoubleGroups(generatedNotes));
      loadingTaskRef.current = undefined;
      navigateTo('loading');
    }
  }, [config, duration, navigateTo, chartSource, fromEditor]);

  const handleBackToPanel = useCallback(() => {
    audioManager.stop();
    setResults(null);
    chartGeneratedRef.current = false;
    clearTimeout(animRef.current);
    setAnimating(false);
    if (fromEditor) {
      setFromEditor(false);
      setEditorConfig(prev => prev ? { ...prev, existingNotes: editorNotes } : null);
      setScreen('visual-editor');
      setScreenStack(['visual-editor']);
    } else if (chartSource) {
      setScreen('chart-library');
      setScreenStack(['chart-library']);
      setChartSource(null);
    } else {
      setScreen('song-panel');
      setScreenStack(['menu', 'config', 'song-panel']);
    }
  }, [chartSource, fromEditor, editorNotes]);

  const handleGameBack = useCallback(() => {
    audioManager.stop();
    setResults(null);
    chartGeneratedRef.current = false;
    clearTimeout(animRef.current);
    setAnimating(false);
    if (fromEditor) {
      setFromEditor(false);
      setEditorConfig(prev => prev ? { ...prev, existingNotes: editorNotes } : null);
      setScreen('visual-editor');
      setScreenStack(['visual-editor']);
    } else if (chartSource) {
      setChartListKey(k => k + 1);
      setScreen('chart-library');
      setScreenStack(['chart-library']);
      setChartSource(null);
    } else {
      setScreen('song-panel');
      setScreenStack(['menu', 'config', 'song-panel']);
    }
  }, [chartSource, fromEditor, editorNotes]);

  const handleSaveAccount = useCallback((info: AccountInfo) => {
    setAccount(info);
    saveAccount(info);
  }, []);

  const lang = settings.language;

  // 谱面库开始挑战
  const handleChartPlay = useCallback(async (pkg: ChartPackage, speed: number, autoPlay: boolean, target: 'none' | 'fc' | 'ap', mirror: boolean, correctHitSound: boolean) => {
    if (!pkg.songUrl) return;
    try {
      const parsedNotes: Note[] = JSON.parse(pkg.chartData);
      const infoConfig = JSON.parse(pkg.config || '{}');
      const cfg: GameConfig = {
        ...DEFAULT_CONFIG,
        bpm: infoConfig.bpm || 120,
        trackCount: infoConfig.trackCount || 4,
        chartConstant: pkg.chartConstant,
        speedMultiplier: speed,
        songUrl: pkg.songUrl,
        songFileName: pkg.title,
        noteColor: settings.noteColor,
        holdNoteColor: settings.holdNoteColor,
        bgColor: settings.bgColor,
        judgeLineColor: settings.judgeLineColor,
        autoPlay,
      };
      setConfig(cfg);
      setNotes(ensureDoubleGroups(parsedNotes));
      setIsTrial(false);
      setGameTarget(target);
      setGameMirror(mirror);
      setGameCorrectHitSound(correctHitSound);
      // 镜像 flip（
      if (mirror) {
        const tk = infoConfig.trackCount || 4;
        for (const n of parsedNotes) { n.track = tk - 1 - n.track; }
      }
      setChartSource({ fileName: pkg.fileName, title: pkg.title, artist: pkg.artist, author: pkg.author, difficulty: pkg.difficulty, chartConstant: pkg.chartConstant, trackCount: infoConfig.trackCount || 4, coverUrl: pkg.coverUrl, illustrationUrl: pkg.illustrationUrl });
      const dur = await audioManager.load(pkg.songUrl);
      setDuration(dur);
      loadingTaskRef.current = undefined; // 直接加载完成，清除旧任务防止覆盖
      navigateTo('loading');
    } catch { alert(lang === 'zh' ? '谱面加载失败' : 'Chart load failed'); }
  }, [settings, navigateTo, lang]);

  // 试玩存 zip（
  const handleSaveTrialZip = useCallback(async () => {
    if (!config.songUrl || notes.length === 0) return;
    try {
      const zip = new JSZip();
      const info = {
        title: config.songFileName?.replace(/\.[^.]+$/, '') || 'Untitled',
        artist: '',
        author: account?.name || 'Unknown',
        difficulty: constantToDifficulty(config.chartConstant),
        chartConstant: config.chartConstant,
        description: '',
        config: { bpm: config.bpm, timeSignature: config.timeSignature, trackCount: config.trackCount },
      };
      zip.file('info.json', JSON.stringify(info, null, 2));
      zip.file('chart.json', JSON.stringify(notes, null, 2));
      // 如果有歌曲，也打包进去
      if (config.songUrl) {
        try {
          const resp = await fetch(config.songUrl);
          const blob = await resp.blob();
          const ext = config.songFileName?.match(/\.(mp3|wav|ogg)$/i)?.[1] || 'mp3';
          zip.file(`song.${ext}`, blob);
        } catch { /* 歌曲获取失败则跳过 */ }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const fileName = `${info.title}_v1.zip`;
      await saveZipBlob(blob, fileName);
    } catch { /* ignore */ }
  }, [config, notes, account]);

  // 试玩后不保存退出
  const handleTrialDiscard = useCallback(() => {
    audioManager.stop();
    setResults(null);
    chartGeneratedRef.current = false;
    clearTimeout(animRef.current);
    setAnimating(false);
    if (fromEditor) {
      setFromEditor(false);
      setEditorConfig(prev => prev ? { ...prev, existingNotes: editorNotes } : null);
      setScreen('visual-editor');
      setScreenStack(['visual-editor']);
    } else {
      setScreen('menu');
      setScreenStack(['menu']);
    }
  }, [fromEditor, editorNotes]);

  // 试玩后继续编辑
  const handleTrialContinue = useCallback(() => {
    clearTimeout(animRef.current);
    setAnimating(false);
    if (fromEditor) {
      setFromEditor(false);
      setEditorConfig(prev => prev ? { ...prev, existingNotes: editorNotes } : null);
      setScreen('visual-editor');
      setScreenStack(['visual-editor']);
    } else {
      setScreen('editor');
      setScreenStack(['menu', 'editor']);
    }
  }, [fromEditor]);

  // 背景样式


  // ============ 渲染各页面 ============
  const renderScreen = (s: AppScreen) => {
    switch (s) {
      case 'menu':
        return <MainMenu onChartLibrary={goToChartLib} onCreateChart={goToConfig} onSettings={goToSettings} onAbout={goToAbout} onRecords={goToRecords} onHelp={goToHelp} onUpdate={goToUpdate} onDev={goToDev} onOpenMusicPlayer={() => setMusicPlayerOpen(true)} rks={rks} lang={lang} devMode={devMode} onToggleDev={toggleDevMode} account={account} onSaveAccount={handleSaveAccount} showMascot={false} hasUpdate={pendingUpdate !== null} />;
      case 'chart-library':
        return <ChartLibrary key={chartListKey} onPlay={handleChartPlay} onSettings={goToSettings} onPreview={handlePreview} lang={lang} highScores={chartScores} uiBlur={settings.uiBlur} />;
      case 'settings':
        return <SettingsPanel settings={settings} onSave={handleSettingsSave} onBack={navigateBack} lang={lang} devMode={devMode} />;
      case 'config':
        return <ConfigPanel onConfirm={handleConfigConfirm} onBack={navigateBack} lang={lang} devMode={devMode} />;
      case 'chart-mode-select':
        return <ChartModeSelect onAuto={goToAutoConfig} onManual={goToManualConfig} onEditor={goToEditorSetup} lang={lang} />;
      case 'manual-config':
        return <ManualConfig onConfirm={handleManualConfirm} lang={lang} />;
      case 'manual-record':
        return manualConfig ? <ManualRecord config={manualConfig} duration={manualDuration} onComplete={handleManualRecordComplete} onBack={handleManualRecordBack} lang={lang} latencyOffset={settings.latencyOffset} /> : null;
      case 'manual-analyze':
        return manualConfig ? <ManualAnalyzer config={manualConfig} rawNotes={manualRawNotes} duration={manualDuration} onComplete={handleManualAnalyzeComplete} lang={lang} /> : null;
      case 'song-panel':
        return <SongPanel config={config} highScore={highScore} highPP={highPP} highRating={highRating} history={history} onStart={handleStart} onClearConfig={handleClearConfig} onConfigChange={handleConfigChange} onBack={navigateBack} onSettings={goToSettings} lang={lang} isTrial={isTrial} />;
      case 'page-loading':
        return <LoadingScreen onComplete={handlePageLoadingComplete} lang={lang} chartInfo={null} uiBlur={settings.uiBlur} coverOverride={pageLoadingBg} pageTitle={pageLoadingLabel} />;
      case 'loading':
        return <LoadingScreen onComplete={handleLoadingComplete} lang={lang} chartInfo={chartSource} uiBlur={settings.uiBlur} task={loadingTaskRef.current} />;
      case 'gameplay':
        return <GamePlay config={config} notes={notes} duration={duration} onFinish={handleGameFinish} onBack={handleGameBack} onRestart={handleRestart} target={gameTarget} showDoubleGlow={settings.showDoubleGlow} latencyOffset={settings.latencyOffset} lang={lang} devMode={devMode} showACC={settings.showACC} showWaveform={settings.showWaveform} coverUrl={chartSource?.illustrationUrl ?? chartSource?.coverUrl ?? null} noteScale={settings.noteScale} musicVolume={settings.musicVolume} uiBlur={settings.uiBlur} judgeLineThickness={settings.judgeLineThickness} correctHitSound={gameCorrectHitSound} showAccuracyBar={settings.showAccuracyBar ?? false} showFPS={settings.showFPS ?? false} />;
      case 'results':
        return results ? <ResultsScreen results={results} onRestart={handleRestart} onBackToPanel={handleBackToPanel} rks={rks} rksChange={rksChange} lang={lang} isTrial={isTrial} onAdjustParams={handleTrialDiscard} onContinueToEditor={handleTrialContinue} chartInfo={chartSource} /> : null;
      case 'editor':
        return <ChartEditor config={config} notes={notes} onBack={navigateBack} lang={lang} />;
      case 'editor-setup':
        return <EditorSetup onConfirm={handleEditorConfirm} onBack={navigateBack} lang={lang} />;
      case 'visual-editor':
        return editorConfig ? <VisualEditor config={editorConfig} onBack={() => { setFromEditor(false); setScreen('chart-mode-select'); setScreenStack(['chart-mode-select']); }} onSave={handleEditorSave} onTrial={handleEditorTrial} lang={lang} latencyOffset={settings.latencyOffset} /> : null;
      case 'records':
        return <RecordsScreen lang={lang} account={account} rks={rks} history={history} highPP={highPP} onProfile={goToProfile} onBack={navigateBack} playTime={playTime} />;
      case 'profile':
        return <ProfileEditor lang={lang} account={account} onSave={handleSaveAccount} onBack={navigateBack} />;
      case 'about':
        return <AboutScreen lang={lang} onClose={() => { setScreen('menu'); setScreenStack(['menu']); }} onShowEULA={() => { localStorage.removeItem('palab_eula'); setEulaAccepted(false); setScreen('menu'); setScreenStack(['menu']); }} />;
      case 'help':
        return <HelpScreen lang={lang} />;
      case 'update':
        return <UpdateScreen lang={lang} pendingUpdate={pendingUpdate} devMode={devMode} />;
      case 'dev':
        return <DevPanel lang={lang} settings={settings} onSave={(s) => { setSettings(s); saveSettings(s); }} onBack={navigateBack} />;
      default:
        return null;
    }
  };

  const isFullscreen = FULLSCREEN_PAGES.includes(screen);

  return (
    <div className={`app-root${settings.uiBlur ? '' : ' no-ui-blur'}${!settings.showMascot && screen === 'menu' ? ' no-mascot' : ''}`}>
      {/* EULA */}
      {!eulaAccepted && (
        <EULAModal lang={lang} onAgree={() => { localStorage.setItem('palab_eula', '1'); setEulaAccepted(true); }} />
      )}

      {/* 音乐播放器（主菜单长按谱面库卡片） */}
      {musicPlayerOpen && (
        <MusicPlayer lang={lang} uiBlur={settings.uiBlur} musicVolume={settings.musicVolume} onClose={() => setMusicPlayerOpen(false)} />
      )}

      {/* ── 全局 Brand (字母+RKS) — 主页居中，子页移到顶栏 ── */}
      {!FULLSCREEN_PAGES.includes(screen) && (
        <div className={`global-brand ${screen === 'menu' ? 'at-menu' : 'at-topbar'}`}>
          <div className="brand-left">
            {/* 子页返回键在顶栏左侧 */}
            {screen !== 'menu' && (
              <button className="global-back-btn topbar-back" onClick={navigateBack}>
                <span className="global-back-arrow">{lang === 'zh' ? '返回' : 'Back'}</span>
              </button>
            )}
            <div className="brand-logo" onClick={handleBrandDevClick} style={{ cursor: 'pointer' }}>
            {['P','A','L','A','B'].map((c, i) => (
              <span key={i} className="brand-char" style={{ animationDelay: `${i * 0.1}s` }}>{c}</span>
            ))}
          </div>
          </div>
          <div className="brand-rks" onClick={goToRecords}>
            <div className="brand-rks-avatar">
              {account?.avatarUrl ? (
                <img src={account.avatarUrl} alt={account.name} />
              ) : (
                <span>?</span>
              )}
            </div>
            <span className="brand-rks-text">RKS {rks < 0 ? '--' : rks.toFixed(2)}</span>
            <span className="brand-arrow">▾</span>
          </div>
        </div>
      )}

      {/* ── Records 系统已移至独立页面 ── */}

      <div className="screen-stack">
        {screenStack.map((s, i) => {
          const isFront = i === screenStack.length - 1;
          const isSingle = screenStack.length === 1;
          const depth = screenStack.length - 1 - i;
          return (
            <div
              key={`${s}-${i}`}
              style={{ '--depth': depth } as React.CSSProperties}
              className={
                `screen-layer${isFront ? ' front' : ''}${!isFront ? ' back' : ''}${isSingle ? ' single' : ''}${isFullscreen ? ' fullscreen' : ''}`
              }
            >
              {renderScreen(s)}
            </div>
          );
        })}
      </div>

      {/* 返回键已移至顶栏 Logo 左侧 */}

    </div>
  );
};

export default App;
