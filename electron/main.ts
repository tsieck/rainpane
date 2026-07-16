import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  nativeTheme,
  powerMonitor,
  screen,
  shell,
  type Display,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { getActiveWindowBounds, mapWindowToDisplayMask, type ActiveWindowState } from './activeWindow.js';
import {
  AVAILABLE_CAPTURE_STATE,
  reduceCaptureAvailability,
  systemAllowsCapture,
  type CaptureAvailabilityEvent,
} from './captureAvailability.js';
import {
  isAccessibilityTrusted,
  openAccessibilitySettings,
  openScreenRecordingSettings,
  requestAccessibilityPermission,
} from './permissions.js';
import {
  isAuthorizedRainpaneIpcSender,
  type RainpaneRendererTarget,
} from './ipcAuthorization.js';
import {
  getPhotorealRefractionDisplayIdForSender,
  getPhotorealRefractionStatusForDisplay,
  PhotorealRefractionManager,
  type PhotorealRefractionStatus,
} from './photorealRefraction.js';
import { parsePhotorealRefractionFrame } from './refractionFrame.js';
import { registerShortcuts } from './shortcuts.js';
import { DEFAULT_SETTINGS, MODE_DEFAULTS, validateSettings, type WeatherSettings } from './settings.js';
import { loadSettings, saveSettings } from './settingsPersistence.js';
import { createRainpaneTray } from './tray.js';
import { checkForGitHubUpdate, type UpdateCheckResult } from './updates.js';
import { applyOverlayDisplayBounds, createDemoWindow, createOverlayWindow } from './windows.js';

interface OverlayEntry {
  window: BrowserWindow;
  display: Display;
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

type NativeThemeWithDifferentiateWithoutColor = typeof nativeTheme & {
  shouldDifferentiateWithoutColor?: boolean;
};

let overlayWindows: OverlayEntry[] = [];
let demoWindow: BrowserWindow | null = null;
let demoOpening = false;
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
let runtimeMonitor: NodeJS.Timeout | null = null;
let overlayEnabled = true;
let captureAvailability = AVAILABLE_CAPTURE_STATE;
const ACTIVE_WINDOW_POLL_MS = 250;
const IDLE_DEEPENING_SECONDS = 90;
const INTENSITY_PRESETS = {
  mist: { rainIntensity: 0.18, fogIntensity: 0.22, dropletDensity: 0.18, animationSpeed: 0.56 },
  rain: { rainIntensity: 0.42, fogIntensity: 0.34, dropletDensity: 0.34, animationSpeed: 0.78 },
  downpour: { rainIntensity: 0.82, fogIntensity: 0.58, dropletDensity: 0.64, animationSpeed: 1.08 },
  frosted: { rainIntensity: 0.24, fogIntensity: 0.78, dropletDensity: 0.48, animationSpeed: 0.62 },
} satisfies Record<
  'mist' | 'rain' | 'downpour' | 'frosted',
  Pick<WeatherSettings, 'rainIntensity' | 'fogIntensity' | 'dropletDensity' | 'animationSpeed'>
>;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const refractionManager = new PhotorealRefractionManager({
  onStatusChange: () => broadcastRuntimeState(),
  onHelperLog: (displayId, stream, message) => {
    const logger = stream === 'stderr' ? console.warn : console.info;
    logger(`[photoreal refraction · display ${displayId}] ${message}`);
  },
});

if (!gotSingleInstanceLock) {
  app.exit(0);
}

function liveWindows() {
  return [
    ...overlayWindows.map((entry) => entry.window),
    demoWindow,
  ].filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()));
}

function isAuthorizedRendererSender(
  event: Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  view: RainpaneRendererTarget['view'],
) {
  const targets: RainpaneRendererTarget[] = view === 'demo'
    ? demoWindow && !demoWindow.isDestroyed()
      ? [{ senderId: demoWindow.webContents.id, view: 'demo' }]
      : []
    : overlayWindows
      .filter((entry) => !entry.window.isDestroyed())
      .map((entry) => ({
        senderId: entry.window.webContents.id,
        view: 'overlay',
        displayId: String(entry.display.id),
      }));
  const senderFrame = event.senderFrame;

  return isAuthorizedRainpaneIpcSender({
    senderId: event.sender.id,
    frameUrl: senderFrame?.url ?? '',
    isMainFrame: Boolean(senderFrame && senderFrame === event.sender.mainFrame),
  }, targets, {
    appPath: app.getAppPath(),
    devServerUrl: process.env.VITE_DEV_SERVER_URL,
  });
}

