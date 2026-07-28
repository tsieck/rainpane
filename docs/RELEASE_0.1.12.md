# Rainpane 0.1.12 release

Date: 2026-07-28
Status: published and verified
Release: https://github.com/tsieck/rainpane/releases/tag/v0.1.12

## Release summary

Rainpane 0.1.12 promotes the `0.1.12-rc.2` wet-glass implementation to the stable release line. It keeps the capture-free procedural renderer as the default and offers macOS Photoreal Refraction as an explicit opt-in. The native path uses ScreenCaptureKit and Metal to refract locally sampled display pixels beneath wet regions while preserving the clear focus pane as an optical sampling boundary.

Rainpane remains local-only. Native frames are kept in memory, are not recorded or uploaded, and stop when the feature is disabled. The stable release requires macOS 13 or newer on Apple Silicon.

## Verified source baseline

The signed artifacts were built from release commit `51da14d0fc5b448d76175dbe985def1ff7d02b21`. Tag `v0.1.12` targets merge commit `12f4009ce8b4ba260f4da68ef78327278ff1cf78`; both commits resolve to tree `b716dee1be83c3e31c0fa4df2922e54d8a98b33a`, so the tagged source tree exactly matches the signed build tree.

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Automated tests | Pass | `npx vitest run --exclude 'Prime Bloom/**'`: 19 Rainpane test files and 117 tests passed. |
| Production build | Pass | `npm run build` completed, including the Swift/Metal helper, renderer TypeScript, Vite bundle, and Electron TypeScript. |
| Stable version metadata | Pass | The root package metadata and lockfile package entry identify version `0.1.12`. |
| Package and archive integrity | Pass | The final arm64 DMG and ZIP passed `hdiutil verify` and `unzip -tq`; the Windows x64 ZIP also passed `unzip -tq`. |
| Code-signature structure | Pass | Strict verification passed for the final Developer ID app and embedded refraction helper extracted independently from both Mac artifacts. |
| Minimum system metadata | Pass | The app and native helper both report macOS 13.0 as their minimum system version. |
| Packaged-app launch | Pass | The signed DMG app launched from a fresh profile and remained healthy through the launch check. |
| Default privacy boundary | Pass | Photoreal Refraction defaults off; the fresh-profile signed app did not run a capture helper while the feature was off. |
| Browser demo regression | Pass | Scene switching, focus-pane switching, overlay pause/resume, and settings controls passed without console warnings or errors. This did not exercise permission-gated native capture. |
| Renderer trust boundary | Pass | Privileged IPC is restricted to managed Rainpane contents, unexpected navigation and popups are denied, and the packaged renderer uses a nonce-based restrictive CSP. |

## Final signed artifact verification

The final `0.1.12` Mac artifacts were signed, notarized, stapled, assessed, and published. GitHub reports SHA-256 digests for all six uploaded assets, and every digest matches the corresponding local release file.

| Gate | Status | Evidence |
| --- | --- | --- |
| Release preflight | Pass | `npm run release:preflight:mac` selected `Developer ID Application: TRAVIS MICHAEL SIECK (23P7GUVP97)`. |
| Developer ID app signature | Pass | `codesign --verify --deep --strict --verbose=2` passed for the app from both the DMG and ZIP. |
| Embedded helper signature | Pass | `codesign --verify --strict --verbose=2` passed for `rainpane-refraction-helper` from both Mac artifacts. |
| Signing authority | Pass | Authority is `Developer ID Application: TRAVIS MICHAEL SIECK (23P7GUVP97)`; TeamIdentifier is `23P7GUVP97`; hardened runtime is enabled. |
| Notarization submission | Pass | Apple accepted request `7396ed88-e9b4-4208-b5c1-01f66f7bb6d0`. |
| Stapling | Pass | `xcrun stapler validate -v` passed for the app independently extracted from the DMG and ZIP. |
| Gatekeeper assessment | Pass | `spctl --assess --type execute --verbose=4` accepted the DMG-installed app as `Notarized Developer ID`. |
| DMG integrity | Pass | `hdiutil verify` reported the final DMG as valid. |
| ZIP integrity | Pass | `unzip -tq` reported no errors for both final ZIP archives. |
| Public artifact equivalence | Pass | GitHub's uploaded-asset digests match the locally verified and launched artifact hashes exactly. |
| GitHub publication | Pass | `v0.1.12` is public at the release URL above with six assets in uploaded state. |

## Final artifact record

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `Rainpane-0.1.12-arm64.dmg` | 111,765,072 bytes | `8bd0ccd3ec622338624c94ab6c385d3285bcc4098799dea668da8269b71e667c` |
| `Rainpane-0.1.12-arm64.dmg.blockmap` | 117,809 bytes | `d8c760cf88cb3a4eedb9c0c5d4d9cbe78b50c38fe58713afff6858b3078f3466` |
| `Rainpane-0.1.12-arm64.zip` | 107,570,630 bytes | `98803c258a3284aae9ec3203840983dd43249b2d82296e131e0b215e1cc31594` |
| `Rainpane-0.1.12-arm64.zip.blockmap` | 112,774 bytes | `5e1efdc74b3a53773a8a4a8768d26b231a1ff6a986a99ee8da88cce30134c13f` |
| `latest-mac.yml` | 504 bytes | `56f02086d2cfe39d51849fa0311810661af3e278107ad4d009c22e2e7f8b46b9` |
| `Rainpane-0.1.12-x64-win.zip` | 133,319,659 bytes | `88ec704ea4dbdc43cf7039f9e294657e91c9816d871142a0db025672ab4257d9` |

## Known validation boundaries

The stable source inherits the automated and local packaging baseline recorded for rc.2, but that evidence does not establish every hardware-dependent visual scenario. Permission-granted native visual quality, permission denial and recovery, lock/sleep lifecycle recovery, mixed-DPI multi-display layouts, display hot-plugging, portrait displays, and clear-pane edge sampling remain hardware/manual QA items unless separately recorded.

These open hardware scenarios do not change the default privacy posture: Photoreal Refraction remains opt-in, and the procedural renderer remains available if native capture is unavailable or permission is denied.

## Publication decision

Rainpane `0.1.12` was published as the repository's latest stable release after every non-hardware release gate above passed. The Windows archive is intentionally labeled unsigned; Windows runtime validation and the hardware/manual Mac scenarios listed above remain explicit follow-up work.
