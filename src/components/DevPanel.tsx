import React, { useState, useCallback } from 'react';
import { Lang } from '@/utils/lang';
import { AppSettings } from '@/types';
import {
  DevOverrides, DEFAULT_OVERRIDES, loadDevOverrides, saveDevOverrides, resetDevOverrides,
} from '@/utils/devOverrides';

interface Props {
  lang: Lang;
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onBack: () => void;
}

const LBL = (zh: string, en: string, lang: Lang) => lang === 'zh' ? zh : en;

type Tab = 'judgment' | 'notes' | 'ui' | 'audio' | 'scoring' | 'generator' | 'system' | 'performance';

const TABS: { key: Tab; zh: string; en: string }[] = [
  { key: 'judgment', zh: '判定', en: 'Judgment' },
  { key: 'notes', zh: '音符', en: 'Notes' },
  { key: 'ui', zh: '界面', en: 'UI' },
  { key: 'audio', zh: '音频', en: 'Audio' },
  { key: 'scoring', zh: '计分', en: 'Scoring' },
  { key: 'generator', zh: '生成', en: 'Gen' },
  { key: 'system', zh: '系统', en: 'System' },
  { key: 'performance', zh: '性能', en: 'Perf' },
];

/* ──────────────── 输入控件 ──────────────── */
const defStr = (v: number | string | boolean) => typeof v === 'boolean' ? (v ? 'ON' : 'OFF') : typeof v === 'number' ? String(v) : v;

const NumInput: React.FC<{
  label: string; tip: string; value: number; defKey?: keyof DevOverrides; min?: number; max?: number; step?: number;
  onChange: (v: number) => void; lang: Lang;
}> = ({ label, tip, value, defKey, min, max, step = 1, onChange, lang }) => (
  <div className="dp-row">
    <span className="dp-label">{label}</span>
    <input type="number" className="dp-input" value={value} min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)} />
    {defKey && <span className="dp-def">{LBL('默认','Default',lang)}: {defStr(DEFAULT_OVERRIDES[defKey])}</span>}
    <span className="dp-tip">{tip}</span>
  </div>
);

const ColorInput: React.FC<{
  label: string; tip: string; value: string; defKey?: keyof DevOverrides; onChange: (v: string) => void; lang: Lang;
}> = ({ label, tip, value, defKey, onChange, lang }) => (
  <div className="dp-row dp-row-color">
    <span className="dp-label">{label}</span>
    <input type="color" className="dp-color" value={value}
      onChange={e => onChange(e.target.value)} />
    <code className="dp-color-val">{value}</code>
    {defKey && <span className="dp-def">{LBL('默认','Default',lang)}: {defStr(DEFAULT_OVERRIDES[defKey])}</span>}
    <span className="dp-tip">{tip}</span>
  </div>
);

const ToggleInput: React.FC<{
  label: string; tip: string; value: boolean; onChange: (v: boolean) => void; lang: Lang;
}> = ({ label, tip, value, onChange, lang }) => (
  <div className="dp-row dp-row-toggle">
    <span className="dp-label">{label}</span>
    <label className="dp-switch">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="dp-slider" />
    </label>
    <span className="dp-tip">{tip}</span>
  </div>
);

