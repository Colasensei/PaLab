import React, { useEffect, useState } from 'react';

/**
 * 封面缩略图：把完整封面（dataURL / blob）在 Canvas 中压缩成小尺寸缩略图，
 * 内存缓存避免重复解码。列表页用缩略图渲染（解决列表加载/滚动卡顿），
 * 详情 / 播放大图请直接用完整 src。
 */

const thumbCache = new Map<string, string>();
const MAX_CACHE = 300;

function getCoverThumb(src: string, maxSide: number): Promise<string> {
  const key = `${src}::${maxSide}`;
  const cached = thumbCache.get(key);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const maxDim = Math.max(img.width, img.height);
        const scale = maxDim > maxSide ? maxSide / maxDim : 1;
        const cw = Math.max(1, Math.floor(img.width * scale));
        const ch = Math.max(1, Math.floor(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (thumbCache.size >= MAX_CACHE) {
          const first = thumbCache.keys().next().value;
          if (first !== undefined) thumbCache.delete(first);
        }
        thumbCache.set(key, dataUrl);
        resolve(dataUrl);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

interface Props {
  src: string | null | undefined;
  /** 缩略图最长边（px） */
  maxSide?: number;
  /** 无图 / 缩略图未就绪时的占位节点 */
  placeholder?: React.ReactNode;
  imgProps?: React.ImgHTMLAttributes<HTMLImageElement>;
}

export const CoverThumb: React.FC<Props> = ({ src, maxSide = 160, placeholder = null, imgProps }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setThumb(null);
    if (!src) return;
    getCoverThumb(src, maxSide).then(t => { if (alive) setThumb(t); });
    return () => { alive = false; };
  }, [src, maxSide]);
  if (!src || !thumb) return <>{placeholder}</>;
  return <img src={thumb} alt="" {...imgProps} />;
};

export default CoverThumb;
