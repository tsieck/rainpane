import type { WeatherSettings } from './types';

export type RainCanvasSurface = 'overlay' | 'preview';

export interface RainCanvasRenderProfile {
  pixelScaleCap: number;
  targetFps: number;
  hiddenFps: number;
  maxDeltaSeconds: number;
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
