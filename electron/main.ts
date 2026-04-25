import { app, BrowserWindow, ipcMain, screen, type Display } from 'electron';
import { getActiveWindowBounds, mapWindowToDisplayMask, type ActiveWindowState } from './activeWindow.js';
import { isAccessibilityTrusted, openAccessibilitySettings, requestAccessibilityPermission } from './permissions.js';
import { registerShortcuts } from './shortcuts.js';
import { DEFAULT_SETTINGS, validateSettings, type WeatherSettings } from './settings.js';
import { loadSettings, saveSettings } from './settingsPersistence.js';
import { createRainpaneTray } from './tray.js';
import { createDemoWindow, createOverlayWindow } from './windows.js';

interface OverlayEntry {
  window: BrowserWindow;
  display: Display;
}

let overlayWindows: OverlayEntry[] = [];
let demoWindow: BrowserWindow | null = null;
let settings: WeatherSettings = DEFAULT_SETTINGS;
let trayController: ReturnType<typeof createRainpaneTray> | null = null;
let isQuitting = false;
let activeWindowBounds: ActiveWindowState['bounds'] = null;
let activeWindowError: string | undefined;
let activeWindowIsMoving = false;
let lastWindowIdentity = '';
let lastWindowGeometry = '';
let lastGeometryChangeAt = 0;
let activeWindowPoll: NodeJS.Timeout | null = null;
let saveSettingsTimer: NodeJS.Timeout | null = null;
const ACTIVE_WINDOW_POLL_MS = 125;

function liveWindows() {
  return [
    ...overlayWindows.map((entry) => entry.window),
    demoWindow,
  ].filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()));
}

function broadcastSettings() {
  for (const window of liveWindows()) {
    window.webContents.send('settings:changed', settings);
  }
  trayController?.refresh();
}

function broadcastActiveWindow() {
  for (const entry of overlayWindows) {
    if (!entry.window.isDestroyed()) {
      entry.window.webContents.send('active-window:changed', activeWindowStateForDisplay(entry.display));
    }
  }

  if (demoWindow && !demoWindow.isDestroyed()) {
    demoWindow.webContents.send('active-window:changed', activeWindowStateForDisplay(screen.getPrimaryDisplay()));
  }
}

function updateSettings(nextSettings: unknown) {
  const previousDisplayMode = settings.displayMode;
  settings = validateSettings(nextSettings, settings);
  scheduleSettingsSave();
  if (settings.displayMode !== previousDisplayMode) {
    syncOverlayWindows();
  }
  broadcastSettings();
  broadcastActiveWindow();
}

function scheduleSettingsSave() {
  if (saveSettingsTimer) {
    clearTimeout(saveSettingsTimer);
  }

  saveSettingsTimer = setTimeout(() => {
    saveSettingsTimer = null;
    void saveSettings(settings);
  }, 180);
}

function activeWindowStateForDisplay(display: Display): ActiveWindowState {
  return {
    bounds: activeWindowBounds,
    mask: mapWindowToDisplayMask(activeWindowBounds, display.bounds),
    error: activeWindowError,
    isMoving: activeWindowIsMoving,
  };
}

function targetDisplays() {
  return settings.displayMode === 'all' ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
}

function createOverlayForDisplay(display: Display) {
  const overlayWindow = createOverlayWindow(display);
  const entry: OverlayEntry = { window: overlayWindow, display };

  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow.webContents.send('settings:changed', settings);
    overlayWindow.webContents.send('active-window:changed', activeWindowStateForDisplay(display));
  });
  overlayWindow.on('closed', () => {
    overlayWindows = overlayWindows.filter((candidate) => candidate.window !== overlayWindow);
  });

  return entry;
}

function syncOverlayWindows() {
  const displays = targetDisplays();
  const desiredIds = new Set(displays.map((display) => display.id));

  for (const entry of overlayWindows) {
    if (!desiredIds.has(entry.display.id) && !entry.window.isDestroyed()) {
      entry.window.close();
    }
  }

  overlayWindows = overlayWindows.filter((entry) => desiredIds.has(entry.display.id) && !entry.window.isDestroyed());

  for (const display of displays) {
    const existing = overlayWindows.find((entry) => entry.display.id === display.id);
    if (existing) {
      existing.display = display;
      const { x, y, width, height } = display.bounds;
      existing.window.setBounds({ x, y, width, height });
      continue;
    }

    overlayWindows.push(createOverlayForDisplay(display));
  }
}

function ensureDemoWindow() {
  if (demoWindow && !demoWindow.isDestroyed()) {
    demoWindow.show();
    demoWindow.focus();
    return demoWindow;
  }

  demoWindow = createDemoWindow();
  demoWindow.webContents.once('did-finish-load', () => {
    demoWindow?.webContents.send('settings:changed', settings);
    demoWindow?.webContents.send('active-window:changed', activeWindowStateForDisplay(screen.getPrimaryDisplay()));
  });
  demoWindow.on('closed', () => {
    demoWindow = null;
  });

  return demoWindow;
}

