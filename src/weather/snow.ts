import type { Rect, SnowFlake, WeatherSettings } from './types';

function chooseLayer(): SnowFlake['layer'] {
  const roll = Math.random();
  if (roll < 0.5) {
    return 'far';
  }
  if (roll < 0.88) {
    return 'mid';
  }
  return 'near';
}

function makeFlake(width: number, height: number): SnowFlake {
  const layer = chooseLayer();
  const layerScale = layer === 'far' ? 0.62 : layer === 'near' ? 1.42 : 1;
  const shape = layer === 'near' && Math.random() > 0.72 ? 'crystal' : 'speck';
  const rareNearScale = shape === 'crystal' ? 1.28 + Math.random() * 0.55 : 1;

  return {
    layer,
    shape,
    x: Math.random() * width,
    y: Math.random() * height,
    radius: (0.65 + Math.random() * 1.8) * layerScale * rareNearScale,
    speed: (shape === 'crystal' ? 11 + Math.random() * 28 : 18 + Math.random() * 54) * layerScale,
    drift: (-12 + Math.random() * 24) * layerScale,
    opacity: (shape === 'crystal' ? 0.12 + Math.random() * 0.18 : 0.08 + Math.random() * 0.24) * (layer === 'far' ? 0.62 : layer === 'near' ? 1.12 : 1),
    wobble: 0.35 + Math.random() * 1.2,
    seed: Math.random() * Math.PI * 2,
  };
}

function drawCrystalFlake(ctx: CanvasRenderingContext2D, flake: SnowFlake, alpha: number, color: string) {
  const arms = 6;
  const radius = flake.radius * 2.4;
  const rotation = flake.seed + flake.y * 0.006;

  ctx.globalAlpha = alpha * 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.36, flake.radius * 0.18);
  ctx.beginPath();
  for (let arm = 0; arm < arms; arm += 1) {
    const angle = rotation + (arm * Math.PI * 2) / arms;
    const inner = radius * 0.18;
    const outer = radius * (0.74 + Math.sin(flake.seed + arm) * 0.08);
    ctx.moveTo(flake.x + Math.cos(angle) * inner, flake.y + Math.sin(angle) * inner);
    ctx.lineTo(flake.x + Math.cos(angle) * outer, flake.y + Math.sin(angle) * outer);
  }
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.58;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(flake.x, flake.y, flake.radius * 0.72, flake.radius * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function syncSnowFlakes(flakes: SnowFlake[], width: number, height: number, settings: WeatherSettings) {
  const enabled = settings.mode === 'winterglass' && settings.rainEnabled;
  const powerScale = settings.renderBudget === 'conservative' ? 0.42 : settings.lowPowerMode ? 0.62 : 1;
  const target = enabled ? Math.floor((width * height * Math.max(0.2, settings.fogIntensity) * powerScale) / 12500) : 0;
  const cappedTarget = Math.min(target, settings.reducedMotion ? 44 : settings.renderBudget === 'conservative' ? 76 : settings.lowPowerMode ? 118 : 190);

  while (flakes.length < cappedTarget) {
    flakes.push(makeFlake(width, height));
  }
  if (flakes.length > cappedTarget) {
    flakes.length = cappedTarget;
  }
}

export function drawSnow(
  ctx: CanvasRenderingContext2D,
  flakes: SnowFlake[],
  width: number,
  height: number,
  dt: number,
  settings: WeatherSettings,
  color: string,
  clearMask: Rect | null,
) {
  if (settings.mode !== 'winterglass' || !settings.rainEnabled || flakes.length === 0) {
    return;
  }

  const wind = Math.sin((settings.windAngle * Math.PI) / 180) * 34;
  const speedScale = settings.reducedMotion ? 0.28 : 1;

  ctx.save();
  for (const flake of flakes) {
    const layerSpeed = flake.layer === 'far' ? 0.62 : flake.layer === 'near' ? 1.12 : 0.86;
    flake.y += flake.speed * layerSpeed * settings.animationSpeed * speedScale * dt;
    flake.x += (wind + flake.drift + Math.sin(flake.y * 0.012 + flake.seed) * flake.wobble * 18) * settings.animationSpeed * dt;

    if (flake.y > height + 12 || flake.x < -24 || flake.x > width + 24) {
      flake.x = Math.random() * width;
      flake.y = -8 - Math.random() * height * 0.15;
    }

    if (clearMask && flake.x > clearMask.x && flake.x < clearMask.x + clearMask.width && flake.y > clearMask.y && flake.y < clearMask.y + clearMask.height) {
      continue;
    }

    const alpha = flake.opacity * (0.52 + settings.fogIntensity * 0.3) * (flake.layer === 'near' ? 1.08 : flake.layer === 'far' ? 0.62 : 0.82);
    if (flake.shape === 'crystal' && !settings.lowPowerMode && !settings.reducedMotion) {
      drawCrystalFlake(ctx, flake, alpha, color);
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(flake.x, flake.y, flake.radius * 0.82, flake.radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!settings.lowPowerMode && flake.layer === 'near') {
      ctx.globalAlpha = alpha * 0.22;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.4, flake.radius * 0.34);
      ctx.beginPath();
      ctx.moveTo(flake.x - flake.radius * 1.4, flake.y);
      ctx.lineTo(flake.x + flake.radius * 1.4, flake.y);
      ctx.moveTo(flake.x, flake.y - flake.radius * 1.4);
      ctx.lineTo(flake.x, flake.y + flake.radius * 1.4);
      ctx.stroke();
    }
  }
  ctx.restore();
}
