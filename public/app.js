/**
 * Forma — single-screen conversion flow.
 * idle → files chosen → converting → results
 *
 * Multiple files share one target format: the picker offers the intersection of
 * what every selected file can become, which keeps "convert all of these" honest.
 */

import { createZip } from './zip.js';

const $ = (id) => document.getElementById(id);

const el = {
  card: $('card'),
  dropzone: $('dropzone'),
  input: $('file-input'),
  filePanel: $('file-panel'),
  filesHead: $('files-head'),
  filesCount: $('files-count'),
  addBtn: $('add-btn'),
  clearAllBtn: $('clear-all-btn'),
  fileRows: $('file-rows'),
  groups: $('groups'),
  sectionHead: document.querySelector('.section-head'),
  actionRow: document.querySelector('.action-row'),
  search: $('format-search'),
  noMatch: $('no-match'),
  convertBtn: $('convert-btn'),
  convertLabel: $('convert-label'),
  actionNote: $('action-note'),
  status: $('status'),
  statusLabel: $('status-label'),
  statusTime: $('status-time'),
  progress: $('progress'),
  progressBar: $('progress-bar'),
  results: $('results'),
  resultsList: $('results-list'),
  downloadAll: $('download-all'),
  againBtn: $('again-btn'),
  errorCard: $('error-card'),
  errorTitle: $('error-title'),
  errorMsg: $('error-msg'),
  errorBtn: $('error-btn'),
  footnote: $('footnote'),
  footnoteText: $('footnote-text'),
  formatsBtn: $('formats-btn'),
  dialog: $('formats-dialog'),
  dialogSub: $('dialog-sub'),
  dialogBody: $('dialog-body'),
  dialogEngines: $('dialog-engines'),
  dialogClose: $('dialog-close'),
  themeBtn: $('theme-btn'),
  themeIcon: $('theme-icon'),
};

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

const state = {
  caps: null,
  files: [],          // { file, ext, targets }
  targets: [],        // intersection across files
  selected: null,
  phase: 'idle',
  timer: null,
  startedAt: 0,
  results: [],        // { name, blob, url, size, ext, meta }
  batch: { done: 0, total: 0 },
};

const CATEGORY_LABELS = {
  image: 'Image', document: 'Document', sheet: 'Spreadsheet', slide: 'Presentation',
  video: 'Video', audio: 'Audio', ebook: 'E-book', data: 'Data',
};

/** What people usually want first, per family. */
const PREFERRED = {
  image: ['jpg', 'webp', 'png', 'avif', 'pdf', 'tiff', 'bmp', 'gif', 'ico'],
  document: ['pdf', 'docx', 'md', 'html', 'txt', 'odt', 'epub', 'rtf'],
  sheet: ['xlsx', 'csv', 'ods', 'json', 'html', 'md', 'tsv'],
  slide: ['pdf', 'pptx', 'md', 'html', 'txt'],
  video: ['mp4', 'webm', 'gif', 'mkv', 'mov', 'mp3', 'avi'],
  audio: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'opus', 'aac'],
  ebook: ['epub', 'pdf', 'md', 'docx', 'html', 'txt'],
  data: ['json', 'csv', 'xlsx', 'yaml', 'xml'],
};

/* ------------------------------------------------------------------ boot */

init();

async function init() {
  bindEvents();
  applyThemeButton();
  if (/Mac|iPhone|iPad/.test(navigator.platform)) {
    const kbd = el.dropzone.querySelector('kbd');
    if (kbd) kbd.textContent = '⌘';
  }
  try {
    const response = await fetch('/api/capabilities');
    if (!response.ok) throw new Error('converter offline');
    state.caps = await response.json();
    const { stats } = state.caps;
    el.footnoteText.textContent =
      `${stats.conversions.toLocaleString()} conversions · ${stats.readable} formats · ${stats.engines} engines, all on this machine`;
    el.footnote.classList.remove('is-offline');
  } catch {
    el.footnote.classList.add('is-offline');
    el.footnoteText.textContent = 'The converter is not running. Start it with “npm start”.';
    showError('Converter unavailable', 'Forma could not reach its local conversion service. Restart the app and reload this page.');
  }
}

