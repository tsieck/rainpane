import { describe, expect, it } from 'vitest';
import { chooseUpdateAsset, compareVersions, parseVersion } from './updates.js';

describe('update helpers', () => {
  it('parses semver from release tags', () => {
    expect(parseVersion('v0.1.9-alpha')).toEqual({
      major: 0,
      minor: 1,
      patch: 9,
      prerelease: ['alpha'],
    });
    expect(parseVersion('Rainpane 1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
    expect(parseVersion('v0.1.12-rc.2+notarized')).toEqual({
      major: 0,
      minor: 1,
      patch: 12,
      prerelease: ['rc', '2'],
    });
    expect(parseVersion('latest')).toBeNull();
  });

  it('compares semantic versions', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
    expect(compareVersions('0.1.9', '0.1.10')).toBe(-1);
    expect(compareVersions('0.1.12', '0.1.12-rc.2')).toBe(1);
    expect(compareVersions('0.1.12-rc.2', '0.1.12')).toBe(-1);
    expect(compareVersions('0.1.12-rc.10', '0.1.12-rc.2')).toBe(1);
    expect(compareVersions('0.1.12-beta.1', '0.1.12-alpha.9')).toBe(1);
    expect(compareVersions('0.1.12-rc.2', '0.1.12-rc.2')).toBe(0);
    expect(compareVersions('0.1.12+build.2', '0.1.12+build.1')).toBe(0);
  });

  it('chooses the Windows release asset', () => {
    const asset = chooseUpdateAsset(
      {
        assets: [
          { name: 'Rainpane-0.1.9-arm64.dmg', browser_download_url: 'https://example.test/mac' },
          { name: 'Rainpane-0.1.9-x64-win.zip', browser_download_url: 'https://example.test/win' },
        ],
      },
      'win32',
      'x64',
    );

    expect(asset).toEqual({ name: 'Rainpane-0.1.9-x64-win.zip', url: 'https://example.test/win' });
  });

  it('prefers DMG for macOS updates', () => {
    const asset = chooseUpdateAsset(
      {
        assets: [
          { name: 'Rainpane-0.1.9-arm64.zip', browser_download_url: 'https://example.test/zip' },
          { name: 'Rainpane-0.1.9-arm64.dmg', browser_download_url: 'https://example.test/dmg' },
        ],
      },
      'darwin',
      'arm64',
    );

    expect(asset).toEqual({ name: 'Rainpane-0.1.9-arm64.dmg', url: 'https://example.test/dmg' });
  });
});
