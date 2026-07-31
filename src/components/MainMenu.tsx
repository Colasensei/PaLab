import React, { useState, useCallback, useEffect, useRef } from 'react';
import { t, Lang } from '@/utils/lang';
import { AccountInfo } from '@/types';
import { getDevOverride } from '@/utils/devOverrides';
import { getAssetUrl } from '@/utils/assetStore';
import { DonateModal } from './DonateModal';
import { useScrollingCover } from './ScrollingCover';

interface MainMenuProps {
  onChartLibrary: () => void;
  onCreateChart: () => void;
  onSettings: () => void;
  onRecords: () => void;
  onAbout: () => void;
  onHelp: () => void;
  onUpdate: () => void;
  onDev: () => void;
  onOpenMusicPlayer: () => void;
  rks: number;
  lang: Lang;
  devMode: boolean;
  onToggleDev: () => void;
  account: AccountInfo | null;
  onSaveAccount: (info: AccountInfo) => void;
  showMascot: boolean;
  hasUpdate: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onChartLibrary, onCreateChart, onSettings, onAbout, onRecords, onHelp, onUpdate, onDev, onOpenMusicPlayer, rks, lang, devMode, onToggleDev,
  account, onSaveAccount,
  showMascot, hasUpdate,
}) => {
  const [devClicks, setDevClicks] = useState(0);
  const [showDonate, setShowDonate] = useState(false);
  const { urlA, urlB, switching, slot } = useScrollingCover();

  // 主菜单背景图：横屏 43.jpg / 竖屏 916.jpg；加载失败回退原网格背景
  const [bgLoaded, setBgLoaded] = useState(false);
  const [bgLandscape, setBgLandscape] = useState(window.innerWidth > window.innerHeight);
  useEffect(() => {
    const onResize = () => setBgLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const bgName = bgLandscape ? '43.jpg' : '916.jpg';
  const bgSrc = getAssetUrl(bgName, '/' + bgName);

  const handleDevClick = useCallback(() => {
    const next = devClicks + 1;
    setDevClicks(next);
    if (next >= getDevOverride('devClicks')) { onToggleDev(); setDevClicks(0); }
  }, [devClicks, onToggleDev]);

  const handleAuthorClick = useCallback(() => {
    handleDevClick();
    onAbout();
  }, [handleDevClick, onAbout]);

  // 长按谱面库卡片 → 音乐播放器；单击 → 谱面库
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const startLongPress = useCallback(() => {
    longPressed.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onOpenMusicPlayer();
    }, 450);
  }, [onOpenMusicPlayer]);
  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    // 延迟重置，避免后续 click 误触发进入谱面库
    setTimeout(() => { longPressed.current = false; }, 350);
  }, []);

  const updateClass = hasUpdate ? ' menu-link-update' : '';

  return (
    <div className="screen menu-screen">
      {/* 背景图（横屏 43.jpg / 竖屏 916.jpg）— 加载成功才显示，覆盖网格背景 */}
      <img
        key={bgSrc}
        className={`menu-bg-img${bgLoaded ? ' loaded' : ''}`}
        src={bgSrc}
        alt=""
        onLoad={() => setBgLoaded(true)}
        onError={() => setBgLoaded(false)}
      />

      <div className="bg-particles">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="bg-particle" />)}
      </div>

      {/* 左上区域 */}
      <div className="menu-header">
        {/* 个人信息 */}
        <div className="menu-profile" onClick={onRecords}>
          <div className="menu-profile-avatar">
            {account?.avatarUrl ? (
              <img src={account.avatarUrl} alt={account?.name ?? ''} />
            ) : (
              <span>?</span>
            )}
          </div>
          <div className="menu-profile-info">
            <span className="menu-profile-name">{account?.name ?? (lang === 'zh' ? '未登录' : 'Guest')}</span>
            <span className="menu-profile-rks">RKS {rks < 0 ? '--' : rks.toFixed(2)}</span>
          </div>
        </div>

        {/* LOGO — Palab 整体 */}
        <div className="menu-logo">
          <span className="brand-char">P</span><span className="brand-char">alab</span>
        </div>

        {/* by + 捐赠 */}
        <div className="menu-credit-bar">
          <span className="menu-credit-item" onClick={handleAuthorClick}>by ColaSensei</span>
          <span className="menu-credit-dot">·</span>
          <span className="menu-credit-item" onClick={() => setShowDonate(true)}>
            {lang === 'zh' ? '捐赠感谢' : 'Donate'}
          </span>
        </div>
      </div>

      {/* 看板娘 */}
      {showMascot && (
      <div className="menu-mascot">
        <img src={getAssetUrl('14.png', '/14.png')} alt="" />
      </div>
      )}

      {/* 底部区域 */}
      <div className="menu-bottom">
        <div className="menu-links-row">
          <div className="menu-link-group">
            <span className="menu-link" onClick={onCreateChart}>{lang === 'zh' ? '制作' : 'Create'}</span>
            <span className="menu-link-sep">|</span>
            <span className="menu-link" onClick={onSettings}>{t('settings', lang)}</span>
          </div>

          {/* 谱面库卡片：单击进入谱面库，长按进入音乐播放 */}
          <button
            className="menu-chart-card"
            onClick={() => { if (longPressed.current) { longPressed.current = false; return; } onChartLibrary(); }}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
          >
            <div className="menu-chart-cover-wrap">
              <img className={`menu-chart-cover${switching ? ' anim' : ''}${switching ? (slot===0 ? ' out' : ' in') : ''}`}
                src={urlA ?? ''} alt=""
                style={{ transform: switching ? undefined : (slot===0 ? 'translateY(0)' : 'translateY(-100%)') }} />
              <img className={`menu-chart-cover${switching ? ' anim' : ''}${switching ? (slot===1 ? ' out' : ' in') : ''}`}
                src={urlB ?? ''} alt=""
                style={{ transform: switching ? undefined : (slot===1 ? 'translateY(0)' : 'translateY(-100%)') }} />
            </div>
            <span className="menu-chart-label">{lang === 'zh' ? '谱面库' : 'Charts'}</span>
            <span className="menu-chart-hint">{t('music.longpress', lang)}</span>
          </button>

          <span className="menu-link-sep menu-link-sep-mid">|</span>

          <div className="menu-link-group">
            <span className={`menu-link${updateClass}`} onClick={onUpdate}>{lang === 'zh' ? '更新' : 'Update'}</span>
            <span className="menu-link-sep">|</span>
            <span className="menu-link" onClick={onHelp}>{t('help', lang)}</span>
          </div>
        </div>
      </div>

      {devMode && <div className="menu-dev-badge" onClick={onDev}>DEV MODE</div>}

      {showDonate && <DonateModal lang={lang} onClose={() => setShowDonate(false)} />}
    </div>
  );
};
