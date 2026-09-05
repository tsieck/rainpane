import { ellipseIntersectsRect } from './masks';
import {
  DROPLET_OPTICAL_VARIANTS,
  drawOpticalDroplet,
  getDropletOpticalVariant,
  type OpticalDropletShape,
} from './dropletOptics';
import type { Droplet, Rect, WeatherSettings } from './types';

export type RandomSource = () => number;

type DropletKind = Droplet['kind'];
type DropletState = Droplet['state'];

interface SpawnRect extends Rect {
  area: number;
}

interface DropletBudget {
  target: number;
  cap: number;
  runnerQuota: number;
}

export interface RunnerNeckGeometry {
  length: number;
  shoulderWidth: number;
  trailWidth: number;
  bend: number;
  alpha: number;
}

const TAU = Math.PI * 2;
const MASK_GAP = 2;
const HASH_CELL_SIZE = 32;
const MAX_UPDATE_SECONDS = 0.18;
const MAX_SUBSTEP_SECONDS = 1 / 30;

let nextDropletId = 1;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unitRandom(rng: RandomSource) {
  const value = rng();
  return Number.isFinite(value) ? clamp(value, 0, 0.999999999) : 0.5;
}

function randomBetween(min: number, max: number, rng: RandomSource) {
  return min + (max - min) * unitRandom(rng);
}

function chooseKind(rng: RandomSource): DropletKind {
  const roll = unitRandom(rng);
  if (roll < 0.57) {
    return 'micro';
  }
  if (roll < 0.955) {
    return 'bead';
  }
  return 'pane';
}

function makeDimensions(kind: DropletKind, rng: RandomSource) {
  if (kind === 'micro') {
    const radiusX = 0.78 + Math.pow(unitRandom(rng), 2.7) * 1.82;
    return { radiusX, radiusY: radiusX * randomBetween(0.84, 1.3, rng) };
  }

  if (kind === 'bead') {
    const radiusX = 2.1 + Math.pow(unitRandom(rng), 1.65) * 4.8;
    return { radiusX, radiusY: radiusX * randomBetween(0.78, 1.38, rng) };
  }

  const radiusX = 6 + Math.pow(unitRandom(rng), 1.45) * 5.2;
  return { radiusX, radiusY: radiusX * randomBetween(1.28, 1.82, rng) };
}

function initialState(kind: DropletKind, settings: WeatherSettings, rng: RandomSource, forcedKind?: DropletKind): DropletState {
  if (settings.reducedMotion || kind === 'micro') {
    return 'pinned';
  }
  if (kind === 'pane') {
    return forcedKind === 'pane' || unitRandom(rng) < 0.84 ? 'running' : 'creeping';
  }
  return unitRandom(rng) < 0.22 ? 'creeping' : 'pinned';
}

function normalizedRect(rect: Rect) {
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return { left, right, top, bottom };
}

function pushSpawnRect(rects: SpawnRect[], x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return;
  }
  rects.push({ x, y, width, height, area: width * height });
}

function getSpawnRects(width: number, height: number, radiusX: number, radiusY: number, protectedMask: Rect | null) {
  const left = radiusX + 1;
  const top = radiusY + 1;
  const right = width - radiusX - 1;
  const bottom = height - radiusY - 1;
  const domainWidth = right - left;
  const domainHeight = bottom - top;

  if (domainWidth <= 0 || domainHeight <= 0) {
    return [];
  }

  if (!protectedMask) {
    return [{ x: left, y: top, width: domainWidth, height: domainHeight, area: domainWidth * domainHeight }];
  }

  const mask = normalizedRect(protectedMask);
  const blockLeft = clamp(mask.left - radiusX - MASK_GAP, left, right);
  const blockRight = clamp(mask.right + radiusX + MASK_GAP, left, right);
  const blockTop = clamp(mask.top - radiusY - MASK_GAP, top, bottom);
  const blockBottom = clamp(mask.bottom + radiusY + MASK_GAP, top, bottom);

  if (mask.right + radiusX + MASK_GAP <= left || mask.left - radiusX - MASK_GAP >= right || mask.bottom + radiusY + MASK_GAP <= top || mask.top - radiusY - MASK_GAP >= bottom) {
    return [{ x: left, y: top, width: domainWidth, height: domainHeight, area: domainWidth * domainHeight }];
  }

  const rects: SpawnRect[] = [];
  pushSpawnRect(rects, left, top, domainWidth, blockTop - top);
  pushSpawnRect(rects, left, blockBottom, domainWidth, bottom - blockBottom);

  const middleTop = Math.max(top, blockTop);
  const middleBottom = Math.min(bottom, blockBottom);
  const middleHeight = middleBottom - middleTop;
  pushSpawnRect(rects, left, middleTop, blockLeft - left, middleHeight);
  pushSpawnRect(rects, blockRight, middleTop, right - blockRight, middleHeight);
  return rects;
}

