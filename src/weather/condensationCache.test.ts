import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import { WetGlassCondensationField } from './wetGlassCondensation';

function canvasHarness() {
  const contexts: CanvasRenderingContext2D[] = [];
  const createCanvas = () => {
    const canvas = { width: 300, height: 150 } as HTMLCanvasElement;
    const ctx = {
      canvas,
      setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
      scale: vi.fn(), stroke: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext;
    contexts.push(ctx);
    return canvas;
  };
  vi.stubGlobal('document', { createElement: createCanvas });
  vi.stubGlobal('Path2D', class { moveTo() {} ellipse() {} arc() {} });
  return { createCanvas, contexts };
}

afterEach(() => vi.unstubAllGlobals());

describe('condensation raster cache', () => {
  it('preserves stationary rims across frames and scene changes', () => {
    const { createCanvas, contexts } = canvasHarness();
    const target = createCanvas();
    target.width = 1600;
    target.height = 1200;
    const ctx = target.getContext('2d')!;
    const field = new WetGlassCondensationField();
    const settings = { ...DEFAULT_SETTINGS, dropletDensity: 0.05 };
    const draw = (mode = settings.mode) => {
      field.draw(ctx, 800, 600, { ...settings, mode });
      field.drawDetail(ctx, 800, 600, { ...settings, mode });
    };
    draw();
    const rimContext = contexts.find((context) => vi.mocked(context.stroke).mock.calls.length > 0)!;
    expect(rimContext).toBeDefined();
    expect(rimContext.stroke).toHaveBeenCalledTimes(2);
    draw();
    draw();
    expect(rimContext.stroke).toHaveBeenCalledTimes(2);
    draw('winterglass');
    expect(rimContext.stroke).toHaveBeenCalledTimes(2);
    field.reset();
    draw('winterglass');
    expect(rimContext.stroke).toHaveBeenCalledTimes(4);
  });

  it('bounds the additional rim texture on a 5K Retina pane', () => {
    const { createCanvas, contexts } = canvasHarness();
    const target = createCanvas();
    target.width = 5120;
    target.height = 2880;
    const ctx = target.getContext('2d')!;
    const field = new WetGlassCondensationField();
    const settings = { ...DEFAULT_SETTINGS, dropletDensity: 0.05 };
    field.draw(ctx, 2560, 1440, settings);
    field.drawDetail(ctx, 2560, 1440, settings);
    const rim = contexts.find((context) => vi.mocked(context.stroke).mock.calls.length > 0)!.canvas;
    expect(rim.width * rim.height).toBeLessThanOrEqual(4_000_000);
    expect(rim.width).toBeLessThanOrEqual(3072);
  });

  it('keeps existing bead positions when a new scene adds density', () => {
    const { createCanvas, contexts } = canvasHarness();
    const ctx = createCanvas().getContext('2d')!;
    const field = new WetGlassCondensationField();
    field.draw(ctx, 800, 600, { ...DEFAULT_SETTINGS, dropletDensity: 0.1 });
    const film = contexts.find((context) => vi.mocked(context.drawImage).mock.calls.length > 10)!;
    const first = vi.mocked(film.drawImage).mock.calls.map((call) => call.slice(1));
    vi.mocked(film.drawImage).mockClear();
    field.draw(ctx, 800, 600, { ...DEFAULT_SETTINGS, mode: 'storm-lock-in', dropletDensity: 0.7 });
    const next = vi.mocked(film.drawImage).mock.calls.map((call) => call.slice(1));
    expect(next.length).toBeGreaterThan(first.length);
    expect(next.slice(0, first.length)).toEqual(first);
  });
});
