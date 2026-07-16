import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import {
  getRainCanvasRenderProfile,
  getWetGlassDetailPixelScale,
  getWetGlassDetailRenderProfile,
  getWetGlassPixelScale,
  getWetGlassRenderProfile,
} from './renderProfile';

describe('rain canvas render profile', () => {
  it('keeps default low-power overlay rendering below native resolution and display refresh', () => {
    const profile = getRainCanvasRenderProfile(DEFAULT_SETTINGS);

    expect(profile.pixelScaleCap).toBeLessThan(0.65);
    expect(profile.targetFps).toBeLessThanOrEqual(12);
  });

  it('uses a lower-resolution profile for conservative overlay rendering', () => {
    const lowPower = getRainCanvasRenderProfile(DEFAULT_SETTINGS);
    const conservative = getRainCanvasRenderProfile({ ...DEFAULT_SETTINGS, renderBudget: 'conservative' });

    expect(conservative.pixelScaleCap).toBeLessThan(lowPower.pixelScaleCap);
    expect(conservative.targetFps).toBeLessThanOrEqual(20);
  });

  it('keeps settings preview rendering cheaper than the overlay', () => {
    const overlay = getRainCanvasRenderProfile(DEFAULT_SETTINGS);
    const preview = getRainCanvasRenderProfile(DEFAULT_SETTINGS, 'preview');

    expect(preview.pixelScaleCap).toBeLessThan(overlay.pixelScaleCap);
    expect(preview.targetFps).toBeLessThan(overlay.targetFps);
  });

  it('gives wet glass more resolution without increasing its frame cadence', () => {
    const settings = { ...DEFAULT_SETTINGS, renderBudget: 'conservative' as const };
    const atmosphere = getRainCanvasRenderProfile(settings);
    const glass = getWetGlassRenderProfile(settings);

    expect(glass.pixelScaleCap).toBeGreaterThan(atmosphere.pixelScaleCap);
    expect(glass.pixelScaleCap).toBeLessThanOrEqual(0.7);
    expect(glass.targetFps).toBe(atmosphere.targetFps);
  });

  it('keeps the smaller preview glass crisp enough to represent beading', () => {
    const atmosphere = getRainCanvasRenderProfile(DEFAULT_SETTINGS, 'preview');
    const glass = getWetGlassRenderProfile(DEFAULT_SETTINGS, 'preview');

    expect(glass.pixelScaleCap).toBeGreaterThanOrEqual(0.75);
    expect(glass.pixelScaleCap).toBeGreaterThan(atmosphere.pixelScaleCap);
  });

  it('caps the visible glass buffer to four megapixels at 5K', () => {
    const scale = getWetGlassPixelScale(
      5120,
      2160,
      { ...DEFAULT_SETTINGS, renderBudget: 'conservative' },
      'overlay',
      2,
    );

    expect(5120 * 2160 * scale * scale).toBeLessThanOrEqual(4_000_001);
    expect(5120 * scale).toBeLessThanOrEqual(3072);
  });

  it('renders visible droplet detail at native 4K on a Retina-sized pane', () => {
    const scale = getWetGlassDetailPixelScale(
      1920,
      1080,
      { ...DEFAULT_SETTINGS, renderBudget: 'conservative' },
      'overlay',
      2,
    );

    expect(scale).toBe(2);
    expect(1920 * scale).toBe(3840);
    expect(1080 * scale).toBe(2160);
  });

  it('renders a native 4K display at one backing pixel per display pixel', () => {
    const scale = getWetGlassDetailPixelScale(
      3840,
      2160,
      { ...DEFAULT_SETTINGS, renderBudget: 'conservative' },
      'overlay',
      1,
    );

    expect(scale).toBe(1);
  });

  it('never supersamples beyond the device pixel ratio', () => {
    const settings = { ...DEFAULT_SETTINGS, lowPowerMode: false, renderBudget: 'standard' as const };

    expect(getWetGlassDetailPixelScale(1280, 720, settings, 'overlay', 1)).toBe(1);
    expect(getWetGlassDetailPixelScale(1280, 720, settings, 'overlay', 1.5)).toBe(1.5);
  });

  it('keeps economical detail at 4K when a larger Retina pane would exceed its budget', () => {
    const settings = { ...DEFAULT_SETTINGS, lowPowerMode: true };
    const profile = getWetGlassDetailRenderProfile(settings, 'preview');
    const scale = getWetGlassDetailPixelScale(2560, 1440, settings, 'preview', 2);

    expect(profile.maxPixels).toBe(3840 * 2160);
    expect(2560 * scale).toBeCloseTo(3840, 5);
    expect(1440 * scale).toBeCloseTo(2160, 5);
  });

  it('updates droplet optics faster than the deliberately slow atmosphere', () => {
    const previewAtmosphere = getRainCanvasRenderProfile(DEFAULT_SETTINGS, 'preview');
    const previewDetail = getWetGlassDetailRenderProfile(DEFAULT_SETTINGS, 'preview');
    const standardSettings = { ...DEFAULT_SETTINGS, lowPowerMode: false, renderBudget: 'standard' as const };
    const standardDetail = getWetGlassDetailRenderProfile(standardSettings, 'overlay');

    expect(previewDetail.targetFps).toBe(30);
    expect(previewDetail.targetFps).toBeGreaterThan(previewAtmosphere.targetFps);
    expect(previewDetail.filmFps).toBeLessThan(previewDetail.targetFps);
    expect(standardDetail.targetFps).toBe(45);
  });

  it('allows standard visible droplet detail to resolve a native 5K pane', () => {
    const settings = { ...DEFAULT_SETTINGS, lowPowerMode: false, renderBudget: 'standard' as const };
    const profile = getWetGlassDetailRenderProfile(settings);
    const scale = getWetGlassDetailPixelScale(2560, 1440, settings, 'overlay', 2);

    expect(profile.maxPixels).toBe(5120 * 2880);
    expect(scale).toBe(2);
    expect(2560 * scale * 1440 * scale).toBeLessThanOrEqual(profile.maxPixels);
  });

  it('caps oversized detail buffers at the 5K memory boundary', () => {
    const settings = { ...DEFAULT_SETTINGS, lowPowerMode: false, renderBudget: 'standard' as const };
    const profile = getWetGlassDetailRenderProfile(settings);
    const scale = getWetGlassDetailPixelScale(6016, 3384, settings, 'overlay', 2);

    expect(6016 * 3384 * scale * scale).toBeLessThanOrEqual(profile.maxPixels + 1);
    expect(6016 * scale).toBeLessThanOrEqual(profile.maxDimension + 0.001);
  });
});
