import type { Droplet, Rect, WeatherSettings } from './types';
import { getFocusMaskCornerRadius, traceRoundedRect } from './masks';

type TrailState = 'creeping' | 'running';

type TrailDroplet = Droplet & {
  state?: TrailState | string;
  prevX?: number;
  prevY?: number;
};

interface TrailQuality {
  scale: number;
  decayHz: number;
  halfLife: number;
  shoulderHalfLife: number;
  clarity: number;
  sheen: number;
}

interface TrailCursor {
  x: number;
  y: number;
  width: number;
  distanceRemainder: number;
  stampIndex: number;
}

interface TrailStampBudget {
  coverageRemaining: number;
  sheenRemaining: number;
}

interface FreshTrailShoulder {
  x: number;
  y: number;
  radiusAlong: number;
  radiusAcross: number;
  angle: number;
  age: number;
  lifetime: number;
  strength: number;
}

export interface FreshTrailDetailProfile {
  lifetime: number;
  maxFragments: number;
}

const MAX_SURFACE_DIMENSION = 2048;
// Coverage and shoulder maps share this budget. Keeping both maps small makes
// the full-screen composites much cheaper than the visible droplet pass.
const MAX_SURFACE_PIXELS = 1_250_000;
const MIN_TRAVEL = 0.6;
const MAX_COVERAGE_STAMPS_PER_FRAME = 64;
const MAX_SHEEN_STAMPS_PER_FRAME = 24;
const MAX_COVERAGE_STAMPS_PER_DROPLET = 8;
const MAX_SHEEN_STAMPS_PER_DROPLET = 4;
const LIGHT_X = -0.72;
const LIGHT_Y = -0.69;

function qualityFor(settings: WeatherSettings): TrailQuality {
  if (settings.renderBudget === 'conservative') {
    return { scale: 0.28, decayHz: 4, halfLife: 16, shoulderHalfLife: 8, clarity: 0.12, sheen: 0.05 };
  }

  if (settings.lowPowerMode) {
    return { scale: 0.31, decayHz: 6, halfLife: 12, shoulderHalfLife: 6.5, clarity: 0.14, sheen: 0.058 };
  }

  return { scale: 0.34, decayHz: 8, halfLife: 9, shoulderHalfLife: 5.5, clarity: 0.17, sheen: 0.066 };
}

export function getFreshTrailDetailProfile(settings: WeatherSettings): FreshTrailDetailProfile {
  if (settings.renderBudget === 'conservative') {
    return { lifetime: 0.38, maxFragments: 36 };
  }
  if (settings.lowPowerMode || settings.reducedMotion) {
    return { lifetime: 0.52, maxFragments: 56 };
  }
  return { lifetime: 0.72, maxFragments: 96 };
}

function boundedScale(width: number, height: number, desiredScale: number) {
  const dimensionScale = Math.min(
    desiredScale,
    MAX_SURFACE_DIMENSION / Math.max(1, width),
    MAX_SURFACE_DIMENSION / Math.max(1, height),
  );
  const pixelScale = Math.sqrt(MAX_SURFACE_PIXELS / Math.max(1, width * height));
  return Math.max(0.01, Math.min(dimensionScale, pixelScale));
}

export class WetGlassTrailField {
  private canvas: HTMLCanvasElement | null = null;
  private trailCtx: CanvasRenderingContext2D | null = null;
  private shoulderCanvas: HTMLCanvasElement | null = null;
  private shoulderCtx: CanvasRenderingContext2D | null = null;
  private logicalWidth = 0;
  private logicalHeight = 0;
  private pendingDecay = 0;
  private trailCursors = new Map<number, TrailCursor>();
  private freshShoulders: FreshTrailShoulder[] = [];

  reset() {
    this.pendingDecay = 0;
    this.trailCursors.clear();
    this.freshShoulders.length = 0;

    for (const surface of [
      { canvas: this.canvas, ctx: this.trailCtx },
      { canvas: this.shoulderCanvas, ctx: this.shoulderCtx },
    ]) {
      if (!surface.canvas || !surface.ctx) {
        continue;
      }
      surface.ctx.save();
      try {
        surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
        surface.ctx.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
      } finally {
        surface.ctx.restore();
      }
    }
  }

