import React from 'react';
import { Lang } from '@/utils/lang';

interface Props {
  onChartLibrary: () => void;
  onCreateChart: () => void;
  lang: Lang;
}

export const PlayMenu: React.FC<Props> = ({ onChartLibrary, onCreateChart, lang }) => (
  <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <h2 style={{ color: 'var(--text-secondary)', letterSpacing: 4, fontSize: 15 }}>{lang === 'zh' ? '选择模式' : 'Select Mode'}</h2>
      <button className="menu-btn btn-primary" onClick={onChartLibrary} style={{ width: 280, padding: '14px 0' }}>{lang === 'zh' ? '谱面库' : 'Chart Library'}</button>
      <button className="menu-btn btn-outline" onClick={onCreateChart} style={{ width: 280, padding: '14px 0' }}>{lang === 'zh' ? '制作谱面' : 'Create Chart'}</button>
    </div>
  </div>
);
