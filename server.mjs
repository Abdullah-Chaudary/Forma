import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilities } from './src/registry.mjs';
import { convert } from './src/convert.mjs';
import { FORMATS, CATEGORIES, ALIASES, MAX_BYTES, normaliseExt, extOf } from './src/catalog.mjs';
import { sniff } from './src/sniff.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.on('finish', () => {
    if (process.env.FORMA_TRACE) {
      console.log('REQ', req.method, req.url.slice(0, 80), '→', res.statusCode, res.getHeader('content-length') ?? '-');
    }
  });
  next();
});

app.use(express.static(path.join(here, 'public'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=300');
  },
}));

const raw = express.raw({ type: () => true, limit: MAX_BYTES });

app.get('/api/capabilities', async (req, res, next) => {
  try {
    const data = await capabilities();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...data,
      formats: FORMATS,
      categories: CATEGORIES,
      aliases: ALIASES,
      maxBytes: MAX_BYTES,
    });
  } catch (error) {
    next(error);
  }
});

/** Identify a file that arrived without an extension. */
app.post('/api/detect', express.raw({ type: () => true, limit: 2 * 1024 * 1024 }), async (req, res, next) => {
  try {
    const ext = sniff(req.body);
    if (!ext) return res.status(422).json({ error: 'Forma could not identify this file' });
    const caps = await capabilities();
    const known = FORMATS[ext] ? ext : null;
    res.json({
      ext: known ?? ext,
      category: known ? FORMATS[known].category : null,
      targets: known ? (caps.matrix[known] ?? []) : [],
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/convert', raw, async (req, res, next) => {
  try {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'No file received' });
    }

    const target = normaliseExt(req.query.target);
    if (!target) {
      return res.status(400).json({ error: 'Pick a valid target format' });
    }

    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const declared = normaliseExt(extOf(name));
    const fromExt = declared ?? normaliseExt(sniff(body));
    if (!fromExt) {
      return res.status(415).json({
        error: 'Forma could not tell what kind of file that is. Try renaming it with its extension.',
      });
    }

    const started = Date.now();
    const result = await convert({
      buffer: body,
      fromExt,
      toExt: target,
      name: name || `file.${fromExt}`,
      opts: {
        quality: clampNumber(req.query.q, 30, 100),
        maxWidth: clampNumber(req.query.w, 64, 7680),
        dpi: clampNumber(req.query.dpi, 72, 600),
      },
    });

    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Length', String(result.buffer.length));
    // Deliberately no Content-Disposition: Chromium treats an attachment
    // response as a download and hands fetch/XHR an empty 204. The client
    // names the saved file from X-Forma-Name instead.
    res.setHeader('X-Forma-Name', encodeURIComponent(result.filename));
    res.setHeader('X-Forma-Engine', encodeURIComponent(result.engines.join(' + ')));
    res.setHeader('X-Forma-Source', fromExt);
    res.setHeader('X-Forma-Elapsed', String(result.elapsedMs));
    res.setHeader('X-Forma-Note', encodeURIComponent(result.note ?? ''));
    res.setHeader('Access-Control-Expose-Headers', 'X-Forma-Name, X-Forma-Engine, X-Forma-Source, X-Forma-Elapsed, X-Forma-Note');
    res.setHeader('Cache-Control', 'no-store');
    console.log(`  ✓ ${fromExt} → ${target}  ${(result.buffer.length / 1024).toFixed(1)} KB  ${result.engines.join(' + ')}  ${result.elapsedMs} ms`);
    res.end(result.buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', async (req, res) => {
  const caps = await capabilities();
  res.json({ ok: true, stats: caps.stats });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(here, 'public', '404.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: `That file is larger than the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit` });
  }
  const status = error?.code === 'unsupported' ? 415 : 422;
  res.status(status).json({
    error: error?.message ?? 'Conversion failed',
    code: error?.code ?? 'conversion_failed',
    attempted: error?.attempted ?? undefined,
  });
});

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const server = app.listen(PORT, HOST, async () => {
  const caps = await capabilities();
  const ok = caps.engines.filter((engine) => engine.ok);
  const missing = caps.engines.filter((engine) => !engine.ok);
  const line = (label, value) => `  ${label.padEnd(10)} ${value}`;
  console.log('');
  console.log('  Forma - any file, any format');
  console.log(`  ${'-'.repeat(46)}`);
  console.log(line('engines', ok.map((e) => e.name).join(', ')));
  if (missing.length) console.log(line('inactive', missing.map((e) => e.name).join(', ')));
  console.log(line('catalog', `${caps.stats.formats} formats`));
  console.log(line('matrix', `${caps.stats.conversions} conversions across ${caps.stats.readable} source formats`));
  console.log(`  ${'-'.repeat(46)}`);
  console.log(`  ready at http://${HOST}:${PORT}`);
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

export { app };
