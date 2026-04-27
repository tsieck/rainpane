import { describe, expect, it } from 'vitest';
import { applyIntensity, applyMode, DEFAULT_SETTINGS, INTENSITY_PRESETS, MODE_PRESETS } from './settingsStore';

describe('weather settings', () => {
  it('has defaults that point to an existing mode', () => {
    expect(MODE_PRESETS[DEFAULT_SETTINGS.mode]).toBeDefined();
  });

  it('applies mode preset values', () => {
    const next = applyMode(DEFAULT_SETTINGS, 'storm-lock-in');
    expect(next.mode).toBe('storm-lock-in');
    expect(next.rainIntensity).toBe(MODE_PRESETS['storm-lock-in'].settings.rainIntensity);
  });

  it('includes Winterglass as a quiet snow atmosphere', () => {
    const next = applyMode(DEFAULT_SETTINGS, 'winterglass');
    expect(next.mode).toBe('winterglass');
    expect(MODE_PRESETS.winterglass.label).toBe('Winterglass');
    expect(next.animationSpeed).toBeLessThan(MODE_PRESETS['cozy-rain'].settings.animationSpeed);
    expect(next.fogIntensity).toBeGreaterThan(MODE_PRESETS['cozy-rain'].settings.fogIntensity);
  });

  it('keeps safety toggles when changing modes', () => {
    const next = applyMode({ ...DEFAULT_SETTINGS, reducedMotion: true, debugMode: true, lightningEnabled: true }, 'greyglass');
    expect(next.reducedMotion).toBe(true);
    expect(next.debugMode).toBe(true);
    expect(next.lightningEnabled).toBe(true);
  });

  it('keeps lightning disabled by default', () => {
    expect(DEFAULT_SETTINGS.lightningEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.grainEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.fogAccumulationEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.coverFullScreen).toBe(false);
    expect(DEFAULT_SETTINGS.fullRainWhileMoving).toBe(true);
    expect(DEFAULT_SETTINGS.displayMode).toBe('primary');
    expect(DEFAULT_SETTINGS.lockInDimmingEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.lowPowerMode).toBe(true);
    expect(DEFAULT_SETTINGS.autoLowPower).toBe(true);
    expect(DEFAULT_SETTINGS.idleDeepeningEnabled).toBe(true);
  });

  it('applies intensity preset values without changing mode', () => {
    const next = applyIntensity(DEFAULT_SETTINGS, 'frosted');
    expect(next.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(next.fogIntensity).toBe(INTENSITY_PRESETS.frosted.fogIntensity);
  });
});