function chooseSpawnPoint(
  rects: SpawnRect[],
  height: number,
  rng: RandomSource,
  preferVerticalRunway = false,
) {
  const weightedRects = rects.map((rect) => ({
    rect,
    weight: preferVerticalRunway
      ? rect.area * (0.12 + Math.pow(clamp(rect.height / Math.max(1, height), 0, 1), 1.5) * 3.2)
      : rect.area,
  }));
  const totalWeight = weightedRects.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  let weightRoll = unitRandom(rng) * totalWeight;
  let chosen = weightedRects[weightedRects.length - 1].rect;
  for (const entry of weightedRects) {
    if (weightRoll <= entry.weight) {
      chosen = entry.rect;
      break;
    }
    weightRoll -= entry.weight;
  }

  return {
    x: chosen.x + unitRandom(rng) * chosen.width,
    y: chosen.y + (preferVerticalRunway ? Math.pow(unitRandom(rng), 1.65) : unitRandom(rng)) * chosen.height,
  };
}

export function createDroplet(
  width: number,
  height: number,
  protectedMask: Rect | null,
  settings: WeatherSettings,
  rng: RandomSource = Math.random,
  forcedKind?: DropletKind,
): Droplet | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const kind = forcedKind ?? chooseKind(rng);
  const { radiusX, radiusY } = makeDimensions(kind, rng);
  const spawnPoint = chooseSpawnPoint(
    getSpawnRects(width, height, radiusX, radiusY, protectedMask),
    height,
    rng,
    forcedKind === 'pane' && !settings.reducedMotion,
  );
  if (!spawnPoint || (protectedMask && ellipseIntersectsRect(spawnPoint.x, spawnPoint.y, radiusX, radiusY, protectedMask, MASK_GAP))) {
    return null;
  }

  const state = initialState(kind, settings, rng, forcedKind);
  const mass = radiusX * radiusY;
  const pinningMultiplier = state === 'pinned' ? randomBetween(1.45, 2.35, rng) : state === 'creeping' ? randomBetween(0.82, 1.08, rng) : randomBetween(0.34, 0.62, rng);
  const age = randomBetween(0, kind === 'micro' ? 8 : 3, rng);
  const lifetime =
    state === 'running'
      ? randomBetween(24, 58, rng)
      : state === 'creeping'
        ? randomBetween(48, 96, rng)
        : randomBetween(82, 168, rng);

  return {
    id: nextDropletId++,
    kind,
    state,
    x: spawnPoint.x,
    y: spawnPoint.y,
    prevX: spawnPoint.x,
    prevY: spawnPoint.y,
    radiusX,
    radiusY,
    opacity:
      kind === 'micro'
        ? randomBetween(0.42, 0.64, rng)
        : kind === 'pane'
          ? randomBetween(0.62, 0.86, rng)
          : randomBetween(0.54, 0.78, rng),
    age,
    lifetime,
    velocityX: 0,
    velocityY: state === 'running' ? randomBetween(10, 26, rng) : state === 'creeping' ? randomBetween(0.4, 1.8, rng) : 0,
    mass,
    pinning: mass * pinningMultiplier + (state === 'pinned' ? 5 : 0),
    hold: state === 'running' ? randomBetween(0, 0.38, rng) : state === 'creeping' ? randomBetween(0, 1.1, rng) : 0,
    runAge: 0,
    mergePulse: 0,
    seed: randomBetween(0, TAU, rng),
    refraction: randomBetween(kind === 'micro' ? 0.45 : 0.62, 0.96, rng),
    highlight: randomBetween(kind === 'micro' ? 0.72 : 0.92, 1.42, rng),
  };
}

export function getDropletBudget(width: number, height: number, settings: WeatherSettings): DropletBudget {
  const cap = settings.reducedMotion
    ? 88
    : settings.renderBudget === 'conservative'
      ? 140
      : settings.lowPowerMode
        ? 220
        : 360;
  const area = Math.max(0, width) * Math.max(0, height);
  const density = clamp(settings.dropletDensity, 0, 1);

  if (!settings.dropletsEnabled || density <= 0.005 || area <= 0) {
    return { target: 0, cap, runnerQuota: 0 };
  }

  const modeScale = settings.mode === 'night-drive' ? 1.1 : settings.mode === 'storm-lock-in' ? 1.08 : settings.mode === 'winterglass' ? 0.78 : settings.mode === 'greyglass' ? 0.92 : 1;
  const areaScale = clamp(Math.sqrt(area / 400_000), 0.65, 1.55);
  const densityCurve = Math.pow(density, 0.82);
  const rawTarget = cap * (0.08 + densityCurve * 0.92) * areaScale * modeScale;
  const target = Math.min(cap, Math.max(1, Math.round(rawTarget)));
  const runnerQuota = settings.reducedMotion || target === 0
    ? 0
    : Math.min(
      target,
      10,
      Math.max(1, Math.round(1 + density * 7) + (area >= 700_000 ? 1 : 0)),
    );

  return { target, cap, runnerQuota };
}

