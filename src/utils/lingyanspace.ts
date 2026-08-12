/** lingyanspace 升级托管服务 — 版本列表（GetApplyAllPackages）封装
 *  谱面库社区：softwareId = 53303667563959301
 *  公告 / 关于：softwareId = 53303754361934853
 *  与更新检查不同：这里获取「全部版本列表」而非「最新版本」。
 *  dev 走 Vite 代理绕过 CORS；生产直连。 */

// dev 用 /api/upgrade 代理（vite 已配置 → lingyanspace），生产直连
const API_BASE = import.meta.env.DEV
  ? '/api/upgrade/GetApplyAllPackages'
  : 'https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade/GetApplyAllPackages';

/** 谱面库软件 ID */
export const SW_CHART_LIBRARY = '53303667563959301';
/** 公告 / 关于软件 ID */
export const SW_ANNOUNCEMENT = '53303754361934853';

export interface LsPackage {
  fileUrl: string | null;
  fileSize: string;
  versionNum: string;
  versionDes: string;
  packageType: string;
  packageStatus: string;      // beta / release
  downloadCount: number;
  applyId: string;
  id: string;
  isDeleted: boolean;
  createTimeStamp: string;
}

/** 获取全部版本列表（已剔除删除项；45001=无版本记录，视为空列表） */
export async function getAllPackages(softwareId: string): Promise<LsPackage[]> {
  const resp = await fetch(`${API_BASE}?softwareId=${softwareId}`);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const json = await resp.json();
  if (json.code === 45001) return [];          // 该应用无任何版本记录
  if (json.code !== 20000) throw new Error(json.message || 'API error');
  return (json.data || []).filter((d: LsPackage) => !d.isDeleted);
}

// ── 谱面元数据键值对解析（versionDes 字符串：曲师/谱师/难度/定级/简介） ──
export interface ChartMeta {
  artist: string;
  author: string;
  difficulty: string;
  constant: number;
  desc: string;
}

const META_KEYS: Record<string, keyof ChartMeta> = {
  '曲师': 'artist', 'artist': 'artist',
  '谱师': 'author', 'author': 'author', 'mapper': 'author',
  '难度': 'difficulty', 'difficulty': 'difficulty',
  '定级': 'constant', '定数': 'constant', 'constant': 'constant', 'chartconstant': 'constant', 'chart_constant': 'constant',
  '简介': 'desc', 'desc': 'desc', 'description': 'desc',
};

export function parseChartMeta(versionDes: string): ChartMeta {
  const out: ChartMeta = { artist: '', author: '', difficulty: '', constant: 0, desc: '' };
  if (!versionDes) return out;
  // 优先 JSON
  try {
    const j = JSON.parse(versionDes);
    if (j && typeof j === 'object') {
      out.artist = String(j.artist || j.曲师 || '').trim();
      out.author = String(j.author || j.谱师 || j.mapper || '').trim();
      out.difficulty = String(j.difficulty || j.难度 || '').toUpperCase().trim();
      out.constant = parseFloat(j.constant ?? j.chartConstant ?? j.定数 ?? j.定级 ?? 0) || 0;
      out.desc = String(j.description || j.desc || j.简介 || '').trim();
      return out;
    }
  } catch { /* 走行式解析 */ }
  // 行式 key: value
  for (const line of versionDes.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.+)\s*$/);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, '');
    const val = m[2].trim();
    const target = META_KEYS[key];
    if (!target) continue;
    if (target === 'constant') { const n = parseFloat(val); if (!isNaN(n)) out.constant = n; }
    else if (target === 'difficulty') out.difficulty = val.toUpperCase();
    else (out[target] as string) = val;
  }
  return out;
}

// ── 公告已读存储（localStorage） ──
const READ_PREFIX = 'palab_ann_read_';

export function getReadAnnouncements(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_PREFIX + 'set');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export function markAnnouncementRead(id: string): void {
  try {
    const s = getReadAnnouncements();
    s.add(id);
    localStorage.setItem(READ_PREFIX + 'set', JSON.stringify([...s]));
  } catch { /* 忽略 */ }
}

export function markAllAnnouncementsRead(ids: string[]): void {
  try {
    const s = getReadAnnouncements();
    ids.forEach(i => s.add(i));
    localStorage.setItem(READ_PREFIX + 'set', JSON.stringify([...s]));
  } catch { /* 忽略 */ }
}

/** 谱面已拥有匹配 key（标题+曲师+谱师+难度 完全匹配） */
export function ownedKey(title: string, artist: string, author: string, difficulty: string): string {
  return `${title}||${artist}||${author}||${difficulty}`;
}
