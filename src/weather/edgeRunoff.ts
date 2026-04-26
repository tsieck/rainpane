import type { EdgeRunoffDrop, Rect, WeatherSettings } from './types';

function makeDrop(settings: WeatherSettings): EdgeRunoffDrop {
  const roll = Math.random();
  return {
    side: roll < 0.42 ? 'left' : roll < 0.84 ? 'right' : 'top',
    t: Math.random(),
    offset: 4 + Math.random() * (settings.mode === 'storm-lock-in' ? 15 : 11),
    age: Math.random() * 4,
    lifetime: 6 + Math.random() * (settings.mode === 'greyglass' ? 18 : 11),
    speed: 8 + Math.random() * (settings.mode === 'storm-lock-in' ? 26 : 16),
    radius: 1.6 + Math.random() * (settings.mode === 'greyglass' ? 3.4 : 4.8),
    opacity: 0.1 + Math.random() * (settings.mode === 'night-drive' ? 0.22 : 0.16),
    trail: 8 + Math.random() * 28,
    seed: Math.random() * Math.PI * 2,
  };
}

export function syncEdgeRunoff(drops: EdgeRunoffDrop[], activeMask: Rect | null, settings: WeatherSettings) {
  const enabled = Boolean(activeMask) && settings.dropletsEnabled && !settings.coverFullScreen && !settings.reducedMotion;
  const target = enabled
    ? Math.min(
        settings.lowPowerMode ? 14 : 26,
        Math.floor(((activeMask?.width ?? 0) + (activeMask?.height ?? 0)) * settings.dropletDensity * (settings.lowPowerMode ? 0.018 : 0.028)),
      )
    : 0;

  while (drops.length < target) {
    drops.push(makeDrop(settings));
  }
  if (drops.length > target) {
    drops.length = target;
  }
}

export function drawEdgeRunoff(
  ctx: CanvasRenderingContext2D,
  drops: EdgeRunoffDrop[],
  activeMask: Rect | null,
  dt: number,
  settings: WeatherSettings,
  color: string,
) {
  if (!activeMask || drops.length === 0 || !settings.dropletsEnabled || settings.coverFullScreen) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';

  for (let index = drops.length - 1; index >= 0; index -= 1) {
    const drop = drops[index];
    drop.age += dt * settings.animationSpeed;

    if (drop.age > drop.lifetime) {
      drops[index] = makeDrop(settings);
      continue;
    }

    const progress = drop.age / drop.lifetime;
    const fadeIn = Math.min(1, drop.age / 1.4);
    const fadeOut = Math.max(0, 1 - progress);
    const alpha = drop.opacity * settings.dropletDensity * fadeIn * fadeOut;

    if (drop.side === 'top') {
      drop.t += (drop.speed * 0.24 * dt * settings.animationSpeed) / Math.max(1, activeMask.width);
    } else {
      drop.t += (drop.speed * dt * settings.animationSpeed) / Math.max(1, activeMask.height);
    }

    if (drop.t > 1.08) {
      drops[index] = makeDrop(settings);
      continue;
    }

    const wobble = Math.sin(drop.age * 1.7 + drop.seed) * 1.8;
    const x =
      drop.side === 'left'
        ? activeMask.x - drop.offset + wobble
        : drop.side === 'right'
          ? activeMask.x + activeMask.width + drop.offset + wobble
          : activeMask.x + activeMask.width * drop.t;
    const y = drop.side === 'top' ? activeMask.y - drop.offset + Math.sin(drop.age + drop.seed) * 1.5 : activeMask.y + activeMask.height * drop.t;

    const trailLength = drop.side === 'top' ? drop.trail * 0.35 : drop.trail * (0.45 + progress * 0.55);
    const gradient =
      drop.side === 'top'
        ? ctx.createLinearGradient(x - trailLength, y, x, y)
        : ctx.createLinearGradient(x, y - trailLength, x, y + drop.radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.7, color);
    gradient.addColorStop(1, color);

    ctx.globalAlpha = alpha * 0.62;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(0.55, drop.radius * 0.36);
    ctx.beginPath();
    if (drop.side === 'top') {
      ctx.moveTo(x - trailLength, y);
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y - trailLength);
      ctx.lineTo(x, y + drop.radius);
    }
    ctx.stroke();

    const beadGradient = ctx.createRadialGradient(x - drop.radius * 0.35, y - drop.radius * 0.35, 0, x, y, drop.radius * 1.6);
    beadGradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 1.25})`);
    beadGradient.addColorStop(0.45, `rgba(196, 225, 226, ${alpha * 0.5})`);
    beadGradient.addColorStop(1, `rgba(12, 22, 24, ${alpha * 0.18})`);

    ctx.globalAlpha = 1;
    ctx.fillStyle = beadGradient;
    ctx.beginPath();
    ctx.ellipse(x, y, drop.radius * 0.72, drop.radius * 1.15, -0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
