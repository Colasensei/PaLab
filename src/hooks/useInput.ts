import { useCallback, useEffect, useRef } from 'react';
import { TrackCount, KEY_MAP } from '@/types';

interface UseInputOptions {
  trackCount: TrackCount;
  onPress: (track: number) => void;
  onRelease: (track: number) => void;
}

export function useInput({ trackCount, onPress, onRelease }: UseInputOptions) {
  const keys = KEY_MAP[trackCount];
  const pressedRef = useRef<Set<string>>(new Set());
  // 用 ref 保存最新回调，避免 effect 频繁重建
  const onPressRef = useRef(onPress);
  const onReleaseRef = useRef(onRelease);
  onPressRef.current = onPress;
  onReleaseRef.current = onRelease;

  const getTrackByKey = useCallback(
    (key: string): number | null => {
      const upperKey = key.toUpperCase();
      const idx = keys.indexOf(upperKey);
      return idx >= 0 ? idx : null;
    },
    [keys],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const track = getTrackByKey(e.key);
      if (track !== null && !pressedRef.current.has(e.key.toUpperCase())) {
        e.preventDefault();
        pressedRef.current.add(e.key.toUpperCase());
        onPressRef.current(track);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const track = getTrackByKey(e.key);
      if (track !== null) {
        e.preventDefault();
        pressedRef.current.delete(e.key.toUpperCase());
        onReleaseRef.current(track);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      pressedRef.current.clear();
    };
  }, [getTrackByKey]); // 只依赖 trackCount（通过 getTrackByKey）

  return { getTrackByKey };
}
