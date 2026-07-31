/**
 * osu! mania 谱面解析器
 * 读取 .osu 文本，转换为 PaLab 的 Note[] 与编辑器配置
 * - 仅支持 4K（CircleSize === 4，Mode === 3）
 * - 音符按绝对时间定位，BPM 变化不影响（PaLab 取首个正 TimingPoint 的 BPM 作为展示值）
 * - 多押识别复用 ensureDoubleGroups
 */
import { Note } from '@/types';
import { ensureDoubleGroups } from './manualAnalyzer';

export interface OsuParseResult {
  title: string;
  artist: string;
  creator: string;
  version: string;
  trackCount: number;
  bpm: number;
  audioFilename: string;
  notes: Note[];
}

/** 快速提取「Title [Version]」用于多谱面选择列表 */
export function extractOsuLabel(text: string): string {
  const title = (/^Title(?::| )(.*)$/m.exec(text)?.[1] || '').trim();
  const version = (/^Version(?::| )(.*)$/m.exec(text)?.[1] || '').trim();
  const artist = (/^Artist(?::| )(.*)$/m.exec(text)?.[1] || '').trim();
  const base = title || 'Unknown';
  return version ? `${base} [${version}]` : artist ? `${base} · ${artist}` : base;
}

function sectionValue(lines: string[], key: string): string | null {
  const re = new RegExp(`^${key}(?::| )(.*)$`);
  for (const line of lines) {
    const m = re.exec(line.trim());
    if (m) return m[1].trim();
  }
  return null;
}

/** 4K 列 x 坐标 → 轨道索引（64/192/320/448 → 0/1/2/3） */
function xToTrack(x: number): number {
  const col = Math.round((x - 64) / 128);
  return Math.max(0, Math.min(3, col));
}

export function parseOsuBeatmap(text: string): OsuParseResult {
  // 按 [Section] 分组
  const sections: Record<string, string[]> = {};
  let current = '';
  for (const line of text.split(/\r?\n/)) {
    const m = /^\[(.+)\]$/.exec(line.trim());
    if (m) {
      current = m[1];
      sections[current] = sections[current] || [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  const general = sections['General'] || [];
  const difficulty = sections['Difficulty'] || [];
  const metadata = sections['Metadata'] || [];
  const timing = sections['TimingPoints'] || [];
  const hitObjects = sections['HitObjects'] || [];

  const mode = parseInt(sectionValue(general, 'Mode') || '0', 10);
  const circleSize = parseInt(sectionValue(difficulty, 'CircleSize') || '4', 10);
  if (mode !== 3) throw new Error('not_mania');
  if (circleSize !== 4) throw new Error('not_4k');

  const title = sectionValue(metadata, 'Title') || 'Untitled';
  const artist = sectionValue(metadata, 'Artist') || '';
  const creator = sectionValue(metadata, 'Creator') || '';
  const version = sectionValue(metadata, 'Version') || '';
  const audioFilename = sectionValue(general, 'AudioFilename') || '';

  // BPM：首个正数（非继承）TimingPoint
  let bpm = 120;
  for (const line of timing) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    const parts = t.split(',');
    if (parts.length < 2) continue;
    const beatLength = parseFloat(parts[1]);
    if (!isFinite(beatLength) || beatLength <= 0) continue;
    const b = 60000 / beatLength;
    if (b >= 30 && b <= 300) { bpm = Math.round(b); break; }
  }

  // 音符
  const rawNotes: { track: number; startTime: number; endTime: number; type: 'tap' | 'hold' }[] = [];
  for (const line of hitObjects) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    const parts = t.split(',');
    if (parts.length < 5) continue;
    const x = parseInt(parts[0], 10);
    const time = parseInt(parts[2], 10);
    const type = parseInt(parts[3], 10);
    if (isNaN(x) || isNaN(time)) continue;
    const isHold = (type & 128) !== 0;
    let endTime = time;
    if (isHold) {
      const e = parseInt((parts[5] || '').split(':')[0], 10);
      if (!isNaN(e)) endTime = e;
    }
    rawNotes.push({
      track: xToTrack(x),
      startTime: time,
      endTime: Math.max(time, endTime),
      type: isHold ? 'hold' : 'tap',
    });
  }
  rawNotes.sort((a, b) => a.startTime - b.startTime || a.track - b.track);

  let id = 0;
  const notes: Note[] = rawNotes.map(n => ({
    id: id++,
    type: n.type,
    track: n.track,
    startTime: n.startTime,
    endTime: n.endTime,
    isDouble: false,
    doubleGroupId: null,
  }));

  return {
    title, artist, creator, version,
    trackCount: 4,
    bpm,
    audioFilename,
    notes: ensureDoubleGroups(notes),
  };
}
