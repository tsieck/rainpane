import { describe, expect, it } from 'vitest';
import { MODE_PRESETS } from '../src/state/settingsStore';
import { DEFAULT_SETTINGS, MODE_DEFAULTS, validateSettings } from './settings.js';

describe('electron settings validation', () => {
  it('keeps photoreal refraction opt-in and validates it as a boolean', () => {
    expect(DEFAULT_SETTINGS.photorealRefractionEnabled).toBe(false);
    expect(
      validateSettings({ photorealRefractionEnabled: true }, DEFAULT_SETTINGS)
        .photorealRefractionEnabled,
    ).toBe(true);
    expect(
      validateSettings({ photorealRefractionEnabled: 'yes' }, DEFAULT_SETTINGS)
        .photorealRefractionEnabled,
    ).toBe(false);
  });

  it('keeps main-process mode defaults in sync with renderer presets', () => {
    const rendererModeDefaults = Object.fromEntries(
      Object.entries(MODE_PRESETS).map(([mode, preset]) => [mode, preset.settings]),
    );

    expect(MODE_DEFAULTS).toEqual(rendererModeDefaults);
  });

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
        lowPowerMode: false,
        autoLowPower: false,
        idleDeepeningEnabled: false,
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
    expect(next.lowPowerMode).toBe(false);
    expect(next.autoLowPower).toBe(false);
    expect(next.idleDeepeningEnabled).toBe(false);
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

  it('accepts the Winterglass mode from persisted settings', () => {
    const next = validateSettings({ ...DEFAULT_SETTINGS, mode: 'winterglass' }, DEFAULT_SETTINGS);
    expect(next.mode).toBe('winterglass');
  });

  it('uses mode defaults when persisted settings are partial', () => {
    const next = validateSettings({ mode: 'winterglass' }, DEFAULT_SETTINGS);
    expect(next.mode).toBe('winterglass');
    expect(next.rainIntensity).toBe(0.12);
    expect(next.fogIntensity).toBe(0.52);
    expect(next.dropletDensity).toBe(0.24);
    expect(next.windAngle).toBe(-12);
    expect(next.animationSpeed).toBe(0.48);
  });

  it('keeps explicit slider values when validating a mode change', () => {
    const next = validateSettings(
      {
        mode: 'night-drive',
        rainIntensity: 0.44,
        fogIntensity: 0.31,
        dropletDensity: 0.22,
        windAngle: 14,
        animationSpeed: 0.91,
      },
      DEFAULT_SETTINGS,
    );

    expect(next.mode).toBe('night-drive');
    expect(next.rainIntensity).toBe(0.44);
    expect(next.fogIntensity).toBe(0.31);
    expect(next.dropletDensity).toBe(0.22);
    expect(next.windAngle).toBe(14);
    expect(next.animationSpeed).toBe(0.91);
  });
});
