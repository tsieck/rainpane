import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import { getCondensationDetailProfile, getCondensationProfile } from './wetGlassCondensation';

describe('wet glass condensation profile', () => {
  it('scales film density without exceeding its render budget', () => {
    const sparse = getCondensationProfile(1280, 800, { ...DEFAULT_SETTINGS, dropletDensity: 0.12 });
    const dense = getCondensationProfile(1280, 800, { ...DEFAULT_SETTINGS, dropletDensity: 0.86 });

    expect(dense.population).toBeGreaterThan(sparse.population);
    expect(dense.population).toBeLessThanOrEqual(dense.maxPopulation);
  });

  it('bounds the cached surface on a 5K display', () => {
    const profile = getCondensationProfile(5120, 2160, {
      ...DEFAULT_SETTINGS,
      renderBudget: 'conservative',
    });
    const saturated = getCondensationProfile(5120, 2160, {
      ...DEFAULT_SETTINGS,
      dropletDensity: 1,
      renderBudget: 'conservative',
    });

    expect(5120 * profile.scale).toBeLessThanOrEqual(2048);
    expect(5120 * 2160 * profile.scale * profile.scale).toBeLessThanOrEqual(2_500_000);
    expect(profile.population).toBeLessThanOrEqual(6_000);
    expect(profile.population).toBeLessThan(profile.maxPopulation);
    expect(saturated.population).toBeGreaterThan(profile.population);
  });

  it('removes the film when droplets are disabled or density is zero', () => {
    expect(getCondensationProfile(800, 600, { ...DEFAULT_SETTINGS, dropletsEnabled: false }).population).toBe(0);
    expect(getCondensationProfile(800, 600, { ...DEFAULT_SETTINGS, dropletDensity: 0 }).population).toBe(0);
  });

  it('caps sparse high-resolution rims without raising the broad film surface', () => {
    const standard = getCondensationDetailProfile(DEFAULT_SETTINGS);
    const conservative = getCondensationDetailProfile({
      ...DEFAULT_SETTINGS,
      renderBudget: 'conservative',
    });

    expect(standard.maxRims).toBeLessThanOrEqual(1_100);
    expect(conservative.maxRims).toBeLessThan(standard.maxRims);
    expect(conservative.highlightThreshold).toBeGreaterThan(standard.highlightThreshold);
    expect(getCondensationDetailProfile({ ...DEFAULT_SETTINGS, dropletsEnabled: false }).maxRims).toBe(0);
  });
});
