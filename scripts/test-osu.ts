import { parseOsuBeatmap, extractOsuLabel } from '../src/utils/osuParser';

const sample = `osu file format v14

[General]
AudioFilename: song.mp3
Mode: 3

[Metadata]
Title:Test Song
Artist:Some Artist
Creator:Maker
Version:4K Hard

[Difficulty]
CircleSize:4

[TimingPoints]
0,500,4,2,1,65,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:0:
192,192,1000,1,0,0:0:0:0:0:
320,192,2000,128,0,3000:0:0:0:0:
448,192,4000,1,8,0:0:0:0:0:
64,192,4000,1,0,0:0:0:0:0:
192,192,6000,1,0,0:0:0:0:0:
`;

const r = parseOsuBeatmap(sample);
console.log('label:', extractOsuLabel(sample));
console.log('bpm:', r.bpm, 'tracks:', r.trackCount, 'audio:', r.audioFilename);
console.log('notes:', r.notes.length);
for (const n of r.notes) {
  console.log(`  t${n.track} ${n.type} ${n.startTime}->${n.endTime} double=${n.isDouble} gid=${n.doubleGroupId}`);
}

// 非4K应报错
try {
  parseOsuBeatmap(sample.replace('CircleSize:4', 'CircleSize:7'));
  console.log('ERROR: 7K 应被拒绝');
} catch (e) {
  console.log('7K rejected:', (e as Error).message);
}
// 非mania应报错
try {
  parseOsuBeatmap(sample.replace('Mode: 3', 'Mode: 0'));
  console.log('ERROR: standard 应被拒绝');
} catch (e) {
  console.log('standard rejected:', (e as Error).message);
}
