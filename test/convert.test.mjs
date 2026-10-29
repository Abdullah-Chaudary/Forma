/**
 * End-to-end checks against a running Forma server.
 *   node test/convert.test.mjs [baseUrl]
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BASE = process.argv[2] ?? process.env.FORMA_URL ?? 'http://127.0.0.1:4173';
const dir = mkdtempSync(path.join(tmpdir(), 'forma-test-'));

let passed = 0;
let failed = 0;

const sharpPng = await sharp({
  create: { width: 480, height: 320, channels: 3, background: { r: 11, g: 87, b: 208 } },
}).png().toBuffer();

const workbooks = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['format', 'engine', 'works'],
    ['PNG', 'libvips', true],
    ['PDF', 'MuPDF', true],
    ['MP4', 'FFmpeg', true],
  ]), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const pdf = async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Forma conversion test', { x: 40, y: 200, size: 20, font, color: rgb(0.04, 0.34, 0.82) });
  page.drawText('Second line of selectable text.', { x: 40, y: 170, size: 12, font });
  const second = doc.addPage([420, 300]);
  second.drawText('Page two.', { x: 40, y: 200, size: 20, font });
  return doc.save();
};

const markdown = `# Forma test document

A short document used to exercise **Pandoc** and the Chromium PDF path.

- first item
- second item
- third item

| format | engine |
| ------ | ------ |
| png    | libvips |
| pdf    | mupdf  |

\`\`\`js
console.log('hello from a code block');
\`\`\`
`;

const fixtures = {
  'sample.png': sharpPng,
  'sample.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#0b57d0"/><circle cx="100" cy="60" r="40" fill="#ffd24d"/></svg>'),
  'sample.md': Buffer.from(markdown),
  'sample.html': Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>Test</title></head><body><h1>Hello</h1><p>Printed by Chromium.</p></body></html>`),
  'sample.csv': Buffer.from('format,engine,works\nPNG,libvips,true\nPDF,MuPDF,true\n'),
  'sample.xlsx': workbooks(),
  'sample.pdf': await pdf(),
};

async function convert(name, target) {
  const source = fixtures[name];
  if (!source) throw new Error(`missing fixture ${name}`);
  const url = `${BASE}/api/convert?target=${encodeURIComponent(target)}&name=${encodeURIComponent(name)}`;
  const response = await fetch(url, { method: 'POST', body: source, headers: { 'content-type': 'application/octet-stream' } });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { response, buffer };
}

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  \u2713 ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  \u2717 ${label}${detail ? `  ${detail}` : ''}`);
  }
}

async function expectConversion(from, to, signature, { text = false } = {}) {
  const label = `${from} → ${to}`;
  try {
    const { response, buffer } = await convert(from, to);
    if (response.status !== 200) {
      const body = buffer.toString('utf8').slice(0, 160);
      return check(label, false, `HTTP ${response.status} ${body}`);
    }
    const engine = decodeURIComponent(response.headers.get('x-forma-engine') ?? '');
    const outName = decodeURIComponent(response.headers.get('x-forma-name') ?? '');
    const head = buffer.subarray(0, Math.min(buffer.length, 2048));
    const ok = signature(buffer, head);
    check(label, ok && buffer.length > 0, `${(buffer.length / 1024).toFixed(1)} KB · ${engine} · ${outName}`);
    if (text && !ok) console.log(`      head: ${JSON.stringify(buffer.toString('utf8').slice(0, 120))}`);
    return buffer;
  } catch (error) {
    check(label, false, error.message);
  }
}

const startsWith = (...bytes) => (buffer) => bytes.every((byte, i) => buffer[i] === byte);
const startsWithText = (text) => (buffer) => buffer.subarray(0, text.length).toString('latin1') === text;
const isZip = (buffer) => buffer[0] === 0x50 && buffer[1] === 0x4b;
const isGif = startsWithText('GIF8');
const anyOf = (...fns) => (buffer, head) => fns.some((fn) => fn(buffer, head));

console.log(`\nForma · ${BASE}\n${'─'.repeat(60)}`);

// ---- capabilities -------------------------------------------------------
console.log('\ncapabilities');
const caps = await fetch(`${BASE}/api/capabilities`).then((r) => r.json());
check('catalog loaded', Object.keys(caps.formats).length > 60, `${Object.keys(caps.formats).length} formats`);
check('matrix built', caps.stats.conversions > 500, `${caps.stats.conversions} conversions, ${caps.stats.readable} sources`);
check('engines active', caps.engines.filter((e) => e.ok).length >= 6, caps.engines.filter((e) => e.ok).map((e) => e.name).join(', '));
check('png has targets', (caps.matrix.png ?? []).includes('pdf'));
check('md has pdf target', (caps.matrix.md ?? []).includes('pdf'));
check('pdf has png target', (caps.matrix.pdf ?? []).includes('png'));

// ---- images -------------------------------------------------------------
console.log('\nimages');
await expectConversion('sample.png', 'jpg', startsWith(0xff, 0xd8, 0xff));
await expectConversion('sample.png', 'webp', startsWithText('RIFF'));
await expectConversion('sample.png', 'bmp', startsWithText('BM'));
await expectConversion('sample.png', 'avif', (buffer) => buffer.includes(Buffer.from('ftypavif')));
await expectConversion('sample.svg', 'png', startsWith(0x89, 0x50, 0x4e, 0x47));
await expectConversion('sample.png', 'pdf', startsWithText('%PDF'));

// ---- documents ----------------------------------------------------------
console.log('\ndocuments');
const docx = await expectConversion('sample.md', 'docx', isZip);
await expectConversion('sample.md', 'epub', isZip);
await expectConversion('sample.md', 'html', (buffer) => /<!DOCTYPE html|<html/i.test(buffer.subarray(0, 400).toString()));
const pdfFromMd = await expectConversion('sample.md', 'pdf', startsWithText('%PDF'));
if (docx) {
  fixtures['sample.docx'] = docx;
  await expectConversion('sample.docx', 'md', (buffer) => buffer.toString('utf8').includes('# Forma test document'));
  await expectConversion('sample.docx', 'pdf', startsWithText('%PDF'));
}
await expectConversion('sample.html', 'pdf', startsWithText('%PDF'));

// ---- spreadsheets -------------------------------------------------------
console.log('\nspreadsheets');
await expectConversion('sample.xlsx', 'csv', (buffer) => buffer.toString('utf8').includes('libvips'));
await expectConversion('sample.csv', 'xlsx', isZip);
await expectConversion('sample.csv', 'json', (buffer) => {
  const rows = JSON.parse(buffer.toString('utf8'));
  return Array.isArray(rows) && rows[0]?.engine === 'libvips';
});
await expectConversion('sample.xlsx', 'html', (buffer) => buffer.toString('utf8').includes('<table'));
await expectConversion('sample.xlsx', 'md', (buffer) => buffer.toString('utf8').includes('| format'));

// ---- pdf ----------------------------------------------------------------
console.log('\npdf');
await expectConversion('sample.pdf', 'png', anyOf(startsWith(0x89, 0x50, 0x4e, 0x47), isZip));
await expectConversion('sample.pdf', 'txt', (buffer) => buffer.toString('utf8').includes('Forma conversion test'));
await expectConversion('sample.pdf', 'html', (buffer) => buffer.toString('utf8').includes('<html'));
await expectConversion('sample.pdf', 'svg', anyOf(startsWithText('<svg'), startsWithText('<?xml'), isZip));

// ---- slides -------------------------------------------------------------
console.log('\nslides');
const pptx = await expectConversion('sample.md', 'pptx', isZip);
if (pptx) {
  fixtures['sample.pptx'] = pptx;
  await expectConversion('sample.pptx', 'md', (buffer) => buffer.toString('utf8').toLowerCase().includes('forma'));
}

// ---- media --------------------------------------------------------------
console.log('\nmedia');

// Generate media fixtures with the local ffmpeg.
const { execFileSync } = await import('node:child_process');
try {
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'clip.mp4')], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', path.join(dir, 'tone.wav')], { stdio: 'ignore' });
  const { readFileSync } = await import('node:fs');
  fixtures['clip.mp4'] = readFileSync(path.join(dir, 'clip.mp4'));
  fixtures['tone.wav'] = readFileSync(path.join(dir, 'tone.wav'));

  await expectConversion('clip.mp4', 'gif', isGif);
  await expectConversion('clip.mp4', 'webm', startsWith(0x1a, 0x45, 0xdf, 0xa3));
  await expectConversion('clip.mp4', 'mp3', anyOf(startsWithText('ID3'), startsWith(0xff)));
  await expectConversion('tone.wav', 'mp3', anyOf(startsWithText('ID3'), startsWith(0xff)));
  await expectConversion('tone.wav', 'flac', startsWithText('fLaC'));
} catch (error) {
  check('media fixtures', false, error.message);
}

// ---- failures -----------------------------------------------------------
console.log('\nerrors');
{
  const response = await fetch(`${BASE}/api/convert?target=docx&name=legacy.doc`, {
    method: 'POST', body: Buffer.from('not really a word document'), headers: { 'content-type': 'application/octet-stream' },
  });
  check('unsupported source rejected', response.status === 415 || response.status === 422, `HTTP ${response.status}`);
}
{
  const response = await fetch(`${BASE}/api/convert?target=xyz&name=sample.png`, {
    method: 'POST', body: sharpPng, headers: { 'content-type': 'application/octet-stream' },
  });
  check('invalid target rejected', response.status === 400, `HTTP ${response.status}`);
}
{
  const response = await fetch(`${BASE}/api/convert?target=jpg`, { method: 'POST', body: Buffer.alloc(0) });
  check('empty body rejected', response.status === 400, `HTTP ${response.status}`);
}
{
  const response = await fetch(`${BASE}/api/detect`, { method: 'POST', body: sharpPng });
  const detected = await response.json();
  check('magic-byte detection', detected.ext === 'png' && detected.targets.length > 0, `png · ${detected.targets.length} targets`);
}

rmSync(dir, { recursive: true, force: true });

console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
