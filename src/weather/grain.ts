import type { WeatherSettings } from './types';

export function drawGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  settings: WeatherSettings,
) {
  if (!settings.grainEnabled || settings.reducedMotion) {
    return;
  }

  const spacing = settings.lowPowerMode ? 8 : 5;
  const phase = Math.floor(elapsed / (settings.lowPowerMode ? 260 : 120)) % 4;
  const alpha = (settings.lowPowerMode ? 0.012 : 0.018) + settings.fogIntensity * 0.012;

  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  for (let y = phase; y < height; y += spacing) {
    for (let x = (y + phase * 3) % spacing; x < width; x += spacing * 2) {
      if (((x * 17 + y * 31 + phase * 11) % 7) < 3) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
  for (let y = spacing - phase; y < height; y += spacing + 1) {
    for (let x = (y * 2 + phase) % spacing; x < width; x += spacing * 3) {
      if (((x * 13 + y * 19 + phase * 5) % 9) < 2) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.restore();
}