function isAuthorizedRainpaneRenderer(
  event: Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
) {
  return isAuthorizedRendererSender(event, 'demo') || isAuthorizedRendererSender(event, 'overlay');
}

function rejectUnauthorizedIpcSender(): never {
  throw new Error('Unauthorized Rainpane IPC sender');
}

function activateRainpane() {
  if (process.platform === 'darwin') {
    app.dock?.show();
    app.focus({ steal: true });
  }
}

function broadcastSettings() {
  for (const window of liveWindows()) {
    window.webContents.send('settings:changed', settings);
  }
  trayController?.refresh();
}

function currentRuntimeState(displayId?: number): RuntimeState {
  const refractionState = refractionManager.getState();
  return {
    onBatteryPower: powerMonitor.isOnBatteryPower(),
    idleDeepeningActive: powerMonitor.getSystemIdleTime() >= IDLE_DEEPENING_SECONDS,
    overlayEnabled,
    prefersReducedTransparency: nativeTheme.prefersReducedTransparency,
    shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
    shouldDifferentiateWithoutColor: Boolean(
      (nativeTheme as NativeThemeWithDifferentiateWithoutColor).shouldDifferentiateWithoutColor,
    ),
    photorealRefractionStatus: getPhotorealRefractionStatusForDisplay(refractionState, displayId),
  };
}

function broadcastRuntimeState() {
  for (const entry of overlayWindows) {
    if (!entry.window.isDestroyed()) {
      entry.window.webContents.send('runtime:changed', currentRuntimeState(entry.display.id));
    }
  }

  if (demoWindow && !demoWindow.isDestroyed()) {
    demoWindow.webContents.send('runtime:changed', currentRuntimeState());
  }
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
  syncPhotorealRefraction();
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
    mask: mapWindowToDisplayMask(activeWindowBounds, display.bounds, display.nativeOrigin),
    error: activeWindowError,
    isMoving: activeWindowIsMoving,
  };
}

function isRainpaneWindow(bounds: ActiveWindowState['bounds']) {
  if (!bounds) {
    return false;
  }

  const appName = bounds.appName?.toLowerCase() ?? '';
  const processName = bounds.processName?.toLowerCase() ?? '';
  const title = bounds.title?.toLowerCase() ?? '';

  return appName === 'rainpane' || processName === 'rainpane' || title === 'rainpane' || title === 'rainpane demo';
}

function clearActiveWindowMask() {
  const changed = activeWindowBounds !== null || activeWindowError !== undefined || activeWindowIsMoving;
  activeWindowBounds = null;
  activeWindowError = undefined;
  activeWindowIsMoving = false;
  lastWindowIdentity = 'rainpane';
  lastWindowGeometry = 'null';
  lastGeometryChangeAt = 0;

  if (changed) {
    broadcastActiveWindow();
  }
}

function targetDisplays() {
  return settings.displayMode === 'all' ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
}

function demoHasFocus() {
  return demoOpening || Boolean(demoWindow && !demoWindow.isDestroyed() && demoWindow.isFocused());
}

function shouldShowOverlay() {
  return overlayEnabled && !demoHasFocus();
}

function syncPhotorealRefraction() {
  if (isQuitting) {
    refractionManager.stop();
    return;
  }

  refractionManager.sync({
    enabled: settings.photorealRefractionEnabled && overlayEnabled,
    visible: shouldShowOverlay() && systemAllowsCapture(captureAvailability),
    overlays: overlayWindows,
  });
}

function applyOverlayVisibility() {
  const visible = shouldShowOverlay();
  for (const entry of overlayWindows) {
    if (entry.window.isDestroyed()) {
      continue;
    }

    if (visible) {
      entry.window.showInactive();
    } else {
      entry.window.hide();
    }
  }
  syncPhotorealRefraction();
  trayController?.refresh();
}

