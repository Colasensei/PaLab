/** 更新检查 — lingyanspace 升级托管服务 */

import packageJson from '../../package.json';
import { useDirectLingyanspace } from './lingyanspace';

// 有 CORS 直连 lingyanspace；否则走同源 /api/upgrade（dev= Vite 代理，生产= 反代）
const UPGRADE_DIRECT = 'https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade';
const UPGRADE_PROXY = '/api/upgrade';
const SW_ANDROID = '52045257433420805';
const SW_WINDOWS = '52045545676477445';
const PACKAGE_STATUS = 'beta';
const PACKAGE_TYPE = 'install';

export interface UpdateInfo {
  version: string;
  changelog: string;
  fileUrl: string;
  fileSize: string;
}

export interface CheckResult {
  update: UpdateInfo | null;
  error: string | null;
  debug: string | null;
}

function getSoftwareId(): string {
  // 用 Capacitor.getPlatform() 判断平台：Electron/浏览器也会 bundle @capacitor/core，
  // 此时 window.Capacitor 存在，但 getPlatform() 返回 'web'（非原生）→ 应走 Windows。
  // 只有真正的 Android 原生环境 getPlatform() 才返回 'android'。
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.getPlatform === 'function') {
    return cap.getPlatform() === 'android' ? SW_ANDROID : SW_WINDOWS;
  }
  return SW_WINDOWS;
}

export function getLocalVersion(): string {
  return packageJson.version;
}

export async function checkUpdate(): Promise<CheckResult> {
  const sid = getSoftwareId();
  const url = `${(await useDirectLingyanspace()) ? UPGRADE_DIRECT : UPGRADE_PROXY}/GetApplyLastPackage?softwareId=${sid}&packageStatus=${PACKAGE_STATUS}&packageType=${PACKAGE_TYPE}`;
  let debug = `GET ${url}`;
  try {
    const resp = await fetch(url);
    debug += `\nHTTP ${resp.status}`;
    if (resp.status !== 200) return { update: null, error: `HTTP ${resp.status}`, debug };
    const txt = await resp.text();
    debug += `\n` + txt.slice(0, 600);
    let json: any;
    try { json = JSON.parse(txt); } catch {
      return { update: null, error: 'Invalid JSON', debug };
    }
    if (json.code !== 20000) return { update: null, error: `API ${json.code}: ${json.message}`, debug };
    const d = json.data;
    if (!d?.versionNum) return { update: null, error: 'No versionNum', debug };
    const local = getLocalVersion();
    debug += `\nremote=${d.versionNum} local=${local}`;
    if (compareVersion(d.versionNum, local) > 0) {
      return { update: { version: d.versionNum, changelog: d.versionDes || '', fileUrl: d.fileUrl, fileSize: d.fileSize }, error: null, debug };
    }
    return { update: null, error: null, debug };
  } catch (e: any) {
    debug += `\nERR: ` + (e?.message || 'Unknown');
    return { update: null, error: e?.message || 'Network error', debug };
  }
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
