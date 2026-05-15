import { useEffect, useRef } from 'react';
import { MODE_PRESETS } from '../state/settingsStore';
import { getRainCanvasRenderProfile, type RainCanvasSurface } from './renderProfile';
import type { Rect, WeatherSettings } from './types';
import { WeatherEngine } from './weatherEngine';

interface RainCanvasProps {
  activeMask: Rect | null;
  settings: WeatherSettings;
  surface?: RainCanvasSurface;
}

export function RainCanvas({ activeMask, settings, surface = 'overlay' }: RainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(new WeatherEngine());
  const settingsRef = useRef(settings);
  const maskRef = useRef(activeMask);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    maskRef.current = activeMask;
  }, [activeMask]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return;
    }

    let frameId = 0;
    let timerId = 0;
    let lastTime = performance.now();
    let lastRenderTime = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const currentSettings = settingsRef.current;
      const profile = getRainCanvasRenderProfile(currentSettings, surface);
      const dpr = Math.min(window.devicePixelRatio || 1, profile.pixelScaleCap);
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));

      sizeRef.current = { width, height, dpr };
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

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
      const profile = getRainCanvasRenderProfile(currentSettings, surface);
      const frameInterval = 1000 / profile.targetFps;

      if (document.visibilityState === 'hidden') {
        lastTime = now;
        lastRenderTime = now;
        scheduleFrame(1000 / profile.hiddenFps);
        return;
      }

      if (lastRenderTime > 0 && now - lastRenderTime < frameInterval) {
        scheduleFrame(frameInterval - (now - lastRenderTime));
        return;
      }

      const dt = Math.min(profile.maxDeltaSeconds, (now - lastTime) / 1000);
      lastTime = now;
      lastRenderTime = now;
      resize();
      const { width, height } = sizeRef.current;
      const preset = MODE_PRESETS[currentSettings.mode];

      engineRef.current.render(ctx, width, height, dt, maskRef.current, currentSettings, preset);
      scheduleFrame(frameInterval);
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

  return <canvas ref={canvasRef} className="rain-canvas" aria-hidden="true" />;
}