function isFiniteDroplet(droplet: Droplet) {
  return [
    droplet.x,
    droplet.y,
    droplet.prevX,
    droplet.prevY,
    droplet.radiusX,
    droplet.radiusY,
    droplet.opacity,
    droplet.age,
    droplet.lifetime,
    droplet.velocityX,
    droplet.velocityY,
    droplet.mass,
    droplet.pinning,
    droplet.hold,
    droplet.runAge,
    droplet.mergePulse,
    droplet.seed,
    droplet.refraction,
    droplet.highlight,
  ].every(Number.isFinite) && droplet.radiusX > 0 && droplet.radiusY > 0 && droplet.mass > 0;
}

function pinDroplet(droplet: Droplet) {
  droplet.state = 'pinned';
  droplet.velocityX = 0;
  droplet.velocityY = 0;
  droplet.hold = 0;
  droplet.pinning = Math.max(droplet.pinning, droplet.mass * 1.2 + 3);
}

function reshapeDroplet(droplet: Droplet, aspect: number) {
  const safeAspect = clamp(aspect, 0.72, 2.7);
  droplet.radiusX = Math.sqrt(droplet.mass / safeAspect);
  droplet.radiusY = droplet.mass / droplet.radiusX;
}

function promoteToRunner(droplet: Droplet, rng: RandomSource) {
  droplet.kind = 'pane';
  droplet.state = 'running';
  droplet.pinning = Math.min(droplet.pinning, droplet.mass * 0.58);
  droplet.hold = randomBetween(0, 0.22, rng);
  droplet.runAge = 0;
  droplet.velocityY = Math.max(droplet.velocityY, 10 + Math.sqrt(droplet.mass) * 2.4);
  reshapeDroplet(droplet, clamp(droplet.radiusY / droplet.radiusX, 1.28, 1.82));
}

function removeToTarget(droplets: Droplet[], target: number) {
  while (droplets.length > target) {
    let index = droplets.length - 1;
    for (let candidate = droplets.length - 1; candidate >= 0; candidate -= 1) {
      if (droplets[candidate].state !== 'running') {
        index = candidate;
        break;
      }
    }
    droplets.splice(index, 1);
  }
}

function ensureRunnerQuota(
  droplets: Droplet[],
  width: number,
  height: number,
  protectedMask: Rect | null,
  settings: WeatherSettings,
  quota: number,
  rng: RandomSource,
) {
  if (settings.reducedMotion || quota <= 0) {
    for (const droplet of droplets) {
      pinDroplet(droplet);
    }
    return;
  }

  let runnerCount = droplets.reduce((count, droplet) => count + Number(droplet.state === 'running'), 0);
  while (runnerCount < Math.min(quota, droplets.length)) {
    let replacementIndex = -1;
    for (let index = 0; index < droplets.length; index += 1) {
      if (droplets[index].state !== 'running' && (replacementIndex < 0 || droplets[index].mass < droplets[replacementIndex].mass)) {
        replacementIndex = index;
      }
    }

    if (replacementIndex < 0) {
      break;
    }

    const runner = createDroplet(width, height, protectedMask, settings, rng, 'pane');
    if (runner) {
      droplets[replacementIndex] = runner;
    } else {
      let largestIndex = replacementIndex;
      for (let index = 0; index < droplets.length; index += 1) {
        if (droplets[index].state !== 'running' && droplets[index].mass > droplets[largestIndex].mass) {
          largestIndex = index;
        }
      }
      promoteToRunner(droplets[largestIndex], rng);
    }
    runnerCount += 1;
  }
}

export function syncDroplets(
  droplets: Droplet[],
  width: number,
  height: number,
  settings: WeatherSettings,
  protectedMask: Rect | null,
  rng: RandomSource = Math.random,
) {
  const budget = getDropletBudget(width, height, settings);
  if (budget.target === 0) {
    droplets.length = 0;
    return;
  }

  for (let index = droplets.length - 1; index >= 0; index -= 1) {
    const droplet = droplets[index];
    if (!isFiniteDroplet(droplet)) {
      droplets.splice(index, 1);
    }
  }

  removeToTarget(droplets, budget.target);

  let attempts = 0;
  let consecutiveFailures = 0;
  const maxAttempts = Math.max(12, (budget.target - droplets.length) * 4);
  while (droplets.length < budget.target && attempts < maxAttempts) {
    const droplet = createDroplet(width, height, protectedMask, settings, rng);
    attempts += 1;
    if (!droplet) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 8) {
        break;
      }
      continue;
    }
    consecutiveFailures = 0;
    droplets.push(droplet);
  }

  ensureRunnerQuota(droplets, width, height, protectedMask, settings, budget.runnerQuota, rng);
}

