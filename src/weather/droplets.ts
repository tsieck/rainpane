import { pointInRect } from './masks';
import type { Droplet, Rect, WeatherSettings } from './types';

type DropletKind = Droplet['kind'];

function chooseKind(settings: WeatherSettings): DropletKind {
  const roll = Math.random();
  const paneChance = settings.mode === 'storm-lock-in' ? 0.025 : settings.mode === 'greyglass' ? 0.012 : 0.018;
  const microChance = settings.mode === 'night-drive' ? 0.6 : 0.52;

  if (roll < paneChance) {
    return 'pane';
  }

  if (roll < paneChance + microChance) {
    return 'micro';
  }

  return 'bead';
}

function makeDroplet(width: number, height: number, clearMask: Rect | null, settings: WeatherSettings): Droplet {
  let x = Math.random() * width;
  let y = Math.random() * height;
  let attempts = 0;

  while (clearMask && pointInRect(x, y, clearMask, 18) && attempts < 20) {
    x = Math.random() * width;
    y = Math.random() * height;
    attempts += 1;
  }

  const kind = chooseKind(settings);
  const radius =
    kind === 'micro'
      ? 0.8 + Math.random() * 2.2
      : kind === 'pane'
        ? 6 + Math.random() * 8
        : 2.4 + Math.random() * 7.4;
  const stretch = kind === 'pane' ? 1.18 + Math.random() * 0.9 : kind === 'micro' ? 0.8 + Math.random() * 0.65 : 1.1 + Math.random() * 1.6;

  return {
    kind,
    x,
    y,
    radiusX: radius * (kind === 'pane' ? 0.72 + Math.random() * 0.34 : 0.72 + Math.random() * 0.72),
    radiusY: radius * stretch,
    opacity: kind === 'micro' ? 0.06 + Math.random() * 0.12 : kind === 'pane' ? 0.08 + Math.random() * 0.08 : 0.1 + Math.random() * 0.22,
    age: 0,
    lifetime: kind === 'pane' ? 22 + Math.random() * 28 : kind === 'micro' ? 8 + Math.random() * 18 : 10 + Math.random() * 22,
    slideSpeed:
      kind === 'pane'
        ? 3 + Math.random() * 12
        : kind === 'micro'
          ? Math.random() * 2
          : Math.random() > 0.68
            ? 6 + Math.random() * 28
            : Math.random() * 1.5,
    driftX: kind === 'pane' ? -0.7 + Math.random() * 1.4 : -1.5 + Math.random() * 3,
    wobble: kind === 'pane' ? 0.1 + Math.random() * 0.35 : 0.2 + Math.random() * 0.9,
    seed: Math.random() * Math.PI * 2,
    refraction: kind === 'pane' ? 0.5 + Math.random() * 0.28 : 0.45 + Math.random() * 0.45,
    highlight: kind === 'micro' ? 0.65 + Math.random() * 0.45 : 0.85 + Math.random() * 0.75,
  };
}

export function syncDroplets(droplets: Droplet[], width: number, height: number, settings: WeatherSettings, clearMask: Rect | null) {
  const densityBoost = settings.mode === 'night-drive' ? 1.36 : settings.mode === 'greyglass' ? 0.9 : 1.12;
  const target = settings.dropletsEnabled ? Math.floor((width * height * settings.dropletDensity * densityBoost) / 7200) : 0;
  const cappedTarget = Math.min(target, settings.reducedMotion ? 110 : 280);

  while (droplets.length < cappedTarget) {
    droplets.push(makeDroplet(width, height, clearMask, settings));
  }
  if (droplets.length > cappedTarget) {
    droplets.length = cappedTarget;
  }

  const maxPaneDrops = settings.reducedMotion ? 2 : Math.max(3, Math.floor(cappedTarget * 0.035));
  let paneCount = 0;
  for (const droplet of droplets) {
    if (droplet.kind === 'pane') {
      paneCount += 1;
      if (paneCount > maxPaneDrops) {
        Object.assign(droplet, makeDroplet(width, height, clearMask, { ...settings, mode: 'greyglass' }));
        droplet.kind = Math.random() > 0.58 ? 'micro' : 'bead';
      }
    }
  }
}

