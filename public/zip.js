/**
 * Minimal ZIP writer (store only, no compression).
 *
 * Converted files are already compressed in almost every case, so storing them
 * costs nothing and keeps the browser bundle dependency-free. Names are flagged
 * as UTF-8 so non-ASCII filenames survive the round trip.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
}

/**
 * @param {{name: string, data: Uint8Array}[]} entries
 * @returns {Uint8Array} a complete .zip archive
 */
export function createZipBytes(entries, now = new Date()) {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(now);

  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    return { name, data, crc: crc32(data) };
  });

  const LOCAL = 30;
  const CENTRAL = 46;
  const END = 22;

  let size = END;
  for (const entry of prepared) size += LOCAL + entry.name.length + entry.data.length + CENTRAL + entry.name.length;

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const u16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const u32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  const raw = (array) => { bytes.set(array, offset); offset += array.length; };

  const central = [];

  for (const entry of prepared) {
    const start = offset;
    u32(0x04034b50);
    u16(20);
    u16(0x0800); // UTF-8 filename
    u16(0); // stored
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0);
    raw(entry.name);
    raw(entry.data);
    central.push({ entry, offset: start });
  }

  const centralStart = offset;
  for (const { entry, offset: localOffset } of central) {
    u32(0x02014b50);
    u16(20); // made by
    u16(20); // needed
    u16(0x0800);
    u16(0);
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(localOffset);
    raw(entry.name);
  }
  const centralSize = offset - centralStart;

  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(central.length);
  u16(central.length);
  u32(centralSize);
  u32(centralStart);
  u16(0);

  return bytes;
}

/** Browser wrapper: same bytes, packaged as a Blob for download. */
export function createZip(entries, now = new Date()) {
  return new Blob([createZipBytes(entries, now)], { type: 'application/zip' });
}
