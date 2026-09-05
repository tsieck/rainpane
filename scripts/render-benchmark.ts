import { DEFAULT_SETTINGS, MODE_PRESETS } from '../src/state/settingsStore';
import { WeatherEngine } from '../src/weather/weatherEngine';
import { WetGlassEngine } from '../src/weather/wetGlassEngine';
import type { WeatherMode } from '../src/weather/types';

const output = document.querySelector<HTMLPreElement>('#results')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
button.addEventListener('click', async () => {
  button.disabled = true;
  output.textContent = 'Running…';
  const results = [];
  const random = Math.random;
  try {
    for (const mode of ['cozy-rain', 'storm-lock-in', 'winterglass'] as WeatherMode[]) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      let seed = 12345;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      const settings = { ...DEFAULT_SETTINGS, ...MODE_PRESETS[mode].settings, mode, lowPowerMode: false, renderBudget: 'standard' as const };
      const contexts = [0.9, 1, 2].map((scale) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1600 * scale;
        canvas.height = 900 * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        return ctx;
      });
      const weather = new WeatherEngine();
      const glass = new WetGlassEngine();
      const mask = { x: 160, y: 180, width: 700, height: 480 };
      const samples: number[] = [];
      let coldMs = 0;
      for (let frame = 0; frame < 125; frame++) {
        const start = performance.now();
        glass.update(1600, 900, 1 / 30, mask, settings);
        weather.render(contexts[0], 1600, 900, 1 / 30, mask, settings, MODE_PRESETS[mode], mask);
        glass.applyAtmosphereClarity(contexts[0], 1600, 900, mask, settings);
        glass.renderFilm(contexts[1], 1600, 900, mask, settings);
        glass.renderDropletDetails(contexts[2], 1600, 900, mask, settings);
        const elapsed = performance.now() - start;
        if (frame === 0) coldMs = elapsed;
        if (frame >= 5) samples.push(elapsed);
      }
      samples.sort((a, b) => a - b);
      results.push({ mode, coldMs: +coldMs.toFixed(2), medianMs: +samples[60].toFixed(2), p95Ms: +samples[114].toFixed(2) });
      output.textContent = JSON.stringify(results, null, 2);
    }
  } finally {
    Math.random = random;
    button.disabled = false;
  }
});