function bindEvents() {
  el.dropzone.addEventListener('click', () => el.input.click());
  el.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      el.input.click();
    }
  });

  el.input.addEventListener('change', () => {
    const files = [...(el.input.files ?? [])];
    if (files.length) addFiles(files);
    el.input.value = '';
  });

  el.addBtn.addEventListener('click', () => el.input.click());
  el.clearAllBtn.addEventListener('click', reset);
  el.againBtn.addEventListener('click', reset);
  el.errorBtn.addEventListener('click', reset);
  el.search.addEventListener('input', () => renderTargets(el.search.value));
  el.convertBtn.addEventListener('click', startConvert);
  el.downloadAll.addEventListener('click', downloadAll);
  el.formatsBtn.addEventListener('click', openFormats);
  el.dialogClose.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) el.dialog.close();
  });
  el.themeBtn.addEventListener('click', toggleTheme);

  el.fileRows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    removeFile(Number(button.dataset.remove));
  });

  // Drag and drop anywhere on the page.
  let depth = 0;
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth += 1;
    el.card.classList.add('is-dragging');
  });
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.card.classList.remove('is-dragging');
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    el.card.classList.remove('is-dragging');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) addFiles(files);
  });

  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  });
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/* ------------------------------------------------------------- selection */

async function addFiles(incoming) {
  if (!state.caps) {
    showError('Converter unavailable', 'Forma could not reach its local conversion service. Restart the app and reload this page.');
    return;
  }

  const room = MAX_FILES - state.files.length;
  const accepted = [];
  let skipped = 0;

  for (const file of incoming) {
    if (accepted.length >= room) { skipped += 1; continue; }
    if (file.size === 0) { skipped += 1; continue; }
    if (file.size > state.caps.maxBytes) {
      showError('That file is too big', `“${file.name}” is larger than ${formatBytes(state.caps.maxBytes)}.`);
      return;
    }
    const total = state.files.reduce((sum, entry) => sum + entry.file.size, 0)
      + accepted.reduce((sum, entry) => sum + entry.file.size, 0);
    if (total + file.size > MAX_TOTAL_BYTES) {
      showError('That is a lot of data', `Keep a batch under ${formatBytes(MAX_TOTAL_BYTES)} in total.`);
      return;
    }

    const ext = await resolveExt(file);
    if (!ext) {
      showError('Unknown file type', `Forma cannot tell what “${file.name}” is. Renaming it with its real extension usually fixes this.`);
      return;
    }
    accepted.push({ file, ext, targets: state.caps.matrix[ext] ?? [] });
  }

  if (!accepted.length) {
    if (skipped) showError('Too many files', `Forma converts up to ${MAX_FILES} files at once.`);
    return;
  }

  state.files.push(...accepted);
  el.errorCard.hidden = true;
  el.results.hidden = true;
  renderFiles();
  el.dropzone.hidden = true;
  el.filePanel.hidden = false;
  el.card.classList.add('has-file');

  if (skipped) {
    el.actionNote.textContent = `Skipped ${skipped} file${skipped === 1 ? '' : 's'} over the ${MAX_FILES}-file limit`;
  }

  renderTargets(el.search.value);
  el.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Extension from the name, falling back to magic-byte detection. */
async function resolveExt(file) {
  const candidate = extFromName(file.name);
  if (candidate && state.caps.formats[candidate]) return candidate;
  try {
    const response = await fetch('/api/detect', { method: 'POST', body: file.slice(0, 65536) });
    if (!response.ok) return null;
    const detected = await response.json();
    return detected?.ext && state.caps.formats[detected.ext] ? detected.ext : null;
  } catch {
    return null;
  }
}

function removeFile(index) {
  state.files.splice(index, 1);
  if (!state.files.length) {
    reset();
    return;
  }
  el.actionNote.textContent = '';
  renderFiles();
  renderTargets(el.search.value);
}

function renderFiles() {
  const count = state.files.length;
  const total = state.files.reduce((sum, entry) => sum + entry.file.size, 0);
  const keyword = count === 1 ? 'file' : 'files';
  el.filesCount.textContent = `${count} ${keyword} · ${formatBytes(total)}`;
  el.filesHead.hidden = false;

  if (count === 1) {
    el.fileRows.innerHTML = fileRow(state.files[0], 0, false);
    return;
  }

  el.fileRows.innerHTML = `<ul class="file-list" role="list">${
    state.files.map((entry, index) => fileRow(entry, index, true)).join('')
  }</ul>`;
}

function fileRow(entry, index, compact) {
  const { file, ext } = entry;
  const category = state.caps.formats[ext]?.category ?? '';
  const label = badgeFor(ext);
  const kind = CATEGORY_LABELS[category] ?? 'File';
  const meta = `${kind} · ${formatBytes(file.size)}`;
  const name = escapeHtml(file.name);
  const tag = compact ? 'li' : 'div';
  return `<${tag} class="file-row">
    <div class="file-badge" data-category="${category}">${escapeHtml(label)}</div>
    <div class="file-meta">
      <p class="file-name">${name}</p>
      <p class="file-sub">${meta}</p>
    </div>
    <button class="icon-btn" type="button" data-remove="${index}" aria-label="Remove ${name}">
      <svg class="icon"><use href="#i-close"></use></svg>
    </button>
  </${tag}>`;
}

/** Short, canonical file-type code for the badge (md, not markdown). */
function badgeFor(ext) {
  const canonical = state.caps?.aliases?.[ext] ?? ext;
  return canonical.toUpperCase();
}

/* --------------------------------------------------------------- targets */

function commonTargets() {
  if (!state.files.length) return [];
  let shared = new Set(state.files[0].targets);
  for (const entry of state.files.slice(1)) {
    shared = new Set([...shared].filter((target) => entry.targets.includes(target)));
  }
  return [...shared];
}

function renderTargets(query = '') {
  state.targets = commonTargets();
  const needle = query.trim().toLowerCase();
  const groups = new Map();

  for (const ext of state.targets) {
    const format = state.caps.formats[ext];
    const label = format?.label ?? ext.toUpperCase();
    if (needle && !`${ext} ${label}`.toLowerCase().includes(needle)) continue;
    const category = format?.category ?? 'other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(ext);
  }

  if (!state.targets.length) {
    const count = state.files.length;
    el.groups.innerHTML = '';
    el.groups.hidden = true;
    el.sectionHead.hidden = true;
    el.actionRow.hidden = true;
    el.noMatch.hidden = false;
    el.noMatch.textContent = count === 1
      ? `No installed engine can open ${state.files[0].ext.toUpperCase()} files yet. LibreOffice would unlock this format — the README shows the one-line install.`
      : `These ${count} files have no format in common. Remove a file, or convert them one at a time.`;
    el.convertBtn.disabled = true;
    el.convertLabel.textContent = 'Convert';
    return;
  }

  el.sectionHead.hidden = false;
  el.actionRow.hidden = false;
  el.groups.hidden = false;
  el.search.disabled = false;

  const order = categoryOrder();
  const sortedGroups = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

  if (!sortedGroups.length) {
    el.groups.innerHTML = '';
    el.noMatch.hidden = false;
    el.noMatch.textContent = `No format matches “${query.trim()}”.`;
    return;
  }

  el.noMatch.hidden = true;
  el.groups.innerHTML = sortedGroups.map(([category, exts]) => {
    const chips = sortTargets(exts, category).map((ext) => {
      const label = state.caps.formats[ext]?.label ?? ext.toUpperCase();
      const pressed = state.selected === ext;
      return `<button class="chip" type="button" role="radio" aria-checked="${pressed}" aria-pressed="${pressed}" data-ext="${ext}">${label}</button>`;
    }).join('');
    return `<div class="group" data-category="${category}">
      <p class="group-label">${CATEGORY_LABELS[category] ?? category}<span class="count">${exts.length}</span></p>
      <div class="chips" role="radiogroup" aria-label="${CATEGORY_LABELS[category] ?? category} formats">${chips}</div>
    </div>`;
  }).join('');

  for (const chip of el.groups.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => selectTarget(chip.dataset.ext));
  }

  if (!state.selected || !state.targets.includes(state.selected)) {
    const fallback = sortTargets(state.targets, state.caps.formats[state.targets[0]]?.category)[0];
    selectTarget(fallback);
  } else {
    selectTarget(state.selected);
  }
}

