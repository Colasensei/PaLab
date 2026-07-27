/**
 * LoadingOverlay — 通用加载遮罩
 *
 * 独立于 App 级 screen 管理，可在任意组件内渲染。
 * 支持后台任务 + 最小时长，完成后自动调用 onComplete。
 *
 * @example
 * // 基础用法（纯假加载 2.5~4s）
 * <LoadingOverlay lang={lang} pageTitle="加载中..." onComplete={done} />
 *
 * // 带后台任务
 * <LoadingOverlay lang={lang} pageTitle="加载中..." onComplete={done}
 *   task={async () => { await preloadAssets(); }} />
 *
 * // 自定义时长
 * <LoadingOverlay lang={lang} pageTitle="加载中..." onComplete={done}
 *   minDuration={1500} />
 */

import React, { useEffect, useState, useRef } from 'react';
import { Lang } from '@/utils/lang';
import { getRandomTip } from '@/utils/tips';
import { runWithLoading } from '@/utils/loading';

interface LoadingOverlayProps {
  /** 加载完成后回调 */
  onComplete: () => void;
  /** 当前语言 */
  lang: Lang;
  /** 标题文字（无 chartInfo 时显示） */
  pageTitle?: string;
  /** 背景图片 URL（会被模糊 + 压暗） */
  bgImage?: string | null;
  /** 后台异步任务 */
  task?: () => Promise<void>;
  /** 最小时长 ms（默认 2500） */
  minDuration?: number;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  onComplete, lang, pageTitle, bgImage, task, minDuration,
}) => {
  const [tip] = useState(() => getRandomTip(lang));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    runWithLoading(task, minDuration).then(() => {
      if (!cancelled) onCompleteRef.current();
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lo-overlay">
      {/* 背景 */}
      {bgImage && (
        <div className="lo-bg" style={{ backgroundImage: `url(${bgImage})` }} />
      )}
      <div className="lo-dimming" />

      {/* 标题 */}
      <div className="lo-info">
        <div className="lo-title">{pageTitle || (lang === 'zh' ? '加载中...' : 'Loading...')}</div>
      </div>

      {/* 左下角 Tip */}
      <div className="lo-tip">
        <span className="lo-tip-label">TIP</span>
        <span className="lo-tip-text">{tip}</span>
      </div>

      {/* 右下角 LOADING */}
      <div className="lo-loading">
        <div className="lo-loading-wrap">
          <span className="lo-loading-text">LOADING</span>
          <div className="lo-loading-bar" />
        </div>
      </div>
    </div>
  );
};
