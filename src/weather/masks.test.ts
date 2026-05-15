import { describe, expect, it } from 'vitest';
import { createFocusQuietMask, expandRect, pointInRect, rectsIntersect } from './masks';

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
});