function advanceDropletStep(
  droplet: Droplet,
  step: number,
  settings: WeatherSettings,
  rng: RandomSource,
) {
  if (droplet.state === 'pinned') {
    droplet.velocityX = 0;
    droplet.velocityY = 0;
    if (droplet.mass > droplet.pinning) {
      droplet.state = 'creeping';
      droplet.hold = randomBetween(0.12, 0.7, rng);
    }
    return true;
  }

  if (droplet.hold > 0) {
    droplet.hold = Math.max(0, droplet.hold - step * settings.animationSpeed);
    droplet.velocityX *= Math.exp(-step * 12);
    droplet.velocityY *= Math.exp(-step * 12);
    return true;
  }

  const radius = Math.sqrt(droplet.mass);
  if (droplet.state === 'creeping') {
    const targetSpeed = (1.4 + radius * 0.78 + settings.rainIntensity * 4.5) * settings.animationSpeed;
    const response = 1 - Math.exp(-step * 2.8);
    droplet.velocityY += (targetSpeed - droplet.velocityY) * response;
    droplet.velocityX += (Math.sin(droplet.seed + droplet.age * 0.7) * 1.8 - droplet.velocityX) * response;
    if (droplet.mass > droplet.pinning * 1.12 || droplet.age > 3.2 + (droplet.seed / TAU) * 4.2) {
      promoteToRunner(droplet, rng);
    }
  } else {
    const terminalSpeed = (9 + radius * 3.6 + settings.rainIntensity * 27) * settings.animationSpeed;
    const windRadians = (settings.windAngle * Math.PI) / 180;
    const surfaceBias = Math.sin(droplet.seed * 1.73 + droplet.age * 0.27) * (2.2 + radius * 0.36);
    const smallWander = Math.sin(droplet.seed * 4.11 + droplet.age * 0.58) * (0.8 + radius * 0.14);
    const targetVelocityX = Math.sin(windRadians) * terminalSpeed * 0.07 + surfaceBias + smallWander;
    const response = 1 - Math.exp(-step * 4.8);
    droplet.velocityY += (terminalSpeed - droplet.velocityY) * response;
    droplet.velocityX += (targetVelocityX - droplet.velocityX) * response * 0.76;

    const stickChance = step * (0.045 + clamp(droplet.pinning / Math.max(1, droplet.mass), 0, 1.5) * 0.055);
    if (unitRandom(rng) < stickChance) {
      // Most defects cause a quick hesitation, while a minority hold long
      // enough to make the pin/depin cycle perceptible before gravity wins.
      droplet.hold = unitRandom(rng) < 0.2
        ? randomBetween(0.42, 0.92, rng)
        : randomBetween(0.12, 0.38, rng);
    }
  }

  droplet.x += droplet.velocityX * step;
  droplet.y += droplet.velocityY * step;
  return true;
}

function replaceExpiredDroplet(
  droplets: Droplet[],
  index: number,
  width: number,
  height: number,
  protectedMask: Rect | null,
  settings: WeatherSettings,
  rng: RandomSource,
  forcedKind?: DropletKind,
) {
  const replacement = createDroplet(width, height, protectedMask, settings, rng, forcedKind);
  if (replacement) {
    droplets[index] = replacement;
  } else {
    droplets.splice(index, 1);
  }
}

export function updateDroplets(
  droplets: Droplet[],
  width: number,
  height: number,
  dt: number,
  settings: WeatherSettings,
  protectedMask: Rect | null,
  rng: RandomSource = Math.random,
) {
  if (!settings.dropletsEnabled || droplets.length === 0) {
    return;
  }

  const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, MAX_UPDATE_SECONDS);
  for (let index = droplets.length - 1; index >= 0; index -= 1) {
    const droplet = droplets[index];
    if (!isFiniteDroplet(droplet)) {
      replaceExpiredDroplet(droplets, index, width, height, protectedMask, settings, rng);
      continue;
    }

    droplet.prevX = droplet.x;
    droplet.prevY = droplet.y;
    droplet.age += elapsed * Math.max(0.2, settings.animationSpeed);
    droplet.runAge = droplet.state === 'running' ? droplet.runAge + elapsed : 0;
    droplet.mergePulse = Math.max(0, droplet.mergePulse - elapsed * 2.6);

    if (settings.reducedMotion) {
      pinDroplet(droplet);
    } else {
      let remaining = elapsed;
      let pathClear = true;
      while (remaining > 1e-6 && pathClear) {
        const step = Math.min(MAX_SUBSTEP_SECONDS, remaining);
        pathClear = advanceDropletStep(droplet, step, settings, rng);
        remaining -= step;
      }
      if (!pathClear) {
        replaceExpiredDroplet(droplets, index, width, height, protectedMask, settings, rng);
        continue;
      }
    }

    const outside =
      droplet.y - droplet.radiusY > height + 6 ||
      droplet.x + droplet.radiusX < -24 ||
      droplet.x - droplet.radiusX > width + 24;
    const hiddenBehindFocus = Boolean(
      protectedMask &&
      droplet.state === 'running' &&
      droplet.x >= protectedMask.x &&
      droplet.x <= protectedMask.x + protectedMask.width &&
      droplet.y >= protectedMask.y &&
      droplet.y <= protectedMask.y + protectedMask.height,
    );
    if (hiddenBehindFocus) {
      replaceExpiredDroplet(droplets, index, width, height, protectedMask, settings, rng, 'pane');
    } else if (outside || droplet.age >= droplet.lifetime || !isFiniteDroplet(droplet)) {
      replaceExpiredDroplet(droplets, index, width, height, protectedMask, settings, rng);
    }
  }
}

