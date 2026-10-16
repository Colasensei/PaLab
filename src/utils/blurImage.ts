/**
 * 预生成模糊背景图片（Canvas 离线渲染，完成后缓存为 Data URL）
 *
 * 策略：缩放到 300px 分辨率 → 8 层渐进模糊 → 输出 Data URL
 * CSS background-size: cover 自动拉伸，无插值伪影。
 * 8 层 box-blur 叠加近似高质量高斯模糊（中心极限定理）。
 */

const blurCache = new Map<string, string>();

const MAX_SIDE = 300;

export async function generateBlurredBg(
  src: string,
  blurPx: number = 40,
  brightness: number = 0.25,
): Promise<string> {
  const cacheKey = `${src}::${blurPx}::${brightness}`;
  const cached = blurCache.get(cacheKey);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxDim = Math.max(img.width, img.height);
      const scale = maxDim > MAX_SIDE ? MAX_SIDE / maxDim : 1;
      const cw = Math.max(1, Math.floor(img.width * scale));
      const ch = Math.max(1, Math.floor(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cw, ch);

      // 8 层 box-blur 叠加 → 逼近高斯模糊
      // 半径递增: 0.08 → 0.16 → 0.25 → 0.35 → 0.50 → 0.70 → 0.90 → 1.0
      const radii = [0.08, 0.16, 0.25, 0.35, 0.50, 0.70, 0.90, 1.0];
      for (const r of radii) {
        ctx.filter = `blur(${blurPx * r}px)`;
        ctx.drawImage(canvas, 0, 0);
      }
      ctx.filter = 'none';

      // 亮度遮罩
      ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
      ctx.fillRect(0, 0, cw, ch);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      blurCache.set(cacheKey, dataUrl);
      resolve(dataUrl);
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
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
 * 饱和度高的像素权重更大，避免灰扑扑的底盖掉主色。
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
