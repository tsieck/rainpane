# Rainpane 0.1.12-rc.2 closeout

Date: 2026-07-16
Status: local release candidate verified; permission-granted native, hardware, and notarization QA remain open

## Scope

`0.1.12-rc.2` adds an explicitly opt-in macOS Photoreal Refraction path while retaining the capture-free procedural renderer as the default. The renderer keeps the established CPU droplet identities and motion, sends bounded geometry and focus-mask data across Electron IPC, and uses a native ScreenCaptureKit and Metal helper to bend locally sampled display pixels beneath wet regions.

The helper is local-only: it does not request audio, encode video, write captured frames to disk, upload frames, or expose captured textures to the Electron renderer. Disabling the feature stops its helper processes. The clear focus pane is intended to be an all-sampling-footprint boundary, covering direct, refracted, filtered, dispersed, and reflected scene taps rather than only the visible fragment center.

Rainpane now requires macOS 13 or newer, matching the native helper's deployment target. Privileged renderer IPC is limited to managed Rainpane web contents at exact local URLs, unexpected renderer navigation and popups are denied, and the built renderer receives a nonce-based Content Security Policy.

## Verification baseline

These are the completed checks from the native-refraction implementation pass. They are evidence for the implementation baseline, not substitutes for the hands-on matrix below.

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Automated tests | Pass | `npm test -- --run`: 19 test files, 117 tests passed. |
| Production build | Pass | `npm run build` completed, including the native helper, renderer TypeScript, Vite bundle, and Electron TypeScript. |
| Local unpacked package | Pass | `npm run package` produced an arm64 app under `/tmp/rainpane-release/mac-arm64/Rainpane.app`. |
| Local distributable artifacts | Pass | `npm run dist:mac:unsigned` produced the rc.2 arm64 DMG, ZIP, and blockmaps under `/tmp/rainpane-release/`. |
| Archive integrity | Pass | `hdiutil verify` reported a valid DMG checksum and `unzip -t` reported no compressed-data errors. |
| App signature verification | Pass | `codesign --verify --deep --strict` succeeded for the local packaged app. |
| Helper signature verification | Pass | `codesign --verify --strict` succeeded for the embedded `rainpane-refraction-helper`. |
| Minimum system metadata | Pass | The app's `LSMinimumSystemVersion` and the helper's Mach-O `minos` both report `13.0`. |
| Packaged-app launch | Pass | The final ad-hoc arm64 app launched from a fresh `/tmp/rainpane-rc2-final-security-qa-profile` user-data directory and remained running. |
| Default capture-free state | Pass | The setting defaults off, automated settings tests preserve that opt-in, and fresh-profile packaged-app process inspection found no running refraction helper while it was off. |
| Browser demo smoke check | Pass | Scene switching, active focus-pane switching, overlay pause/resume, Tune and Behavior panels, and the browser-only refraction state all behaved correctly. Cozy Rain and the Research focus pane were restored, and the console contained no warnings or errors. This did not exercise native capture. |
| Renderer trust boundary | Pass | Privileged IPC requires the expected managed sender, top-level frame, exact local renderer URL, view, and display query. Unexpected navigation and popups are denied. The packaged page contains a nonce-based CSP with `default-src 'none'` and `connect-src 'none'`. |
| Multi-display fallback routing | Pass | Each overlay receives its own helper status, so a restarting or failed display cannot re-enable Canvas droplet heads over a different display whose native helper remains live. |
| Native stale-frame invalidation | Pass | Pause, hide, permission loss, failure, retry, and shutdown invalidate in-flight presentation, hide the Metal layer, and present a transparent drawable. |
| Native permission-granted visual run | Not completed | The final implementation session could not inspect the permission-gated desktop result because the Mac was locked. No visual quality claim is made here. |
| Release preflight | Blocked externally | `npm run release:preflight:mac` correctly failed because this Mac has no valid Developer ID Application identity and no configured notarization credential set. No secrets were printed. |
| Notarization | Not completed locally | No credentialed notarization submission, stapling validation, or Gatekeeper download test was possible for this candidate. |

## Permission and lifecycle QA matrix

“Pending” means the scenario has not yet been demonstrated on the packaged rc.2 app. Source inspection or automated coverage alone is not recorded as a manual pass.

