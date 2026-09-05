import { describe, expect, it } from 'vitest';
import { FrameCadence } from './frameCadence';

describe('layer frame cadence', () => {
  it('keeps 24 fps on a 60 Hz display without rounding down to 20 fps', () => {
    const clock = new FrameCadence();
    let frames = 0;
    for (let i = 0; i < 600; i++) {
      if (clock.due(i * 1000 / 60, 24)) frames++;
    }
    expect(frames).toBe(240);
  });

  it('drops missed frames after a stall instead of running catch-up work', () => {
    const clock = new FrameCadence();
    expect(clock.due(1, 30)).toBe(true);
    expect(clock.due(5000, 30)).toBe(true);
    expect(clock.due(5001, 30)).toBe(false);
    expect(clock.delay(5001)).toBeGreaterThan(20);
  });

  it('renders immediately after invalidation and adopts a new cadence', () => {
    const clock = new FrameCadence();
    clock.due(100, 8);
    clock.reset();
    expect(clock.due(110, 30)).toBe(true);
    expect(clock.due(144, 30)).toBe(true);
  });
});
