import React, { useEffect, useState } from 'react';
import { makeThumb } from '@/utils/blurImage';

/**
 * 封面缩略图。
 *
 * 谱面包里如果已经预生成了 `coverThumb`（小 JPEG），直接把那个传进 src 即可，
 * 这个组件几乎不做事；没有预生成的老包才会在这里现场压缩一次。
 */

interface Props {
  src: string | null | undefined;
  /** 缩略图最长边（px） */
  maxSide?: number;
  /** 无图 / 缩略图未就绪时的占位节点 */
  placeholder?: React.ReactNode;
  imgProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  /** 为 true 时完全不加载（用于滚动过程中不产生任何解码） */
  defer?: boolean;
}

export const CoverThumb: React.FC<Props> = ({ src, maxSide = 160, placeholder = null, imgProps, defer = false }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    // 滚动中：不发起任何解码。等 defer 变 false（滚动停下）再统一加载。
    if (defer) return;
    let alive = true;
    setThumb(null);
    if (!src) return;
    makeThumb(src, maxSide).then(t => { if (alive && t) setThumb(t); });
    return () => { alive = false; };
  }, [src, maxSide, defer]);
  if (!src || !thumb) return <>{placeholder}</>;
  return <img src={thumb} alt="" {...imgProps} />;
};

export default CoverThumb;
