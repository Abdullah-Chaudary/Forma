import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

const IMAGE_SOURCES = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'svg', 'heic', 'heif'];
const TEXT_SOURCES = ['txt', 'md', 'markdown', 'csv', 'json'];

const A4 = [595.28, 841.89];
const MARGIN = 56;

export default {
  id: 'pdf',
  name: 'pdf-lib',
  home: 'https://pdf-lib.js.org',
  blurb: 'building PDFs from images and plain text',

  from: [...IMAGE_SOURCES, ...TEXT_SOURCES],

  targets(fromExt) {
    return this.from.includes(fromExt) ? ['pdf'] : [];
  },

  async probe() {
    return { ok: true, version: 'pdf-lib' };
  },

  async run({ inputPath, outputPath, fromExt, opts }) {
    const doc = await PDFDocument.create();
    doc.setTitle(opts.title ?? '');
    doc.setProducer('Forma');
    doc.setCreator('Forma');

    if (IMAGE_SOURCES.includes(fromExt)) {
      await addImagePage(doc, inputPath, fromExt);
    } else {
      const text = normaliseText(readFileSync(inputPath, 'utf8'), fromExt);
      await addTextPages(doc, text);
    }

    writeFileSync(outputPath, await doc.save());
    return { engine: 'pdf-lib' };
  },
};

async function addImagePage(doc, inputPath, fromExt) {
  const raw = readFileSync(inputPath);
  let embedded;
  if (fromExt === 'jpg' || fromExt === 'jpeg') {
    embedded = await doc.embedJpg(raw);
  } else if (fromExt === 'png') {
    embedded = await doc.embedPng(raw);
  } else {
    const png = await sharp(raw).png().toBuffer();
    embedded = await doc.embedPng(png);
  }

  const [pw, ph] = A4;
  const scale = Math.min((pw - MARGIN) / embedded.width, (ph - MARGIN) / embedded.height);
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  const page = doc.addPage(A4);
  page.drawImage(embedded, {
    x: (pw - width) / 2,
    y: (ph - height) / 2,
    width,
    height,
  });
}

async function addTextPages(doc, text) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [pw, ph] = A4;
  const maxWidth = pw - MARGIN * 2;
  const lineHeight = 15;
  const size = 11;

  let page = doc.addPage(A4);
  let y = ph - MARGIN;
  const newPage = () => {
    page = doc.addPage(A4);
    y = ph - MARGIN;
  };

  for (const block of text.split('\n')) {
    const isHeading = /^#{1,3}\s/.test(block);
    const content = block.replace(/^#{1,6}\s*/, '').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/`([^`]+)`/g, '$1');
    if (!content.trim()) {
      y -= lineHeight * 0.6;
      if (y < MARGIN) newPage();
      continue;
    }
    const useFont = isHeading ? bold : font;
    const useSize = isHeading ? 15 : size;
    for (const line of wrap(content, useFont, useSize, maxWidth)) {
      if (y < MARGIN) newPage();
      page.drawText(line, { x: MARGIN, y, size: useSize, font: useFont, color: rgb(0.12, 0.12, 0.12) });
      y -= isHeading ? lineHeight * 1.4 : lineHeight;
    }
    y -= isHeading ? 10 : 4;
  }
}

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
        lines.push(current);
        current = current.slice(0, -1);
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function normaliseText(text, fromExt) {
  const body = text.replace(/\r\n/g, '\n');
  if (fromExt === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}
