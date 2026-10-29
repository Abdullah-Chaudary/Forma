import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const SOURCES = ['xlsx', 'xls', 'ods', 'csv', 'tsv'];
const TARGETS = ['xlsx', 'xls', 'ods', 'csv', 'tsv', 'html', 'json', 'md', 'txt', 'xml'];

const BOOK_TYPES = { xlsx: 'xlsx', xls: 'biff8', ods: 'ods', xml: 'xml' };

export default {
  id: 'sheets',
  name: 'SheetJS',
  home: 'https://sheetjs.com',
  blurb: 'spreadsheets and tabular data',

  from: SOURCES,

  targets(fromExt) {
    return SOURCES.includes(fromExt) ? TARGETS.filter((t) => t !== fromExt) : [];
  },

  async probe() {
    return { ok: Boolean(XLSX.version), version: `SheetJS ${XLSX.version}` };
  },

  async run({ inputPath, outputPath, toExt, opts, baseName }) {
    const workbook = XLSX.read(readFileSync(inputPath), { type: 'buffer', cellDates: true, codepage: 65001 });
    const names = workbook.SheetNames;
    if (!names.length) throw new Error('That spreadsheet has no sheets');
    const first = workbook.Sheets[names[0]];

    if (BOOK_TYPES[toExt]) {
      writeFileSync(outputPath, XLSX.write(workbook, { type: 'buffer', bookType: BOOK_TYPES[toExt] }));
      return { engine: 'SheetJS' };
    }

    if (toExt === 'csv' || toExt === 'tsv' || toExt === 'txt') {
      const fs = toExt === 'tsv' || toExt === 'txt' ? '\t' : ',';
      const text = XLSX.utils.sheet_to_csv(first, { FS: fs, blankrows: false });
      writeFileSync(outputPath, text + (text.endsWith('\n') ? '' : '\n'));
      return { engine: 'SheetJS', note: names.length > 1 ? `first sheet of ${names.length}` : undefined };
    }

    if (toExt === 'json') {
      const rows = XLSX.utils.sheet_to_json(first, { defval: null });
      writeFileSync(outputPath, JSON.stringify(rows, null, 2) + '\n');
      return { engine: 'SheetJS' };
    }

    if (toExt === 'md') {
      writeFileSync(outputPath, toMarkdown(first, names[0]) + '\n');
      return { engine: 'SheetJS' };
    }

    if (toExt === 'html') {
      const sections = names.map((name) => {
        const table = XLSX.utils.sheet_to_html(workbook.Sheets[name], { id: `sheet-${slug(name)}` });
        return `<section><h2>${escapeHtml(name)}</h2>${table}</section>`;
      });
      writeFileSync(outputPath, htmlShell(baseName, sections.join('\n'), names));
      return { engine: 'SheetJS' };
    }

    throw new Error(`SheetJS cannot write .${toExt}`);
  },
};

function toMarkdown(sheet, title) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) return `# ${title}\n\n_Empty sheet._`;
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
  const width = Math.max(...rows.map((r) => r.length));
  const line = (row) => `| ${Array.from({ length: width }, (_, i) => cell(row[i])).join(' | ')} |`;
  const [head, ...body] = rows;
  return [
    `# ${title}`,
    '',
    line(head),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map(line),
  ].join('\n');
}

function htmlShell(title, body, names) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 32px; color: #1f1f1f; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #5f6368; margin: 32px 0 8px; }
  table { border-collapse: collapse; font-size: 13px; }
  td, th { border: 1px solid #dadce0; padding: 6px 10px; text-align: left; }
  tr:nth-child(even) td { background: #f8f9fa; }
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${names.length} sheet${names.length === 1 ? '' : 's'} · exported with Forma</p>
${body}
</body></html>`;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
