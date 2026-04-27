import { drawDroplets, syncDroplets } from './droplets';
import { drawEdgeRunoff, syncEdgeRunoff } from './edgeRunoff';
import { drawFog } from './fog';
import { FogAccumulator } from './fogAccumulation';
import { drawLockInDimming } from './focusEffects';
import { drawFrostedGlass } from './frostedGlass';
import { drawGrain } from './grain';
import { drawLightning, updateLightning, type LightningState } from './lightning';
import { drawMaskFeather, withInactiveClip } from './masks';
import { drawPaneVignette } from './paneVignette';
import { drawRain, syncRainStreaks, updateRainGust, type RainGustState } from './raindrops';
import { drawSnow, syncSnowFlakes } from './snow';
import { drawSplashes, maybeSpawnSplash } from './splashes';
import type { Droplet, EdgeRunoffDrop, ModePreset, RainSplash, RainStreak, Rect, SnowFlake, WeatherSettings } from './types';

export class WeatherEngine {
  private streaks: RainStreak[] = [];
  private droplets: Droplet[] = [];
  private splashes: RainSplash[] = [];
  private edgeDrops: EdgeRunoffDrop[] = [];
  private snowFlakes: SnowFlake[] = [];
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
    syncSnowFlakes(this.snowFlakes, width, height, settings);
    syncDroplets(this.droplets, width, height, settings, activeMask);
    syncEdgeRunoff(this.edgeDrops, activeMask, settings);

    withInactiveClip(ctx, width, height, activeMask, () => {
      const fogSettings = settings.fogAccumulationEnabled
        ? { ...settings, fogIntensity: settings.fogIntensity * 0.36 }
        : settings;
      drawFog(ctx, width, height, this.elapsed, fogSettings, preset.palette.tint, preset.palette.fog, preset.palette.shadow, activeMask);
      drawPaneVignette(ctx, width, height, settings, preset);
      drawLockInDimming(ctx, width, height, settings, preset);
      this.fogAccumulator.draw(ctx, width, height, settings, preset);
      drawFrostedGlass(ctx, width, height, this.elapsed, settings, preset);
      drawLightning(ctx, width, height, this.lightning, preset.palette.lightning);
      drawRain(ctx, this.streaks, width, height, dt, settings, preset.palette.rain, activeMask, this.rainGust, (x, y) => {
        maybeSpawnSplash(this.splashes, x, y, settings);
      });
      drawSnow(ctx, this.snowFlakes, width, height, dt, settings, preset.palette.rain, activeMask);
      drawSplashes(ctx, this.splashes, dt, settings, preset.palette.rain);
      drawEdgeRunoff(ctx, this.edgeDrops, activeMask, dt, settings, preset.palette.rain);
      drawDroplets(ctx, this.droplets, width, height, dt, settings, activeMask);
      drawGrain(ctx, width, height, this.elapsed, settings);
    });

    if (activeMask) {
      drawMaskFeather(ctx, activeMask, preset.palette.fog, settings.fogIntensity);
    }
  }
}
