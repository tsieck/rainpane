import { Menu, Tray, nativeImage } from 'electron';

interface TrayActions {
  showOverlay: boolean;
  rainEnabled: boolean;
  fogEnabled: boolean;
  debugMode: boolean;
  lightningEnabled: boolean;
  coverFullScreen: boolean;
  lowPowerMode: boolean;
  displayMode: 'primary' | 'all';
  accessibilityTrusted: boolean;
  toggleOverlay: () => void;
  toggleRain: () => void;
  toggleFog: () => void;
  toggleDebug: () => void;
  toggleLightning: () => void;
  toggleCoverFullScreen: () => void;
  toggleLowPowerMode: () => void;
  setDisplayMode: (mode: 'primary' | 'all') => void;
  requestAccessibility: () => void;
  openDemo: () => void;
  quit: () => void;
}

const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#122024"/>
  <path d="M10 7c2.5-2.7 7.5-2.7 10 0 2.6 2.8 2.1 7.3-1.1 9.5L16 18.5l-2.9-2C9.9 14.3 9.4 9.8 12 7Z" fill="#9fc6c1" opacity=".95"/>
  <path d="M11 20l-2 5M17 20l-2 6M23 20l-2 5" stroke="#d7eeee" stroke-width="2" stroke-linecap="round"/>
</svg>`;

function createIcon() {
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(ICON_SVG)}`);
  image.setTemplateImage(process.platform === 'darwin');
  return image;
}

export function createRainpaneTray(getActions: () => TrayActions) {
  const tray = new Tray(createIcon());
  tray.setToolTip('Rainpane');

  const refresh = () => {
    const actions = getActions();
    const menu = Menu.buildFromTemplate([
      {
        label: actions.showOverlay ? 'Hide Rainpane' : 'Show Rainpane',
        accelerator: 'CmdOrCtrl+Alt+R',
        click: actions.toggleOverlay,
      },
      { type: 'separator' },
      {
        label: 'Rain',
        type: 'checkbox',
        checked: actions.rainEnabled,
        click: actions.toggleRain,
      },
      {
        label: 'Fog',
        type: 'checkbox',
        checked: actions.fogEnabled,
        accelerator: 'CmdOrCtrl+Alt+F',
        click: actions.toggleFog,
      },
      {
        label: 'Debug Mask',
        type: 'checkbox',
        checked: actions.debugMode,
        click: actions.toggleDebug,
      },
      {
        label: 'Lightning',
        type: 'checkbox',
        checked: actions.lightningEnabled,
        click: actions.toggleLightning,
      },
      {
        label: 'Cover Full Screen',
        type: 'checkbox',
        checked: actions.coverFullScreen,
        click: actions.toggleCoverFullScreen,
      },
      {
        label: 'Low Power Mode',
        type: 'checkbox',
        checked: actions.lowPowerMode,
        click: actions.toggleLowPowerMode,
      },
      {
        label: 'Displays',
        submenu: [
          {
            label: 'Primary Display',
            type: 'radio',
            checked: actions.displayMode === 'primary',
            click: () => actions.setDisplayMode('primary'),
          },
          {
            label: 'All Displays',
            type: 'radio',
            checked: actions.displayMode === 'all',
            click: () => actions.setDisplayMode('all'),
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Open Settings / Demo',
        accelerator: 'CmdOrCtrl+Alt+S',
        click: actions.openDemo,
      },
      ...(process.platform === 'darwin'
        ? ([
            { type: 'separator' },
            {
              label: actions.accessibilityTrusted ? 'Accessibility Permission Granted' : 'Request Accessibility Permission',
              enabled: !actions.accessibilityTrusted,
              click: actions.requestAccessibility,
            },
            {
              label: 'Open macOS Accessibility Settings',
              click: actions.requestAccessibility,
            },
          ] satisfies Electron.MenuItemConstructorOptions[])
        : []),
      { type: 'separator' },
      {
        label: 'Quit',
        click: actions.quit,
      },
    ]);

    tray.setContextMenu(menu);
  };

  tray.on('click', () => {
    getActions().openDemo();
  });

  refresh();
  return { tray, refresh };
}