function dropsOverlap(first: Droplet, second: Droplet) {
  const radiusX = first.radiusX + second.radiusX;
  const radiusY = first.radiusY + second.radiusY;
  if (radiusX <= 0 || radiusY <= 0) {
    return false;
  }
  const x = (first.x - second.x) / radiusX;
  const y = (first.y - second.y) / radiusY;
  return x * x + y * y <= 0.88;
}

function movingRank(droplet: Droplet) {
  return droplet.state === 'running' ? 2 : droplet.state === 'creeping' ? 1 : 0;
}

function mergeInto(absorber: Droplet, absorbed: Droplet, settings: WeatherSettings) {
  const absorberMass = absorber.mass;
  const absorbedMass = absorbed.mass;
  const combinedMass = absorberMass + absorbedMass;
  const absorberWasMoving = absorber.state !== 'pinned';
  const absorberWasRunning = absorber.state === 'running';
  const eitherRunning = absorber.state === 'running' || absorbed.state === 'running';
  const eitherMoving = absorberWasMoving || absorbed.state !== 'pinned';
  const weightedAspect =
    ((absorber.radiusY / absorber.radiusX) * absorberMass + (absorbed.radiusY / absorbed.radiusX) * absorbedMass) /
    combinedMass;
  const combinedPinning = Math.max(4, Math.min(absorber.pinning, absorbed.pinning) * 0.82);

  absorber.x = (absorber.x * absorberMass + absorbed.x * absorbedMass) / combinedMass;
  absorber.y = (absorber.y * absorberMass + absorbed.y * absorbedMass) / combinedMass;
  absorber.prevX = (absorber.prevX * absorberMass + absorbed.prevX * absorbedMass) / combinedMass;
  absorber.prevY = (absorber.prevY * absorberMass + absorbed.prevY * absorbedMass) / combinedMass;
  absorber.velocityX = (absorber.velocityX * absorberMass + absorbed.velocityX * absorbedMass) / combinedMass;
  absorber.velocityY = (absorber.velocityY * absorberMass + absorbed.velocityY * absorbedMass) / combinedMass;
  absorber.mass = combinedMass;
  absorber.pinning = combinedPinning;
  absorber.opacity = Math.max(absorber.opacity, absorbed.opacity);
  absorber.highlight = Math.max(absorber.highlight, absorbed.highlight);
  absorber.refraction = (absorber.refraction * absorberMass + absorbed.refraction * absorbedMass) / combinedMass;
  absorber.lifetime = Math.max(absorber.lifetime, absorbed.lifetime) + Math.min(18, Math.sqrt(absorbedMass) * 1.8);
  absorber.hold = Math.min(absorber.hold, absorbed.hold);
  absorber.mergePulse = 1;

  if (!settings.reducedMotion && (eitherRunning || combinedMass >= 38 || (eitherMoving && combinedMass >= 18))) {
    absorber.state = 'running';
    absorber.kind = 'pane';
    absorber.runAge = absorberWasRunning ? Math.max(absorber.runAge, absorbed.runAge) : 0;
    absorber.velocityY += Math.sqrt(absorbedMass) * (absorberWasMoving ? 1.8 : 1.2);
    reshapeDroplet(absorber, clamp(weightedAspect, 1.28, 1.88));
  } else if (!settings.reducedMotion && (eitherMoving || combinedMass > combinedPinning)) {
    absorber.state = 'creeping';
    absorber.runAge = 0;
    absorber.kind = combinedMass < 10 ? 'micro' : 'bead';
    reshapeDroplet(absorber, clamp(weightedAspect, 0.9, 1.65));
  } else {
    absorber.state = 'pinned';
    absorber.runAge = 0;
    absorber.kind = combinedMass < 9 ? 'micro' : combinedMass < 42 ? 'bead' : 'pane';
    absorber.velocityX = 0;
    absorber.velocityY = 0;
    reshapeDroplet(absorber, clamp(weightedAspect, 0.82, 1.5));
  }
}

