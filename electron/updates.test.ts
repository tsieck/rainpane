import { describe, expect, it } from 'vitest';
import { chooseUpdateAsset, compareVersions, parseVersion } from './updates.js';

describe('update helpers', () => {
  it('parses semver from release tags', () => {
    expect(parseVersion('v0.1.9-alpha')).toEqual([0, 1, 9]);
    expect(parseVersion('Rainpane 1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('latest')).toBeNull();
  });

  it('compares semantic versions', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
    expect(compareVersions('0.1.9', '0.1.10')).toBe(-1);
    expect(compareVersions('v0.1.9-alpha', '0.1.9')).toBe(0);
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
