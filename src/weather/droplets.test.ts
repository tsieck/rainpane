import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/settingsStore';
import { ellipseIntersectsRect } from './masks';
import {
  createDroplet,
  getDropletBudget,
  getRunnerNeckGeometry,
  mergeNearbyDroplets,
  syncDroplets,
  updateDroplets,
  type RandomSource,
} from './droplets';
import type { Droplet, WeatherSettings } from './types';

function seededRandom(seed = 1): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function settings(overrides: Partial<WeatherSettings> = {}): WeatherSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function requiredDroplet(
  width: number,
  height: number,
  weatherSettings: WeatherSettings,
  rng: RandomSource,
  kind: Droplet['kind'],
) {
  const droplet = createDroplet(width, height, null, weatherSettings, rng, kind);
  expect(droplet).not.toBeNull();
  return droplet as Droplet;
}

describe('wet pane droplet spawning', () => {
  it('returns null when the protected mask occupies the full pane', () => {
    const droplet = createDroplet(
      120,
      80,
      { x: 0, y: 0, width: 120, height: 80 },
      settings(),
      seededRandom(2),
      'micro',
    );

    expect(droplet).toBeNull();
  });

  it('uses bounded outside-mask regions for every droplet size', () => {
    const width = 260;
    const height = 180;
    const protectedMask = { x: 72, y: 32, width: 116, height: 116 };
    const rng = seededRandom(14);

    for (let index = 0; index < 90; index += 1) {
      const kind: Droplet['kind'] = index % 3 === 0 ? 'pane' : index % 3 === 1 ? 'bead' : 'micro';
      const droplet = createDroplet(width, height, protectedMask, settings(), rng, kind);
      expect(droplet).not.toBeNull();
      expect(droplet!.x - droplet!.radiusX).toBeGreaterThanOrEqual(1);
      expect(droplet!.x + droplet!.radiusX).toBeLessThanOrEqual(width - 1);
      expect(droplet!.y - droplet!.radiusY).toBeGreaterThanOrEqual(1);
      expect(droplet!.y + droplet!.radiusY).toBeLessThanOrEqual(height - 1);
      expect(
        ellipseIntersectsRect(
          droplet!.x,
          droplet!.y,
          droplet!.radiusX,
          droplet!.radiusY,
          protectedMask,
          2,
        ),
      ).toBe(false);
    }
  });

  it('places forced runners into tall gutters with useful vertical runway', () => {
    const width = 700;
    const height = 640;
    const protectedMask = { x: 190, y: 80, width: 320, height: 480 };
    const rng = seededRandom(101);
    let gutterRunners = 0;

    for (let index = 0; index < 120; index += 1) {
      const droplet = createDroplet(width, height, protectedMask, settings(), rng, 'pane');
      expect(droplet).not.toBeNull();
      if (droplet!.y >= protectedMask.y && droplet!.y <= protectedMask.y + protectedMask.height) {
        gutterRunners += 1;
      }
    }

    expect(gutterRunners).toBeGreaterThan(88);
  });
});

