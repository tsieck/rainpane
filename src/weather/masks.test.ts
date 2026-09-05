import { describe, expect, it } from 'vitest';
import {
  coversViewport,
  createFocusQuietMask,
  ellipseIntersectsRect,
  expandRect,
  getFocusMaskCornerRadius,
  pointInRect,
  rectsIntersect,
} from './masks';

describe('mask geometry', () => {
  it('detects intersecting rectangles', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 100, height: 100 }, { x: 80, y: 80, width: 50, height: 50 })).toBe(true);
  });

  it('rejects separated rectangles', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 100, height: 100 }, { x: 120, y: 80, width: 50, height: 50 })).toBe(false);
  });

  it('uses optional padding for point checks', () => {
    expect(pointInRect(105, 50, { x: 0, y: 0, width: 100, height: 100 }, 8)).toBe(true);
  });

  it('rejects an ellipse outside a rectangle', () => {
    expect(ellipseIntersectsRect(4, 4, 2, 3, { x: 10, y: 10, width: 20, height: 20 })).toBe(false);
  });

  it('includes an ellipse tangent to a rectangle corner', () => {
    expect(ellipseIntersectsRect(0, 0, 10, 10, { x: 6, y: 8, width: 20, height: 20 })).toBe(true);
  });

  it('detects an ellipse centered inside a rectangle', () => {
    expect(ellipseIntersectsRect(15, 15, 4, 6, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
  });

  it('expands the rectangle by optional padding for ellipse checks', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(ellipseIntersectsRect(4, 15, 2, 3, rect)).toBe(false);
    expect(ellipseIntersectsRect(4, 15, 2, 3, rect, 4)).toBe(true);
  });

  it('detects an ellipse within a full-canvas rectangle', () => {
    expect(ellipseIntersectsRect(50, 50, 8, 12, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });

  it('handles zero-radius ellipses as points or line segments', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(ellipseIntersectsRect(15, 15, 0, 0, rect)).toBe(true);
    expect(ellipseIntersectsRect(5, 15, 0, 8, rect)).toBe(false);
    expect(ellipseIntersectsRect(15, 5, 0, 5, rect)).toBe(true);
  });

  it('expands a focus quiet mask while clamping to canvas bounds', () => {
    expect(
      createFocusQuietMask({ x: 12, y: 18, width: 100, height: 80 }, 160, 120, 24),
    ).toEqual({
      x: 0,
      y: 0,
      width: 136,
      height: 120,
    });
  });

  it('returns the clear mask unchanged when quiet margin is disabled', () => {
    const mask = { x: 20, y: 30, width: 80, height: 60 };
    expect(createFocusQuietMask(mask, 200, 160, 0)).toBe(mask);
    expect(expandRect(mask, 10)).toEqual({ x: 10, y: 20, width: 100, height: 80 });
  });

  it('rounds a window-sized focus mask but not a full-canvas clear state', () => {
    expect(getFocusMaskCornerRadius({ x: 60, y: 100, width: 460, height: 900 }, 566, 1121)).toBe(12);
    expect(getFocusMaskCornerRadius({ x: 0, y: 0, width: 566, height: 1121 }, 566, 1121)).toBe(0);
  });
});

describe('full viewport protection', () => {
  it('suspends only when the entire visible viewport is protected', () => {
    expect(coversViewport({ x: 0, y: 0, width: 800, height: 600 }, 800, 600)).toBe(true);
    expect(coversViewport({ x: -100, y: -50, width: 1000, height: 800 }, 800, 600)).toBe(true);
    expect(coversViewport({ x: 1, y: 0, width: 800, height: 600 }, 800, 600)).toBe(false);
    expect(coversViewport(null, 800, 600)).toBe(false);
    expect(coversViewport({ x: 0, y: 0, width: 0, height: 0 }, 0, 0)).toBe(false);
  });
});
