import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mimeOf } from './catalog.mjs';
import { planFor } from './registry.mjs';

const ZIP_TARGETS = new Set(['zip']);

/** Run one conversion through the best available plan, falling back on failure. */
export async function convert({ buffer, fromExt, toExt, name, opts = {} }) {
  const started = Date.now();
  const plans = await planFor(fromExt, toExt);
  const dir = mkdtempSync(path.join(tmpdir(), 'forma-run-'));
  const base = safeBaseName(name, fromExt);
  const inputPath = path.join(dir, `input.${fromExt}`);
  writeFileSync(inputPath, buffer);

  let lastError = null;
  const attempted = [];

  try {
    for (const plan of plans) {
      try {
        let currentPath = inputPath;
        let currentExt = fromExt;
        let outputExt = toExt;
        let note;
        const engines = [];

        for (const [index, step] of plan.steps.entries()) {
          const last = index === plan.steps.length - 1;
          const outputPath = path.join(dir, last ? `output.${step.to}` : `step-${index}.${step.to}`);
          const result = await step.engine.run({
            inputPath: currentPath,
            outputPath,
            fromExt: currentExt,
            toExt: step.to,
            baseName: base,
            opts: { ...opts, title: opts.title ?? base, fromExt: currentExt },
          });
          engines.push(result.engine ?? step.engine.name);
          if (result.outputExt) outputExt = result.outputExt;
          if (result.note) note = result.note;
          currentPath = outputPath;
          currentExt = step.to;
        }

        const output = readFileSync(currentPath);
        return {
          buffer: output,
          ext: outputExt,
          filename: outputName(base, outputExt),
          mime: ZIP_TARGETS.has(outputExt) ? 'application/zip' : mimeOf(outputExt),
          engines: [...new Set(engines)],
          note,
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        lastError = error;
        attempted.push(`${plan.label}: ${shortMessage(error)}`);
      }
    }

    const error = new Error(plans.length > 1
      ? `All ${plans.length} conversion routes failed. ${attempted[0]}`
      : shortMessage(lastError));
    error.code = 'conversion_failed';
    error.attempted = attempted;
    throw error;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function outputName(base, ext) {
  return ext === 'zip' ? `${base}-pages.zip` : `${base}.${ext}`;
}

export function safeBaseName(name, fromExt) {
  const raw = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const stem = raw.replace(new RegExp(`\\.${fromExt}$`, 'i'), '');
  const cleaned = stem
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return cleaned || 'converted';
}

function shortMessage(error) {
  const message = String(error?.message ?? 'unknown error').replace(/\s+/g, ' ').trim();
  return message.length > 220 ? `${message.slice(0, 217)}…` : message;
}