describe('wet pane population budgets', () => {
  it('honors every render cap and reserves runners only when motion is allowed', () => {
    const reduced = getDropletBudget(2560, 1440, settings({ reducedMotion: true, lowPowerMode: false }));
    const conservative = getDropletBudget(
      2560,
      1440,
      settings({ reducedMotion: false, lowPowerMode: false, renderBudget: 'conservative' }),
    );
    const lowPower = getDropletBudget(2560, 1440, settings({ reducedMotion: false, lowPowerMode: true }));
    const standard = getDropletBudget(2560, 1440, settings({ reducedMotion: false, lowPowerMode: false }));

    expect(reduced.cap).toBe(88);
    expect(reduced.runnerQuota).toBe(0);
    expect(conservative.cap).toBe(140);
    expect(conservative.target).toBeLessThanOrEqual(conservative.cap);
    expect(lowPower.cap).toBe(220);
    expect(lowPower.target).toBeLessThanOrEqual(lowPower.cap);
    expect(standard.cap).toBe(360);
    expect(standard.target).toBeLessThanOrEqual(standard.cap);
  });

  it('scales a restrained runner population for preview panes and overlays', () => {
    const preview = getDropletBudget(520, 320, settings());
    const overlay = getDropletBudget(1280, 800, settings());

    expect(preview.target).toBeGreaterThan(0);
    expect(preview.runnerQuota).toBeGreaterThanOrEqual(2);
    expect(preview.runnerQuota).toBeLessThanOrEqual(4);
    expect(overlay.runnerQuota).toBeGreaterThanOrEqual(3);
    expect(overlay.runnerQuota).toBeLessThanOrEqual(5);
  });

  it('makes density primarily change population size', () => {
    const sparse = getDropletBudget(1100, 740, settings({ lowPowerMode: false, dropletDensity: 0.12 }));
    const dense = getDropletBudget(1100, 740, settings({ lowPowerMode: false, dropletDensity: 0.72 }));

    expect(dense.target).toBeGreaterThan(sparse.target * 2);
  });

  it('fills the budget and enforces runner quota deterministically', () => {
    const droplets: Droplet[] = [];
    const weatherSettings = settings({ lowPowerMode: false });
    const budget = getDropletBudget(720, 420, weatherSettings);

    syncDroplets(droplets, 720, 420, weatherSettings, null, seededRandom(91));

    expect(droplets).toHaveLength(budget.target);
    expect(droplets.filter((droplet) => droplet.state === 'running').length).toBeGreaterThanOrEqual(
      budget.runnerQuota,
    );
    expect(new Set(droplets.map((droplet) => droplet.id)).size).toBe(droplets.length);
  });
});

