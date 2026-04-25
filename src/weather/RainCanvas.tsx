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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - lastTime) / 1000);
      lastTime = now;
      const rect = canvas.getBoundingClientRect();
      const currentSettings = settingsRef.current;
      const preset = MODE_PRESETS[currentSettings.mode];

      engineRef.current.render(ctx, rect.width, rect.height, dt, maskRef.current, currentSettings, preset);
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