function selectTarget(ext) {
  if (!ext) return;
  state.selected = ext;
  for (const chip of el.groups.querySelectorAll('.chip')) {
    const active = chip.dataset.ext === ext;
    chip.setAttribute('aria-pressed', String(active));
    chip.setAttribute('aria-checked', String(active));
    chip.tabIndex = active ? 0 : -1;
  }
  const label = state.caps.formats[ext]?.label ?? ext.toUpperCase();
  const count = state.files.length;
  el.convertLabel.textContent = count > 1 ? `Convert ${count} files to ${label}` : `Convert to ${label}`;
  el.convertBtn.disabled = false;
  el.actionNote.textContent = count > 1
    ? `${state.targets.length} format${state.targets.length === 1 ? '' : 's'} shared by all ${count} files`
    : `${state.targets.length} format${state.targets.length === 1 ? '' : 's'} available`;
}

function sortTargets(exts, category) {
  const preferred = PREFERRED[category] ?? [];
  return [...exts].sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  });
}

function categoryOrder() {
  const seen = [];
  for (const format of Object.values(state.caps?.formats ?? {})) {
    if (!seen.includes(format.category)) seen.push(format.category);
  }
  return seen;
}

/* -------------------------------------------------------------- converting */

async function startConvert() {
  if (!state.files.length || !state.selected || state.phase === 'working') return;
  state.phase = 'working';
  state.startedAt = performance.now();
  state.batch = { done: 0, total: state.files.length };
  state.results = [];

  el.filePanel.hidden = true;
  el.results.hidden = true;
  el.errorCard.hidden = true;
  el.status.hidden = false;

  const targetLabel = state.caps.formats[state.selected]?.label ?? state.selected.toUpperCase();
  el.progressBar.classList.remove('is-determinate');
  el.progressBar.style.removeProperty('--progress');
  el.statusTime.textContent = '0.0 s';
  el.statusLabel.textContent = state.files.length > 1
    ? `Converting 1 of ${state.files.length} to ${targetLabel}…`
    : `Converting to ${targetLabel}…`;

  state.timer = setInterval(tickClock, 100);

  for (const [index, entry] of state.files.entries()) {
    const label = state.caps.formats[state.selected]?.label ?? state.selected.toUpperCase();
    el.statusLabel.textContent = state.files.length > 1
      ? `Converting ${index + 1} of ${state.files.length} to ${label}…`
      : `Converting to ${label}…`;
    el.progressBar.classList.add('is-determinate');
    el.progressBar.style.setProperty('--progress', `${Math.round((index / state.files.length) * 100)}%`);

    try {
      const result = await convertOne(entry, state.selected);
      state.results.push(result);
      state.batch.done += 1;
      el.progressBar.style.setProperty('--progress', `${Math.round((state.batch.done / state.files.length) * 100)}%`);
    } catch (error) {
      stopClock();
      el.status.hidden = true;
      const prefix = state.files.length > 1 ? `“${entry.file.name}” — ` : '';
      showError('That didn’t work', `${prefix}${error.message}`);
      return;
    }
  }

  stopClock();
  el.status.hidden = true;
  showResults();
}

