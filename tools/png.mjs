// Minimal PNG helpers: draw an RGB image, and read/write tEXt metadata chunks.
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  return out;
}

function* chunks(png) {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    yield { type, offset, end: offset + 12 + length, data: png.subarray(offset + 8, offset + 8 + length) };
    if (type === 'IEND') return;
    offset += 12 + length;
  }
}

// pixel(x, y) -> [r, g, b], each 0..255
export function createPng(width, height, pixel) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Inserts a tEXt chunk right after IHDR, where metadata tools expect it.
export function addTextChunk(png, keyword, text) {
  const [ihdr] = chunks(png);
  if (ihdr.type !== 'IHDR') throw new Error('PNG does not start with IHDR');
  const text_ = chunk('tEXt', Buffer.from(`${keyword}\0${text}`, 'latin1'));
  return Buffer.concat([png.subarray(0, ihdr.end), text_, png.subarray(ihdr.end)]);
}

export function readTextChunks(png) {
  const out = {};
  for (const { type, data } of chunks(png)) {
    if (type !== 'tEXt') continue;
    const nul = data.indexOf(0);
    out[data.toString('latin1', 0, nul)] = data.toString('latin1', nul + 1);
  }
  return out;
}
