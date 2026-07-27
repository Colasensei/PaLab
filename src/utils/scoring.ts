import { Note, NoteResult, Judgment, JudgmentType, GameResults, RatingType, TimingWindows, constantToDifficulty } from '@/types';
import { getDevOverride } from './devOverrides';

/**
 * 判定一个音符
 * @param note 音符
 * @param pressTime 按下时间 (ms from song start)
 * @param releaseTime 松开时间 (ms from song start)，tap音符无此值
 * @param windows 判定窗口
 */
export function judgeNote(
  note: Note,
  pressTime: number | null,
  releaseTime: number | null,
  windows: TimingWindows,
): Judgment {
  // 没人按 → Miss（
  if (pressTime === null) {
    return { type: 'miss', offset: Infinity, time: note.startTime };
  }

  const offset = pressTime - note.startTime;
  const absOffset = Math.abs(offset);

  // Perfect: timeB 以内
  if (absOffset <= windows.timeB) {
    return { type: 'perfect', offset, time: pressTime };
  }

  // Good: timeA 以内
  if (absOffset <= windows.timeA) {
    return { type: 'good', offset, time: pressTime };
  }

  // Bad: 只认提前按，晚了直接算 miss（
  if (offset < 0 && absOffset <= windows.timeC) {
    return { type: 'bad', offset, time: pressTime };
  }

  // 太早 → 当没按；太晚 → Miss
  return { type: 'miss', offset, time: pressTime };
}

/**
 * 判定按住音符 - 检查松手是否合格
 * 默认：按住时间 >= 总时长 × 78% 才算合格
 */
export function judgeHoldRelease(
  note: Note,
  releaseTime: number | null,
): boolean {
  if (note.type !== 'hold') return false;
  if (releaseTime === null) return true;
  const holdDuration = note.endTime - note.startTime;
  if (holdDuration <= 0) return false;
  const heldTime = releaseTime - note.startTime;
  const threshold = getDevOverride('h_releaseRatio');
  return heldTime < holdDuration * threshold;
}

/**
 * 检查 hold 是否应该自动结束（超过 endTime 仍按住 → 自动完美结束）
 */
export function shouldAutoEndHold(
  note: Note,
  currentTime: number,
  isTrackPressed: boolean,
): boolean {
  if (note.type !== 'hold') return false;
  return isTrackPressed && currentTime >= note.endTime;
}

/**
 * 检查音符是否已错过（超过判定线太久）
 */
export function isNoteMissed(note: Note, currentTime: number, windows: TimingWindows, missThreshold?: number): boolean {
  const mt = missThreshold ?? getDevOverride('j_missThreshold');
  return currentTime > note.startTime + windows.timeA + mt;
}

/**
 * 计算该音符的基础得分
 */
export function calcNoteScore(judgment: JudgmentType, maxScorePerNote: number): number {
  switch (judgment) {
    case 'perfect': return maxScorePerNote * getDevOverride('s_perfectRatio');
    case 'good': return maxScorePerNote * getDevOverride('s_goodRatio');
    case 'bad':
    case 'miss':
    default: return 0;
  }
}

/**
 * 根据轨道数获取难度因子
 * 4K 为基准 (×1.0)，2K 大幅降低，6K/8K 大幅提高
 */
export function getKFactor(trackCount: number): number {
  switch (trackCount) {
    case 2: return getDevOverride('s_kFactor2K');
    case 4: return getDevOverride('s_kFactor4K');
    case 6: return getDevOverride('s_kFactor6K');
    case 8: return getDevOverride('s_kFactor8K');
    default: return 1.0;
  }
}

/**
 * 计算最终成绩
 */
