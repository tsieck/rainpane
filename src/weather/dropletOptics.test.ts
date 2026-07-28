import { describe, expect, it } from 'vitest';
import {
  DROPLET_OPTICAL_VARIANTS,
  WATER_F0,
  getDropletOpticalVariant,
  sampleDropletOptics,
  schlickWaterFresnel,
} from './dropletOptics';

function luminance(sample: ReturnType<typeof sampleDropletOptics>) {
  return sample.red * 0.2126 + sample.green * 0.7152 + sample.blue * 0.0722;
}

describe('droplet optical model', () => {
  it('uses the physical normal-incidence reflectance of water', () => {
    expect(WATER_F0).toBeCloseTo(0.02037, 4);
    expect(schlickWaterFresnel(1)).toBeCloseTo(WATER_F0, 8);
    expect(schlickWaterFresnel(0)).toBe(1);
  });

  it('keeps the transmitted center substantially clearer than the contact rim', () => {
    const center = sampleDropletOptics(0, 0, 'bead', 2);
    const rim = sampleDropletOptics(0.76, 0.52, 'bead', 2);

    expect(center.alpha).toBeLessThan(0.03);
    expect(rim.alpha).toBeGreaterThan(center.alpha * 4);
    expect(rim.fresnel).toBeGreaterThan(center.fresnel);
  });

  it('reflects the shared upper-left room light and keeps the opposite meniscus dark', () => {
    const lightFacing = sampleDropletOptics(-0.52, -0.56, 'pane', 4);
    const opposing = sampleDropletOptics(0.52, 0.56, 'pane', 4);

    expect(luminance(lightFacing)).toBeGreaterThan(luminance(opposing));
    expect(lightFacing.alpha).toBeGreaterThan(0);
    expect(opposing.alpha).toBeGreaterThan(0);
  });

  it('returns clean transparent pixels outside the cap', () => {
    const outside = sampleDropletOptics(1.4, 0.2, 'runner', 1);
    expect(outside).toMatchObject({ red: 0, green: 0, blue: 0, alpha: 0 });
  });

  it('selects deterministic bounded atlas variants', () => {
    const first = getDropletOpticalVariant(1.23, 88);
    expect(getDropletOpticalVariant(1.23, 88)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(DROPLET_OPTICAL_VARIANTS);
    expect(new Set(Array.from({ length: 24 }, (_, index) => getDropletOpticalVariant(index * 0.37, index))).size).toBeGreaterThan(4);
  });
});
