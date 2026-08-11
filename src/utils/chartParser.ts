/** 解析 Palab 谱面包 zip → ChartPackage（本地导入 / 社区下载共用） */
import JSZip from 'jszip';
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
  // 背景视频（zip 内 video.*）→ dataURL 持久化
  const videoFile = (() => { let vf: any = null; zip.forEach((p, f) => { if (!vf && !f.dir && /^video\./i.test(p)) vf = f; }); return vf; })();
  let videoUrl: string | null = null;
  if (videoFile) {
    const b64 = await videoFile.async('base64');
    const vext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
    const vMimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', flv: 'video/x-flv', mov: 'video/quicktime' };
    videoUrl = `data:${vMimeMap[vext] || 'video/mp4'};base64,${b64}`;
  }

  return {
    fileName, title: info.title || 'Unknown', artist: info.artist || '', author: info.author || '',
    difficulty: info.difficulty || 'NM', chartConstant: info.chartConstant || 8.0,
    description: info.description || '', coverUrl, illustrationUrl, songUrl, videoUrl, chartData: chartJson,
    config: JSON.stringify(info.config || {}),
    speed: info.config?.speed ?? 5.0,
  };
}
