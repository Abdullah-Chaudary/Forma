/**
 * Visual + behavioural smoke test through a real browser.
 *   node test/visual.test.mjs [baseUrl]
 * Screenshots land in test/shots/, downloads in test/downloads/.
 */

import puppeteer from 'puppeteer-core';
import JSZip from 'jszip';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
const downloads = path.join(here, 'downloads');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const fixture = (name) => path.join(here, 'fixtures', name);

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => existsSync(candidate));

for (const dir of [shots, downloads]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const problems = [];
let expectingError = false;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });

page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (expectingError && /Failed to load resource/i.test(message.text())) return;
  problems.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  if (!/fonts\.(gstatic|googleapis)/.test(request.url())) {
    problems.push(`request failed: ${request.url()}`);
  }
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (name) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
  console.log(`  captured ${name}.png`);
};
const upload = async (...files) => {
  const input = await page.$('#file-input');
  await input.uploadFile(...files.map(fixture));
};
const start = async () => {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => document.getElementById('footnote-text').textContent.includes('conversions'),
    { timeout: 15000 },
  );
  await pause(300);
};

await start();
await shot('01-idle');

// ---- one document -------------------------------------------------------
await upload('Quarterly report.docx');
await page.waitForSelector('#file-rows .file-row');
await pause(400);
await shot('02-ready-single');

const singleLabel = await page.$eval('#convert-label', (node) => node.textContent);
console.log(`  single: "${singleLabel}" · ${(await page.$$('.chip')).length} chips`);

await page.type('#format-search', 'pdf', { delay: 30 });
await pause(250);
await shot('03-search');
await page.$eval('#format-search', (node) => {
  node.value = '';
  node.dispatchEvent(new Event('input', { bubbles: true }));
});
await pause(150);

await page.click('#convert-btn');
await page.waitForSelector('#status:not([hidden])', { timeout: 5000 });
await shot('04-working');
await page.waitForSelector('#results:not([hidden])', { timeout: 120000 });
await pause(400);
await shot('05-done-single');
console.log(`  result: ${await page.$eval('.result-sub', (node) => node.textContent)}`);

// ---- a mixed batch ------------------------------------------------------
await page.click('#again-btn');
await pause(250);
await upload('Quarterly report.docx', 'screenshot.png', 'report.md');
await page.waitForSelector('.file-list');
await pause(400);
await shot('06-ready-batch');

const batchLabel = await page.$eval('#convert-label', (node) => node.textContent);
const chips = await page.$$eval('.chip', (nodes) => nodes.map((n) => n.textContent));
console.log(`  batch: "${batchLabel}" · shared chips: ${chips.join(', ') || 'none'}`);

await page.click('#convert-btn');
await page.waitForSelector('#status:not([hidden])', { timeout: 5000 });
await pause(700);
await shot('07-working-batch');
await page.waitForSelector('#results:not([hidden])', { timeout: 120000 });
await pause(400);
await shot('08-done-batch');

const rows = await page.$$eval('.result-row', (nodes) => nodes.length);
const downloadAllVisible = await page.$eval('#download-all', (node) => !node.hidden);
console.log(`  batch result: ${rows} rows, download-all ${downloadAllVisible ? 'shown' : 'hidden'}`);
if (rows !== 3) problems.push(`expected 3 result rows, saw ${rows}`);
if (!downloadAllVisible) problems.push('download-all button not shown for a batch');

// ---- download all → a real zip ------------------------------------------
await page.click('#download-all');
let zipFile = null;
for (let i = 0; i < 40 && !zipFile; i++) {
  await pause(150);
  const files = readdirSync(downloads).filter((name) => name.endsWith('.zip'));
  if (files.length) zipFile = path.join(downloads, files[0]);
}
if (!zipFile) {
  problems.push('download-all did not produce a zip');
} else {
  const zip = await JSZip.loadAsync(readFileSync(zipFile));
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const sizes = await Promise.all(names.map(async (name) => (await zip.file(name).async('uint8array')).length));
  console.log(`  zip: ${names.join(', ')} (${sizes.join(', ')} bytes)`);
  if (names.length !== 3) problems.push(`zip holds ${names.length} entries, expected 3`);
  if (sizes.some((size) => size === 0)) problems.push('zip contains an empty entry');
}

// ---- formats dialog -----------------------------------------------------
await page.click('#formats-btn');
await page.waitForSelector('#formats-dialog[open]');
await pause(400);
await shot('09-formats');
await page.keyboard.press('Escape');
await pause(250);

// ---- no shared format ---------------------------------------------------
await page.click('#again-btn');
await pause(250);
await upload('photo.jpg', 'tone.wav');
await page.waitForSelector('.file-list');
await pause(400);
await shot('10-no-shared-format');
const sharedMessage = await page.$eval('#no-match', (node) => (node.hidden ? '' : node.textContent));
console.log(`  no-shared: ${sharedMessage}`);
if (!sharedMessage) problems.push('expected a no-shared-format message');

// ---- unsupported source -------------------------------------------------
await page.click('#clear-all-btn');
await pause(250);
await upload('legacy.doc');
await page.waitForSelector('#file-rows .file-row');
await pause(350);
await shot('11-no-targets');

// ---- unrecognised file --------------------------------------------------
await page.click('#clear-all-btn');
await pause(250);
expectingError = true;
await upload('mystery.bin');
await page.waitForSelector('#error-card:not([hidden])', { timeout: 15000 });
await pause(300);
await shot('12-error');
expectingError = false;

// ---- dark mode ----------------------------------------------------------
await page.click('#error-btn');
await pause(250);
await page.click('#theme-btn');
await pause(350);
await shot('13-dark-empty');

await upload('screenshot.png', 'photo.jpg');
await page.waitForSelector('.file-list');
await pause(350);
await shot('14-dark-batch');

// ---- mobile -------------------------------------------------------------
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// Emulating a mobile device reloads the page, so start from a clean slate.
await start();
await shot('15-mobile-empty');

await upload('Quarterly report.docx', 'screenshot.png');
await page.waitForSelector('.file-list');
await pause(350);
await shot('16-mobile-batch');

await browser.close();

console.log(problems.length ? `\n  ${problems.length} problem(s):\n   - ${problems.join('\n   - ')}` : '\n  no console or network problems');
process.exit(problems.length ? 1 : 0);
