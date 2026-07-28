import { useEffect, useRef } from 'react';
import { MODE_PRESETS } from '../state/settingsStore';
import {
  getRainCanvasRenderProfile,
  getWetGlassDetailPixelScale,
  getWetGlassDetailRenderProfile,
  getWetGlassPixelScale,
  type RainCanvasSurface,
} from './renderProfile';
import type { PhotorealRefractionStatus, Rect, WeatherSettings } from './types';
import { createProtectedWeatherMask, WeatherEngine } from './weatherEngine';
import { WetGlassEngine } from './wetGlassEngine';

interface RainCanvasProps {
  activeMask: Rect | null;
  settings: WeatherSettings;
  surface?: RainCanvasSurface;
  photorealRefractionStatus?: PhotorealRefractionStatus;
}

export function shouldRenderCanvasDropletHeads(
  surface: RainCanvasSurface,
  photorealRefractionEnabled: boolean,
  photorealRefractionStatus: PhotorealRefractionStatus,
) {
  return !(
    surface === 'overlay' &&
    photorealRefractionEnabled &&
    photorealRefractionStatus === 'live'
  );
}

export function RainCanvas({
  activeMask,
  settings,
  surface = 'overlay',
  photorealRefractionStatus = 'off',
}: RainCanvasProps) {
  const atmosphereCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glassCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(new WeatherEngine());
  const wetGlassEngineRef = useRef(new WetGlassEngine());
  const settingsRef = useRef(settings);
  const maskRef = useRef(activeMask);
  const refractionStatusRef = useRef(photorealRefractionStatus);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    maskRef.current = activeMask;
  }, [activeMask]);

  useEffect(() => {
    refractionStatusRef.current = photorealRefractionStatus;
  }, [photorealRefractionStatus]);

  useEffect(() => {
    const atmosphereCanvas = atmosphereCanvasRef.current;
    const glassCanvas = glassCanvasRef.current;
    const detailCanvas = detailCanvasRef.current;
    if (!atmosphereCanvas || !glassCanvas || !detailCanvas) {
      return;
    }

    const atmosphereCtx = atmosphereCanvas.getContext('2d', { alpha: true });
    const glassCtx = glassCanvas.getContext('2d', { alpha: true });
    const detailCtx = detailCanvas.getContext('2d', { alpha: true });
    if (!atmosphereCtx || !glassCtx || !detailCtx) {
      return;
    }

    let frameId = 0;
    let timerId = 0;
    let lastTime = performance.now();
    let lastAtmosphereRenderTime = 0;
    let lastFilmRenderTime = 0;
    let lastDetailRenderTime = 0;
    let lastRefractionSubmitTime = 0;

    const resizeCanvas = (
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      dpr: number,
    ) => {
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const applyResolution = (measuredWidth: number, measuredHeight: number) => {
      const currentSettings = settingsRef.current;
      const atmosphereProfile = getRainCanvasRenderProfile(currentSettings, surface);
      const atmosphereDpr = Math.min(window.devicePixelRatio || 1, atmosphereProfile.pixelScaleCap);
      const width = Math.max(1, measuredWidth);
      const height = Math.max(1, measuredHeight);
      const glassDpr = getWetGlassPixelScale(
        width,
        height,
        currentSettings,
        surface,
        window.devicePixelRatio || 1,
      );
      const detailDpr = getWetGlassDetailPixelScale(
        width,
        height,
        currentSettings,
        surface,
        window.devicePixelRatio || 1,
      );

      sizeRef.current = { width, height, dpr: atmosphereDpr };
      resizeCanvas(atmosphereCanvas, atmosphereCtx, width, height, atmosphereDpr);
      resizeCanvas(glassCanvas, glassCtx, width, height, glassDpr);
      resizeCanvas(detailCanvas, detailCtx, width, height, detailDpr);
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        applyResolution(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(atmosphereCanvas);
    const initialRect = atmosphereCanvas.getBoundingClientRect();
    applyResolution(initialRect.width, initialRect.height);

    const scheduleFrame = (delayMs = 0) => {
      if (delayMs > 0) {
        timerId = window.setTimeout(() => {
          timerId = 0;
          frameId = requestAnimationFrame(tick);
        }, delayMs);
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      const currentSettings = settingsRef.current;
      const atmosphereProfile = getRainCanvasRenderProfile(currentSettings, surface);
      const detailProfile = getWetGlassDetailRenderProfile(currentSettings, surface);
      const detailInterval = 1000 / detailProfile.targetFps;

      if (document.visibilityState === 'hidden') {
        lastTime = now;
        lastAtmosphereRenderTime = now;
        lastFilmRenderTime = now;
        lastDetailRenderTime = now;
        scheduleFrame(1000 / atmosphereProfile.hiddenFps);
        return;
      }

      if (lastDetailRenderTime > 0 && now - lastDetailRenderTime < detailInterval) {
        scheduleFrame(detailInterval - (now - lastDetailRenderTime));
        return;
      }

      const dt = Math.min(atmosphereProfile.maxDeltaSeconds, (now - lastTime) / 1000);
      lastTime = now;
      lastDetailRenderTime = now;
      const currentSize = sizeRef.current;
      applyResolution(currentSize.width, currentSize.height);
      const { width, height } = sizeRef.current;
      const protectedMask = createProtectedWeatherMask(maskRef.current, width, height, currentSettings);

      wetGlassEngineRef.current.update(width, height, dt, protectedMask, currentSettings);
      const atmosphereDue =
        lastAtmosphereRenderTime === 0 || now - lastAtmosphereRenderTime >= 1000 / atmosphereProfile.targetFps;
      if (atmosphereDue) {
        const atmosphereDt = lastAtmosphereRenderTime === 0
          ? dt
          : Math.min(atmosphereProfile.maxDeltaSeconds, (now - lastAtmosphereRenderTime) / 1000);
        const preset = MODE_PRESETS[currentSettings.mode];
        engineRef.current.render(
          atmosphereCtx,
          width,
          height,
          atmosphereDt,
          maskRef.current,
          currentSettings,
          preset,
          protectedMask,
        );
        wetGlassEngineRef.current.applyAtmosphereClarity(
          atmosphereCtx,
          width,
          height,
          protectedMask,
          currentSettings,
        );
        lastAtmosphereRenderTime = now;
      }

      const filmDue = lastFilmRenderTime === 0 || now - lastFilmRenderTime >= 1000 / detailProfile.filmFps;
      if (filmDue) {
        wetGlassEngineRef.current.renderFilm(
          glassCtx,
          width,
          height,
          protectedMask,
          currentSettings,
        );
        lastFilmRenderTime = now;
      }
      wetGlassEngineRef.current.renderDropletDetails(
        detailCtx,
        width,
        height,
        protectedMask,
        currentSettings,
        {
          nativeDropletHeadsActive: !shouldRenderCanvasDropletHeads(
            surface,
            currentSettings.photorealRefractionEnabled,
            refractionStatusRef.current,
          ),
        },
      );
      if (
        surface === 'overlay' &&
        currentSettings.photorealRefractionEnabled &&
        now - lastRefractionSubmitTime >= 1000 / 30 &&
        window.rainpane?.submitPhotorealRefractionFrame
      ) {
        window.rainpane.submitPhotorealRefractionFrame(
          wetGlassEngineRef.current.getPhotorealRefractionFrame(width, height, protectedMask),
        );
        lastRefractionSubmitTime = now;
      }
      scheduleFrame();
    };

    scheduleFrame();

    return () => {
      cancelAnimationFrame(frameId);
      if (timerId) {
        window.clearTimeout(timerId);
      }
      observer.disconnect();
    };
  }, [surface]);

  return (
    <>
      <canvas ref={atmosphereCanvasRef} className="rain-canvas rain-canvas--atmosphere" aria-hidden="true" />
      <canvas ref={glassCanvasRef} className="rain-canvas rain-canvas--glass" aria-hidden="true" />
      <canvas ref={detailCanvasRef} className="rain-canvas rain-canvas--detail" aria-hidden="true" />
    </>
  );
}
