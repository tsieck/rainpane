import { useEffect, useRef } from 'react';
import { MODE_PRESETS } from '../state/settingsStore';
import type { Rect, WeatherSettings } from './types';
import { WeatherEngine } from './weatherEngine';

interface RainCanvasProps {
  activeMask: Rect | null;
  settings: WeatherSettings;
}

export function RainCanvas({ activeMask, settings }: RainCanvasProps) {
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
    let lastTime = performance.now();
    let lastRenderTime = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const currentSettings = settingsRef.current;
      const dprCap = currentSettings.reducedMotion || currentSettings.lowPowerMode ? 1 : 1.5;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
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

    const tick = (now: number) => {
      const currentSettings = settingsRef.current;
      const targetFps = currentSettings.reducedMotion ? 16 : currentSettings.lowPowerMode ? 24 : 45;
      const frameInterval = 1000 / targetFps;

      if (document.visibilityState === 'hidden') {
        lastTime = now;
        lastRenderTime = now;
        frameId = requestAnimationFrame(tick);
        return;
      }

      if (lastRenderTime > 0 && now - lastRenderTime < frameInterval) {
        frameId = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min(currentSettings.lowPowerMode ? 0.08 : 0.05, (now - lastTime) / 1000);
      lastTime = now;
      lastRenderTime = now;
      resize();
      const { width, height } = sizeRef.current;
      const preset = MODE_PRESETS[currentSettings.mode];

      engineRef.current.render(ctx, width, height, dt, maskRef.current, currentSettings, preset);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="rain-canvas" aria-hidden="true" />;
}
