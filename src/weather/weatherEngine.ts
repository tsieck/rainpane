import { drawDroplets, syncDroplets } from './droplets';
import { drawFog } from './fog';
import { FogAccumulator } from './fogAccumulation';
import { drawLockInDimming } from './focusEffects';
import { drawGrain } from './grain';
import { drawLightning, updateLightning, type LightningState } from './lightning';
import { drawMaskFeather, withInactiveClip } from './masks';
import { drawRain, syncRainStreaks, updateRainGust, type RainGustState } from './raindrops';
import type { Droplet, ModePreset, RainStreak, Rect, WeatherSettings } from './types';

export class WeatherEngine {
  private streaks: RainStreak[] = [];
  private droplets: Droplet[] = [];
  private lightning: LightningState = { cooldown: 9, flash: 0 };
  private rainGust: RainGustState = { cooldown: 5, strength: 0, direction: 1 };
  private fogAccumulator = new FogAccumulator();
  private elapsed = 0;

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    activeMask: Rect | null,
    settings: WeatherSettings,
    preset: ModePreset,
  ) {
    this.elapsed += dt * 1000;
    ctx.clearRect(0, 0, width, height);
    updateLightning(this.lightning, dt, settings);
    updateRainGust(this.rainGust, dt, settings);
    this.fogAccumulator.update(width, height, dt, activeMask, settings);

    syncRainStreaks(this.streaks, width, height, settings);
    syncDroplets(this.droplets, width, height, settings, activeMask);

    withInactiveClip(ctx, width, height, activeMask, () => {
      const fogSettings = settings.fogAccumulationEnabled
        ? { ...settings, fogIntensity: settings.fogIntensity * 0.36 }
        : settings;
      drawFog(ctx, width, height, this.elapsed, fogSettings, preset.palette.tint, preset.palette.fog, preset.palette.shadow, activeMask);
      drawLockInDimming(ctx, width, height, settings, preset);
      this.fogAccumulator.draw(ctx, width, height, settings, preset);
      drawLightning(ctx, width, height, this.lightning, preset.palette.lightning);
      drawRain(ctx, this.streaks, width, height, dt, settings, preset.palette.rain, activeMask, this.rainGust);
      drawDroplets(ctx, this.droplets, width, height, dt, settings, activeMask);
      drawGrain(ctx, width, height, this.elapsed, settings);
    });

    if (activeMask) {
      drawMaskFeather(ctx, activeMask, preset.palette.fog, settings.fogIntensity);
    }
  }
}
