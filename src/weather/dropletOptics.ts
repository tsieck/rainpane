export type OpticalDropletShape = 'micro' | 'bead' | 'pane' | 'runner';

export interface DropletOpticalSample {
  red: number;
  green: number;
  blue: number;
  alpha: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  fresnel: number;
}

interface OpticalSpriteMetrics {
  canvasWidth: number;
  canvasHeight: number;
  centerX: number;
  centerY: number;
  bodyRadiusX: number;
  bodyRadiusY: number;
}

export const WATER_REFRACTIVE_INDEX = 1.333;
export const WATER_F0 = Math.pow((1 - WATER_REFRACTIVE_INDEX) / (1 + WATER_REFRACTIVE_INDEX), 2);
export const DROPLET_OPTICAL_VARIANTS = 8;

export const OPTICAL_SPRITE_METRICS: Record<OpticalDropletShape, OpticalSpriteMetrics> = {
  micro: { canvasWidth: 24, canvasHeight: 24, centerX: 12, centerY: 12, bodyRadiusX: 8, bodyRadiusY: 8 },
  bead: { canvasWidth: 64, canvasHeight: 64, centerX: 32, centerY: 32, bodyRadiusX: 21, bodyRadiusY: 21 },
  pane: { canvasWidth: 64, canvasHeight: 80, centerX: 32, centerY: 43, bodyRadiusX: 20, bodyRadiusY: 27 },
  runner: { canvasWidth: 64, canvasHeight: 80, centerX: 32, centerY: 43, bodyRadiusX: 20, bodyRadiusY: 27 },
};

const SPRITE_PIXEL_SCALE = 4;
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LIGHT_HALF_X = -0.251;
const LIGHT_HALF_Y = -0.311;
const LIGHT_HALF_Z = 0.917;
const spriteCache = new Map<string, HTMLCanvasElement>();

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fract(value: number) {
  return value - Math.floor(value);
}

export function schlickWaterFresnel(cosine: number) {
  const cosTheta = clamp(Math.abs(cosine));
  return WATER_F0 + (1 - WATER_F0) * Math.pow(1 - cosTheta, 5);
}

export function getDropletOpticalVariant(seed: number, identity = 0) {
  const safeSeed = Number.isFinite(seed) ? seed : 0;
  const safeIdentity = Number.isFinite(identity) ? identity : 0;
  const mixed = fract(Math.sin(safeSeed * 12.9898 + safeIdentity * 78.233) * 43758.5453);
  return Math.min(DROPLET_OPTICAL_VARIANTS - 1, Math.floor(mixed * DROPLET_OPTICAL_VARIANTS));
}

/**
 * Samples a clear adhered-water lens from an analytic spherical cap. The
 * result deliberately keeps the transmitted center almost transparent: the
 * visible structure comes from water Fresnel, a coherent room reflection,
 * and the opposing contact meniscus instead of an opaque teal fill.
 */
