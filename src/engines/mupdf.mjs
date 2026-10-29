import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import sharp from 'sharp';

const TARGETS = ['png', 'jpg', 'jpeg', 'webp', 'txt', 'md', 'html', 'svg'];
const MAX_PAGES = 50;

let mupdfPromise = null;
let cached = null;

function loadMupdf() {
  mupdfPromise ??= import('mupdf');
  return mupdfPromise;
}

export default {
  id: 'mupdf',
  name: 'MuPDF',
  home: 'https://mupdf.com',
  blurb: 'PDF rendering and text extraction',

  from: ['pdf'],

  targets(fromExt) {
    return fromExt === 'pdf' ? [...TARGETS] : [];
  },

  async probe() {
    if (cached) return cached;
    try {
      const mupdf = await loadMupdf();
      return (cached = { ok: Boolean(mupdf.Document), version: 'mupdf.js' });
    } catch (error) {
      return (cached = { ok: false, detail: error.message });
    }
  },

  async run({ inputPath, outputPath, toExt, opts, baseName }) {
    const mupdf = await loadMupdf();
    const doc = mupdf.Document.openDocument(readFileSync(inputPath), 'application/pdf');
    const pageCount = doc.countPages();
    if (!pageCount) throw new Error('That PDF has no pages');

    const pages = Math.min(pageCount, MAX_PAGES);
    const multi = pages > 1;

    if (toExt === 'txt' || toExt === 'md') {
      const chunks = [];
      for (let i = 0; i < pages; i++) {
        const page = doc.loadPage(i);
        const text = page.toStructuredText('preserve-whitespace').asText().replace(/[ \t]+$/gm, '').trim();
        if (text) chunks.push(text);
      }
      if (!chunks.length) throw new Error('No selectable text in that PDF — it is probably a scan');
      writeFileSync(outputPath, chunks.join('\n\n') + '\n');
      return { engine: 'MuPDF' };
    }

    if (toExt === 'html') {
      const body = [];
      for (let i = 0; i < pages; i++) {
        const page = doc.loadPage(i);
        const html = page.toStructuredText('preserve-images').asHTML(1);
        body.push(`<section class="page" data-page="${i + 1}">${html}</section>`);
      }
      writeFileSync(outputPath, shell(baseName, body.join('\n'), pageCount));
      return { engine: 'MuPDF' };
    }

    if (toExt === 'svg') {
      const files = [];
      for (let i = 0; i < pages; i++) {
        const page = doc.loadPage(i);
        const buffer = new mupdf.Buffer();
        const writer = new mupdf.DocumentWriter(buffer, 'svg', '');
        const device = writer.beginPage(page.getBounds());
        page.run(device, mupdf.Matrix.identity);
        writer.endPage();
        writer.close();
        files.push(Buffer.from(buffer.asUint8Array()));
      }
      await emit(files, 'svg', outputPath, baseName, multi);
      return { engine: 'MuPDF', outputExt: multi ? 'zip' : undefined };
    }

    // Raster targets: render every page at 150 dpi, then encode.
    const scale = (opts.dpi ?? 150) / 72;
    const files = [];
    for (let i = 0; i < pages; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
      const png = Buffer.from(pixmap.asPNG());
      if (toExt === 'png') {
        files.push(png);
      } else {
        let pipeline = sharp(png);
        if (toExt === 'jpg' || toExt === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: opts.quality ?? 85, mozjpeg: true });
        else if (toExt === 'webp') pipeline = pipeline.webp({ quality: opts.quality ?? 85 });
        else throw new Error(`MuPDF cannot render to .${toExt}`);
        files.push(await pipeline.toBuffer());
      }
    }

    await emit(files, toExt === 'jpeg' ? 'jpg' : toExt, outputPath, baseName, multi);
    return {
      engine: 'MuPDF',
      outputExt: multi ? 'zip' : undefined,
      note: pageCount > MAX_PAGES ? `first ${MAX_PAGES} of ${pageCount} pages` : `${pageCount} pages`,
    };
  },
};

async function emit(files, ext, outputPath, baseName, multi) {
  if (!multi) {
    writeFileSync(outputPath, files[0]);
    return;
  }
  const zip = new JSZip();
  const pad = String(files.length).length;
  files.forEach((buffer, index) => {
    zip.file(`${baseName}-${String(index + 1).padStart(pad, '0')}.${ext}`, buffer);
  });
  writeFileSync(outputPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

function shell(title, body, pages) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; background: #f8f9fa; color: #1f1f1f; }
  .page { background: #fff; max-width: 44rem; margin: 24px auto; padding: 48px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .page:first-child { margin-top: 40px; }
  p { margin: 0 0 .6em; }
  @media print { body { background: #fff } .page { box-shadow: none; margin: 0 auto; padding: 0 } }
</style></head>
<body>
<main>
${body}
</main>
<!-- ${pages} page(s), extracted with MuPDF -->
</body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
