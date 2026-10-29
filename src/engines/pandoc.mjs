import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { run, which } from '../util.mjs';

const VENDORED = fileURLToPath(new URL('../../vendor/pandoc.exe', import.meta.url));

const READERS = {
  md: 'markdown', markdown: 'markdown', html: 'html', htm: 'html', txt: 'markdown',
  docx: 'docx', odt: 'odt', epub: 'epub', rtf: 'rtf', tex: 'latex', latex: 'latex',
  rst: 'rst', org: 'org', ipynb: 'ipynb', adoc: 'asciidoc', asciidoc: 'asciidoc',
  textile: 'textile', mediawiki: 'mediawiki', wiki: 'mediawiki', opml: 'opml',
  man: 'man', docbook: 'docbook', csv: 'csv', tsv: 'tsv', fb2: 'fb2',
};

const WRITERS = {
  md: 'gfm', html: 'html5', txt: 'plain', docx: 'docx', odt: 'odt', epub: 'epub3',
  rtf: 'rtf', tex: 'latex', rst: 'rst', org: 'org', ipynb: 'ipynb', adoc: 'asciidoc',
  textile: 'textile', mediawiki: 'mediawiki', opml: 'opml', man: 'man',
  docbook: 'docbook5', pptx: 'pptx', fb2: 'fb2',
};

const SOURCES = Object.keys(READERS);
const TARGETS = Object.keys(WRITERS).filter((t) => t !== 'htm');

let cached = null;

export async function pandocBin() {
  if (process.env.FORMA_PANDOC && existsSync(process.env.FORMA_PANDOC)) return process.env.FORMA_PANDOC;
  if (existsSync(VENDORED)) return VENDORED;
  return which('pandoc');
}

export default {
  id: 'pandoc',
  name: 'Pandoc',
  home: 'https://pandoc.org',
  blurb: 'documents, markup and e-books',

  from: SOURCES,

  targets(fromExt) {
    if (!READERS[fromExt]) return [];
    return TARGETS.filter((t) => t !== fromExt);
  },

  async probe() {
    if (cached) return cached;
    const bin = await pandocBin();
    if (!bin) return (cached = { ok: false, detail: 'pandoc not found' });
    const res = await run(bin, ['--version'], { timeout: 20_000 });
    if (!res.ok) return (cached = { ok: false, detail: 'pandoc failed to start' });
    const version = (res.stdout.match(/pandoc\s+([\d.]+)/i)?.[1]) ?? '';
    return (cached = { ok: true, bin, version: version ? `pandoc ${version}` : '' });
  },

  async run({ inputPath, outputPath, fromExt, toExt, opts }) {
    const info = await this.probe();
    const args = ['-f', READERS[fromExt], '-t', WRITERS[toExt], '--wrap=none', '--quiet'];

    if (['html', 'epub', 'pptx'].includes(toExt)) {
      args.push('--standalone', '--metadata', `title=${opts.title ?? 'Untitled'}`);
    }
    if (toExt === 'html') args.push('--embed-resources');
    if (toExt === 'txt') args.push('--wrap=auto');

    const mediaDir = path.join(os.tmpdir(), `forma-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    if (toExt === 'md') {
      mkdirSync(mediaDir, { recursive: true });
      args.push('--extract-media', mediaDir);
    }

    args.push('-o', outputPath, inputPath);
    const res = await run(info.bin, args, { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });

    if (!res.ok) {
      const detail = (res.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' ') || 'Pandoc could not convert this file';
      throw new Error(detail);
    }

    if (toExt === 'md') embedMedia(outputPath, mediaDir);
    return { engine: 'Pandoc' };
  },
};

/**
 * Pandoc extracts embedded images to disk when writing Markdown. Inline them as
 * data URIs so the single downloaded .md file still carries its pictures.
 */
function embedMedia(markdownPath, mediaDir) {
  try {
    let text = readFileSync(markdownPath, 'utf8');
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(mediaDir);
    for (const file of files) {
      const rel = path.relative(mediaDir, file).split(path.sep).join('/');
      const ext = path.extname(file).slice(1).toLowerCase();
      const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      text = text.split(rel).join(`data:${type};base64,${readFileSync(file).toString('base64')}`);
    }
    writeFileSync(markdownPath, text);
  } catch {
    /* media inlining is best effort */
  }
}
