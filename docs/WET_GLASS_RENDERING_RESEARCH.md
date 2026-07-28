# Wet-glass rendering research

Updated: 2026-07-16

## What real-time games do

The convincing part of game rain is not the droplet texture resolution. The
usual pipeline is:

1. Accumulate water mass or height on the glass.
2. Derive a surface normal from the height gradient.
3. Sample the already-rendered scene at coordinates displaced by that normal.
4. Blend transmission with an environment reflection using water Fresnel.
5. Preserve wetness so later drops prefer old paths and leave residual pearls.
6. Add concentrated caustics only for sufficiently heavy drops.

ATI's ToyShop rain system used this mass-to-normal-to-refraction pipeline and
separate static/dynamic friction. NVIDIA describes the same scene-color offset
approach as the practical real-time refraction technique used in Far Cry.

## Rainpane's default privacy boundary

Rainpane's default renderer intentionally does not capture the desktop. A transparent Electron
window receives no scene-color texture for the applications below it, so it
cannot spatially bend those pixels. More sprite resolution can sharpen an
edge, but it cannot produce literal refraction.

The privacy-safe renderer therefore approximates the optical response while
keeping the actual desktop visible through a nearly transparent center:

- analytic spherical-cap normals;
- water IOR `1.333` and Schlick Fresnel (`F0` about `0.0204`);
- one coherent synthetic room reflection instead of arbitrary white glints;
- a broken dark contact meniscus opposite the light;
- seeded atlas variants to remove repeated decal signatures;
- neutral, mass-gated caustics;
- native-DPR output with a lower-resolution wet film;
- independently scheduled detail, film, and atmosphere passes.

The CPU droplet identities, density, merging, and established shapes remain in
place. Runner and edge wakes now carve the film canvas rather than erasing an
already-clear detail canvas.

## Optional literal desktop refraction

Photoreal Refraction is implemented as an explicit macOS 13+ opt-in with Screen Recording consent:

1. Capture the display locally with ScreenCaptureKit.
2. Exclude Rainpane's own windows to avoid recursive feedback.
3. Keep the clean ScreenCaptureKit surface on the GPU in a native Metal helper.
4. Stream only droplet geometry and the protected focus mask from Electron.
5. Rasterize analytic spherical-cap normals and sample captured pixels only inside wet masks.
6. Treat the protected focus pane as an all-sampling-footprint boundary: reject
   a droplet fragment if its direct, refracted, filtered, dispersed, or
   reflected scene sample would enter the mask.
7. Keep capture disabled unless the user explicitly enables the mode.
8. Start capture only when a nonempty native-droplet frame arrives, pause after
   the geometry becomes idle, and suspend capture while the overlay is hidden,
   the screen is locked, or the system is asleep.

The helper excludes itself and the parent Rainpane process with an Apple
`SCContentFilter`, then explicitly allows ordinary Settings/Demo windows back
into the scene while keeping display-sized capture overlays excluded. This
avoids the recursive feedback that Electron's content protection cannot
reliably prevent on modern macOS without making Rainpane's normal windows look
like holes in the desktop. The main process pauses capture whenever those
interactive surfaces suppress the overlay. The shader evaluates every scene
sample in a droplet's optical footprint against the protected mask, so a drop
near the clear-pane margin cannot pull protected-window pixels outward.
The Electron manager sends bounded, validated geometry; keeps only the newest
pending frame under backpressure; restarts helpers when display scale, bounds,
origin, or rotation changes; and uses bounded recovery with a stability window
so a flapping helper cannot restart forever. The native renderer likewise keeps
only the latest captured pixel buffer. Frames remain in memory;
there is no recorder, file output, audio capture, network transport, analytics,
or cloud path. Disabling the mode terminates the helper.

## Primary references

- [Artist-Directable Real-Time Rain Rendering in City Environments](https://diglib.eg.org/server/api/core/bitstreams/7f49ec3f-1a4e-4b9f-b1bf-80c0a9f11787/content)
- [NVIDIA GPU Gems 2: Generic Refraction Simulation](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-19-generic-refraction-simulation)
- [Unreal Engine: Pixel Normal Offset Refraction](https://dev.epicgames.com/documentation/unreal-engine/refraction-using-pixel-normal-offset-in-unreal-engine)
- [Water Drops on Surfaces](https://wanghmin.github.io/publication/wang-2005-wds/Wang-2005-WDS.pdf)
- [Valve: Water Flow in Portal 2](https://advances.realtimerendering.com/s2010/Vlachos-Waterflow%28SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course%29.pdf)
- [Photorealistic Rendering of Rain Streaks](https://cave.cs.columbia.edu/old/publications/pdfs/Garg_TOG06.pdf)
- [PBRT: Dielectric Fresnel Reflection and Transmission](https://www.pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission)
- [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer/)
- [Apple ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2022/10156/)
