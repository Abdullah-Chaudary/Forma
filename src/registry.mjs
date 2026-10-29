import { FORMATS, CATEGORIES, normaliseExt } from './catalog.mjs';
import soffice from './engines/soffice.mjs';
import sharpEngine from './engines/sharp.mjs';
import pdfEngine from './engines/pdf.mjs';
import sheets from './engines/sheets.mjs';
import slides from './engines/slides.mjs';
import mupdf from './engines/mupdf.mjs';
import pandoc from './engines/pandoc.mjs';
import chrome from './engines/chrome.mjs';
import ffmpeg from './engines/ffmpeg.mjs';

/**
 * Preference order. When two engines can do the same job the earlier one wins:
 * office suites and libvips produce the best fidelity, ffmpeg is the safety net
 * for media and exotic raster formats.
 */
export const ENGINES = [soffice, sharpEngine, pdfEngine, sheets, slides, mupdf, pandoc, chrome, ffmpeg];

const CATEGORY_ORDER = Object.keys(CATEGORIES);

let snapshot = null;

async function activeEngines() {
  const probed = await Promise.all(ENGINES.map(async (engine) => {
    let status;
    try {
      status = await engine.probe();
    } catch (error) {
      status = { ok: false, detail: error.message };
    }
    return { engine, status };
  }));
  return probed;
}

/**
 * Build every conversion plan the installed engines can honour.
 * A plan is a list of steps; most are one step, a handful are two
 * (e.g. DOCX → HTML → PDF).
 */
export function buildPlans(active, fromExt, toExt) {
  const usable = active.filter((entry) => entry.status.ok).map((entry) => entry.engine);
  const direct = new Set();
  for (const engine of usable) {
    if (!engine.from.includes(fromExt)) continue;
    if (engine.targets(fromExt).includes(toExt)) direct.add(engine);
  }

  const chains = [];
  if (toExt === 'pdf' && fromExt !== 'html' && fromExt !== 'htm') {
    const producer = usable.find((engine) =>
      engine.id !== 'chrome' && engine.from.includes(fromExt) && engine.targets(fromExt).includes('html'));
    const consumer = usable.find((engine) =>
      engine.id === 'chrome' && engine.from.includes('html') && engine.targets('html').includes('pdf'));
    if (producer && consumer) {
      chains.push({
        steps: [
          { engine: producer, from: fromExt, to: 'html' },
          { engine: consumer, from: 'html', to: 'pdf' },
        ],
        label: `${producer.name} → ${consumer.name}`,
      });
    }
  }

  const directPlans = [];
  for (const engine of ENGINES) {
    if (direct.has(engine)) {
      directPlans.push({ steps: [{ engine, from: fromExt, to: toExt }], label: engine.name, kind: 'direct' });
    }
  }

  // A real office suite beats every improvised route, so it goes first.
  const native = directPlans.filter((plan) => plan.steps[0].engine.id === 'soffice');
  const rest = directPlans.filter((plan) => plan.steps[0].engine.id !== 'soffice');

  // For documents, a styled HTML pass through Chromium looks far better than
  // laying out plain text, so prefer the chain over the plain-text fallback.
  return [...native, ...chains.map((chain) => ({ ...chain, kind: 'chain' })), ...rest];
}

export function targetsFor(active, fromExt) {
  const found = new Set();
  for (const { engine, status } of active) {
    if (!status.ok || !engine.from.includes(fromExt)) continue;
    for (const target of engine.targets(fromExt)) found.add(target);
  }
  if (fromExt !== 'html' && found.has('html') && active.some((e) => e.status.ok && e.engine.id === 'chrome')) {
    found.add('pdf');
  }
  if (fromExt === 'html' || fromExt === 'htm') {
    const chainPdf = active.some((e) => e.status.ok && e.engine.id === 'chrome');
    if (chainPdf) found.add('pdf');
  }
  found.delete(fromExt);
  return [...found];
}

export async function capabilities() {
  if (snapshot) return snapshot;

  const active = await activeEngines();
  const matrix = {};
  let edges = 0;
  let readable = 0;

  for (const ext of Object.keys(FORMATS)) {
    const targets = targetsFor(active, ext);
    if (!targets.length) continue;
    readable += 1;
    const category = FORMATS[ext].category;
    targets.sort((a, b) => {
      const inCat = FORMATS[a].category === category ? 0 : 1;
      const inCatB = FORMATS[b].category === category ? 0 : 1;
      if (inCat !== inCatB) return inCat - inCatB;
      const order = CATEGORY_ORDER.indexOf(FORMATS[a].category) - CATEGORY_ORDER.indexOf(FORMATS[b].category);
      if (order !== 0) return order;
      return a.localeCompare(b);
    });
    matrix[ext] = targets;
    edges += targets.length;
  }

  snapshot = {
    engines: active.map(({ engine, status }) => ({
      id: engine.id,
      name: engine.name,
      blurb: engine.blurb,
      home: engine.home,
      ok: Boolean(status.ok),
      version: status.version ?? null,
      detail: status.detail ?? null,
    })),
    matrix,
    stats: {
      formats: Object.keys(FORMATS).length,
      readable,
      conversions: edges,
      engines: active.filter((e) => e.status.ok).length,
    },
  };
  return snapshot;
}

export async function planFor(fromExt, toExt) {
  const active = await activeEngines();
  const plans = buildPlans(active, fromExt, toExt);
  if (!plans.length) {
    const known = normaliseExt(fromExt) && normaliseExt(toExt);
    throw Object.assign(
      new Error(known
        ? `No installed engine converts ${fromExt.toUpperCase()} to ${toExt.toUpperCase()} yet.`
        : `Forma does not recognise one of those formats.`),
      { code: 'unsupported' },
    );
  }
  return plans;
}
