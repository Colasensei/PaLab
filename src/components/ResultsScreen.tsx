import React, { useState, useEffect, useMemo } from 'react';
import { GameResults } from '@/types';
import { getRatingColor } from '@/utils';
import { generateBlurredBg } from '@/utils/blurImage';

import { t, Lang } from '@/utils/lang';

interface ResultsScreenProps {
  results: GameResults;
  onRestart: () => void;
  onBackToPanel: () => void;
  rks: number;
  rksChange: { old: number; new: number } | null;
  lang: Lang;
  isTrial?: boolean;
  onAdjustParams?: () => void;
  onContinueToEditor?: () => void;
  uiBlur?: boolean;
  chartInfo?: {
    title: string;
    artist: string;
    author: string;
    difficulty: string;
    chartConstant: number;
    trackCount: number;
    coverUrl: string | null;
    illustrationUrl?: string | null;
  } | null;
}

// 难度方块配色与谱面库列表保持一致（只给方块上色，文字一律白/灰）
const DIFF_STYLE: Record<string, { bg: string; fg: string }> = {
  EZ: { bg: '#7EC8E3', fg: '#000' },
  NM: { bg: '#FFFFFF', fg: '#000' },
  HD: { bg: '#C98A8A', fg: '#000' },
  IN: { bg: '#E53E3E', fg: '#fff' },
  AT: { bg: '#1A1A1A', fg: '#fff' },
};

const ratingGlyph = (rating: string): string => (rating === 'AP' ? 'Φ' : rating);

