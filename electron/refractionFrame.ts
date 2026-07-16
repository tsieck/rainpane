import type { PhotorealRefractionFrame } from './photorealRefraction.js';

const MAX_VIEWPORT_EDGE = 16_384;
const MAX_DROPLETS = 768;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Treat renderer geometry as untrusted IPC input. Only a compact, bounded
 * payload reaches the native helper; desktop pixels never cross this boundary.
 */
export function parsePhotorealRefractionFrame(input: unknown): PhotorealRefractionFrame | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    viewport?: { width?: unknown; height?: unknown };
    protectedMask?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
    droplets?: unknown;
  };
  const inputWidth = finiteNumber(candidate.viewport?.width);
  const inputHeight = finiteNumber(candidate.viewport?.height);
  if (!inputWidth || !inputHeight || inputWidth <= 0 || inputHeight <= 0 || !Array.isArray(candidate.droplets)) {
    return null;
  }
  const width = clampNumber(inputWidth, 1, MAX_VIEWPORT_EDGE);
  const height = clampNumber(inputHeight, 1, MAX_VIEWPORT_EDGE);

  const droplets = candidate.droplets.slice(0, MAX_DROPLETS).flatMap((value) => {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const droplet = value as Record<string, unknown>;
    const x = finiteNumber(droplet.x);
    const y = finiteNumber(droplet.y);
    const radiusX = finiteNumber(droplet.radiusX);
    const radiusY = finiteNumber(droplet.radiusY);
    if (x === null || y === null || radiusX === null || radiusY === null || radiusX <= 0 || radiusY <= 0) {
      return [];
    }
    return [{
      x: clampNumber(x, -1024, width + 1024),
      y: clampNumber(y, -1024, height + 1024),
      radiusX: clampNumber(radiusX, 0.5, 1024),
      radiusY: clampNumber(radiusY, 0.5, 1024),
      opacity: clampNumber(finiteNumber(droplet.opacity) ?? 1, 0, 1),
      refraction: clampNumber(finiteNumber(droplet.refraction) ?? 0.5, 0, 2),
      seed: clampNumber(finiteNumber(droplet.seed) ?? 0, -1_000_000_000, 1_000_000_000),
    }];
  });

  const mask = candidate.protectedMask;
  const maskValues = mask
    ? [finiteNumber(mask.x), finiteNumber(mask.y), finiteNumber(mask.width), finiteNumber(mask.height)]
    : null;
  const protectedRects = maskValues?.every((value) => value !== null)
    ? (() => {
        const rawX = maskValues[0] as number;
        const rawY = maskValues[1] as number;
        const rawWidth = Math.max(0, maskValues[2] as number);
        const rawHeight = Math.max(0, maskValues[3] as number);
        const x = clampNumber(rawX, 0, width);
        const y = clampNumber(rawY, 0, height);
        const right = clampNumber(rawX + rawWidth, 0, width);
        const bottom = clampNumber(rawY + rawHeight, 0, height);
        const maskWidth = Math.max(0, right - x);
        const maskHeight = Math.max(0, bottom - y);
        const coversCanvas = x <= 0 && y <= 0 && x + maskWidth >= width && y + maskHeight >= height;
        return [{
          x,
          y,
          width: maskWidth,
          height: maskHeight,
          cornerRadius: coversCanvas ? 0 : Math.max(0, Math.min(12, maskWidth * 0.08, maskHeight * 0.08)),
        }];
      })()
    : [];

  return { width, height, droplets, protectedRects };
}
