import type { RainStreak, Rect, WeatherSettings } from './types';

export interface RainGustState {
  cooldown: number;
  strength: number;
  direction: number;
}

function chooseLayer(): RainStreak['layer'] {
  const roll = Math.random();
  if (roll < 0.48) {
    return 'far';
  }
  if (roll < 0.9) {
    return 'mid';
  }
  return 'near';
}

function makeStreak(width: number, height: number): RainStreak {
  const layer = chooseLayer();
  const layerScale = layer === 'far' ? 0.58 : layer === 'near' ? 1.55 : 1;

  return {
    layer,
    x: Math.random() * width,
    y: Math.random() * height,
    length: (9 + Math.random() * 28) * layerScale,
    speed: (340 + Math.random() * 560) * layerScale,
    opacity: (0.08 + Math.random() * 0.32) * (layer === 'far' ? 0.55 : layer === 'near' ? 1.15 : 1),
    drift: -40 + Math.random() * 80,
    thickness: (0.42 + Math.random() * 0.95) * (layer === 'near' ? 1.25 : layer === 'far' ? 0.7 : 1),
    broken: Math.random() > (layer === 'far' ? 0.88 : 0.72),
    seed: Math.random() * Math.PI * 2,
  };
}

export function updateRainGust(state: RainGustState, dt: number, settings: WeatherSettings) {
  if (settings.reducedMotion || settings.mode === 'greyglass') {
    state.cooldown = 5;
    state.strength = 0;
    return;
  }

  state.cooldown -= dt;
  state.strength = Math.max(0, state.strength - dt * (settings.mode === 'storm-lock-in' ? 0.9 : 1.35));

  if (state.cooldown <= 0) {
    const stormBoost = settings.mode === 'storm-lock-in' ? 1.6 : settings.mode === 'night-drive' ? 1.2 : 0.75;
    state.strength = (0.18 + Math.random() * 0.28) * stormBoost;
    state.direction = (Math.random() > 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.65);
    state.cooldown = settings.mode === 'storm-lock-in' ? 3.5 + Math.random() * 5 : 7 + Math.random() * 11;
  }
}

export function syncRainStreaks(streaks: RainStreak[], width: number, height: number, settings: WeatherSettings) {
  const densityBoost = settings.mode === 'storm-lock-in' ? 1.18 : settings.mode === 'greyglass' ? 0.78 : 1;
  const powerScale = settings.lowPowerMode ? 0.62 : 1;
  const target = settings.rainEnabled ? Math.floor((width * height * settings.rainIntensity * densityBoost * powerScale) / 1450) : 0;
  const cappedTarget = Math.min(target, settings.reducedMotion ? 260 : settings.lowPowerMode ? 520 : 980);

  while (streaks.length < cappedTarget) {
    streaks.push(makeStreak(width, height));
  }
  if (streaks.length > cappedTarget) {
    streaks.length = cappedTarget;
  }
}

export function drawRain(
  ctx: CanvasRenderingContext2D,
  streaks: RainStreak[],
  width: number,
  height: number,
  dt: number,
  settings: WeatherSettings,
  rainColor: string,
  clearMask: Rect | null,
  gust: RainGustState,
) {
  if (!settings.rainEnabled || streaks.length === 0) {
    return;
  }

  const gustAngle = gust.strength * gust.direction * 22;
  const angleDegrees = Math.max(-78, Math.min(78, settings.windAngle + gustAngle));
  const angle = (angleDegrees * Math.PI) / 180;
  const windX = Math.sin(angle) * (settings.mode === 'storm-lock-in' ? 420 : 320) * (1 + gust.strength);

  ctx.save();
  ctx.lineCap = 'round';

  for (const streak of streaks) {
    const layerSpeed = streak.layer === 'far' ? 0.62 : streak.layer === 'near' ? 1.2 : 1;
    const speed = streak.speed * layerSpeed * settings.animationSpeed * (settings.reducedMotion ? 0.35 : 1) * (1 + gust.strength * 0.45);
    streak.y += speed * dt;
    streak.x += (windX * layerSpeed + streak.drift) * dt * settings.animationSpeed;

    if (streak.y - streak.length > height || streak.x < -100 || streak.x > width + 100) {
      streak.x = Math.random() * width;
      streak.y = -Math.random() * height * 0.25;
    }

    const modeLength = settings.mode === 'night-drive' ? 1.38 : settings.mode === 'storm-lock-in' ? 1.24 : settings.mode === 'greyglass' ? 0.82 : 1;
    const length = streak.length * modeLength * (1 + gust.strength * 0.24);
    const sidewaysBoost = settings.mode === 'night-drive' ? 1.18 : settings.mode === 'storm-lock-in' ? 1.1 : 1;
    const directionX = Math.sin(angle) * sidewaysBoost;
    const directionY = Math.max(0.18, Math.cos(angle));
    const directionLength = Math.hypot(directionX, directionY);
    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    const endX = streak.x + unitX * length;
    const endY = streak.y + unitY * length;
    if (clearMask && streak.x > clearMask.x && streak.x < clearMask.x + clearMask.width && streak.y > clearMask.y && streak.y < clearMask.y + clearMask.height) {
      continue;
    }

    const alpha =
      streak.opacity *
      settings.rainIntensity *
      (settings.mode === 'greyglass' ? 0.62 : 1) *
      (streak.layer === 'near' ? 1.12 : streak.layer === 'far' ? 0.82 : 1);
    const gradient = ctx.createLinearGradient(streak.x, streak.y, endX, endY);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.22, rainColor);
    gradient.addColorStop(0.72, rainColor);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(0.45, streak.thickness * (0.55 + settings.rainIntensity * 0.55));
    ctx.beginPath();
    ctx.moveTo(streak.x, streak.y);
    if (streak.broken && streak.layer !== 'far') {
      const breakStart = 0.42 + Math.sin(streak.seed) * 0.12;
      const breakEnd = Math.min(0.82, breakStart + 0.16);
      const midAX = streak.x + (endX - streak.x) * breakStart;
      const midAY = streak.y + (endY - streak.y) * breakStart;
      const midBX = streak.x + (endX - streak.x) * breakEnd;
      const midBY = streak.y + (endY - streak.y) * breakEnd;
      ctx.lineTo(midAX, midAY);
      ctx.moveTo(midBX, midBY);
      ctx.lineTo(endX, endY);
    } else {
      ctx.lineTo(endX, endY);
    }
    ctx.stroke();
  }

  ctx.restore();
}
