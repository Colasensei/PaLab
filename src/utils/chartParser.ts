/** 解析 Palab 谱面包 zip → ChartPackage（本地导入 / 社区下载共用） */
import JSZip from 'jszip';
import { buildChartAssets } from './blurImage';
import type { ChartPackage } from '@/components/ChartLibrary';

export async function parseChartZip(blob: Blob | ArrayBuffer, fileName: string): Promise<ChartPackage> {
  const zip = await JSZip.loadAsync(blob);
  const info = JSON.parse(await zip.file('info.json')!.async('string'));
  const chartJson = await zip.file('chart.json')!.async('string');
  const songFile = zip.file('song.mp3') || zip.file('song.wav') || zip.file('song.ogg') || zip.file('song.m4a') || zip.file('song.flac') || zip.file('song.aac') ||
    (() => { let sf: any = null; zip.forEach((p, f) => { if (!sf && /^song\./.test(p)) sf = f; }); return sf; })();
  const coverFile = zip.file('cover.png') || zip.file('cover.jpg');
  const illusFile = zip.file('illustration.png') || zip.file('illustration.jpg');

  let songUrl: string | null = null;
  if (songFile) {
    const b64 = await songFile.async('base64');
    const mimeMap: Record<string, string> = { ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wma: 'audio/x-ms-wma', opus: 'audio/opus' };
    const ext = songFile.name.split('.').pop() || 'mp3';
    songUrl = `data:${mimeMap[ext] || 'audio/mpeg'};base64,${b64}`;
  }
  let coverUrl: string | null = null;
  if (coverFile) {
    const b64 = await coverFile.async('base64');
    coverUrl = `data:image/png;base64,${b64}`;
  }
  let illustrationUrl: string | null = null;
  if (illusFile) {
    const b64 = await illusFile.async('base64');
    illustrationUrl = `data:image/png;base64,${b64}`;
  }
  // 背景视频（zip 内 video.*）→ Blob 直接存进 IndexedDB。
  // 不要转 base64：几十 MB 的视频转成 dataURL 后 JS 堆里会一直挂着一个
  // 更大的字符串，播放时再解一份，低端设备直接撑爆（表现为点 Start 卡死）。
  // IndexedDB 原生支持 Blob（结构化克隆），播放时再 createObjectURL 即可。
  const videoFile = (() => { let vf: any = null; zip.forEach((p, f) => { if (!vf && !f.dir && /^video\./i.test(p)) vf = f; }); return vf; })();
  let videoBlob: Blob | null = null;
  if (videoFile) {
    const vext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
    const vMimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', flv: 'video/x-flv', mov: 'video/quicktime' };
    const raw = await videoFile.async('blob');
    videoBlob = raw.type ? raw : raw.slice(0, raw.size, vMimeMap[vext] || 'video/mp4');
  }

  // 列表用的缩略图 + 主色：导入时算一次存进包里，滚动时不用再解码大图
  const thumbSrc = coverUrl || illustrationUrl;
  const tintSrc = illustrationUrl || coverUrl;
  const assets = thumbSrc ? await buildChartAssets(thumbSrc, tintSrc) : { thumb: null, tint: null };

  return {
    fileName, title: info.title || 'Unknown', artist: info.artist || '', author: info.author || '',
    difficulty: info.difficulty || 'NM', chartConstant: info.chartConstant || 8.0,
    description: info.description || '', coverUrl, illustrationUrl, songUrl, videoUrl: null, videoBlob, chartData: chartJson,
    coverThumb: assets.thumb, tint: assets.tint, thumbV: 2,
    config: JSON.stringify(info.config || {}),
    speed: info.config?.speed ?? 5.0,
  };
}
