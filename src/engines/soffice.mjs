import { existsSync, mkdtempSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { run, which } from '../util.mjs';

/**
 * Optional engine: only active when LibreOffice happens to be installed. It is
 * the one thing that opens legacy Office formats (.doc, .ppt) and produces the
 * highest fidelity Office ⇄ PDF output, so it is preferred when available.
 */

const SOURCES = ['doc', 'docx', 'odt', 'rtf', 'txt', 'html', 'htm', 'xls', 'xlsx', 'ods', 'csv',
  'pptx', 'odp', 'ppt', 'epub', 'svg', 'fodt', 'fods', 'fodp'];
const TARGETS = ['pdf', 'docx', 'odt', 'rtf', 'txt', 'html', 'xlsx', 'ods', 'csv', 'pptx', 'odp', 'epub', 'png', 'jpg'];

let cached = null;

function findSoffice() {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        'soffice',
      ]
    : ['soffice', 'libreoffice'];
  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      if (existsSync(candidate)) return candidate;
    } else {
      const hit = which(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

export default {
  id: 'soffice',
  name: 'LibreOffice',
  home: 'https://www.libreoffice.org',
  blurb: 'office documents, high fidelity PDF export',

  from: SOURCES,

  targets(fromExt) {
    return SOURCES.includes(fromExt) ? TARGETS.filter((t) => t !== fromExt) : [];
  },

  async probe() {
    if (cached) return cached;
    const bin = findSoffice();
    if (!bin) return (cached = { ok: false, detail: 'LibreOffice is not installed' });
    return (cached = { ok: true, bin, version: 'soffice' });
  },

  async run({ inputPath, outputPath, toExt }) {
    const info = await this.probe();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'forma-soffice-out-'));
    const profile = mkdtempSync(path.join(os.tmpdir(), 'forma-soffice-profile-'));
    const args = [
      '--headless',
      '--norestore',
      '--nolockcheck',
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--convert-to',
      toExt,
      '--outdir',
      outDir,
      inputPath,
    ];
    const res = await run(info.bin, args, { timeout: 300_000 });
    const produced = readdirSync(outDir).filter((name) => name.toLowerCase().endsWith(`.${toExt}`));
    if (!produced.length) {
      const detail = (res.stderr || res.message || '').trim().split('\n').slice(-2).join(' ');
      throw new Error(detail || `LibreOffice could not write .${toExt}`);
    }
    renameSync(path.join(outDir, produced[0]), outputPath);
    return { engine: 'LibreOffice' };
  },
};
