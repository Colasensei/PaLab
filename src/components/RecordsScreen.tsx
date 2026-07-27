import React from 'react';
import { t, Lang } from '@/utils/lang';
import { AccountInfo, HighScoreRecord } from '@/types';

interface Props {
  lang: Lang;
  account: AccountInfo | null;
  rks: number;
  history: HighScoreRecord[];
  highPP: number;
  playTime: number;
  onProfile: () => void;
  onBack: () => void;
}

function formatPlayTime(ms: number, lang: Lang): string {
  const minutes = ms / 60000;
  const hours = minutes / 60;
  const days = hours / 24;
  if (hours >= 1024) {
    return `${days.toFixed(2)} ${lang === 'zh' ? '天' : 'd'}`;
  }
  if (hours >= 5) {
    return `${hours.toFixed(2)} ${lang === 'zh' ? '小时' : 'h'}`;
  }
  return `${Math.round(minutes)} ${lang === 'zh' ? '分钟' : 'min'}`;
}

export const RecordsScreen: React.FC<Props> = ({ lang, account, rks, history, highPP, playTime, onProfile, onBack }) => {
  const top20 = history.slice().sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0)).slice(0, 20);

  return (
    <div className="screen rec-screen">
      <div className="rec-container">
        {/* 个人信息卡片 */}
        <div className="rec-profile-card" onClick={onProfile}>
          <div className="rec-avatar">
            {account?.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>?</span>}
          </div>
          <div className="rec-profile-text">
            <div className="rec-name">{account?.name || (lang === 'zh' ? '未设置' : 'Not set')}</div>
            <div className="rec-edit-hint">{t('edit', lang)}</div>
          </div>
          {playTime > 0 && (
            <div className="rec-playtime">
              <div className="rec-playtime-label">{lang === 'zh' ? '游戏时长' : 'Play Time'}</div>
              <div className="rec-playtime-val">{formatPlayTime(playTime, lang)}</div>
            </div>
          )}
        </div>

        {/* RKS 大数字 */}
        <div className="rec-rks-hero">
          <div className="rec-rks-label">RKS</div>
          <div className="rec-rks-value">{rks < 0 ? '--' : rks.toFixed(2)}</div>
          <div className="rec-rks-sub">{lang === 'zh' ? '前 20 首平均' : 'Top 20 average'}</div>
        </div>

        {/* 记录列表 */}
        <div className="rec-list">
          <div className="rec-list-header">
            <span>{lang === 'zh' ? '最佳记录' : 'Best Records'}</span>
            <span className="rec-list-count">{top20.length}/20</span>
          </div>
          {top20.length === 0 ? (
            <div className="rec-empty">{t('no.data', lang)}</div>
          ) : (
            top20.map((h, i) => (
              <div key={i} className="rec-row">
                <span className="rec-rank">#{i + 1}</span>
                <span className={`rating-badge rating-${h.rating}`}>{h.rating}</span>
                <div className="rec-row-info">
                  <span className="rec-row-meta">{h.config.difficulty} · {h.config.chartConstant?.toFixed(1)} · {h.config.trackCount}K</span>
                  <span className="rec-row-score">{h.score.toLocaleString()}</span>
                </div>
                <span className="rec-row-pp">{h.pp?.toFixed(2) ?? '0'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
