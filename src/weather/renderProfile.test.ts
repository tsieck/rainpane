import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import { getRainCanvasRenderProfile } from './renderProfile';

describe('rain canvas render profile', () => {
  it('keeps default low-power overlay rendering below native resolution and display refresh', () => {
    const profile = getRainCanvasRenderProfile(DEFAULT_SETTINGS);

    expect(profile.pixelScaleCap).toBeLessThan(0.65);
    expect(profile.targetFps).toBeLessThanOrEqual(12);
  });

  it('uses a stricter profile for conservative overlay rendering', () => {
    const lowPower = getRainCanvasRenderProfile(DEFAULT_SETTINGS);
    const conservative = getRainCanvasRenderProfile({ ...DEFAULT_SETTINGS, renderBudget: 'conservative' });

    expect(conservative.pixelScaleCap).toBeLessThan(lowPower.pixelScaleCap);
    expect(conservative.targetFps).toBeLessThan(lowPower.targetFps);
  });

  it('keeps settings preview rendering cheaper than the overlay', () => {
    const overlay = getRainCanvasRenderProfile(DEFAULT_SETTINGS);
    const preview = getRainCanvasRenderProfile(DEFAULT_SETTINGS, 'preview');

    expect(preview.pixelScaleCap).toBeLessThan(overlay.pixelScaleCap);
    expect(preview.targetFps).toBeLessThan(overlay.targetFps);
  });
});
