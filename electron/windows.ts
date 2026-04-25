import { BrowserWindow, screen } from 'electron';
import type { Display } from 'electron';
import path from 'node:path';

export type RainpaneView = 'overlay' | 'demo';

const DEFAULT_PRELOAD = path.join(import.meta.dirname, 'preload.js');

function loadRenderer(window: BrowserWindow, view: RainpaneView, query: Record<string, string> = {}) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const params = new URLSearchParams({ view, ...query });
  if (devServerUrl) {
    window.loadURL(`${devServerUrl}?${params.toString()}`);
    return;
  }

  window.loadFile(path.join(import.meta.dirname, '../dist/index.html'), {
    query: { view, ...query },
  });
}

export function createOverlayWindow(display: Display = screen.getPrimaryDisplay()) {
  const { x, y, width, height } = display.bounds;

  const overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: DEFAULT_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive();
  });

  loadRenderer(overlayWindow, 'overlay', { displayId: String(display.id) });
  return overlayWindow;
}

export function createDemoWindow() {
  const demoWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Rainpane Demo',
    backgroundColor: '#071014',
    show: false,
    webPreferences: {
      preload: DEFAULT_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  demoWindow.once('ready-to-show', () => {
    demoWindow.show();
  });

  loadRenderer(demoWindow, 'demo');
  return demoWindow;
}
