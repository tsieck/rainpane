import { getGlassMist } from './glassMist';
import type { Rect, WeatherSettings } from './types';

export function drawFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  settings: WeatherSettings,
  tint: string,
  fogColor: string,
  shadowColor: string,
  clearMask: Rect | null,
) {
  if (!settings.fogEnabled || settings.fogIntensity <= 0) return;

  const strength = settings.fogIntensity;
  ctx.save();
  // Keep the color wash light: moisture supplies the visible structure.
  ctx.globalAlpha = strength * 0.13;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);

  const mist = getGlassMist(width, height, fogColor, ctx);
  if (mist) {
    const breath = settings.reducedMotion ? 1 : 0.97 + Math.sin(elapsed * 0.000035 * settings.animationSpeed) * 0.03;
    ctx.globalAlpha = strength * 0.86 * breath;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mist, 0, 0, width, height);
  }

  if (clearMask) {
    const x = clearMask.x + clearMask.width / 2;
    const y = clearMask.y + clearMask.height / 2;
    const near = Math.max(clearMask.width, clearMask.height) * 0.42;
    const far = Math.max(near + 1, Math.max(width, height) * 0.78);
    const shade = ctx.createRadialGradient(x, y, near, x, y, far);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, shadowColor);
    ctx.globalAlpha = strength * 0.14;
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}
