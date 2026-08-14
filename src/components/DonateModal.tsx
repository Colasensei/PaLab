import React from 'react';
import { Lang } from '@/utils/lang';

interface Props {
  lang: Lang;
  onClose: () => void;
}

const DONORS = [
  { name: '重音teto的法棍厨子', note: '' },
  { name: '乖猫猫$ǿ*', note: '' },
];

export const DonateModal: React.FC<Props> = ({ lang, onClose }) => {
  return (
    <div className="donate-overlay" onClick={onClose}>
      <div className="donate-modal" onClick={e => e.stopPropagation()}>
        <div className="donate-title">
          {lang === 'zh' ? '捐赠感谢' : 'Donation Thanks'}
        </div>

        <p className="donate-intro">
          {lang === 'zh'
            ? '衷心感谢以下朋友对 Palab 开发的慷慨支持。你们的帮助让这个项目得以继续前行。'
            : 'Sincere thanks to the following friends for their generous support of Palab development. Your help keeps this project moving forward.'}
        </p>

        <div className="donate-list">
          {DONORS.map((donor, i) => (
            <div key={i} className="donate-item">
              <div className="donate-name">{donor.name}</div>
              {donor.note && <div className="donate-note">{donor.note}</div>}
            </div>
          ))}
        </div>

        <p className="donate-footer">
          {lang === 'zh' ? '致以最诚挚的感谢！' : 'With deepest gratitude!'}
        </p>

        <button className="donate-close-btn" onClick={onClose}>
          {lang === 'zh' ? '关闭' : 'Close'}
        </button>
      </div>
    </div>
  );
};
