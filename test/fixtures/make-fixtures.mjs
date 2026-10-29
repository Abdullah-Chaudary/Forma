/** Generates the fixtures used by the visual checks. */
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const svg = `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b57d0"/>
      <stop offset="1" stop-color="#7c4dff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="930" cy="180" r="170" fill="#ffd24d" opacity=".92"/>
  <circle cx="250" cy="650" r="120" fill="#9ff0c9" opacity=".55"/>
  <rect x="80" y="480" width="520" height="150" rx="28" fill="#ffffff" opacity=".92"/>
  <rect x="112" y="516" width="300" height="22" rx="11" fill="#0b57d0" opacity=".85"/>
  <rect x="112" y="556" width="400" height="16" rx="8" fill="#1f1f1f" opacity=".25"/>
  <rect x="112" y="584" width="240" height="16" rx="8" fill="#1f1f1f" opacity=".18"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(path.join(here, 'screenshot.png'));
await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(path.join(here, 'photo.jpg'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(here, 'tone.wav')]);

const markdown = `# Quarterly report

Forma converts **documents**, images, spreadsheets, decks, audio and video — all on your own machine.

## Highlights

- 1,260 working conversions between 76 readable formats
- Eight conversion engines bundled behind one interface
- Nothing leaves the computer

## Numbers

| Quarter | Files | Minutes saved |
| ------- | ----- | ------------- |
| Q1      | 1,204 | 320           |
| Q2      | 2,890 | 760           |
| Q3      | 3,412 | 905           |
`;

writeFileSync(path.join(here, 'report.md'), markdown);
execFileSync(path.join(here, '..', '..', 'vendor', 'pandoc.exe'),
  ['-f', 'markdown', '-t', 'docx', path.join(here, 'report.md'), '-o', path.join(here, 'Quarterly report.docx')],
  { stdio: 'inherit' });

// A legacy Word file no local engine can open, and a file with no usable type.
writeFileSync(path.join(here, 'legacy.doc'), Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(4096, 7)]));
writeFileSync(path.join(here, 'mystery.bin'), Buffer.from('nothing recognisable in here', 'utf8'));

console.log('fixtures ready');
