// Stationary moisture on glass: broad islands with finer mottling, sampled
// once into a bounded texture. The field is shared with fog accumulation.
function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
  const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

export function sampleGlassMoisture(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const warp = noise(x / 430 + 9.2, y / 510 - 3.7);
  const broad = noise(x / 290 + warp * 1.7, y / 390 + warp * 0.8);
  const medium = noise(x / 96 - 4.8, y / 150 + 11.2);
  const fine = noise(x / 27 + 18.4, y / 42 - 5.6);
  const value = broad * 0.64 + medium * 0.25 + fine * 0.11;
  return Math.max(0.035, Math.min(1, (value - 0.22) * 1.65));
}

const mistCache = new Map<string, HTMLCanvasElement>();
const tintedMist = new WeakMap<CanvasRenderingContext2D, { canvas: HTMLCanvasElement; key: string }>();

function getMoistureTexture(width: number, height: number) {
  if (typeof document === 'undefined' || width <= 0 || height <= 0) return null;
  const key = `${Math.round(width)}:${Math.round(height)}`;
  const cached = mistCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 512 / width, 512 / height);
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const px = x / canvas.width * width;
      const py = y / canvas.height * height;
      const edge = Math.pow(Math.abs(py / height - 0.5) * 2, 3) * 0.15;
      const density = Math.min(1, sampleGlassMoisture(px, py) + edge);
      const offset = (y * canvas.width + x) * 4;
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 255;
      pixels.data[offset + 3] = density * 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (mistCache.size >= 6) mistCache.delete(mistCache.keys().next().value!);
  mistCache.set(key, canvas);
  return canvas;
}

/** One tint surface per renderer: palette transitions never regenerate noise or allocate per frame. */
export function getGlassMist(width: number, height: number, color: string, owner: CanvasRenderingContext2D) {
  const texture = getMoistureTexture(width, height);
  if (!texture) return null;
  let cached = tintedMist.get(owner);
  if (!cached) {
    cached = { canvas: document.createElement('canvas'), key: '' };
    tintedMist.set(owner, cached);
  }
  const key = `${Math.round(width)}:${Math.round(height)}:${color}`;
  if (cached.key === key) return cached.canvas;
  const canvas = cached.canvas;
  if (canvas.width !== texture.width || canvas.height !== texture.height) {
    canvas.width = texture.width;
    canvas.height = texture.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(texture, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cached.key = key;
  return canvas;
}