export function mergeNearbyDroplets(droplets: Droplet[], settings: WeatherSettings, maxMerges = 12) {
  const mergeLimit = Math.max(0, Math.floor(maxMerges));
  if (droplets.length < 2 || mergeLimit === 0) {
    return 0;
  }

  const grid = new Map<string, number[]>();
  const alive = new Array(droplets.length).fill(true) as boolean[];
  let largestRadius = 0;

  for (let index = 0; index < droplets.length; index += 1) {
    const droplet = droplets[index];
    largestRadius = Math.max(largestRadius, droplet.radiusX, droplet.radiusY);
    const cellX = Math.floor(droplet.x / HASH_CELL_SIZE);
    const cellY = Math.floor(droplet.y / HASH_CELL_SIZE);
    const key = `${cellX}:${cellY}`;
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      grid.set(key, [index]);
    }
  }

  let merges = 0;
  for (let index = 0; index < droplets.length && merges < mergeLimit; index += 1) {
    if (!alive[index]) {
      continue;
    }

    const droplet = droplets[index];
    const cellX = Math.floor(droplet.x / HASH_CELL_SIZE);
    const cellY = Math.floor(droplet.y / HASH_CELL_SIZE);
    const searchRadius = Math.min(5, Math.max(1, Math.ceil((Math.max(droplet.radiusX, droplet.radiusY) + largestRadius) / HASH_CELL_SIZE)));
    let absorbedCurrent = false;

    for (let offsetY = -searchRadius; offsetY <= searchRadius && merges < mergeLimit && !absorbedCurrent; offsetY += 1) {
      for (let offsetX = -searchRadius; offsetX <= searchRadius && merges < mergeLimit && !absorbedCurrent; offsetX += 1) {
        const bucket = grid.get(`${cellX + offsetX}:${cellY + offsetY}`);
        if (!bucket) {
          continue;
        }

        for (const otherIndex of bucket) {
          if (merges >= mergeLimit) {
            break;
          }
          if (otherIndex <= index || !alive[otherIndex] || !dropsOverlap(droplets[index], droplets[otherIndex])) {
            continue;
          }

          const first = droplets[index];
          const second = droplets[otherIndex];
          const firstRank = movingRank(first);
          const secondRank = movingRank(second);
          const absorberIndex = firstRank > secondRank || (firstRank === secondRank && first.mass >= second.mass) ? index : otherIndex;
          const absorbedIndex = absorberIndex === index ? otherIndex : index;
          mergeInto(droplets[absorberIndex], droplets[absorbedIndex], settings);
          alive[absorbedIndex] = false;
          merges += 1;
          if (absorbedIndex === index) {
            absorbedCurrent = true;
            break;
          }
        }
      }
    }
  }

  for (let index = droplets.length - 1; index >= 0; index -= 1) {
    if (!alive[index]) {
      droplets.splice(index, 1);
    }
  }
  return merges;
}

function isClusteredMicro(droplet: Droplet) {
  return Math.sin(droplet.seed * 17.71 + droplet.id * 0.37) > 0.62;
}

function drawMicroBeads(ctx: CanvasRenderingContext2D, droplets: Droplet[], modeAlpha: number) {
  for (const droplet of droplets) {
    if (droplet.kind !== 'micro') {
      continue;
    }
    const variant = getDropletOpticalVariant(droplet.seed, droplet.id);
    const alpha = clamp(droplet.opacity * modeAlpha * (0.78 + droplet.highlight * 0.12), 0, 1);
    drawOpticalDroplet(
      ctx,
      'micro',
      variant,
      droplet.x,
      droplet.y,
      droplet.radiusX,
      droplet.radiusY,
      alpha,
    );

    if (!isClusteredMicro(droplet)) {
      continue;
    }

    const satelliteAngle = droplet.seed;
    const satelliteRadius = Math.max(0.32, droplet.radiusX * 0.34);
    const satelliteX = droplet.x + Math.cos(satelliteAngle) * droplet.radiusX * 1.34;
    const satelliteY = droplet.y + Math.sin(satelliteAngle) * droplet.radiusY * 0.9;
    drawOpticalDroplet(
      ctx,
      'micro',
      (variant + 3) % DROPLET_OPTICAL_VARIANTS,
      satelliteX,
      satelliteY,
      satelliteRadius,
      satelliteRadius * 0.94,
      alpha * 0.78,
    );

    if (droplet.radiusX > 1.25) {
      const secondRadius = satelliteRadius * 0.62;
      drawOpticalDroplet(
        ctx,
        'micro',
        (variant + 5) % DROPLET_OPTICAL_VARIANTS,
        droplet.x - Math.sin(satelliteAngle) * droplet.radiusX * 1.08,
        droplet.y + Math.cos(satelliteAngle) * droplet.radiusY * 0.74,
        secondRadius,
        secondRadius * 1.06,
        alpha * 0.64,
      );
    }
  }
}

