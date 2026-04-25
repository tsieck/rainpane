import { app, globalShortcut } from 'electron';

interface ShortcutActions {
  toggleOverlay: () => void;
  toggleFog: () => void;
  openDemo: () => void;
}

export function registerShortcuts(actions: ShortcutActions) {
  globalShortcut.register('CommandOrControl+Alt+R', actions.toggleOverlay);
  globalShortcut.register('CommandOrControl+Alt+F', actions.toggleFog);
  globalShortcut.register('CommandOrControl+Alt+S', actions.openDemo);

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
