import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, MODE_PRESETS } from '../src/state/settingsStore';
import { RainCanvas } from '../src/weather/RainCanvas';
import type { WeatherMode } from '../src/weather/types';

const pane = document.querySelector<HTMLElement>('#pane')!;
const root = createRoot(document.querySelector('#weather')!);
let mode: WeatherMode = 'cozy-rain';
let focused = false;
let paused = false;
let reducedMotion = false;
let rightFocus = false;
function render() {
  const width = pane.clientWidth, height = pane.clientHeight;
  const mask = focused ? { x: width * (rightFocus ? 0.5 : 0.1), y: height * 0.25, width: width * 0.35, height: height * 0.5 } : null;
  pane.classList.toggle('focused', focused);
  pane.classList.toggle('focus-right', rightFocus);
  root.render(createElement(RainCanvas, {
    activeMask: mask,
    focusKey: focused ? (rightFocus ? 'right' : 'left') : null,
    settings: { ...DEFAULT_SETTINGS, ...MODE_PRESETS[mode].settings, mode, reducedMotion, fullRainWhileMoving: false },
    surface: 'preview', paused,
  }));
}
new ResizeObserver(render).observe(pane);
document.querySelector('#scene')!.addEventListener('change', (event) => {
  mode = (event.target as HTMLSelectElement).value as WeatherMode;
  render();
});
document.querySelector('#background')!.addEventListener('click', () => pane.classList.toggle('plain'));
document.querySelector('#focus')!.addEventListener('click', () => { focused = !focused; render(); });
document.querySelector('#switch')!.addEventListener('click', () => { focused = true; rightFocus = !rightFocus; render(); });
document.querySelector('#motion')!.addEventListener('click', (event) => {
  reducedMotion = !reducedMotion;
  (event.target as HTMLButtonElement).textContent = reducedMotion ? 'Restore motion' : 'Reduce motion'; render();
});
document.querySelector('#pause')!.addEventListener('click', (event) => {
  paused = !paused;
  (event.target as HTMLButtonElement).textContent = paused ? 'Resume' : 'Pause'; render();
});
render();

// Explicit, opt-in integration check. Readbacks stay in this development fixture.
const results = document.querySelector<HTMLPreElement>('#checks')!;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function alphaAt(x: number, y: number) {
  return [...pane.querySelectorAll('canvas')].map((canvas) => {
    const px = Math.floor(canvas.width * x), py = Math.floor(canvas.height * y);
    return canvas.getContext('2d')!.getImageData(px, py, 1, 1).data[3];
  });
}
document.querySelector('#verify')!.addEventListener('click', async (event) => {
  const button = event.target as HTMLButtonElement;
  button.disabled = true;
  const errors: string[] = [];
  const saved = { mode, focused, paused, reducedMotion, rightFocus };
  let checks = 0;
  try {
    paused = false; focused = true; rightFocus = false; reducedMotion = false; render();
    await wait(100);
    for (const next of ['storm-lock-in', 'night-drive', 'greyglass', 'winterglass', 'cozy-rain'] as WeatherMode[]) {
      mode = next; rightFocus = !rightFocus; render();
      for (const delay of [50, 150, 350, 500]) {
        await wait(delay);
        const alphas = alphaAt(rightFocus ? 0.675 : 0.275, 0.5);
        if (alphas.some((alpha) => alpha !== 0)) errors.push(`${next}: focus alpha ${alphas}`);
        checks++;
        results.textContent = `Checking focus through scene transitions: ${checks} samples…`;
      }
    }
    paused = true; render(); await wait(100);
    for (const x of [0.05, 0.3, 0.65, 0.9]) {
      if (alphaAt(x, 0.5).some((alpha) => alpha !== 0)) errors.push('Pause left weather visible');
      checks++;
    }
    paused = false; reducedMotion = true; render(); await wait(100);
    rightFocus = !rightFocus; render(); await wait(100);
    if (alphaAt(rightFocus ? 0.675 : 0.275, 0.5).some((alpha) => alpha !== 0)) errors.push('Reduced motion focus was not clear');
    checks++;
    results.textContent = errors.length ? errors.join('\n') : `PASS: ${checks} pixel checks across all three production canvas layers; focus stayed clear through five scene changes, pause and reduced motion.`;
  } finally {
    ({ mode, focused, paused, reducedMotion, rightFocus } = saved);
    render(); button.disabled = false;
  }
});
