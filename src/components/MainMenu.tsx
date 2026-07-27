import React, { useState, useCallback } from 'react';
import { t, Lang } from '@/utils/lang';
import { AccountInfo } from '@/types';
import { getDevOverride } from '@/utils/devOverrides';
import { getAssetUrl } from '@/utils/assetStore';
import { DonateModal } from './DonateModal';

interface MainMenuProps {
  onChartLibrary: () => void;
  onCreateChart: () => void;
  onSettings: () => void;
  onProfile: () => void;
  onAbout: () => void;
  onRecords: () => void;
  onHelp: () => void;
  onDev: () => void;
  rks: number;
  lang: Lang;
  devMode: boolean;
  onToggleDev: () => void;
  account: AccountInfo | null;
  onSaveAccount: (info: AccountInfo) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onChartLibrary, onCreateChart, onSettings, onProfile, onAbout, onRecords, onHelp, onDev, rks, lang, devMode, onToggleDev,
  account, onSaveAccount,
}) => {
  const [devClicks, setDevClicks] = useState(0);
  const [showDonate, setShowDonate] = useState(false);

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
      <div className="menu-mascot">
        <img src={getAssetUrl('14.png', '/14.png')} alt="" />
      </div>

      <div className="menu-actions">
        <div className="menu-buttons">
          <div className="menu-play-row">
            <button className="btn btn-primary menu-btn menu-btn-play" onClick={onChartLibrary}>{lang === 'zh' ? '谱面库' : 'Chart Library'}</button>
            {/* 头像 + RKS 合一胶囊 */}
            <div className="menu-rks-pill">
              <div
                className="menu-rks-avatar"
                onClick={onProfile}
                title={account ? account.name : (lang === 'zh' ? '设置个人信息' : 'Set Profile')}
              >
                {account?.avatarUrl ? (
                  <img src={account.avatarUrl} alt={account.name} />
                ) : (
                  <span>?</span>
                )}
              </div>
              <button className="menu-rks-info" onClick={onRecords}>
                <span className="menu-rks-btn-label">RKS</span>
                <span className="menu-rks-btn-val">{rks < 0 ? '--' : rks.toFixed(2)}</span>
              </button>
            </div>
          </div>
          <button className="btn btn-outline menu-btn" onClick={onCreateChart}>{lang === 'zh' ? '制作谱面' : 'Create Chart'}</button>
          <button className="btn btn-outline menu-btn" onClick={onSettings}>{t('settings', lang)}</button>
          <button className="btn btn-outline menu-btn menu-btn-help" onClick={onHelp}>{t('help', lang)}</button>
          {devMode && <div className="menu-dev-badge" onClick={onDev}>DEV MODE</div>}
          <div className="author-credit" onClick={handleAuthorClick}>by ColaSensei</div>
          <div className="donate-credit" onClick={() => setShowDonate(true)}>
            {lang === 'zh' ? '捐赠感谢' : 'Donation Thanks'}
          </div>
        </div>
      </div>

      {showDonate && <DonateModal lang={lang} onClose={() => setShowDonate(false)} />}
    </div>
  );
};
