import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import { createProtectedWeatherMask, getFocusQuietMargin } from './weatherEngine';

describe('focus quiet geometry', () => {
  it('preserves full-cover rendering when there is no protected window', () => {
    expect(createProtectedWeatherMask(null, 1440, 900, DEFAULT_SETTINGS)).toBeNull();
  });

  it('keeps a small particle-safe margin in conservative rendering', () => {
    const settings = { ...DEFAULT_SETTINGS, renderBudget: 'conservative' as const };
    const margin = getFocusQuietMargin(566, 1121, settings);

    expect(margin).toBeGreaterThanOrEqual(2.5);
    expect(margin).toBeLessThanOrEqual(3.5);
    expect(
      createProtectedWeatherMask({ x: 66, y: 112, width: 458, height: 895 }, 566, 1121, settings),
    ).toEqual({
      x: 63.5,
      y: 109.5,
      width: 463,
      height: 900,
    });
  });

  it('uses a wider optical margin when full rendering is available', () => {
    const conservative = getFocusQuietMargin(1440, 900, {
      ...DEFAULT_SETTINGS,
      renderBudget: 'conservative',
    });
    const standard = getFocusQuietMargin(1440, 900, {
      ...DEFAULT_SETTINGS,
      lowPowerMode: false,
      renderBudget: 'standard',
    });

    expect(standard).toBeGreaterThan(conservative);
  });
});
