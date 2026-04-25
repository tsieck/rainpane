export type WeatherMode = 'cozy-rain' | 'storm-lock-in' | 'night-drive' | 'greyglass';
export type DisplayMode = 'primary' | 'all';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowBounds extends Rect {
  title?: string;
  appName?: string;
  processName?: string;
  windowId?: number;
}

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
  debugMode: boolean;
  lightningEnabled: boolean;
  grainEnabled: boolean;
  fogAccumulationEnabled: boolean;
  coverFullScreen: boolean;
  fullRainWhileMoving: boolean;
  lockInDimmingEnabled: boolean;
  displayMode: DisplayMode;
}

export interface ModePreset {
  id: WeatherMode;
  label: string;
  description: string;
  settings: Pick<
    WeatherSettings,
    'rainIntensity' | 'fogIntensity' | 'dropletDensity' | 'windAngle' | 'animationSpeed'
  >;
  palette: {
    desktopA: string;
    desktopB: string;
    tint: string;
    shadow: string;
    panel: string;
    accent: string;
    rain: string;
    fog: string;
    lightning: string;
  };
}

export interface RainStreak {
  layer: 'far' | 'mid' | 'near';
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  drift: number;
  thickness: number;
  broken: boolean;
  seed: number;
}

export interface Droplet {
  kind: 'micro' | 'bead' | 'pane';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  opacity: number;
  age: number;
  lifetime: number;
  slideSpeed: number;
  driftX: number;
  wobble: number;
  seed: number;
  refraction: number;
  highlight: number;
}
