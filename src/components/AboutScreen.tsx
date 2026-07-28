import React, { useState } from 'react';
import { Lang } from '@/utils/lang';

interface Props {
  lang: Lang;
  onClose: () => void;
  onShowEULA: () => void;
}

const CHANGELOG: { ver: string; date: string; items: string[] }[] = [
  {
    ver: 'Alpha 4.2（正式版）', date: '2026-07-28',
    items: [
      '打击音效延迟大幅优化（管线防休眠、去除热路径阻塞调用）',
      '自定义打击音效修复（设置→素材修复 导入后真正生效）',
      'Android 端打击音质大幅提升',
    ],
  },
  {
    ver: 'Alpha 4.1（正式版）', date: '2026-07-28',
    items: [
      '打击音效预热优化，减少延迟',
      '音符渲染性能优化（CSS box-shadow 精简、GPU 合成层）',
      'ACC 计算性能优化（单次遍历）',
      '自动播放轨道高亮仅在 overlord 模式显示',
    ],
  },
  {
    ver: 'Alpha 4.0（正式版）', date: '2026-07-28',
    items: [
      '修复 n 押音效丢失问题（doubleGroupId:0 / null 统一处理）',
      '修复 hold 音符计分精度',
      'PC / Android 正式双端构建',
    ],
  },
  {
    ver: 'Alpha 3.9（正式版）', date: '2026-07-27',
    items: [
      '修复旧谱 n 押音效丢失问题',
      'n 押分组检测更健壮',
    ],
  },
  {
    ver: 'Alpha 3.7（正式版）', date: '2026-07-27',
    items: [
      '运行时自动检测并修正 n 押分组（缺标注、部分标注、冲突标注自动修复）',
      '自动分析歌曲面板新增「对齐节拍」开关',
      '「关于」界面更新日志支持内容超出时滚动',
    ],
  },
  {
    ver: 'Alpha 3.6（正式版）', date: '2026-07-27',
    items: [
      '新增可视化谱面编辑器（节拍线点击放置、试玩、保存、Zip 导入/导出）',
      '新增捐赠感谢界面',
      '扩充「关于」界面（双栏布局 + 竖屏标签切换）',
      '编辑器自动检测 n 押分组，自动播放多押特效/音效修复',
      'Perfect/Good/Bad 判定分级特效（金/蓝/无），Bad/Miss 不触发音效',
    ],
  },
  {
    ver: 'Alpha 3.5（正式版）', date: '2026-07-26',
    items: [
      '结算界面全面重做（横屏/竖屏自适应，Georgia / Helvetica Neue 字体）',
      '加载界面优化（模糊 15px、进度条对齐、页面跳转动画）',
      'Tips 系统扩展至约 500 条，Fisher-Yates 洗牌无重复',
      '谱面库竖屏间距优化，双击播放，选中状态持久化',
      '新增制谱模式选择（自动生成 / 手动录制）',
      '新增手动录制功能（键盘 + 触屏输入，长按判定）',
      '延迟校准简化为手动滑块 + 节拍预览，标注不稳定警告',
      '暂停恢复功能暂时禁用（冻结问题）',
      '音频 resume 防冻结处理',
      'BPM 始终可编辑（不再限制开发者模式）',
      '音符大小滑块（0.5x ~ 2.0x）',
      '设置面板 UI 优化，警告文字内嵌按钮',
      '修复多处 TypeScript 编译错误',
      '性能优化',
    ],
  },
  {
    ver: 'Alpha 3.4（未发出）', date: '',
    items: [
      '测试在线更新服务（七牛云）',
    ],
  },
];

type AboutTab = 'info' | 'changelog';

export const AboutScreen: React.FC<Props> = ({ lang, onClose, onShowEULA }) => {
  const [tab, setTab] = useState<AboutTab>('info');

  const infoContent = (
    <>
      <div className="about-logo">PALAB</div>
      <div className="about-ver">Alpha 4.2</div>
      <div className="about-ver about-ver-sub">v0.4.2</div>

      <div className="about-section">
        <div className="about-label">{lang === 'zh' ? '作者' : 'Author'}</div>
        <div className="about-name">ColaSensei</div>
      </div>

      <div className="about-section">
        <div className="about-label">{lang === 'zh' ? '协助开发' : 'Contributor'}</div>
        <span className="about-link about-link-plain">C.C</span>
        <span className="about-link about-link-plain">ATHAZA2322</span>
        <a className="about-link" href="https://space.bilibili.com/3546634667428724" target="_blank" rel="noopener noreferrer">
          {lang === 'zh' ? '重音teto的法棍厨子' : 'Teto\'s Baguette Chef'}
        </a>
        <div className="about-contrib-note">{lang === 'zh' ? '帮助测试和提出建议' : 'Testing & feedback'}</div>
      </div>

      <div className="about-links">
        <a className="about-link" href="https://space.bilibili.com/3546689348569553" target="_blank" rel="noopener noreferrer">
          Bilibili @ColaSensei
        </a>
        <a className="about-link" href="https://github.com/ColaSensei" target="_blank" rel="noopener noreferrer">
          GitHub @ColaSensei
        </a>
      </div>

      <button className="about-eula-btn" onClick={onShowEULA}>
        {lang === 'zh' ? '用户协议' : 'Terms of Service'}
      </button>

      <div className="about-section">
        <div className="about-label">{lang === 'zh' ? 'QQ 群' : 'QQ Group'}</div>
        <div className="about-name" style={{ fontSize: 16 }}>1072635157</div>
        <div className="about-contrib-note">{lang === 'zh' ? '测试研讨群聊，欢迎加入，群内有最新版资源' : 'Test & discussion group, latest builds inside'}</div>
      </div>

      <p className="about-footer">
        {lang === 'zh' ? '感谢游玩 Palab' : 'Thanks for playing Palab'}
      </p>
    </>
  );

  const changelogContent = (
    <div className="about-changelog">
      <h2>{lang === 'zh' ? '更新日志' : 'Changelog'}</h2>
      {CHANGELOG.map((entry, i) => (
        <div key={i}>
          <h3>{entry.ver}{entry.date ? ` — ${entry.date}` : ''}</h3>
          <ul>
            {entry.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="screen about-screen">
      {/* 关闭按钮 */}
      <button className="about-close" onClick={onClose}>✕</button>

      {/* 宽屏：双栏布局 */}
      <div className="about-layout about-wide">
        <div className="about-left">{infoContent}</div>
        <div className="about-right">{changelogContent}</div>
      </div>

      {/* 竖屏：标签切换 */}
      <div className="about-tabs about-narrow">
        <div className="about-tab-bar">
          <button
            className={`about-tab ${tab === 'info' ? 'active' : ''}`}
            onClick={() => setTab('info')}
          >
            {lang === 'zh' ? '关于' : 'About'}
          </button>
          <button
            className={`about-tab ${tab === 'changelog' ? 'active' : ''}`}
            onClick={() => setTab('changelog')}
          >
            {lang === 'zh' ? '更新日志' : 'Changelog'}
          </button>
        </div>
        <div className="about-tab-content">
          {tab === 'info' ? infoContent : changelogContent}
        </div>
      </div>
    </div>
  );
};
