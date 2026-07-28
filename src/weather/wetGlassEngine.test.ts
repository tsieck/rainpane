import { describe, expect, it } from 'vitest';
import { isPhotorealRefractionCandidate } from './wetGlassEngine';

describe('native refraction candidate parity', () => {
  it('suppresses only droplet heads that the native payload can render', () => {
    expect(isPhotorealRefractionCandidate({ opacity: 0.7, radiusX: 3, radiusY: 4 })).toBe(true);
    expect(isPhotorealRefractionCandidate({ opacity: 0.7, radiusX: 1.2, radiusY: 2 })).toBe(false);
    expect(isPhotorealRefractionCandidate({ opacity: 0.035, radiusX: 3, radiusY: 4 })).toBe(false);
  });
});
