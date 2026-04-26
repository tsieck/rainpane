import type { Rect } from './types';

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
    ctx.rect(clearMask.x, clearMask.y, clearMask.width, clearMask.height);
  }
  for (const mask of extraClearMasks) {
    ctx.rect(mask.x, mask.y, mask.width, mask.height);
  }
  ctx.clip('evenodd');
  draw();
  ctx.restore();
}

export function drawMaskFeather(ctx: CanvasRenderingContext2D, mask: Rect, fogColor: string, strength: number) {
  if (strength <= 0) {
    return;
  }

  const feather = 30;
  const outer = {
    x: mask.x - feather,
    y: mask.y - feather,
    width: mask.width + feather * 2,
    height: mask.height + feather * 2,
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(outer.x, outer.y, outer.width, outer.height);
  ctx.rect(mask.x, mask.y, mask.width, mask.height);
  ctx.clip('evenodd');

  const top = ctx.createLinearGradient(0, outer.y, 0, mask.y);
  top.addColorStop(0, 'rgba(0,0,0,0)');
  top.addColorStop(1, fogColor);
  ctx.globalAlpha = strength * 0.18;
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
