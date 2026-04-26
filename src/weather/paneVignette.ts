import type { ModePreset, WeatherSettings } from './types';

export function drawPaneVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: WeatherSettings,
  preset: ModePreset,
) {
  const strength =
    settings.mode === 'storm-lock-in' ? 0.2 : settings.mode === 'night-drive' ? 0.17 : settings.mode === 'greyglass' ? 0.13 : 0.1;
  const edge = Math.min(Math.max(width, height) * 0.12, 180);

  ctx.save();

  const outer = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.74);
  outer.addColorStop(0, 'rgba(0,0,0,0)');
  outer.addColorStop(1, preset.palette.shadow);
  ctx.globalAlpha = strength * (0.72 + settings.fogIntensity * 0.38);
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, width, height);

  const topSheen = ctx.createLinearGradient(0, 0, 0, edge);
  topSheen.addColorStop(0, 'rgba(255,255,255,0.2)');
  topSheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.05 + settings.dropletDensity * 0.03;
  ctx.fillStyle = topSheen;
  ctx.fillRect(0, 0, width, edge);

  ctx.restore();
}
