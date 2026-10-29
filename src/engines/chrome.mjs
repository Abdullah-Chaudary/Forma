import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { run, which } from '../util.mjs';

const CANDIDATES = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'chrome',
      'msedge',
    ]
  : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome'];

let cached = null;

function findBrowser() {
  for (const candidate of CANDIDATES) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
    } else {
      const hit = which(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

export default {
  id: 'chrome',
  name: 'Chromium',
  home: 'https://www.chromium.org/Home',
  blurb: 'HTML to PDF through a headless browser',

  from: ['html', 'htm'],

  targets(fromExt) {
    return fromExt === 'html' || fromExt === 'htm' ? ['pdf'] : [];
  },

  async probe() {
    if (cached) return cached;
    const bin = findBrowser();
    if (!bin) return (cached = { ok: false, detail: 'no Chrome or Edge found' });
    return (cached = { ok: true, bin, version: path.basename(bin) });
  },

  async run({ inputPath, outputPath }) {
    const info = await this.probe();
    const profile = mkdtempSync(path.join(os.tmpdir(), 'forma-chrome-'));
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--virtual-time-budget=10000',
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      `--user-data-dir=${profile}`,
      `--print-to-pdf=${outputPath}`,
      pathToFileURL(inputPath).href,
    ];

    const res = await run(info.bin, args, { timeout: 120_000 });
    if (!existsSync(outputPath)) {
      const detail = (res.stderr || res.message || '').trim().split('\n').slice(-2).join(' ');
      throw new Error(detail || 'Chromium could not print that HTML to PDF');
    }
    return { engine: 'Chromium' };
  },
};
