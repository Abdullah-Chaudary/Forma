/**
 * The browser downloads a zip built with public/zip.js; this checks the bytes
 * really are a valid archive by reading them back with JSZip.
 */
import JSZip from 'jszip';
import { createZipBytes, crc32 } from '../public/zip.js';

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  \u2713 ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  \u2717 ${label}${detail ? `  ${detail}` : ''}`);
  }
}

console.log('\nzip writer\n' + '─'.repeat(60));

const text = new TextEncoder().encode('hello forma');
const binary = new Uint8Array(1024);
for (let i = 0; i < binary.length; i++) binary[i] = i % 256;

const fixed = new Date('2026-10-29T14:30:00Z');
const bytes = createZipBytes([
  { name: 'report.pdf', data: text },
  { name: 'café-übung (1).png', data: binary },
], fixed);

check('archive has bytes', bytes.length > 0, `${bytes.length} bytes`);
check('starts with local header', bytes[0] === 0x50 && bytes[1] === 0x4b);
check('crc32 matches known value', crc32(text) === 0x39bb6a79, crc32(text).toString(16));

const zip = await JSZip.loadAsync(bytes);
const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
check('entry count', names.length === 2, names.join(', '));

const first = await zip.file('report.pdf').async('uint8array');
check('small entry round trip', Buffer.from(first).toString() === 'hello forma');

const second = await zip.file('café-übung (1).png').async('uint8array');
check('unicode filename round trip', second.length === 1024 && second[255] === 255);
check('binary entry intact', second[1024 - 1] === 255 && second[7] === 7);

const corrupt = await JSZip.loadAsync(bytes, { checkCRC32: true });
check('crc check passes', Boolean(corrupt.files['report.pdf']));

// An empty archive is still structurally valid.
const empty = await JSZip.loadAsync(createZipBytes([], fixed));
check('empty archive valid', Object.keys(empty.files).length === 0);

console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