export function drawDroplets(
  ctx: CanvasRenderingContext2D,
  droplets: Droplet[],
  width: number,
  height: number,
  dt: number,
  settings: WeatherSettings,
  clearMask: Rect | null,
) {
  if (!settings.dropletsEnabled || droplets.length === 0) {
    return;
  }

  ctx.save();
  for (let index = droplets.length - 1; index >= 0; index -= 1) {
    const droplet = droplets[index];
    droplet.age += dt * settings.animationSpeed;
    const reducedMotionMultiplier = settings.reducedMotion ? 0.25 : 1;
    droplet.y += droplet.slideSpeed * dt * settings.animationSpeed * reducedMotionMultiplier;
    droplet.x += Math.sin(droplet.age * droplet.wobble + droplet.seed) * dt * droplet.driftX * settings.animationSpeed;

    if (droplet.age > droplet.lifetime || droplet.y > height + 20 || (clearMask && pointInRect(droplet.x, droplet.y, clearMask, 10))) {
      droplets[index] = makeDroplet(width, height, clearMask, settings);
      continue;
    }

    const fadeIn = Math.min(1, droplet.age / 2);
    const fadeOut = Math.max(0, 1 - droplet.age / droplet.lifetime);
    const modeAlpha = settings.mode === 'night-drive' ? 1.24 : settings.mode === 'greyglass' ? 0.82 : 1;
    const alpha = droplet.opacity * fadeIn * fadeOut * settings.dropletDensity * modeAlpha;
    const refractionAlpha = alpha * droplet.refraction;

    const gradient = ctx.createRadialGradient(
      droplet.x - droplet.radiusX * 0.35,
      droplet.y - droplet.radiusY * 0.35,
      0,
      droplet.x,
      droplet.y,
      Math.max(droplet.radiusX, droplet.radiusY),
    );
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * droplet.highlight})`);
    gradient.addColorStop(0.38, `rgba(190, 220, 224, ${alpha * 0.38})`);
    gradient.addColorStop(0.72, `rgba(34, 52, 55, ${refractionAlpha * (droplet.kind === 'pane' ? 0.12 : 0.22)})`);
    gradient.addColorStop(1, `rgba(5, 12, 14, ${refractionAlpha * (droplet.kind === 'pane' ? 0.07 : 0.14)})`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(droplet.x, droplet.y, droplet.radiusX, droplet.radiusY, -0.08, 0, Math.PI * 2);
    ctx.fill();

    if (droplet.kind !== 'micro') {
      ctx.strokeStyle = `rgba(5, 12, 14, ${refractionAlpha * 0.22})`;
      ctx.lineWidth = droplet.kind === 'pane' ? 0.75 : 0.75;
      ctx.beginPath();
      ctx.ellipse(droplet.x + droplet.radiusX * 0.08, droplet.y + droplet.radiusY * 0.12, droplet.radiusX * 0.92, droplet.radiusY * 0.94, -0.08, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.42})`;
    ctx.lineWidth = droplet.kind === 'pane' ? 1.05 : 0.7;
    ctx.beginPath();
    ctx.ellipse(droplet.x - droplet.radiusX * 0.18, droplet.y - droplet.radiusY * 0.12, droplet.radiusX * 0.45, droplet.radiusY * 0.56, -0.1, 0.2, Math.PI * 1.2);
    ctx.stroke();

    if (droplet.kind === 'pane' && droplet.slideSpeed > 8) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.32})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(droplet.x - droplet.radiusX * 0.08, droplet.y + droplet.radiusY * 0.55);
      ctx.bezierCurveTo(
        droplet.x - droplet.radiusX * 0.02,
        droplet.y + droplet.radiusY * 0.72,
        droplet.x + droplet.radiusX * 0.06,
        droplet.y + droplet.radiusY * 0.88,
        droplet.x + droplet.radiusX * 0.02,
        droplet.y + droplet.radiusY * 1.05,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}
