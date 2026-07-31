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
  /** 最近一次打击的偏移 (ms)，正=晚，负=早，用于准度条 */
  lastOffset: number;
  pauseRewind: number;
}

interface UseGameEngineOptions {
  config: GameConfig;
  notes: Note[];
  duration: number;
  onFinish: (results: GameResults) => void;
  getCurrentTime: () => number;
  onPlayHitSound?: () => void;
  latencyOffset?: number;
  /** 正确音效：到点自动播放正确打击音，但不影响判定和计分 */
  correctHitSound?: boolean;
  onResume?: () => void;
  /** 前摇冻结：为 true 时不做任何判定（自动/手动/正确音效/结束） */
  getLeadFrozen?: () => boolean;
}

export function useGameEngine({
  config,
  notes,
  duration,
  onFinish,
  getCurrentTime,
  onPlayHitSound,
  latencyOffset = 0,
  correctHitSound = false,
  onResume,
  getLeadFrozen = () => false,
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
  const pauseRewindRef = useRef(-1);
  const onResumeRef = useRef<(() => void) | undefined>(undefined);
  onResumeRef.current = onResume;
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
  // 正确音效：独立于 autoplay，只播声音不改判定
  const correctHitSoundRef = useRef(correctHitSound);
  correctHitSoundRef.current = correctHitSound;
  const correctSoundIdxRef = useRef(0);
  const correctSoundDoublesRef = useRef<Set<number>>(new Set());
  const getLeadFrozenRef = useRef(getLeadFrozen);
  getLeadFrozenRef.current = getLeadFrozen;
  // 渲染窗口起始索引：避免 notes.filter 全量遍历，高密度谱面 O(n)→O(窗口)
  const renderStartIdxRef = useRef(0);
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
    lastOffset: 0,
    pauseRewind: -1,
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
    correctSoundIdxRef.current = 0;
    correctSoundDoublesRef.current = new Set();
    renderStartIdxRef.current = 0;
    noteIndexRef.current = 0;
    finishedRef.current = false;
    isPlayingRef.current = true;
    pausedRef.current = false;
    pauseRewindRef.current = -1;

    audioManager.onEnded(() => { finishedRef.current = true; });

    setState(s => ({
      ...s,
      currentTime: 0, results: new Map(), combo: 0, maxCombo: 0, score: 0,
      activeNotes: [], activeHolds: new Set(), isPlaying: true, isFinished: false, paused: false,
      resumeKey: 0, hasGood: false, hasBreak: false, lastOffset: 0,
    }));
  }, []);

  const setPaused = useCallback((p: boolean) => {
    if (p) {
      pausedRef.current = true;
      pauseRewindRef.current = -1;
      setState(s => ({ ...s, paused: true, pauseRewind: -1 }));
    } else {
      pauseRewindRef.current = 3;
      setState(s => ({ ...s, pauseRewind: 3, resumeKey: s.resumeKey + 1 }));
      const tick = () => {
        pauseRewindRef.current--;
        if (pauseRewindRef.current > 0) {
          setState(s => ({ ...s, pauseRewind: pauseRewindRef.current }));
          setTimeout(tick, 1000);
        } else {
          pausedRef.current = false;
          onResumeRef.current?.();
          setState(s => ({ ...s, paused: false, pauseRewind: -1 }));
        }
      };
      setTimeout(tick, 1000);
    }
  }, []);

  // ——— 按下去 ———
  const handlePress = useCallback(
    (track: number): { hit: boolean; playSound: boolean; judgmentType: string } => {
      // 前摇冻结：还不判定
      if (!isPlayingRef.current || pausedRef.current || getLeadFrozenRef.current()) return { hit: false, playSound: false, judgmentType: '' };
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
      // 前摇冻结：还不判定
      if (!isPlayingRef.current || pausedRef.current || getLeadFrozenRef.current()) return;
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
    const lastR = noteResults.length > 0 ? noteResults[noteResults.length - 1] : null;
    setState(s => ({
      ...s,
      results: new Map(noteResults.map(r => [r.note.id, r])),
      combo, maxCombo, score, activeHolds: holds,
      hasGood, hasBreak,
      lastOffset: lastR ? lastR.judgment.offset : s.lastOffset,
    }));
  }

  // ——— 主循环 ———
  useEffect(() => {
    if (!state.isPlaying) return;
    if (state.paused) return;

    const loop = () => {
      const now = getCurrentTime() + latencyRef.current;
      // 判定基准：
      // - 真人：用本人校准时间 now（含 latencyOffset，补偿设备输出延迟）
      // - autoPlay：纯自动演示，应与视觉落线一致（音符到线即按），
      //   若也加 latencyOffset 会系统性提前/延后按键（尤其是设置过延迟校准的用户）。
      // - 前摇冻结：-Infinity 屏蔽一切判定。
      const judgeNow = getLeadFrozenRef.current()
        ? Number.NEGATIVE_INFINITY
        : (autoPlayRef.current ? now - latencyRef.current : now);
      const results = resultsRef.current;

      if (autoPlayRef.current) {
        for (let i = noteIndexRef.current; i < notes.length; i++) {
          const note = notes[i];
          if (results.has(note.id)) continue;
          if (holdActiveRef.current.has(note.id)) continue;
          if (judgeNow >= note.startTime) {
            if (note.type === 'hold') {
              // hold：先按住，等自动收尾
              holdActiveRef.current.set(note.id, { pressTime: judgeNow });
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

      // 正确音效：到点自动播放，不碰 results（暂停/倒计时跳过）
      if (correctHitSoundRef.current && !autoPlayRef.current) {
        const csDoubles = correctSoundDoublesRef.current;
        let csIdx = correctSoundIdxRef.current;
        while (csIdx < notes.length && judgeNow >= notes[csIdx].startTime) {
          const note = notes[csIdx];
          if (note.isDouble && note.doubleGroupId !== null) {
            if (!csDoubles.has(note.doubleGroupId)) {
              csDoubles.add(note.doubleGroupId);
              onPlayHitSound?.();
            }
          } else {
            onPlayHitSound?.();
          }
          csIdx++;
        }
        correctSoundIdxRef.current = csIdx;
      }

      // 按住自动衔接 hold：真人持续按住某轨道时，窗口内到期的下一个未判 hold
      // 自动激活。否则同轨道连续 hold（前一个 endTime 紧接下一个 startTime）
      // 玩家一直按住不松手时，第二个 hold 永远等不到 handlePress → 被判 miss「按不住」。
      pressedTracksRef.current.forEach(track => {
        for (let i = noteIndexRef.current; i < notes.length; i++) {
          const note = notes[i];
          if (note.track !== track) continue;
          if (note.type !== 'hold') continue;
          if (results.has(note.id)) continue;
          if (holdActiveRef.current.has(note.id)) continue;
          const offset = judgeNow - note.startTime;
          if (offset > windows.timeA + devRef.current.pressOffset) continue; // 太晚
          if (offset < -windows.timeC) continue; // 太早
          holdActiveRef.current.set(note.id, { pressTime: judgeNow });
          break; // 每轨道一次只衔接一个
        }
      });

      // Miss 检测
      while (noteIndexRef.current < notes.length) {
        const note = notes[noteIndexRef.current];
        if (holdActiveRef.current.has(note.id)) { noteIndexRef.current++; continue; }
        if (results.has(note.id)) { noteIndexRef.current++; continue; }
        if (isNoteMissed(note, judgeNow, windows)) {
          results.set(note.id, { note, judgment: { type: 'miss', offset: Infinity, time: note.startTime }, score: 0 });
          updateScoreState(Array.from(results.values()));
          noteIndexRef.current++;
        } else break;
      }

      // hold 自动收尾（autoPlay 视为始终按住：pressedTracks 为空，否则 hold 永不收尾，
      // 导致 autoPlay 下前几个 hold 不出分不记连击，直到游戏结束才被硬补 perfect）
      holdActiveRef.current.forEach((_info, noteId) => {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;
        const track = note.track;
        const isPressed = autoPlayRef.current || pressedTracksRef.current.has(track);
        if (shouldAutoEndHold(note, judgeNow, isPressed)) {
          results.set(note.id, { note, judgment: { type: 'perfect', offset: 0, time: note.endTime }, score: noteScore });
          holdActiveRef.current.delete(noteId);
          updateScoreState(Array.from(results.values()));
        }
      });

      // 结束了？
      const effectiveDuration = duration > 0 ? duration : 999_999_999;
      const songEnded = judgeNow >= effectiveDuration - devRef.current.gameEndEarly;
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
      if (frameCountRef.current % Math.max(1, devRef.current.stateThrottleFrames) === 0) {
        // 过期的 hold 该删删了
        const nowPerf = performance.now();
        const holdBuf = devRef.current.holdCompleteBuffer;
        completedHoldsRef.current.forEach((t, id) => {
          if (nowPerf - t > holdBuf) completedHoldsRef.current.delete(id);
        });

        // 窗口化渲染：只遍历 noteIndex 附近，避免 notes.filter 全量 O(n)
        let rsIdx = renderStartIdxRef.current;
        // 收缩窗口起点：跳过早已判定完且超出 lookbehind 的音符
        while (rsIdx < notes.length && notes[rsIdx].endTime - now < -devRef.current.lookbehind
          && results.has(notes[rsIdx].id)) {
          rsIdx++;
        }
        renderStartIdxRef.current = Math.max(0, rsIdx);

        const visibleNotes: Note[] = [];
        const maxN = devRef.current.maxVisibleNotes;
        for (let i = rsIdx; i < notes.length && visibleNotes.length < maxN; i++) {
          const n = notes[i];
          if (n.startTime - now > devRef.current.lookahead) break;
          if (holdActiveRef.current.has(n.id)) { visibleNotes.push(n); continue; }
          if (completedHoldsRef.current.has(n.id)) { visibleNotes.push(n); continue; }
          if (n.type === 'tap' && results.has(n.id)) continue;
          if (n.type === 'hold' && results.has(n.id)) {
            const r = results.get(n.id)!;
            if (r.judgment.type === 'good' || r.judgment.type === 'perfect') continue;
            if (n.endTime - now > -devRef.current.lookbehind) visibleNotes.push(n);
            continue;
          }
          if (n.endTime - now > -devRef.current.lookbehind) visibleNotes.push(n);
        }
        setState(s => ({ ...s, currentTime: now, activeNotes: visibleNotes }));
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state.isPlaying, state.paused, state.resumeKey, notes, duration, windows, onFinish, getCurrentTime, onPlayHitSound, noteScore]);

  return { state, start, setPaused, handlePress, handleRelease, resultsRef, holdActiveRef };
}
