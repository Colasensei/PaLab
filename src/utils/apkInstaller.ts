/**
 * APK 安装器 — 原生插件封装
 * Android 端：下载完成后直接拉起系统安装器
 * 其它平台：回退为浏览器下载
 */
import { Capacitor } from '@capacitor/core';

export interface InstallResult {
  success: boolean;
  error?: string;
}

/** 检测是否为原生（Capacitor）环境 */
export function isNative(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
}

/** Blob → base64 data（去掉前缀） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 安装 APK
 * - 原生 Android：写入缓存并拉起系统安装器
 * - 其它：触发浏览器下载
 */
export async function installApk(blob: Blob, fileName: string): Promise<InstallResult> {
  if (isNative()) {
    try {
      const base64 = await blobToBase64(blob);
      const res: InstallResult = await (Capacitor as any).Plugins.ApkInstaller.install({
        base64,
        fileName,
      });
      return res || { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'install failed' };
    }
  }
  // 浏览器回退：a[download]
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
  return { success: true };
}
