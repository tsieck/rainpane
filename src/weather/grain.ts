import type { WeatherSettings } from './types';

let grainTile: HTMLCanvasElement | null = null;
const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function getGrainPattern(ctx: CanvasRenderingContext2D) {
  const cached = patterns.get(ctx);
  if (cached) return cached;
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = 256;
    grainTile.height = 256;
    const tileContext = grainTile.getContext('2d');
    if (!tileContext) return null;
    const pixels = tileContext.createImageData(256, 256);
    let seed = 731;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      // Sparse, irregular grain has no visible rows or diagonal interference.
      if (seed / 4294967296 > 0.012) continue;
      const light = (seed & 1) === 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = light ? 255 : 0;
      pixels.data[i + 3] = light ? 255 : 204;
    }
    tileContext.putImageData(pixels, 0, 0);
  }
  const pattern = ctx.createPattern(grainTile, 'repeat');
  if (pattern) patterns.set(ctx, pattern);
  return pattern;
}

export function drawGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  settings: WeatherSettings,
) {
  if (!settings.grainEnabled || settings.reducedMotion) return;
  const pattern = getGrainPattern(ctx);
  if (!pattern) return;
  const phase = Math.floor(elapsed / (settings.lowPowerMode ? 260 : 120)) % 4;
  const offsetX = phase * 37;
  const offsetY = phase * 61;
  ctx.save();
  ctx.globalAlpha = (settings.lowPowerMode ? 0.012 : 0.018) + settings.fogIntensity * 0.012;
  ctx.fillStyle = pattern;
  ctx.translate(offsetX, offsetY);
  // A single repeating texture replaces thousands of fillRect calls per frame.
  ctx.fillRect(-offsetX, -offsetY, width, height);
  ctx.restore();
}
