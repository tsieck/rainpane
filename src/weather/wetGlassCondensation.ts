import type { WeatherSettings } from './types';
import { sampleDropletOptics } from './dropletOptics';

type CondensationTier = 'mist' | 'bead' | 'lens';

interface CondensationBead {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  tier: CondensationTier;
  rotation: number;
  highlightStrength: number;
}

export interface CondensationProfile {
  scale: number;
  population: number;
  maxPopulation: number;
}

export interface CondensationDetailProfile {
  maxRims: number;
  highlightThreshold: number;
}

const MAX_SURFACE_DIMENSION = 2048;
const MAX_SURFACE_PIXELS = 2_500_000;
const TAU = Math.PI * 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
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

function desiredScaleFor(settings: WeatherSettings) {
  if (settings.renderBudget === 'conservative') {
    return 0.4;
  }
  if (settings.lowPowerMode) {
    return 0.48;
  }
  return 0.6;
}

function maxPopulationFor(settings: WeatherSettings) {
  if (settings.reducedMotion) {
    return 4_200;
  }
  if (settings.renderBudget === 'conservative') {
    return 4_200;
  }
  if (settings.lowPowerMode) {
    return 6_000;
  }
  return 8_000;
}

export function getCondensationProfile(
  width: number,
  height: number,
  settings: WeatherSettings,
): CondensationProfile {
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
  const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
  const density = clamp(settings.dropletDensity, 0, 1);
  const maxPopulation = maxPopulationFor(settings);
  const scale = boundedScale(safeWidth, safeHeight, desiredScaleFor(settings));
  const areaScale = clamp(Math.sqrt((safeWidth * safeHeight) / 400_000), 0.65, 1.55);
  const population = !settings.dropletsEnabled || density <= 0.005
    ? 0
    : Math.min(
      maxPopulation,
      Math.round(maxPopulation * Math.pow(density, 0.72) * areaScale),
    );

  return { scale, population, maxPopulation };
}