describe('wet pane motion', () => {
  it('keeps fresh runner heads broad and limits the attached wet neck', () => {
    const weatherSettings = settings({ reducedMotion: false });
    const droplet = requiredDroplet(600, 400, weatherSettings, seededRandom(4), 'pane');
    expect(droplet.radiusY / droplet.radiusX).toBeLessThanOrEqual(1.82);

    droplet.state = 'running';
    droplet.velocityY = 76;
    droplet.hold = 0;
    droplet.runAge = 0;
    expect(getRunnerNeckGeometry(droplet)).toBeNull();

    droplet.runAge = 0.4;
    const neck = getRunnerNeckGeometry(droplet);
    expect(neck).not.toBeNull();
    expect(neck!.length).toBeLessThanOrEqual(12);
    expect(neck!.shoulderWidth).toBeGreaterThan(neck!.trailWidth);
    expect(neck!.trailWidth / neck!.shoulderWidth).toBeGreaterThanOrEqual(0.5);

    droplet.hold = 0.2;
    droplet.velocityY = 1;
    expect(getRunnerNeckGeometry(droplet)).toBeNull();
  });

  it('keeps pinned micro-beads spatially stable', () => {
    const weatherSettings = settings();
    const droplet = requiredDroplet(600, 400, weatherSettings, seededRandom(7), 'micro');
    droplet.state = 'pinned';
    droplet.pinning = droplet.mass + 100;
    const start = { x: droplet.x, y: droplet.y };

    updateDroplets([droplet], 600, 400, 0.15, weatherSettings, null, seededRandom(8));

    expect(droplet.x).toBe(start.x);
    expect(droplet.y).toBe(start.y);
    expect(droplet.velocityX).toBe(0);
    expect(droplet.velocityY).toBe(0);
  });

  it('pins all drops immediately in reduced-motion mode', () => {
    const animatedSettings = settings({ reducedMotion: false });
    const droplet = requiredDroplet(600, 400, animatedSettings, seededRandom(17), 'pane');
    const start = { x: droplet.x, y: droplet.y };

    updateDroplets(
      [droplet],
      600,
      400,
      0.16,
      settings({ reducedMotion: true }),
      null,
      seededRandom(18),
    );

    expect(droplet.state).toBe('pinned');
    expect(droplet.x).toBe(start.x);
    expect(droplet.y).toBe(start.y);
    expect(droplet.velocityY).toBe(0);
  });

  it('recycles expired drops into finite fresh state', () => {
    const weatherSettings = settings();
    const droplets = [requiredDroplet(640, 420, weatherSettings, seededRandom(30), 'pane')];
    const expiredId = droplets[0].id;
    droplets[0].age = droplets[0].lifetime + 1;

    updateDroplets(droplets, 640, 420, 0.016, weatherSettings, null, seededRandom(31));

    expect(droplets).toHaveLength(1);
    expect(droplets[0].id).not.toBe(expiredId);
    for (const value of Object.values(droplets[0])) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('respawns a runner when it disappears behind the protected pane', () => {
    const weatherSettings = settings({ reducedMotion: false });
    const droplet = requiredDroplet(640, 420, weatherSettings, seededRandom(35), 'pane');
    Object.assign(droplet, {
      state: 'running' as const,
      x: 240,
      y: 160,
      prevX: 240,
      prevY: 160,
      hold: 0,
      velocityY: 24,
    });
    const id = droplet.id;
    const droplets = [droplet];

    updateDroplets(
      droplets,
      640,
      420,
      0.1,
      weatherSettings,
      { x: 180, y: 100, width: 240, height: 180 },
      seededRandom(36),
    );

    expect(droplets[0].id).not.toBe(id);
    expect(
      ellipseIntersectsRect(
        droplets[0].x,
        droplets[0].y,
        droplets[0].radiusX,
        droplets[0].radiusY,
        { x: 180, y: 100, width: 240, height: 180 },
        2,
      ),
    ).toBe(false);
  });
});

describe('wet pane merging', () => {
  it('conserves projected area and promotes an absorbing runner', () => {
    const weatherSettings = settings({ reducedMotion: false });
    const runner = requiredDroplet(500, 320, weatherSettings, seededRandom(41), 'pane');
    const bead = requiredDroplet(500, 320, weatherSettings, seededRandom(42), 'bead');
    Object.assign(runner, {
      state: 'running' as const,
      kind: 'pane' as const,
      x: 180,
      y: 120,
      prevX: 179,
      prevY: 118,
      radiusX: 4,
      radiusY: 4,
      mass: 16,
      velocityX: 0,
      velocityY: 12,
      pinning: 7,
    });
    Object.assign(bead, {
      state: 'pinned' as const,
      kind: 'bead' as const,
      x: 184,
      y: 122,
      prevX: 184,
      prevY: 122,
      radiusX: 3,
      radiusY: 3,
      mass: 9,
      velocityX: 0,
      velocityY: 0,
      pinning: 18,
    });
    const droplets = [runner, bead];

    const merges = mergeNearbyDroplets(droplets, weatherSettings, 4);

    expect(merges).toBe(1);
    expect(droplets).toHaveLength(1);
    expect(droplets[0].id).toBe(runner.id);
    expect(droplets[0].mass).toBeCloseTo(25, 8);
    expect(droplets[0].radiusX * droplets[0].radiusY).toBeCloseTo(25, 8);
    expect(droplets[0].state).toBe('running');
    expect(droplets[0].velocityY).toBeGreaterThan(12);
    expect(droplets[0].mergePulse).toBe(1);
  });

  it('does not merge separated drops', () => {
    const weatherSettings = settings();
    const first = requiredDroplet(500, 320, weatherSettings, seededRandom(50), 'bead');
    const second = requiredDroplet(500, 320, weatherSettings, seededRandom(51), 'bead');
    first.x = 20;
    first.y = 20;
    second.x = 420;
    second.y = 260;
    const droplets = [first, second];

    expect(mergeNearbyDroplets(droplets, weatherSettings)).toBe(0);
    expect(droplets).toHaveLength(2);
  });

  it('hard-limits work in dense clusters', () => {
    const weatherSettings = settings();
    const droplets = Array.from({ length: 8 }, (_, index) => {
      const droplet = requiredDroplet(500, 320, weatherSettings, seededRandom(70 + index), 'bead');
      droplet.x = 200 + index * 0.2;
      droplet.y = 140 + index * 0.2;
      return droplet;
    });

    expect(mergeNearbyDroplets(droplets, weatherSettings, 2)).toBe(2);
    expect(droplets).toHaveLength(6);
  });
});
