export type WeatherMode = 'cozy-rain' | 'storm-lock-in' | 'night-drive' | 'greyglass' | 'winterglass';
export type DisplayMode = 'primary' | 'all';
export type WeatherIntensity = 'mist' | 'rain' | 'downpour' | 'frosted';

export interface WeatherSettings {
  mode: WeatherMode;
  rainIntensity: number;
  fogIntensity: number;
  dropletDensity: number;
  windAngle: number;
  animationSpeed: number;
  rainEnabled: boolean;
  fogEnabled: boolean;
  dropletsEnabled: boolean;
  reducedMotion: boolean;
  lowPowerMode: boolean;
  autoLowPower: boolean;
  debugMode: boolean;
  lightningEnabled: boolean;
  grainEnabled: boolean;
  fogAccumulationEnabled: boolean;
  coverFullScreen: boolean;
  fullRainWhileMoving: boolean;
  lockInDimmingEnabled: boolean;
  idleDeepeningEnabled: boolean;
  displayMode: DisplayMode;
}

export const DEFAULT_SETTINGS: WeatherSettings = {
  mode: 'cozy-rain',
  rainEnabled: true,
  fogEnabled: true,
  dropletsEnabled: true,
  reducedMotion: false,
  lowPowerMode: true,
  autoLowPower: true,
  debugMode: false,
  lightningEnabled: false,
  grainEnabled: true,
  fogAccumulationEnabled: true,
  coverFullScreen: false,
  fullRainWhileMoving: true,
  lockInDimmingEnabled: true,
  idleDeepeningEnabled: true,
  displayMode: 'primary',
  rainIntensity: 0.38,
  fogIntensity: 0.24,
  dropletDensity: 0.3,
  windAngle: -8,
  animationSpeed: 0.72,
};

export const MODE_DEFAULTS: Record<
  WeatherMode,
  Pick<WeatherSettings, 'rainIntensity' | 'fogIntensity' | 'dropletDensity' | 'windAngle' | 'animationSpeed'>
> = {
  'cozy-rain': {
    rainIntensity: 0.38,
    fogIntensity: 0.24,
    dropletDensity: 0.3,
    windAngle: -8,
    animationSpeed: 0.72,
  },
  'storm-lock-in': {
    rainIntensity: 0.95,
    fogIntensity: 0.7,
    dropletDensity: 0.72,
    windAngle: -28,
    animationSpeed: 1.16,
  },
  'night-drive': {
    rainIntensity: 0.8,
    fogIntensity: 0.42,
    dropletDensity: 0.54,
    windAngle: -38,
    animationSpeed: 1.04,
  },
  greyglass: {
    rainIntensity: 0.26,
    fogIntensity: 0.58,
    dropletDensity: 0.38,
    windAngle: -6,
    animationSpeed: 0.54,
  },
  winterglass: {
    rainIntensity: 0.12,
    fogIntensity: 0.52,
    dropletDensity: 0.24,
    windAngle: -12,
    animationSpeed: 0.48,
  },
};

const MODES = new Set<WeatherMode>(['cozy-rain', 'storm-lock-in', 'night-drive', 'greyglass', 'winterglass']);
const DISPLAY_MODES = new Set<DisplayMode>(['primary', 'all']);

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export function validateSettings(input: unknown, current: WeatherSettings): WeatherSettings {
  if (!input || typeof input !== 'object') {
    return current;
  }

  const candidate = input as Partial<WeatherSettings>;
  const mode = candidate.mode && MODES.has(candidate.mode) ? candidate.mode : current.mode;
  const numericBase = mode === current.mode ? current : { ...current, ...MODE_DEFAULTS[mode] };

  return {
    mode,
    rainEnabled: typeof candidate.rainEnabled === 'boolean' ? candidate.rainEnabled : current.rainEnabled,
    fogEnabled: typeof candidate.fogEnabled === 'boolean' ? candidate.fogEnabled : current.fogEnabled,
    dropletsEnabled: typeof candidate.dropletsEnabled === 'boolean' ? candidate.dropletsEnabled : current.dropletsEnabled,
    reducedMotion: typeof candidate.reducedMotion === 'boolean' ? candidate.reducedMotion : current.reducedMotion,
    lowPowerMode: typeof candidate.lowPowerMode === 'boolean' ? candidate.lowPowerMode : current.lowPowerMode,
    autoLowPower: typeof candidate.autoLowPower === 'boolean' ? candidate.autoLowPower : current.autoLowPower,
    debugMode: typeof candidate.debugMode === 'boolean' ? candidate.debugMode : current.debugMode,
    lightningEnabled: typeof candidate.lightningEnabled === 'boolean' ? candidate.lightningEnabled : current.lightningEnabled,
    grainEnabled: typeof candidate.grainEnabled === 'boolean' ? candidate.grainEnabled : current.grainEnabled,
    fogAccumulationEnabled:
      typeof candidate.fogAccumulationEnabled === 'boolean'
        ? candidate.fogAccumulationEnabled
        : current.fogAccumulationEnabled,
    coverFullScreen: typeof candidate.coverFullScreen === 'boolean' ? candidate.coverFullScreen : current.coverFullScreen,
    fullRainWhileMoving:
      typeof candidate.fullRainWhileMoving === 'boolean' ? candidate.fullRainWhileMoving : current.fullRainWhileMoving,
    lockInDimmingEnabled:
      typeof candidate.lockInDimmingEnabled === 'boolean'
        ? candidate.lockInDimmingEnabled
        : current.lockInDimmingEnabled,
    idleDeepeningEnabled:
      typeof candidate.idleDeepeningEnabled === 'boolean'
        ? candidate.idleDeepeningEnabled
        : current.idleDeepeningEnabled,
    displayMode:
      candidate.displayMode && DISPLAY_MODES.has(candidate.displayMode) ? candidate.displayMode : current.displayMode,
    rainIntensity: clamp(candidate.rainIntensity, 0, 1, numericBase.rainIntensity),
    fogIntensity: clamp(candidate.fogIntensity, 0, 1, numericBase.fogIntensity),
    dropletDensity: clamp(candidate.dropletDensity, 0, 1, numericBase.dropletDensity),
    windAngle: clamp(candidate.windAngle, -75, 75, numericBase.windAngle),
    animationSpeed: clamp(candidate.animationSpeed, 0.25, 1.5, numericBase.animationSpeed),
  };
}
