import type { WeatherSettings } from './types';

export interface LightningState {
  cooldown: number;
  flash: number;
}

export function updateLightning(state: LightningState, dt: number, settings: WeatherSettings) {
  if (!settings.lightningEnabled || settings.mode !== 'storm-lock-in' || settings.reducedMotion) {
    state.cooldown = Math.max(state.cooldown, 6);
    state.flash = 0;
    return;
  }

  state.cooldown -= dt;
  state.flash = Math.max(0, state.flash - dt * 1.8);

  if (state.cooldown <= 0) {
    state.flash = 0.12 + Math.random() * 0.16;
    state.cooldown = 8 + Math.random() * 14;
  }
}

export function drawLightning(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: LightningState,
  color: string,
) {
  if (state.flash <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = state.flash;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.42, color);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.globalAlpha = state.flash * 0.45;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
