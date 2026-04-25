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

  private resize(width: number, height: number) {
    const nextCols = Math.max(24, Math.ceil(width / 34));
    const nextRows = Math.max(16, Math.ceil(height / 34));

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
    this.resize(width, height);

    if (!settings.fogEnabled || !settings.fogAccumulationEnabled) {
      this.values.fill(0);
      return;
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
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'blur(18px)';
      ctx.drawImage(this.fogCanvas, -22, -22, width + 44, height + 44);
      ctx.filter = 'none';
    }

    ctx.globalAlpha = settings.fogIntensity * 0.08;
    ctx.fillStyle = preset.palette.shadow;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }
}
