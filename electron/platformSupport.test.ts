import { describe, expect, it } from 'vitest';
import {
  PHOTOREFRACTION_MINIMUM_MACOS_MAJOR,
  isPhotorealRefractionPlatformSupported,
  parseMacOSMajorVersion,
} from './platformSupport.js';

describe('photoreal refraction platform support', () => {
  it('parses macOS product versions without accepting malformed values', () => {
    expect(parseMacOSMajorVersion('13.0')).toBe(13);
    expect(parseMacOSMajorVersion(' 15.5.1 ')).toBe(15);
    expect(parseMacOSMajorVersion('12')).toBe(12);
    expect(parseMacOSMajorVersion('macOS 15')).toBeNull();
    expect(parseMacOSMajorVersion('')).toBeNull();
  });

  it('matches the native helper deployment target', () => {
    expect(PHOTOREFRACTION_MINIMUM_MACOS_MAJOR).toBe(13);
    expect(isPhotorealRefractionPlatformSupported('darwin', '12.7.6')).toBe(false);
    expect(isPhotorealRefractionPlatformSupported('darwin', '13.0')).toBe(true);
    expect(isPhotorealRefractionPlatformSupported('darwin', '15.5')).toBe(true);
    expect(isPhotorealRefractionPlatformSupported('win32', '15.5')).toBe(false);
    expect(isPhotorealRefractionPlatformSupported('darwin', '')).toBe(false);
  });
});
