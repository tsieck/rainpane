import { pointInRect } from './masks';
import type { ModePreset, Rect, WeatherSettings } from './types';

const MODE_BUILD_SECONDS = {
  'cozy-rain': 210,
  'storm-lock-in': 95,
  'night-drive': 150,
  greyglass: 185,
} satisfies Record<WeatherSettings['mode'], number>;

export class FogAccumulator {
  private cols = 0;
  private rows = 0;
  private values = new Float32Array(0);
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private pendingDt = 0;

  private resize(width: number, height: number, settings: WeatherSettings) {
    const conservative = settings.renderBudget === 'conservative';
    const cellSize = conservative ? 76 : settings.lowPowerMode ? 52 : 34;
    const nextCols = Math.max(conservative ? 12 : settings.lowPowerMode ? 18 : 24, Math.ceil(width / cellSize));
    const nextRows = Math.max(conservative ? 8 : settings.lowPowerMode ? 12 : 16, Math.ceil(height / cellSize));

    if (nextCols === this.cols && nextRows === this.rows) {
      return;
    }

    this.cols = nextCols;
    this.rows = nextRows;
    this.values = new Float32Array(this.cols * this.rows);

    if (typeof document !== 'undefined') {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = this.cols;
      this.fogCanvas.height = this.rows;
      this.fogCtx = this.fogCanvas.getContext('2d');
    }
  }

  update(width: number, height: number, dt: number, clearMask: Rect | null, settings: WeatherSettings) {
    this.resize(width, height, settings);

    if (!settings.fogEnabled || !settings.fogAccumulationEnabled) {
      this.values.fill(0);
      this.pendingDt = 0;
      return;
    }

    if (settings.lowPowerMode || settings.renderBudget === 'conservative') {
      this.pendingDt += dt;
      if (this.pendingDt < (settings.renderBudget === 'conservative' ? 0.32 : 0.18)) {
        return;
      }

      dt = this.pendingDt;
      this.pendingDt = 0;
    }

    const cellWidth = width / this.cols;
    const cellHeight = height / this.rows;
    const buildSeconds = MODE_BUILD_SECONDS[settings.mode];
    const buildRate = (dt / buildSeconds) * settings.animationSpeed;
    const clearRate = dt * (settings.reducedMotion ? 0.75 : 1.35);
    const maxValue = 0.28 + settings.fogIntensity * 0.72;

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const index = row * this.cols + col;
        const x = (col + 0.5) * cellWidth;
        const y = (row + 0.5) * cellHeight;
        const inClearMask = clearMask ? pointInRect(x, y, clearMask, 28) : false;

        if (inClearMask) {
          this.values[index] = Math.max(0, this.values[index] - clearRate);
        } else {
          this.values[index] = Math.min(maxValue, this.values[index] + buildRate);
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings, preset: ModePreset) {
    if (!settings.fogEnabled || !settings.fogAccumulationEnabled || this.values.length === 0) {
      return;
    }

    const maxAlpha = 0.06 + settings.fogIntensity * 0.32;

    ctx.save();
    if (this.fogCanvas && this.fogCtx) {
      this.fogCtx.clearRect(0, 0, this.cols, this.rows);
      this.fogCtx.fillStyle = preset.palette.fog;
      for (let row = 0; row < this.rows; row += 1) {
        for (let col = 0; col < this.cols; col += 1) {
          const value = this.values[row * this.cols + col];
          if (value <= 0.01) {
            continue;
          }

          this.fogCtx.globalAlpha = Math.pow(value, 1.35) * maxAlpha;
          this.fogCtx.fillRect(col, row, 1, 1);
        }
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = settings.lowPowerMode || settings.renderBudget === 'conservative' ? 'medium' : 'high';
      ctx.filter = `blur(${settings.renderBudget === 'conservative' ? 12 : settings.lowPowerMode ? 14 : 18}px)`;
      const bleed = settings.renderBudget === 'conservative' ? 16 : settings.lowPowerMode ? 18 : 22;
      ctx.drawImage(this.fogCanvas, -bleed, -bleed, width + bleed * 2, height + bleed * 2);
      ctx.filter = 'none';
    }

    ctx.globalAlpha = settings.fogIntensity * 0.08;
    ctx.fillStyle = preset.palette.shadow;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }
}