export function getRunnerNeckGeometry(droplet: Droplet): RunnerNeckGeometry | null {
  if (droplet.state !== 'running') {
    return null;
  }

  const speed = Math.hypot(droplet.velocityX, droplet.velocityY);
  const speedFactor = clamp((speed - 5) / 38, 0, 1);
  const growth = clamp(droplet.runAge / 0.28, 0, 1);
  const heldFactor = droplet.hold > 0 ? clamp(speed / 10, 0, 0.55) : 1;
  const strength = speedFactor * growth * heldFactor;
  const length = Math.min(12, (3 + droplet.radiusY * 0.42) * strength);

  if (length < 1.25) {
    return null;
  }

  const shoulderWidth = Math.max(2.8, droplet.radiusX * (0.7 + droplet.mergePulse * 0.08));
  const trailWidth = Math.max(1.5, shoulderWidth * (0.5 + (1 - strength) * 0.08));
  const velocityBend = -(droplet.velocityX / Math.max(8, Math.abs(droplet.velocityY))) * length * 0.42;
  const surfaceBend = Math.sin(droplet.seed * 2.31 + droplet.age * 0.18) * droplet.radiusX * 0.1;

  return {
    length,
    shoulderWidth,
    trailWidth,
    bend: clamp(velocityBend + surfaceBend, -droplet.radiusX * 0.55, droplet.radiusX * 0.55),
    alpha: (0.12 + speedFactor * 0.11) * growth * heldFactor,
  };
}

function traceRunnerNeck(
  ctx: CanvasRenderingContext2D,
  droplet: Droplet,
  geometry: RunnerNeckGeometry,
  widthScale = 1,
) {
  const shoulderY = -droplet.radiusY * 0.64;
  const endY = shoulderY - geometry.length;
  const shoulderHalf = geometry.shoulderWidth * widthScale * 0.5;
  const trailHalf = geometry.trailWidth * widthScale * 0.5;

  ctx.beginPath();
  ctx.moveTo(-shoulderHalf, shoulderY);
  ctx.bezierCurveTo(
    -shoulderHalf * 0.82,
    shoulderY - geometry.length * 0.36,
    geometry.bend - trailHalf * 1.16,
    endY + geometry.length * 0.2,
    geometry.bend - trailHalf,
    endY,
  );
  ctx.bezierCurveTo(
    geometry.bend - trailHalf * 0.15,
    endY - Math.min(1.8, geometry.trailWidth * 0.25),
    geometry.bend + trailHalf * 0.78,
    endY,
    geometry.bend + trailHalf,
    endY + Math.min(0.8, geometry.trailWidth * 0.15),
  );
  ctx.bezierCurveTo(
    geometry.bend + trailHalf * 1.08,
    endY + geometry.length * 0.22,
    shoulderHalf * 0.9,
    shoulderY - geometry.length * 0.3,
    shoulderHalf,
    shoulderY,
  );
  ctx.closePath();
}

function drawRunnerNeck(
  ctx: CanvasRenderingContext2D,
  droplet: Droplet,
  geometry: RunnerNeckGeometry,
  modeAlpha: number,
) {
  const shoulderY = -droplet.radiusY * 0.64;
  const endY = shoulderY - geometry.length;
  const shoulderHalf = geometry.shoulderWidth * 0.5;
  const trailHalf = geometry.trailWidth * 0.5;
  const opticalAlpha = clamp(droplet.opacity * modeAlpha * geometry.alpha, 0, 1);

  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.globalAlpha = opticalAlpha * 0.32;
  ctx.strokeStyle = 'rgba(231, 247, 244, 0.82)';
  ctx.lineWidth = Math.max(0.28, geometry.trailWidth * 0.08);
  ctx.beginPath();
  ctx.moveTo(-shoulderHalf, shoulderY);
  ctx.bezierCurveTo(
    -shoulderHalf * 0.82,
    shoulderY - geometry.length * 0.36,
    geometry.bend - trailHalf * 1.16,
    endY + geometry.length * 0.2,
    geometry.bend - trailHalf,
    endY,
  );
  ctx.stroke();

  ctx.globalAlpha = opticalAlpha * 0.5;
  ctx.strokeStyle = 'rgba(1, 8, 10, 0.9)';
  ctx.lineWidth = Math.max(0.34, geometry.trailWidth * 0.11);
  ctx.beginPath();
  ctx.moveTo(shoulderHalf, shoulderY);
  ctx.bezierCurveTo(
    shoulderHalf * 0.9,
    shoulderY - geometry.length * 0.3,
    geometry.bend + trailHalf * 1.08,
    endY + geometry.length * 0.22,
    geometry.bend + trailHalf,
    endY,
  );
  ctx.stroke();
}

