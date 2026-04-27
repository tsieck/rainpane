import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import { syncSnowFlakes } from './snow';
import type { SnowFlake } from './types';

describe('snow layer', () => {
  it('only spawns flakes for Winterglass', () => {
    const flakes: SnowFlake[] = [];
    syncSnowFlakes(flakes, 1600, 900, DEFAULT_SETTINGS);
    expect(flakes).toHaveLength(0);

    syncSnowFlakes(flakes, 1600, 900, { ...DEFAULT_SETTINGS, mode: 'winterglass', fogIntensity: 0.68 });
    expect(flakes.length).toBeGreaterThan(0);
  });

  it('uses a smaller conservative render budget', () => {
    const standard: SnowFlake[] = [];
    const conservative: SnowFlake[] = [];
    syncSnowFlakes(standard, 2600, 1600, { ...DEFAULT_SETTINGS, mode: 'winterglass', fogIntensity: 0.9, lowPowerMode: false });
    syncSnowFlakes(conservative, 2600, 1600, {
      ...DEFAULT_SETTINGS,
      mode: 'winterglass',
      fogIntensity: 0.9,
      lowPowerMode: false,
      renderBudget: 'conservative',
    });

    expect(conservative.length).toBeLessThan(standard.length);
    expect(conservative.length).toBeLessThanOrEqual(120);
  });
});
