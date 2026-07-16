import { describe, expect, it } from 'vitest';
import { parsePhotorealRefractionFrame } from './refractionFrame';

describe('parsePhotorealRefractionFrame', () => {
  it('rejects malformed or non-positive viewports', () => {
    expect(parsePhotorealRefractionFrame(null)).toBeNull();
    expect(parsePhotorealRefractionFrame({ viewport: { width: 0, height: 900 }, droplets: [] })).toBeNull();
    expect(parsePhotorealRefractionFrame({ viewport: { width: 1440, height: Number.NaN }, droplets: [] })).toBeNull();
    expect(parsePhotorealRefractionFrame({ viewport: { width: 1440, height: 900 }, droplets: {} })).toBeNull();
  });

  it('bounds geometry before it reaches the native helper', () => {
    const frame = parsePhotorealRefractionFrame({
      viewport: { width: 50_000, height: 900 },
      droplets: [
        { x: -50_000, y: 80_000, radiusX: 0.1, radiusY: 5_000, opacity: 3, refraction: -4, seed: 2e12 },
        { x: 10, y: 10, radiusX: -1, radiusY: 4 },
        'invalid',
      ],
    });

    expect(frame).toEqual({
      width: 16_384,
      height: 900,
      droplets: [{
        x: -1024,
        y: 1924,
        radiusX: 0.5,
        radiusY: 1024,
        opacity: 1,
        refraction: 0,
        seed: 1_000_000_000,
      }],
      protectedRects: [],
    });
  });

  it('limits droplet count before serializing native IPC', () => {
    const droplets = Array.from({ length: 900 }, (_, index) => ({
      x: index,
      y: index,
      radiusX: 2,
      radiusY: 3,
    }));
    const frame = parsePhotorealRefractionFrame({ viewport: { width: 1440, height: 900 }, droplets });

    expect(frame?.droplets).toHaveLength(768);
  });

  it('clamps protected regions and preserves a hard full-canvas mask', () => {
    expect(parsePhotorealRefractionFrame({
      viewport: { width: 1000, height: 800 },
      protectedMask: { x: -20, y: -10, width: 2000, height: 1600 },
      droplets: [],
    })?.protectedRects).toEqual([{ x: 0, y: 0, width: 1000, height: 800, cornerRadius: 0 }]);

    expect(parsePhotorealRefractionFrame({
      viewport: { width: 1000, height: 800 },
      protectedMask: { x: 100, y: 120, width: 500, height: 300 },
      droplets: [],
    })?.protectedRects).toEqual([{ x: 100, y: 120, width: 500, height: 300, cornerRadius: 12 }]);
  });

  it('intersects partially offscreen masks instead of shifting their size', () => {
    const parseMask = (protectedMask: { x: number; y: number; width: number; height: number }) =>
      parsePhotorealRefractionFrame({
        viewport: { width: 1000, height: 800 },
        protectedMask,
        droplets: [],
      })?.protectedRects[0];

    expect(parseMask({ x: -20, y: 100, width: 100, height: 200 }))
      .toEqual({ x: 0, y: 100, width: 80, height: 200, cornerRadius: 6.4 });
    expect(parseMask({ x: 940, y: 100, width: 100, height: 200 }))
      .toEqual({ x: 940, y: 100, width: 60, height: 200, cornerRadius: 4.8 });
    const clippedTop = parseMask({ x: 100, y: -30, width: 200, height: 100 });
    expect(clippedTop).toMatchObject({ x: 100, y: 0, width: 200, height: 70 });
    expect(clippedTop?.cornerRadius).toBeCloseTo(5.6);
    expect(parseMask({ x: 100, y: 760, width: 200, height: 100 }))
      .toEqual({ x: 100, y: 760, width: 200, height: 40, cornerRadius: 3.2 });
  });
});