/* ──────────────── 主组件 ──────────────── */
export const DevPanel: React.FC<Props> = ({ lang, settings, onSave, onBack }) => {
  const [ov, setOv] = useState<DevOverrides>(loadDevOverrides);
  const [tab, setTab] = useState<Tab>('judgment');
  const [toast, setToast] = useState<string | null>(null);

  const set = useCallback(<K extends keyof DevOverrides>(k: K, v: DevOverrides[K]) => {
    setOv(s => {
      const next = { ...s, [k]: v };
      saveDevOverrides(next);
      return next;
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  /** 将 DevOverrides 中的相关参数同步到 AppSettings 并保存 */
  const handleSave = () => {
    const updatedSettings = {
      ...settings,
      latencyOffset: ov.a_latencyOffset,
      noteColor: ov.c_noteColor,
      holdNoteColor: ov.c_holdNoteColor,
      bgColor: ov.c_bgColor,
      judgeLineColor: ov.c_judgeLineColor,
    };
    onSave(updatedSettings);
    showToast(LBL('已保存并应用', 'Saved & Applied', lang));
  };

  const handleReset = () => {
    if (!confirm(LBL('确认重置所有开发者参数为默认值？此操作不可撤销。', 'Reset ALL dev parameters to defaults? This cannot be undone.', lang))) return;
    const def = resetDevOverrides();
    setOv(def);
  };

  const L = (zh: string, en: string) => LBL(zh, en, lang);

  /* ── Tab 内容渲染 ── */
  const renderTab = () => {
    const NT = (l: string, t: string, v: number, mi?: number, ma?: number, s?: number) =>
      <NumInput lang={lang} label={l} tip={t} value={v} min={mi} max={ma} step={s} onChange={x => set((('' as any) as keyof DevOverrides), x)} />;

    switch (tab) {
      /* ══════ 判定 ══════ */
      case 'judgment': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('判定窗口 (ms)', 'Timing Windows (ms)')}</h3>
        <p className="dp-sec-note">{L('判定窗口越小，判定越严格。', 'Smaller windows = stricter judgment.')}</p>
        <NumInput lang={lang} label="Perfect 窗口" tip={L('偏差≤此值 = Perfect', 'Offset ≤ this = Perfect')} defKey="j_timeB" value={ov.j_timeB} min={10} max={200} onChange={v => set('j_timeB', v)} />
        <NumInput lang={lang} label="Good 窗口" tip={L('偏差≤此值 = Good', 'Offset ≤ this = Good')} defKey="j_timeA" value={ov.j_timeA} min={20} max={400} onChange={v => set('j_timeA', v)} />
        <NumInput lang={lang} label="Bad 提前窗口" tip={L('提前超过此值 = Miss', 'Earlier than this = Miss')} defKey="j_timeC" value={ov.j_timeC} min={50} max={600} onChange={v => set('j_timeC', v)} />
        <NumInput lang={lang} label="提前按容差" tip={L('触发判定前的最小提前量(ms)', 'Min early tolerance before judgment')} defKey="j_earlyTolerance" value={ov.j_earlyTolerance} min={0} max={200} onChange={v => set('j_earlyTolerance', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('Hold 判定', 'Hold Judgment')}</h3>
        <NumInput lang={lang} label="松手合格比率" tip={L('按住≥总时长×比率=Perfect松手', 'Held ≥ duration×ratio = Perfect')} defKey="h_releaseRatio" value={ov.h_releaseRatio} min={0.3} max={1.0} step={0.01} onChange={v => set('h_releaseRatio', v)} />
        <NumInput lang={lang} label="Hold 最小长度 (ms)" tip={L('Hold 音符最短持续时长', 'Min hold note duration')} defKey="h_minLength" value={ov.h_minLength} min={20} max={500} onChange={v => set('h_minLength', v)} />
        <NumInput lang={lang} label="Hold 完成缓冲 (ms)" tip={L('完成后保留显示的缓冲', 'Buffer after hold completes')} defKey="h_completeBuffer" value={ov.h_completeBuffer} min={100} max={2000} onChange={v => set('h_completeBuffer', v)} />
        <NumInput lang={lang} label="Hold 松手宽恕 (ms)" tip={L('松手后此时间内再按回仍算按住', 'Re-press within this window keeps hold')} defKey="h_releaseForgiveness" value={ov.h_releaseForgiveness} min={0} max={200} onChange={v => set('h_releaseForgiveness', v)} />
      </div>);

      /* ══════ 音符 ══════ */
      case 'notes': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('物理参数', 'Physics')}</h3>
        <NumInput lang={lang} label="基准下落时长 (ms)" tip={L('音符从顶部→判定线的时间', 'Note fall time top→line')} defKey="p_fallDuration" value={ov.p_fallDuration} min={500} max={8000} onChange={v => set('p_fallDuration', v)} />
        <NumInput lang={lang} label="判定线 Y 偏移 (px)" tip={L('距屏幕底部的距离', 'Offset from screen bottom')} defKey="p_judgeLineOffset" value={ov.p_judgeLineOffset} min={20} max={300} onChange={v => set('p_judgeLineOffset', v)} />
        <NumInput lang={lang} label="游戏区顶部边距 (px)" tip={L('游戏区距顶部空白', 'Top margin of game area')} defKey="p_gameTopMargin" value={ov.p_gameTopMargin} min={40} max={300} onChange={v => set('p_gameTopMargin', v)} />
        <NumInput lang={lang} label="音符可见超前 (ms)" tip={L('提前显示音符的时间', 'How early notes appear')} defKey="p_noteLookahead" value={ov.p_noteLookahead} min={1000} max={30000} onChange={v => set('p_noteLookahead', v)} />
        <NumInput lang={lang} label="音符可见滞后 (ms)" tip={L('错过多久后隐藏', 'How long after miss to hide')} defKey="p_noteLookbehind" value={ov.p_noteLookbehind} min={500} max={30000} onChange={v => set('p_noteLookbehind', v)} />
        <NumInput lang={lang} label="音符顶部裁剪 (px)" tip={L('超过判定线后裁剪', 'Clip past judgment line')} defKey="p_noteClipTop" value={ov.p_noteClipTop} min={0} max={500} onChange={v => set('p_noteClipTop', v)} />
        <NumInput lang={lang} label="游戏结束提前量 (ms)" tip={L('提前结束避免等待', 'Early end to avoid waiting')} defKey="p_gameEndEarly" value={ov.p_gameEndEarly} min={0} max={3000} onChange={v => set('p_gameEndEarly', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('音符尺寸', 'Note Sizes')}</h3>
        <NumInput lang={lang} label="轨道最小宽 (px)" tip={L('单轨最小宽度', 'Min track width')} defKey="n_trackMinW" value={ov.n_trackMinW} min={30} max={200} onChange={v => set('n_trackMinW', v)} />
        <NumInput lang={lang} label="轨道最大宽 (px)" tip={L('单轨最大宽度', 'Max track width')} defKey="n_trackMaxW" value={ov.n_trackMaxW} min={50} max={400} onChange={v => set('n_trackMaxW', v)} />
        <NumInput lang={lang} label="游戏区水平边距 (px)" tip={L('两侧外边距', 'Horizontal margin')} defKey="n_hMargin" value={ov.n_hMargin} min={0} max={100} onChange={v => set('n_hMargin', v)} />
        <NumInput lang={lang} label="音符内部边距 (px)" tip={L('音符水平内边距', 'Note horizontal padding')} defKey="n_notePadX" value={ov.n_notePadX} min={0} max={30} onChange={v => set('n_notePadX', v)} />
        <NumInput lang={lang} label="Tap 圆角 (px)" tip={L('Tap 音符圆角半径', 'Tap border radius')} defKey="n_tapRadius" value={ov.n_tapRadius} min={0} max={20} onChange={v => set('n_tapRadius', v)} />
        <NumInput lang={lang} label="Tap 高度 (px)" tip={L('Tap 音符高度', 'Tap note height')} defKey="n_tapHeight" value={ov.n_tapHeight} min={8} max={60} onChange={v => set('n_tapHeight', v)} />
        <NumInput lang={lang} label="Hold 最小渲染高 (px)" tip={L('Hold 最小渲染高度', 'Min rendered hold height')} defKey="n_holdMinH" value={ov.n_holdMinH} min={10} max={80} onChange={v => set('n_holdMinH', v)} />
        <NumInput lang={lang} label="Hold 进度环半径 (px)" tip={L('底部进度环半径', 'Progress ring radius')} defKey="n_holdRingR" value={ov.n_holdRingR} min={6} max={30} onChange={v => set('n_holdRingR', v)} />
        <NumInput lang={lang} label="Hold 进度环描边 (px)" tip={L('进度环描边宽度', 'Ring stroke width')} defKey="n_holdRingW" value={ov.n_holdRingW} min={1} max={6} step={0.5} onChange={v => set('n_holdRingW', v)} />
        <ColorInput lang={lang} label="Hold 进度环颜色" tip={L('进度环颜色', 'Ring color')} defKey="n_holdRingColor" value={ov.n_holdRingColor} onChange={v => set('n_holdRingColor', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('判定线元素', 'Judgment Line Elements')}</h3>
        <NumInput lang={lang} label="判定线高度 (px)" tip={L('判定线厚度', 'Line thickness')} defKey="n_judgeLineH" value={ov.n_judgeLineH} min={1} max={10} onChange={v => set('n_judgeLineH', v)} />
        <NumInput lang={lang} label="判定线圆角 (px)" tip={L('判定线圆角', 'Line border radius')} defKey="n_judgeLineR" value={ov.n_judgeLineR} min={0} max={8} onChange={v => set('n_judgeLineR', v)} />
        <NumInput lang={lang} label="内圈边框 (px)" tip={L('Hit 内圈边框宽', 'Inner circle border')} defKey="n_circleInnerW" value={ov.n_circleInnerW} min={1} max={8} onChange={v => set('n_circleInnerW', v)} />
        <NumInput lang={lang} label="外圈边框 (px)" tip={L('Hit 外圈边框宽', 'Outer circle border')} defKey="n_circleOuterW" value={ov.n_circleOuterW} min={0.5} max={5} step={0.5} onChange={v => set('n_circleOuterW', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('颜色系统', 'Color System')}</h3>
        <ColorInput lang={lang} label="默认音符颜色" tip={L('Tap/Flick 默认色', 'Default tap color')} defKey="c_noteColor" value={ov.c_noteColor} onChange={v => set('c_noteColor', v)} />
        <ColorInput lang={lang} label="Hold 音符颜色" tip={L('Hold 默认色', 'Default hold color')} defKey="c_holdNoteColor" value={ov.c_holdNoteColor} onChange={v => set('c_holdNoteColor', v)} />
        <ColorInput lang={lang} label="游戏背景色" tip={L('主背景色', 'Main background')} defKey="c_bgColor" value={ov.c_bgColor} onChange={v => set('c_bgColor', v)} />
        <ColorInput lang={lang} label="判定线颜色" tip={L('判定线颜色', 'Judgment line color')} defKey="c_judgeLineColor" value={ov.c_judgeLineColor} onChange={v => set('c_judgeLineColor', v)} />
        <ColorInput lang={lang} label="Perfect 色" tip={L('Perfect 判定色', 'Perfect color')} defKey="c_perfectColor" value={ov.c_perfectColor} onChange={v => set('c_perfectColor', v)} />
        <ColorInput lang={lang} label="V / FC 色" tip={L('全连颜色', 'Full combo color')} defKey="c_volor" value={ov.c_volor} onChange={v => set('c_volor', v)} />
        <ColorInput lang={lang} label="S 评级色" tip={L('S 评级颜色', 'S rank color')} defKey="c_sColor" value={ov.c_sColor} onChange={v => set('c_sColor', v)} />
        <ColorInput lang={lang} label="A 评级色" tip={L('A 评级颜色', 'A rank color')} defKey="c_aColor" value={ov.c_aColor} onChange={v => set('c_aColor', v)} />
        <ColorInput lang={lang} label="B 评级色" tip={L('B 评级颜色', 'B rank color')} defKey="c_bColor" value={ov.c_bColor} onChange={v => set('c_bColor', v)} />
        <ColorInput lang={lang} label="C 评级色" tip={L('C 评级颜色', 'C rank color')} defKey="c_cColor" value={ov.c_cColor} onChange={v => set('c_cColor', v)} />
        <ColorInput lang={lang} label="EZ 难度色" tip={L('EZ 标签颜色', 'EZ color')} defKey="c_ezColor" value={ov.c_ezColor} onChange={v => set('c_ezColor', v)} />
        <ColorInput lang={lang} label="NM 难度色" tip={L('NM 标签颜色', 'NM color')} defKey="c_nmColor" value={ov.c_nmColor} onChange={v => set('c_nmColor', v)} />
        <ColorInput lang={lang} label="HD 难度色" tip={L('HD 标签颜色', 'HD color')} defKey="c_hdColor" value={ov.c_hdColor} onChange={v => set('c_hdColor', v)} />
        <ColorInput lang={lang} label="IN 难度色" tip={L('IN 标签颜色', 'IN color')} defKey="c_inColor" value={ov.c_inColor} onChange={v => set('c_inColor', v)} />
        <ColorInput lang={lang} label="AT 难度色" tip={L('AT 标签颜色', 'AT color')} defKey="c_atColor" value={ov.c_atColor} onChange={v => set('c_atColor', v)} />
      </div>);

      /* ══════ UI ══════ */
      case 'ui': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('Combo / Score 显示', 'Combo / Score Display')}</h3>
        <NumInput lang={lang} label="Combo 字号 (px)" tip={L('Combo 显示大小', 'Combo font size')} defKey="e_comboFontSize" value={ov.e_comboFontSize} min={12} max={64} onChange={v => set('e_comboFontSize', v)} />
        <NumInput lang={lang} label="Score 字号 (px)" tip={L('分数显示大小', 'Score font size')} defKey="e_scoreFontSize" value={ov.e_scoreFontSize} min={10} max={48} onChange={v => set('e_scoreFontSize', v)} />
        <NumInput lang={lang} label="Combo K 格式门槛" tip={L('超过此值 → x.xk', 'Threshold for k-format')} defKey="u_comboKFormat" value={ov.u_comboKFormat} min={100} max={1000000} onChange={v => set('u_comboKFormat', v)} />
        <NumInput lang={lang} label="Score K 格式门槛" tip={L('超过此值 → K 格式', 'Threshold for k-format')} defKey="u_scoreKFormat" value={ov.u_scoreKFormat} min={1000} max={10000000} onChange={v => set('u_scoreKFormat', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('音符特效', 'Note Effects')}</h3>
        <NumInput lang={lang} label="双押发光扩散 (px)" tip={L('双押发光外扩大小', 'Double glow spread')} defKey="e_doubleGlowSize" value={ov.e_doubleGlowSize} min={0} max={60} onChange={v => set('e_doubleGlowSize', v)} />
        <NumInput lang={lang} label="双押发光强度" tip={L('双押发光 alpha', 'Double glow alpha')} defKey="e_doubleGlowAlpha" value={ov.e_doubleGlowAlpha} min={0} max={1} step={0.05} onChange={v => set('e_doubleGlowAlpha', v)} />
        <ColorInput lang={lang} label="双押发光颜色" tip={L('双押发光颜色', 'Double glow color')} defKey="e_doubleGlowColor" value={ov.e_doubleGlowColor} onChange={v => set('e_doubleGlowColor', v)} />
        <NumInput lang={lang} label="打击特效初始大小 (px)" tip={L('按键特效初始扩散', 'Initial tap effect size')} defKey="e_tapEffInitial" value={ov.e_tapEffInitial} min={4} max={40} onChange={v => set('e_tapEffInitial', v)} />
        <NumInput lang={lang} label="打击特效最大扩散 (px)" tip={L('按键特效最大扩散', 'Max tap spread')} defKey="e_tapEffSpread" value={ov.e_tapEffSpread} min={20} max={200} onChange={v => set('e_tapEffSpread', v)} />
        <NumInput lang={lang} label="打击特效衰减速度" tip={L('透明度衰减系数', 'Opacity fade coeff')} defKey="e_tapEffFade" value={ov.e_tapEffFade} min={0.2} max={3} step={0.1} onChange={v => set('e_tapEffFade', v)} />
        <NumInput lang={lang} label="外圈特效初始 (px)" tip={L('外圈初始大小', 'Initial ring size')} defKey="e_ringEffInitial" value={ov.e_ringEffInitial} min={8} max={60} onChange={v => set('e_ringEffInitial', v)} />
        <NumInput lang={lang} label="外圈特效最大扩散 (px)" tip={L('外圈最大扩散', 'Max ring spread')} defKey="e_ringEffSpread" value={ov.e_ringEffSpread} min={30} max={300} onChange={v => set('e_ringEffSpread', v)} />
        <NumInput lang={lang} label="外圈特效衰减速度" tip={L('外圈透明度衰减', 'Ring opacity fade')} defKey="e_ringEffFade" value={ov.e_ringEffFade} min={0.2} max={2} step={0.05} onChange={v => set('e_ringEffFade', v)} />
        <NumInput lang={lang} label="特效清理间隔 (ms)" tip={L('定时器清理间隔', 'Effect cleanup interval')} defKey="e_effCleanInterval" value={ov.e_effCleanInterval} min={50} max={500} onChange={v => set('e_effCleanInterval', v)} />
        <NumInput lang={lang} label="特效最大寿命 (ms)" tip={L('特效存活最大时长', 'Max effect lifetime')} defKey="e_effMaxAge" value={ov.e_effMaxAge} min={200} max={2000} onChange={v => set('e_effMaxAge', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('动画时长', 'Animation Durations')}</h3>
        <NumInput lang={lang} label="音符淡入 (s)" tip={L('出现淡入时长', 'Fade-in duration')} defKey="e_noteFadeIn" value={ov.e_noteFadeIn} min={0} max={1} step={0.05} onChange={v => set('e_noteFadeIn', v)} />
        <NumInput lang={lang} label="音符淡出 (s)" tip={L('Bad/Miss 淡出', 'Fade-out duration')} defKey="e_noteFadeOut" value={ov.e_noteFadeOut} min={0} max={1.5} step={0.05} onChange={v => set('e_noteFadeOut', v)} />
        <NumInput lang={lang} label="Hold 脉冲 (s)" tip={L('Hold 脉冲动画', 'Hold pulse animation')} defKey="e_holdPulse" value={ov.e_holdPulse} min={0.1} max={1} step={0.05} onChange={v => set('e_holdPulse', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('暂停面板', 'Pause Panel')}</h3>
        <NumInput lang={lang} label="暂停双击窗口 (ms)" tip={L('双击暂停检测', 'Double-tap window')} defKey="u_pauseDblWindow" value={ov.u_pauseDblWindow} min={200} max={1000} onChange={v => set('u_pauseDblWindow', v)} />
        <NumInput lang={lang} label="暂停倒计时 (s)" tip={L('确认倒计时秒数', 'Countdown seconds')} defKey="u_pauseCountdown" value={ov.u_pauseCountdown} min={1} max={10} onChange={v => set('u_pauseCountdown', v)} />
        <NumInput lang={lang} label="倒计时间隔 (ms)" tip={L('减一间隔', 'Countdown tick')} defKey="u_pauseCountInterval" value={ov.u_pauseCountInterval} min={500} max={2000} onChange={v => set('u_pauseCountInterval', v)} />
        <NumInput lang={lang} label="面板最大宽 (px)" tip={L('暂停面板宽度', 'Panel max width')} defKey="u_pauseMaxW" value={ov.u_pauseMaxW} min={180} max={500} onChange={v => set('u_pauseMaxW', v)} />
        <NumInput lang={lang} label="面板最小高 (px)" tip={L('暂停面板高度', 'Panel min height')} defKey="u_pauseMinH" value={ov.u_pauseMinH} min={100} max={400} onChange={v => set('u_pauseMinH', v)} />
        <NumInput lang={lang} label="标题字号 (px)" tip={L('暂停标题大小', 'Title font size')} defKey="u_pauseTitleFont" value={ov.u_pauseTitleFont} min={16} max={56} onChange={v => set('u_pauseTitleFont', v)} />
        <NumInput lang={lang} label="倒计时字号 (px)" tip={L('倒计时大小', 'Countdown font size')} defKey="u_pauseCountFont" value={ov.u_pauseCountFont} min={48} max={144} onChange={v => set('u_pauseCountFont', v)} />
        <NumInput lang={lang} label="按钮宽度 (px)" tip={L('暂停按钮宽度', 'Button width')} defKey="u_pauseBtnW" value={ov.u_pauseBtnW} min={120} max={400} onChange={v => set('u_pauseBtnW', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('游戏布局', 'Game Layout')}</h3>
        <NumInput lang={lang} label="游戏区上边距 (px)" tip={L('CSS margin-top', 'CSS margin-top')} defKey="u_gameTopCss" value={ov.u_gameTopCss} min={0} max={120} onChange={v => set('u_gameTopCss', v)} />
        <NumInput lang={lang} label="进度条高度 (px)" tip={L('进度条厚度', 'Progress bar height')} defKey="u_progressH" value={ov.u_progressH} min={1} max={10} onChange={v => set('u_progressH', v)} />
        <NumInput lang={lang} label="游戏开始延迟 (ms)" tip={L('倒计时→开始延迟', 'Countdown→start delay')} defKey="u_gameStartDelay" value={ov.u_gameStartDelay} min={500} max={5000} onChange={v => set('u_gameStartDelay', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('背景效果', 'Background Effects')}</h3>
        <NumInput lang={lang} label="背景模糊 (px)" tip={L('封面高斯模糊', 'Cover blur amount')} defKey="u_bgBlur" value={ov.u_bgBlur} min={0} max={100} onChange={v => set('u_bgBlur', v)} />
        <NumInput lang={lang} label="背景亮度" tip={L('封面亮度系数', 'Cover brightness')} defKey="u_bgBrightness" value={ov.u_bgBrightness} min={0} max={1} step={0.05} onChange={v => set('u_bgBrightness', v)} />
        <NumInput lang={lang} label="背景缩放" tip={L('封面缩放比例', 'Cover scale')} defKey="u_bgScale" value={ov.u_bgScale} min={1} max={2} step={0.05} onChange={v => set('u_bgScale', v)} />
      </div>);

      /* ══════ 音频 ══════ */
      case 'audio': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('打击音效', 'Hit Sound')}</h3>
        <NumInput lang={lang} label="打击音最大增益" tip={L('hitVolume 增益上限', 'Gain ceiling')} defKey="a_hitGainMax" value={ov.a_hitGainMax} min={1} max={20} step={0.5} onChange={v => set('a_hitGainMax', v)} />
        <NumInput lang={lang} label="打击音增益倍率" tip={L('hitVolume 乘数', 'Gain multiplier')} defKey="a_hitGainMul" value={ov.a_hitGainMul} min={1} max={20} onChange={v => set('a_hitGainMul', v)} />
        <NumInput lang={lang} label="音频延迟偏移 (ms)" tip={L('正值=提前播放', 'Pos=earlier audio')} defKey="a_latencyOffset" value={ov.a_latencyOffset} min={-200} max={500} onChange={v => set('a_latencyOffset', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('音频可视化', 'Audio Visualization')}</h3>
        <NumInput lang={lang} label="FFT 大小" tip={L('Analyser FFT (2的幂)', 'FFT size')} defKey="a_fftSize" value={ov.a_fftSize} min={64} max={2048} step={64} onChange={v => set('a_fftSize', v)} />
        <NumInput lang={lang} label="频谱平滑" tip={L('smoothingTimeConstant', 'Smoothing')} defKey="a_smoothing" value={ov.a_smoothing} min={0} max={1} step={0.05} onChange={v => set('a_smoothing', v)} />
        <NumInput lang={lang} label="频谱柱数" tip={L('可视化柱数量', 'Bar count')} defKey="a_vizBars" value={ov.a_vizBars} min={10} max={128} onChange={v => set('a_vizBars', v)} />
        <NumInput lang={lang} label="频谱高度系数" tip={L('柱高乘数', 'Height multiplier')} defKey="a_vizHeightMul" value={ov.a_vizHeightMul} min={0.1} max={2} step={0.05} onChange={v => set('a_vizHeightMul', v)} />
        <NumInput lang={lang} label="频谱透明度下限" tip={L('最暗柱 alpha', 'Dimmest bar alpha')} defKey="a_vizAlphaMin" value={ov.a_vizAlphaMin} min={0} max={0.3} step={0.005} onChange={v => set('a_vizAlphaMin', v)} />
        <NumInput lang={lang} label="频谱透明度上限" tip={L('最亮柱 alpha', 'Brightest bar alpha')} defKey="a_vizAlphaMax" value={ov.a_vizAlphaMax} min={0.05} max={0.5} step={0.005} onChange={v => set('a_vizAlphaMax', v)} />
      </div>);

      /* ══════ 计分 ══════ */
      case 'scoring': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('计分公式', 'Scoring Formula')}</h3>
        <p className="dp-sec-note">{L('调整评分配方——游戏核心体验。改动可能导致排行榜不公平。', 'Core experience. Changes may make leaderboards unfair.')}</p>
        <NumInput lang={lang} label="满分" tip={L('最高可得分数', 'Max score')} defKey="s_maxScore" value={ov.s_maxScore} min={10000} max={10000000} onChange={v => set('s_maxScore', v)} />
        <NumInput lang={lang} label="Perfect 得分倍率" tip={L('Perfect 得分系数', 'Perfect multiplier')} defKey="s_perfectRatio" value={ov.s_perfectRatio} min={0} max={2} step={0.05} onChange={v => set('s_perfectRatio', v)} />
        <NumInput lang={lang} label="Good 得分倍率" tip={L('Good/Perfect 比例', 'Good score ratio')} defKey="s_goodRatio" value={ov.s_goodRatio} min={0} max={1} step={0.05} onChange={v => set('s_goodRatio', v)} />
        <NumInput lang={lang} label="Good ACC 权重" tip={L('ACC=(P×1+G×权重)/N', 'ACC Good weight')} defKey="s_accGoodWeight" value={ov.s_accGoodWeight} min={0} max={1} step={0.01} onChange={v => set('s_accGoodWeight', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('RKS 系统', 'RKS System')}</h3>
        <NumInput lang={lang} label="RKS ACC 门槛" tip={L('ACC低于此值 RKS=0', 'ACC floor for RKS')} defKey="s_rksAccFloor" value={ov.s_rksAccFloor} min={0} max={1} step={0.01} onChange={v => set('s_rksAccFloor', v)} />
        <NumInput lang={lang} label="RKS 偏移常数" tip={L('RKS 公式偏移', 'RKS offset')} defKey="s_rksOffset" value={ov.s_rksOffset} min={0} max={100} onChange={v => set('s_rksOffset', v)} />
        <NumInput lang={lang} label="RKS 除数常数" tip={L('RKS 公式除数', 'RKS divisor')} defKey="s_rksDivisor" value={ov.s_rksDivisor} min={1} max={100} onChange={v => set('s_rksDivisor', v)} />
        <NumInput lang={lang} label="RKS Top N" tip={L('取前N首计算', 'Top N charts')} defKey="s_rksTopN" value={ov.s_rksTopN} min={5} max={50} onChange={v => set('s_rksTopN', v)} />
        <NumInput lang={lang} label="RKS 显示门槛" tip={L('不足此记录=显示--', 'Min records for display')} defKey="s_rksMinRecords" value={ov.s_rksMinRecords} min={1} max={50} onChange={v => set('s_rksMinRecords', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('评级门槛', 'Rating Thresholds')}</h3>
        <NumInput lang={lang} label="S 评级分数" tip={L('达到此分 = S', 'Score for S')} defKey="s_rankS" value={ov.s_rankS} min={1000} max={10000000} onChange={v => set('s_rankS', v)} />
        <NumInput lang={lang} label="A 评级分数" tip={L('达到此分 = A', 'Score for A')} defKey="s_rankA" value={ov.s_rankA} min={1000} max={10000000} onChange={v => set('s_rankA', v)} />
        <NumInput lang={lang} label="B 评级分数" tip={L('达到此分 = B', 'Score for B')} defKey="s_rankB" value={ov.s_rankB} min={1000} max={10000000} onChange={v => set('s_rankB', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('难度分界', 'Difficulty Boundaries')}</h3>
        <NumInput lang={lang} label="EZ 上限" tip={L('定数<此值= EZ', 'Constant < this = EZ')} defKey="d_ezMax" value={ov.d_ezMax} min={1} max={20} step={0.5} onChange={v => set('d_ezMax', v)} />
        <NumInput lang={lang} label="NM 上限" tip={L('定数<此值= NM', 'Constant < this = NM')} defKey="d_nmMax" value={ov.d_nmMax} min={1} max={20} step={0.5} onChange={v => set('d_nmMax', v)} />
        <NumInput lang={lang} label="HD 上限" tip={L('定数<此值= HD', 'Constant < this = HD')} defKey="d_hdMax" value={ov.d_hdMax} min={1} max={20} step={0.5} onChange={v => set('d_hdMax', v)} />
        <NumInput lang={lang} label="IN 上限" tip={L('定数≥此值= AT', 'Constant >= this = AT')} defKey="d_inMax" value={ov.d_inMax} min={1} max={20} step={0.5} onChange={v => set('d_inMax', v)} />
      </div>);

      /* ══════ 生成 ══════ */
      case 'generator': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('谱面生成 - 概率公式', 'Chart Gen - Probability')}</h3>
        <p className="dp-sec-note">{L('t=(定数-offset)/分母。控制自动谱面难度。', 't=(constant-offset)/divisor. Controls auto chart difficulty.')}</p>
        <NumInput lang={lang} label="难度归一化分母" tip={L('t=(常数-offset)/分母', 'Normalization divisor')} defKey="g_diffNorm" value={ov.g_diffNorm} min={1} max={30} step={0.5} onChange={v => set('g_diffNorm', v)} />
        <NumInput lang={lang} label="难度归一化偏移" tip={L('t 公式偏移', 'Normalization offset')} defKey="g_diffOffset" value={ov.g_diffOffset} min={0} max={5} step={0.1} onChange={v => set('g_diffOffset', v)} />

        <h4 className="dp-sub-title">Note Probability</h4>
        <NumInput lang={lang} label="noteProb 基础值" tip={L('noteProb=base+t×coeff+t³×coeff3', '')} defKey="g_noteProbBase" value={ov.g_noteProbBase} min={0} max={1} step={0.01} onChange={v => set('g_noteProbBase', v)} />
        <NumInput lang={lang} label="noteProb t 系数" tip="" defKey="g_noteProbT" value={ov.g_noteProbT} min={0} max={1} step={0.01} onChange={v => set('g_noteProbT', v)} />
        <NumInput lang={lang} label="noteProb t³ 系数" tip="" defKey="g_noteProbT3" value={ov.g_noteProbT3} min={0} max={1} step={0.01} onChange={v => set('g_noteProbT3', v)} />

        <h4 className="dp-sub-title">Hold Probability</h4>
        <NumInput lang={lang} label="holdProb 基础值" tip="" defKey="g_holdProbBase" value={ov.g_holdProbBase} min={0} max={0.5} step={0.005} onChange={v => set('g_holdProbBase', v)} />
        <NumInput lang={lang} label="holdProb t 系数" tip="" defKey="g_holdProbT" value={ov.g_holdProbT} min={0} max={0.5} step={0.01} onChange={v => set('g_holdProbT', v)} />
        <NumInput lang={lang} label="holdProb t³ 系数" tip="" defKey="g_holdProbT3" value={ov.g_holdProbT3} min={0} max={0.5} step={0.01} onChange={v => set('g_holdProbT3', v)} />

        <h4 className="dp-sub-title">Double Probability</h4>
        <NumInput lang={lang} label="doubleProb 基础值" tip="" defKey="g_doubleProbBase" value={ov.g_doubleProbBase} min={0} max={0.3} step={0.005} onChange={v => set('g_doubleProbBase', v)} />
        <NumInput lang={lang} label="doubleProb t 系数" tip="" defKey="g_doubleProbT" value={ov.g_doubleProbT} min={0} max={0.5} step={0.01} onChange={v => set('g_doubleProbT', v)} />
        <NumInput lang={lang} label="doubleProb t³ 系数" tip="" defKey="g_doubleProbT3" value={ov.g_doubleProbT3} min={0} max={0.5} step={0.01} onChange={v => set('g_doubleProbT3', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('间距与节拍', 'Spacing & Beat')}</h3>
        <NumInput lang={lang} label="minSpacing 基础 (ms)" tip={L('minSpacing=base-t×coeff', '')} defKey="g_minSpacingBase" value={ov.g_minSpacingBase} min={100} max={2000} onChange={v => set('g_minSpacingBase', v)} />
        <NumInput lang={lang} label="minSpacing t 系数" tip="" defKey="g_minSpacingT" value={ov.g_minSpacingT} min={0} max={1000} onChange={v => set('g_minSpacingT', v)} />
        <NumInput lang={lang} label="强拍概率倍率" tip={L('强拍×此倍率', 'Strong beat × mult')} defKey="g_strongBeatMul" value={ov.g_strongBeatMul} min={1} max={5} step={0.1} onChange={v => set('g_strongBeatMul', v)} />
        <NumInput lang={lang} label="半拍概率倍率" tip={L('半拍×此倍率', 'Half beat × mult')} defKey="g_halfBeatMul" value={ov.g_halfBeatMul} min={1} max={5} step={0.1} onChange={v => set('g_halfBeatMul', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('特殊模式', 'Special Patterns')}</h3>
        <NumInput lang={lang} label="四押概率" tip={L('每拍四押概率', 'Quad probability')} defKey="g_quadProb" value={ov.g_quadProb} min={0} max={0.05} step={0.001} onChange={v => set('g_quadProb', v)} />
        <NumInput lang={lang} label="Hold 时长倍率" tip={L('Hold长=beat间隔×倍率', 'Hold length multiplier')} defKey="g_holdLenMul" value={ov.g_holdLenMul} min={0.5} max={6} step={0.5} onChange={v => set('g_holdLenMul', v)} />
        <NumInput lang={lang} label="台阶最短长度" tip={L('台阶最少连续 note', 'Min stair length')} defKey="g_stairMinLen" value={ov.g_stairMinLen} min={2} max={8} onChange={v => set('g_stairMinLen', v)} />
        <NumInput lang={lang} label="交互轨重置概率" tip={L('改变交互方向概率', 'Trill reset prob')} defKey="g_trillResetProb" value={ov.g_trillResetProb} min={0} max={1} step={0.05} onChange={v => set('g_trillResetProb', v)} />
        <NumInput lang={lang} label="叠键间距系数" tip={L('叠键=minSpacing×系数', 'Jack spacing mult')} defKey="g_jackSpacingMul" value={ov.g_jackSpacingMul} min={0.1} max={1} step={0.05} onChange={v => set('g_jackSpacingMul', v)} />
        <NumInput lang={lang} label="叠键绝对最小间距 (ms)" tip={L('不管系数最低不低于', 'Absolute min jack')} defKey="g_jackSpacingMin" value={ov.g_jackSpacingMin} min={50} max={500} onChange={v => set('g_jackSpacingMin', v)} />
      </div>);

      /* ══════ 系统 ══════ */
      case 'system': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('导航动画', 'Navigation Animation')}</h3>
        <NumInput lang={lang} label="导航动画时长 (ms)" tip={L('页面切换过渡', 'Page transition')} defKey="x_navAnimMs" value={ov.x_navAnimMs} min={100} max={1500} onChange={v => set('x_navAnimMs', v)} />
        <NumInput lang={lang} label="层级缩放系数" tip={L('scale(1-depth×系数)', 'Per-layer scale')} defKey="x_stackScale" value={ov.x_stackScale} min={0.01} max={0.2} step={0.01} onChange={v => set('x_stackScale', v)} />
        <NumInput lang={lang} label="层级位移系数 (%)" tip={L('translateX(depth×系数%)', 'Per-layer shift')} defKey="x_stackShift" value={ov.x_stackShift} min={5} max={40} onChange={v => set('x_stackShift', v)} />
        <NumInput lang={lang} label="层级透明度衰减" tip={L('opacity(1-depth×系数)', 'Per-layer opacity')} defKey="x_stackOpacity" value={ov.x_stackOpacity} min={0.05} max={0.5} step={0.01} onChange={v => set('x_stackOpacity', v)} />
        <NumInput lang={lang} label="层级模糊系数 (px)" tip={L('blur(depth×系数)', 'Per-layer blur')} defKey="x_stackBlur" value={ov.x_stackBlur} min={5} max={50} onChange={v => set('x_stackBlur', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('加载屏幕', 'Loading Screen')}</h3>
        <NumInput lang={lang} label="刷新间隔 (ms)" tip={L('进度条更新间隔', 'Update interval')} defKey="l_tickInterval" value={ov.l_tickInterval} min={20} max={200} onChange={v => set('l_tickInterval', v)} />
        <NumInput lang={lang} label="Ease-out 指数" tip={L('1-pow(1-raw,exp)', 'Ease-out exp')} defKey="l_easeOutExp" value={ov.l_easeOutExp} min={1} max={5} step={0.1} onChange={v => set('l_easeOutExp', v)} />
        <NumInput lang={lang} label="Ease-in 指数" tip={L('pow(raw,exp)', 'Ease-in exp')} defKey="l_easeInExp" value={ov.l_easeInExp} min={1} max={5} step={0.1} onChange={v => set('l_easeInExp', v)} />
        <NumInput lang={lang} label="完成后延迟 (ms)" tip={L('100%后延迟', 'Post-100% delay')} defKey="l_completeDelay" value={ov.l_completeDelay} min={0} max={1000} onChange={v => set('l_completeDelay', v)} />
        <NumInput lang={lang} label="阶段数" tip={L('加载阶段数量', 'Stage count')} defKey="l_stageCount" value={ov.l_stageCount} min={2} max={8} onChange={v => set('l_stageCount', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('音频分析', 'Audio Analysis')}</h3>
        <NumInput lang={lang} label="BPM 下限" tip={L('自动检测下限', 'BPM lower bound')} defKey="aa_bpmMin" value={ov.aa_bpmMin} min={20} max={120} onChange={v => set('aa_bpmMin', v)} />
        <NumInput lang={lang} label="BPM 上限" tip={L('自动检测上限', 'BPM upper bound')} defKey="aa_bpmMax" value={ov.aa_bpmMax} min={100} max={400} onChange={v => set('aa_bpmMax', v)} />
        <NumInput lang={lang} label="缓冲区大小" tip={L('Meyda bufferSize', 'Buffer size')} defKey="aa_bufferSize" value={ov.aa_bufferSize} min={512} max={8192} step={256} onChange={v => set('aa_bufferSize', v)} />
        <NumInput lang={lang} label="前奏检测帧数" tip={L('前期帧数', 'Intro frames')} defKey="aa_introFrames" value={ov.aa_introFrames} min={10} max={200} onChange={v => set('aa_introFrames', v)} />
        <NumInput lang={lang} label="前奏能量比门槛" tip={L('introAvg<globalMax×ratio', 'Intro energy ratio')} defKey="aa_introEnergyRatio" value={ov.aa_introEnergyRatio} min={0.05} max={0.5} step={0.01} onChange={v => set('aa_introEnergyRatio', v)} />
        <NumInput lang={lang} label="前奏结束门槛" tip={L('能量超此值结束', 'Intro end threshold')} defKey="aa_introEndThresh" value={ov.aa_introEndThresh} min={0.05} max={0.5} step={0.01} onChange={v => set('aa_introEndThresh', v)} />
        <NumInput lang={lang} label="节拍网格窗口 (ms)" tip={L('onsets 匹配容差', 'Grid tolerance')} defKey="aa_gridWindow" value={ov.aa_gridWindow} min={10} max={80} onChange={v => set('aa_gridWindow', v)} />
        <NumInput lang={lang} label="节拍间距下限倍率" tip={L('t-lastOnset≥beatMs×倍率', 'Beat spacing min')} defKey="aa_beatSpacingMin" value={ov.aa_beatSpacingMin} min={0.1} max={1} step={0.05} onChange={v => set('aa_beatSpacingMin', v)} />
        <NumInput lang={lang} label="正常阈值倍率" tip={L('avg×倍率=正常阈值', 'Normal threshold')} defKey="aa_threshNormal" value={ov.aa_threshNormal} min={1} max={5} step={0.1} onChange={v => set('aa_threshNormal', v)} />
        <NumInput lang={lang} label="前奏阈值倍率" tip={L('avg×倍率=前奏阈值', 'Intro threshold')} defKey="aa_threshIntro" value={ov.aa_threshIntro} min={1} max={8} step={0.1} onChange={v => set('aa_threshIntro', v)} />
        <NumInput lang={lang} label="局部平均帧数" tip={L('计算local avg帧数', 'Local avg frames')} defKey="aa_localFrames" value={ov.aa_localFrames} min={2} max={20} onChange={v => set('aa_localFrames', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('杂项', 'Miscellaneous')}</h3>
        <ToggleInput lang={lang} label={L('无敌娱乐模式', 'Invincible Fun Mode')} tip={L('全部 Perfect，不计分不存档', 'All Perfect, no scoring/saving')} value={ov.invincibleMode} onChange={v => set('invincibleMode', v)} />
        <NumInput lang={lang} label="Dev 连击次数" tip={L('开启Dev模式连击数', 'Clicks for dev mode')} defKey="devClicks" value={ov.devClicks} min={1} max={20} onChange={v => set('devClicks', v)} />
        <NumInput lang={lang} label="试玩后延迟 (ms)" tip={L('试玩→主菜单延迟', 'Trial→menu delay')} defKey="trialDelay" value={ov.trialDelay} min={500} max={5000} onChange={v => set('trialDelay', v)} />
        <NumInput lang={lang} label="结算后延迟 (ms)" tip={L('结算→主菜单延迟', 'Results→menu delay')} defKey="resultDelay" value={ov.resultDelay} min={500} max={5000} onChange={v => set('resultDelay', v)} />
        <NumInput lang={lang} label="试玩最长时长 (ms)" tip={L('试玩最大时长', 'Max trial duration')} defKey="trialMaxDuration" value={ov.trialMaxDuration} min={30000} max={600000} onChange={v => set('trialMaxDuration', v)} />
        <NumInput lang={lang} label="默认无歌曲时长 (ms)" tip={L('无歌曲后备时长', 'Fallback duration')} defKey="defaultDuration" value={ov.defaultDuration} min={30000} max={600000} onChange={v => set('defaultDuration', v)} />
        <NumInput lang={lang} label="EULA 滚动阈值 (px)" tip={L('距底部可接受', 'Scroll threshold')} defKey="eulaScrollThreshold" value={ov.eulaScrollThreshold} min={10} max={100} onChange={v => set('eulaScrollThreshold', v)} />
        <NumInput lang={lang} label="昵称最大长度" tip={L('档案昵称上限', 'Name max length')} defKey="profileNameMaxLen" value={ov.profileNameMaxLen} min={4} max={32} onChange={v => set('profileNameMaxLen', v)} />
        <NumInput lang={lang} label="头像尺寸 (px)" tip={L('档案头像大小', 'Avatar size')} defKey="avatarSize" value={ov.avatarSize} min={64} max={256} onChange={v => set('avatarSize', v)} />
        <NumInput lang={lang} label="保存提示时长 (ms)" tip={L('Toast提示时长', 'Save toast duration')} defKey="saveToastMs" value={ov.saveToastMs} min={500} max={5000} onChange={v => set('saveToastMs', v)} />
        <NumInput lang={lang} label="状态更新节流 (帧)" tip={L('每N帧更新React状态', 'State update throttle')} defKey="stateThrottleFrames" value={ov.stateThrottleFrames} min={1} max={10} onChange={v => set('stateThrottleFrames', v)} />
      </div>);

      /* ══════ 性能 ══════ */
      case 'performance': return (<div className="dp-section">
        <h3 className="dp-sec-title">{L('帧率控制', 'Frame Rate Control')}</h3>
        <NumInput lang={lang} label={L('目标帧率', 'Target FPS')} tip={L('0=不限制, 60/120/144', '0=unlimited, 60/120/144')} defKey="perf_targetFPS" value={ov.perf_targetFPS} min={0} max={240} step={10} onChange={v => set('perf_targetFPS', v)} />
        <NumInput lang={lang} label={L('强制跳帧数', 'Force Skip Frames')} tip={L('每N帧才渲染一次, 0=每帧渲染', 'Render every Nth frame, 0=every frame')} defKey="perf_skipFrames" value={ov.perf_skipFrames} min={0} max={10} onChange={v => set('perf_skipFrames', v)} />
        <NumInput lang={lang} label={L('Canvas 像素比', 'Canvas DPR')} tip={L('1=低(模糊但快), 2=高(清晰但慢)', '1=low(blurry but fast), 2=high(sharp but slow)')} defKey="perf_canvasDPR" value={ov.perf_canvasDPR} min={1} max={3} step={0.5} onChange={v => set('perf_canvasDPR', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('渲染数量限制', 'Render Count Limits')}</h3>
        <NumInput lang={lang} label={L('最大同屏音符', 'Max Visible Notes')} tip={L('同屏超过此数不再渲染新音符', 'Stop rendering new notes beyond this count')} defKey="perf_maxVisibleNotes" value={ov.perf_maxVisibleNotes} min={20} max={500} onChange={v => set('perf_maxVisibleNotes', v)} />
        <NumInput lang={lang} label={L('音符渲染窗口 (ms)', 'Note Render Window')} tip={L('距判定线超过此时间的音符不渲染', 'Notes farther than this from line are skipped')} defKey="perf_noteRenderWindow" value={ov.perf_noteRenderWindow} min={1000} max={20000} onChange={v => set('perf_noteRenderWindow', v)} />
        <NumInput lang={lang} label={L('最大打击粒子数', 'Max Hit Particles')} tip={L('同时存在的打击特效上限', 'Max simultaneous hit effects')} defKey="perf_maxParticles" value={ov.perf_maxParticles} min={5} max={200} onChange={v => set('perf_maxParticles', v)} />
        <NumInput lang={lang} label={L('对象池大小', 'Object Pool Size')} tip={L('预分配的特效对象数量', 'Pre-allocated effect objects')} defKey="perf_effectPoolSize" value={ov.perf_effectPoolSize} min={5} max={100} onChange={v => set('perf_effectPoolSize', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('渲染质量', 'Render Quality')}</h3>
        <NumInput lang={lang} label={L('渲染质量级别', 'Quality Level')} tip={L('0=最低 1=中等 2=最高画质', '0=lowest 1=medium 2=highest')} defKey="perf_renderQuality" value={ov.perf_renderQuality} min={0} max={2} onChange={v => set('perf_renderQuality', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('渲染开关 (关闭可提升帧率)', 'Render Toggles (disable to boost FPS)')}</h3>
        <p className="dp-sec-note">{L('以下开关可直接关闭各类渲染效果以节省性能。低功耗模式会一键关闭全部。', 'Below toggles disable rendering features to save performance. Low Power Mode disables all at once.')}</p>

        <ToggleInput lang={lang} label={L('低功耗模式', 'Low Power Mode')} tip={L('一键关闭所有非必要渲染', 'Disable all non-essential rendering')} value={ov.perf_lowPowerMode} onChange={v => {
          if (v) {
            const next = { ...ov, perf_lowPowerMode: true, perf_bgCoverRender: false, perf_audioVizRender: false, perf_hitEffectRender: false, perf_holdTrailRender: false, perf_noteOutlineRender: false, perf_noteShadowRender: false, perf_renderQuality: 0, perf_canvasDPR: 1 };
            saveDevOverrides(next);
            setOv(next);
          } else {
            set('perf_lowPowerMode', false);
          }
        }} />
        <ToggleInput lang={lang} label={L('背景封面', 'Background Cover')} tip={L('游戏中的模糊封面背景', 'Blurred cover background in-game')} value={ov.perf_bgCoverRender} onChange={v => set('perf_bgCoverRender', v)} />
        <ToggleInput lang={lang} label={L('音频可视化', 'Audio Visualization')} tip={L('底部频谱动画', 'Bottom spectrum animation')} value={ov.perf_audioVizRender} onChange={v => set('perf_audioVizRender', v)} />
        <ToggleInput lang={lang} label={L('打击特效', 'Hit Effects')} tip={L('按键时的光圈扩散特效', 'Tap ring spread effects')} value={ov.perf_hitEffectRender} onChange={v => set('perf_hitEffectRender', v)} />
        <ToggleInput lang={lang} label={L('Hold 拖尾光效', 'Hold Trail Glow')} tip={L('Hold 按住时的发光拖尾', 'Glow trail when holding')} value={ov.perf_holdTrailRender} onChange={v => set('perf_holdTrailRender', v)} />
        <ToggleInput lang={lang} label={L('音符外发光', 'Note Outline')} tip={L('音符外围白色轮廓线', 'White outline around notes')} value={ov.perf_noteOutlineRender} onChange={v => set('perf_noteOutlineRender', v)} />
        <ToggleInput lang={lang} label={L('音符阴影', 'Note Shadows')} tip={L('音符底部投影(开销较大)', 'Note drop shadow (expensive)')} value={ov.perf_noteShadowRender} onChange={v => set('perf_noteShadowRender', v)} />

        <h3 className="dp-sec-title" style={{ marginTop: 36 }}>{L('CSS 优化', 'CSS Optimizations')}</h3>
        <ToggleInput lang={lang} label={L('will-change 优化', 'CSS will-change')} tip={L('提示浏览器该元素会变动', 'Hint browser about changing elements')} value={ov.perf_useWillChange} onChange={v => set('perf_useWillChange', v)} />
        <ToggleInput lang={lang} label={L('GPU 加速', 'GPU Acceleration')} tip={L('使用 translate3d 启用 GPU 合成', 'Use translate3d for GPU compositing')} value={ov.perf_useGPUAccel} onChange={v => set('perf_useGPUAccel', v)} />
      </div>);

      default: return null;
    }
  };

  return (
    <div className="screen dev-screen">
      {toast && <div className="dp-toast">{toast}</div>}
      <div className="dp-container">
        {/* 顶栏 */}
        <div className="dp-topbar">
          <button className="dp-btn dp-btn-back" onClick={onBack}>🡠 {L('返回', 'Back')}</button>
          <span className="dp-title">{L('开发者面板', 'Developer Panel')}</span>
          <div className="dp-topbar-right">
            <button className="dp-btn dp-btn-reset" onClick={handleReset}>{L('重置全部', 'Reset All')}</button>
            <button className="dp-btn dp-btn-save" onClick={handleSave}>{L('保存', 'Save')}</button>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="dp-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`dp-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}>
              {lang === 'zh' ? t.zh : t.en}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="dp-body">
          {renderTab()}
          <div className="dp-footer">
            <button className="dp-btn dp-btn-reset-all" onClick={handleReset}>
              {L('恢复全部默认值', 'Reset All to Defaults')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

