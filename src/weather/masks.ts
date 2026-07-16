import type { Rect } from './types';

export function expandRect(rect: Rect, margin: number, bounds?: Pick<Rect, 'width' | 'height'>): Rect {
  const x = Math.max(0, rect.x - margin);
  const y = Math.max(0, rect.y - margin);
  const right = bounds ? Math.min(bounds.width, rect.x + rect.width + margin) : rect.x + rect.width + margin;
  const bottom = bounds ? Math.min(bounds.height, rect.y + rect.height + margin) : rect.y + rect.height + margin;

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export function createFocusQuietMask(
  clearMask: Rect | null,
  width: number,
  height: number,
  margin: number,
): Rect | null {
  if (!clearMask || margin <= 0) {
    return clearMask;
  }

  return expandRect(clearMask, margin, { width, height });
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function pointInRect(x: number, y: number, rect: Rect, padding = 0): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  );
}

export function ellipseIntersectsRect(
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rect: Rect,
  padding = 0,
): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  const closestX = Math.max(left, Math.min(x, right));
  const closestY = Math.max(top, Math.min(y, bottom));
  const distanceX = Math.abs(x - closestX);
  const distanceY = Math.abs(y - closestY);
  const safeRadiusX = Math.abs(radiusX);
  const safeRadiusY = Math.abs(radiusY);
  const normalizedX = safeRadiusX === 0 ? (distanceX === 0 ? 0 : Number.POSITIVE_INFINITY) : distanceX / safeRadiusX;
  const normalizedY = safeRadiusY === 0 ? (distanceY === 0 ? 0 : Number.POSITIVE_INFINITY) : distanceY / safeRadiusY;

  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

export function getFocusMaskCornerRadius(mask: Rect, width: number, height: number) {
  const coversCanvas =
    mask.x <= 0 &&
    mask.y <= 0 &&
    mask.x + mask.width >= width &&
    mask.y + mask.height >= height;
  if (coversCanvas) {
    return 0;
  }

  return Math.max(0, Math.min(12, mask.width * 0.08, mask.height * 0.08));
}

export function traceRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const safeRadius = Math.max(0, Math.min(radius, rect.width * 0.5, rect.height * 0.5));
  if (safeRadius <= 0.01) {
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    return;
  }

  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  ctx.moveTo(rect.x + safeRadius, rect.y);
  ctx.lineTo(right - safeRadius, rect.y);
  ctx.arcTo(right, rect.y, right, rect.y + safeRadius, safeRadius);
  ctx.lineTo(right, bottom - safeRadius);
  ctx.arcTo(right, bottom, right - safeRadius, bottom, safeRadius);
  ctx.lineTo(rect.x + safeRadius, bottom);
  ctx.arcTo(rect.x, bottom, rect.x, bottom - safeRadius, safeRadius);
  ctx.lineTo(rect.x, rect.y + safeRadius);
  ctx.arcTo(rect.x, rect.y, rect.x + safeRadius, rect.y, safeRadius);
  ctx.closePath();
}

export function withInactiveClip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clearMask: Rect | null,
  draw: () => void,
  extraClearMasks: Rect[] = [],
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  if (clearMask) {
    traceRoundedRect(ctx, clearMask, getFocusMaskCornerRadius(clearMask, width, height));
  }
  for (const mask of extraClearMasks) {
    traceRoundedRect(ctx, mask, getFocusMaskCornerRadius(mask, width, height));
  }
  ctx.clip('evenodd');
  draw();
  ctx.restore();
}

export function drawMaskFeather(ctx: CanvasRenderingContext2D, mask: Rect, fogColor: string, strength: number) {
  if (strength <= 0) {
    return;
  }

  const feather = 5;
  const outer = {
    x: mask.x - feather,
    y: mask.y - feather,
    width: mask.width + feather * 2,
    height: mask.height + feather * 2,
  };

  ctx.save();
  ctx.beginPath();
  const radius = Math.max(0, Math.min(12, mask.width * 0.08, mask.height * 0.08));
  traceRoundedRect(ctx, outer, radius + feather);
  traceRoundedRect(ctx, mask, radius);
  ctx.clip('evenodd');

  const top = ctx.createLinearGradient(0, outer.y, 0, mask.y);
  top.addColorStop(0, 'rgba(0,0,0,0)');
  top.addColorStop(1, fogColor);
  ctx.globalAlpha = strength * 0.05;
  ctx.fillStyle = top;
  ctx.fillRect(mask.x, outer.y, mask.width, feather);

  const bottom = ctx.createLinearGradient(0, mask.y + mask.height, 0, outer.y + outer.height);
  bottom.addColorStop(0, fogColor);
  bottom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(mask.x, mask.y + mask.height, mask.width, feather);

  const left = ctx.createLinearGradient(outer.x, 0, mask.x, 0);
  left.addColorStop(0, 'rgba(0,0,0,0)');
  left.addColorStop(1, fogColor);
  ctx.fillStyle = left;
  ctx.fillRect(outer.x, mask.y, feather, mask.height);

  const right = ctx.createLinearGradient(mask.x + mask.width, 0, outer.x + outer.width, 0);
  right.addColorStop(0, fogColor);
  right.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = right;
  ctx.fillRect(mask.x + mask.width, mask.y, feather, mask.height);
  ctx.restore();
}