async function convertOne(entry, target) {
  const started = performance.now();
  const query = new URLSearchParams({ target, name: entry.file.name });
  const response = await fetch(`/api/convert?${query.toString()}`, { method: 'POST', body: entry.file });
  if (!response.ok) {
    let message = 'The conversion failed.';
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  return {
    name: decodeURIComponent(response.headers.get('X-Forma-Name') || '') || `${baseName(entry.file.name)}.${target}`,
    blob,
    url: URL.createObjectURL(blob),
    size: blob.size,
    ext: target,
    engine: decodeURIComponent(response.headers.get('X-Forma-Engine') || ''),
    note: decodeURIComponent(response.headers.get('X-Forma-Note') || ''),
    elapsed: Number(response.headers.get('X-Forma-Elapsed') || 0) || Math.round(performance.now() - started),
    sourceExt: entry.ext,
    sourceSize: entry.file.size,
  };
}

function tickClock() {
  const seconds = (performance.now() - state.startedAt) / 1000;
  el.statusTime.textContent = `${seconds.toFixed(1)} s`;
}

function stopClock() {
  clearInterval(state.timer);
  state.timer = null;
}

/* ---------------------------------------------------------------- results */

function showResults() {
  state.phase = 'done';
  const multi = state.results.length > 1;
  el.results.hidden = false;
  el.results.classList.toggle('is-multi', multi);
  el.downloadAll.hidden = !multi;

  el.resultsList.innerHTML = state.results.map((result) => {
    const label = lookupLabel(result.ext);
    const delta = result.sourceSize > 0
      ? Math.round(((result.size - result.sourceSize) / result.sourceSize) * 100)
      : 0;
    const deltaText = delta <= -2 ? ` · ${delta}%` : '';
    const meta = multi
      ? `${label} · ${formatBytes(result.size)}${deltaText}`
      : `${label} · ${formatBytes(result.size)}${deltaText} · ${(result.elapsed / 1000).toFixed(1)} s${result.engine ? ` · via ${result.engine}` : ''}`;

    const previewable = /^image\//.test(result.blob.type) && result.ext !== 'svg';
    const thumb = previewable
      ? `<div class="result-thumb" aria-hidden="true"><img src="${result.url}" alt=""></div>`
      : '<div class="result-thumb is-success" aria-hidden="true"><svg class="icon"><use href="#i-check"></use></svg></div>';

    return `<li class="result-row">
      ${thumb}
      <div class="result-meta">
        <p class="result-name">${escapeHtml(result.name)}</p>
        <p class="result-sub">${escapeHtml(meta)}</p>
      </div>
      <a class="btn btn-filled result-download" href="${result.url}" download="${escapeHtml(result.name)}">
        <svg class="icon icon-18" aria-hidden="true"><use href="#i-download"></use></svg>
        <span>Download</span>
      </a>
    </li>`;
  }).join('');

  el.results.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function downloadAll() {
  if (!state.results.length) return;
  const entries = [];
  for (const result of state.results) entries.push({ name: result.name, data: result.blob });
  // Read blobs asynchronously, then zip and save.
  Promise.all(entries.map(async (entry) => ({
    name: entry.name,
    data: new Uint8Array(await entry.data.arrayBuffer()),
  }))).then((files) => {
    const zip = createZip(files);
    const stamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(zip);
    anchor.download = `forma-${stamp}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 30_000);
  });
}

function lookupLabel(ext) {
  return state.caps?.formats?.[ext]?.label ?? ext.toUpperCase();
}

function showError(title, message) {
  state.phase = 'error';
  stopClock();
  el.status.hidden = true;
  el.results.hidden = true;
  el.filePanel.hidden = true;
  el.dropzone.hidden = true;
  el.card.classList.add('has-file');
  el.errorCard.hidden = false;
  el.errorTitle.textContent = title;
  el.errorMsg.textContent = message;
}

function reset() {
  stopClock();
  state.phase = 'idle';
  state.selected = null;
  state.targets = [];
  state.files = [];
  for (const result of state.results) URL.revokeObjectURL(result.url);
  state.results = [];

  el.fileRows.innerHTML = '';
  el.filesHead.hidden = true;
  el.groups.innerHTML = '';
  el.groups.hidden = false;
  el.sectionHead.hidden = false;
  el.actionRow.hidden = false;
  el.search.value = '';
  el.search.disabled = false;
  el.noMatch.hidden = true;
  el.errorCard.hidden = true;
  el.status.hidden = true;
  el.results.hidden = true;
  el.resultsList.innerHTML = '';
  el.convertBtn.disabled = true;
  el.convertLabel.textContent = 'Convert';
  el.actionNote.textContent = '';
  el.progressBar.classList.remove('is-determinate');
  el.progressBar.style.removeProperty('--progress');

  el.filePanel.hidden = true;
  el.dropzone.hidden = false;
  el.card.classList.remove('has-file');
}

/* ---------------------------------------------------------------- formats */

function openFormats() {
  if (!state.caps) return;
  const { formats, matrix, stats, engines } = state.caps;
  el.dialogSub.textContent =
    `${stats.conversions.toLocaleString()} working conversions between ${stats.readable} readable formats. Anything not listed has no installed engine yet.`;

  const order = categoryOrder();
  const aliases = state.caps.aliases ?? {};
  const grouped = new Map();
  for (const [ext, format] of Object.entries(formats)) {
    if (aliases[ext]) continue;
    if (!matrix[ext]?.length) continue;
    if (!grouped.has(format.category)) grouped.set(format.category, []);
    grouped.get(format.category).push({ ext, ...format, targets: matrix[ext] });
  }

  el.dialogBody.innerHTML = [...grouped.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([category, entries]) => {
      const chips = sortTargets(entries.map((e) => e.ext), category).map((ext) => {
        const entry = entries.find((e) => e.ext === ext);
        return `<span class="dialog-chip" title="${entry.targets.length} target formats">${entry.label}</span>`;
      }).join('');
      return `<div class="dialog-group">
        <h3>${CATEGORY_LABELS[category] ?? category}<span class="count">${entries.length}</span></h3>
        <div class="chips">${chips}</div>
      </div>`;
    }).join('');

  el.dialogEngines.innerHTML = engines.map((engine) => `
    <span class="engine ${engine.ok ? '' : 'is-off'}">
      <a href="${engine.home}" target="_blank" rel="noreferrer noopener">${engine.name}</a>
      <span class="engine-version">${engine.ok ? escapeHtml(engine.version ?? 'ready') : 'not installed'}</span>
    </span>`).join('');

  el.dialog.showModal();
}

/* ------------------------------------------------------------------ theme */

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('forma-theme', next);
  } catch {
    /* private mode, ignore */
  }
  applyThemeButton();
}

function applyThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  el.themeIcon.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  el.themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

/* --------------------------------------------------------------- helpers */

function extFromName(name) {
  const clean = String(name ?? '');
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return null;
  return clean.slice(dot + 1).toLowerCase();
}

function baseName(name) {
  const clean = String(name ?? 'file');
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(0, dot) : clean;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