export function getCondensationDetailProfile(settings: WeatherSettings): CondensationDetailProfile {
  if (!settings.dropletsEnabled || settings.dropletDensity <= 0.005) {
    return { maxRims: 0, highlightThreshold: 1 };
  }
  if (settings.renderBudget === 'conservative') {
    return { maxRims: 420, highlightThreshold: 0.62 };
  }
  if (settings.lowPowerMode) {
    return { maxRims: 680, highlightThreshold: 0.56 };
  }
  return { maxRims: 1_100, highlightThreshold: 0.5 };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const beadSprites = new Map<CondensationTier, HTMLCanvasElement>();

function getBeadSprite(tier: CondensationTier) {
  const cached = beadSprites.get(tier);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const strength = tier === 'mist' ? 0.36 : tier === 'bead' ? 0.72 : 0.94;
  const pixels = ctx.createImageData(48, 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const sample = sampleDropletOptics((x + 0.5 - 24) / 20, (y + 0.5 - 24) / 20,
        tier === 'mist' ? 'micro' : 'bead', tier === 'lens' ? 5 : tier === 'bead' ? 2 : 0);
      const offset = (y * 48 + x) * 4;
      pixels.data[offset] = sample.red;
      pixels.data[offset + 1] = sample.green;
      pixels.data[offset + 2] = sample.blue;
      pixels.data[offset + 3] = sample.alpha * strength * 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  beadSprites.set(tier, canvas);
  return canvas;
}

function traceDetailArc(
  path: Path2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  startAngle: number,
  endAngle: number,
) {
  const cosStart = Math.cos(startAngle);
  const sinStart = Math.sin(startAngle);
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  path.moveTo(
    x + cosRotation * radiusX * cosStart - sinRotation * radiusY * sinStart,
    y + sinRotation * radiusX * cosStart + cosRotation * radiusY * sinStart,
  );
  path.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle);
}

export class WetGlassCondensationField {
  private canvas: HTMLCanvasElement | null = null;
  private fieldCtx: CanvasRenderingContext2D | null = null;
  private cacheKey = '';
  private detailCanvas: HTMLCanvasElement | null = null;
  private detailCacheKey = '';
  private detailDarkRimPath: Path2D | null = null;
  private detailLightRimPath: Path2D | null = null;
  private detailHighlightPath: Path2D | null = null;

  reset() {
    this.cacheKey = '';
    this.detailCacheKey = '';
    this.detailDarkRimPath = null;
    this.detailLightRimPath = null;
    this.detailHighlightPath = null;
    if (this.canvas && this.fieldCtx) {
      this.fieldCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.fieldCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings) {
    const profile = getCondensationProfile(width, height, settings);
    if (profile.population === 0 || !this.ensureField(width, height, settings, profile)) {
      return;
    }

    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.72 + clamp(settings.dropletDensity, 0, 1) * 0.18;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = settings.renderBudget === 'conservative' ? 'medium' : 'high';
      ctx.drawImage(this.canvas!, 0, 0, this.canvas!.width, this.canvas!.height, 0, 0, width, height);
    } finally {
      ctx.restore();
    }
  }

  drawDetail(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WeatherSettings) {
    if (
      !this.canvas ||
      !this.detailDarkRimPath ||
      !this.detailLightRimPath ||
      !this.detailHighlightPath ||
      !settings.dropletsEnabled ||
      settings.dropletDensity <= 0.005 ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    // Condensation is stationary. Rasterize the rim paths only when the field
    // or backing resolution changes, rather than tessellating them every frame.
    // Keep the extra cache below 4 MP, including on large external displays.
    const scale = Math.min(ctx.canvas.width / width, ctx.canvas.height / height,
      2, 3072 / width, 3072 / height, Math.sqrt(4_000_000 / (width * height)));
    const pixelWidth = Math.max(1, Math.floor(width * scale));
    const pixelHeight = Math.max(1, Math.floor(height * scale));
    const key = `${this.cacheKey}:${pixelWidth}:${pixelHeight}`;
    if (!this.detailCanvas) this.detailCanvas = document.createElement('canvas');
    if (key !== this.detailCacheKey) {
      const cached = this.detailCanvas;
      cached.width = pixelWidth;
      cached.height = pixelHeight;
      const detail = cached.getContext('2d');
      if (!detail) return;
      detail.scale(pixelWidth / this.canvas.width, pixelHeight / this.canvas.height);
      detail.lineCap = 'round';
      detail.lineJoin = 'round';
      detail.globalAlpha = 0.28;
      detail.strokeStyle = 'rgba(2, 10, 12, 0.76)';
      detail.lineWidth = 0.34;
      detail.stroke(this.detailDarkRimPath);
      detail.globalAlpha = 0.48;
      detail.strokeStyle = 'rgba(229, 244, 242, 0.84)';
      detail.lineWidth = 0.24;
      detail.stroke(this.detailLightRimPath);
      detail.globalAlpha = 0.34;
      detail.fillStyle = 'rgba(255, 255, 255, 0.88)';
      detail.fill(this.detailHighlightPath);
      this.detailCacheKey = key;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.66 + clamp(settings.dropletDensity, 0, 1) * 0.34;
    ctx.drawImage(this.detailCanvas, 0, 0, width, height);
    ctx.restore();
  }

  private ensureField(
    width: number,
    height: number,
    settings: WeatherSettings,
    profile: CondensationProfile,
  ) {
    if (typeof document === 'undefined' || width <= 0 || height <= 0) {
      return false;
    }

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.fieldCtx = this.canvas.getContext('2d');
    }
    if (!this.canvas || !this.fieldCtx) {
      return false;
    }

    const pixelWidth = Math.max(1, Math.floor(width * profile.scale));
    const pixelHeight = Math.max(1, Math.floor(height * profile.scale));
    const nextKey = `${pixelWidth}:${pixelHeight}:${profile.population}:${getCondensationDetailProfile(settings).maxRims}`;

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.cacheKey = '';
    }

    if (this.cacheKey !== nextKey) {
      this.renderField(profile.population, settings);
      this.cacheKey = nextKey;
    }
    return true;
  }

  private renderField(population: number, settings: WeatherSettings) {
    const canvas = this.canvas;
    const ctx = this.fieldCtx;
    if (!canvas || !ctx) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const seed = 2166136261 ^ Math.imul(canvas.width, 73856093) ^ Math.imul(canvas.height, 19349663);
    const random = seededRandom(seed);
    const beads: CondensationBead[] = [];
    const phase = random() * TAU;
    const lensLimit = 180;
    let lensCount = 0;
    let attempts = 0;
    const maxAttempts = population * 5;

    while (beads.length < population && attempts < maxAttempts) {
      attempts += 1;
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const wetness = clamp(
        0.56 +
          Math.sin(x * 0.021 + phase) * 0.18 +
          Math.sin(y * 0.017 - phase * 0.7) * 0.15 +
          Math.sin((x + y) * 0.008 + phase * 1.8) * 0.12 -
          Math.max(
            0,
            (Math.sin(x * 0.006 + phase * 0.42) + Math.sin(y * 0.005 - phase * 0.31) - 1.05) * 0.2,
          ),
        0.12,
        0.96,
      );
      if (random() > wetness) {
        continue;
      }

      const tierRoll = random();
      const tier: CondensationTier = tierRoll < 0.035 && lensCount < lensLimit
        ? 'lens'
        : tierRoll < 0.34
          ? 'bead'
          : 'mist';
      if (tier === 'lens') {
        lensCount += 1;
      }

      const radiusX = tier === 'lens'
        ? 1.5 + Math.pow(random(), 1.7) * 2.3
        : tier === 'bead'
          ? 0.5 + Math.pow(random(), 2) * 1.15
          : 0.18 + Math.pow(random(), 3.1) * 0.46;
      const aspect = tier === 'lens'
        ? 0.8 + random() * 0.72
        : tier === 'bead'
          ? 0.76 + random() * 0.62
          : 0.72 + random() * 0.48;
      const highlightStrength = tier === 'lens'
        ? 0.72 + random() * 0.28
        : tier === 'bead'
          ? 0.3 + random() * 0.56
          : random() * 0.42;
      beads.push({
        x,
        y,
        radiusX,
        radiusY: radiusX * aspect,
        tier,
        rotation: (random() - 0.5) * (tier === 'lens' ? 0.56 : 0.34),
        highlightStrength,
      });
    }

    this.buildDetailPaths(beads, settings);

    // Stamp three small reusable lenses instead of submitting enormous paths
    // containing thousands of overlapping ellipses. Clear centers keep the
    // film looking like water rather than dark stippled paint.
    ctx.globalAlpha = 1;
    for (const bead of beads) {
      const sprite = getBeadSprite(bead.tier);
      if (!sprite) continue;
      ctx.drawImage(sprite,
        bead.x - bead.radiusX * 1.2, bead.y - bead.radiusY * 1.2,
        bead.radiusX * 2.4, bead.radiusY * 2.4);
    }
  }

  private buildDetailPaths(
    beads: readonly CondensationBead[],
    settings: WeatherSettings,
  ) {
    if (typeof Path2D === 'undefined') {
      this.detailDarkRimPath = null;
      this.detailLightRimPath = null;
      this.detailHighlightPath = null;
      return;
    }

    const profile = getCondensationDetailProfile(settings);
    const lenses = beads.filter((bead) => bead.tier === 'lens');
    const beadCandidates = beads.filter((bead) => bead.tier === 'bead');
    const beadBudget = Math.max(0, profile.maxRims - lenses.length);
    const stride = beadBudget > 0 ? Math.max(1, Math.ceil(beadCandidates.length / beadBudget)) : Number.POSITIVE_INFINITY;
    const selected = [
      ...lenses,
      ...beadCandidates.filter((_, index) => index % stride === 0).slice(0, beadBudget),
    ];

    const darkRim = new Path2D();
    const lightRim = new Path2D();
    const highlights = new Path2D();
    for (const bead of selected) {
      traceDetailArc(
        darkRim,
        bead.x,
        bead.y,
        bead.radiusX * 1.02,
        bead.radiusY * 1.02,
        bead.rotation,
        Math.PI * 1.06,
        Math.PI * 1.94,
      );
      traceDetailArc(
        lightRim,
        bead.x - bead.radiusX * 0.035,
        bead.y - bead.radiusY * 0.035,
        bead.radiusX * 0.92,
        bead.radiusY * 0.9,
        bead.rotation,
        Math.PI * 0.15,
        Math.PI * (0.72 + bead.highlightStrength * 0.1),
      );

      if (bead.highlightStrength >= profile.highlightThreshold) {
        const radius = Math.max(0.11, bead.radiusX * 0.12 * bead.highlightStrength);
        const highlightX = bead.x - bead.radiusX * 0.34;
        const highlightY = bead.y - bead.radiusY * 0.34;
        highlights.moveTo(highlightX + radius, highlightY);
        highlights.arc(highlightX, highlightY, radius, 0, TAU);
      }
    }

    this.detailDarkRimPath = darkRim;
    this.detailLightRimPath = lightRim;
    this.detailHighlightPath = highlights;
  }
}