| Scenario | Expected result | Status |
| --- | --- | --- |
| Fresh profile, feature off | No Screen Recording prompt and no refraction helper process. | Pass for fresh-profile packaged launch and process inspection. A quarantined first-install test remains pending. |
| Enable without permission | One understandable macOS permission flow; UI reports `permission-needed`; no frames are rendered before consent. | Pending manual test. |
| Deny permission | Capture remains off, the app stays usable with procedural droplets, and the recovery action remains available. | Pending manual test. |
| Grant permission and relaunch/retry | Status transitions through starting to live and native droplets refract the real desktop. | Pending manual test. |
| Focus Settings / Demo | Native capture pauses while the settings surface owns focus; procedural preview remains usable. | Pending manual test. |
| Blur or close Settings / Demo | Overlay and native capture resume only when the overlay is meant to be visible. | Pending manual test. |
| Toggle Photoreal Refraction off | Capture stops and helper processes exit without disturbing the procedural overlay. | Pending manual test. |
| Hide/show the overlay repeatedly | Capture follows visibility without stale helpers, runaway restarts, or a false `live` status. | Pending stress test. |
| Lock/unlock and sleep/wake | Capture pauses or recovers cleanly without requiring a full app reset. | Pending manual test. |
| Revoke permission while live | Status returns to `permission-needed`, capture stops, and procedural rendering remains available. | Pending manual test. |
| Quit while live | Helpers exit promptly and no capture process remains orphaned. | Pending manual test. |

## Display and optical-boundary QA matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Retina primary display | Native panel, droplet geometry, captured pixels, and focus mask align at device scale. | Pending permission-granted visual test. |
| Non-Retina display | Refraction remains crisp and spatially aligned at scale factor 1. | Pending hardware test. |
| Mixed-DPI two-display layout | Each helper uses the correct display scale and local geometry; no cross-display offset appears. | Pending hardware test. |
| Negative display origins / stacked displays | Droplets and clear masks remain local to the correct overlay. | Pending hardware test. |
| Hot-plug, rearrange, resolution, or scale change | Helpers and panels resynchronize without stretched or stale capture. | Pending hardware test. |
| Portrait display | Capture orientation, shader UVs, and masks remain aligned. | Pending hardware test. |
| All-displays mode | One correctly isolated helper serves each overlay with no recursive feedback. | Pending two-display test. |
| Clear-pane edge | No direct, refracted, blur/dispersion, or reflection sample pulls protected pixels into a nearby droplet. | Pending targeted visual regression test. |
| Rainpane windows visible behind overlay | Capture exclusion prevents recursive overlay feedback while normal Rainpane UI remains visually coherent. | Pending targeted visual test. |

## Packaging and release gates

- The arm64 helper is compiled during development and production builds and is copied into the macOS app resources.
- The application and native helper both declare a macOS 13.0 minimum, and runtime feature gating fails closed on older or unknown system versions.
- Local package, fresh-profile launch, and strict app/helper code-signature verification passed for the implementation baseline.
- Production entitlement profiles keep library validation enabled and contain only the JIT entitlement required by Electron.
- Local ad-hoc package commands use separate `.local` entitlement profiles with `com.apple.security.cs.disable-library-validation`. Electron's nested frameworks do not share a Developer ID Team ID under ad-hoc signing; the compatibility entitlement is therefore isolated from production rather than weakening release builds.
- `npm run dist:mac` runs `npm run release:preflight:mac` first and refuses to build a purported public release unless a Developer ID Application identity and one supported notarization credential set are present.
- A Developer ID-signed distributable, successful notarization response, stapling validation, and Gatekeeper launch from a freshly downloaded DMG/ZIP have not been recorded for rc.2.
- Windows does not expose Photoreal Refraction. Existing Windows artifact/runtime validation remains separate from this macOS-native feature.

### Local artifact record

These are ad-hoc signed QA artifacts, not public Developer ID-signed releases.

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `Rainpane-0.1.12-rc.2-arm64.dmg` | 106 MB | `fd596c42cc918fccf480f6b20e9e8aaa441e1024c3177a5a73ee011a5b22cf5d` |
| `Rainpane-0.1.12-rc.2-arm64.zip` | 103 MB | `f612d4d84c4bbfb9f929e43b17996a11ce9e6deba716d041f93c20bfeebc0971` |

## Closeout decision

The code, 117-test baseline, production build, browser regression pass, fresh-profile packaged launch, archive validation, minimum-version alignment, renderer trust-boundary checks, and local signatures support an rc.2 candidate. The candidate should not be described as fully validated or indistinguishable from reality until the permission-granted visual run, lifecycle stress cases, mixed-DPI/multi-display matrix, and credentialed notarization path are completed and recorded with fresh evidence.
