import type { RainSplash, WeatherSettings } from './types';

function splashChance(settings: WeatherSettings) {
  if (settings.reducedMotion || !settings.rainEnabled || settings.rainIntensity <= 0.05) {
    return 0;
  }

  const modeChance =
    settings.mode === 'storm-lock-in' ? 0.14 : settings.mode === 'night-drive' ? 0.1 : settings.mode === 'greyglass' ? 0.055 : 0.085;
  const powerScale = settings.renderBudget === 'conservative' ? 0.45 : settings.lowPowerMode ? 0.8 : 1;
  return modeChance * powerScale * (0.55 + settings.rainIntensity * 0.9);
}

export function maybeSpawnSplash(splashes: RainSplash[], x: number, y: number, settings: WeatherSettings) {
  const maxSplashes = settings.renderBudget === 'conservative' ? 14 : settings.lowPowerMode ? 30 : 56;
  if (splashes.length >= maxSplashes || Math.random() > splashChance(settings)) {
    return;
  }

  const screenHeight = Math.max(y, 1);
  const lowerBand = Math.min(150, screenHeight * 0.18);
  const isGlassHit = Math.random() < (settings.mode === 'storm-lock-in' ? 0.24 : 0.16);
  const splashY = isGlassHit
    ? screenHeight * (0.22 + Math.random() * 0.58)
    : screenHeight - 22 - Math.random() * lowerBand;
  const glassScale = isGlassHit ? 0.72 : 1;

  splashes.push({
    x,
    y: splashY,
    age: 0,
    lifetime: (0.42 + Math.random() * 0.34) * (isGlassHit ? 0.78 : 1),
    radius: (7 + Math.random() * (settings.mode === 'storm-lock-in' ? 22 : 15)) * glassScale,
    height: (2.2 + Math.random() * 4.4) * glassScale,
    opacity: (0.24 + Math.random() * 0.28) * (0.45 + settings.rainIntensity * 0.85) * (isGlassHit ? 0.62 : 1),
    seed: Math.random() * Math.PI * 2,
  });
}

export function drawSplashes(
  ctx: CanvasRenderingContext2D,
  splashes: RainSplash[],
  dt: number,
  settings: WeatherSettings,
  color: string,
) {
  if (!settings.rainEnabled || splashes.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  for (let index = splashes.length - 1; index >= 0; index -= 1) {
    const splash = splashes[index];
    splash.age += dt * settings.animationSpeed;

    const progress = splash.age / splash.lifetime;
    if (progress >= 1) {
      splashes.splice(index, 1);
      continue;
    }

    const eased = 1 - Math.pow(1 - progress, 2);
    const alpha = splash.opacity * Math.pow(1 - progress, 1.2);
    const radius = splash.radius * (0.55 + eased * 0.9);
    const height = splash.height * (1 - progress * 0.42);

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.lowPowerMode ? 1.1 : 1.35;

    ctx.beginPath();
    ctx.ellipse(splash.x, splash.y, radius, height, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.42;
    ctx.lineWidth = settings.lowPowerMode ? 0.7 : 0.9;
    ctx.beginPath();
    ctx.moveTo(splash.x - radius * 0.58, splash.y + height * 0.22);
    ctx.lineTo(splash.x + radius * 0.58, splash.y + height * 0.22);
    ctx.stroke();

    if (!settings.lowPowerMode && splash.radius > 7) {
      const leftX = splash.x - radius * (0.42 + Math.sin(splash.seed) * 0.08);
      const rightX = splash.x + radius * (0.48 + Math.cos(splash.seed) * 0.08);
      const fleckY = splash.y - 1 - eased * 5;
      ctx.globalAlpha = alpha * 0.72;
      ctx.beginPath();
      ctx.moveTo(leftX, fleckY);
      ctx.lineTo(leftX - 2.5, fleckY - 1.5);
      ctx.moveTo(rightX, fleckY + 0.5);
      ctx.lineTo(rightX + 2.8, fleckY - 1.2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