const ratingSubLabel = (rating: string): string =>
  rating === 'AP' ? 'ALL PERFECT' : rating === 'V' ? 'FULL COMBO' : '';

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  results, onRestart, onBackToPanel, rks, rksChange, lang,
  isTrial = false, onAdjustParams, onContinueToEditor, chartInfo, uiBlur = true,
}) => {
  const ratingColor = getRatingColor(results.rating);
  const glyph = ratingGlyph(results.rating);
  const subLabel = ratingSubLabel(results.rating);

  const [visible, setVisible] = useState(false);
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);
  const [shownScore, setShownScore] = useState(0);
  const [staticBg, setStaticBg] = useState<string | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onResize = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 分数滚动：一次 easeOut，别每帧重算
  useEffect(() => {
    if (!visible || results.score <= 0) { setShownScore(results.score); return; }
    const dur = 820;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setShownScore(Math.round(results.score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, results.score]);

  // 关闭 UI 模糊时用离线生成的静态模糊图，和加载界面同一套逻辑
  const bgSrc = chartInfo?.illustrationUrl || chartInfo?.coverUrl || null;
  useEffect(() => {
    if (!bgSrc || uiBlur) { setStaticBg(null); return; }
    let alive = true;
    generateBlurredBg(bgSrc, 48, 0.30).then(url => { if (alive) setStaticBg(url); });
    return () => { alive = false; };
  }, [bgSrc, uiBlur]);

  const acc = results.totalNotes > 0 ? (((results.perfect * 1.0 + results.good * 0.65) / results.totalNotes) * 100).toFixed(2) : '0.00';

  const avgOffset = useMemo(() => {
    const valid = results.noteResults.filter(r => r.judgment.offset !== Infinity);
    return valid.length > 0 ? `${(valid.reduce((s, r) => s + Math.abs(r.judgment.offset), 0) / valid.length).toFixed(1)}ms` : '-';
  }, [results.noteResults]);

  // Papori 台词，别 rerender 就换（
  const { mascotMsg, mascotLink } = useMemo(() => {
    const pp = results.pp;
    const isC = results.rating === 'C';
    const goodRatio = results.totalNotes > 0 ? results.good / results.totalNotes : 0;
    const missRatio = results.totalNotes > 0 ? results.miss / results.totalNotes : 0;
    const badRatio = results.totalNotes > 0 ? results.bad / results.totalNotes : 0;
    const maxComboRatio = results.totalNotes > 0 ? results.maxCombo / results.totalNotes : 0;

    let msg: string | null = null;
    let link: string | null = null;
    if (!isTrial && !results.autoPlay) {
      if (isC || pp < 3) {
        msg = lang === 'zh' ? '杂鱼、杂鱼~ 还不赶紧去练习底力？' : 'Noob~ Go practice!';
        link = 'https://xingye.me/game/eatkano/index.php';
      } else if (pp >= 15) {
        msg = lang === 'zh' ? '您？人？' : 'Are you even human!?';
      } else if (pp >= 10) {
        msg = lang === 'zh' ? '龙币！' : 'Dragon coin!';
      } else {
        const tips: string[] = [];
        if (results.rating === 'AP') {
          tips.push(lang === 'zh' ? '龙币！！Papori 的下巴掉了——快帮我捡起来！' : 'DRAGON COIN!! Papori\'s jaw dropped!');
          tips.push(lang === 'zh' ? '全 Perfect……Papori 需要冷静一下。冷静不下来！！！' : 'All Perfect... Papori needs to calm down. CANNOT CALM DOWN!!!');
          tips.push(lang === 'zh' ? '您？人？Papori 郑重宣布：你是神。' : 'You... human?! Papori declares: you are a god.');
        } else if (results.rating === 'V') {
          tips.push(lang === 'zh' ? '呜哇~ 全连！Papori 都看呆了耶！' : 'Wowa~ FC! Papori is amazed!');
          tips.push(lang === 'zh' ? 'FC 了 FC 了！Papori 开心得转圈圈～' : 'FC FC FC! Papori is spinning with joy~');
          tips.push(lang === 'zh' ? '全连只是开始，AP 还在等你呢～加油！' : 'FC is just the beginning, AP awaits~ Keep going!');
        }
        if (parseFloat(acc) >= 99) {
          tips.push(lang === 'zh' ? 'ACC 好高！就差一点点就完美了，加油~' : 'ACC so high! Almost perfect!');
          tips.push(lang === 'zh' ? '99% 的 ACC！Papori 为你鼓掌～' : '99% ACC! Papori applauds you~');
        } else if (parseFloat(acc) >= 95) {
          tips.push(lang === 'zh' ? 'ACC 还不错嘛～再稳一点就能冲 99% 了！' : 'Not bad ACC~ steady it up for 99%!');
        }
        if (missRatio > 0.05) {
          tips.push(lang === 'zh' ? 'Miss 有点多哦… 注意看判定线呀！' : 'Too many misses... Watch the line!');
          tips.push(lang === 'zh' ? '是不是走神了？Papori 看到好几个 Miss 都是发呆的瞬间～' : 'Zoned out? Papori saw several Misses during daydream moments~');
        }
        if (badRatio > 0.02) {
          tips.push(lang === 'zh' ? 'Bad 太多了啦，提前按可不是好习惯~' : 'So many Bads, don\'t hit early~');
        }
        if (goodRatio > 0.15) {
          tips.push(lang === 'zh' ? 'Good 稍微多了点，再练练准度吧～' : 'Too many Goods, practice accuracy~');
          tips.push(lang === 'zh' ? 'Good 和 Perfect 之间只差一点点时机哦！Papori 相信你能做到～' : 'Good and Perfect are just a tiny timing difference! Papori believes in you~');
        } else if (goodRatio < 0.05 && missRatio < 0.03 && badRatio < 0.01) {
          tips.push(lang === 'zh' ? '准度非常棒！Papori 很满意～' : 'Excellent accuracy! Papori is very pleased~');
        }
        if (maxComboRatio < 0.5 && results.totalNotes > 10) {
          tips.push(lang === 'zh' ? '断连有点严重呢…稳住心态最重要！' : 'Combo broke a lot... Stay calm!');
          tips.push(lang === 'zh' ? '连击断了不要紧～深呼吸，下次一定！' : 'Combo broke? No worries~ deep breath, next time for sure!');
        } else if (maxComboRatio >= 0.95) {
          tips.push(lang === 'zh' ? '差一点就全连了！Papori 看到你断的那个地方了，下次注意哦～' : 'Almost FC! Papori saw where you broke, watch it next time~');
        }
        if (pp >= 13) {
          tips.push(lang === 'zh' ? '这个 PP……Papori 倒吸一口凉气。' : 'This PP... Papori gasps.');
        }
        if (results.rating === 'S' || results.rating === 'A') {
          tips.push(lang === 'zh' ? 'S 评级不错嘛～继续保持！' : 'S rank, not bad~ Keep it up!');
        }
        tips.push(lang === 'zh' ? '今天也辛苦啦～Papori 请你喝茶！' : 'Good work today~ Tea\'s on Papori!');
        tips.push(lang === 'zh' ? '每一把都是在变强～Papori 认真说的。' : 'Every play makes you stronger~ Papori means it.');
        tips.push(lang === 'zh' ? '呜……Papori 也想和你一起打音游。' : 'Ugh... Papori wants to play with you too.');
        tips.push(lang === 'zh' ? '你知道吗～Papori 最喜欢看结算界面了，因为可以看到你的表情。' : 'You know~ Papori loves the results screen, because she can see your face.');
        tips.push(lang === 'zh' ? '不管成绩怎样，Papori 都觉得你很棒～' : 'No matter the score, Papori thinks you\'re great~');
        tips.push(lang === 'zh' ? 'ColaSensei 说结算界面是 Papori 的主场。Papori 同意！' : 'ColaSensei says the results screen is Papori\'s stage. Papori agrees!');
        if (results.rating !== 'AP') {
          tips.push(lang === 'zh' ? 'AP 虽然还没来，但它一定在路上～' : 'AP hasn\'t arrived yet, but it\'s on its way~');
        }
        msg = tips[Math.floor(Math.random() * tips.length)];
      }
    }
    return { mascotMsg: msg, mascotLink: link };
  }, [results, isTrial, lang]);

  const diffKey = chartInfo?.difficulty || results.difficulty || '';
  const diffStyle = DIFF_STYLE[diffKey] || { bg: '#FFFFFF', fg: '#000' };
  const title = chartInfo?.title || results.songName || '—';
  const artist = chartInfo?.artist || '—';
  const author = chartInfo?.author || '—';
  const constant = (chartInfo?.chartConstant ?? results.chartConstant ?? 0).toFixed(1);
  const trackCount = chartInfo?.trackCount;

  // ── 曲目区（横屏在左，竖屏在顶）
  const hero = (
    <div className="rs-hero rs-rise" style={{ animationDelay: '0.04s' }}>
      <div className="rs-cover">
        {chartInfo?.coverUrl ? <img src={chartInfo.coverUrl} alt="" /> : <span>::</span>}
      </div>
      <div className="rs-hero-text">
        <div className="rs-title">{title}</div>
        <div className="rs-artist">{artist}</div>
        <div className="rs-meta">
          <span className="rs-diff-badge" style={{ background: diffStyle.bg, color: diffStyle.fg }}>
            <b>{constant}</b>
            <i>{diffKey || '?'}{trackCount ? ` · ${trackCount}K` : ''}</i>
          </span>
          <span className="rs-author">{lang === 'zh' ? '谱师 ' : 'By '}{author}</span>
          {results.autoPlay && <span className="rs-auto">AUTO</span>}
        </div>
      </div>
    </div>
  );

  // ── 成绩区
  const scoreBlock = (
    <div className="rs-score-block rs-rise" style={{ animationDelay: '0.10s' }}>
      <div className="rs-rating" style={{ color: ratingColor, textShadow: `0 0 22px ${ratingColor}cc, 0 0 52px ${ratingColor}77, 0 0 110px ${ratingColor}44` }}>{glyph}</div>
      <div className="rs-score-wrap">
        {subLabel && <div className="rs-rating-label" style={{ color: ratingColor }}>{subLabel}</div>}
        <div className="rs-score">{shownScore.toLocaleString()}</div>
        <div className="rs-score-label">{t('score', lang)}</div>
        <div className="rs-inline-stats">
          <span className="rs-stat"><b>{acc}%</b><i>ACC</i></span>
          <span className="rs-stat"><b style={{ color: ratingColor }}>{results.pp.toFixed(2)}</b><i>PP</i></span>
          <span className="rs-stat">
            <b>{results.autoPlay || rks < 0 ? '--' : rks.toFixed(2)}</b><i>RKS</i>
            {!results.autoPlay && rksChange && rksChange.new !== rksChange.old && (
              <em className={`rks-change ${rksChange.new > rksChange.old ? 'rks-up' : 'rks-down'}`}>
                {rksChange.new > rksChange.old ? '↑' : '↓'}{Math.abs(rksChange.new - rksChange.old).toFixed(2)}
              </em>
            )}
          </span>
        </div>
      </div>
    </div>
  );

  const judgments = (
    <div className="rs-judgments rs-rise" style={{ animationDelay: '0.16s' }}>
      <div className="rs-j"><span className="rs-j-val stat-perfect">{results.perfect}</span><span className="rs-j-lbl">Perfect</span></div>
      <div className="rs-j"><span className="rs-j-val stat-good">{results.good}</span><span className="rs-j-lbl">Good</span></div>
      <div className="rs-j"><span className="rs-j-val stat-bad">{results.bad}</span><span className="rs-j-lbl">Bad</span></div>
      <div className="rs-j"><span className="rs-j-val stat-miss">{results.miss}</span><span className="rs-j-lbl">Miss</span></div>
    </div>
  );

  const details = (
    <div className="rs-details rs-rise" style={{ animationDelay: '0.22s' }}>
      <div className="rs-d"><span>{t('total.notes', lang)}</span><span>{results.totalNotes}</span></div>
      <div className="rs-d"><span>{t('max.combo', lang)}</span><span>{results.maxCombo}</span></div>
      <div className="rs-d"><span>{t('avg.offset', lang)}</span><span>{avgOffset}</span></div>
    </div>
  );

  const mascot = mascotMsg ? (
    <div className="rs-mascot rs-rise" style={{ animationDelay: '0.28s' }}>
      <div className="rs-mascot-bubble">
        {mascotLink ? (
          <span>{lang === 'zh' ? '杂鱼、杂鱼~ 还不赶紧去 ' : 'Noob~ Go to '}
            <a href={mascotLink} target="_blank" rel="noopener noreferrer" className="rs-mascot-link">eatkano</a>
            {lang === 'zh' ? ' 练习底力？' : ' to practice!'}
          </span>
        ) : <span>{mascotMsg}</span>}
      </div>
    </div>
  ) : null;

  const actions = (
    <div className="rs-actions rs-rise" style={{ animationDelay: '0.34s' }}>
      {isTrial ? (
        <>
          <button className="btn btn-outline" onClick={onAdjustParams}>
            {lang === 'zh' ? '不保存并退出' : 'Discard & Exit'}
          </button>
          <button className="btn btn-primary" onClick={onContinueToEditor}>
            {lang === 'zh' ? '继续' : 'Continue'}
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-primary" onClick={onRestart}>{t('retry', lang)}</button>
          <button className="btn btn-outline" onClick={onBackToPanel}>{t('back', lang)}</button>
        </>
      )}
    </div>
  );

  return (
    <div className="screen rs-screen">
      {bgSrc && (uiBlur
        ? <div className="rs-bg" style={{ backgroundImage: `url(${bgSrc})` }} />
        : <div className="rs-bg rs-bg-static" style={{ backgroundImage: `url(${staticBg || bgSrc})` }} />
      )}
      <div className="rs-veil" />

      <div className={`rs-body ${landscape ? 'rs-landscape' : 'rs-portrait'}${visible ? ' is-visible' : ''}`}>
        {landscape ? (
          <div className="rs-ls-grid">
            <div className="rs-ls-left">{hero}</div>
            <div className="rs-ls-divider" />
            <div className="rs-ls-right">
              {scoreBlock}
              {judgments}
              {details}
              {mascot}
            </div>
          </div>
        ) : (
          <div className="rs-pt-stack">
            {hero}
            <div className="rs-pt-divider" />
            <div className="rs-pt-body">
              {scoreBlock}
              {judgments}
              {details}
              {mascot}
            </div>
          </div>
        )}
        {actions}
      </div>
    </div>
  );
};
