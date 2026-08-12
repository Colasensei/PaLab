/** 机器学习（轻量）：从谱面库学习音符编排特征，供加载界面后台学习进度展示 */
import { loadCharts } from './chartDB';

export interface MlModel {
  /** 学习完成时间戳 */
  trainedAt: number;
  /** 参与学习的谱面数 */
  chartCount: number;
  /** 总音符数 */
  noteCount: number;
  /** 平均 NPS（音符密度） */
  avgNps: number;
  /** 双押比例 */
  doubleRatio: number;
  /** Hold 比例 */
  holdRatio: number;
  /** 各轨道音符分布（index=轨道） */
  trackDensity: number[];
  /** 相邻音符平均间隔 (ms) */
  intervalAvg: number;
  /** 各谱面时长 (s) */
  durations: number[];
}

const ML_KEY = 'palab_ml_model';

/** 学习进度（module 级，供 LoadingScreen 轮询显示） */
let mlProgress: { cur: number; total: number } = { cur: 0, total: 0 };

export function resetMlProgress() { mlProgress = { cur: 0, total: 0 }; }
export function getMlProgress() { return mlProgress; }

/** 读取上次学习到的模型（无则 null） */
export function getMlModel(): MlModel | null {
  try {
    const raw = localStorage.getItem(ML_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * 后台学习：遍历谱面库每个谱面，解析音符数据，统计编排特征并保存模型。
 * 每个谱面解析后让出事件循环（小延时），让加载界面能看到进度推进。
 */
export async function learnFromLibrary(onProgress?: (cur: number, total: number) => void): Promise<MlModel> {
  const charts = await loadCharts();
  const total = Math.max(1, charts.length);
  let noteCount = 0;
  let npsSum = 0;
  let doubleSum = 0;
  let holdSum = 0;
  let intervalSum = 0;
  let intervalCnt = 0;
  const trackDensity: number[] = [];
  const durations: number[] = [];

  for (let i = 0; i < charts.length; i++) {
    mlProgress = { cur: i + 1, total };
    onProgress?.(i + 1, total);
    const c = charts[i];
    try {
      const notes = JSON.parse(c.chartData || '[]');
      if (!Array.isArray(notes) || notes.length === 0) continue;
      const start = Math.min(...notes.map((n: any) => n.startTime ?? 0));
      const end = Math.max(...notes.map((n: any) => n.endTime ?? n.startTime ?? 0));
      const durSec = Math.max(1, (end - start) / 1000);
      const cnt = notes.length;
      noteCount += cnt;
      npsSum += cnt / durSec;
      doubleSum += notes.filter((n: any) => n.isDouble).length;
      holdSum += notes.filter((n: any) => n.type === 'hold').length;
      durations.push(durSec);
      notes.forEach((n: any) => {
        const t = n.track ?? 0;
        trackDensity[t] = (trackDensity[t] || 0) + 1;
      });
      const times = notes.map((n: any) => n.startTime ?? 0).sort((a: number, b: number) => a - b);
      for (let j = 1; j < times.length; j++) { intervalSum += times[j] - times[j - 1]; intervalCnt++; }
    } catch { /* 跳过坏谱面 */ }
    // 让出主线程，加载界面能看到进度推进
    await new Promise(r => setTimeout(r, 30));
  }

  const model: MlModel = {
    trainedAt: Date.now(),
    chartCount: charts.length,
    noteCount,
    avgNps: charts.length ? npsSum / charts.length : 0,
    doubleRatio: noteCount ? doubleSum / noteCount : 0,
    holdRatio: noteCount ? holdSum / noteCount : 0,
    trackDensity,
    intervalAvg: intervalCnt ? intervalSum / intervalCnt : 0,
    durations,
  };
  try { localStorage.setItem(ML_KEY, JSON.stringify(model)); } catch { /* 存储失败忽略 */ }
  mlProgress = { cur: total, total };
  return model;
}
