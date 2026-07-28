import { carveRunnerNecks, drawDroplets, mergeNearbyDroplets, syncDroplets, updateDroplets } from './droplets';
import { carveEdgeRunoff, drawEdgeRunoff, syncEdgeRunoff, updateEdgeRunoff } from './edgeRunoff';
import { withInactiveClip } from './masks';
import type {
  Droplet,
  EdgeRunoffDrop,
  PhotorealRefractionFrame,
  Rect,
  WeatherSettings,
} from './types';
import { WetGlassCondensationField } from './wetGlassCondensation';
import { WetGlassTrailField } from './wetGlassTrails';

export function isPhotorealRefractionCandidate(
  droplet: Pick<Droplet, 'opacity' | 'radiusX' | 'radiusY'>,
) {
  return droplet.opacity > 0.035 && droplet.radiusX > 1.2 && droplet.radiusY > 1.2;
}

export class WetGlassEngine {
  private droplets: Droplet[] = [];
  private edgeDrops: EdgeRunoffDrop[] = [];
  private trails = new WetGlassTrailField();
  private condensation = new WetGlassCondensationField();
  private mergeElapsed = 0;
  private wetEnabled = true;
  private filmCanvasHasContent = false;
  private detailCanvasHasContent = false;

  update(
    width: number,
    height: number,
    dt: number,
    protectedMask: Rect | null,
    settings: WeatherSettings,
  ) {
    const enabled = settings.dropletsEnabled && settings.dropletDensity > 0.005;
    if (!enabled) {
      if (this.wetEnabled) {
        this.droplets.length = 0;
        this.edgeDrops.length = 0;
        this.trails.reset();
        this.condensation.reset();
        this.mergeElapsed = 0;
      }
      this.wetEnabled = false;
      return;
    }

    this.wetEnabled = true;
    syncDroplets(this.droplets, width, height, settings, protectedMask);
    updateDroplets(this.droplets, width, height, dt, settings, protectedMask);

    this.mergeElapsed += dt;
    const mergeInterval = settings.renderBudget === 'conservative' ? 0.16 : settings.lowPowerMode ? 0.12 : 0.08;
    if (this.mergeElapsed >= mergeInterval) {
      const maxMerges = settings.renderBudget === 'conservative' ? 3 : settings.lowPowerMode ? 6 : 12;
      mergeNearbyDroplets(this.droplets, settings, maxMerges);
      this.mergeElapsed = 0;
    }

    // Stamp after coalescence so the persistent wake ends under the visible
    // merged head instead of leaving a phantom segment from an absorbed bead.
    this.trails.update(width, height, dt, this.droplets, protectedMask, settings);

    syncEdgeRunoff(this.edgeDrops, protectedMask, settings);
    updateEdgeRunoff(this.edgeDrops, protectedMask, dt, settings);
  }

  applyAtmosphereClarity(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    protectedMask: Rect | null,
    settings: WeatherSettings,
  ) {
    if (!this.wetEnabled) {
      return;
    }
    withInactiveClip(ctx, width, height, protectedMask, () => {
      this.trails.applyClarity(ctx, width, height, settings);
    });
  }

  renderFilm(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    protectedMask: Rect | null,
    settings: WeatherSettings,
  ) {
    if (!this.wetEnabled) {
      if (this.filmCanvasHasContent) {
        ctx.clearRect(0, 0, width, height);
        this.filmCanvasHasContent = false;
      }
      return;
    }

    ctx.clearRect(0, 0, width, height);
    this.filmCanvasHasContent = true;
    withInactiveClip(ctx, width, height, protectedMask, () => {
      this.condensation.draw(ctx, width, height, settings);
      this.trails.carveFilm(ctx, width, height, settings);
      carveRunnerNecks(ctx, this.droplets, settings);
      carveEdgeRunoff(ctx, this.edgeDrops, protectedMask, settings);
      this.trails.drawSheen(ctx, width, height, settings);
    });
  }

  renderDropletDetails(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    protectedMask: Rect | null,
    settings: WeatherSettings,
    options: { nativeDropletHeadsActive?: boolean } = {},
  ) {
    if (!this.wetEnabled) {
      if (this.detailCanvasHasContent) {
        ctx.clearRect(0, 0, width, height);
        this.detailCanvasHasContent = false;
      }
      return;
    }

    ctx.clearRect(0, 0, width, height);
    this.detailCanvasHasContent = true;
    withInactiveClip(ctx, width, height, protectedMask, () => {
      this.condensation.drawDetail(ctx, width, height, settings);
      this.trails.drawDetailSheen(ctx, width, height, settings);
      // Edge runoff is not part of the native payload, so it remains on the
      // detail canvas even while Metal owns the primary droplet heads.
      drawEdgeRunoff(ctx, this.edgeDrops, protectedMask, settings);
      const canvasDroplets = options.nativeDropletHeadsActive
        ? this.droplets.filter((droplet) => !isPhotorealRefractionCandidate(droplet))
        : this.droplets;
      // Tiny or near-transparent beads that cannot survive the native pass
      // remain a Canvas fallback; candidates rendered by Metal are not drawn
      // twice, which removes the muddy doubled rim.
      drawDroplets(ctx, canvasDroplets, settings);
    });
  }

  getPhotorealRefractionFrame(
    width: number,
    height: number,
    protectedMask: Rect | null,
  ): PhotorealRefractionFrame {
    return {
      viewport: { width, height },
      protectedMask,
      droplets: this.wetEnabled
        ? this.droplets
            .filter(isPhotorealRefractionCandidate)
            .map((droplet) => ({
              x: droplet.x,
              y: droplet.y,
              radiusX: droplet.radiusX,
              radiusY: droplet.radiusY,
              opacity: droplet.opacity,
              refraction: droplet.refraction,
              seed: droplet.seed,
            }))
        : [],
    };
  }
}
