import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MODE_PRESETS } from '../state/settingsStore';
import { SceneTransition, SCENE_TRANSITION_MS } from './sceneTransition';
import type { WeatherMode } from './types';

const scene = (mode: WeatherMode) => ({ ...DEFAULT_SETTINGS, ...MODE_PRESETS[mode].settings, mode });

describe('scene continuity', () => {
  it('blends weather strength but keeps density and switches discrete to preserve caches and controls', () => {
    const transition = new SceneTransition();
    const cozy = scene('cozy-rain');
    const storm = scene('storm-lock-in');
    expect(transition.sample(cozy, 0).active).toBe(false);
    const start = transition.sample(storm, 10);
    expect(start.settings.rainIntensity).toBe(cozy.rainIntensity);
    expect(start.settings.dropletDensity).toBe(storm.dropletDensity);
    const middle = transition.sample(storm, 10 + SCENE_TRANSITION_MS / 2);
    expect(middle.settings.fogIntensity).toBeCloseTo((cozy.fogIntensity + storm.fogIntensity) / 2);
    expect(middle.preset.palette.fog).not.toBe(MODE_PRESETS['storm-lock-in'].palette.fog);
    const end = transition.sample(storm, 10 + SCENE_TRANSITION_MS);
    expect(end.settings).toBe(storm);
    expect(end.preset).toBe(MODE_PRESETS['storm-lock-in']);
    expect(end.active).toBe(false);
  });

  it('retargets from the visible scene during rapid changes instead of jumping back', () => {
    const transition = new SceneTransition();
    transition.sample(scene('cozy-rain'), 0);
    transition.sample(scene('storm-lock-in'), 10);
    const before = transition.sample(scene('storm-lock-in'), 310);
    const after = transition.sample(scene('night-drive'), 310);
    expect(after.settings.fogIntensity).toBe(before.settings.fogIntensity);
    expect(after.preset.palette.fog).toBe(before.preset.palette.fog);
  });

  it('applies sliders, toggles and reduced motion immediately, including mid-transition', () => {
    const transition = new SceneTransition();
    transition.sample(scene('cozy-rain'), 0);
    transition.sample(scene('night-drive'), 10);
    const tuned = { ...scene('night-drive'), fogIntensity: 0.9, rainEnabled: false };
    const frame = transition.sample(tuned, 110);
    expect(frame.settings.fogIntensity).toBe(0.9);
    expect(frame.settings.rainEnabled).toBe(false);
    const still = { ...scene('winterglass'), reducedMotion: true };
    expect(transition.sample(still, 120)).toEqual({ settings: still, preset: MODE_PRESETS.winterglass, active: false });
  });
});
