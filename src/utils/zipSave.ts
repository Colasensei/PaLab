/**
 * 跨平台 ZIP 保存工具
 * Web: file-saver 触发浏览器下载
 * Android (Capacitor): Filesystem + Share 插件保存到设备
 */

import { saveAs } from 'file-saver';

let _isCapacitor: boolean | null = null;
function isCapacitor(): boolean {
  if (_isCapacitor !== null) return _isCapacitor;
  try {
    _isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    _isCapacitor = false;
  }
  return _isCapacitor;
}

/**
 * 保存 Blob 为文件
 * Web: 浏览器下载
 * Android: 写入 Downloads 目录
 */
export async function saveZipBlob(blob: Blob, fileName: string): Promise<void> {
  if (isCapacitor()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      // 将 Blob 转为 base64
      const base64 = await blobToBase64(blob);

      // 写入 Download 目录
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });

      // 弹出分享/保存对话框
      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: '保存谱面包',
      }).catch(() => {
        // 用户取消分享，文件已写入 Documents
        alert('已保存到内部存储: ' + fileName);
      });
    } catch (e) {
      console.error('Capacitor save failed, trying web fallback:', e);
      saveAs(blob, fileName);
    }
  } else {
    saveAs(blob, fileName);
  }
}

/**
 * 将 Blob 转为 base64 字符串（去掉 data: 前缀）
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 "data:application/zip;base64," 前缀
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
