# Rainpane native refraction helper

This macOS 13+ helper is the opt-in optical compositor for Photoreal Refraction. It captures one display with ScreenCaptureKit, excludes both its own process and the parent Electron application, and then explicitly allows the parent's normal-size Settings/Demo windows back into the capture. Full-display parent windows remain excluded, keeping the transparent Electron rain overlay out of its own feedback loop. Metal redraws only the pixels covered by analytic water beads; everything outside a droplet remains transparent.

It performs no encoding, persistence, network access, or audio capture. Frames stay in IOSurface/Core Video/Metal memory and are discarded as newer frames arrive.

## Launch contract

```text
rainpane-refraction-helper <CGDirectDisplayID> <parent Electron PID>
```

The equivalent named arguments are `--display-id <id> --parent-pid <pid>`.

## Standard input protocol

Input is newline-delimited JSON. Coordinates use the Electron overlay's logical-pixel viewport, with a top-left origin.

```json
{"type":"frame","width":1728,"height":1117,"droplets":[{"x":640,"y":310,"radiusX":10,"radiusY":13,"opacity":0.92,"refraction":1,"blur":0.72,"seed":0.4,"highlight":1}],"protectedRects":[{"x":90,"y":72,"width":1548,"height":920,"cornerRadius":18}]}
{"type":"visibility","visible":true}
{"type":"shutdown"}
```

For compatibility, a frame may place `width` and `height` in a `viewport` object; `protectedRegions` is an alias for `protectedRects`; and `protectedMask.rects` is also accepted. A droplet may use `radius`, `r`, `rx`/`ry`, or `width`/`height` in place of `radiusX`/`radiusY`.

The helper defensively caps frames at 4,096 droplets and 64 rounded protected regions; Electron applies a tighter 768-droplet transport limit before serialization. A droplet fragment is discarded when its visible point enters a protected region. Every clamped bilinear footprint used by the refracted center, blur and dispersion taps, and reflected sample is checked too. Unsafe taps reuse an already-safe center sample, preventing protected pixels from bleeding across a clear-window margin.

## Standard output protocol

Output is newline-delimited JSON and is reserved for lifecycle status:

```json
{"type":"status","status":"starting"}
{"type":"status","status":"permission-needed","message":"Allow Rainpane screen recording…"}
{"type":"status","status":"live"}
{"type":"status","status":"paused","message":"Waiting for droplet geometry"}
{"type":"status","status":"error","message":"…"}
```

Malformed input is reported on standard error and skipped. Closing stdin is equivalent to `shutdown`.

The helper starts logically hidden and does not initialize ScreenCaptureKit or ask for permission until it is visible **and** receives a nonempty droplet frame. After 0.8 seconds without native droplet geometry, it stops the capture stream and reports `paused`; the next nonempty frame wakes it. Hiding an already-live helper immediately hides the panel and stops capture, and becoming visible establishes a fresh filtered stream when geometry is present. Geometry messages update reusable/grow-on-demand Metal buffers, and rendering is paced exclusively by new ScreenCaptureKit frames. The renderer keeps a single latest-frame mailbox so capture callbacks cannot accumulate retained pixel buffers.

## Rendering model

Each droplet is a single instanced quad. The fragment shader reconstructs a subtly irregular spherical cap, derives its surface normal, applies an air-to-water IOR of 1.333, and samples the BGRA capture with a restrained five-tap thickness filter. Schlick Fresnel, sub-pixel chromatic dispersion, and two bounded specular lobes provide edge definition without painting an opaque decal over the desktop.
