# Rainpane visuals and rendering pass

Branch: `codex/rainpane-visual-performance`  
Baseline: `bbc7ffb` (0.1.12 release evidence)  
Measured: September 5, 2026

## Visible changes

- A separate, opaque control column gives the preview more usable space and removes the large backdrop blur over continuously animated weather.
- The heading and instructions remain readable at their actual font sizes. Only the draggable desktop scales to its available space.
- A paper-colored research window makes the clear focus pane immediately apparent against the surrounding atmosphere.
- Scene selection uses quiet rows and an underline tab indicator, with the existing settings and keyboard controls retained.
- Condensation beads have transparent centers, a dark contact rim, and a shared upper-left reflection. Sparse, irregular grain replaces the previous rows of dots.
- Window dragging uses the compositor's translation property; focus-mask coordinates still follow the same window model.

## Rendering changes

- Replace thousands of grain draw calls with one cached repeating texture.
- Stamp condensation from three small reusable lens sprites instead of filling enormous paths of overlapping ellipses.
- Cache stationary condensation rims. The extra raster is bounded to 4 million pixels / 3072 pixels per dimension, at most approximately 16 MB of raw RGBA storage per renderer. Large moving droplet heads retain the existing detail resolution budget.
- Generate optical sprites at 2× instead of 4× logical resolution, reducing generated texels and sprite storage by 75%.
- Cache tapered rain textures instead of creating a gradient for each streak on every standard-quality frame. The economical stroke path remains available.
- Preserve layer timing across refresh rates, rather than discarding fractional frame intervals. Existing frame-rate targets remain unchanged.
- Stop scheduling weather while paused, hidden, outside the preview viewport, or fully covered by the clear focus pane. Resume on visibility, settings, mask, or size changes. Send an empty native droplet frame when a fully protected overlay suspends.
- Construct engines once per mounted canvas, and recalculate backing dimensions only after invalidation or a device-scale change.

## Local benchmark

Run `npm exec vite -- --host 127.0.0.1`, open `/benchmarks.html`, and click **Run benchmark**. Reload before measuring to clear module-level sprite caches.

Both runs used the same browser and harness: a seeded 1600 × 900 scene, standard quality, 2× detail backing, a 700 × 480 focus mask, and 120 measured frames after five initial frames. All layers are submitted on each benchmark frame to isolate drawing costs from the scheduler. Modes run in the order below and share sprite caches, so the first-frame column is scene initialization, not three independent application cold starts.

| Scene | Median before → after | p95 before → after | First frame before → after |
| --- | ---: | ---: | ---: |
| Cozy Rain | 1.6 → 0.5 ms | 2.0 → 0.9 ms | 224.2 → 59.9 ms |
| Storm Lock-in | 1.9 → 0.9 ms | 2.3 → 1.5 ms | 357.2 → 33.7 ms |
| Winterglass | 1.2 → 0.3 ms | 1.9 → 0.4 ms | 99.6 → 38.4 ms |

These are single-run JavaScript canvas-submission measurements. They exclude GPU completion, native ScreenCaptureKit/Metal cost, Electron compositing, energy use, and IPC. Browser timing granularity and machine load affect the values. The median submission reduction was approximately 53–75%; this is not a measured battery-life improvement.

## Validation

- 123 Rainpane tests pass, including new frame-cadence, full-viewport protection, and condensation-cache invalidation/memory-budget cases. Command: `npm exec vitest -- run --exclude 'Prime Bloom/**'`.
- `npm run build` passes, including optimized Swift/Metal helper compilation, TypeScript checks, Vite production output, and Electron compilation.
- `git diff --check` passes.
- Browser verification: all five scene selections, keyboard window focus, drag and reset, overlay pause/resume, keyboard rain slider adjustment, reduced motion, and Scene/Tune/Behavior navigation.
- Layout inspected in same-origin preview frames at 1280 × 800, 1024 × 720, and 390 × 844. `/preview.html` provides repeatable size controls. The development CSP permits same-origin frames only on that fixture; the production policy is unchanged.
- The untracked `Prime Bloom` project was left untouched and excluded from the final test run.

Hardware follow-up: permission-granted native refraction, Windows runtime, mixed-DPI displays, GPU timing, and battery measurements were not exercised in this pass. No release artifacts were published.

## Reference-driven wet-glass refinement

The follow-up uses the supplied rainy-window photographs as direction for water rendering. It does not add photographs or simulated city lights to the desktop overlay. The development-only `/weather-study.html` uses a simple procedural backdrop, with a light/dark surface toggle and focus mask, to inspect the same weather engines in isolation.

