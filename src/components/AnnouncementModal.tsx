import React from 'react';
import { createPortal } from 'react-dom';
import { Lang } from '@/utils/lang';
import type { LsPackage } from '@/utils/lingyanspace';

interface Props {
  announcements: LsPackage[];
  onClose: () => void;
  lang: Lang;
}

function fmtTime(ts: string) {
  const t = parseInt(ts, 10);
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const btnStyle: React.CSSProperties = { cursor: 'pointer', padding: '7px 16px', fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: '#ccc', boxShadow: 'none', whiteSpace: 'nowrap' };

/** 公告 / 关于界面：release 置顶在最上，beta 随后；未读通过黄色 NEW 标记（进入即全部已读） */
export const AnnouncementModal: React.FC<Props> = ({ announcements, onClose, lang }) => {
  const sorted = [...announcements].sort((a, b) => {
    if (a.packageStatus === 'release' && b.packageStatus !== 'release') return -1;
    if (a.packageStatus !== 'release' && b.packageStatus === 'release') return 1;
    return parseInt(b.createTimeStamp, 10) - parseInt(a.createTimeStamp, 10);
  });

  const modal = (
    <div className="ann-overlay">
      <div className="ann-top">
        <button className="btn btn-primary ann-back" onClick={onClose} style={btnStyle}>{lang === 'zh' ? '返回' : 'Back'}</button>
        <h3 className="ann-title">{lang === 'zh' ? '公告' : 'Announcements'}</h3>
        <span className="ann-count">{announcements.length}</span>
      </div>
      <div className="ann-list">
        {sorted.length === 0 ? (
          <div className="ann-empty">{lang === 'zh' ? '暂无公告' : 'No announcements'}</div>
        ) : sorted.map(a => (
          <div className={`ann-item${a.packageStatus === 'release' ? ' release' : ''}`} key={a.id}>
            {a.packageStatus === 'release' && <span className="ann-badge">{lang === 'zh' ? '置顶' : 'PIN'}</span>}
            <div className="ann-item-title">{a.versionNum}</div>
            {a.versionDes && <div className="ann-item-content">{a.versionDes}</div>}
            <div className="ann-item-time">{fmtTime(a.createTimeStamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return createPortal(modal, document.body);
};