export function sampleDropletOptics(
  normalizedX: number,
  normalizedY: number,
  shape: OpticalDropletShape,
  opticalVariant = 0,
): DropletOpticalSample {
  const empty: DropletOpticalSample = {
    red: 0,
    green: 0,
    blue: 0,
    alpha: 0,
    normalX: 0,
    normalY: 0,
    normalZ: 1,
    fresnel: WATER_F0,
  };

  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
    return empty;
  }

  const variant = ((Math.floor(opticalVariant) % DROPLET_OPTICAL_VARIANTS) + DROPLET_OPTICAL_VARIANTS) % DROPLET_OPTICAL_VARIANTS;
  const phase = variant * GOLDEN_ANGLE;
  const verticalWeight = 1 - clamp(Math.abs(normalizedY), 0, 1);
  const spineBend =
    (shape === 'runner' ? 0.042 : shape === 'pane' ? 0.018 : 0.01) *
    Math.sin(phase + normalizedY * 2.7) *
    (0.35 + verticalWeight * 0.65);
  const localX = normalizedX - spineBend;
  const localY = normalizedY + Math.cos(phase * 0.73) * (shape === 'runner' ? 0.014 : 0.008);
  const capRadius = shape === 'runner' ? 1.07 : shape === 'pane' ? 1.025 : 1;
  const capX = localX / capRadius;
  const capY = localY / capRadius;
  const radiusSquared = capX * capX + capY * capY;

  if (radiusSquared >= 1) {
    return empty;
  }

  const radius = Math.sqrt(radiusSquared);
  const height = Math.sqrt(Math.max(0, 1 - radiusSquared));
  const edgeRoughness =
    Math.sin(capX * 7.3 + phase) *
    Math.sin(capY * 6.1 - phase * 0.67) *
    0.026 *
    smoothstep(0.35, 1, radius);
  let normalX = capX * (1.08 + edgeRoughness);
  let normalY = capY * (shape === 'runner' ? 0.96 : 1.08) - edgeRoughness * 0.44;
  let normalZ = height * (shape === 'micro' ? 0.92 : shape === 'bead' ? 0.86 : 0.8);
  const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
  normalX /= normalLength;
  normalY /= normalLength;
  normalZ /= normalLength;

  const fresnel = schlickWaterFresnel(normalZ);
  const reflectedX = 2 * normalZ * normalX;
  const reflectedY = 2 * normalZ * normalY;
  const roomLight = clamp(0.18 - reflectedX * 0.26 - reflectedY * 0.54);
  const upperLeft = clamp(0.5 - normalX * 0.46 - normalY * 0.5);
  const lowerRight = clamp(0.5 + normalX * 0.48 + normalY * 0.52);
  const halfDot = clamp(normalX * LIGHT_HALF_X + normalY * LIGHT_HALF_Y + normalZ * LIGHT_HALF_Z);
  const tightSpecular = Math.pow(halfDot, shape === 'micro' ? 54 : 78);
  const broadSpecular = Math.pow(halfDot, 18);
  const contactBand = smoothstep(0.72, 0.94, radius) * (1 - smoothstep(0.975, 1, radius));
  const brokenEdge = 0.76 + Math.sin(phase + Math.atan2(capY, capX) * 3) * 0.18;
  const reflection = fresnel * (0.3 + contactBand * 0.7) * brokenEdge;
  const brightEnergy =
    tightSpecular * 0.94 +
    broadSpecular * 0.1 +
    reflection * upperLeft * (0.18 + roomLight * 0.72);
  const darkEnergy =
    contactBand * lowerRight * (0.16 + (1 - roomLight) * 0.42) +
    reflection * lowerRight * 0.2;
  const transmittedAlpha = (shape === 'micro' ? 0.006 : 0.004) * (0.45 + (1 - height) * 0.55);
  const alpha = clamp(transmittedAlpha + brightEnergy * 0.76 + darkEnergy * 0.58, 0, 0.92);
  const energyTotal = brightEnergy + darkEnergy;
  const brightMix = energyTotal > 1e-5 ? brightEnergy / energyTotal : 0.5;
  const coolLift = roomLight * 12;
  const brightRed = 226 + coolLift;
  const brightGreen = 241 + coolLift * 0.72;
  const brightBlue = 242 + coolLift * 0.78;
  const darkRed = 2 + roomLight * 11;
  const darkGreen = 8 + roomLight * 16;
  const darkBlue = 11 + roomLight * 18;

  return {
    red: clamp(darkRed + (brightRed - darkRed) * brightMix, 0, 255),
    green: clamp(darkGreen + (brightGreen - darkGreen) * brightMix, 0, 255),
    blue: clamp(darkBlue + (brightBlue - darkBlue) * brightMix, 0, 255),
    alpha,
    normalX,
    normalY,
    normalZ,
    fresnel,
  };
}

