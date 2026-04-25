import type { ModePreset, WeatherSettings } from './types';

export function drawLockInDimming(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: WeatherSettings,
  preset: ModePreset,
) {
  if (!settings.lockInDimmingEnabled || settings.coverFullScreen) {
    return;
  }

  const modeStrength = settings.mode === 'storm-lock-in' ? 0.16 : settings.mode === 'night-drive' ? 0.1 : 0.055;
  const alpha = modeStrength * (0.35 + settings.fogIntensity * 0.65);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = preset.palette.shadow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
