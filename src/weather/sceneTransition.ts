import { MODE_PRESETS } from '../state/settingsStore';
import type { ModePreset, WeatherSettings } from './types';

export const SCENE_TRANSITION_MS = 900;
const WEATHER_VALUES = ['rainIntensity', 'fogIntensity', 'windAngle', 'animationSpeed'] as const;
type Palette = ModePreset['palette'];
type Color = [number, number, number, number];

// Preset palettes use six-digit hex and rgba colors. Parsing happens on retarget, not per frame.
function color(value: string): Color {
  if (value.startsWith('#')) return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), 1];
  const channels = value.match(/[\d.]+/g)!.map(Number);
  return [channels[0], channels[1], channels[2], channels[3] ?? 1];
}

interface SceneFrame { settings: WeatherSettings; preset: ModePreset; active: boolean; }

export class SceneTransition {
  private target: WeatherSettings | null = null;
  private from: SceneFrame | null = null;
  private started = 0;
  private colors: { key: keyof Palette; from: Color; to: Color }[] = [];

  sample(requested: WeatherSettings, now: number): SceneFrame {
    if (!this.target || requested.reducedMotion) {
      this.target = requested;
      this.from = null;
    } else if (requested.mode !== this.target.mode) {
      this.from = this.render(now);
      this.started = now;
      this.colors = (Object.keys(this.from.preset.palette) as (keyof Palette)[]).map((key) => ({
        key, from: color(this.from!.preset.palette[key]), to: color(MODE_PRESETS[requested.mode].palette[key]),
      }));
      this.target = requested;
    } else {
      // Sliders and switches remain responsive even while a scene is settling.
      if (this.from) {
        const settings = { ...this.from.settings };
        for (const key of WEATHER_VALUES) {
          if (requested[key] !== this.target[key]) settings[key] = requested[key];
        }
        this.from = { ...this.from, settings };
      }
      this.target = requested;
    }
    return this.render(now);
  }

  private render(now: number): SceneFrame {
    const target = this.target!;
    const preset = MODE_PRESETS[target.mode];
    const t = Math.max(0, Math.min(1, (now - this.started) / SCENE_TRANSITION_MS));
    if (!this.from || t === 1) {
      this.from = null;
      return { settings: target, preset, active: false };
    }
    const blend = t * t * (3 - 2 * t);
    const settings = { ...target };
    for (const key of WEATHER_VALUES) settings[key] = this.from.settings[key] + (target[key] - this.from.settings[key]) * blend;
    const palette = { ...preset.palette };
    for (const entry of this.colors) {
      const channels = entry.from.map((value, i) => value + (entry.to[i] - value) * blend);
      palette[entry.key] = `rgba(${channels[0].toFixed(2)}, ${channels[1].toFixed(2)}, ${channels[2].toFixed(2)}, ${channels[3].toFixed(4)})`;
    }
    return { settings, preset: { ...preset, palette }, active: true };
  }
}