export function calculateResults(
  noteResults: NoteResult[],
  totalNotes: number,
  autoPlay: boolean = false,
  songName: string | null = null,
  chartConstant: number = 0,
  trackCount: number = 4,
): GameResults {
  let perfect = 0;
  let good = 0;
  let bad = 0;
  let miss = 0;
  let maxCombo = 0;
  let currentCombo = 0;

  for (const r of noteResults) {
    switch (r.judgment.type) {
      case 'perfect':
        perfect++;
        currentCombo++;
        break;
      case 'good':
        good++;
        currentCombo++;
        break;
      case 'bad':
        bad++;
        currentCombo = 0;
        break;
      case 'miss':
        miss++;
        currentCombo = 0;
        break;
    }
    if (currentCombo > maxCombo) maxCombo = currentCombo;
  }

  const fullCombo = bad === 0 && miss === 0;
  const allPerfect = miss === 0 && bad === 0 && good === 0;

  // 用整数百分比算，浮点累加会跑偏（全P保证=100000）
  const total = totalNotes;
  const maxScore = getDevOverride('s_maxScore');
  const pct = total > 0 ? perfect / total : 0;
  const gPct = total > 0 ? good / total : 0;
  const goodRatio = getDevOverride('s_goodRatio');
  const exactScore = Math.round(maxScore * (pct + gPct * goodRatio));

  const rating = getRating(exactScore, fullCombo, allPerfect);

  // ACC: P×1.0 + G×0.65 / N
  const goodWeight = getDevOverride('s_accGoodWeight');
  const acc = total > 0 ? (perfect * 1.0 + good * goodWeight) / total : 0;

  // RKS: ((ACC×100-55)/45)^2 × chartConstant × kFactor，跟 phigros 对版（
  const accFloor = getDevOverride('s_rksAccFloor');
  const rksOffset = getDevOverride('s_rksOffset');
  const rksDivisor = getDevOverride('s_rksDivisor');
  const kFactor = getKFactor(trackCount);
  const effectiveConst = chartConstant * kFactor;

  let songRKS = 0;
  if (!autoPlay && acc >= accFloor) {
    const inner = (acc * 100 - rksOffset) / rksDivisor;
    songRKS = inner * inner * effectiveConst;
  }

  const pp = autoPlay ? 0 : Math.round(songRKS * 100) / 100;
  const diffLabel = constantToDifficulty(chartConstant);

  return {
    totalNotes,
    perfect,
    good,
    bad,
    miss,
    maxCombo,
    score: exactScore,
    fullCombo,
    allPerfect,
    rating,
    noteResults,
    autoPlay,
    songName,
    difficulty: diffLabel,
    chartConstant,
    pp,
    acc,
  };
}

/**
 * 根据总分、全连、全Perfect获取评级
 */
function getRating(score: number, fullCombo: boolean, allPerfect: boolean): RatingType {
  const rankB = getDevOverride('s_rankB');
  const rankA = getDevOverride('s_rankA');
  const rankS = getDevOverride('s_rankS');
  if (allPerfect) return 'AP';
  if (fullCombo) return 'V';
  if (score >= rankS) return 'S';
  if (score >= rankA) return 'A';
  if (score >= rankB) return 'B';
  return 'C';
}

/**
 * 计算每个音符的分值
 */
export function getNoteScore(noteCount: number): number {
  return getDevOverride('s_maxScore') / noteCount;
}

/**
 * 根据判定获取得分倍率
 */
export function getJudgmentMultiplier(judgment: JudgmentType): number {
  switch (judgment) {
    case 'perfect': return getDevOverride('s_perfectRatio');
    case 'good': return getDevOverride('s_goodRatio');
    case 'bad': return 0;
    case 'miss': return 0;
  }
}

export function getRatingColor(rating: RatingType): string {
  switch (rating) {
    case 'AP': return getDevOverride('c_perfectColor');
    case 'V': return getDevOverride('c_volor');
    case 'S': return getDevOverride('c_sColor');
    case 'A': return getDevOverride('c_aColor');
    case 'B': return getDevOverride('c_bColor');
    case 'C': return getDevOverride('c_cColor');
  }
}

export function getRatingLabel(rating: RatingType): string {
  switch (rating) {
    case 'AP': return 'ALL PERFECT';
    case 'V': return 'FULL COMBO';
    case 'S': return 'S';
    case 'A': return 'A';
    case 'B': return 'B';
    case 'C': return 'C';
  }
}
