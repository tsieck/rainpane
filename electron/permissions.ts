import { shell, systemPreferences } from 'electron';

export function isAccessibilityTrusted() {
  if (process.platform !== 'darwin') {
    return true;
  }

  return systemPreferences.isTrustedAccessibilityClient(false);
}

export function requestAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return true;
  }

  return systemPreferences.isTrustedAccessibilityClient(true);
}

export function openAccessibilitySettings() {
  if (process.platform !== 'darwin') {
    return;
  }

  void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
}
