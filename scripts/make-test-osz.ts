import JSZip from 'jszip';
import { writeFileSync } from 'fs';

function makeWav(seconds: number): Buffer {
  const sr = 8000, n = Math.floor(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  const ws = (o: number, s: string) => buf.write(s, o, 'ascii');
  ws(0, 'RIFF'); buf.writeUInt32LE(36 + n * 2, 4); ws(8, 'WAVE');
  ws(12, 'fmt '); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  ws(36, 'data'); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

const mapA = `osu file format v14

[General]
AudioFilename: song.wav
Mode: 3

[Metadata]
Title:OSU Test Song
Artist:Some Artist
Creator:Maker
Version:4K Normal

[Difficulty]
CircleSize:4

[TimingPoints]
0,500,4,2,1,65,1,0

[HitObjects]
64,192,500,1,0,0:0:0:0:0:
192,192,1000,1,0,0:0:0:0:0:
64,192,1000,1,0,0:0:0:0:0:
448,192,1500,128,0,2500:0:0:0:0:
320,192,3000,1,8,0:0:0:0:0:
`;

const mapB = `osu file format v14

[General]
AudioFilename: song.wav
Mode: 3

[Metadata]
Title:OSU Test Song
Artist:Some Artist
Creator:Maker
Version:4K Hard

[Difficulty]
CircleSize:4

[TimingPoints]
0,428.571,4,2,1,65,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:0:
448,192,2000,1,0,0:0:0:0:0:
`;

async function main() {
  const zip = new JSZip();
  zip.file('song.wav', makeWav(2));
  zip.file('maps/OSU Test Song (Maker) [4K Normal].osu', mapA);
  zip.file('maps/OSU Test Song (Maker) [4K Hard].osu', mapB);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync('C:/Users/colas/AppData/Local/Temp/test-pack.osz', buf);
  console.log('written test-pack.osz', buf.length, 'bytes');
}
main();
