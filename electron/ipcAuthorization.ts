import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type RainpaneRendererTarget =
  | { senderId: number; view: 'demo' }
  | { senderId: number; view: 'overlay'; displayId: string };

export interface RainpaneRendererLocation {
  appPath: string;
  devServerUrl?: string;
}

export interface RainpaneIpcSender {
  senderId: number;
  frameUrl: string;
  isMainFrame: boolean;
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function expectedRendererBaseUrl(location: RainpaneRendererLocation) {
  if (location.devServerUrl) {
    try {
      const devServerUrl = new URL(location.devServerUrl);
      if (
        devServerUrl.protocol !== 'http:' ||
        !LOOPBACK_HOSTNAMES.has(devServerUrl.hostname) ||
        devServerUrl.username ||
        devServerUrl.password ||
        devServerUrl.search ||
        devServerUrl.hash
      ) {
        return null;
      }
      return devServerUrl;
    } catch {
      return null;
    }
  }

  return pathToFileURL(path.join(location.appPath, 'dist', 'index.html'));
}

function hasExactRendererQuery(candidate: URL, target: RainpaneRendererTarget) {
  const expectedEntries = target.view === 'overlay'
    ? [['view', 'overlay'], ['displayId', target.displayId]] as const
    : [['view', 'demo']] as const;
  const candidateEntries = [...candidate.searchParams.entries()];

  return candidateEntries.length === expectedEntries.length && expectedEntries.every(([key, value]) => {
    const candidateValues = candidate.searchParams.getAll(key);
    return candidateValues.length === 1 && candidateValues[0] === value;
  });
}

export function isTrustedRainpaneRendererUrl(
  candidateUrl: string,
  target: RainpaneRendererTarget,
  location: RainpaneRendererLocation,
) {
  const expectedBaseUrl = expectedRendererBaseUrl(location);
  if (!expectedBaseUrl) {
    return false;
  }

  try {
    const candidate = new URL(candidateUrl);
    return (
      candidate.protocol === expectedBaseUrl.protocol &&
      candidate.username === expectedBaseUrl.username &&
      candidate.password === expectedBaseUrl.password &&
      candidate.host === expectedBaseUrl.host &&
      candidate.pathname === expectedBaseUrl.pathname &&
      candidate.hash === '' &&
      hasExactRendererQuery(candidate, target)
    );
  } catch {
    return false;
  }
}

export function isAuthorizedRainpaneIpcSender(
  sender: RainpaneIpcSender,
  targets: readonly RainpaneRendererTarget[],
  location: RainpaneRendererLocation,
) {
  if (!sender.isMainFrame) {
    return false;
  }

  const target = targets.find((candidate) => candidate.senderId === sender.senderId);
  return Boolean(target && isTrustedRainpaneRendererUrl(sender.frameUrl, target, location));
}
