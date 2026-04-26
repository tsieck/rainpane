import type { ModePreset, WeatherSettings } from './types';

const BUILD_SECONDS = {
  'cozy-rain': 260,
  'storm-lock-in': 125,
  'night-drive': 190,
  greyglass: 210,
} satisfies Record<WeatherSettings['mode'], number>;

function hash(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

function frostProgress(elapsed: number, settings: WeatherSettings) {
  if (!settings.fogEnabled || !settings.fogAccumulationEnabled || settings.reducedMotion) {
    return 0;
  }

  const seconds = elapsed / 1000;
  const build = 1 - Math.exp(-seconds / BUILD_SECONDS[settings.mode]);
  const modeBoost = settings.mode === 'storm-lock-in' ? 1.18 : settings.mode === 'greyglass' ? 1.05 : 1;
  return Math.min(1, build * settings.fogIntensity * modeBoost);
}

function drawCornerBloom(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number, preset: ModePreset) {
  const cornerRadius = Math.min(Math.max(width, height) * 0.42, 520);
  const cornerAlpha = strength * 0.2;
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];

  for (const [x, y] of corners) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, cornerRadius);
    gradient.addColorStop(0, preset.palette.fog);
    gradient.addColorStop(0.52, preset.palette.tint);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = cornerAlpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, cornerRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEdgeFrost(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number, preset: ModePreset) {
  const edgeDepth = Math.min(Math.max(width, height) * 0.12, 170);
  const alpha = strength * 0.16;

  const top = ctx.createLinearGradient(0, 0, 0, edgeDepth);
  top.addColorStop(0, preset.palette.fog);
  top.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, edgeDepth);

  const bottom = ctx.createLinearGradient(0, height, 0, height - edgeDepth);
  bottom.addColorStop(0, preset.palette.fog);
  bottom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, height - edgeDepth, width, edgeDepth);

  const left = ctx.createLinearGradient(0, 0, edgeDepth, 0);
  left.addColorStop(0, preset.palette.fog);
  left.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, edgeDepth, height);

  const right = ctx.createLinearGradient(width, 0, width - edgeDepth, 0);
  right.addColorStop(0, preset.palette.fog);
  right.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = right;
  ctx.fillRect(width - edgeDepth, 0, edgeDepth, height);
}

function drawFrostCrystals(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  strength: number,
  settings: WeatherSettings,
) {
  const count = settings.lowPowerMode ? 86 : 155;
  const edgeDepth = Math.min(Math.max(width, height) * 0.18, 240);
  const timePhase = Math.floor(elapsed / 9000);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let index = 0; index < count; index += 1) {
    const sideRoll = hash(index * 9.17 + 4);
    const along = hash(index * 13.31 + 9);
    const inward = Math.pow(hash(index * 17.73 + 2), 2.6) * edgeDepth;
    const jitter = hash(index * 5.91 + timePhase) * 0.04;

    let x = 0;
    let y = 0;
    if (sideRoll < 0.25) {
      x = along * width;
      y = inward;
    } else if (sideRoll < 0.5) {
      x = width - inward;
      y = along * height;
    } else if (sideRoll < 0.75) {
      x = along * width;
      y = height - inward;
    } else {
      x = inward;
      y = along * height;
    }

    const edgeWeight = Math.max(0, 1 - Math.min(x, y, width - x, height - y) / edgeDepth);
    const alpha = strength * edgeWeight * (0.05 + hash(index * 3.7) * 0.1);
    if (alpha < 0.006) {
      continue;
    }

    const length = (5 + hash(index * 2.33) * 18) * (0.7 + strength);
    const angle = hash(index * 7.47) * Math.PI * 2 + jitter;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(235, 244, 240, 0.92)';
    ctx.lineWidth = 0.45 + hash(index * 11.2) * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * length * 0.5, y - Math.sin(angle) * length * 0.5);
    ctx.lineTo(x + Math.cos(angle) * length * 0.5, y + Math.sin(angle) * length * 0.5);

    if (!settings.lowPowerMode && hash(index * 19.9) > 0.68) {
      const branchAngle = angle + (hash(index * 23.1) > 0.5 ? 1 : -1) * 0.8;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(branchAngle) * length * 0.35, y + Math.sin(branchAngle) * length * 0.35);
    }
    ctx.stroke();
  }
}

export function drawFrostedGlass(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  settings: WeatherSettings,
  preset: ModePreset,
) {
  const progress = frostProgress(elapsed, settings);
  if (progress <= 0.01) {
    return;
  }

  const strength = Math.min(0.72, progress);

  ctx.save();
  drawCornerBloom(ctx, width, height, strength, preset);
  drawEdgeFrost(ctx, width, height, strength, preset);
  drawFrostCrystals(ctx, width, height, elapsed, strength, settings);
  ctx.restore();
}
