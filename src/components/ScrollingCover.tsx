import React, { useState, useEffect, useRef } from 'react';
import { loadCharts } from '@/utils';
import type { ChartPackage } from '@/components';

const ANIM_MS = 600;
const MIN_GAP = 5000;
const MAX_GAP = 10000;

export const useScrollingCover = () => {
  const [covers, setCovers] = useState<string[]>([]);
  /** switching=true 时 CSS 驱动动画 */
  const [switching, setSwitching] = useState(false);
  /** 触发重渲染用（更新隐藏 slot 的 URL 后 +1） */
  const [, setTick] = useState(0);

  const coversRef = useRef<string[]>([]);
  /** 当前可见的 slot: 0=A, 1=B */
  const visibleRef = useRef(0);
  /** 两个 slot 各自在 covers 中的索引 */
  const idxA = useRef(0);
  const idxB = useRef(1);

  // 加载
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const charts: ChartPackage[] = await loadCharts();
        if (cancelled) return;
        const urls: string[] = [];
        for (const c of charts) {
          if (c.coverUrl) urls.push(c.coverUrl);
          if (c.illustrationUrl) urls.push(c.illustrationUrl);
        }
        for (let i = urls.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [urls[i], urls[j]] = [urls[j], urls[i]];
        }
        if (!cancelled && urls.length > 1) {
          coversRef.current = urls;
          idxA.current = 0;
          idxB.current = 1;
          visibleRef.current = 0;
          setCovers(urls);
        }
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 定时
  useEffect(() => {
    const list = coversRef.current;
    if (list.length <= 1) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let ticking = false;

    const tick = () => {
      if (!alive || ticking) return;
      ticking = true;
      const delay = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
      timer = setTimeout(() => {
        if (!alive) return;
        setSwitching(true);
        timer = setTimeout(() => {
          if (!alive) return;
          const n = list.length;
          if (visibleRef.current === 0) {
            idxA.current = (idxB.current + 1) % n;
            visibleRef.current = 1;
          } else {
            idxB.current = (idxA.current + 1) % n;
            visibleRef.current = 0;
          }
          setSwitching(false);
          setTick(t => t + 1);
          ticking = false;
          tick();
        }, ANIM_MS);
      }, delay);
    };

    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [covers.length]);

  const list = coversRef.current;
  const urlA = list[idxA.current] || null;
  const urlB = list.length > 1 ? list[idxB.current] : null;

  return { urlA, urlB, switching, slot: visibleRef.current };
};

