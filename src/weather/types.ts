export type WeatherMode = 'cozy-rain' | 'storm-lock-in' | 'night-drive' | 'greyglass' | 'winterglass';
export type DisplayMode = 'primary' | 'all';
export type WeatherIntensity = 'mist' | 'rain' | 'downpour' | 'frosted';
export type PhotorealRefractionStatus =
  | 'off'
  | 'paused'
  | 'starting'
  | 'live'
  | 'permission-needed'
  | 'unsupported'
  | 'error';

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
  photorealRefractionEnabled: boolean;
  displayMode: DisplayMode;
  renderBudget?: 'standard' | 'conservative';
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

export interface RainSplash {
  x: number;
  y: number;
  age: number;
  lifetime: number;
  radius: number;
  height: number;
  opacity: number;
  seed: number;
}

export interface SnowFlake {
  layer: 'far' | 'mid' | 'near';
  shape: 'speck' | 'crystal';
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  opacity: number;
  wobble: number;
  seed: number;
}

export interface EdgeRunoffDrop {
  side: 'left' | 'right' | 'top';
  t: number;
  offset: number;
  age: number;
  lifetime: number;
  speed: number;
  radius: number;
  opacity: number;
  trail: number;
  seed: number;
}

export interface Droplet {
  id: number;
  kind: 'micro' | 'bead' | 'pane';
  state: 'pinned' | 'creeping' | 'running';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  radiusX: number;
  radiusY: number;
  opacity: number;
  age: number;
  lifetime: number;
  velocityX: number;
  velocityY: number;
  mass: number;
  pinning: number;
  hold: number;
  runAge: number;
  mergePulse: number;
  seed: number;
  refraction: number;
  highlight: number;
}

export interface PhotorealRefractionDroplet {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  opacity: number;
  refraction: number;
  seed: number;
}

export interface PhotorealRefractionFrame {
  viewport: { width: number; height: number };
  protectedMask: Rect | null;
  droplets: PhotorealRefractionDroplet[];
}
