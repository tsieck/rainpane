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

export function parseVersion(value: string): [number, number, number] | null {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string) {
  const first = parseVersion(a);
  const second = parseVersion(b);
  if (!first || !second) {
    return 0;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return first[index] > second[index] ? 1 : -1;
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
  const latestVersion = tagName ? parseVersion(tagName)?.join('.') ?? null : null;
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
