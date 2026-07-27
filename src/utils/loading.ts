/**
 * 通用加载计时工具
 *
 * 支持两种模式：
 * 1. 假加载：仅等待最小时长（2.5~4s），用于页面跳转动画
 * 2. 实加载：同时执行后台任务与计时器，两者都完成后才结束
 *
 * @example
 * // 假加载（页面跳转）
 * await runWithLoading();
 *
 * // 实加载（后台预加载音频）
 * await runWithLoading(async () => {
 *   await audioManager.load(url);
 * });
 *
 * // 自定义时长
 * await runWithLoading(task, 3000, 1000); // 3~4s
 */

export const LOADING_MIN_MS = 2500;
export const LOADING_VARIANCE_MS = 1500;

/**
 * 运行加载流程：同时等待任务完成 + 最小时长
 * @param task      可选的后台异步任务
 * @param minMs     最小时长（默认 2500ms）
 * @param varianceMs 随机浮动（默认 1500ms，总时长 = minMs + random*varianceMs）
 */
export async function runWithLoading(
  task?: () => Promise<void>,
  minMs: number = LOADING_MIN_MS,
  varianceMs: number = LOADING_VARIANCE_MS,
): Promise<void> {
  const duration = minMs + Math.random() * varianceMs;
  const timer = new Promise<void>(resolve => setTimeout(resolve, duration));

  if (task) {
    // 任务失败不阻塞加载流程，记录警告即可
    try {
      await Promise.all([task(), timer]);
    } catch (e) {
      console.warn('[Loading] task failed:', e);
      await timer; // 至少等够最低时长
    }
  } else {
    await timer;
  }
}