function createOverlayForDisplay(display: Display) {
  const overlayWindow = createOverlayWindow(display, false);
  const entry: OverlayEntry = { window: overlayWindow, display };

  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow.webContents.send('settings:changed', settings);
    overlayWindow.webContents.send('runtime:changed', currentRuntimeState(entry.display.id));
    overlayWindow.webContents.send('active-window:changed', activeWindowStateForDisplay(display));
  });
  overlayWindow.once('ready-to-show', () => {
    if (shouldShowOverlay()) {
      overlayWindow.showInactive();
    } else {
      overlayWindow.hide();
    }
    trayController?.refresh();
  });
  overlayWindow.on('closed', () => {
    overlayWindows = overlayWindows.filter((candidate) => candidate.window !== overlayWindow);
    syncPhotorealRefraction();
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
      applyOverlayDisplayBounds(existing.window, display);
      continue;
    }

    overlayWindows.push(createOverlayForDisplay(display));
  }
  syncPhotorealRefraction();
}

function ensureDemoWindow() {
  if (demoWindow && !demoWindow.isDestroyed()) {
    demoWindow.show();
    activateRainpane();
    demoWindow.focus();
    return demoWindow;
  }

  demoWindow = createDemoWindow();
  demoOpening = true;
  demoWindow.webContents.once('did-finish-load', () => {
    demoWindow?.webContents.send('settings:changed', settings);
    demoWindow?.webContents.send('runtime:changed', currentRuntimeState());
    demoWindow?.webContents.send('active-window:changed', activeWindowStateForDisplay(screen.getPrimaryDisplay()));
  });
  demoWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    demoWindow?.hide();
    applyOverlayVisibility();
  });

  demoWindow.on('closed', () => {
    demoWindow = null;
    demoOpening = false;
    applyOverlayVisibility();
  });
  demoWindow.on('focus', () => {
    applyOverlayVisibility();
  });
  demoWindow.on('blur', () => {
    applyOverlayVisibility();
  });
  demoWindow.once('ready-to-show', () => {
    demoOpening = false;
    activateRainpane();
    demoWindow?.focus();
    applyOverlayVisibility();
  });

  return demoWindow;
}

function toggleOverlay() {
  syncOverlayWindows();
  overlayEnabled = !overlayEnabled;
  applyOverlayVisibility();
  broadcastRuntimeState();
}

function setOverlayVisible(visible: boolean) {
  syncOverlayWindows();
  overlayEnabled = visible;
  applyOverlayVisibility();
  broadcastRuntimeState();
}

async function checkForUpdates(showCurrentDialog = true): Promise<UpdateCheckResult> {
  const result = await checkForGitHubUpdate(app.getVersion(), process.platform, process.arch);

  if (result.hasUpdate) {
    const detail = [
      `Installed: ${result.currentVersion}`,
      `Latest: ${result.tagName ?? result.latestVersion ?? 'Unknown'}`,
      result.assetName ? `Download: ${result.assetName}` : 'Open the GitHub release to choose a download.',
      process.platform === 'darwin'
        ? 'After downloading, replace Rainpane in Applications.'
        : 'After downloading, extract the ZIP and run the new Rainpane.exe.',
    ].join('\n');

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Rainpane Update Available',
      message: 'A new Rainpane release is available.',
      detail,
      buttons: ['Download Update', 'View Release', 'Later'],
      defaultId: 0,
      cancelId: 2,
    });

    if (response === 0 && result.downloadUrl) {
      await shell.openExternal(result.downloadUrl);
    } else if (response === 1 && result.releaseUrl) {
      await shell.openExternal(result.releaseUrl);
    }

    return result;
  }

  if (showCurrentDialog) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Rainpane Is Up to Date',
      message: 'Rainpane is up to date.',
      detail: `Installed: ${result.currentVersion}${result.tagName ? `\nLatest: ${result.tagName}` : ''}`,
      buttons: ['OK'],
    });
  }

  return result;
}

async function showUpdateCheckDialog() {
  try {
    await checkForUpdates(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not check for updates.';
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Update Check Failed',
      message: 'Rainpane could not check for updates.',
      detail: `${message}\n\nYou can still check manually at https://github.com/tsieck/rainpane/releases.`,
      buttons: ['OK', 'Open Releases'],
      defaultId: 0,
      cancelId: 0,
    }).then(({ response }) => {
      if (response === 1) {
        void shell.openExternal('https://github.com/tsieck/rainpane/releases');
      }
    });
  }
}