function drawRichDroplet(ctx: CanvasRenderingContext2D, droplet: Droplet, modeAlpha: number) {
  const shape: OpticalDropletShape = droplet.state === 'running' ? 'runner' : droplet.kind === 'pane' ? 'pane' : 'bead';
  const opticalVariant = getDropletOpticalVariant(droplet.seed, droplet.id);
  const pulseScale = 1 + droplet.mergePulse * 0.09;
  const heldShape = droplet.state === 'running' ? clamp(droplet.hold / 0.32, 0, 1) : 0;
  const speedShape = droplet.state === 'running' ? clamp((droplet.velocityY - 22) / 130, 0, 1) : 0;
  const seedShape = Math.sin(droplet.seed * 2.37) * 0.045;
  const renderedRadiusX = droplet.radiusX * pulseScale * (1 + heldShape * 0.12 - speedShape * 0.04 + seedShape);
  const renderedRadiusY = droplet.radiusY * pulseScale * (1 - heldShape * 0.12 + speedShape * 0.08 - seedShape * 0.45);
  const tilt = droplet.state === 'running' ? clamp(Math.atan2(droplet.velocityX, Math.max(1, droplet.velocityY)), -0.24, 0.24) : 0;

  ctx.save();
  ctx.translate(droplet.x, droplet.y);
  if (tilt !== 0) {
    ctx.rotate(-tilt);
  }
  ctx.globalAlpha = clamp(droplet.opacity * modeAlpha, 0, 1);
  const neckGeometry = getRunnerNeckGeometry(droplet);
  if (neckGeometry) {
    drawRunnerNeck(ctx, droplet, neckGeometry, modeAlpha);
  }

  const opticalAlpha = clamp(droplet.opacity * modeAlpha * (0.82 + droplet.highlight * 0.12), 0, 1);
  if (!drawOpticalDroplet(
    ctx,
    shape,
    opticalVariant,
    0,
    0,
    renderedRadiusX,
    renderedRadiusY,
    opticalAlpha,
  )) {
    ctx.fillStyle = 'rgba(183, 216, 218, 0.5)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(0, 0, droplet.radiusX, droplet.radiusY, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Curved water only forms a visible concentrated caustic once there is
  // enough mass. Keeping this out of the shared atlas prevents every bead
  // from carrying the same decorative amber dot.
  const causticStrength = clamp((droplet.mass - 44) / 86, 0, 1) * clamp(droplet.refraction, 0, 1);
  if (causticStrength > 0.015) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opticalAlpha * causticStrength * 0.22;
    ctx.fillStyle = 'rgba(247, 244, 225, 0.82)';
    ctx.beginPath();
    ctx.ellipse(
      renderedRadiusX * (0.11 + Math.sin(droplet.seed) * 0.035),
      renderedRadiusY * 0.35,
      Math.max(0.52, renderedRadiusX * 0.16),
      Math.max(0.28, renderedRadiusY * 0.04),
      -0.2,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.restore();
}

export function carveRunnerNecks(
  ctx: CanvasRenderingContext2D,
  droplets: readonly Droplet[],
  settings: WeatherSettings,
) {
  if (!settings.dropletsEnabled) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const droplet of droplets) {
    const geometry = getRunnerNeckGeometry(droplet);
    if (!geometry) {
      continue;
    }

    const tilt = clamp(Math.atan2(droplet.velocityX, Math.max(1, droplet.velocityY)), -0.24, 0.24);
    ctx.save();
    ctx.translate(droplet.x, droplet.y);
    if (tilt !== 0) {
      ctx.rotate(-tilt);
    }
    ctx.globalAlpha = clamp(0.16 + geometry.alpha * 1.35, 0, 0.5);
    traceRunnerNeck(ctx, droplet, geometry, 0.82);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawDroplets(ctx: CanvasRenderingContext2D, droplets: Droplet[], settings: WeatherSettings) {
  if (!settings.dropletsEnabled || droplets.length === 0) {
    return;
  }

  const modeAlpha = settings.mode === 'night-drive' ? 1.08 : settings.mode === 'storm-lock-in' ? 1.04 : settings.mode === 'greyglass' ? 0.92 : settings.mode === 'winterglass' ? 0.82 : 1;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawMicroBeads(ctx, droplets, modeAlpha);

  for (const state of ['pinned', 'creeping', 'running'] as const) {
    for (const droplet of droplets) {
      if (droplet.kind === 'micro' || droplet.state !== state) {
        continue;
      }
      drawRichDroplet(ctx, droplet, modeAlpha);
    }
  }
  ctx.restore();
}
