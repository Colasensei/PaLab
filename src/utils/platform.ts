/**
 * 平台检测工具
 * - Capacitor（Android/iOS 原生容器）
 * - Electron（Windows/Linux/macOS 桌面端）
 *
 * 用途：区分「真正能调整渲染分辨率」的平台（Cap / Elec）与普通浏览器。
 */

let _cap: boolean | null = null;
let _elec: boolean | null = null;

/** 是否运行在 Capacitor 原生容器（Android APK / iOS） */
export function isCapacitor(): boolean {
  if (_cap !== null) return _cap;
  try {
    _cap = !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    _cap = false;
  }
  return _cap;
}

/** 是否运行在 Electron 桌面端（userAgent 含 Electron 标识） */
export function isElectron(): boolean {
  if (_elec !== null) return _elec;
  try {
    _elec = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
  } catch {
    _elec = false;
  }
  return _elec;
}

/** 当前平台是否支持「渲染分辨率」调整（仅 Capacitor / Electron 真正生效） */
export function canAdjustResolution(): boolean {
  return isCapacitor() || isElectron();
}
