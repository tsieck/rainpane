import type { WeatherSettings } from './types';

export type RainCanvasSurface = 'overlay' | 'preview';

export interface RainCanvasRenderProfile {
  pixelScaleCap: number;
  targetFps: number;
  hiddenFps: number;
  maxDeltaSeconds: number;
}

const MAX_WET_GLASS_PIXELS = 4_000_000;
const MAX_WET_GLASS_DIMENSION = 3072;
const FOUR_K_PIXELS = 3840 * 2160;
const FIVE_K_PIXELS = 5120 * 2880;

export interface WetGlassDetailRenderProfile {
  pixelScaleCap: number;
  maxPixels: number;
  maxDimension: number;
  targetFps: number;
  filmFps: number;
}

export function getRainCanvasRenderProfile(
  settings: WeatherSettings,
  surface: RainCanvasSurface = 'overlay',
): RainCanvasRenderProfile {
  const conservative = settings.renderBudget === 'conservative';
  const reducedMotion = settings.reducedMotion;
  const lowPower = settings.lowPowerMode || conservative;

  if (surface === 'preview') {
    return {
      pixelScaleCap: reducedMotion ? 0.38 : 0.44,
      targetFps: reducedMotion ? 6 : 10,
      hiddenFps: 1,
      maxDeltaSeconds: 0.12,
    };
  }

  if (conservative) {
    return {
      pixelScaleCap: reducedMotion ? 0.36 : 0.4,
      targetFps: reducedMotion ? 10 : 20,
      hiddenFps: 1,
      maxDeltaSeconds: 0.06,
    };
  }

  if (reducedMotion) {
    return {
      pixelScaleCap: 0.46,
      targetFps: 8,
      hiddenFps: 1,
      maxDeltaSeconds: 0.14,
    };
  }

  if (lowPower) {
    return {
      pixelScaleCap: 0.58,
      targetFps: 12,
      hiddenFps: 1,
      maxDeltaSeconds: 0.12,
    };
  }

  return {
    pixelScaleCap: 0.9,
    targetFps: 24,
    hiddenFps: 1,
    maxDeltaSeconds: 0.08,
  };
}

export function getWetGlassRenderProfile(
  settings: WeatherSettings,
  surface: RainCanvasSurface = 'overlay',
): RainCanvasRenderProfile {
  const atmosphere = getRainCanvasRenderProfile(settings, surface);
  const conservative = settings.renderBudget === 'conservative';

  if (surface === 'preview') {
    return {
      ...atmosphere,
      pixelScaleCap: settings.reducedMotion ? 0.68 : 0.8,
    };
  }

  if (conservative) {
    return {
      ...atmosphere,
      pixelScaleCap: settings.reducedMotion ? 0.58 : 0.68,
    };
  }

  if (settings.lowPowerMode) {
    return {
      ...atmosphere,
      pixelScaleCap: settings.reducedMotion ? 0.64 : 0.78,
    };
  }

  return {
    ...atmosphere,
    pixelScaleCap: settings.reducedMotion ? 0.76 : 1,
  };
}

export function getWetGlassPixelScale(
  width: number,
  height: number,
  settings: WeatherSettings,
  surface: RainCanvasSurface = 'overlay',
  devicePixelRatio = 1,
) {
  const profile = getWetGlassRenderProfile(settings, surface);
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const safeDeviceScale = Math.max(0.01, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const dimensionScale = Math.min(MAX_WET_GLASS_DIMENSION / safeWidth, MAX_WET_GLASS_DIMENSION / safeHeight);
  const pixelScale = Math.sqrt(MAX_WET_GLASS_PIXELS / (safeWidth * safeHeight));

  return Math.max(0.01, Math.min(safeDeviceScale, profile.pixelScaleCap, dimensionScale, pixelScale));
}

/**
 * Visible droplet heads need native backing pixels, while the broad wet film
 * can remain intentionally soft and inexpensive. Low-power and conservative
 * paths retain a full 4K detail budget; standard rendering can resolve a 5K
 * pane. The detail canvas never supersamples beyond the display's DPR.
 */
export function getWetGlassDetailRenderProfile(
  settings: WeatherSettings,
  surface: RainCanvasSurface = 'overlay',
): WetGlassDetailRenderProfile {
  const economical =
    surface === 'preview' ||
    settings.lowPowerMode ||
    settings.renderBudget === 'conservative';

  return {
    pixelScaleCap: 2,
    maxPixels: economical ? FOUR_K_PIXELS : FIVE_K_PIXELS,
    maxDimension: economical ? 3840 : 5120,
    targetFps: settings.reducedMotion ? 8 : economical ? 30 : 45,
    filmFps: settings.reducedMotion ? 4 : economical ? 12 : 15,
  };
}

export function getWetGlassDetailPixelScale(
  width: number,
  height: number,
  settings: WeatherSettings,
  surface: RainCanvasSurface = 'overlay',
  devicePixelRatio = 1,
) {
  const profile = getWetGlassDetailRenderProfile(settings, surface);
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const safeDeviceScale = Math.max(0.01, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const dimensionScale = Math.min(profile.maxDimension / safeWidth, profile.maxDimension / safeHeight);
  const pixelScale = Math.sqrt(profile.maxPixels / (safeWidth * safeHeight));

  return Math.max(0.01, Math.min(safeDeviceScale, profile.pixelScaleCap, dimensionScale, pixelScale));
}
