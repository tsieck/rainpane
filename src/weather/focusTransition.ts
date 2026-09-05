import { getFocusMaskCornerRadius, pointInRect, traceRoundedRect } from './masks';
import type { Rect } from './types';

export const FOCUS_RETURN_MS = 520;
const MAX_RETIRING_WINDOWS = 4;
interface RetiringWindow { mask: Rect; started: number; }

function sameRect(a: Rect | null, b: Rect | null) {
  return a === b || Boolean(a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

/** The new focus is always a hard cutout. Only weather returning to old focus fades. */
export class FocusTransition {
  private current: Rect | null = null;
  private key: string | number | null | undefined;
  private retiring: RetiringWindow[] = [];

  update(mask: Rect | null, key: string | number | null | undefined, now: number, animate = true) {
    const wasActive = this.retiring.length > 0;
    this.retiring = this.retiring.filter((window) => now - window.started < FOCUS_RETURN_MS);
    const changed = key === undefined ? !sameRect(mask, this.current) : key !== this.key;
    if (animate && changed && this.current && !sameRect(mask, this.current)) {
      this.retiring.push({ mask: this.current, started: now });
      this.retiring = this.retiring.slice(-MAX_RETIRING_WINDOWS);
    }
    if (!animate) this.retiring = [];
    this.current = mask ? { ...mask } : null;
    this.key = key;
    // Include the finishing frame so cached layers cannot retain a faint hole.
    return wasActive || this.retiring.length > 0;
  }

  private clarity(window: RetiringWindow, now: number) {
    const t = Math.max(0, Math.min(1, (now - window.started) / FOCUS_RETURN_MS));
    return 1 - t * t * (3 - 2 * t);
  }

  apply(ctx: CanvasRenderingContext2D, width: number, height: number, now: number) {
    if (!this.retiring.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    for (const window of this.retiring) {
      ctx.globalAlpha = this.clarity(window, now);
      ctx.beginPath();
      traceRoundedRect(ctx, window.mask, getFocusMaskCornerRadius(window.mask, width, height));
      ctx.fill();
    }
    ctx.restore();
  }

  /** Match native droplet opacity without weakening its separate protected mask. */
  opacityAt(x: number, y: number, now: number) {
    let opacity = 1;
    for (const window of this.retiring) {
      if (pointInRect(x, y, window.mask)) opacity *= 1 - this.clarity(window, now);
    }
    return opacity;
  }
}