- More mid-sized beads, varied aspect ratios and asymmetric contact outlines; dark upper shoulders and broad lower crescents replace uniformly lit bubble rims. Cached condensation stamps share the moving droplets' optical model.
- Slower gravity-led runners, less influence from crosswind, longer-lived drained channels and a few settled channels on startup. Trail textures and stamp limits remain bounded.
- Stationary mottled moisture replaces drifting fog ellipses and most of the flat tint. A palette-aware texture is capped at 512 pixels on its longest side, with at most six cached surfaces. Accumulation builds unevenly through the same moisture field.
- The optional native refraction shader uses matching irregular outlines, stronger local distortion and lower crescents. Protected sample-coordinate checks remain in place. No capture permissions were changed.

The updated single-run submission benchmark reports:

| Scene | Median | p95 | First frame |
| --- | ---: | ---: | ---: |
| Cozy Rain | 0.6 ms | 1.3 ms | 88.9 ms |
| Storm Lock-in | 1.0 ms | 1.5 ms | 49.9 ms |
| Winterglass | 0.2 ms | 0.4 ms | 36.6 ms |

The extra moisture texture and bead optics increase Cozy Rain's initial setup relative to the first pass; steady submission remains below the original baseline. The earlier benchmark limitations still apply.

Validation: 125 tests pass across 22 files; production build and diff checks pass. The Metal source was also compiled through `MTLDevice.makeLibrary` on the Apple M4 Pro, which checks the shader rather than only compiling its Swift string wrapper. Browser inspection covers both light and dark surfaces and a clear protected center. Permission-granted native refraction appearance and GPU/energy measurements still require separate verification.

## Native window alignment correction

The desktop screenshot exposed a real 25-pixel vertical offset: macOS reported the Electron overlay at `(0, 25, 5120, 2160)` while the display and mask coordinates started at `(0, 0)`. Enable `enableLargerThanScreen` for the transparent overlay so macOS does not constrain its frame beneath the menu bar. This keeps the Canvas overlay, focus mask and native refraction pane in the same coordinate space without adding a hardcoded menu-bar offset.

The rebuilt local app was launched and CoreGraphics reported its overlay at `(0, 0, 5120, 2160)`, matching the attached display exactly. Electron TypeScript compilation and 16 active-window/refraction geometry tests passed. The change is limited to native overlay construction; browser preview geometry is unchanged.


## Focus and scene continuity

- The newly focused window remains an immediate hard cutout. Weather returns to the previous window over 520 ms with smooth easing. Retiring regions are capped at four; moving or resizing the same window does not accumulate silhouettes. The final frame explicitly refreshes cached layers to remove any residual cutout.
- Scene changes blend fog, palette, rain strength, wind and pace over 900 ms. Interrupted changes start from the currently rendered scene. Sliders, layer switches, pause and reduced motion remain immediate.
- Scene selection no longer resets accumulated fog. Stationary beads use a seed independent of scene and density, preserving existing positions as the population changes. Moving droplets and trail history continue through the transition.
- Moisture geometry is cached separately from its color: at most six alpha textures, each capped at 512 pixels on the longest side, plus one reusable tint surface per renderer. Color blending does not regenerate noise or allocate a new moisture texture per frame. No additional full-screen buffers are needed for focus fades.
- The preview background interpolates registered color properties, with the existing reduced-motion overrides. The development weather study now mounts the actual production RainCanvas and includes opt-in pixel checks.

Validation on 2026-09-05:

- 133 tests pass across 24 files. New cases cover interrupted scene changes, responsive controls, bounded focus history, same-window movement, long visibility gaps, reduced motion, palette texture reuse and stable bead positions when density changes.
- The production build and local ad-hoc signature verification pass. The packaged preview opens and CoreGraphics confirms the overlay remains at `(0, 0, 5120, 2160)`.
- The production RainCanvas passed 25 live pixel checks across all three layers: the focused center remained transparent through all five scene changes, pause and reduced motion. The main preview's background was observed between its starting and target colors and then at the exact target color.
- Native Accessibility successfully moved and resized Rainpane's settings window, entered and exited fullscreen, and restored `(1920, 670, 1280, 820)`. The overlay retained its display-aligned bounds afterward.
- A three-minute sample of the packaged preview and its descendants remained running throughout 37 samples. Aggregate `ps` CPU ranged from 32.1–49.1% (median 39.7%, where 100% represents one CPU core); summed resident memory ranged from 464.6–495.8 MiB, starting at 475.8 and ending at 494.6 MiB. This includes Electron processes and transient window-query helpers, and can double-count shared memory. It is a short runtime observation, not proof of leak freedom or a battery/GPU benchmark.

Physical sleep/wake, multiple displays and permission-granted native refraction still need hardware verification. Long-gap transition expiry is covered by automated tests. This pass produces a local preview; Developer ID signing, notarization and GitHub publication remain release steps.
