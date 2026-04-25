import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, validateSettings } from './settings.js';

describe('electron settings validation', () => {
  it('keeps persisted fog accumulation and safety toggles', () => {
    const next = validateSettings(
      {
        ...DEFAULT_SETTINGS,
        fogAccumulationEnabled: false,
        lightningEnabled: true,
        grainEnabled: false,
        coverFullScreen: true,
        fullRainWhileMoving: false,
        displayMode: 'all',
        lockInDimmingEnabled: false,
      },
      DEFAULT_SETTINGS,
    );

    expect(next.fogAccumulationEnabled).toBe(false);
    expect(next.lightningEnabled).toBe(true);
    expect(next.grainEnabled).toBe(false);
    expect(next.coverFullScreen).toBe(true);
    expect(next.fullRainWhileMoving).toBe(false);
    expect(next.displayMode).toBe('all');
    expect(next.lockInDimmingEnabled).toBe(false);
  });

  it('clamps persisted intensity values', () => {
    const next = validateSettings(
      {
        ...DEFAULT_SETTINGS,
        rainIntensity: 4,
        fogIntensity: -1,
      },
      DEFAULT_SETTINGS,
    );

    expect(next.rainIntensity).toBe(1);
    expect(next.fogIntensity).toBe(0);
  });
});
