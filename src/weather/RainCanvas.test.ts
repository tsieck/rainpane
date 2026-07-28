import { describe, expect, it } from 'vitest';
import { shouldRenderCanvasDropletHeads } from './RainCanvas';

describe('Canvas droplet-head fallback', () => {
  it('hands droplet heads to Metal only after the overlay pipeline is live', () => {
    expect(shouldRenderCanvasDropletHeads('overlay', true, 'live')).toBe(false);
    expect(shouldRenderCanvasDropletHeads('overlay', true, 'starting')).toBe(true);
    expect(shouldRenderCanvasDropletHeads('overlay', true, 'permission-needed')).toBe(true);
    expect(shouldRenderCanvasDropletHeads('overlay', false, 'live')).toBe(true);
  });

  it('always retains Canvas heads in the preview', () => {
    expect(shouldRenderCanvasDropletHeads('preview', true, 'live')).toBe(true);
  });
});
