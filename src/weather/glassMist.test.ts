import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGlassMist, sampleGlassMoisture } from './glassMist';

afterEach(() => vi.unstubAllGlobals());

describe('glass moisture field', () => {
  it('has stable wet and dry islands with continuous transitions', () => {
    const samples = Array.from({ length: 300 }, (_, i) => sampleGlassMoisture((i % 20) * 80, Math.floor(i / 20) * 70));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.55);
    expect(samples.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(sampleGlassMoisture(320, 170)).toBe(sampleGlassMoisture(320, 170));
    expect(Math.abs(sampleGlassMoisture(320, 170) - sampleGlassMoisture(320.1, 170.1))).toBeLessThan(0.01);
    expect(sampleGlassMoisture(Infinity, 100)).toBe(0);
  });

  it('reuses a bounded texture on large monitors and refreshes its palette', () => {
    const create = vi.fn(() => {
      const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
      canvas.getContext = (() => ({
        createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData() {}, fillRect() {}, drawImage() {}, clearRect() {},
      })) as unknown as HTMLCanvasElement['getContext'];
      return canvas;
    });
    vi.stubGlobal('document', { createElement: create });
    const owner = {} as CanvasRenderingContext2D;
    const first = getGlassMist(5120, 2160, '#abc', owner)!;
    expect(Math.max(first.width, first.height)).toBeLessThanOrEqual(512);
    expect(first.width * first.height).toBeLessThanOrEqual(512 * 512);
    expect(getGlassMist(5120, 2160, '#abc', owner)).toBe(first);
    expect(create).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 45; i++) {
      expect(getGlassMist(5120, 2160, `rgba(${i}, 180, 200, 0.8)`, owner)).toBe(first);
    }
    expect(create).toHaveBeenCalledTimes(2);
    expect(getGlassMist(5120, 2160, '#def', {} as CanvasRenderingContext2D)).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(3);
    expect(getGlassMist(0, 2160, '#abc', owner)).toBeNull();
  });
});
