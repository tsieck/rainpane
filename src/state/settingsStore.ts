import type { ModePreset, WeatherMode, WeatherSettings } from '../weather/types';

export const MODE_PRESETS: Record<WeatherMode, ModePreset> = {
  'cozy-rain': {
    id: 'cozy-rain',
    label: 'Cozy Rain',
    description: 'Soft rain, low haze, calm movement.',
    settings: {
      rainIntensity: 0.42,
      fogIntensity: 0.28,
      dropletDensity: 0.34,
      windAngle: -10,
      animationSpeed: 0.78,
    },
    palette: {
      desktopA: '#28383b',
      desktopB: '#6c7972',
      tint: 'rgba(125, 150, 146, 0.55)',
      shadow: 'rgba(21, 31, 29, 0.34)',
      panel: '#132022',
      accent: '#9fc6c1',
      rain: 'rgba(205, 230, 232, 0.92)',
      fog: 'rgba(205, 225, 220, 0.8)',
      lightning: 'rgba(235, 248, 242, 0.9)',
    },
  },
  'storm-lock-in': {
    id: 'storm-lock-in',
    label: 'Storm Lock-in',
    description: 'Heavy weather with stronger contrast.',
    settings: {
      rainIntensity: 0.95,
      fogIntensity: 0.64,
      dropletDensity: 0.68,
      windAngle: -24,
      animationSpeed: 1.12,
    },
    palette: {
      desktopA: '#111922',
      desktopB: '#39454a',
      tint: 'rgba(22, 32, 42, 0.72)',
      shadow: 'rgba(3, 8, 13, 0.62)',
      panel: '#0c1319',
      accent: '#8fb0c8',
      rain: 'rgba(205, 226, 238, 0.96)',
      fog: 'rgba(155, 177, 190, 0.9)',
      lightning: 'rgba(204, 226, 247, 0.9)',
    },
  },
  'night-drive': {
    id: 'night-drive',
    label: 'Night Drive',
    description: 'Blue-grey glass and quick diagonal streaks.',
    settings: {
      rainIntensity: 0.76,
      fogIntensity: 0.46,
      dropletDensity: 0.5,
      windAngle: -34,
      animationSpeed: 1.0,
    },
    palette: {
      desktopA: '#0e1720',
      desktopB: '#223549',
      tint: 'rgba(18, 32, 48, 0.72)',
      shadow: 'rgba(4, 9, 18, 0.56)',
      panel: '#0c141d',
      accent: '#8ab8df',
      rain: 'rgba(178, 216, 244, 0.94)',
      fog: 'rgba(116, 154, 182, 0.82)',
      lightning: 'rgba(157, 197, 235, 0.7)',
    },
  },
  greyglass: {
    id: 'greyglass',
    label: 'Greyglass',
    description: 'Minimal color, slow droplets, premium haze.',
    settings: {
      rainIntensity: 0.32,
      fogIntensity: 0.52,
      dropletDensity: 0.42,
      windAngle: -6,
      animationSpeed: 0.58,
    },
    palette: {
      desktopA: '#303536',
      desktopB: '#7b817d',
      tint: 'rgba(172, 180, 176, 0.5)',
      shadow: 'rgba(28, 31, 31, 0.38)',
      panel: '#1b2020',
      accent: '#c9d3cf',
      rain: 'rgba(225, 232, 230, 0.82)',
      fog: 'rgba(225, 230, 226, 0.88)',
      lightning: 'rgba(245, 247, 245, 0.8)',
    },
  },
};

export const DEFAULT_SETTINGS: WeatherSettings = {
  mode: 'cozy-rain',
  rainEnabled: true,
  fogEnabled: true,
  dropletsEnabled: true,
  reducedMotion: false,
  debugMode: false,
  lightningEnabled: false,
  grainEnabled: true,
  fogAccumulationEnabled: true,
  coverFullScreen: false,
  fullRainWhileMoving: true,
  lockInDimmingEnabled: true,
  displayMode: 'primary',
  ...MODE_PRESETS['cozy-rain'].settings,
};

export function applyMode(settings: WeatherSettings, mode: WeatherMode): WeatherSettings {
  return {
    ...settings,
    mode,
    ...MODE_PRESETS[mode].settings,
  };
}
