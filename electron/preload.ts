import { contextBridge, ipcRenderer } from 'electron';
import type { ActiveWindowState } from './activeWindow.js';
import type { WeatherSettings } from './settings.js';

type SettingsListener = (settings: WeatherSettings) => void;
type ActiveWindowListener = (state: ActiveWindowState) => void;
type RuntimeState = { onBatteryPower: boolean; idleDeepeningActive: boolean };
type RuntimeListener = (state: RuntimeState) => void;
type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  tagName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  hasUpdate: boolean;
};

const view = new URL(globalThis.location.href).searchParams.get('view') === 'overlay' ? 'overlay' : 'demo';

contextBridge.exposeInMainWorld('rainpane', {
  platform: process.platform,
  view,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<WeatherSettings>,
  getActiveWindow: () => ipcRenderer.invoke('active-window:get') as Promise<ActiveWindowState>,
  getRuntimeState: () => ipcRenderer.invoke('runtime:get') as Promise<RuntimeState>,
  checkForUpdates: () => ipcRenderer.invoke('updates:check') as Promise<UpdateCheckResult>,
  updateSettings: (settings: WeatherSettings) => ipcRenderer.send('settings:update', settings),
  resetSettings: () => ipcRenderer.send('settings:reset'),
  setOverlayVisible: (visible: boolean) => ipcRenderer.send('overlay:set-visible', visible),
  onSettingsChanged: (callback: SettingsListener) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: WeatherSettings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },
  onActiveWindowChanged: (callback: ActiveWindowListener) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ActiveWindowState) => callback(state);
    ipcRenderer.on('active-window:changed', listener);
    return () => ipcRenderer.removeListener('active-window:changed', listener);
  },
  onRuntimeChanged: (callback: RuntimeListener) => {
    const listener = (_event: Electron.IpcRendererEvent, state: RuntimeState) => callback(state);
    ipcRenderer.on('runtime:changed', listener);
    return () => ipcRenderer.removeListener('runtime:changed', listener);
  },
});
