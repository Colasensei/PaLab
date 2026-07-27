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
