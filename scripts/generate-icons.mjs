import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUILD_DIR = join(ROOT, 'build');
const ICONSET_DIR = join(BUILD_DIR, 'icon.iconset');

const rgba = (r, g, b, a = 255) => ({ r, g, b, a });

const COLORS = {
  transparent: rgba(0, 0, 0, 0),
  black: rgba(12, 13, 13, 255),
  white: rgba(246, 248, 246, 255),
  softWhite: rgba(246, 248, 246, 225),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function distRoundedRect(px, py, x, y, width, height, radius) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const qx = Math.abs(px - cx) - width / 2 + radius;
  const qy = Math.abs(py - cy) - height / 2 + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function distCircle(px, py, cx, cy, radius) {
  return Math.hypot(px - cx, py - cy) - radius;
}

function distEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
}

function distCapsule(px, py, x1, y1, x2, y2, radius) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const c = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (x1 + vx * c), py - (y1 + vy * c)) - radius;
}

function shapeAlpha(distance, feather = 2.2) {
  return 1 - smoothstep(-feather, feather, distance);
}

function overPixel(buffer, index, color, alpha) {
  const sourceAlpha = clamp((color.a / 255) * alpha, 0, 1);
  const destAlpha = buffer[index + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);

  if (outAlpha <= 0) {
    return;
  }

  buffer[index] = Math.round((color.r * sourceAlpha + buffer[index] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  buffer[index + 1] = Math.round((color.g * sourceAlpha + buffer[index + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  buffer[index + 2] = Math.round((color.b * sourceAlpha + buffer[index + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  buffer[index + 3] = Math.round(outAlpha * 255);
}

function drawIcon(size) {
  const buffer = new Uint8Array(size * size * 4);
  const scale = 1024 / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) * scale;
      const py = (y + 0.5) * scale;
      const index = (y * size + x) * 4;

      const bg = distRoundedRect(px, py, 104, 104, 816, 816, 190);
      overPixel(buffer, index, COLORS.black, shapeAlpha(bg, 3.5));

      const cloud = Math.min(
        distRoundedRect(px, py, 272, 392, 480, 160, 82),
        distCircle(px, py, 378, 386, 93),
        distCircle(px, py, 512, 330, 137),
        distCircle(px, py, 650, 397, 96),
      );
      overPixel(buffer, index, COLORS.white, shapeAlpha(cloud, 2.8));

      const underside = distRoundedRect(px, py, 306, 518, 406, 34, 17);
      overPixel(buffer, index, COLORS.white, shapeAlpha(underside, 2));

      const drops = [
        distCapsule(px, py, 373, 635, 348, 760, 23),
        distCapsule(px, py, 510, 626, 510, 782, 24),
        distCapsule(px, py, 648, 635, 674, 760, 23),
      ];

      for (const drop of drops) {
        overPixel(buffer, index, COLORS.softWhite, shapeAlpha(drop, 2.2));
      }

      const pinDrops = [
        distEllipse(px, py, 296, 645, 14, 22),
        distEllipse(px, py, 728, 645, 14, 22),
      ];

      for (const pinDrop of pinDrops) {
        overPixel(buffer, index, COLORS.softWhite, shapeAlpha(pinDrop, 2));
      }
    }
  }

  return buffer;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function pngFromRgba(width, height, rgbaBuffer) {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * stride;
    const targetStart = y * (stride + 1);
    scanlines[targetStart] = 0;
    Buffer.from(rgbaBuffer.subarray(sourceStart, sourceStart + stride)).copy(scanlines, targetStart + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function writePng(file, size) {
  const png = pngFromRgba(size, size, drawIcon(size));
  writeFileSync(file, png);
  return png;
}

function writeIco(file, entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;

  for (let index = 0; index < entries.length; index += 1) {
    const { size, png } = entries[index];
    const cursor = index * 16;
    directory[cursor] = size >= 256 ? 0 : size;
    directory[cursor + 1] = size >= 256 ? 0 : size;
    directory[cursor + 2] = 0;
    directory[cursor + 3] = 0;
    directory.writeUInt16LE(1, cursor + 4);
    directory.writeUInt16LE(32, cursor + 6);
    directory.writeUInt32LE(png.length, cursor + 8);
    directory.writeUInt32LE(offset, cursor + 12);
    offset += png.length;
  }

  writeFileSync(file, Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]));
}

function writeIcns(file, entries) {
  const chunks = entries.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const length = 8 + chunks.reduce((total, chunk) => total + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(length, 4);
  writeFileSync(file, Buffer.concat([header, ...chunks]));
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="104" y="104" width="816" height="816" rx="190" fill="#0c0d0d"/>
  <path fill="#f6f8f6" d="M376 293a137 137 0 0 1 255 47 96 96 0 0 1 118 94c0 65-52 118-116 118H354c-76 0-138-62-138-138 0-72 55-132 126-138 10 0 22 3 34 17z"/>
  <rect x="306" y="518" width="406" height="34" rx="17" fill="#f6f8f6"/>
  <g fill="#f6f8f6" opacity=".9" stroke="#f6f8f6" stroke-width="46" stroke-linecap="round">
    <path d="M373 635 348 760"/>
    <path d="M510 626v156"/>
    <path d="M648 635l26 125"/>
  </g>
  <ellipse cx="296" cy="645" rx="14" ry="22" fill="#f6f8f6" opacity=".88"/>
  <ellipse cx="728" cy="645" rx="14" ry="22" fill="#f6f8f6" opacity=".88"/>
</svg>
`;

mkdirSync(BUILD_DIR, { recursive: true });
rmSync(ICONSET_DIR, { force: true, recursive: true });
mkdirSync(ICONSET_DIR, { recursive: true });

writeFileSync(join(BUILD_DIR, 'icon.svg'), svg);
const sourcePng = join(BUILD_DIR, 'icon.png');
writePng(sourcePng, 1024);

const iconsetSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

const pngBySize = new Map([[1024, Buffer.from(pngFromRgba(1024, 1024, drawIcon(1024)))]]);

for (const [name, size] of iconsetSizes) {
  const png = pngBySize.get(size) ?? Buffer.from(pngFromRgba(size, size, drawIcon(size)));
  pngBySize.set(size, png);
  writeFileSync(join(ICONSET_DIR, name), png);
}

writeIco(join(BUILD_DIR, 'icon.ico'), [16, 32, 48, 256].map((size) => ({
  size,
  png: writePng(join(BUILD_DIR, `icon-${size}.png`), size),
})));

writeIcns(join(BUILD_DIR, 'icon.icns'), [
  { type: 'icp4', png: pngBySize.get(16) },
  { type: 'icp5', png: pngBySize.get(32) },
  { type: 'icp6', png: pngBySize.get(64) },
  { type: 'ic07', png: pngBySize.get(128) },
  { type: 'ic08', png: pngBySize.get(256) },
  { type: 'ic09', png: pngBySize.get(512) },
  { type: 'ic10', png: pngBySize.get(1024) },
]);

console.log('Generated build/icon.svg, build/icon.png, build/icon.icns, and build/icon.ico');
