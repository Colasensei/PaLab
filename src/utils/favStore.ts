/** 喜爱歌曲存储（key = 谱面 fileName），谱面库与音乐播放器共用 */
const FAV_KEY = 'palab_favs';
const listeners = new Set<() => void>();
let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(FAV_KEY);
    cache = new Set(raw ? JSON.parse(raw) : []);
  } catch { cache = new Set(); }
  return cache;
}

function persist() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...load()])); } catch { /* ignore */ }
  listeners.forEach(l => l());
}

/** 全部喜爱 key 集合 */
export function getFavs(): Set<string> { return load(); }
/** 是否喜爱 */
export function isFav(key: string): boolean { return load().has(key); }
/** 切换喜爱，返回新状态（true=已喜爱） */
export function toggleFav(key: string): boolean {
  const s = load();
  const now = !s.has(key);
  if (now) s.add(key); else s.delete(key);
  persist();
  return now;
}
/** 订阅喜爱变化，返回取消函数 */
export function subscribeFavs(cb: () => void): () => void {
  listeners.add(cb);
  cb();
  return () => { listeners.delete(cb); };
}
