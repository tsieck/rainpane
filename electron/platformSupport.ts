export const PHOTOREFRACTION_MINIMUM_MACOS_MAJOR = 13;

export function parseMacOSMajorVersion(systemVersion: string): number | null {
  const match = /^\s*(\d+)(?:\.|\s|$)/u.exec(systemVersion);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(major) && major > 0 ? major : null;
}

export function isPhotorealRefractionPlatformSupported(
  platform: NodeJS.Platform,
  systemVersion: string,
): boolean {
  if (platform !== 'darwin') {
    return false;
  }

  const major = parseMacOSMajorVersion(systemVersion);
  return major !== null && major >= PHOTOREFRACTION_MINIMUM_MACOS_MAJOR;
}

export function getElectronSystemVersion(platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'darwin') {
    return '';
  }

  const getSystemVersion = (process as NodeJS.Process & {
    getSystemVersion?: () => string;
  }).getSystemVersion;
  return typeof getSystemVersion === 'function' ? getSystemVersion.call(process) : '';
}
