import { describe, expect, it } from 'vitest';
import { FocusTransition, FOCUS_RETURN_MS } from './focusTransition';

const left = { x: 0, y: 0, width: 200, height: 200 };
const right = { ...left, x: 300 };

describe('weather returning to previous focus', () => {
  it('fades the old area and explicitly redraws the finishing frame', () => {
    const transition = new FocusTransition();
    expect(transition.update(left, 'a', 0)).toBe(false);
    expect(transition.update(right, 'b', 100)).toBe(true);
    expect(transition.opacityAt(100, 100, 100)).toBe(0);
    expect(transition.opacityAt(100, 100, 100 + FOCUS_RETURN_MS / 2)).toBeCloseTo(0.5);
    expect(transition.update(right, 'b', 100 + FOCUS_RETURN_MS)).toBe(true);
    expect(transition.opacityAt(100, 100, 100 + FOCUS_RETURN_MS)).toBe(1);
    expect(transition.update(right, 'b', 100 + FOCUS_RETURN_MS + 1)).toBe(false);
  });

  it('does not leave fading window silhouettes when the same window moves or resizes', () => {
    const transition = new FocusTransition();
    transition.update(left, 'a', 0);
    expect(transition.update(right, 'a', 10)).toBe(false);
    expect(transition.opacityAt(100, 100, 10)).toBe(1);
  });

  it('bounds rapid focus changes and expires them after sleep or hiding', () => {
    const transition = new FocusTransition();
    for (let i = 0; i < 20; i++) transition.update({ ...left, x: i * 300 }, i, i * 10);
    expect(transition.opacityAt(100, 100, 200)).toBe(1);
    expect(transition.opacityAt(18 * 300 + 100, 100, 200)).toBeLessThan(0.1);
    expect(transition.update(right, 19, 60_000)).toBe(true);
    expect(transition.opacityAt(18 * 300 + 100, 100, 60_000)).toBe(1);
    expect(transition.update(right, 19, 60_001)).toBe(false);
  });

  it('clears all retiring areas for reduced motion, pause or explicit full weather', () => {
    const transition = new FocusTransition();
    transition.update(left, 'a', 0);
    transition.update(right, 'b', 100);
    transition.update(null, null, 110, false);
    expect(transition.opacityAt(100, 100, 110)).toBe(1);
    expect(transition.update(null, null, 111, false)).toBe(false);
  });
});
