import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import type { Droplet } from './types';
import { getFreshTrailDetailProfile, WetGlassTrailField } from './wetGlassTrails';

function runner(overrides: Partial<Droplet> = {}): Droplet {
  return {
    id: 1,
    kind: 'pane',
    state: 'running',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    radiusX: 6,
    radiusY: 9,
    opacity: 0.8,
    age: 1,
    lifetime: 40,
    velocityX: 0,
    velocityY: 24,
    mass: 54,
    pinning: 20,
    hold: 0,
    runAge: 1,
    mergePulse: 0,
    seed: 1.4,
    refraction: 0.8,
    highlight: 1,
    ...overrides,
  };
}

function recordingContext() {
  const ellipses: Array<{ x: number; y: number; radiusX: number; radiusY: number }> = [];
  const context = {
    globalAlpha: 1,
    beginPath() {},
    moveTo() {},
    ellipse(x: number, y: number, radiusX: number, radiusY: number) {
      ellipses.push({ x, y, radiusX, radiusY });
    },
  } as unknown as CanvasRenderingContext2D;

  return { context, ellipses };
}

describe('wet glass trail accumulation', () => {
  it('keeps only a short, bounded set of shoulders in the detail pass', () => {
    const standard = getFreshTrailDetailProfile(DEFAULT_SETTINGS);
    const conservative = getFreshTrailDetailProfile({
      ...DEFAULT_SETTINGS,
      renderBudget: 'conservative',
    });

    expect(standard.lifetime).toBeLessThan(1);
    expect(standard.maxFragments).toBeLessThanOrEqual(96);
    expect(conservative.lifetime).toBeLessThan(standard.lifetime);
    expect(conservative.maxFragments).toBeLessThan(standard.maxFragments);
  });

  it('accumulates sub-threshold runner motion before stamping once', () => {
    const field = new WetGlassTrailField() as unknown as {
      stampSegment: (
        ctx: CanvasRenderingContext2D,
        droplet: Droplet,
        scale: number,
        shoulderCtx: CanvasRenderingContext2D,
      ) => { coverage: number; shoulder: number };
    };
    const coverage = recordingContext();
    const shoulder = recordingContext();
    const droplet = runner({ prevY: 10, y: 10.4 });

    field.stampSegment(coverage.context, droplet, 0.4, shoulder.context);
    expect(coverage.ellipses).toHaveLength(0);

    droplet.prevY = droplet.y;
    droplet.y = 14;
    const stamps = field.stampSegment(coverage.context, droplet, 0.4, shoulder.context);
    expect(stamps.coverage).toBeGreaterThan(0);
    expect(coverage.ellipses).toHaveLength(stamps.coverage);
    expect(shoulder.ellipses.length).toBeLessThanOrEqual(coverage.ellipses.length);
  });

  it('rejects teleport trails and resumes from the new position', () => {
    const field = new WetGlassTrailField() as unknown as {
      stampSegment: (
        ctx: CanvasRenderingContext2D,
        droplet: Droplet,
        scale: number,
        shoulderCtx: CanvasRenderingContext2D,
      ) => { coverage: number; shoulder: number };
    };
    const coverage = recordingContext();
    const shoulder = recordingContext();
    const droplet = runner({ prevY: 10, y: 200 });

    field.stampSegment(coverage.context, droplet, 0.4, shoulder.context);
    expect(coverage.ellipses).toHaveLength(0);

    droplet.prevY = droplet.y;
    droplet.y = 204;
    const stamps = field.stampSegment(coverage.context, droplet, 0.4, shoulder.context);
    expect(stamps.coverage).toBeGreaterThan(0);
    expect(coverage.ellipses).toHaveLength(stamps.coverage);
  });

  it('uses broken light-facing shoulder fragments instead of a centerline stroke', () => {
    const field = new WetGlassTrailField() as unknown as {
      stampSegment: (
        ctx: CanvasRenderingContext2D,
        droplet: Droplet,
        scale: number,
        shoulderCtx: CanvasRenderingContext2D,
        budget?: { coverageRemaining: number; sheenRemaining: number },
        freshShoulders?: Array<{ age: number; lifetime: number }>,
        freshLifetime?: number,
      ) => { coverage: number; shoulder: number };
    };
    const coverage = recordingContext();
    const shoulder = recordingContext();
    const droplet = runner({ id: 18, prevY: 20, y: 52, seed: 2.1 });
    const freshShoulders: Array<{ age: number; lifetime: number }> = [];

    const stamps = field.stampSegment(
      coverage.context,
      droplet,
      0.4,
      shoulder.context,
      undefined,
      freshShoulders,
      0.5,
    );

    expect(stamps.coverage).toBeGreaterThan(2);
    expect(stamps.coverage).toBeLessThanOrEqual(8);
    expect(stamps.shoulder).toBeGreaterThan(0);
    expect(stamps.shoulder).toBeLessThan(stamps.coverage);
    expect(stamps.shoulder).toBeLessThanOrEqual(4);
    expect(freshShoulders).toHaveLength(stamps.shoulder);
    expect(freshShoulders.every((fragment) => fragment.age === 0 && fragment.lifetime === 0.5)).toBe(true);
    expect(coverage.ellipses.every((stamp) => stamp.radiusX > 0 && stamp.radiusY > 0)).toBe(true);
    expect(shoulder.ellipses.every((stamp) => stamp.x < 0)).toBe(true);
  });
});
