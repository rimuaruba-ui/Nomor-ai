import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, isMaskable = false) {
  // Simple pure-node uncompressed/deflated raw RGBA PNG generator
  const buffer = Buffer.alloc(width * height * 4);

  // Colors
  // Background: #0f172a (15, 23, 42) -> #1e1b4b (30, 27, 75)
  // Indigo: #6366f1 (99, 102, 241)
  // Emerald: #10b981 (16, 185, 129)
  // White: #ffffff (255, 255, 255)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Normalized coordinates [0, 1]
      const nx = x / width;
      const ny = y / height;

      // Background gradient
      let r = Math.round(15 + ny * 20 + nx * 5);
      let g = Math.round(23 + ny * 10 + nx * 15);
      let b = Math.round(42 + ny * 45 + nx * 10);
      let a = 255;

      // Safe zone / bounding box for the 'N' logo
      const safeMargin = isMaskable ? 0.22 : 0.16;
      const xMin = width * safeMargin;
      const xMax = width * (1 - safeMargin);
      const yMin = height * safeMargin;
      const yMax = height * (1 - safeMargin);

      const colW = (xMax - xMin) * 0.22;
      const isLeftCol = x >= xMin && x <= xMin + colW && y >= yMin && y <= yMax;
      const isRightCol = x >= xMax - colW && x <= xMax && y >= yMin && y <= yMax;

      // Diagonal of 'N'
      const prog = (x - xMin) / (xMax - xMin);
      const diagY = yMin + prog * (yMax - yMin);
      const diagDist = Math.abs(y - diagY);
      const isDiag = x >= xMin && x <= xMax && y >= yMin && y <= yMax && diagDist < colW * 0.9;

      // Glow / border around 'N'
      if (isLeftCol || isRightCol || isDiag) {
        // Gradient from Indigo to Emerald across N
        const t = (nx + ny) / 2;
        r = Math.round(99 * (1 - t) + 16 * t);
        g = Math.round(102 * (1 - t) + 185 * t);
        b = Math.round(241 * (1 - t) + 129 * t);
      } else {
        // Subtle decorative grid border
        const borderMargin = isMaskable ? 0.12 : 0.08;
        const bxMin = width * borderMargin;
        const bxMax = width * (1 - borderMargin);
        const byMin = height * borderMargin;
        const byMax = height * (1 - borderMargin);
        const isBorder = (Math.abs(x - bxMin) < 2 || Math.abs(x - bxMax) < 2 || Math.abs(y - byMin) < 2 || Math.abs(y - byMax) < 2) &&
                         x >= bxMin && x <= bxMax && y >= byMin && y <= byMax;
        if (isBorder && ((x + y) % 16 < 8)) {
          r = 99; g = 102; b = 241;
        }
      }

      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  // Construct PNG with zlib
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // Filter: None
    buffer.copy(rawData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idat = createChunk('IDAT', deflated);

  // IEND Chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSig, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(calculateCRC(body), 0);

  return Buffer.concat([len, body, crc]);
}

function calculateCRC(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPNG(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPNG(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPNG(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPNG(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.png'), createPNG(64, 64, false));

console.log('PWA PNG Icons generated successfully in public/');
