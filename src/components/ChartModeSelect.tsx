import React from 'react';
import { Lang, t } from '@/utils/lang';

interface Props {
  onAuto: () => void;
  onManual: () => void;
  onEditor: () => void;
  lang: Lang;
}

export const ChartModeSelect: React.FC<Props> = ({ onAuto, onManual, onEditor, lang }) => {
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <h2 className="cms-title">{lang === 'zh' ? '制作谱面' : 'Create Chart'}</h2>
      <p className="cms-sub">{lang === 'zh' ? '请选择制作方式' : 'Choose creation method'}</p>

      <div className="cms-buttons">
        <button className="cms-btn cms-btn-auto" onClick={onAuto}>
          <span className="cms-btn-icon">&#9881;</span>
          <span className="cms-btn-label">{lang === 'zh' ? '自动分析' : 'Auto Analysis'}</span>
          <span className="cms-btn-desc">{lang === 'zh' ? '导入音频，AI 自动生成谱面' : 'Import audio, AI generates chart'}</span>
        </button>

        <button className="cms-btn cms-btn-manual" onClick={onManual}>
          <span className="cms-btn-icon">&#9998;</span>
          <span className="cms-btn-label">{lang === 'zh' ? '手动制作' : 'Manual Creation'}</span>
          <span className="cms-btn-desc">{lang === 'zh' ? '跟随节拍按下按键，录入谱面' : 'Tap along to the beat to record notes'}</span>
        </button>

        <button className="cms-btn cms-btn-editor" onClick={onEditor}>
          <span className="cms-btn-icon">&#9776;</span>
          <span className="cms-btn-label">{lang === 'zh' ? '编辑器' : 'Editor'}</span>
          <span className="cms-btn-desc">{lang === 'zh' ? '可视化编辑谱面，精确放置每个音符' : 'Visual chart editor, place notes precisely'}</span>
        </button>
      </div>
    </div>
  );
};
