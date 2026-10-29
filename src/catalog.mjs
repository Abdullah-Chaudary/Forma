/**
 * Format catalog.
 *
 * Every extension Forma knows about, grouped into the family it belongs to.
 * The catalog is deliberately data-only: the conversion matrix is derived at
 * runtime from whichever engines are actually installed (see registry.mjs).
 */

export const CATEGORIES = {
  image: { label: 'Image', blurb: 'Photos, screenshots, artwork', hue: 'blue' },
  document: { label: 'Document', blurb: 'Text, office files, PDFs', hue: 'red' },
  sheet: { label: 'Spreadsheet', blurb: 'Tables and tabular data', hue: 'green' },
  slide: { label: 'Presentation', blurb: 'Slide decks', hue: 'orange' },
  video: { label: 'Video', blurb: 'Clips and movies', hue: 'purple' },
  audio: { label: 'Audio', blurb: 'Sound and music', hue: 'cyan' },
  ebook: { label: 'E-book', blurb: 'Books and long-form reading', hue: 'amber' },
  data: { label: 'Data', blurb: 'Structured text', hue: 'teal' },
};

const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'tif', 'bmp', 'ico', 'svg',
  'heic', 'heif', 'psd', 'tga', 'pnm', 'ppm', 'pgm', 'pbm', 'dds', 'exr', 'hdr'];

const DOCUMENT = ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'markdown', 'html', 'htm',
  'tex', 'latex', 'rst', 'org', 'ipynb', 'adoc', 'asciidoc', 'textile', 'mediawiki', 'wiki',
  'opml', 'man', 'docbook'];

const SHEET = ['xlsx', 'xls', 'ods', 'csv', 'tsv'];
const SLIDE = ['pptx', 'odp', 'key'];
const VIDEO = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', 'ogv', '3gp'];
const AUDIO = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'aif', 'ac3', 'amr'];
const EBOOK = ['epub', 'mobi', 'azw3', 'fb2'];
const DATA = ['json', 'yaml', 'yml', 'xml'];

const GROUPED = {
  image: IMAGE,
  document: DOCUMENT,
  sheet: SHEET,
  slide: SLIDE,
  video: VIDEO,
  audio: AUDIO,
  ebook: EBOOK,
  data: DATA,
};

/** ext -> { ext, label, category, mime } — populated at the end of this module. */
export const FORMATS = {};

