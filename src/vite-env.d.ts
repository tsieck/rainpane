/// <reference types="vite/client" />

import type { PhotorealRefractionFrame, PhotorealRefractionStatus, Rect, WeatherSettings, WindowBounds } from './weather/types';

interface ActiveWindowState {
  bounds: WindowBounds | null;
  mask: Rect | null;
  error?: string;
  isMoving?: boolean;
}

interface RuntimeState {
  onBatteryPower: boolean;
  idleDeepeningActive: boolean;
  overlayEnabled: boolean;
  prefersReducedTransparency: boolean;
  shouldUseHighContrastColors: boolean;
  shouldDifferentiateWithoutColor: boolean;
  photorealRefractionStatus: PhotorealRefractionStatus;
}

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  tagName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  hasUpdate: boolean;
}

declare global {
  interface Window {
    rainpane?: {
      platform: string;
      view: 'overlay' | 'demo';
      photorealRefractionSupported: boolean;
      getSettings: () => Promise<WeatherSettings>;
      getActiveWindow: () => Promise<ActiveWindowState>;
      getRuntimeState: () => Promise<RuntimeState>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      updateSettings: (settings: WeatherSettings) => void;
      resetSettings: () => void;
      setOverlayVisible: (visible: boolean) => void;
      submitPhotorealRefractionFrame: (frame: PhotorealRefractionFrame) => void;
      openScreenRecordingSettings: () => void;
      onSettingsChanged: (callback: (settings: WeatherSettings) => void) => () => void;
      onActiveWindowChanged: (callback: (state: ActiveWindowState) => void) => () => void;
      onRuntimeChanged: (callback: (state: RuntimeState) => void) => () => void;
    };
  }
}

export {};
