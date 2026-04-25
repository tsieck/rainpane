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
  if (!settings.fogEnabled || settings.fogIntensity <= 0) {
    return;
  }

  const fogStrength = settings.fogIntensity;
  ctx.save();
  ctx.globalAlpha = 0.1 + fogStrength * 0.28;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);

  if (clearMask) {
    const centerX = clearMask.x + clearMask.width / 2;
    const centerY = clearMask.y + clearMask.height / 2;
    const near = Math.max(clearMask.width, clearMask.height) * 0.42;
    const far = Math.max(width, height) * 0.78;
    const focusGradient = ctx.createRadialGradient(centerX, centerY, near, centerX, centerY, far);
    focusGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    focusGradient.addColorStop(0.56, shadowColor);
    focusGradient.addColorStop(1, shadowColor);
    ctx.globalAlpha = fogStrength * 0.28;
    ctx.fillStyle = focusGradient;
    ctx.fillRect(0, 0, width, height);
  }

  const drift = elapsed * 0.012 * settings.animationSpeed;
  const layerCount = settings.reducedMotion ? 4 : 8;
  for (let i = 0; i < layerCount; i += 1) {
    const x = ((i * 223 + drift * (18 + i * 3)) % (width + 420)) - 210;
    const y = ((i * 97 + Math.sin(drift * 0.08 + i) * 70) % (height + 260)) - 130;
    const radius = 160 + i * 34;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, fogColor);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = fogStrength * (0.06 + i * 0.009);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.6, radius * 0.52, Math.sin(i) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