function toggleOverlay() {
  syncOverlayWindows();
  const visible = overlayWindows.some((entry) => entry.window.isVisible());
  if (visible) {
    for (const entry of overlayWindows) {
      entry.window.hide();
    }
  } else {
    for (const entry of overlayWindows) {
      entry.window.showInactive();
    }
  }
  trayController?.refresh();
}

function setOverlayVisible(visible: boolean) {
  syncOverlayWindows();
  for (const entry of overlayWindows) {
    if (visible) {
      entry.window.showInactive();
    } else {
      entry.window.hide();
    }
  }
  trayController?.refresh();
}

async function pollActiveWindow() {
  try {
    const bounds = await getActiveWindowBounds();
    const identity = bounds
      ? `${bounds.appName ?? ''}:${bounds.processName ?? ''}:${bounds.windowId ?? bounds.title ?? ''}`
      : 'null';
    const geometry = bounds ? `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}` : 'null';
    const now = Date.now();

    if (identity !== lastWindowIdentity) {
      lastWindowIdentity = identity;
      lastWindowGeometry = geometry;
      lastGeometryChangeAt = 0;
    } else if (geometry !== lastWindowGeometry) {
      lastWindowGeometry = geometry;
      lastGeometryChangeAt = now;
    }

    const nextIsMoving = Boolean(bounds && lastGeometryChangeAt > 0 && now - lastGeometryChangeAt < 700);
    const changed =
      JSON.stringify(bounds) !== JSON.stringify(activeWindowBounds) ||
      nextIsMoving !== activeWindowIsMoving ||
      activeWindowError !== undefined;

    activeWindowBounds = bounds;
    activeWindowError = undefined;
    activeWindowIsMoving = nextIsMoving;

    if (changed) {
      broadcastActiveWindow();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Active window detection failed';
    const changed = activeWindowBounds !== null || activeWindowError !== message || activeWindowIsMoving;
    activeWindowBounds = null;
    activeWindowError = message;
    activeWindowIsMoving = false;

    if (changed) {
      broadcastActiveWindow();
    }
  }
}

function startActiveWindowPolling() {
  if (activeWindowPoll) {
    return;
  }

  void pollActiveWindow();
  activeWindowPoll = setInterval(() => {
    void pollActiveWindow();
  }, ACTIVE_WINDOW_POLL_MS);
}

function createApplication() {
  syncOverlayWindows();
  ensureDemoWindow();

  trayController = createRainpaneTray(() => ({
    showOverlay: overlayWindows.some((entry) => entry.window.isVisible()),
    rainEnabled: settings.rainEnabled,
    fogEnabled: settings.fogEnabled,
    debugMode: settings.debugMode,
    lightningEnabled: settings.lightningEnabled,
    coverFullScreen: settings.coverFullScreen,
    displayMode: settings.displayMode,
    accessibilityTrusted: isAccessibilityTrusted(),
    toggleOverlay,
    toggleRain: () => updateSettings({ ...settings, rainEnabled: !settings.rainEnabled }),
    toggleFog: () => updateSettings({ ...settings, fogEnabled: !settings.fogEnabled }),
    toggleDebug: () => updateSettings({ ...settings, debugMode: !settings.debugMode }),
    toggleLightning: () => updateSettings({ ...settings, lightningEnabled: !settings.lightningEnabled }),
    toggleCoverFullScreen: () => updateSettings({ ...settings, coverFullScreen: !settings.coverFullScreen }),
    setDisplayMode: (displayMode) => updateSettings({ ...settings, displayMode }),
    requestAccessibility: () => {
      requestAccessibilityPermission();
      openAccessibilitySettings();
      trayController?.refresh();
    },
    openDemo: ensureDemoWindow,
    quit: () => {
      isQuitting = true;
      app.quit();
    },
  }));

  registerShortcuts({
    toggleOverlay,
    toggleFog: () => updateSettings({ ...settings, fogEnabled: !settings.fogEnabled }),
    openDemo: ensureDemoWindow,
  });

  startActiveWindowPolling();

  if (process.platform === 'darwin') {
    requestAccessibilityPermission();
  }
}

app.setName('Rainpane');

ipcMain.handle('settings:get', () => settings);
ipcMain.on('settings:update', (_event, nextSettings: unknown) => {
  updateSettings(nextSettings);
});
ipcMain.on('settings:reset', () => {
  updateSettings(DEFAULT_SETTINGS);
});
ipcMain.on('overlay:set-visible', (_event, visible: unknown) => {
  if (typeof visible === 'boolean') {
    setOverlayVisible(visible);
  }
});
ipcMain.handle('active-window:get', () => activeWindowStateForDisplay(screen.getPrimaryDisplay()));

app.whenReady().then(async () => {
  settings = await loadSettings();
  createApplication();

  app.on('activate', () => {
    ensureDemoWindow();
    syncOverlayWindows();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (activeWindowPoll) {
    clearInterval(activeWindowPoll);
    activeWindowPoll = null;
  }
  if (saveSettingsTimer) {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = null;
  }
  void saveSettings(settings);
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
});
