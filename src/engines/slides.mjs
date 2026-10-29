import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const SOURCES = ['pptx'];
const TARGETS = ['txt', 'md', 'html'];

export default {
  id: 'slides',
  name: 'OOXML reader',
  home: 'https://learn.microsoft.com/office/open-xml',
  blurb: 'reading text out of PowerPoint decks',

  from: SOURCES,

  targets(fromExt) {
    return SOURCES.includes(fromExt) ? [...TARGETS] : [];
  },

  async probe() {
    return { ok: true, version: 'built in' };
  },

  async run({ inputPath, outputPath, toExt, opts }) {
    const zip = await JSZip.loadAsync(readFileSync(inputPath));
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));

    if (!slideFiles.length) throw new Error('That file does not look like a PowerPoint deck');

    const slides = [];
    for (const [index, name] of slideFiles.entries()) {
      const xml = await zip.file(name).async('string');
      const title = matchOne(xml, /<p:title>[\s\S]*?<\/p:title>/);
      const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
        .map((match) => [...match[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => unescapeXml(t[1])).join(''))
        .map((line) => line.trim())
        .filter(Boolean);
      slides.push({ index: index + 1, title: title ? unescapeXml(title).trim() : '', paragraphs });
    }

    if (toExt === 'txt') {
      const text = slides
        .map((slide) => [slide.title || `Slide ${slide.index}`, ...slide.paragraphs.filter((p) => p !== slide.title)].join('\n'))
        .join('\n\n');
      writeFileSync(outputPath, `${text}\n`);
    } else if (toExt === 'md') {
      const md = slides.map((slide) => [
        `## ${slide.title || `Slide ${slide.index}`}`,
        '',
        ...slide.paragraphs.filter((p) => p !== slide.title).map((p) => `- ${p}`),
      ].join('\n')).join('\n\n');
      writeFileSync(outputPath, `# ${opts.title ?? 'Presentation'}\n\n${md}\n`);
    } else if (toExt === 'html') {
      const body = slides.map((slide) => `<section class="slide" data-slide="${slide.index}">
  <h2>${escapeHtml(slide.title || `Slide ${slide.index}`)}</h2>
  ${slide.paragraphs.filter((p) => p !== slide.title).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
</section>`).join('\n');
      writeFileSync(outputPath, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? 'Presentation')}</title>
<style>
  body { font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 32px; background: #f8f9fa; color: #1f1f1f; }
  .slide { background: #fff; border-radius: 12px; padding: 32px; margin: 0 auto 24px; max-width: 46rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  h2 { font-size: 20px; margin: 0 0 16px; }
</style></head>
<body>
${body}
</body></html>`);
    } else {
      throw new Error(`Cannot write .${toExt}`);
    }

    return { engine: 'OOXML reader', note: `${slides.length} slides` };
  },
};

function matchOne(xml, regex) {
  const inner = xml.match(regex)?.[0];
  if (!inner) return '';
  return [...inner.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => unescapeXml(t[1])).join(' ');
}

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
