/// <reference types="vite/client" />

import type { Rect, WeatherSettings, WindowBounds } from './weather/types';

interface ActiveWindowState {
  bounds: WindowBounds | null;
  mask: Rect | null;
  error?: string;
  isMoving?: boolean;
}

interface RuntimeState {
  onBatteryPower: boolean;
  idleDeepeningActive: boolean;
}

declare global {
  interface Window {
    rainpane?: {
      platform: string;
      view: 'overlay' | 'demo';
      getSettings: () => Promise<WeatherSettings>;
      getActiveWindow: () => Promise<ActiveWindowState>;
      getRuntimeState: () => Promise<RuntimeState>;
      updateSettings: (settings: WeatherSettings) => void;
      resetSettings: () => void;
      setOverlayVisible: (visible: boolean) => void;
      onSettingsChanged: (callback: (settings: WeatherSettings) => void) => () => void;
      onActiveWindowChanged: (callback: (state: ActiveWindowState) => void) => () => void;
      onRuntimeChanged: (callback: (state: RuntimeState) => void) => () => void;
    };
  }
}

export {};
