import { run, which } from '../util.mjs';

const VIDEO_TARGETS = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', 'ogv', '3gp'];
const AUDIO_TARGETS = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'ac3', 'amr'];
const IMAGE_TARGETS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tga', 'gif', 'ico', 'pnm', 'ppm', 'pgm', 'pbm', 'dds', 'exr', 'hdr'];

const VIDEO_SOURCES = new Set(VIDEO_TARGETS);
const AUDIO_SOURCES = new Set(AUDIO_TARGETS);
const IMAGE_SOURCES = new Set(IMAGE_TARGETS);

export const VIDEO_CODECS = {
  mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
  m4v: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
  mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
  mkv: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k'],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '5', '-c:a', 'libopus', '-b:a', '128k'],
  avi: ['-c:v', 'mpeg4', '-qscale:v', '4', '-c:a', 'libmp3lame', '-b:a', '160k'],
  flv: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'],
  wmv: ['-c:v', 'wmv2', '-qscale:v', '4', '-c:a', 'wmav2', '-b:a', '160k'],
  mpg: ['-c:v', 'mpeg2video', '-qscale:v', '4', '-c:a', 'mp2', '-b:a', '192k'],
  mpeg: ['-c:v', 'mpeg2video', '-qscale:v', '4', '-c:a', 'mp2', '-b:a', '192k'],
  ts: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
  ogv: ['-c:v', 'libtheora', '-qscale:v', '6', '-c:a', 'libvorbis', '-qscale:a', '5'],
  '3gp': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-c:a', 'aac', '-b:a', '96k'],
};

export const AUDIO_CODECS = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-c:a', 'pcm_s16le'],
  flac: ['-c:a', 'flac'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  opus: ['-c:a', 'libopus', '-b:a', '128k'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  aac: ['-c:a', 'aac', '-b:a', '192k'],
  wma: ['-c:a', 'wmav2', '-b:a', '192k'],
  aiff: ['-c:a', 'pcm_s16be'],
  ac3: ['-c:a', 'ac3', '-b:a', '192k'],
  amr: ['-c:a', 'libopencore_amrnb', '-ar', '8000', '-ac', '1', '-b:a', '12.2k'],
};

const IMAGE_CODECS = {
  png: ['-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba'],
  jpg: ['-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '2', '-pix_fmt', 'yuvj420p'],
  jpeg: ['-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '2', '-pix_fmt', 'yuvj420p'],
  webp: ['-frames:v', '1', '-c:v', 'libwebp', '-lossless', '0', '-q:v', '82'],
  bmp: ['-frames:v', '1', '-c:v', 'bmp'],
  tiff: ['-frames:v', '1', '-c:v', 'tiff'],
  tga: ['-frames:v', '1', '-c:v', 'targa'],
  ico: ['-frames:v', '1', '-c:v', 'png', '-f', 'ico'],
  gif: ['-frames:v', '1'],
  pnm: ['-frames:v', '1'],
  ppm: ['-frames:v', '1'],
  pgm: ['-frames:v', '1'],
  pbm: ['-frames:v', '1'],
  dds: ['-frames:v', '1', '-c:v', 'dds'],
  exr: ['-frames:v', '1', '-c:v', 'exr'],
  hdr: ['-frames:v', '1', '-c:v', 'hdr'],
};

let cached = null;

export default {
  id: 'ffmpeg',
  name: 'FFmpeg',
  home: 'https://ffmpeg.org',
  blurb: 'video, audio and raster images',

  from: [...VIDEO_SOURCES, ...AUDIO_SOURCES, ...IMAGE_SOURCES, 'svg'],

  targets(fromExt) {
    if (VIDEO_SOURCES.has(fromExt)) return [...VIDEO_TARGETS, ...AUDIO_TARGETS, 'gif'];
    if (AUDIO_SOURCES.has(fromExt)) return [...AUDIO_TARGETS];
    if (IMAGE_SOURCES.has(fromExt) || fromExt === 'svg') return [...IMAGE_TARGETS];
    return [];
  },

  async probe() {
    if (cached) return cached;
    const bin = which('ffmpeg');
    if (!bin) return (cached = { ok: false, detail: 'ffmpeg not found on PATH' });
    const res = await run(bin, ['-version'], { timeout: 15_000 });
    if (!res.ok) return (cached = { ok: false, detail: 'ffmpeg failed to start' });
    const version = res.stdout.split('\n')[0]?.replace(/^ffmpeg version\s*/i, '').split(' ')[0] ?? '';
    return (cached = { ok: true, bin, version });
  },

  async run({ inputPath, outputPath, fromExt, toExt, opts }) {
    const bin = (await this.probe()).bin;
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath];

    if (toExt === 'gif' && VIDEO_SOURCES.has(fromExt)) {
      const fps = opts.fps ?? 12;
      const width = opts.width ?? 640;
      args.push(
        '-vf',
        `fps=${fps},scale=w='min(${width},iw)':h=-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer`,
        '-loop', '0',
      );
    } else if (VIDEO_CODECS[toExt]) {
      if (opts.maxWidth) {
        args.push('-vf', `scale='min(${opts.maxWidth},iw)':-2`);
      }
      args.push(...VIDEO_CODECS[toExt]);
      if (opts.maxWidth) args.push('-c:a', 'aac');
    } else if (AUDIO_CODECS[toExt]) {
      args.push('-vn', ...AUDIO_CODECS[toExt]);
    } else if (IMAGE_CODECS[toExt]) {
      args.push(...IMAGE_CODECS[toExt]);
    } else {
      throw new Error(`FFmpeg cannot write .${toExt}`);
    }

    args.push('-map_metadata', '-1', outputPath);
    const res = await run(bin, args, { timeout: 10 * 60_000 });
    if (!res.ok) {
      const raw = `${res.stderr || ''} ${res.message || ''}`;
      if (/does not contain any stream|matches no streams/i.test(raw)) {
        throw new Error(AUDIO_CODECS[toExt]
          ? 'That video has no audio track to extract.'
          : 'That file has no stream FFmpeg can write to this format.');
      }
      const detail = (res.stderr || res.message || '').trim().split('\n').slice(-3).join(' ');
      throw new Error(detail || 'FFmpeg could not convert this file');
    }
    return { engine: 'FFmpeg' };
  },
};
