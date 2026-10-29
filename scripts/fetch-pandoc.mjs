#!/usr/bin/env node
/**
 * Fetches the portable Pandoc build Forma uses for document conversion.
 *
 * The binary is ~233 MB, well over GitHub's 100 MB file limit, so it is not
 * committed. A fresh clone gets it once with `npm run setup`. If Pandoc is
 * already on PATH, this is a no-op.
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';

const VERSION = process.env.FORMA_PANDOC_VERSION ?? '3.13';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vendorDir = path.join(root, 'vendor');
const target = path.join(vendorDir, process.platform === 'win32' ? 'pandoc.exe' : 'pandoc');
const force = process.argv.includes('--force');

if (existsSync(target) && !force) {
  console.log(`pandoc already present at ${path.relative(root, target)} (use --force to refetch)`);
  process.exit(0);
}

function onPath(binary) {
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE').split(';')
    : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, binary + ext.toLowerCase());
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

if (onPath('pandoc')) {
  console.log('pandoc is already on PATH; nothing to download');
  process.exit(0);
}

const assets = {
  'win32-x64': `pandoc-${VERSION}-windows-x86_64.zip`,
  'linux-x64': `pandoc-${VERSION}-linux-amd64.tar.gz`,
  'linux-arm64': `pandoc-${VERSION}-linux-arm64.tar.gz`,
};

const key = `${process.platform}-${process.arch}`;
const asset = assets[key];

if (!asset) {
  console.log(`No prebuilt Pandoc is published for ${key}.`);
  console.log(process.platform === 'darwin'
    ? 'Install it with:  brew install pandoc'
    : 'Install Pandoc from https://pandoc.org/installing.html and re-run Forma.');
  process.exit(0);
}

const url = `https://github.com/jgm/pandoc/releases/download/${VERSION}/${asset}`;
mkdirSync(vendorDir, { recursive: true });

console.log(`Downloading ${asset} …`);
const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'forma-setup' } });
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status} ${url}`);
  process.exit(1);
}

const bytes = Buffer.from(await response.arrayBuffer());
console.log(`Fetched ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);

if (asset.endsWith('.zip')) {
  const zip = await JSZip.loadAsync(bytes);
  const entry = Object.keys(zip.files).find((name) => name.endsWith('pandoc.exe'));
  if (!entry) {
    console.error('pandoc.exe was not inside the archive');
    process.exit(1);
  }
  writeFileSync(target, await zip.file(entry).async('nodebuffer'));
} else {
  const tmp = path.join(os.tmpdir(), `forma-pandoc-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const archive = path.join(tmp, asset);
  writeFileSync(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' });
  const found = findBinary(tmp);
  if (!found) {
    console.error('pandoc was not inside the archive');
    process.exit(1);
  }
  copyFileSync(found, target);
  chmodSync(target, 0o755);
  rmSync(tmp, { recursive: true, force: true });
}

if (!existsSync(target) || statSync(target).size < 1024 * 1024) {
  console.error('something went wrong: the extracted binary looks too small');
  process.exit(1);
}

console.log(`pandoc is ready at ${path.relative(root, target)} (${(statSync(target).size / 1024 / 1024).toFixed(0)} MB)`);

function findBinary(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findBinary(full);
      if (hit) return hit;
    } else if (entry.name === 'pandoc' || entry.name === 'pandoc.exe') {
      return full;
    }
  }
  return null;
}
