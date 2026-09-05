# Rainpane 0.1.13 release

Date: 2026-09-05
Status: published and verified
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

The macOS arm64 DMG and ZIP support macOS 13 or newer and are Developer ID signed, notarized and stapled. Both independently extracted apps pass Gatekeeper assessment as Notarized Developer ID. The Windows x64 ZIP is unsigned; its PE certificate table is empty.


## Source and publication

The signed build and annotated tag `v0.1.13` both resolve to commit `2a337424bdde2e0df080d9316dff9f885163de4d`, tree `f6520af8b7ab2d189b12281920ae9fb7144dd0bd`. The branch `codex/rainpane-visual-performance` and `main` received that release commit. This verification record is a subsequent documentation update; it does not change the tagged source or signed artifacts.

GitHub's unauthenticated public API confirms `v0.1.13` is the latest stable release, published at `2026-09-05T16:35:46Z`. All nine assets are uploaded, and every GitHub-reported SHA-256 digest matches the corresponding local file.

## Completed distribution checks

| Check | Result |
| --- | --- |
| Source tests | 133 tests across 24 files pass. |
| Production build | Native Swift helper, renderer TypeScript, Vite and Electron TypeScript pass. |
| Developer ID signature | Strict deep verification passes on both distributed Mac apps; embedded helper signatures also pass. |
| Apple notarization | Accepted submission `b6231ab2-c1fc-4a0a-8edd-b5ea1c5fc389`, submitted 2026-09-05. |
| Stapled tickets | `stapler validate` passes independently for apps extracted from the DMG and ZIP. |
| Gatekeeper | Both distributed Mac apps are accepted as Notarized Developer ID. |
| Archive integrity | DMG verification and both ZIP integrity checks pass. |
| Packaged source | 20 packaged renderer/Electron files from each Mac archive match the release build; package and app version are 0.1.13, minimum macOS is 13.0. |
| Update metadata | The Mac update manifest matches the SHA-512 digests of both Mac artifacts. |
| Fresh-profile launch | The signed DMG app launches and remains running. It uses the isolated profile and does not start the opt-in refraction capture helper by default. |
| Native geometry | The launched overlay remains at `(0, 0, 5120, 2160)`, matching the display. |
| Publication | Public latest release and all nine asset hashes verified after publication. |

## New release video

`Rainpane-0.1.13-wet-glass.mp4` is a 16-second, 1920 × 1080, 30 fps H.264 recording of the signed native procedural overlay. A temporary plain gradient backdrop covered personal windows during capture. No audio was recorded. Sampled frames were visually inspected before upload. The accompanying JPEG is a frame from the video.

Recording and fresh-launch checks used isolated temporary profiles. The backdrop and test instance were closed, the test DMG unmounted, and the signed release reopened using the user's original saved settings.

## Published artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Rainpane-0.1.13-arm64.dmg` | 111,764,237 | `89eab7fd5bb37a03d64c35d00e3fd0a775f713218bf41127ddf1ae1871dd18f6` |
| `Rainpane-0.1.13-arm64.dmg.blockmap` | 118,201 | `e841773946b1e53f21323cbf98a8a3bc6450cc0296efb10d116f3e2bbdbf76c3` |
| `Rainpane-0.1.13-arm64.zip` | 107,572,886 | `28a8326f995bbe6ae72088839859d91239a8e976f6e7a76df0d4118f408bdfe0` |
| `Rainpane-0.1.13-arm64.zip.blockmap` | 112,707 | `11eb73e2380a29c86a66b053cd08b6bd3c6941c420a3ef1814c182c017c0c0e2` |
| `Rainpane-0.1.13-x64-win.zip` | 133,321,520 | `765290c6090de0cb448901f23a9c5e3a8a8e1fb32e1f2691bedbe2b0defb0c08` |
| `latest-mac.yml` | 504 | `57a1a85470d018750f9bb3db78f112f47a0560c375970e54503c15691f91500f` |
| `Rainpane-0.1.13-wet-glass.mp4` | 1,152,962 | `82be6d8007a21207f9d6a6ef1332eb8860a4c3e74b3844e9a6f636e40aab50d8` |
| `Rainpane-0.1.13-wet-glass.jpg` | 21,344 | `5b632e8864908acc249e9adeecfa2107bab1c46e7a3c536bbbb9311661283d1b` |
| `SHA256SUMS.txt` | 753 | `68ac5e9e1c302abec84fa76285f60a8676da9e5faf036cdcd067eac002eba039` |
