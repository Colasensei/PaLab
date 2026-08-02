import React, { useState, useEffect, useMemo } from 'react';
import { GameResults } from '@/types';
import { getRatingColor, getRatingLabel } from '@/utils';
import { getAssetUrl } from '@/utils/assetStore';

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
  chartInfo?: { title: string; artist: string; author: string; difficulty: string; chartConstant: number; trackCount: number; coverUrl: string | null } | null;
}

function getPhigrosRating(rating: string): string {
  switch (rating) { case 'AP': return 'Φ'; case 'V': return 'V'; default: return rating; }
}

function getPhigrosLabel(rating: string, lang: Lang): string {
  if (lang === 'zh') {
    switch (rating) { case 'AP': return 'ALL PERFECT'; case 'V': return 'FULL COMBO'; default: return rating; }
  }
  switch (rating) { case 'AP': return 'ALL PERFECT'; case 'V': return 'FULL COMBO'; default: return rating; }
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  results, onRestart, onBackToPanel, rks, rksChange, lang,
  isTrial = false, onAdjustParams, onContinueToEditor, chartInfo,
}) => {
  const ratingColor = getRatingColor(results.rating);
  const phigrosRating = getPhigrosRating(results.rating);
  const phigrosLabel = getPhigrosLabel(results.rating, lang);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onResize = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const acc = results.totalNotes > 0 ? (((results.perfect * 1.0 + results.good * 0.65) / results.totalNotes) * 100).toFixed(2) : '0.00';

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

  const leftPanel = (
    <>
      {/* 评级大字 — 评级色发光 */}
      <div className="result-rating" style={{ color: ratingColor, textShadow: `0 0 18px ${ratingColor}aa, 0 0 44px ${ratingColor}55, 0 0 80px ${ratingColor}33` }}>{phigrosRating}</div>
      <div className="result-rating-label" style={{ color: ratingColor }}>{phigrosLabel}</div>
      {/* 分 */}
      <div className="result-score">{results.score.toLocaleString()}</div>
      <div className="result-score-label">{t('score', lang)}</div>
    </>
  );

  const rightPanel = (
    <>
      {/* 歌 */}
      <div className="result-song-info">
        {chartInfo ? (
          <>
            {chartInfo.coverUrl && <div className="result-cover-sm"><img src={chartInfo.coverUrl} alt="" /></div>}
            <div className="result-chart-text">
              <span className="result-song-name">{chartInfo.title}</span>
              <span className="result-difficulty" style={{ color: chartInfo.difficulty === 'EZ' ? '#44BB44' : chartInfo.difficulty === 'NM' ? '#FFAA00' : chartInfo.difficulty === 'HD' ? '#FF4444' : chartInfo.difficulty === 'IN' ? '#AA44FF' : '#FF44AA' }}>{chartInfo.difficulty}</span>
              <span className="result-chart-constant">{chartInfo.chartConstant.toFixed(1)}</span>
            </div>
          </>
        ) : (
          <>
            {results.songName && <span className="result-song-name">{results.songName}</span>}
            <span className="result-difficulty" style={{
              color: results.difficulty === 'EZ' ? '#44BB44' : results.difficulty === 'NM' ? '#FFAA00' : results.difficulty === 'HD' ? '#FF4444' : results.difficulty === 'IN' ? '#AA44FF' : '#FF44AA'
            }}>{results.difficulty}</span>
            <span className="result-chart-constant">{results.chartConstant.toFixed(1)}</span>
          </>
        )}
        {results.autoPlay && <span className="result-autoplay">AUTO</span>}
      </div>

      {/* ACC */}
      <div className="result-acc-row">
        <span className="result-acc-val">{acc}%</span>
      </div>

      {/* P/G/B/M + PP/RKS 六格 */}
      <div className="result-stats-grid">
        <div className="rsg-item"><span className="rsg-val stat-perfect">{results.perfect}</span><span className="rsg-lbl">Perfect</span></div>
        <div className="rsg-item"><span className="rsg-val stat-good">{results.good}</span><span className="rsg-lbl">Good</span></div>
        <div className="rsg-item"><span className="rsg-val stat-bad">{results.bad}</span><span className="rsg-lbl">Bad</span></div>
        <div className="rsg-item"><span className="rsg-val stat-miss">{results.miss}</span><span className="rsg-lbl">Miss</span></div>
        <div className="rsg-item">
          <span className="rsg-val" style={{ color: ratingColor, fontSize: 16 }}>{results.pp.toFixed(2)}</span>
          <span className="rsg-lbl">PP</span>
        </div>
        <div className="rsg-item">
          <span className="rsg-val" style={{ fontSize: 16 }}>{results.autoPlay || rks < 0 ? '--' : rks.toFixed(2)}</span>
          <span className="rsg-lbl">RKS</span>
          {!results.autoPlay && rksChange && rksChange.new !== rksChange.old && (
            <span className={`rks-change ${rksChange.new > rksChange.old ? 'rks-up' : 'rks-down'}`} style={{ fontSize: 9 }}>
              {rksChange.new > rksChange.old ? '↑' : '↓'}{(rksChange.new - rksChange.old).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* 详细 */}
      <div className={`result-extra ${expanded ? 'open' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="re-row"><span>{t('total.notes', lang)}</span><span>{results.totalNotes}</span></div>
        <div className="re-row"><span>{t('max.combo', lang)}</span><span>{results.maxCombo}</span></div>
        <div className="re-row"><span>{t('avg.offset', lang)}</span><span>
          {(() => {
            const valid = results.noteResults.filter(r => r.judgment.offset !== Infinity);
            return valid.length > 0 ? `${(valid.reduce((s, r) => s + Math.abs(r.judgment.offset), 0) / valid.length).toFixed(1)}ms` : '-';
          })()}
        </span></div>
      </div>
      <div className="re-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? t('collapse', lang) : t('click.for.details', lang)}
      </div>
    </>
  );

  // 横屏：左30%封面+信息 / 右70%评级+分+数据
  const diffColor = chartInfo
    ? (chartInfo.difficulty === 'EZ' ? '#7EC8E3' : chartInfo.difficulty === 'NM' ? '#FFFFFF' : chartInfo.difficulty === 'HD' ? '#FF8C42' : chartInfo.difficulty === 'IN' ? '#E53E3E' : '#1A1A1A')
    : '#FFFFFF';
  const diffFg = chartInfo?.difficulty === 'AT' ? '#fff' : '#000';

  const landscapeInfoLeft = (
    <div className="rp-info-left">
      {/* 正方形封面 */}
      <div className="rp-cover-sq">
        {chartInfo?.coverUrl
          ? <img src={chartInfo.coverUrl} alt="" />
          : <span>::</span>
        }
      </div>
      {/* 标题左 + 难度方块右 */}
      <div className="rp-info-title-row">
        <div className="rp-info-text">
          <div className="rp-info-title">{chartInfo?.title || results.songName || '—'}</div>
          <div className="rp-info-artist">{chartInfo?.artist || '—'}</div>
          <div className="rp-info-author">{lang === 'zh' ? '谱师: ' : 'By: '}{chartInfo?.author || '—'}</div>
        </div>
        <div className="rp-diff-sq" style={{ background: diffColor, color: diffFg }}>
          <div className="rp-diff-sq-const">{chartInfo ? chartInfo.chartConstant.toFixed(1) : results.chartConstant.toFixed(1)}</div>
          <div className="rp-diff-sq-label">{chartInfo?.difficulty || results.difficulty || '?'} · {chartInfo?.trackCount || 4}K</div>
        </div>
      </div>
    </div>
  );

  const landscapeDataRight = (
    <div className="rp-data-right">
      {/* 评级 + 分数 — 横排 */}
      <div className="rp-rating-block">
        <div className="rp-rating-big" style={{ color: ratingColor }}>{phigrosRating}</div>
        <div className="rp-rating-score">
          <div className="rp-score-big">{results.score.toLocaleString()}</div>
          <div className="rp-score-lbl">{t('score', lang)}</div>
        </div>
      </div>
      {/* ACC + PP + RKS 同行 */}
      <div className="rp-acc-row">
        <span className="rp-acc">{acc}%</span>
        <span className="rp-acc-sep">·</span>
        <span className="rp-pp-inline" style={{ color: ratingColor }}>PP {results.pp.toFixed(2)}</span>
        <span className="rp-acc-sep">·</span>
        <span className="rp-rks-inline">RKS {results.autoPlay || rks < 0 ? '--' : rks.toFixed(2)}</span>
        {!results.autoPlay && rksChange && rksChange.new !== rksChange.old && (
          <span className={`rks-change ${rksChange.new > rksChange.old ? 'rks-up' : 'rks-down'}`}>
            {rksChange.new > rksChange.old ? '↑' : '↓'}{(rksChange.new - rksChange.old).toFixed(2)}
          </span>
        )}
      </div>
      <div className="rp-stats-grid">
        <div className="rps-item"><span className="rps-val stat-perfect">{results.perfect}</span><span className="rps-lbl">Perfect</span></div>
        <div className="rps-item"><span className="rps-val stat-good">{results.good}</span><span className="rps-lbl">Good</span></div>
        <div className="rps-item"><span className="rps-val stat-bad">{results.bad}</span><span className="rps-lbl">Bad</span></div>
        <div className="rps-item"><span className="rps-val stat-miss">{results.miss}</span><span className="rps-lbl">Miss</span></div>
      </div>
      {/* 额外数据折叠 */}
      <div className={`result-extra ${expanded ? 'open' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="re-row"><span>{t('total.notes', lang)}</span><span>{results.totalNotes}</span></div>
        <div className="re-row"><span>{t('max.combo', lang)}</span><span>{results.maxCombo}</span></div>
        <div className="re-row"><span>{t('avg.offset', lang)}</span><span>
          {(() => {
            const valid = results.noteResults.filter(r => r.judgment.offset !== Infinity);
            return valid.length > 0 ? `${(valid.reduce((s, r) => s + Math.abs(r.judgment.offset), 0) / valid.length).toFixed(1)}ms` : '-';
          })()}
        </span></div>
      </div>
      <div className="re-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? t('collapse', lang) : t('click.for.details', lang)}
      </div>
    </div>
  );

  // ═══════ 新竖屏布局 ═══════
  const portraitTop = (
    <div className="rp-portrait-top">
      <div className="rp-portrait-cover">
        {chartInfo?.coverUrl
          ? <img src={chartInfo.coverUrl} alt="" />
          : <span>::</span>
        }
      </div>
      <div className="rp-portrait-info">
        <div className="rp-portrait-title">{chartInfo?.title || results.songName || '—'}</div>
        <div className="rp-portrait-artist">{chartInfo?.artist || '—'}{chartInfo?.author ? ` · ${chartInfo.author}` : ''}</div>
        <div className="rp-portrait-diff">
          <span className="rp-diff-badge-sq" style={{ background: diffColor, color: diffFg }}>
            <span className="rp-diff-sq-const">{chartInfo ? chartInfo.chartConstant.toFixed(1) : results.chartConstant.toFixed(1)}</span>
            <span className="rp-diff-sq-label">{chartInfo?.difficulty || results.difficulty || '?'} · {chartInfo?.trackCount || 4}K</span>
          </span>
        </div>
      </div>
    </div>
  );

  const portraitBottom = (
    <div className="rp-portrait-bottom">
      <div className="rp-portrait-rating">
        <div className="rp-rating-big" style={{ color: ratingColor }}>{phigrosRating}</div>
        <div className="rp-score-big">{results.score.toLocaleString()}</div>
      </div>
      <div className="rp-portrait-data">
        <div className="rp-acc-row">
          <span className="rp-acc">{acc}%</span>
          <span className="rp-acc-sep">·</span>
          <span className="rp-pp-inline" style={{ color: ratingColor }}>PP {results.pp.toFixed(2)}</span>
          <span className="rp-acc-sep">·</span>
          <span className="rp-rks-inline">RKS {results.autoPlay || rks < 0 ? '--' : rks.toFixed(2)}</span>
        </div>
        <div className="rp-pp-row" style={{ display: 'none' }}>
          <div className="rp-pp-item">
            <span className="rp-pp-val" style={{ color: ratingColor }}>{results.pp.toFixed(2)}</span>
            <span className="rp-pp-lbl">PP</span>
          </div>
          <div className="rp-pp-item">
            <span className="rp-pp-val">{results.autoPlay || rks < 0 ? '--' : rks.toFixed(2)}</span>
            <span className="rp-pp-lbl">RKS</span>
            {!results.autoPlay && rksChange && rksChange.new !== rksChange.old && (
              <span className={`rks-change ${rksChange.new > rksChange.old ? 'rks-up' : 'rks-down'}`}>
                {rksChange.new > rksChange.old ? '↑' : '↓'}{(rksChange.new - rksChange.old).toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <div className="rp-stats-grid rp-stats-grid-4">
          <div className="rps-item"><span className="rps-val stat-perfect">{results.perfect}</span><span className="rps-lbl">Perfect</span></div>
          <div className="rps-item"><span className="rps-val stat-good">{results.good}</span><span className="rps-lbl">Good</span></div>
          <div className="rps-item"><span className="rps-val stat-bad">{results.bad}</span><span className="rps-lbl">Bad</span></div>
          <div className="rps-item"><span className="rps-val stat-miss">{results.miss}</span><span className="rps-lbl">Miss</span></div>
        </div>
        {/* 额外数据折叠 */}
        <div className={`result-extra ${expanded ? 'open' : ''}`} onClick={() => setExpanded(!expanded)}>
          <div className="re-row"><span>{t('total.notes', lang)}</span><span>{results.totalNotes}</span></div>
          <div className="re-row"><span>{t('max.combo', lang)}</span><span>{results.maxCombo}</span></div>
          <div className="re-row"><span>{t('avg.offset', lang)}</span><span>
            {(() => {
              const valid = results.noteResults.filter(r => r.judgment.offset !== Infinity);
              return valid.length > 0 ? `${(valid.reduce((s, r) => s + Math.abs(r.judgment.offset), 0) / valid.length).toFixed(1)}ms` : '-';
            })()}
          </span></div>
        </div>
        <div className="re-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? t('collapse', lang) : t('click.for.details', lang)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="screen results-screen" style={{ position: 'relative' }}>
      {/* 曲绘模糊背景 + 压暗 */}
      {chartInfo?.coverUrl && <div className="gameplay-cover-bg" style={{ backgroundImage: `url(${chartInfo.coverUrl})`, position: 'fixed', filter: 'blur(40px) brightness(0.3)' }} />}
      <div className="results-bg-overlay" />
      <div className={landscape ? 'results-layout-landscape' : 'results-layout-portrait'} style={{ position: 'relative', zIndex: 1 }}>
        <div className={`results-panel-phigros ${visible ? 'results-visible' : ''} ${mascotMsg ? 'has-mascot' : ''}`}>
          {landscape ? (
            <div className="rp-landscape-body">
              <div className="rp-left-new">{landscapeInfoLeft}</div>
              <div className="rp-divider-v" />
              <div className="rp-right-new">{landscapeDataRight}</div>
            </div>
          ) : (
            <>
              {portraitTop}
              <div className="rp-divider-h" />
              {portraitBottom}
            </>
          )}
          <div className="results-actions">
            {isTrial ? (
              <>
                <button className="btn btn-outline" onClick={onAdjustParams}>
                  {lang === 'zh' ? '不保存并退出' : 'Discard & Exit'}
                </button>
                <button className="btn btn-primary" onClick={onContinueToEditor} style={{ background: 'linear-gradient(135deg, #4488FF, #3366DD)', border: 'none' }}>
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
        </div>
      </div>

      {/* 看板娘 — 屏幕底部 */}
      {mascotMsg && (
        <div className="results-mascot">
          <img src={getAssetUrl('14.png', '/14.png')} alt="mascot" className="mascot-head" />
          <div className="mascot-bubble">
            {mascotLink ? (
              <span>{lang === 'zh' ? '杂鱼、杂鱼~ 还不赶紧去 ' : 'Noob~ Go to '}
                <a href={mascotLink} target="_blank" rel="noopener noreferrer" className="mascot-link">eatkano</a>
                {lang === 'zh' ? ' 练习底力？' : ' to practice!'}
              </span>
            ) : (
              <span>{mascotMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

