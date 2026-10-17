/**
 * 预生成模糊背景图片（Canvas 离线渲染，完成后缓存为 Data URL）
 *
 * 为什么要重做：旧版是「缩到 300px + 连续 8 次 ctx.filter=blur 自我叠加 + JPEG」，
 * 三个问题叠在一起，出来又糊又脏：
 *   1. 自我叠加时边缘会被反复模糊到透明，拉伸后四边发虚；
 *   2. 300px 直接拉到 1080p，放大倍数太大，出现块状；
 *   3. JPEG 0.88 压平滑渐变，带状色阶明显。
 *
 * 现在改成分级降采样（progressive halving）：
 *   每次把画布减半，等于做一次 2×2 箱式滤波；连续 N 次箱式滤波按中心极限定理
 *   逼近高斯模糊 —— 而且**没有任何边缘伪影**，因为每一步都在缩小、从不自我叠加。
 *   最后把小图放大到输出尺寸，浏览器用双线性插值补间，得到的就是
 *   「像 CSS blur 一样干净」的平滑渐变。
 *
 * 输出用 WebP（渐变压缩远比 JPEG 干净），不支持时退回 PNG。
 */

const blurCache = new Map<string, string>();

/**
 * 高斯卷积的工作分辨率上限。
 * 卷积成本 = 宽 × 高 × 核长 × 2 遍，这一步直接决定耗时：
 * 512 长边 + sigma≈10 的核，实测在手机上约 100~200ms（放在加载界面里完全可接受）。
 */
const WORK_MAX_SIDE = 512;
/** 亮度下限，避免调到全黑 */
const MIN_BRIGHTNESS = 0.02;

/** 逐级减半缩到目标尺寸，返回小画布 */
function downscaleProgressive(
  img: HTMLImageElement,
  smallMaxSide: number,
): HTMLCanvasElement {
  const maxDim = Math.max(img.width, img.height);

  // 第一级：直接画到「最接近但仍大于目标」的尺寸
  const startScale = Math.min(1, (smallMaxSide * 2) / maxDim);
  let cw = Math.max(1, Math.round(img.width * startScale));
  let ch = Math.max(1, Math.round(img.height * startScale));

  let canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cw, ch);

  // 之后每次减半，直到两轴都不超过目标
  while (cw > smallMaxSide && ch > smallMaxSide && cw > 2 && ch > 2) {
    const nw = Math.max(1, Math.round(cw / 2));
    const nh = Math.max(1, Math.round(ch / 2));
    const next = document.createElement('canvas');
    next.width = nw;
    next.height = nh;
    const nctx = next.getContext('2d')!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(canvas, 0, 0, nw, nh);
    canvas = next;
    cw = nw;
    ch = nh;
  }

  // 长边还大于目标时，再等比例压一次
  const longSide = Math.max(cw, ch);
  if (longSide > smallMaxSide) {
    const s = smallMaxSide / longSide;
    const nw = Math.max(1, Math.round(cw * s));
    const nh = Math.max(1, Math.round(ch * s));
    const next = document.createElement('canvas');
    next.width = nw;
    next.height = nh;
    const nctx = next.getContext('2d')!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(canvas, 0, 0, nw, nh);
    canvas = next;
    cw = nw;
    ch = nh;
  }

  return canvas;
}

/**
 * 逐级翻倍放大到目标尺寸。
 *
 * 为什么不能一次放大：小图放大 N 倍时，每个源像素会被插值成一个菱形色块，
 * 12 倍放大就能明显看出「像素点」。逐级翻倍时每一级只插值 2 倍，
 * 且插值的是上一级已经平滑过的结果，菱形结构被反复抹平 ——
 * 这是标准的高质量放大做法（mipmap 重建），代价只是多几次 drawImage。
 */
