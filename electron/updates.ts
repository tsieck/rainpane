export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  tagName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  hasUpdate: boolean;
}

interface GitHubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GitHubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

const LATEST_RELEASE_URL = 'https://api.github.com/repos/tsieck/rainpane/releases/latest';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function parseVersion(value: string): ParsedVersion | null {
  const match = value.match(
    /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?/,
  );
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function formatVersion(version: ParsedVersion) {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length > 0 ? `${core}-${version.prerelease.join('.')}` : core;
}

function comparePrereleaseIdentifiers(first: string, second: string) {
  const firstIsNumeric = /^\d+$/.test(first);
  const secondIsNumeric = /^\d+$/.test(second);

  if (firstIsNumeric && secondIsNumeric) {
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    return firstNumber === secondNumber ? 0 : firstNumber > secondNumber ? 1 : -1;
  }

  if (firstIsNumeric !== secondIsNumeric) {
    return firstIsNumeric ? -1 : 1;
  }

  return first === second ? 0 : first > second ? 1 : -1;
}

export function compareVersions(a: string, b: string) {
  const first = parseVersion(a);
  const second = parseVersion(b);
  if (!first || !second) {
    return 0;
  }

  const firstCore = [first.major, first.minor, first.patch];
  const secondCore = [second.major, second.minor, second.patch];
  for (let index = 0; index < firstCore.length; index += 1) {
    if (firstCore[index] !== secondCore[index]) {
      return firstCore[index] > secondCore[index] ? 1 : -1;
    }
  }

  if (first.prerelease.length === 0 || second.prerelease.length === 0) {
    if (first.prerelease.length === second.prerelease.length) {
      return 0;
    }

    return first.prerelease.length === 0 ? 1 : -1;
  }

  const identifierCount = Math.max(first.prerelease.length, second.prerelease.length);
  for (let index = 0; index < identifierCount; index += 1) {
    const firstIdentifier = first.prerelease[index];
    const secondIdentifier = second.prerelease[index];
    if (firstIdentifier === undefined || secondIdentifier === undefined) {
      return firstIdentifier === undefined ? -1 : 1;
    }

    const comparison = comparePrereleaseIdentifiers(firstIdentifier, secondIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function releaseAssets(release: GitHubRelease): GitHubReleaseAsset[] {
  return Array.isArray(release.assets) ? (release.assets as GitHubReleaseAsset[]) : [];
}

export function chooseUpdateAsset(release: GitHubRelease, platform: NodeJS.Platform, arch: string) {
  const assets = releaseAssets(release).filter(
    (asset) => typeof asset.name === 'string' && typeof asset.browser_download_url === 'string',
  );

  const names = platform === 'win32'
    ? ['x64-win.zip', 'win.zip']
    : platform === 'darwin'
      ? [arch === 'arm64' ? 'arm64.dmg' : 'x64.dmg', '.dmg', arch === 'arm64' ? 'arm64.zip' : 'x64.zip', '.zip']
      : [];

  for (const name of names) {
    const asset = assets.find((candidate) => (candidate.name as string).toLowerCase().endsWith(name));
    if (asset) {
      return {
        name: asset.name as string,
        url: asset.browser_download_url as string,
      };
    }
  }

  return null;
}

export async function checkForGitHubUpdate(
  currentVersion: string,
  platform: NodeJS.Platform,
  arch: string,
): Promise<UpdateCheckResult> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Rainpane/${currentVersion}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub update check failed (${response.status})`);
  }

  const release = (await response.json()) as GitHubRelease;
  const tagName = typeof release.tag_name === 'string' ? release.tag_name : null;
  const releaseUrl = typeof release.html_url === 'string' ? release.html_url : null;
  const parsedLatestVersion = tagName ? parseVersion(tagName) : null;
  const latestVersion = parsedLatestVersion ? formatVersion(parsedLatestVersion) : null;
  const asset = chooseUpdateAsset(release, platform, arch);
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

  return {
    currentVersion,
    latestVersion,
    tagName,
    releaseUrl,
    downloadUrl: asset?.url ?? releaseUrl,
    assetName: asset?.name ?? null,
    hasUpdate,
  };
}
