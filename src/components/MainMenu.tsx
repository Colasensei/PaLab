import React, { useState, useCallback } from 'react';
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
  rks: number;
  lang: Lang;
  devMode: boolean;
  onToggleDev: () => void;
  account: AccountInfo | null;
  onSaveAccount: (info: AccountInfo) => void;
  showMascot: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onChartLibrary, onCreateChart, onSettings, onAbout, onRecords, onHelp, onUpdate, onDev, rks, lang, devMode, onToggleDev,
  account, onSaveAccount,
  showMascot,
}) => {
  const [devClicks, setDevClicks] = useState(0);
  const [showDonate, setShowDonate] = useState(false);
  const { urlA, urlB, switching, slot } = useScrollingCover();

  const handleDevClick = useCallback(() => {
    const next = devClicks + 1;
    setDevClicks(next);
    if (next >= getDevOverride('devClicks')) { onToggleDev(); setDevClicks(0); }
  }, [devClicks, onToggleDev]);

  const handleAuthorClick = useCallback(() => {
    handleDevClick();
    onAbout();
  }, [handleDevClick, onAbout]);

  return (
    <div className="screen menu-screen">
      <div className="bg-particles">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="bg-particle" />)}
      </div>

      {/* 看板娘立绘 */}
      {showMascot && (
      <div className="menu-mascot">
        <img src={getAssetUrl('14.png', '/14.png')} alt="" />
      </div>
      )}

      <div className="menu-actions">
        {/* Row 1 */}
        <div className="menu-card-row">
          <button className="menu-card menu-card-primary" onClick={onChartLibrary}>
            <div className="menu-card-cover-wrap">
              <img
                className={`menu-card-cover${switching ? ' anim' : ''}${switching ? (slot===0 ? ' out' : ' in') : ''}`}
                src={urlA ?? ''} alt=""
                style={{ transform: switching ? undefined : (slot===0 ? 'translateY(0)' : 'translateY(-100%)') }}
              />
              <img
                className={`menu-card-cover${switching ? ' anim' : ''}${switching ? (slot===1 ? ' out' : ' in') : ''}`}
                src={urlB ?? ''} alt=""
                style={{ transform: switching ? undefined : (slot===1 ? 'translateY(0)' : 'translateY(-100%)') }}
              />
            </div>
            <span className="menu-card-label">{lang === 'zh' ? '谱面库' : 'Charts'}</span>
          </button>
          <div className="menu-card-col">
            <button className="menu-card menu-card-secondary" onClick={onCreateChart}>
              <span className="menu-card-icon">✎</span>
              <span className="menu-card-label">{lang === 'zh' ? '制作' : 'Create'}</span>
            </button>
            <button className="menu-card" onClick={onSettings}>
              <span className="menu-card-icon">⚙</span>
              <span className="menu-card-label">{t('settings', lang)}</span>
            </button>
          </div>
        </div>

        {/* Row 2 */}
        <div className="menu-card-row menu-card-row-fit">
          <button className="menu-card menu-card-h" onClick={onUpdate}>
            <span className="menu-card-icon">↻</span>
            <span className="menu-card-label">{lang === 'zh' ? '更新' : 'Update'}</span>
          </button>
          <button className="menu-card menu-card-h" onClick={onHelp}>
            <span className="menu-card-icon">?</span>
            <span className="menu-card-label">{t('help', lang)}</span>
          </button>
          <button className="menu-card menu-card-profile" onClick={onRecords}>
            <div className="menu-card-avatar">
              {account?.avatarUrl ? (
                <img src={account.avatarUrl} alt={account?.name ?? ''} />
              ) : (
                <span>?</span>
              )}
            </div>
            <div className="menu-card-rks">
              <span className="menu-card-rks-val">{rks < 0 ? '--' : rks.toFixed(2)}</span>
              <span className="menu-card-rks-label">RKS</span>
            </div>
          </button>
        </div>

        {devMode && <div className="menu-dev-badge" onClick={onDev}>DEV MODE</div>}
      </div>

      {/* 底部信息栏 */}
      <div className="menu-credit-bar">
        <span className="menu-credit-item" onClick={handleAuthorClick}>by ColaSensei</span>
        <span className="menu-credit-dot">·</span>
        <span className="menu-credit-item" onClick={() => setShowDonate(true)}>
          {lang === 'zh' ? '捐赠感谢' : 'Donate'}
        </span>
      </div>

      {showDonate && <DonateModal lang={lang} onClose={() => setShowDonate(false)} />}
    </div>
  );
};
