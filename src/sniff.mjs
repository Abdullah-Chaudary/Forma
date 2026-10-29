/**
 * Best-effort content sniffing. Only used when a file arrives without a usable
 * extension — a declared extension always wins, because guessing wrong is worse
 * than trusting the user.
 */

const ascii = (buffer, start, end) => buffer.subarray(start, end).toString('latin1');

export function sniff(buffer) {
  if (!buffer || buffer.length < 8) return null;

  if (buffer[0] === 0x89 && ascii(buffer, 1, 4) === 'PNG') return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (ascii(buffer, 0, 3) === 'GIF') return 'gif';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'webp';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE') return 'wav';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'AVI ') return 'avi';
  if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a) return 'tiff';
  if (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[3] === 0x2a) return 'tiff';
  if (ascii(buffer, 0, 2) === 'BM') return 'bmp';
  if (ascii(buffer, 0, 5) === '%PDF-') return 'pdf';
  if (ascii(buffer, 0, 4) === 'fLaC') return 'flac';
  if (ascii(buffer, 0, 4) === 'OggS') return 'ogg';
  if (ascii(buffer, 0, 4) === 'RIFF') return 'wav';
  if (ascii(buffer, 0, 3) === 'ID3') return 'mp3';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
  if (ascii(buffer, 0, 4) === 'PK\u0003\u0004') return 'zip';
  if (ascii(buffer, 4, 8) === 'ftyp') {
    const brand = ascii(buffer, 8, 12);
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'avif';
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) return 'heic';
    if (brand.startsWith('qt')) return 'mov';
    if (brand.startsWith('M4A')) return 'm4a';
    return 'mp4';
  }
  if (ascii(buffer, 0, 4) === '\u001aE\u00df\u00a3') return 'mkv';
  if (ascii(buffer, 0, 4) === '8BPS') return 'psd';

  const head = ascii(buffer, 0, Math.min(buffer.length, 512)).trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    if (head.includes('<svg')) return 'svg';
    return 'xml';
  }
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (head.startsWith('%!ps')) return null;
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  return null;
}
