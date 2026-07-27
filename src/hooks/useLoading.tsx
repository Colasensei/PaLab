/**
 * useLoading — 通用加载钩子
 *
 * 在任意组件内触发 LoadingOverlay，支持后台任务。
 * 返回 { loading, LoadingUI, startLoading }
 *
 * @example
 * const { loading, LoadingUI, startLoading } = useLoading({ lang, uiBlur: settings.uiBlur });
 *
 * // 在 JSX 中放置 LoadingUI（任意位置，建议在 return 顶层）
 * return (<>
 *   {loading && <LoadingUI pageTitle="加载中..." bgImage={someCover} />}
 *   {/* 页面内容... * /}
 * </>);
 *
 * // 在事件处理中触发
 * const handleClick = async () => {
 *   await startLoading({
 *     pageTitle: '正在加载...',
 *     task: async () => { await heavyWork(); },
 *   });
 *   // 加载完成，继续后续逻辑
 * };
 */

import React, { useState, useCallback, useRef } from 'react';
import { Lang } from '@/utils/lang';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { runWithLoading } from '@/utils/loading';

interface UseLoadingOptions {
  lang: Lang;
  uiBlur?: boolean;
}

interface StartLoadingOptions {
  /** 标题文字 */
  pageTitle?: string;
  /** 背景图 URL */
  bgImage?: string | null;
  /** 后台异步任务（完成后一起结束） */
  task?: () => Promise<void>;
  /** 最小时长 ms */
  minDuration?: number;
}

export function useLoading({ lang }: UseLoadingOptions) {
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState<StartLoadingOptions>({});
  const resolveRef = useRef<(() => void) | null>(null);

  const startLoading = useCallback((options: StartLoadingOptions = {}): Promise<void> => {
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      setOpts(options);
      setLoading(true);
    });
  }, []);

  const handleComplete = useCallback(() => {
    setLoading(false);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  const LoadingUI = loading ? (
    <LoadingOverlay
      lang={lang}
      pageTitle={opts.pageTitle}
      bgImage={opts.bgImage}
      task={opts.task}
      minDuration={opts.minDuration}
      onComplete={handleComplete}
    />
  ) : null;

  return { loading, LoadingUI, startLoading };
}