function upscaleProgressive(small: HTMLCanvasElement, outMaxSide: number): HTMLCanvasElement {
  let canvas = small;
  const longSide = () => Math.max(canvas.width, canvas.height);

  while (longSide() * 2 <= outMaxSide) {
    const nw = canvas.width * 2;
    const nh = canvas.height * 2;
    const next = document.createElement('canvas');
    next.width = nw;
    next.height = nh;
    const nctx = next.getContext('2d')!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(canvas, 0, 0, nw, nh);
    canvas = next;
  }

  // 最后一步精确贴到目标尺寸
  const k = outMaxSide / longSide();
  const ow = Math.max(1, Math.round(canvas.width * k));
  const oh = Math.max(1, Math.round(canvas.height * k));
  if (ow === canvas.width && oh === canvas.height) return canvas;
  const out = document.createElement('canvas');
  out.width = ow;
  out.height = oh;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, 0, 0, ow, oh);
  return out;
}

/**
 * 输出图片的最长边（px）。
 *
 * 必须跟着设备像素比走：手机上 CSS 视口宽 400 但物理像素是 1200（dpr 3），
 * 如果只生成 800px 的图，浏览器还要再放大 1.5~4 倍 —— 模糊图被二次放大
 * 就会重新出现块状，这就是"明明糊了还是有像素点"的来源。
 */
function defaultOutSide(): number {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  return Math.min(1600, Math.round(900 * Math.max(1, Math.min(3, dpr))));
}

/**
 * 一维高斯核（归一化）。
 * CSS 的 blur(Npx) 规范里定义的标准差是 N/2，所以 sigma = blurPx / 2。
 */
function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const k = new Float32Array(size);
  const twoSigmaSq = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const d = i - radius;
    const v = Math.exp(-(d * d) / twoSigmaSq);
    k[i] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

/**
 * 真·可分离高斯模糊：先横向卷积一遍，再纵向卷积一遍（两遍一维 = 一遍二维，成本从 O(r²) 降到 O(r)）。
 * 边缘采用钳制采样（复制边界像素），所以不会像 ctx.filter 自我叠加那样把四边糊成透明。
 * 就地修改 ImageData，顺带乘上亮度。
 */
function gaussianBlurInPlace(img: ImageData, sigma: number, brightness: number): void {
  const w = img.width;
  const h = img.height;
  const data = img.data;
  const b = Math.max(0.01, Math.min(1, brightness));

  if (sigma < 0.3) {
    // 半径太小就直接只做亮度
    if (b < 0.999) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] *= b; data[i + 1] *= b; data[i + 2] *= b;
      }
    }
    return;
  }

  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(w * h * 3);

  // 横向
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let t = -r; t <= r; t++) {
        let xx = x + t;
        if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
        const idx = (row + xx) * 4;
        const kv = k[t + r];
        sr += data[idx] * kv;
        sg += data[idx + 1] * kv;
        sb += data[idx + 2] * kv;
      }
      const o = (row + x) * 3;
      tmp[o] = sr; tmp[o + 1] = sg; tmp[o + 2] = sb;
    }
  }

  // 纵向（顺带乘亮度）
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sr = 0, sg = 0, sb = 0;
      for (let t = -r; t <= r; t++) {
        let yy = y + t;
        if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
        const o = (yy * w + x) * 3;
        const kv = k[t + r];
        sr += tmp[o] * kv;
        sg += tmp[o + 1] * kv;
        sb += tmp[o + 2] * kv;
      }
      const idx = (y * w + x) * 4;
      data[idx] = sr * b;
      data[idx + 1] = sg * b;
      data[idx + 2] = sb * b;
    }
  }
}

/**
 * @param src        图片地址（data URL / blob URL / http）
 * @param blurPx     屏幕上的目标模糊半径（px），和 CSS blur() 语义对齐
 * @param brightness 亮度倍率（0~1）
 * @param outMaxSide 输出图片最长边（默认按 dpr 自适应）
 */
