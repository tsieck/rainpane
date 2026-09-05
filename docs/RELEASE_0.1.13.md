# Rainpane 0.1.13 release

Date: 2026-09-05
Release: https://github.com/tsieck/rainpane/releases/tag/v0.1.13

## Changes

- More natural, irregular glass droplets with darker upper shoulders and bright lower crescents; slower runners and longer drained trails.
- Stationary, patchy condensation and fog, with optical detail that responds well to light and dark desktops.
- Immediate clarity for the focused window, with a gentle 520 ms return of weather to the previous window.
- Scene colors and weather strength blend over 900 ms while accumulated fog, bead positions and trails persist. Sliders and reduced motion remain immediate.
- A clearer Atmosphere studio and responsive demonstration workspace.
- Bounded rendering caches, reduced texture generation and inactive rendering suspension.
- Corrected macOS overlay placement beneath the menu bar, aligning the weather and window cutouts with the full display.

## Validation

133 automated tests pass across 24 files. The production build passes, including the native Swift helper and both TypeScript targets. Live pixel checks verify focus transparency through all five scenes, pause and reduced motion. Native move, resize and fullscreen round trips preserve the corrected overlay origin. A three-minute packaged-app sample completed without a crash or hang.

See [the visual and performance report](VISUAL_PERFORMANCE_PASS.md) for measured results and their limits. Physical sleep/wake, multiple or mixed-DPI displays, permission-granted native refraction and Windows runtime remain hardware verification items. Photoreal Refraction remains off by default and requires explicit screen-capture permission when enabled.

## Distribution

The macOS arm64 DMG and ZIP are intended for macOS 13 or newer. Publication requires Developer ID signing, Apple notarization, a valid stapled ticket and Gatekeeper acceptance. The Windows x64 ZIP is unsigned. Asset hashes and completed distribution checks are recorded after final verification.
