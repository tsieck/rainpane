import { drawFog } from './fog';
import { FogAccumulator } from './fogAccumulation';
import { drawLockInDimming } from './focusEffects';
import { drawFrostedGlass } from './frostedGlass';
import { drawGrain } from './grain';
import { drawLightning, updateLightning, type LightningState } from './lightning';
import { createFocusQuietMask, drawMaskFeather, withInactiveClip } from './masks';
import { drawPaneVignette } from './paneVignette';
import { drawRain, syncRainStreaks, updateRainGust, type RainGustState } from './raindrops';
import { drawSnow, syncSnowFlakes } from './snow';
import { drawSplashes, maybeSpawnSplash } from './splashes';
import type { ModePreset, RainSplash, RainStreak, Rect, SnowFlake, WeatherSettings } from './types';

export function getFocusQuietMargin(width: number, height: number, settings: WeatherSettings) {
  if (settings.renderBudget === 'conservative' || settings.lowPowerMode) {
    return Math.round(Math.min(3.5, Math.max(2.5, Math.min(width, height) * 0.0035)) * 2) / 2;
  }

  const base = Math.min(12, Math.max(6, Math.min(width, height) * 0.006));
  const modeScale = settings.mode === 'winterglass' ? 1.08 : settings.mode === 'storm-lock-in' ? 1.04 : 1;
  const atmosphere = Math.max(settings.rainIntensity, settings.fogIntensity, settings.dropletDensity);

  return base * modeScale * (1 + atmosphere * 0.35);
}

export function createProtectedWeatherMask(
  activeMask: Rect | null,
  width: number,
  height: number,
  settings: WeatherSettings,
) {
  return createFocusQuietMask(activeMask, width, height, getFocusQuietMargin(width, height, settings));
}

export class WeatherEngine {
  private streaks: RainStreak[] = [];
  private splashes: RainSplash[] = [];
  private snowFlakes: SnowFlake[] = [];
  private lightning: LightningState = { cooldown: 9, flash: 0 };
  private rainGust: RainGustState = { cooldown: 5, strength: 0, direction: 1 };
  private fogAccumulator = new FogAccumulator();
  private elapsed = 0;
  private frostElapsed = 0;
  private accumulationKey = '';

  private syncAccumulationState(settings: WeatherSettings) {
    const nextKey = [
      settings.mode,
      settings.fogEnabled,
      settings.fogAccumulationEnabled,
      settings.reducedMotion,
    ].join(':');

    if (nextKey === this.accumulationKey) {
      return;
    }

    this.accumulationKey = nextKey;
    this.frostElapsed = 0;
    this.fogAccumulator.reset();
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    activeMask: Rect | null,
    settings: WeatherSettings,
    preset: ModePreset,
    protectedMask?: Rect | null,
  ) {
    this.elapsed += dt * 1000;
    this.syncAccumulationState(settings);
    if (settings.fogEnabled && settings.fogAccumulationEnabled && !settings.reducedMotion) {
      this.frostElapsed += dt * 1000;
    }

    ctx.clearRect(0, 0, width, height);
    updateLightning(this.lightning, dt, settings);
    updateRainGust(this.rainGust, dt, settings);

    const focusQuietMask =
      protectedMask === undefined
        ? createProtectedWeatherMask(activeMask, width, height, settings)
        : protectedMask;
    this.fogAccumulator.update(width, height, dt, focusQuietMask, settings);

    syncRainStreaks(this.streaks, width, height, settings);
    syncSnowFlakes(this.snowFlakes, width, height, settings);

    withInactiveClip(ctx, width, height, focusQuietMask, () => {
      const fogSettings = settings.fogAccumulationEnabled
        ? { ...settings, fogIntensity: settings.fogIntensity * 0.36 }
        : settings;
      drawFog(
        ctx,
        width,
        height,
        this.elapsed,
        fogSettings,
        preset.palette.tint,
        preset.palette.fog,
        preset.palette.shadow,
        focusQuietMask,
      );
      drawPaneVignette(ctx, width, height, settings, preset);
      drawLockInDimming(ctx, width, height, settings, preset);
      this.fogAccumulator.draw(ctx, width, height, settings, preset);
      drawLightning(ctx, width, height, this.lightning, preset.palette.lightning);
    });

    withInactiveClip(ctx, width, height, focusQuietMask, () => {
      drawFrostedGlass(ctx, width, height, this.frostElapsed, settings, preset);
      drawRain(ctx, this.streaks, width, height, dt, settings, preset.palette.rain, focusQuietMask, this.rainGust, (x, y) => {
        maybeSpawnSplash(this.splashes, x, y, settings);
      });
      drawSnow(ctx, this.snowFlakes, width, height, dt, settings, preset.palette.rain, focusQuietMask);
      drawSplashes(ctx, this.splashes, dt, settings, preset.palette.rain);
      drawGrain(ctx, width, height, this.elapsed, settings);
    });

    if (focusQuietMask && settings.renderBudget !== 'conservative' && !settings.lowPowerMode) {
      drawMaskFeather(ctx, focusQuietMask, preset.palette.fog, settings.fogIntensity);
    }
  }
}
