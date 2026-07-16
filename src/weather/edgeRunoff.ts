import { drawOpticalDroplet, getDropletOpticalVariant } from './dropletOptics';
import type { EdgeRunoffDrop, Rect, WeatherSettings } from './types';

interface EdgeRunoffGeometry {
  x: number;
  y: number;
  alpha: number;
  trailLength: number;
  lateralBend: number;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function makeDrop(settings: WeatherSettings): EdgeRunoffDrop {
  const roll = Math.random();
  return {
    side: roll < 0.47 ? 'left' : roll < 0.94 ? 'right' : 'top',
    t: Math.random(),
    offset: 8 + Math.random() * (settings.mode === 'storm-lock-in' ? 18 : 14),
    age: Math.random() * 4,
    lifetime: 12 + Math.random() * (settings.mode === 'greyglass' ? 22 : 16),
    speed: 6 + Math.random() * (settings.mode === 'storm-lock-in' ? 20 : 13),
    radius: 2.2 + Math.random() * (settings.mode === 'greyglass' ? 3.6 : 5.2),
    opacity: 0.12 + Math.random() * (settings.mode === 'night-drive' ? 0.2 : 0.14),
    trail: 10 + Math.random() * 24,
    seed: Math.random() * Math.PI * 2,
  };
}

export function syncEdgeRunoff(drops: EdgeRunoffDrop[], activeMask: Rect | null, settings: WeatherSettings) {
  const enabled = Boolean(activeMask) && settings.dropletsEnabled && !settings.coverFullScreen && !settings.reducedMotion;
  const quietScale = settings.mode === 'storm-lock-in' ? 0.78 : settings.mode === 'night-drive' ? 0.66 : 0.48;
  const target = enabled
    ? Math.min(
        settings.renderBudget === 'conservative' ? 3 : settings.lowPowerMode ? 5 : 8,
        Math.floor(
          ((activeMask?.width ?? 0) + (activeMask?.height ?? 0)) *
            settings.dropletDensity *
            quietScale *
            (settings.lowPowerMode || settings.renderBudget === 'conservative' ? 0.007 : 0.011),
        ),
      )
    : 0;

  while (drops.length < target) {
    drops.push(makeDrop(settings));
  }
  if (drops.length > target) {
    drops.length = target;
  }
}

export function updateEdgeRunoff(
  drops: EdgeRunoffDrop[],
  activeMask: Rect | null,
  dt: number,
  settings: WeatherSettings,
) {
  if (!activeMask || drops.length === 0 || !settings.dropletsEnabled || settings.coverFullScreen) {
    return;
  }

  for (let index = drops.length - 1; index >= 0; index -= 1) {
    const drop = drops[index];
    drop.age += dt * settings.animationSpeed;

    if (drop.age > drop.lifetime) {
      drops[index] = makeDrop(settings);
      continue;
    }

    if (drop.side === 'top') {
      drop.t += (drop.speed * 0.24 * dt * settings.animationSpeed) / Math.max(1, activeMask.width);
    } else {
      drop.t += (drop.speed * dt * settings.animationSpeed) / Math.max(1, activeMask.height);
    }

    if (drop.t > 1.08) {
      drops[index] = makeDrop(settings);
      continue;
    }
  }
}

function getEdgeRunoffGeometry(
  drop: EdgeRunoffDrop,
  activeMask: Rect,
  settings: WeatherSettings,
): EdgeRunoffGeometry {
  const progress = clamp(drop.age / drop.lifetime);
  const fadeIn = Math.min(1, drop.age / 1.4);
  const fadeOut = Math.max(0, 1 - progress);
  const modeAlpha = settings.mode === 'storm-lock-in' ? 0.82 : settings.mode === 'night-drive' ? 0.66 : 0.48;
  const wobble = Math.sin(drop.age * 1.7 + drop.seed) * 1.8;
  const x =
    drop.side === 'left'
      ? activeMask.x - drop.offset + wobble
      : drop.side === 'right'
        ? activeMask.x + activeMask.width + drop.offset + wobble
        : activeMask.x + activeMask.width * drop.t;
  const y =
    drop.side === 'top'
      ? activeMask.y - drop.offset + Math.sin(drop.age + drop.seed) * 1.5
      : activeMask.y + activeMask.height * drop.t;

  return {
    x,
    y,
    alpha: drop.opacity * settings.dropletDensity * fadeIn * fadeOut * modeAlpha,
    trailLength: drop.side === 'top' ? drop.trail * 0.42 : drop.trail * (0.5 + progress * 0.36),
    lateralBend: Math.sin(drop.seed * 1.9 + drop.age * 0.34) * Math.min(3.5, drop.radius * 0.45),
  };
}

export function carveEdgeRunoff(
  ctx: CanvasRenderingContext2D,
  drops: readonly EdgeRunoffDrop[],
  activeMask: Rect | null,
  settings: WeatherSettings,
) {
  if (!activeMask || drops.length === 0 || !settings.dropletsEnabled || settings.coverFullScreen) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = '#000';
  for (const drop of drops) {
    const geometry = getEdgeRunoffGeometry(drop, activeMask, settings);
    ctx.globalAlpha = clamp(geometry.alpha * 1.85, 0, 0.42);
    ctx.lineWidth = Math.max(1.5, drop.radius * 0.72);
    ctx.beginPath();
    if (drop.side === 'top') {
      ctx.moveTo(geometry.x - geometry.trailLength, geometry.y);
      ctx.quadraticCurveTo(
        geometry.x - geometry.trailLength * 0.48,
        geometry.y + geometry.lateralBend,
        geometry.x - drop.radius * 0.52,
        geometry.y,
      );
    } else {
      ctx.moveTo(geometry.x, geometry.y - geometry.trailLength);
      ctx.quadraticCurveTo(
        geometry.x + geometry.lateralBend,
        geometry.y - geometry.trailLength * 0.46,
        geometry.x,
        geometry.y - drop.radius * 0.58,
      );
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawEdgeRunoff(
  ctx: CanvasRenderingContext2D,
  drops: readonly EdgeRunoffDrop[],
  activeMask: Rect | null,
  settings: WeatherSettings,
) {
  if (!activeMask || drops.length === 0 || !settings.dropletsEnabled || settings.coverFullScreen) {
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let index = 0; index < drops.length; index += 1) {
    const drop = drops[index];
    const geometry = getEdgeRunoffGeometry(drop, activeMask, settings);
    const opticalAlpha = clamp(geometry.alpha * 3.7, 0, 0.88);
    const variant = getDropletOpticalVariant(drop.seed, index + 101);

    if (drop.side === 'top') {
      ctx.save();
      ctx.translate(geometry.x, geometry.y);
      ctx.rotate(-Math.PI / 2);
      drawOpticalDroplet(ctx, 'pane', variant, 0, 0, drop.radius * 0.82, drop.radius * 1.04, opticalAlpha);
      ctx.restore();
    } else {
      drawOpticalDroplet(
        ctx,
        'pane',
        variant,
        geometry.x,
        geometry.y,
        drop.radius * 0.82,
        drop.radius * 1.04,
        opticalAlpha,
      );
    }
  }

  ctx.restore();
}
