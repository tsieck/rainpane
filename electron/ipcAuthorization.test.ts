import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isAuthorizedRainpaneIpcSender,
  isTrustedRainpaneRendererUrl,
  type RainpaneRendererLocation,
  type RainpaneRendererTarget,
} from './ipcAuthorization.js';

const appPath = path.join(path.sep, 'Applications', 'Rainpane.app', 'Contents', 'Resources', 'app.asar');
const productionLocation: RainpaneRendererLocation = { appPath };
const demoTarget: RainpaneRendererTarget = { senderId: 41, view: 'demo' };
const productionIndexUrl = pathToFileURL(path.join(appPath, 'dist', 'index.html'));

function productionUrl(query: string) {
  const url = new URL(productionIndexUrl);
  url.search = query;
  return url.href;
}

describe('Rainpane IPC sender authorization', () => {
  it('accepts the managed top-level renderer at its exact production URL', () => {
    expect(isAuthorizedRainpaneIpcSender({
      senderId: demoTarget.senderId,
      frameUrl: productionUrl('?view=demo'),
      isMainFrame: true,
    }, [demoTarget], productionLocation)).toBe(true);
  });

  it('rejects the right Rainpane URL from an unexpected webContents sender', () => {
    expect(isAuthorizedRainpaneIpcSender({
      senderId: 99,
      frameUrl: productionUrl('?view=demo'),
      isMainFrame: true,
    }, [demoTarget], productionLocation)).toBe(false);
  });

  it('rejects an unexpected URL even when the sender id and query look valid', () => {
    expect(isAuthorizedRainpaneIpcSender({
      senderId: demoTarget.senderId,
      frameUrl: 'file:///tmp/untrusted/index.html?view=demo',
      isMainFrame: true,
    }, [demoTarget], productionLocation)).toBe(false);
  });

  it('rejects subframes and role/query confusion', () => {
    expect(isAuthorizedRainpaneIpcSender({
      senderId: demoTarget.senderId,
      frameUrl: productionUrl('?view=demo'),
      isMainFrame: false,
    }, [demoTarget], productionLocation)).toBe(false);
    expect(isTrustedRainpaneRendererUrl(
      productionUrl('?view=overlay&displayId=7'),
      demoTarget,
      productionLocation,
    )).toBe(false);
    expect(isTrustedRainpaneRendererUrl(
      productionUrl('?view=demo&view=demo'),
      demoTarget,
      productionLocation,
    )).toBe(false);
  });

  it('accepts the configured loopback Vite origin and rejects other origins', () => {
    const devLocation = { appPath, devServerUrl: 'http://127.0.0.1:5173' };
    expect(isTrustedRainpaneRendererUrl(
      'http://127.0.0.1:5173/?view=overlay&displayId=7',
      { senderId: 72, view: 'overlay', displayId: '7' },
      devLocation,
    )).toBe(true);
    expect(isTrustedRainpaneRendererUrl(
      'http://127.0.0.1:4173/?view=overlay&displayId=7',
      { senderId: 72, view: 'overlay', displayId: '7' },
      devLocation,
    )).toBe(false);
    expect(isTrustedRainpaneRendererUrl(
      'https://rainpane.example/?view=demo',
      demoTarget,
      { appPath, devServerUrl: 'https://rainpane.example' },
    )).toBe(false);
  });
});
