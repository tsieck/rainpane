# Rainpane 0.1.12 release

Date: 2026-07-28
Status: stable release source prepared; signed artifact publication evidence pending

## Release summary

Rainpane 0.1.12 promotes the `0.1.12-rc.2` wet-glass implementation to the stable release line. It keeps the capture-free procedural renderer as the default and offers macOS Photoreal Refraction as an explicit opt-in. The native path uses ScreenCaptureKit and Metal to refract locally sampled display pixels beneath wet regions while preserving the clear focus pane as an optical sampling boundary.

Rainpane remains local-only. Native frames are kept in memory, are not recorded or uploaded, and stop when the feature is disabled. The stable release requires macOS 13 or newer on Apple Silicon.

## Verified source baseline

These checks were completed for the implementation promoted from `0.1.12-rc.2`. Final public-artifact checks are tracked separately below and must be completed against the exact uploaded files.

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Automated tests | Pass | `npm test -- --run`: 19 test files and 117 tests passed for the promoted implementation baseline. |
| Production build | Pass | `npm run build` completed for the promoted implementation baseline, including the native helper, renderer TypeScript, Vite bundle, and Electron TypeScript. |
| Stable version metadata | Pass | The root package metadata and lockfile package entry identify version `0.1.12`. |
| Local package and archive integrity | Pass | The rc.2 baseline produced an arm64 app, DMG, ZIP, and blockmaps; `hdiutil verify` and `unzip -t` passed. These ad-hoc artifacts are not the stable public artifacts. |
| Local code-signature structure | Pass | Strict verification passed for the ad-hoc packaged app and embedded refraction helper. This does not substitute for Developer ID verification of the stable artifacts. |
| Minimum system metadata | Pass | The app and native helper both report macOS 13.0 as their minimum system version. |
| Packaged-app launch | Pass | The rc.2 baseline launched from a fresh profile and remained running with native capture disabled by default. |
| Default privacy boundary | Pass | Photoreal Refraction defaults off; the fresh-profile packaged baseline did not run a capture helper while the feature was off. |
| Browser demo regression | Pass | Scene switching, focus-pane switching, overlay pause/resume, and settings controls passed without console warnings or errors. This did not exercise permission-gated native capture. |
| Renderer trust boundary | Pass | Privileged IPC is restricted to managed Rainpane contents, unexpected navigation and popups are denied, and the packaged renderer uses a nonce-based restrictive CSP. |

## Final signed artifact verification

The following entries intentionally remain pending until the final `0.1.12` artifacts have been built, signed, notarized, stapled, and tested. Replace each placeholder with command output or an exact result before publishing this document as completed release evidence.

| Gate | Status | Required evidence |
| --- | --- | --- |
| Release preflight | Pending | Record the successful `npm run release:preflight:mac` result and the selected Developer ID identity without including credentials. |
| Developer ID app signature | Pending | Record `codesign --verify --deep --strict --verbose=2` success for the final packaged `Rainpane.app`. |
| Embedded helper signature | Pending | Record `codesign --verify --strict --verbose=2` success for the final `rainpane-refraction-helper`. |
| Signing authority | Pending | Record the `codesign -dv --verbose=4` Authority, TeamIdentifier, and runtime flags for the final app. |
| Notarization submission | Pending | Record the accepted notarization request ID and completion status. Do not record Apple credentials. |
| Stapling | Pending | Record `xcrun stapler validate` success for the final app and DMG where applicable. |
| Gatekeeper assessment | Pending | Record `spctl --assess --type execute --verbose=4` success for an app installed from the final DMG. |
| DMG integrity | Pending | Record `hdiutil verify` success for the final DMG. |
| ZIP integrity | Pending | Record `unzip -t` success for the final ZIP. |
| Fresh-download launch | Pending | Download the published artifact into a clean location, install it, launch it, and record the observed version and first-run behavior. |
| GitHub publication | Pending | Record the immutable release URL and confirm the uploaded filenames match the hashes below. |

## Final artifact record

Do not copy hashes from rc.2. Compute these values from the exact stable files uploaded to GitHub.

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `Rainpane-0.1.12-arm64.dmg` | Pending | Pending |
| `Rainpane-0.1.12-arm64.zip` | Pending | Pending |

## Known validation boundaries

The stable source inherits the automated and local packaging baseline recorded for rc.2, but that evidence does not establish every hardware-dependent visual scenario. Permission-granted native visual quality, permission denial and recovery, lock/sleep lifecycle recovery, mixed-DPI multi-display layouts, display hot-plugging, portrait displays, and clear-pane edge sampling remain hardware/manual QA items unless separately recorded.

These open hardware scenarios do not change the default privacy posture: Photoreal Refraction remains opt-in, and the procedural renderer remains available if native capture is unavailable or permission is denied.

## Publication decision

Publish `0.1.12` only after every final signed-artifact gate above has a concrete result and the DMG/ZIP hashes have been computed from the exact uploaded files. Until then, this document describes a prepared stable source tree, not a completed notarized public release.
