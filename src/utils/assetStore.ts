/** 素材持久化管理 — 纯本地 localStorage，支持文件选取导入 */

const ASSET_PREFIX = 'palab_asset_';

export function saveAsset(name: string, base64: string): void {
  try { localStorage.setItem(ASSET_PREFIX + name, base64); } catch { /* quota exceeded */ }
}

export function loadAsset(name: string): string | null {
  try { return localStorage.getItem(ASSET_PREFIX + name); } catch { return null; }
}

export function clearAsset(name: string): void {
  try { localStorage.removeItem(ASSET_PREFIX + name); } catch { /* */ }
}

export function hasAsset(name: string): boolean {
  return loadAsset(name) !== null;
}

/** 素材 key 常量 */
export const ASSET_KEYS = {
  mascot: '14.png',
  hitSound: 'tab.ogg',
  calibSong: 'calibration.mp3',
  noteTap: 'noteTap',
  noteHold: 'noteHold',
  // 主界面封面（横屏 43.jpg / 竖屏 916.jpg），文件名与主菜单加载保持一致
  coverLand: '43.jpg',
  coverPort: '916.jpg',
  // 游戏内背景（个性化强制覆盖谱面背景）
  gameBg: 'gameBg',
} as const;

/** 从本地 File 对象转为 base64 data URL */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 获取素材 URL — 优先 localStorage 缓存，否则原始路径 */
export function getAssetUrl(name: string, fallbackPath: string): string {
  const cached = loadAsset(name);
  return cached || fallbackPath;
}
