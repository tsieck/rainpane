import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { FrameCadence } from './frameCadence';
import { coversViewport } from './masks';
import { FocusTransition } from './focusTransition';
import { SceneTransition } from './sceneTransition';

interface RainCanvasProps {
  activeMask: Rect | null;
  focusKey?: string | number | null;
  settings: WeatherSettings;
  surface?: RainCanvasSurface;
  paused?: boolean;
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
  focusKey,
  settings,
  surface = 'overlay',
  paused = false,
  photorealRefractionStatus = 'off',
}: RainCanvasProps) {
  const atmosphereCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glassCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [engine] = useState(() => new WeatherEngine());
  const [wetGlassEngine] = useState(() => new WetGlassEngine());
  const invalidateRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(paused);
  const settingsRef = useRef(settings);
  const maskRef = useRef(activeMask);
  const focusKeyRef = useRef(focusKey);
  const refractionStatusRef = useRef(photorealRefractionStatus);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });

  useLayoutEffect(() => {
    settingsRef.current = settings;
    invalidateRef.current?.();
  }, [settings]);

  useLayoutEffect(() => {
    maskRef.current = activeMask;
    focusKeyRef.current = focusKey;
    invalidateRef.current?.();
  }, [activeMask, focusKey]);

  useEffect(() => {
    refractionStatusRef.current = photorealRefractionStatus;
    invalidateRef.current?.();
  }, [photorealRefractionStatus]);

  useEffect(() => {
    pausedRef.current = paused;
    invalidateRef.current?.();
  }, [paused]);

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
    const atmosphereCadence = new FrameCadence();
    const filmCadence = new FrameCadence();
    const detailCadence = new FrameCadence();
    const focusTransition = new FocusTransition();
    const sceneTransition = new SceneTransition();
    let resolutionDirty = true;
    let inViewport = true;
    let lastDeviceScale = window.devicePixelRatio || 1;
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
      resolutionDirty = false;
      lastDeviceScale = window.devicePixelRatio || 1;
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        sizeRef.current = { ...sizeRef.current, width: entry.contentRect.width, height: entry.contentRect.height };
        invalidate();
      }
    });
    observer.observe(atmosphereCanvas);
    const initialRect = atmosphereCanvas.getBoundingClientRect();
    applyResolution(initialRect.width, initialRect.height);

    const scheduleFrame = (delayMs = 0) => {
      if (frameId || timerId) return;
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
      frameId = 0;
      if (document.visibilityState === 'hidden' || !inViewport) return;
      const scene = sceneTransition.sample(settingsRef.current, now);
      const currentSettings = scene.settings;
      const currentSize = sizeRef.current;
      const protectedMask = createProtectedWeatherMask(maskRef.current, currentSize.width, currentSize.height, currentSettings);
      if (pausedRef.current || coversViewport(protectedMask, currentSize.width, currentSize.height)) {
        focusTransition.update(protectedMask, focusKeyRef.current, now, false);
        for (const ctx of [atmosphereCtx, glassCtx, detailCtx]) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.restore();
        }
        if (surface === 'overlay' && currentSettings.photorealRefractionEnabled) {
          window.rainpane?.submitPhotorealRefractionFrame?.({
            viewport: { width: currentSize.width, height: currentSize.height },
            protectedMask,
            droplets: [],
          });
        }
        lastTime = now;
        return;
      }
      const atmosphereProfile = getRainCanvasRenderProfile(currentSettings, surface);
      const detailProfile = getWetGlassDetailRenderProfile(currentSettings, surface);
      if (!detailCadence.due(now, detailProfile.targetFps)) {
        scheduleFrame(detailCadence.delay(now));
        return;
      }

      const dt = Math.min(atmosphereProfile.maxDeltaSeconds, (now - lastTime) / 1000);
      lastTime = now;
      if (resolutionDirty || lastDeviceScale !== (window.devicePixelRatio || 1)) {
        applyResolution(currentSize.width, currentSize.height);
      }
      const { width, height } = sizeRef.current;
      const focusReturning = focusTransition.update(protectedMask, focusKeyRef.current, now,
        !currentSettings.reducedMotion && !currentSettings.coverFullScreen &&
        !(currentSettings.fullRainWhileMoving && !protectedMask));

      wetGlassEngine.update(width, height, dt, protectedMask, currentSettings);
      const atmosphereDue = atmosphereCadence.due(now, atmosphereProfile.targetFps);
      if (atmosphereDue || focusReturning || scene.active) {
        const atmosphereDt = lastAtmosphereRenderTime === 0
          ? dt
          : Math.min(atmosphereProfile.maxDeltaSeconds, (now - lastAtmosphereRenderTime) / 1000);
        engine.render(
          atmosphereCtx,
          width,
          height,
          atmosphereDt,
          maskRef.current,
          currentSettings,
          scene.preset,
          protectedMask,
        );
        wetGlassEngine.applyAtmosphereClarity(
          atmosphereCtx,
          width,
          height,
          protectedMask,
          currentSettings,
        );
        focusTransition.apply(atmosphereCtx, width, height, now);
        lastAtmosphereRenderTime = now;
      }

      const filmDue = filmCadence.due(now, detailProfile.filmFps);
      if (filmDue || focusReturning) {
        wetGlassEngine.renderFilm(
          glassCtx,
          width,
          height,
          protectedMask,
          currentSettings,
        );
        focusTransition.apply(glassCtx, width, height, now);
      }
      wetGlassEngine.renderDropletDetails(
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
      focusTransition.apply(detailCtx, width, height, now);
      if (
        surface === 'overlay' &&
        currentSettings.photorealRefractionEnabled &&
        now - lastRefractionSubmitTime >= 1000 / 30 &&
        window.rainpane?.submitPhotorealRefractionFrame
      ) {
        const frame = wetGlassEngine.getPhotorealRefractionFrame(width, height, protectedMask);
        if (focusReturning) {
          for (const drop of frame.droplets) drop.opacity *= focusTransition.opacityAt(drop.x, drop.y, now);
        }
        window.rainpane.submitPhotorealRefractionFrame(frame);
        lastRefractionSubmitTime = now;
      }
      scheduleFrame(detailCadence.delay(performance.now()));
    };

    function invalidate() {
      lastRefractionSubmitTime = 0;
      resolutionDirty = true;
      atmosphereCadence.reset();
      filmCadence.reset();
      detailCadence.reset();
      if (timerId) window.clearTimeout(timerId);
      timerId = 0;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      scheduleFrame();
    }
    const resume = () => {
      lastTime = performance.now();
      lastAtmosphereRenderTime = 0;
      invalidate();
    };
    const intersectionObserver = surface === 'preview' ? new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      if (inViewport) resume();
    }) : null;
    intersectionObserver?.observe(atmosphereCanvas);
    invalidateRef.current = invalidate;
    document.addEventListener('visibilitychange', resume);
    scheduleFrame();

    return () => {
      cancelAnimationFrame(frameId);
      if (timerId) {
        window.clearTimeout(timerId);
      }
      observer.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', resume);
      invalidateRef.current = null;
    };
  }, [surface, engine, wetGlassEngine]);

  return (
    <>
      <canvas ref={atmosphereCanvasRef} className="rain-canvas rain-canvas--atmosphere" aria-hidden="true" />
      <canvas ref={glassCanvasRef} className="rain-canvas rain-canvas--glass" aria-hidden="true" />
      <canvas ref={detailCanvasRef} className="rain-canvas rain-canvas--detail" aria-hidden="true" />
    </>
  );
}