async function pollActiveWindow() {
  try {
    const detectedBounds = await getActiveWindowBounds();
    if (isRainpaneWindow(detectedBounds)) {
      clearActiveWindowMask();
      return;
    }

    const bounds = detectedBounds;
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

function startRuntimeMonitoring() {
  if (runtimeMonitor) {
    return;
  }

  powerMonitor.on('on-battery', broadcastRuntimeState);
  powerMonitor.on('on-ac', broadcastRuntimeState);
  powerMonitor.on('suspend', handleSystemSuspend);
  powerMonitor.on('resume', handleSystemResume);
  powerMonitor.on('lock-screen', handleScreenLock);
  powerMonitor.on('unlock-screen', handleScreenUnlock);
  nativeTheme.on('updated', broadcastRuntimeState);
  runtimeMonitor = setInterval(broadcastRuntimeState, 5000);
  broadcastRuntimeState();
}

function updateCaptureAvailability(event: CaptureAvailabilityEvent) {
  const previouslyAllowed = systemAllowsCapture(captureAvailability);
  captureAvailability = reduceCaptureAvailability(captureAvailability, event);
  if (previouslyAllowed !== systemAllowsCapture(captureAvailability)) {
    syncPhotorealRefraction();
    broadcastRuntimeState();
  }
}

function handleSystemSuspend() {
  updateCaptureAvailability('suspend');
}

function handleSystemResume() {
  updateCaptureAvailability('resume');
}

function handleScreenLock() {
  updateCaptureAvailability('lock');
}

function handleScreenUnlock() {
  updateCaptureAvailability('unlock');
}

function registerDisplayMonitoring() {
  const syncDisplays = () => {
    syncOverlayWindows();
    broadcastActiveWindow();
  };

  screen.on('display-added', syncDisplays);
  screen.on('display-removed', syncDisplays);
  screen.on('display-metrics-changed', syncDisplays);
}

function createApplication() {
  ensureDemoWindow();
  syncOverlayWindows();

  trayController = createRainpaneTray(() => ({
    showOverlay: overlayEnabled,
    mode: settings.mode,
    rainEnabled: settings.rainEnabled,
    fogEnabled: settings.fogEnabled,
    debugMode: settings.debugMode,
    lightningEnabled: settings.lightningEnabled,
    coverFullScreen: settings.coverFullScreen,
    lowPowerMode: settings.lowPowerMode,
    autoLowPower: settings.autoLowPower,
    displayMode: settings.displayMode,
    accessibilityTrusted: isAccessibilityTrusted(),
    toggleOverlay,
    setMode: (mode) => updateSettings({ ...settings, mode, ...MODE_DEFAULTS[mode] }),
    toggleRain: () => updateSettings({ ...settings, rainEnabled: !settings.rainEnabled }),
    toggleFog: () => updateSettings({ ...settings, fogEnabled: !settings.fogEnabled }),
    toggleDebug: () => updateSettings({ ...settings, debugMode: !settings.debugMode }),
    toggleLightning: () => updateSettings({ ...settings, lightningEnabled: !settings.lightningEnabled }),
    toggleCoverFullScreen: () => updateSettings({ ...settings, coverFullScreen: !settings.coverFullScreen }),
    toggleLowPowerMode: () => updateSettings({ ...settings, lowPowerMode: !settings.lowPowerMode }),
    toggleAutoLowPower: () => updateSettings({ ...settings, autoLowPower: !settings.autoLowPower }),
    setIntensity: (intensity) => updateSettings({ ...settings, ...INTENSITY_PRESETS[intensity] }),
    setDisplayMode: (displayMode) => updateSettings({ ...settings, displayMode }),
    requestAccessibility: () => {
      requestAccessibilityPermission();
      openAccessibilitySettings();
      trayController?.refresh();
    },
    openDemo: ensureDemoWindow,
    checkForUpdates: () => {
      void showUpdateCheckDialog();
    },
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
  startRuntimeMonitoring();

  if (process.platform === 'darwin') {
    requestAccessibilityPermission();
  }
}

function createApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    ...(process.platform === 'darwin'
      ? ([
          {
            label: app.name,
            submenu: [
              {
                label: 'Open Settings / Demo',
                accelerator: 'CmdOrCtrl+Alt+S',
                click: ensureDemoWindow,
              },
              {
                label: 'Show / Hide Overlay',
                accelerator: 'CmdOrCtrl+Alt+R',
                click: toggleOverlay,
              },
              {
                label: 'Check for Updates...',
                click: () => {
                  void showUpdateCheckDialog();
                },
              },
              { type: 'separator' },
              {
                label: 'Quit Rainpane',
                accelerator: 'Command+Q',
                click: () => {
                  isQuitting = true;
                  app.quit();
                },
              },
            ],
          },
        ] satisfies Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'View',
      submenu: [
        {
          label: 'Open Settings / Demo',
          accelerator: process.platform === 'darwin' ? undefined : 'CmdOrCtrl+Alt+S',
          click: ensureDemoWindow,
        },
        {
          label: 'Show / Hide Overlay',
          accelerator: process.platform === 'darwin' ? undefined : 'CmdOrCtrl+Alt+R',
          click: toggleOverlay,
        },
        {
          label: 'Check for Updates...',
          click: () => {
            void showUpdateCheckDialog();
          },
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}

app.setName('Rainpane');
if (process.platform === 'darwin') {
  app.setActivationPolicy('regular');
}

ipcMain.handle('settings:get', (event) => {
  if (!isAuthorizedRainpaneRenderer(event)) {
    rejectUnauthorizedIpcSender();
  }
  return settings;
});
ipcMain.on('settings:update', (event, nextSettings: unknown) => {
  if (!isAuthorizedRendererSender(event, 'demo')) {
    return;
  }
  updateSettings(nextSettings);
});
ipcMain.on('settings:reset', (event) => {
  if (!isAuthorizedRendererSender(event, 'demo')) {
    return;
  }
  updateSettings(DEFAULT_SETTINGS);
});
ipcMain.on('overlay:set-visible', (event, visible: unknown) => {
  if (!isAuthorizedRendererSender(event, 'demo')) {
    return;
  }
  if (typeof visible === 'boolean') {
    setOverlayVisible(visible);
  }
});
ipcMain.on('refraction:frame', (event, input: unknown) => {
  if (
    !isAuthorizedRendererSender(event, 'overlay') ||
    !settings.photorealRefractionEnabled ||
    !shouldShowOverlay() ||
    !systemAllowsCapture(captureAvailability)
  ) {
    return;
  }
  const frame = parsePhotorealRefractionFrame(input);
  if (frame) {
    refractionManager.submitFrame(event.sender.id, frame);
  }
});
ipcMain.on('refraction:open-settings', (event) => {
  if (!isAuthorizedRendererSender(event, 'demo')) {
    return;
  }
  openScreenRecordingSettings();
});
ipcMain.handle('active-window:get', (event) => {
  if (!isAuthorizedRendererSender(event, 'overlay')) {
    rejectUnauthorizedIpcSender();
  }
  const overlayEntry = overlayWindows.find((entry) => entry.window.webContents.id === event.sender.id);
  if (!overlayEntry) {
    rejectUnauthorizedIpcSender();
  }
  return activeWindowStateForDisplay(overlayEntry.display);
});
ipcMain.handle('runtime:get', (event) => {
  if (!isAuthorizedRainpaneRenderer(event)) {
    rejectUnauthorizedIpcSender();
  }
  return currentRuntimeState(
    getPhotorealRefractionDisplayIdForSender(overlayWindows, event.sender.id),
  );
});
ipcMain.handle('updates:check', (event) => {
  if (!isAuthorizedRendererSender(event, 'demo')) {
    rejectUnauthorizedIpcSender();
  }
  return checkForUpdates(false);
});

app.whenReady().then(async () => {
  settings = await loadSettings();
  activateRainpane();
  createApplicationMenu();
  createApplication();
  registerDisplayMonitoring();

  app.on('activate', () => {
    ensureDemoWindow();
    syncOverlayWindows();
  });
});

app.on('second-instance', () => {
  ensureDemoWindow();
  syncOverlayWindows();
  trayController?.refresh();
});

app.on('before-quit', () => {
  isQuitting = true;
  refractionManager.stop();
  powerMonitor.off('suspend', handleSystemSuspend);
  powerMonitor.off('resume', handleSystemResume);
  powerMonitor.off('lock-screen', handleScreenLock);
  powerMonitor.off('unlock-screen', handleScreenUnlock);
  nativeTheme.off('updated', broadcastRuntimeState);
  if (activeWindowPoll) {
    clearInterval(activeWindowPoll);
    activeWindowPoll = null;
  }
  if (saveSettingsTimer) {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = null;
  }
  if (runtimeMonitor) {
    clearInterval(runtimeMonitor);
    runtimeMonitor = null;
  }
  void saveSettings(settings);
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
});
