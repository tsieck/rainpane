import { describe, expect, it } from 'vitest';
import { pointInRect, rectsIntersect } from './masks';

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
});
