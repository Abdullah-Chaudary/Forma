import sharp from 'sharp';

const SOURCES = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'tif', 'svg', 'heic', 'heif']);
const TARGETS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'gif'];

let cached = null;

export default {
  id: 'sharp',
  name: 'libvips',
  home: 'https://sharp.pixelplumbing.com',
  blurb: 'high quality image resampling and encoding',

  from: [...SOURCES],

  targets(fromExt) {
    if (!SOURCES.has(fromExt)) return [];
    // Re-encoding an image to the format it already is still counts (e.g. a
    // large PNG to a smaller PNG), but never claim formats libvips lacks.
    return TARGETS.filter((t) => t !== fromExt);
  },

  async probe() {
    if (cached) return cached;
    try {
      const v = sharp.versions;
      return (cached = { ok: true, version: `vips ${v.vips}` });
    } catch (error) {
      return (cached = { ok: false, detail: error.message });
    }
  },

  async run({ inputPath, outputPath, fromExt, toExt, opts }) {
    const quality = clamp(opts.quality ?? 82, 30, 100);
    const input = sharp(inputPath, { density: fromExt === 'svg' ? 288 : 72, failOn: 'none' });
    const meta = await input.metadata();

    let pipeline = input;
    if (opts.maxWidth && meta.width && meta.width > opts.maxWidth) {
      pipeline = pipeline.resize({ width: opts.maxWidth, withoutEnlargement: true });
    }

    switch (toExt) {
      case 'jpg':
      case 'jpeg':
        pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: quality < 80 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality, effort: 4 });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality: Math.round(quality * 0.75), effort: 4 });
        break;
      case 'tiff':
        pipeline = pipeline.tiff({ compression: 'lzw' });
        break;
      case 'gif':
        pipeline = pipeline.gif({ effort: 7 });
        break;
      default:
        throw new Error(`libvips cannot write .${toExt}`);
    }

    await pipeline.toFile(outputPath);
    return { engine: 'libvips' };
  },
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