export async function generateBlurredBg(
  src: string,
  blurPx: number = 40,
  brightness: number = 0.25,
  outMaxSide: number = defaultOutSide(),
): Promise<string> {
  const key = `${src}::${blurPx}::${brightness}::${outMaxSide}`;
  const cached = blurCache.get(key);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // ① 先把原图逐级减半缩到「卷积工作尺寸」。
        //    这一步既是抗锯齿（避免 aliasing），也把后面卷积的像素数控制住。
        const workSide = Math.min(outMaxSide, WORK_MAX_SIDE);
        const small = downscaleProgressive(img, workSide);

        // ② 真高斯卷积。
        //    CSS blur(Npx) 的标准差是 N/2（CSS 像素），换算到工作分辨率要乘 workSide / 视口宽。
        const viewportCssWidth = Math.max(1, typeof window !== 'undefined' ? (window.innerWidth || 1) : 1);
        const sigmaOut = (Math.max(0.5, blurPx) / 2) * (outMaxSide / viewportCssWidth);
        const sigmaWork = sigmaOut * (Math.max(small.width, small.height) / outMaxSide);

        const sctx = small.getContext('2d', { willReadFrequently: true })!;
        const imgData = sctx.getImageData(0, 0, small.width, small.height);
        gaussianBlurInPlace(imgData, sigmaWork, Math.max(MIN_BRIGHTNESS, Math.min(1, brightness)));
        sctx.putImageData(imgData, 0, 0);

        // ③ 放大到输出尺寸：逐级翻倍，避免一次放大的菱形色块
        const out = upscaleProgressive(small, outMaxSide);

        // WebP 对平滑渐变比 JPEG 干净得多；不支持时浏览器会自动退回 PNG
        const dataUrl = out.toDataURL('image/webp', 0.95);
        blurCache.set(key, dataUrl);
        resolve(dataUrl);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/**
 * 预热：在加载界面就把模糊图算好，进游戏时直接命中缓存。
 *
 * 游戏内的 loading 阶段本来就有 2.5~4 秒的空窗，把这几十到一百多毫秒的
 * 卷积工作挪到那里，玩家进入游玩时背景已经是成品，不需要"先生成再替换"。
 */
export function prewarmBlurBg(
  src: string,
  blurPx: number = 40,
  brightness: number = 0.25,
  outMaxSide: number = defaultOutSide(),
): Promise<string> {
  return generateBlurredBg(src, blurPx, brightness, outMaxSide);
}

/** 清空缓存（内存吃紧时可调） */
export function clearBlurCache(): void {
  blurCache.clear();
}

export interface AccentColor { r: number; g: number; b: number; }

const accentCache = new Map<string, AccentColor>();
const MAX_ACCENT_CACHE = 200;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** W3C 相对亮度，用来算对比度 */
function relLuminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * 取图的主色，并把它收进"能当卡片底色"的窄区间：
 * 亮度夹在 0.10~0.20、饱和度夹在 0.14~0.42，最后再把 W3C 相对亮度压到 0.045 以下。
 * 这样即使原图是荧光粉/亮黄，落到卡片上也只是深色块：
 * 白字（#eee）对比度约 9.5:1，次级灰字（#a8a8a8）约 4.6:1，都过 AA。
 */
export async function extractAccentColor(src: string): Promise<AccentColor | null> {
  const cached = accentCache.get(src);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const N = 32;
        const canvas = document.createElement('canvas');
        canvas.width = N;
        canvas.height = N;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, N, N);           // 只为统计颜色，轻微拉伸无所谓

        const data = ctx.getImageData(0, 0, N, N).data;
        let r = 0, g = 0, b = 0, wsum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2];
          const [, ps, pl] = rgbToHsl(pr, pg, pb);
          if (pl < 0.08 || pl > 0.94) continue;   // 死黑死白不算主色
          const w = 0.15 + ps;                     // 越鲜艳越算数
          r += pr * w; g += pg * w; b += pb * w; wsum += w;
        }
        if (wsum === 0) { resolve(null); return; }

        const [h0, s0, l0] = rgbToHsl(r / wsum, g / wsum, b / wsum);
        const s = Math.min(0.42, Math.max(0.14, s0));
        const l = Math.min(0.20, Math.max(0.10, l0 * 0.5));   // 平均色偏亮，先砍一半再夹
        let [cr, cg, cb] = hslToRgb(h0, s, l);

        // 最后一关：相对亮度超过上限就整体压暗（保持色相）。
        // 条件是次级灰字 #a8a8a8 也要有 4.5:1，所以底色亮度不能超过 0.045。
        const MAX_LUM = 0.045;
        const lum = relLuminance(cr, cg, cb);
        if (lum > MAX_LUM) {
          const k = Math.pow(MAX_LUM / lum, 1 / 2.4) * 0.97;
          cr = Math.round(cr * k); cg = Math.round(cg * k); cb = Math.round(cb * k);
        }

        const out: AccentColor = { r: cr, g: cg, b: cb };
        if (accentCache.size >= MAX_ACCENT_CACHE) {
          const first = accentCache.keys().next().value;
          if (first !== undefined) accentCache.delete(first);
        }
        accentCache.set(src, out);
        resolve(out);
      } catch {
        resolve(null);   // 跨域图会污染 canvas，取不到就退回无底色
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ── 谱面库列表用的预生成资源 ────────────────────────────────────
// 列表滚动时逐行解码整张封面（dataURL 里的 PNG 可能是几 MB）在移动端要接近一秒，
// 还会把滚动主线程拖住导致滑过头。所以导入时就把小缩略图和主色算好一起存进谱面包，
// 列表只读这两个小字段，滚动时不做任何解码。

const thumbCache = new Map<string, string>();
const MAX_THUMB_CACHE = 300;

/** 解码图源：优先 createImageBitmap（解码在 worker 线程，不阻塞滚动/主线程） */
async function decodeSource(src: string): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const blob = await (await fetch(src)).blob();
      return await createImageBitmap(blob);
    }
  } catch { /* 走到下面的 <img> 兜底 */ }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawThumb(dec: ImageBitmap | HTMLImageElement, maxSide: number): string | null {
  try {
    const w = dec.width, h = dec.height;
    if (!w || !h) return null;
    const maxDim = Math.max(w, h);
    const scale = maxDim > maxSide ? maxSide / maxDim : 1;
    const cw = Math.max(1, Math.floor(w * scale));
    const ch = Math.max(1, Math.floor(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dec, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

/** 把整张封面压成小 JPEG 缩略图（最长边 maxSide），带内存缓存 */
export async function makeThumb(src: string, maxSide = 160): Promise<string | null> {
  const key = `${maxSide}::${src}`;
  const cached = thumbCache.get(key);
  if (cached) return cached;
  const dec = await decodeSource(src);
  if (!dec) return null;
  const out = drawThumb(dec, maxSide);
  if (dec instanceof ImageBitmap) dec.close();
  if (!out) return null;
  if (thumbCache.size >= MAX_THUMB_CACHE) {
    const first = thumbCache.keys().next().value;
    if (first !== undefined) thumbCache.delete(first);
  }
  thumbCache.set(key, out);
  return out;
}

/**
 * 一次性算好列表要用的两样东西：缩略图 + 主色。
 * 主色以 `"r,g,b"` 字符串返回，方便直接塞进谱面包持久化。
 *
 * 主色是从**缩略图**上取的：反正只做 32×32 采样求平均，和用原图结果一样，
 * 但省掉一次几 MB 的大图解码。
 */
export async function buildChartAssets(
  thumbSrc: string,
  tintSrc?: string | null,
  maxSide = 160,
): Promise<{ thumb: string | null; tint: string | null }> {
  const thumb = await makeThumb(thumbSrc, maxSide);
  if (!thumb) return { thumb: null, tint: null };
  // 主色取卡背景用的那张（曲绘优先）；没有就退回缩略图
  const carSrc = tintSrc || thumbSrc;
  const accent = await extractAccentColor(carSrc === thumbSrc ? thumb : carSrc);
  return { thumb, tint: accent ? `${accent.r},${accent.g},${accent.b}` : null };
}