function labelFor(ext) {
  const named = {
    jpg: 'JPG', jpeg: 'JPEG', png: 'PNG', tif: 'TIFF', tiff: 'TIFF', webp: 'WebP', avif: 'AVIF',
    gif: 'GIF', bmp: 'BMP', ico: 'ICO', svg: 'SVG', heic: 'HEIC', heif: 'HEIF', psd: 'PSD',
    tga: 'TGA', pnm: 'PNM', ppm: 'PPM', pgm: 'PGM', pbm: 'PBM', dds: 'DDS', exr: 'EXR', hdr: 'HDR',
    pdf: 'PDF', docx: 'DOCX', doc: 'DOC', odt: 'ODT', rtf: 'RTF', txt: 'TXT', md: 'Markdown',
    markdown: 'Markdown', html: 'HTML', htm: 'HTML', tex: 'LaTeX', latex: 'LaTeX', rst: 'reST',
    org: 'Org', ipynb: 'Notebook', adoc: 'AsciiDoc', asciidoc: 'AsciiDoc', textile: 'Textile',
    mediawiki: 'MediaWiki', wiki: 'MediaWiki', opml: 'OPML', man: 'Man page', docbook: 'DocBook',
    xlsx: 'XLSX', xls: 'XLS', ods: 'ODS', csv: 'CSV', tsv: 'TSV',
    pptx: 'PPTX', odp: 'ODP', key: 'Keynote',
    mp4: 'MP4', mkv: 'MKV', webm: 'WebM', mov: 'MOV', avi: 'AVI', m4v: 'M4V', flv: 'FLV',
    wmv: 'WMV', mpg: 'MPG', mpeg: 'MPEG', ts: 'TS', ogv: 'OGV', '3gp': '3GP',
    mp3: 'MP3', wav: 'WAV', flac: 'FLAC', ogg: 'OGG', oga: 'OGA', opus: 'Opus', m4a: 'M4A',
    aac: 'AAC', wma: 'WMA', aiff: 'AIFF', aif: 'AIF', ac3: 'AC3', amr: 'AMR',
    epub: 'EPUB', mobi: 'MOBI', azw3: 'AZW3', fb2: 'FB2',
    json: 'JSON', yaml: 'YAML', yml: 'YML', xml: 'XML',
  };
  return named[ext] ?? ext.toUpperCase();
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
  gif: 'image/gif', tiff: 'image/tiff', tif: 'image/tiff', bmp: 'image/bmp', ico: 'image/x-icon',
  svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', psd: 'image/vnd.adobe.photoshop',
  tga: 'image/x-tga', pnm: 'image/x-portable-anymap', ppm: 'image/x-portable-pixmap',
  pgm: 'image/x-portable-graymap', pbm: 'image/x-portable-bitmap', dds: 'image/vnd-ms.dds',
  exr: 'image/x-exr', hdr: 'image/vnd.radiance',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
  html: 'text/html', htm: 'text/html', tex: 'application/x-latex', latex: 'application/x-latex',
  rst: 'text/x-rst', org: 'text/org', ipynb: 'application/x-ipynb+json',
  adoc: 'text/asciidoc', asciidoc: 'text/asciidoc', textile: 'text/textile',
  mediawiki: 'text/mediawiki', wiki: 'text/mediawiki', opml: 'text/x-opml',
  man: 'text/troff', docbook: 'application/docbook+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv', tsv: 'text/tab-separated-values',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/vnd.apple.keynote',
  mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', m4v: 'video/x-m4v', flv: 'video/x-flv', wmv: 'video/x-ms-wmv',
  mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', ogv: 'video/ogg', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', m4a: 'audio/mp4', aac: 'audio/aac', wma: 'audio/x-ms-wma',
  aiff: 'audio/aiff', aif: 'audio/aiff', ac3: 'audio/ac3', amr: 'audio/amr',
  epub: 'application/epub+zip', mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook', fb2: 'application/x-fictionbook+xml',
  json: 'application/json', yaml: 'application/yaml', yml: 'application/yaml', xml: 'application/xml',
};

/** Aliases that map onto a canonical implementation extension. */
export const ALIASES = {
  markdown: 'md',
  latex: 'tex',
  asciidoc: 'adoc',
  wiki: 'mediawiki',
  yml: 'yaml',
  aif: 'aiff',
  tif: 'tiff',
  jpeg: 'jpg',
  htm: 'html',
};

export const MAX_BYTES = Number(process.env.FORMA_MAX_BYTES ?? 200 * 1024 * 1024);

export function normaliseExt(raw) {
  if (!raw) return null;
  let ext = String(raw).trim().toLowerCase().replace(/^\./, '');
  if (!ext) return null;
  if (!FORMATS[ext] && ALIASES[ext]) ext = ALIASES[ext];
  return FORMATS[ext] ? ext : null;
}

export function extOf(filename) {
  const clean = String(filename ?? '').split(/[\\/]/).pop() ?? '';
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return null;
  return clean.slice(dot + 1).toLowerCase();
}

export function categoryOf(ext) {
  return FORMATS[ext]?.category ?? null;
}

export function mimeOf(ext) {
  return FORMATS[ext]?.mime ?? 'application/octet-stream';
}

// Built last so every table above is already initialised.
for (const [category, exts] of Object.entries(GROUPED)) {
  for (const ext of exts) {
    FORMATS[ext] = { ext, label: labelFor(ext), category, mime: MIME[ext] ?? 'application/octet-stream' };
  }
}
