import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Note, GameConfig, NoteResult, TimingWindows, GameResults,
} from '@/types';
import {
  judgeNote, judgeHoldRelease, shouldAutoEndHold, isNoteMissed,
  calculateResults, getNoteScore, getJudgmentMultiplier,
  audioManager,
} from '@/utils';
import { getDevOverride } from '@/utils/devOverrides';

export interface GameEngineState {
  notes: Note[];
  currentTime: number;
  results: Map<number, NoteResult>;
  combo: number;
  maxCombo: number;
  score: number;
  activeNotes: Note[];
  /** 正被按住的 hold（id） */
  activeHolds: Set<number>;
  isPlaying: boolean;
  isFinished: boolean;
  paused: boolean;
  resumeKey: number;
  /** 是否出现过 Good */
  hasGood: boolean;
  /** 是否断连过 (Bad/Miss) */
  hasBreak: boolean;
}

interface UseGameEngineOptions {
  config: GameConfig;
  notes: Note[];
  duration: number;
  onFinish: (results: GameResults) => void;
  getCurrentTime: () => number;
  onPlayHitSound?: () => void;
  latencyOffset?: number;
}

export function useGameEngine({
  config,
  notes,
  duration,
  onFinish,
  getCurrentTime,
  onPlayHitSound,
  latencyOffset = 0,
}: UseGameEngineOptions) {
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const resultsRef = useRef<Map<number, NoteResult>>(new Map());
  const pressedTracksRef = useRef<Set<number>>(new Set());
  /** holdId → {pressTime}，追着按了多久 */
  const holdActiveRef = useRef<Map<number, { pressTime: number }>>(new Map());
  const noteIndexRef = useRef(0);
  const finishedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const pausedRef = useRef(false);
  const autoPlayRef = useRef(config.autoPlay);
  autoPlayRef.current = config.autoPlay;
  const latencyRef = useRef(latencyOffset);
  latencyRef.current = latencyOffset;
  const getTimeRef = useRef(getCurrentTime);
  getTimeRef.current = getCurrentTime;
  const doubleSoundRef = useRef<Set<number>>(new Set());
  const completedHoldsRef = useRef<Map<number, number>>(new Map());
  const hasSongRef = useRef(!!config.songUrl);
  hasSongRef.current = !!config.songUrl;
  const devRef = useRef({
    timeB: getDevOverride('j_timeB'),
    timeA: getDevOverride('j_timeA'),
    timeC: getDevOverride('j_timeC'),
    missThreshold: getDevOverride('j_missThreshold'),
    earlyTolerance: getDevOverride('j_earlyTolerance'),
    pressOffset: getDevOverride('j_pressOffset'),
    lookahead: getDevOverride('p_noteLookahead'),
    lookbehind: getDevOverride('p_noteLookbehind'),
    gameEndEarly: getDevOverride('p_gameEndEarly'),
    holdCompleteBuffer: getDevOverride('h_completeBuffer'),
    holdReleaseForgiveness: getDevOverride('h_releaseForgiveness'),
    stateThrottleFrames: getDevOverride('stateThrottleFrames'),
    maxVisibleNotes: getDevOverride('perf_maxVisibleNotes'),
    skipFrames: getDevOverride('perf_skipFrames'),
  });

  const [state, setState] = useState<GameEngineState>({
    notes,
    currentTime: 0,
    results: new Map(),
    combo: 0,
    maxCombo: 0,
    score: 0,
    activeNotes: [],
    activeHolds: new Set(),
    isPlaying: false,
    isFinished: false,
    paused: false,
    resumeKey: 0,
    hasGood: false,
    hasBreak: false,
  });

  // 判定窗口，dev 覆盖优先（
  const windows: TimingWindows = {
    timeB: devRef.current.timeB,
    timeA: devRef.current.timeA,
    timeC: devRef.current.timeC,
  };
  const noteScore = getNoteScore(notes.length);

  const start = useCallback(() => {
    resultsRef.current = new Map();
    pressedTracksRef.current = new Set();
    holdActiveRef.current = new Map();
    doubleSoundRef.current = new Set();
    completedHoldsRef.current = new Map();
    noteIndexRef.current = 0;
    finishedRef.current = false;
    isPlayingRef.current = true;
    pausedRef.current = false;

    audioManager.onEnded(() => { finishedRef.current = true; });

    setState(s => ({
      ...s,
      currentTime: 0, results: new Map(), combo: 0, maxCombo: 0, score: 0,
      activeNotes: [], activeHolds: new Set(), isPlaying: true, isFinished: false, paused: false,
      resumeKey: 0, hasGood: false, hasBreak: false,
    }));
  }, []);

  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p;
    setState(s => ({ ...s, paused: p, resumeKey: p ? s.resumeKey : s.resumeKey + 1 }));
  }, []);

  // ——— 按下去 ———
  const handlePress = useCallback(
    (track: number): { hit: boolean; playSound: boolean; judgmentType: string } => {
      if (!isPlayingRef.current || pausedRef.current) return { hit: false, playSound: false, judgmentType: '' };
      pressedTracksRef.current.add(track);
      const now = getTimeRef.current();
      const results = resultsRef.current;

      // 找这条轨上离 now 最近的没判的 tap
      let best: { note: Note; offset: number } | null = null;
      for (let i = noteIndexRef.current; i < notes.length; i++) {
        const note = notes[i];
        if (note.track !== track) continue;
        if (note.type !== 'tap') continue;
        if (results.has(note.id)) continue;
        const offset = now - note.startTime;
        if (offset > windows.timeA + devRef.current.pressOffset) continue;
        if (offset < -windows.timeC) continue;
        if (!best || Math.abs(offset) < Math.abs(best.offset)) {
          best = { note, offset };
        }
      }
      if (best) {
        const judgment = judgeNote(best.note, now, null, windows);
        const jType = judgment.type;
        results.set(best.note.id, { note: best.note, judgment, score: getJudgmentMultiplier(jType) * noteScore });
        updateScoreState(Array.from(results.values()));
        // bad/miss 菜了就别响了（
        if (jType === 'bad' || jType === 'miss') {
          return { hit: true, playSound: false, judgmentType: jType };
        }
        let playSound = true;
        if (best.note.isDouble && best.note.doubleGroupId !== null) {
          if (!doubleSoundRef.current.has(best.note.doubleGroupId)) {
            doubleSoundRef.current.add(best.note.doubleGroupId);
          } else {
            playSound = false;
          }
        }
        return { hit: true, playSound, judgmentType: jType };
      }

      // 看看这轨有没有能接的 hold
      for (let i = noteIndexRef.current; i < notes.length; i++) {
        const note = notes[i];
        if (note.track !== track) continue;
        if (note.type !== 'hold') continue;
        if (results.has(note.id)) continue;
        if (holdActiveRef.current.has(note.id)) continue;
        const offset = now - note.startTime;
        if (offset > windows.timeA + devRef.current.pressOffset) continue;
        if (offset < -windows.timeC) continue;
        holdActiveRef.current.set(note.id, { pressTime: now });
        // 立刻刷状态，别等下一帧（
        updateScoreState(Array.from(resultsRef.current.values()));
        let playSound = true;
        if (note.isDouble && note.doubleGroupId !== null) {
          if (!doubleSoundRef.current.has(note.doubleGroupId)) {
            doubleSoundRef.current.add(note.doubleGroupId);
          } else {
            playSound = false;
          }
        }
        return { hit: true, playSound, judgmentType: 'hold' };
      }

      return { hit: false, playSound: false, judgmentType: '' };
    },
    [notes, windows, noteScore],
  );

  // ——— 松手 ———
  const handleRelease = useCallback(
    (track: number) => {
      if (!isPlayingRef.current || pausedRef.current) return;
      pressedTracksRef.current.delete(track);

      holdActiveRef.current.forEach((_info, noteId) => {
        const note = notes.find(n => n.id === noteId);
        if (!note || note.track !== track) return;
        const results = resultsRef.current;
        if (results.has(noteId)) return;

        const now = getTimeRef.current();
        const heldTime = now - note.startTime;
        const holdDuration = note.endTime - note.startTime;
        const releaseRatio = getDevOverride('h_releaseRatio');
        const enoughHeld = holdDuration <= 0 || heldTime >= holdDuration * releaseRatio;

        if (enoughHeld) {
          results.set(noteId, { note, judgment: { type: 'perfect', offset: 0, time: now }, score: noteScore });
        } else {
          results.set(noteId, { note, judgment: { type: 'bad', offset: heldTime, time: now }, score: 0 });
        }
        holdActiveRef.current.delete(noteId);
        completedHoldsRef.current.set(noteId, performance.now());
        updateScoreState(Array.from(results.values()));
      });
    },
    [notes, noteScore],
  );

  function updateScoreState(noteResults: NoteResult[]) {
    let combo = 0, maxCombo = 0, score = 0;
    let hasGood = false, hasBreak = false;
    for (const r of noteResults) {
      if (r.judgment.type === 'perfect') { combo++; }
      else if (r.judgment.type === 'good') { combo++; hasGood = true; }
      else { combo = 0; hasBreak = true; }
      maxCombo = Math.max(maxCombo, combo);
      score += r.score;
    }
    const holds = new Set<number>();
    holdActiveRef.current.forEach((_, id) => holds.add(id));
    setState(s => ({
      ...s,
      results: new Map(noteResults.map(r => [r.note.id, r])),
      combo, maxCombo, score, activeHolds: holds,
      hasGood, hasBreak,
    }));
  }

  // ——— 主循环 ———
  useEffect(() => {
    if (!state.isPlaying) return;
    // 暂停就别转了，省电（
    if (state.paused) return;

    const loop = () => {
      const now = getCurrentTime() + latencyRef.current;
      const results = resultsRef.current;

      // AutoPlay：机器人大杀四方（
      if (autoPlayRef.current) {
        for (let i = noteIndexRef.current; i < notes.length; i++) {
          const note = notes[i];
          if (results.has(note.id)) continue;
          if (holdActiveRef.current.has(note.id)) continue;
          if (now >= note.startTime) {
            if (note.type === 'hold') {
              // hold：先按住，等自动收尾
              holdActiveRef.current.set(note.id, { pressTime: now });
            } else {
              results.set(note.id, { note, judgment: { type: 'perfect', offset: 0, time: note.startTime }, score: noteScore });
            }
            if (note.isDouble && note.doubleGroupId !== null) {
              if (!doubleSoundRef.current.has(note.doubleGroupId)) {
                doubleSoundRef.current.add(note.doubleGroupId);
                onPlayHitSound?.();
              }
            } else {
              onPlayHitSound?.();
            }
          } else break;
        }
        updateScoreState(Array.from(results.values()));
      }

      // Miss 检测：到点了还没人管 → 不好意思（
      while (noteIndexRef.current < notes.length) {
        const note = notes[noteIndexRef.current];
        // 已经在 hold 了，跳过
        if (holdActiveRef.current.has(note.id)) { noteIndexRef.current++; continue; }
        if (results.has(note.id)) { noteIndexRef.current++; continue; }
        if (isNoteMissed(note, now, windows)) {
          results.set(note.id, { note, judgment: { type: 'miss', offset: Infinity, time: note.startTime }, score: 0 });
          updateScoreState(Array.from(results.values()));
          noteIndexRef.current++;
        } else break;
      }

      // hold 自动收尾：按到 endTime → 自动 perfect
      holdActiveRef.current.forEach((_info, noteId) => {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;
        const track = note.track;
        const isPressed = pressedTracksRef.current.has(track);
        if (shouldAutoEndHold(note, now, isPressed)) {
          results.set(note.id, { note, judgment: { type: 'perfect', offset: 0, time: note.endTime }, score: noteScore });
          holdActiveRef.current.delete(noteId);
          updateScoreState(Array.from(results.values()));
        }
      });

      // 结束了？
      const effectiveDuration = duration > 0 ? duration : 999_999_999;
      const songEnded = now >= effectiveDuration - devRef.current.gameEndEarly;
      const shouldEnd = hasSongRef.current
        ? (songEnded || finishedRef.current)
        : (results.size + holdActiveRef.current.size >= notes.length || songEnded || finishedRef.current);

      if (shouldEnd && !finishedRef.current) {
        finishedRef.current = true;
        // 还活着的 hold，到点自动 perfect 收
        for (const note of notes) {
          if (!results.has(note.id)) {
            results.set(note.id, { note, judgment: { type: 'perfect', offset: 0, time: note.endTime }, score: noteScore });
          }
        }
        updateScoreState(Array.from(results.values()));
        isPlayingRef.current = false;
        const finalResults = calculateResults(
          Array.from(results.values()), notes.length,
          autoPlayRef.current, null, config.chartConstant,
          config.trackCount,
        );
        setState(s => ({ ...s, isPlaying: false, isFinished: true }));
        onFinish(finalResults);
        return;
      }

      // 节流：别每帧都刷 React，扛不住（
      frameCountRef.current++;
      const skip = devRef.current.skipFrames || 0;
      if (frameCountRef.current % (skip + 1) !== 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (frameCountRef.current % devRef.current.stateThrottleFrames === 0) {
        // 过期的 hold 该删删了
        const nowPerf = performance.now();
        const holdBuf = devRef.current.holdCompleteBuffer;
        completedHoldsRef.current.forEach((t, id) => {
          if (nowPerf - t > holdBuf) completedHoldsRef.current.delete(id);
        });

        let visibleNotes = notes.filter(n => {
          // 还按着的 hold
          if (holdActiveRef.current.has(n.id)) return true;
          // 松手后的缓冲动画
          if (completedHoldsRef.current.has(n.id)) return true;
          // 完事的 tap → 删
          if (n.type === 'tap' && results.has(n.id)) return false;
          // 完事的 hold → 删
          if (n.type === 'hold' && results.has(n.id)) {
            const r = results.get(n.id)!;
            if (r.judgment.type === 'good' || r.judgment.type === 'perfect') return false;
            return n.endTime - now > -devRef.current.lookbehind;
          }
          return n.endTime - now > -devRef.current.lookbehind && n.startTime - now < devRef.current.lookahead;
        });
        // 太多了裁一裁，别爆内存（
        if (visibleNotes.length > devRef.current.maxVisibleNotes) {
          visibleNotes = visibleNotes.slice(-devRef.current.maxVisibleNotes);
        }
        setState(s => ({ ...s, currentTime: now, activeNotes: visibleNotes }));
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state.isPlaying, state.paused, state.resumeKey, notes, duration, windows, onFinish, getCurrentTime, onPlayHitSound, noteScore]);

  return { state, start, setPaused, handlePress, handleRelease };
}
