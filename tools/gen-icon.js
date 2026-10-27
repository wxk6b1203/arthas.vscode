/**
 * 生成插件图标 media/icon.png（128x128，圆角渐变 + 字母 A）。
 * 纯 Node 实现 PNG 编码（IHDR/IDAT/IEND + CRC32），无第三方依赖。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 128;
const RADIUS = 28;

// 5x7 字母 A 点阵
const GLYPH = [
  [0, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
];

function inRoundedSquare(x, y) {
  if (x < RADIUS && y < RADIUS) {
    return (x - RADIUS) ** 2 + (y - RADIUS) ** 2 <= RADIUS ** 2;
  }
  if (x >= SIZE - RADIUS && y < RADIUS) {
    return (x - (SIZE - RADIUS - 1)) ** 2 + (y - RADIUS) ** 2 <= RADIUS ** 2;
  }
  if (x < RADIUS && y >= SIZE - RADIUS) {
    return (x - RADIUS) ** 2 + (y - (SIZE - RADIUS - 1)) ** 2 <= RADIUS ** 2;
  }
  if (x >= SIZE - RADIUS && y >= SIZE - RADIUS) {
    return (x - (SIZE - RADIUS - 1)) ** 2 + (y - (SIZE - RADIUS - 1)) ** 2 <= RADIUS ** 2;
  }
  return true;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function buildRgba() {
  const rows = [];
  const cell = 14; // 5*14=70, 7*14=98
  const ox = Math.floor((SIZE - 5 * cell) / 2);
  const oy = Math.floor((SIZE - 7 * cell) / 2);
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      const t = y / (SIZE - 1);
      const r = lerp(21, 66, t);
      const g = lerp(101, 165, t);
      const b = lerp(192, 245, t);
      let rr = r, gg = g, bb = b, aa = 255;
      if (!inRoundedSquare(x, y)) {
        aa = 0;
      }
      // 字母区域覆盖为白色
      const gx = Math.floor((x - ox) / cell);
      const gy = Math.floor((y - oy) / cell);
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && GLYPH[gy][gx] === 1 && aa === 255) {
        rr = 255; gg = 255; bb = 255;
      }
      const o = 1 + x * 4;
      row[o] = rr; row[o + 1] = gg; row[o + 2] = bb; row[o + 3] = aa;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rgba, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'media');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(buildRgba()));
console.log('icon.png generated:', fs.statSync(path.join(outDir, 'icon.png')).size, 'bytes');