function traceDropletBody(
  ctx: CanvasRenderingContext2D,
  shape: OpticalDropletShape,
  metrics: OpticalSpriteMetrics,
) {
  const { centerX, centerY, bodyRadiusX: radiusX, bodyRadiusY: radiusY } = metrics;
  ctx.beginPath();
  if (shape === 'runner') {
    ctx.moveTo(centerX - radiusX * 0.38, centerY - radiusY * 0.68);
    ctx.bezierCurveTo(
      centerX - radiusX * 0.22,
      centerY - radiusY * 0.9,
      centerX + radiusX * 0.2,
      centerY - radiusY * 0.88,
      centerX + radiusX * 0.46,
      centerY - radiusY * 0.62,
    );
    ctx.bezierCurveTo(
      centerX + radiusX * 1.02,
      centerY - radiusY * 0.12,
      centerX + radiusX * 0.88,
      centerY + radiusY * 0.66,
      centerX + radiusX * 0.18,
      centerY + radiusY,
    );
    ctx.bezierCurveTo(
      centerX - radiusX * 0.58,
      centerY + radiusY * 0.96,
      centerX - radiusX * 1.02,
      centerY + radiusY * 0.34,
      centerX - radiusX * 0.9,
      centerY - radiusY * 0.14,
    );
    ctx.bezierCurveTo(
      centerX - radiusX * 0.78,
      centerY - radiusY * 0.46,
      centerX - radiusX * 0.58,
      centerY - radiusY * 0.62,
      centerX - radiusX * 0.38,
      centerY - radiusY * 0.68,
    );
    ctx.closePath();
    return;
  }

  ctx.ellipse(centerX, centerY, radiusX, radiusY, -0.05, 0, TAU);
}

function createOpticalSprite(shape: OpticalDropletShape, opticalVariant: number) {
  if (typeof document === 'undefined') {
    return null;
  }

  const metrics = OPTICAL_SPRITE_METRICS[shape];
  const canvas = document.createElement('canvas');
  canvas.width = metrics.canvasWidth * SPRITE_PIXEL_SCALE;
  canvas.height = metrics.canvasHeight * SPRITE_PIXEL_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let pixelY = 0; pixelY < canvas.height; pixelY += 1) {
    const logicalY = (pixelY + 0.5) / SPRITE_PIXEL_SCALE;
    const normalizedY = (logicalY - metrics.centerY) / metrics.bodyRadiusY;
    for (let pixelX = 0; pixelX < canvas.width; pixelX += 1) {
      const logicalX = (pixelX + 0.5) / SPRITE_PIXEL_SCALE;
      const normalizedX = (logicalX - metrics.centerX) / metrics.bodyRadiusX;
      const sample = sampleDropletOptics(normalizedX, normalizedY, shape, opticalVariant);
      const offset = (pixelY * canvas.width + pixelX) * 4;
      pixels.data[offset] = Math.round(sample.red);
      pixels.data[offset + 1] = Math.round(sample.green);
      pixels.data[offset + 2] = Math.round(sample.blue);
      pixels.data[offset + 3] = Math.round(sample.alpha * 255);
    }
  }
  ctx.putImageData(pixels, 0, 0);

  ctx.save();
  ctx.setTransform(SPRITE_PIXEL_SCALE, 0, 0, SPRITE_PIXEL_SCALE, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#fff';
  traceDropletBody(ctx, shape, metrics);
  ctx.fill();
  ctx.restore();
  return canvas;
}

function getOpticalSprite(shape: OpticalDropletShape, opticalVariant: number) {
  const variant = ((Math.floor(opticalVariant) % DROPLET_OPTICAL_VARIANTS) + DROPLET_OPTICAL_VARIANTS) % DROPLET_OPTICAL_VARIANTS;
  const key = `${shape}:${variant}`;
  const cached = spriteCache.get(key);
  if (cached) {
    return cached;
  }
  const sprite = createOpticalSprite(shape, variant);
  if (sprite) {
    spriteCache.set(key, sprite);
  }
  return sprite;
}

export function drawOpticalDroplet(
  ctx: CanvasRenderingContext2D,
  shape: OpticalDropletShape,
  opticalVariant: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  alpha = 1,
) {
  const sprite = getOpticalSprite(shape, opticalVariant);
  if (!sprite || radiusX <= 0 || radiusY <= 0 || alpha <= 0) {
    return false;
  }

  const metrics = OPTICAL_SPRITE_METRICS[shape];
  const scaleX = radiusX / metrics.bodyRadiusX;
  const scaleY = radiusY / metrics.bodyRadiusY;
  ctx.globalAlpha = clamp(alpha);
  ctx.drawImage(
    sprite,
    centerX - metrics.centerX * scaleX,
    centerY - metrics.centerY * scaleY,
    metrics.canvasWidth * scaleX,
    metrics.canvasHeight * scaleY,
  );
  return true;
}