  update(
    width: number,
    height: number,
    dt: number,
    droplets: readonly Droplet[],
    protectedMask: Rect | null,
    settings: WeatherSettings,
  ) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    const quality = qualityFor(settings);
    if (!this.ensureSurface(width, height, quality.scale)) {
      return;
    }

    if (!settings.dropletsEnabled) {
      this.reset();
      return;
    }

    const canvas = this.canvas;
    const trailCtx = this.trailCtx;
    const shoulderCanvas = this.shoulderCanvas;
    const shoulderCtx = this.shoulderCtx;
    if (!canvas || !trailCtx || !shoulderCanvas || !shoulderCtx) {
      return;
    }

    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
    for (let index = this.freshShoulders.length - 1; index >= 0; index -= 1) {
      const fragment = this.freshShoulders[index];
      fragment.age += safeDt;
      if (fragment.age >= fragment.lifetime) {
        this.freshShoulders.splice(index, 1);
      }
    }
    this.pendingDecay += safeDt;
    const decayInterval = 1 / quality.decayHz;

    trailCtx.save();
    shoulderCtx.save();
    try {
      trailCtx.setTransform(1, 0, 0, 1, 0, 0);
      shoulderCtx.setTransform(1, 0, 0, 1, 0, 0);

      if (this.pendingDecay >= decayInterval) {
        const coverageDecayAlpha = 1 - Math.pow(0.5, this.pendingDecay / quality.halfLife);
        const shoulderDecayAlpha = 1 - Math.pow(0.5, this.pendingDecay / quality.shoulderHalfLife);
        trailCtx.globalCompositeOperation = 'destination-out';
        trailCtx.globalAlpha = coverageDecayAlpha;
        trailCtx.fillStyle = '#000';
        trailCtx.fillRect(0, 0, canvas.width, canvas.height);
        shoulderCtx.globalCompositeOperation = 'destination-out';
        shoulderCtx.globalAlpha = shoulderDecayAlpha;
        shoulderCtx.fillStyle = '#000';
        shoulderCtx.fillRect(0, 0, shoulderCanvas.width, shoulderCanvas.height);
        this.pendingDecay = 0;
      }

      const scaleX = canvas.width / width;
      const scaleY = canvas.height / height;
      trailCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      shoulderCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      trailCtx.globalCompositeOperation = 'source-over';
      shoulderCtx.globalCompositeOperation = 'source-over';

      const stampBudget: TrailStampBudget = {
        coverageRemaining: MAX_COVERAGE_STAMPS_PER_FRAME,
        sheenRemaining: MAX_SHEEN_STAMPS_PER_FRAME,
      };
      const detailProfile = getFreshTrailDetailProfile(settings);
      let coverageStampCount = 0;
      let shoulderStampCount = 0;
      trailCtx.beginPath();
      shoulderCtx.beginPath();

      const activeIds = new Set<number>();
      for (const droplet of droplets) {
        activeIds.add(droplet.id);
        const stamps = this.stampSegment(
          trailCtx,
          droplet as TrailDroplet,
          Math.min(scaleX, scaleY),
          shoulderCtx,
          stampBudget,
          this.freshShoulders,
          detailProfile.lifetime,
        );
        coverageStampCount += stamps.coverage;
        shoulderStampCount += stamps.shoulder;
      }
      for (const id of this.trailCursors.keys()) {
        if (!activeIds.has(id)) {
          this.trailCursors.delete(id);
        }
      }

      if (coverageStampCount > 0) {
        trailCtx.globalAlpha = 1;
        trailCtx.fillStyle = 'rgba(3, 11, 13, 0.3)';
        trailCtx.fill();
      }
      if (shoulderStampCount > 0) {
        shoulderCtx.globalAlpha = 1;
        shoulderCtx.fillStyle = 'rgba(4, 15, 17, 0.58)';
        shoulderCtx.fill();
      }

      if (this.freshShoulders.length > detailProfile.maxFragments) {
        this.freshShoulders.splice(0, this.freshShoulders.length - detailProfile.maxFragments);
      }

      this.clearProtectedMask(trailCtx, protectedMask, width, height);
      this.clearProtectedMask(shoulderCtx, protectedMask, width, height);
    } finally {
      trailCtx.restore();
      shoulderCtx.restore();
    }
  }

  applyClarity(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings) {
    if (!this.hasSurface() || !settings.dropletsEnabled || width <= 0 || height <= 0) {
      return;
    }

    const quality = qualityFor(settings);
    const densityScale = 0.58 + Math.min(1, Math.max(0, settings.dropletDensity)) * 0.42;

    ctx.save();
    try {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = quality.clarity * densityScale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = settings.renderBudget === 'conservative' ? 'low' : 'medium';
      ctx.drawImage(this.canvas!, 0, 0, this.canvas!.width, this.canvas!.height, 0, 0, width, height);
    } finally {
      ctx.restore();
    }
  }

  drawSheen(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings) {
    if (!this.hasSurface() || !this.shoulderCanvas || !settings.dropletsEnabled || width <= 0 || height <= 0) {
      return;
    }

    const quality = qualityFor(settings);
    const densityScale = 0.66 + Math.min(1, Math.max(0, settings.dropletDensity)) * 0.34;

    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = quality.sheen * densityScale * 0.48;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = settings.renderBudget === 'conservative' ? 'low' : 'medium';
      // Persist only the soft, dark meniscus in the bounded trail map. Its
      // newest light-facing fragments are redrawn crisply by drawDetailSheen.
      ctx.drawImage(
        this.shoulderCanvas,
        0,
        0,
        this.shoulderCanvas.width,
        this.shoulderCanvas.height,
        0,
        0,
        width,
        height,
      );
    } finally {
      ctx.restore();
    }
  }

  drawDetailSheen(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings) {
    if (
      this.freshShoulders.length === 0 ||
      !settings.dropletsEnabled ||
      settings.dropletDensity <= 0.005 ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    const densityScale = 0.68 + Math.min(1, Math.max(0, settings.dropletDensity)) * 0.32;
    const lightOffset = settings.renderBudget === 'conservative' ? 0.45 : 0.62;

    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const fragment of this.freshShoulders) {
        const fade = Math.pow(Math.max(0, 1 - fragment.age / fragment.lifetime), 1.45);
        if (fade <= 0.01) {
          continue;
        }

        ctx.save();
        ctx.translate(fragment.x, fragment.y);
        ctx.rotate(fragment.angle);

        ctx.globalAlpha = 0.12 * densityScale * fade * fragment.strength;
        ctx.fillStyle = 'rgba(3, 12, 14, 0.72)';
        ctx.beginPath();
        ctx.ellipse(0, 0, fragment.radiusAlong, fragment.radiusAcross, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.2 * densityScale * fade * fragment.strength;
        ctx.strokeStyle = 'rgba(235, 250, 248, 0.88)';
        ctx.lineWidth = settings.renderBudget === 'conservative' ? 0.34 : 0.42;
        ctx.beginPath();
        ctx.ellipse(
          -lightOffset,
          -lightOffset * 0.55,
          fragment.radiusAlong * 0.9,
          Math.max(0.22, fragment.radiusAcross * 0.72),
          0,
          Math.PI * 0.96,
          Math.PI * 1.62,
        );
        ctx.stroke();
        ctx.restore();
      }
    } finally {
      ctx.restore();
    }
  }

  carveFilm(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings) {
    if (!this.hasSurface() || !settings.dropletsEnabled || settings.dropletDensity <= 0.005 || width <= 0 || height <= 0) {
      return;
    }

    ctx.save();
    try {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = settings.renderBudget === 'conservative' ? 0.42 : settings.lowPowerMode ? 0.48 : 0.56;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = settings.renderBudget === 'conservative' ? 'low' : 'medium';
      ctx.drawImage(this.canvas!, 0, 0, this.canvas!.width, this.canvas!.height, 0, 0, width, height);
    } finally {
      ctx.restore();
    }
  }

  private ensureSurface(width: number, height: number, desiredScale: number) {
    if (typeof document === 'undefined') {
      return false;
    }

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.trailCtx = this.canvas.getContext('2d');
    }
    if (!this.shoulderCanvas) {
      this.shoulderCanvas = document.createElement('canvas');
      this.shoulderCtx = this.shoulderCanvas.getContext('2d');
    }

    if (!this.canvas || !this.trailCtx || !this.shoulderCanvas || !this.shoulderCtx) {
      return false;
    }

    const scale = boundedScale(width, height, desiredScale);
    const pixelWidth = Math.max(1, Math.floor(width * scale));
    const pixelHeight = Math.max(1, Math.floor(height * scale));

    this.logicalWidth = width;
    this.logicalHeight = height;

    const sizeChanged =
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight ||
      this.shoulderCanvas.width !== pixelWidth ||
      this.shoulderCanvas.height !== pixelHeight;
    if (sizeChanged) {
      this.trailCtx = this.resizeSurface(this.canvas, pixelWidth, pixelHeight);
      this.shoulderCtx = this.resizeSurface(this.shoulderCanvas, pixelWidth, pixelHeight);
      this.pendingDecay = 0;
    }

    return Boolean(this.trailCtx && this.shoulderCtx);
  }

  private resizeSurface(canvas: HTMLCanvasElement, width: number, height: number) {
    let previous: HTMLCanvasElement | null = null;
    if (canvas.width > 0 && canvas.height > 0) {
      previous = document.createElement('canvas');
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext('2d')?.drawImage(canvas, 0, 0);
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (previous && ctx) {
      ctx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, width, height);
    }
    return ctx;
  }

  private stampSegment(
    ctx: CanvasRenderingContext2D,
    droplet: TrailDroplet,
    surfaceScale: number,
    shoulderCtx: CanvasRenderingContext2D | null = this.shoulderCtx,
    budget: TrailStampBudget = {
      coverageRemaining: MAX_COVERAGE_STAMPS_PER_DROPLET,
      sheenRemaining: MAX_SHEEN_STAMPS_PER_DROPLET,
    },
    freshShoulders: FreshTrailShoulder[] | null = null,
    freshLifetime = 0.72,
  ) {
    const previousCursor = this.trailCursors.get(droplet.id);
    if (droplet.state !== 'creeping' && droplet.state !== 'running') {
      this.trailCursors.set(droplet.id, {
        x: droplet.x,
        y: droplet.y,
        width: Math.max(1, droplet.radiusX * 0.5),
        distanceRemainder: 0,
        stampIndex: previousCursor?.stampIndex ?? 0,
      });
      return { coverage: 0, shoulder: 0 };
    }

    const prevX = previousCursor?.x ?? droplet.prevX;
    const prevY = previousCursor?.y ?? droplet.prevY;
    if (
      typeof prevX !== 'number' ||
      typeof prevY !== 'number' ||
      !Number.isFinite(prevX) ||
      !Number.isFinite(prevY) ||
      !Number.isFinite(droplet.x) ||
      !Number.isFinite(droplet.y)
    ) {
      return { coverage: 0, shoulder: 0 };
    }

    const dx = droplet.x - prevX;
    const dy = droplet.y - prevY;
    const travel = Math.hypot(dx, dy);
    const radius = Math.max(0.8, Math.min(9, (droplet.radiusX + droplet.radiusY * 0.35) * 0.5));
    const minimumCssWidth = 1 / Math.max(0.01, surfaceScale);
    const widthNoise = 0.86 + Math.sin(droplet.seed * 2.7 + droplet.y * 0.021) * 0.09 + Math.sin(droplet.x * 0.013 - droplet.y * 0.007) * 0.04;
    const stateScale = droplet.state === 'running' ? 1 : 0.7;
    const targetWidth = Math.max(minimumCssWidth, Math.min(7, radius * 0.86 * widthNoise * stateScale));
    const previousWidth = previousCursor?.width ?? targetWidth;
    const nextWidth = Math.max(previousWidth * 0.82, Math.min(previousWidth * 1.18, targetWidth));
    const spacing = Math.max(1.35 / Math.max(0.01, surfaceScale), nextWidth * 0.72);
    const previousRemainder = previousCursor?.distanceRemainder ?? 0;
    const stampIndex = previousCursor?.stampIndex ?? 0;

    if (travel < MIN_TRAVEL && previousRemainder + travel < spacing) {
      this.trailCursors.set(droplet.id, {
        x: droplet.x,
        y: droplet.y,
        width: nextWidth,
        distanceRemainder: previousRemainder + travel,
        stampIndex,
      });
      return { coverage: 0, shoulder: 0 };
    }

    // Ignore respawn/resize teleports while retaining any plausible single-frame run.
    const maxTravel = Math.max(72, droplet.radiusY * 8);
    if (travel > maxTravel) {
      this.trailCursors.set(droplet.id, {
        x: droplet.x,
        y: droplet.y,
        width: targetWidth,
        distanceRemainder: 0,
        stampIndex,
      });
      return { coverage: 0, shoulder: 0 };
    }

    const normalX = -dy / travel;
    const normalY = dx / travel;
    const bend = Math.sin(droplet.seed + droplet.x * 0.013 + droplet.y * 0.017) * Math.min(1.7, travel * 0.12 + radius * 0.05);
    const controlX = (prevX + droplet.x) * 0.5 + normalX * bend;
    const controlY = (prevY + droplet.y) * 0.5 + normalY * bend;

    const desiredCount = Math.floor((previousRemainder + travel) / spacing);
    const coverageCount = Math.min(
      desiredCount,
      MAX_COVERAGE_STAMPS_PER_DROPLET,
      Math.max(0, budget.coverageRemaining),
    );
    let shoulderCount = 0;

    if (coverageCount > 0) {
      const overloaded = desiredCount > coverageCount;
      const firstDistance = Math.max(0, spacing - previousRemainder);
      const sampleGap = overloaded ? travel / coverageCount : spacing;

      for (let index = 0; index < coverageCount; index += 1) {
        const distance = overloaded
          ? ((index + 0.5) / coverageCount) * travel
          : Math.min(travel, firstDistance + index * spacing);
        const t = Math.max(0, Math.min(1, distance / Math.max(MIN_TRAVEL, travel)));
        const inverseT = 1 - t;
        const pathX = inverseT * inverseT * prevX + 2 * inverseT * t * controlX + t * t * droplet.x;
        const pathY = inverseT * inverseT * prevY + 2 * inverseT * t * controlY + t * t * droplet.y;
        const tangentX = 2 * inverseT * (controlX - prevX) + 2 * t * (droplet.x - controlX);
        const tangentY = 2 * inverseT * (controlY - prevY) + 2 * t * (droplet.y - controlY);
        const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));
        const unitTangentX = tangentX / tangentLength;
        const unitTangentY = tangentY / tangentLength;
        const pathNormalX = -unitTangentY;
        const pathNormalY = unitTangentX;
        const phase = droplet.seed * 4.17 + (stampIndex + index) * 0.83;
        const localWidthNoise = 0.93 + Math.sin(phase) * 0.055 + Math.sin(phase * 0.47 + 1.3) * 0.025;
        const width = (previousWidth + (nextWidth - previousWidth) * t) * localWidthNoise;
        const crossRadius = Math.max(minimumCssWidth * 0.5, width * 0.5);
        const alongRadius = Math.max(crossRadius * 0.72, sampleGap * 0.58);
        const centerJitter = Math.sin(phase * 0.61) * crossRadius * 0.08;
        const centerX = pathX + pathNormalX * centerJitter;
        const centerY = pathY + pathNormalY * centerJitter;
        const angle = Math.atan2(unitTangentY, unitTangentX);

        ctx.moveTo(centerX + Math.cos(angle) * alongRadius, centerY + Math.sin(angle) * alongRadius);
        ctx.ellipse(centerX, centerY, alongRadius, crossRadius, angle, 0, Math.PI * 2);

        const currentStampIndex = stampIndex + index;
        const fragmentRoll = this.stampHash(droplet.id, currentStampIndex, droplet.seed);
        if (
          shoulderCtx &&
          shoulderCount < MAX_SHEEN_STAMPS_PER_DROPLET &&
          budget.sheenRemaining > shoulderCount &&
          fragmentRoll < (droplet.state === 'running' ? 0.48 : 0.3)
        ) {
          const lightDot = pathNormalX * LIGHT_X + pathNormalY * LIGHT_Y;
          const lightSide = lightDot >= 0 ? 1 : -1;
          const offset = crossRadius * (0.54 + fragmentRoll * 0.18) * lightSide;
          const sheenX = centerX + pathNormalX * offset;
          const sheenY = centerY + pathNormalY * offset;
          const sheenAlong = Math.max(0.48 / Math.max(0.01, surfaceScale), alongRadius * 0.54);
          const sheenAcross = Math.max(0.2 / Math.max(0.01, surfaceScale), crossRadius * 0.2);
          shoulderCtx.moveTo(sheenX + Math.cos(angle) * sheenAlong, sheenY + Math.sin(angle) * sheenAlong);
          shoulderCtx.ellipse(sheenX, sheenY, sheenAlong, sheenAcross, angle, 0, Math.PI * 2);
          freshShoulders?.push({
            x: sheenX,
            y: sheenY,
            radiusAlong: sheenAlong,
            radiusAcross: sheenAcross,
            angle,
            age: 0,
            lifetime: freshLifetime,
            strength: 0.72 + (1 - fragmentRoll) * 0.28,
          });
          shoulderCount += 1;
        }
      }
    }

    budget.coverageRemaining = Math.max(0, budget.coverageRemaining - coverageCount);
    budget.sheenRemaining = Math.max(0, budget.sheenRemaining - shoulderCount);
    this.trailCursors.set(droplet.id, {
      x: droplet.x,
      y: droplet.y,
      width: nextWidth,
      distanceRemainder: desiredCount > coverageCount ? 0 : (previousRemainder + travel) % spacing,
      stampIndex: stampIndex + desiredCount,
    });
    return { coverage: coverageCount, shoulder: shoulderCount };
  }

  private stampHash(id: number, stampIndex: number, seed: number) {
    const value = Math.sin(id * 12.9898 + stampIndex * 78.233 + seed * 37.719) * 43758.5453;
    return value - Math.floor(value);
  }

  private clearProtectedMask(ctx: CanvasRenderingContext2D, mask: Rect | null, width: number, height: number) {
    if (!mask) {
      return;
    }

    const left = Math.max(0, Math.min(width, mask.x));
    const top = Math.max(0, Math.min(height, mask.y));
    const right = Math.max(left, Math.min(width, mask.x + Math.max(0, mask.width)));
    const bottom = Math.max(top, Math.min(height, mask.y + Math.max(0, mask.height)));

    if (right > left && bottom > top) {
      const clippedMask = { x: left, y: top, width: right - left, height: bottom - top };
      ctx.save();
      ctx.beginPath();
      traceRoundedRect(ctx, clippedMask, getFocusMaskCornerRadius(clippedMask, width, height));
      ctx.clip();
      ctx.clearRect(left, top, right - left, bottom - top);
      ctx.restore();
    }
  }

  private hasSurface() {
    return Boolean(
      this.canvas &&
        this.trailCtx &&
        this.shoulderCanvas &&
        this.shoulderCtx &&
        this.canvas.width > 0 &&
        this.canvas.height > 0 &&
        this.shoulderCanvas.width > 0 &&
        this.shoulderCanvas.height > 0 &&
        this.logicalWidth > 0 &&
        this.logicalHeight > 0,
    );
  }
}
