import React, { useRef, useState, useCallback, useEffect } from 'react';
import { AppSettings, TrackCount, KEY_MAP } from '@/types';
import { t, Lang } from '@/utils/lang';
import { saveAsset, fileToDataURL, hasAsset, loadAsset, clearAsset, ASSET_KEYS } from '@/utils/assetStore';
import { setHitVolume, getHitVolume } from './GamePlay';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onBack: () => void;
  lang: Lang;
  devMode?: boolean;
}

type Sub = 'main' | 'repair' | 'personalize' | 'latency' | 'audio' | 'keys';

export const SettingsPanel: React.FC<Props> = ({ settings, onSave, onBack, lang, devMode = false }) => {
  const [showDoubleGlow, setShowDoubleGlow] = useState(settings.showDoubleGlow);
  const [currentLang, setCurrentLang] = useState(settings.language);
  const [showACC, setShowACC] = useState(settings.showACC ?? false);
  const [showWaveform, setShowWaveform] = useState(settings.showWaveform ?? false);
  const [uiBlur, setUiBlur] = useState(settings.uiBlur ?? true);
  const [noPageLoading, setNoPageLoading] = useState(settings.noPageLoading ?? false);
  const [noteScale, setNoteScale] = useState(settings.noteScale ?? 1.0);
  const [judgeLineThickness, setJudgeLineThickness] = useState(settings.judgeLineThickness ?? 3);
  const [showAccuracyBar, setShowAccuracyBar] = useState(settings.showAccuracyBar ?? false);
  const [showFPS, setShowFPS] = useState(settings.showFPS ?? false);
  const [musicVol, setMusicVol] = useState(settings.musicVolume ?? 50);
  const [hitVol, setHitVol] = useState(Math.round(getHitVolume() * 100));
  const [keyBindings, setKeyBindings] = useState<Partial<Record<TrackCount, string[]>> | undefined>(settings.keyBindings);
  const [uiScale, setUiScale] = useState(settings.uiScale ?? 1);
  const [gameUiScale, setGameUiScale] = useState(settings.gameUiScale ?? 1);
  const [videoBg, setVideoBg] = useState(settings.videoBg ?? true);
  const [performanceMode, setPerformanceMode] = useState(settings.performanceMode ?? false);
  const [holdGradient, setHoldGradient] = useState(settings.holdGradient ?? true);
  const [sub, setSub] = useState<Sub>('main');

  const build = (o: Partial<AppSettings> = {}): AppSettings => ({
    latencyOffset: settings.latencyOffset,
    showDoubleGlow,
    noteColor: '#35BFFF', holdNoteColor: '#35BFFF',
    bgColor: '#0a0a14', judgeLineColor: '#999999',
    language: currentLang, showACC, devMode, showWaveform, uiBlur, noPageLoading,
    noteScale, musicVolume: musicVol, judgeLineThickness, showAccuracyBar, showFPS,
    keyBindings,
    uiScale, gameUiScale,
    videoBg,
    performanceMode,
    holdGradient,
    showMascot: false, // 立绘已移除，永远关闭
    ...o,
  });

  const save = () => onSave(build());

  // 键位修改/恢复默认立即持久化（否则子面板改动要回主面板点保存才生效）
  const commitBindings = (next: Partial<Record<TrackCount, string[]>>) => {
    setKeyBindings(next);
    onSave(build({ keyBindings: next }));
  };

  if (sub === 'repair') return <RepairPanel lang={lang} onBack={() => setSub('main')} />;
  if (sub === 'personalize') return <PersonalizePanel lang={lang} onBack={() => setSub('main')} />;
  if (sub === 'latency') return <LatencyPanel lang={lang} offset={settings.latencyOffset} onSave={o => onSave(build({ latencyOffset: o }))} onBack={() => setSub('main')} />;
  if (sub === 'audio') return <AudioPanel lang={lang} musicVol={musicVol} hitVol={hitVol} onMusic={setMusicVol} onHit={v => { setHitVol(v); setHitVolume(v / 100); }} onBack={() => setSub('main')} />;
  if (sub === 'keys') return <KeyBindingsPanel lang={lang} bindings={keyBindings} onChange={commitBindings} onBack={() => setSub('main')} />;

  return (
    <div className="screen settings-screen">
      <div className="settings-container">
        <h2 className="st-title">{t('settings', lang)}</h2>

        <div className="st-card">
          <div className="st-row st-row-noborder">
            <span className="st-label">{t('language', lang)}</span>
            <div className="st-lang-toggle">
              <button className={`st-lang-btn ${currentLang === 'zh' ? 'active' : ''}`} onClick={() => setCurrentLang('zh')}>{t('chinese', lang)}</button>
              <button className={`st-lang-btn ${currentLang === 'en' ? 'active' : ''}`} onClick={() => setCurrentLang('en')}>{t('english', lang)}</button>
            </div>
          </div>
        </div>

        <div className="st-card">
          <div className="st-row"><span className="st-label">{t('double.glow', lang)}</span>
            <label className="toggle-switch"><input type="checkbox" checked={showDoubleGlow} onChange={e => setShowDoubleGlow(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '实时 ACC' : 'Realtime ACC'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={showACC} onChange={e => setShowACC(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '音频可视化' : 'Audio Viz'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={showWaveform} onChange={e => setShowWaveform(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? 'UI 模糊效果' : 'UI Blur'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={uiBlur} onChange={e => setUiBlur(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '谱面视频背景' : 'Video Background'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={videoBg} onChange={e => setVideoBg(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '长条渐变透明' : 'Hold Gradient'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={holdGradient} onChange={e => setHoldGradient(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '关闭无用加载' : 'Skip Extra Loading'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={noPageLoading} onChange={e => setNoPageLoading(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '音符大小' : 'Note Scale'}</span>
            <div className="st-speed-row"><input type="range" min={0.5} max={2.0} step={0.05} value={noteScale} onChange={e => setNoteScale(parseFloat(e.target.value))} className="st-range" />
              <span className="st-speed-val">{noteScale.toFixed(2)}x</span></div>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '判定线粗细' : 'Judge Line'}</span>
            <div className="st-speed-row"><input type="range" min={1} max={10} step={1} value={judgeLineThickness} onChange={e => setJudgeLineThickness(parseInt(e.target.value))} className="st-range" />
              <span className="st-speed-val">{judgeLineThickness}px
                <span style={{ display: 'inline-block', width: Math.max(12, judgeLineThickness * 4), height: Math.max(1, judgeLineThickness), background: '#999', borderRadius: judgeLineThickness / 2, marginLeft: 6, verticalAlign: 'middle' }} />
              </span></div>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '准度条' : 'Accuracy Bar'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={showAccuracyBar} onChange={e => setShowAccuracyBar(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '显示帧数' : 'Show FPS'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={showFPS} onChange={e => setShowFPS(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row"><span className="st-label">{lang === 'zh' ? '界面大小' : 'UI Scale'}</span>
            <div className="st-lang-toggle">
              {([{ v: 0.6, l: lang === 'zh' ? '极小' : 'XS' }, { v: 0.8, l: lang === 'zh' ? '小' : 'S' }, { v: 1, l: lang === 'zh' ? '中' : 'M' }, { v: 1.2, l: lang === 'zh' ? '大' : 'L' }] as { v: number; l: string }[]).map(s => (
                <button key={s.v} className={`st-lang-btn ${uiScale === s.v ? 'active' : ''}`} onClick={() => setUiScale(s.v)}>{s.l}</button>
              ))}
            </div>
          </div>
          <div className="st-row st-row-noborder"><span className="st-label">{lang === 'zh' ? '游戏界面大小' : 'Game UI Scale'}</span>
            <div className="st-lang-toggle">
              {([{ v: 0.6, l: lang === 'zh' ? '极小' : 'XS' }, { v: 0.8, l: lang === 'zh' ? '小' : 'S' }, { v: 1, l: lang === 'zh' ? '中' : 'M' }, { v: 1.2, l: lang === 'zh' ? '大' : 'L' }] as { v: number; l: string }[]).map(s => (
                <button key={s.v} className={`st-lang-btn ${gameUiScale === s.v ? 'active' : ''}`} onClick={() => setGameUiScale(s.v)}>{s.l}</button>
              ))}
            </div>
          </div>
          <div className="st-row st-row-noborder"><span className="st-label">{lang === 'zh' ? '性能模式' : 'Performance Mode'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={performanceMode} onChange={e => setPerformanceMode(e.target.checked)} /><span className="toggle-slider" /></label>
          </div>
          <div className="st-row st-row-noborder"><span className="st-label">{lang === 'zh' ? '开发者模式' : 'Developer Mode'}</span>
            <label className="toggle-switch"><input type="checkbox" checked={devMode} onChange={e => {
              const u = { ...settings, devMode: e.target.checked, noteColor: '#35BFFF' as const, holdNoteColor: '#35BFFF' as const, bgColor: '#0a0a14' as const, judgeLineColor: '#999999' as const };
              onSave(u);
            }} /><span className="toggle-slider" /></label>
          </div>
        </div>

        <button className="st-action-btn st-sub-btn" onClick={() => setSub('repair')}>{lang === 'zh' ? '素材修复' : 'Repair'}</button>
        <button className="st-action-btn st-sub-btn" onClick={() => setSub('personalize')}>{lang === 'zh' ? '个性化' : 'Personalize'}</button>
        <button className="st-action-btn st-sub-btn" onClick={() => setSub('latency')}>
          {lang === 'zh' ? '延迟调整' : 'Latency'}
          <span style={{ fontSize: 10, display: 'block', opacity: 0.6 }}>
            {lang === 'zh' ? '当前版本该功能存在较多问题，不建议使用。' : 'This feature has known issues in the current version.'}
          </span>
        </button>
        <button className="st-action-btn st-sub-btn" onClick={() => setSub('audio')}>{lang === 'zh' ? '音量' : 'Volume'}</button>
        <button className="st-action-btn st-sub-btn" onClick={() => setSub('keys')}>{lang === 'zh' ? '键位' : 'Keys'}</button>

        <button className="st-save-btn" onClick={save}>{t('save', lang)}</button>
      </div>
    </div>
  );
};

// ==================== 子面板头部 ====================
const SubHdr: React.FC<{ title: string; onBack: () => void; lang: Lang }> = ({ title, onBack, lang }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
    <button className="st-back-btn" onClick={onBack}>{lang === 'zh' ? '返回' : 'Back'}</button>
    <h2 className="st-title" style={{ margin: 0, flex: 1, textAlign: 'center' }}>{title}</h2>
    <span style={{ width: 80 }} />
  </div>
);

// ==================== 素材修复 ====================
const REPAIR_PATH_DEV = '/api/unauth/52047071297934341';
const REPAIR_PATH_PROD = 'https://yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy/52047071297934341';
const REPAIR_FILES: { key: string; id: string; labelZh: string; labelEn: string }[] = [
  { key: ASSET_KEYS.mascot, id: '52047137196741637/14.png', labelZh: '看板娘立绘', labelEn: 'Mascot' },
  { key: ASSET_KEYS.hitSound, id: '52047169670091781/tab.ogg', labelZh: '打击音效', labelEn: 'Hit Sound' },
  // 主界面封面：文件名与主菜单背景加载一致（横屏 43.jpg / 竖屏 916.jpg）
  { key: ASSET_KEYS.coverLand, id: '53489520232895493/43.jpg', labelZh: '主界面封面（横屏）', labelEn: 'Menu Cover (Landscape)' },
  { key: ASSET_KEYS.coverPort, id: '53489534385525765/916.jpg', labelZh: '主界面封面（竖屏）', labelEn: 'Menu Cover (Portrait)' },
];

function getRepairUrl(id: string): string {
  const base = import.meta.env.DEV ? REPAIR_PATH_DEV : REPAIR_PATH_PROD;
  return `${base}/${id}`;
}

const RepairPanel: React.FC<{ lang: Lang; onBack: () => void }> = ({ lang, onBack }) => {
  const [status, setStatus] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>(() => {
    const s: Record<string, 'idle' | 'loading' | 'ok' | 'error'> = {};
    for (const f of REPAIR_FILES) s[f.key] = hasAsset(f.key) ? 'ok' : 'idle';
    return s;
  });

  const download = async (f: typeof REPAIR_FILES[number]) => {
    setStatus(prev => ({ ...prev, [f.key]: 'loading' }));
    try {
      const resp = await fetch(getRepairUrl(f.id), { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      saveAsset(f.key, dataUrl);
      setStatus(prev => ({ ...prev, [f.key]: 'ok' }));
    } catch {
      setStatus(prev => ({ ...prev, [f.key]: 'error' }));
    }
  };

  const clr = (key: string) => { clearAsset(key); setStatus(prev => ({ ...prev, [key]: 'idle' })); };

  return (
    <div className="screen settings-screen">
      <div className="settings-container">
        <SubHdr title={lang === 'zh' ? '素材修复' : 'Repair'} onBack={onBack} lang={lang} />
        {REPAIR_FILES.map(f => {
          const st = status[f.key];
          return (
            <div className="st-card" key={f.key}>
              <span className="st-label" style={{ display: 'block', marginBottom: 8 }}>{lang === 'zh' ? f.labelZh : f.labelEn}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: st === 'ok' ? '#44BB44' : st === 'error' ? '#FF4444' : 'var(--text-secondary)', minWidth: 40 }}>
                  {st === 'loading' ? '...' : st === 'ok' ? 'OK' : st === 'error' ? (lang === 'zh' ? '失败' : 'Fail') : '-'}
                </span>
                <button className="st-file-btn" onClick={() => download(f)} disabled={st === 'loading'}>
                  {st === 'loading' ? (lang === 'zh' ? '下载中...' : 'Downloading...') : st === 'ok' ? (lang === 'zh' ? '重新下载' : 'Redownload') : (lang === 'zh' ? '下载修复' : 'Download Fix')}
                </button>
                {st === 'ok' && <button className="st-clear-btn" onClick={() => clr(f.key)}>{lang === 'zh' ? '清除' : 'Clear'}</button>}
              </div>
            </div>
          );
        })}
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', margin: 8 }}>
          {lang === 'zh' ? '点击「下载修复」从云端拉取默认素材。素材存储在浏览器本地。' : 'Click "Download Fix" to fetch default assets from cloud. Stored locally.'}
        </p>
      </div>
    </div>
  );
};

// ==================== 个性化 ====================
const PersonalizePanel: React.FC<{ lang: Lang; onBack: () => void }> = ({ lang, onBack }) => {
  const [tapOk, setTapOk] = useState(hasAsset(ASSET_KEYS.noteTap));
  const [holdOk, setHoldOk] = useState(hasAsset(ASSET_KEYS.noteHold));
  const imp = async (k: string, e: React.ChangeEvent<HTMLInputElement>, s: (v: boolean) => void) => {
    const f = e.target.files?.[0]; if (!f) return;
    saveAsset(k, await fileToDataURL(f)); s(true);
  };
  const clr = (k: string, s: (v: boolean) => void) => { clearAsset(k); s(false); };
  const tp = tapOk ? loadAsset(ASSET_KEYS.noteTap) : null;
  const hp = holdOk ? loadAsset(ASSET_KEYS.noteHold) : null;

  return (
    <div className="screen settings-screen">
      <div className="settings-container">
        <SubHdr title={lang === 'zh' ? '个性化' : 'Personalize'} onBack={onBack} lang={lang} />
        <div className="st-card">
          <span className="st-label" style={{ display: 'block', marginBottom: 8 }}>{lang === 'zh' ? 'Tap 贴图' : 'Tap Skin'}</span>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>{lang === 'zh' ? '保持比例，居中显示。' : 'Keep aspect ratio, centered.'}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: tapOk ? '#44BB44' : 'var(--text-secondary)', minWidth: 30 }}>{tapOk ? 'OK' : '-'}</span>
            <input type="file" accept="image/*" onChange={e => imp(ASSET_KEYS.noteTap, e, setTapOk)} id="per-t" className="file-input" />
            <label htmlFor="per-t" className="st-file-btn">{tapOk ? (lang === 'zh' ? '更换' : 'Change') : (lang === 'zh' ? '选取' : 'Pick')}</label>
            {tapOk && <button className="st-clear-btn" onClick={() => clr(ASSET_KEYS.noteTap, setTapOk)}>{lang === 'zh' ? '清除' : 'Clear'}</button>}
          </div>
          {tp && <div className="st-bg-preview" style={{ marginTop: 8 }}><img src={tp} alt="" style={{ objectFit: 'contain', maxHeight: 40 }} /></div>}
        </div>
        <div className="st-card">
          <span className="st-label" style={{ display: 'block', marginBottom: 8 }}>{lang === 'zh' ? 'Hold 贴图' : 'Hold Skin'}</span>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>{lang === 'zh' ? '拉伸填充整个长条。' : 'Stretch to fill hold area.'}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: holdOk ? '#44BB44' : 'var(--text-secondary)', minWidth: 30 }}>{holdOk ? 'OK' : '-'}</span>
            <input type="file" accept="image/*" onChange={e => imp(ASSET_KEYS.noteHold, e, setHoldOk)} id="per-h" className="file-input" />
            <label htmlFor="per-h" className="st-file-btn">{holdOk ? (lang === 'zh' ? '更换' : 'Change') : (lang === 'zh' ? '选取' : 'Pick')}</label>
            {holdOk && <button className="st-clear-btn" onClick={() => clr(ASSET_KEYS.noteHold, setHoldOk)}>{lang === 'zh' ? '清除' : 'Clear'}</button>}
          </div>
          {hp && <div className="st-bg-preview" style={{ marginTop: 8 }}><img src={hp} alt="" style={{ objectFit: 'fill', maxHeight: 40, width: 120 }} /></div>}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', margin: 8 }}>{lang === 'zh' ? '贴图在下一局生效。' : 'Skins apply next game.'}</p>
      </div>
    </div>
  );
};

// ==================== 延迟调整 ====================

const FALL_MS = 500; // 6x 流速 = 3000/6
const CALIB_BPM = 100;
const BEAT_MS = 60000 / CALIB_BPM;
const CALIB_START_DELAY = 500; // 与试听节拍声的起始延迟保持一致

const NoteDropPreview: React.FC<{ offset: number; playing: boolean }> = ({ offset, playing }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<{ id: number; beat: number; track: number }[]>([]);
  const idRef = useRef(0);
  const lastBeatRef = useRef(0);
  const rafRef = useRef(0);
  const [tick, setTick] = useState(0); // 强制重渲染

  useEffect(() => {
    if (!playing) { notesRef.current = []; setTick(0); return; }
    idRef.current = 0;
    notesRef.current = [];
    // 第一个节拍（音符到判定线）在 startDelay 时
    lastBeatRef.current = performance.now() + CALIB_START_DELAY - BEAT_MS;

    const loop = () => {
      const now = performance.now();
      // 音符在拍点前 FALL_MS 生成（从顶部开始），拍点时到达判定线
      const nextBeat = lastBeatRef.current + BEAT_MS;
      if (now >= nextBeat - FALL_MS) {
        lastBeatRef.current = nextBeat;
        notesRef.current.push({ id: idRef.current++, beat: nextBeat, track: 0 });
      }
      // 保留：拍点前 FALL_MS(顶部) ~ 拍点后 1000ms
      notesRef.current = notesRef.current.filter(n => now - n.beat > -FALL_MS - 200 && now - n.beat < FALL_MS + 1000);
      setTick(t => t + 1); // 触发重渲染
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  return (
    <div ref={boxRef} style={{
      width: '100%', height: 300, background: 'rgba(0,0,0,0.35)',
      borderRadius: 8, overflow: 'hidden', position: 'relative',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 3, height: 2, background: 'rgba(255,255,255,0.25)' }} />
      {notesRef.current.map(n => {
        const h = boxRef.current?.clientHeight ?? 300;
        const elapsed = performance.now() - n.beat;
        // 音符在拍点(n.beat)时正好到判定线：elapsed=0 → y=h；顶部 y=0 在拍前 FALL_MS
        const rawY = ((FALL_MS + elapsed) / FALL_MS) * h;
        const shift = (offset / FALL_MS) * h;
        const y = rawY + shift;
        // 过线后淡出
        const alpha = y > h ? Math.max(0, 1 - (y - h) / 40) : 1;
        if (y < -12 || y > h + 40) return null;
        return (
          <div key={n.id} style={{
            position: 'absolute',
            left: 'calc(50% - 16px)',
            width: 32,
            height: 10, borderRadius: 3,
            background: '#35BFFF',
            top: y, opacity: alpha,
          }} />
        );
      })}
      {!playing && notesRef.current.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 12 }}>
          ▶ 试听预览
        </div>
      )}
    </div>
  );
};

const LatencyPanel: React.FC<{ lang: Lang; offset: number; onSave: (o: number) => void; onBack: () => void }> = ({ lang, offset, onSave, onBack }) => {
  const [value, setValue] = useState(offset);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = (ctx: AudioContext) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1000; o.type = 'sine';
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.05);
  };

  const togglePlay = () => {
    if (!playing) {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      // 先来 4 下预备拍，再开始正式节拍
      const startDelay = CALIB_START_DELAY;
      const beatMs = BEAT_MS;
      setTimeout(() => { if (ctxRef.current) tick(ctxRef.current); }, startDelay);
      setTimeout(() => { if (ctxRef.current) tick(ctxRef.current); }, startDelay + beatMs);
      setTimeout(() => { if (ctxRef.current) tick(ctxRef.current); }, startDelay + beatMs * 2);
      setTimeout(() => { if (ctxRef.current) tick(ctxRef.current); }, startDelay + beatMs * 3);
      // 正式节拍用 setInterval 持续发声
      setTimeout(() => {
        if (!ctxRef.current) return;
        tick(ctxRef.current);
        timerRef.current = setInterval(() => {
          if (ctxRef.current) tick(ctxRef.current);
        }, beatMs);
      }, startDelay + beatMs * 4);
      setPlaying(true);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      ctxRef.current?.close();
      ctxRef.current = null;
      setPlaying(false);
    }
  };

  const handleBack = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    ctxRef.current?.close();
    ctxRef.current = null;
    onSave(value);
    onBack();
  };
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    ctxRef.current?.close();
  }, []);

  return (
    <div className="screen settings-screen">
      <div className="settings-container" style={{ textAlign: 'center' }}>
        <SubHdr title={lang === 'zh' ? '延迟调整' : 'Latency'} onBack={handleBack} lang={lang} />

        <NoteDropPreview offset={value} playing={playing} />

        <div className="st-card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
            <button className="st-action-btn" onClick={togglePlay} style={{ minWidth: 70 }}>
              {playing ? (lang === 'zh' ? '⏸ 暂停' : '⏸ Stop') : (lang === 'zh' ? '▶ 试听' : '▶ Preview')}
            </button>
            <span style={{ fontSize: 11, color: '#666' }}>BPM {CALIB_BPM}</span>
          </div>
          <div className="st-speed-row" style={{ justifyContent: 'center' }}>
            <input
              type="range" min={-500} max={500} step={5}
              value={value}
              onChange={e => setValue(parseInt(e.target.value))}
              className="st-range" style={{ maxWidth: 280 }}
            />
            <span style={{
              fontSize: 22, fontWeight: 800, minWidth: 64, fontVariantNumeric: 'tabular-nums',
              color: value === 0 ? '#aaa' : value > 0 ? '#FFD700' : '#44BBFF',
            }}>
              {value > 0 ? '+' : ''}{value}ms
            </span>
          </div>
          <button
            className="st-action-btn"
            style={{ marginTop: 6, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)' }}
            onClick={() => { setValue(0); }}
          >
            {lang === 'zh' ? '归零' : 'Reset'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
          {lang === 'zh'
            ? '播放校准曲，拖动滑块使音符到达判定线时与节拍对齐。调整完毕点击返回自动保存。'
            : 'Play the song, adjust slider so notes hit the line on beat. Press Back to save.'}
        </p>
      </div>
    </div>
  );
};

// ==================== 音量面板 ====================
const AudioPanel: React.FC<{ lang: Lang; musicVol: number; hitVol: number; onMusic: (v: number) => void; onHit: (v: number) => void; onBack: () => void }> = ({ lang, musicVol, hitVol, onMusic, onHit, onBack }) => (
  <div className="screen settings-screen">
    <div className="settings-container">
      <SubHdr title={lang === 'zh' ? '音量' : 'Volume'} onBack={onBack} lang={lang} />
      <div className="st-card">
        <div className="st-row">
          <span className="st-label">{lang === 'zh' ? '音乐音量' : 'Music Vol'}</span>
          <div className="st-speed-row">
            <input type="range" min={0} max={100} step={5} value={musicVol} onChange={e => onMusic(parseInt(e.target.value))} className="st-range" />
            <span className="st-speed-val">{musicVol}%</span>
          </div>
        </div>
        <div className="st-row st-row-noborder">
          <span className="st-label">{lang === 'zh' ? '打击音量' : 'Hit Vol'}</span>
          <div className="st-speed-row">
            <input type="range" min={0} max={100} step={5} value={hitVol} onChange={e => onHit(parseInt(e.target.value))} className="st-range" />
            <span className="st-speed-val">{hitVol}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const KEY_TRACK_COUNTS: TrackCount[] = [2, 4, 6, 8];

/** 键位设置面板：点击键位框后按新键修改，支持 2/4/6/8 独立设置 */
const KeyBindingsPanel: React.FC<{
  lang: Lang;
  bindings: Partial<Record<TrackCount, string[]>> | undefined;
  onChange: (b: Partial<Record<TrackCount, string[]>>) => void;
  onBack: () => void;
}> = ({ lang, bindings, onChange, onBack }) => {
  const [tc, setTc] = useState<TrackCount>(4);
  const [captureIdx, setCaptureIdx] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const current = bindings?.[tc] ?? KEY_MAP[tc];

  const setKey = (idx: number, key: string) => {
    const arr = bindings?.[tc] ? [...bindings[tc]!] : [...KEY_MAP[tc]];
    while (arr.length < tc) arr.push(''); // 补足长度
    const conflict = arr.findIndex((k, i) => i !== idx && k === key);
    if (conflict >= 0) {
      setMsg(lang === 'zh' ? `该键已分配给轨道 ${conflict + 1}` : `Key already used by track ${conflict + 1}`);
      return;
    }
    arr[idx] = key;
    setMsg('');
    onChange({ ...bindings, [tc]: arr });
  };

  // 等待按键捕获
  useEffect(() => {
    if (captureIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') { setCaptureIdx(null); return; }
      const mods = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Enter'];
      if (mods.includes(e.key)) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      setKey(captureIdx, k);
      setCaptureIdx(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureIdx, tc, bindings]);

  const reset = () => {
    setMsg('');
    setCaptureIdx(null);
    const next = { ...(bindings || {}) };
    delete next[tc];
    onChange(next);
  };

  return (
    <div className="screen settings-screen">
      <div className="settings-container">
        <SubHdr title={lang === 'zh' ? '键位设置' : 'Key Bindings'} onBack={onBack} lang={lang} />
        <div className="st-card">
          <div className="st-row st-row-noborder">
            <span className="st-label">{lang === 'zh' ? '轨道数' : 'Tracks'}</span>
            <div className="st-lang-toggle">
              {KEY_TRACK_COUNTS.map(n => (
                <button key={n} className={`st-lang-btn ${tc === n ? 'active' : ''}`} onClick={() => { setTc(n); setCaptureIdx(null); setMsg(''); }}>{n}K</button>
              ))}
            </div>
          </div>
        </div>
        <div className="st-card">
          {Array.from({ length: tc }, (_, i) => (
            <div key={i} className={`st-row ${i === tc - 1 ? 'st-row-noborder' : ''}`}>
              <span className="st-label">{lang === 'zh' ? '轨道' : 'Track'} {i + 1}</span>
              <button
                className={`st-key-box ${captureIdx === i ? 'capturing' : ''}`}
                onClick={() => setCaptureIdx(captureIdx === i ? null : i)}
              >
                {captureIdx === i
                  ? (lang === 'zh' ? '按下新键...' : 'Press a key...')
                  : current[i] || '?'}
              </button>
            </div>
          ))}
        </div>
        {msg && <p style={{ color: '#FF7878', fontSize: 11, marginTop: 8, textAlign: 'center' }}>{msg}</p>}
        <p style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.6, textAlign: 'center', marginTop: 6 }}>
          {lang === 'zh' ? '点击轨道按键框后按下新键即可修改；Esc 取消；2/4/6/8 轨道可独立设置' : 'Click a key box then press a new key; Esc cancels; 2/4/6/8 tracks are independent'}
        </p>
        <button className="st-action-btn st-sub-btn" onClick={reset}>{lang === 'zh' ? '恢复默认（当前轨道数）' : 'Reset (current)'}</button>
      </div>
    </div>
  );
};
