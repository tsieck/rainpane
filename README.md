# Rainpane

Make everything but the task fade into rain.

Rainpane is a quiet desktop overlay that makes your computer feel like a rainy windowpane. The app you are using stays clear. Everything else settles into rain, fog, droplets, frost, and soft atmospheric glass.

It is not a productivity timer, app blocker, habit tracker, or focus cop. It just makes the unfocused parts of your desktop visually fall away so the current task feels calmer and easier to stay with.

## See It In Motion

[Watch the new wet-glass desktop video](https://github.com/tsieck/rainpane/releases/download/v0.1.13/Rainpane-0.1.13-wet-glass.mp4) · [Focus pane demo](https://sieck.dev/media/rainpane-focus.mp4)

## Try It

Download the latest build from [GitHub Releases](https://github.com/tsieck/rainpane/releases/latest).

- macOS 13 or newer on Apple Silicon: use the `.dmg` for the cleanest install.
- macOS builds are Developer ID signed and notarized.
- Windows x64: use the `.zip`, extract it, and run `Rainpane.exe`.
- Windows builds are unsigned for now, so SmartScreen may warn on first launch.

## What It Does

- Keeps the active window visually clear, with a gentle return of weather to the previous window.
- Covers inactive windows and desktop background with procedural rain, fog, droplets, frost, grain, and occasional subtle weather detail.
- Runs as a transparent, click-through overlay so normal desktop clicks still go to the apps underneath.
- Offers calm presets like Cozy Rain, Night Drive, Greyglass, Storm Lock-in, and Winterglass, with smooth transitions that preserve the wet glass.
- Saves settings locally and works without an account, cloud sync, analytics, or subscriptions.
- Offers an optional macOS Photoreal Refraction mode that bends locally sampled desktop pixels through each drop.
- Includes a Demo Mode with fake draggable windows, a clear-before/after comparison, and focused Atmosphere, Scene, Tune, and Behavior controls.

## Privacy

Rainpane is local-only. Its default renderer does not capture your screen or read window contents. The optional Photoreal Refraction mode samples the selected display in memory only after you explicitly enable it and grant macOS Screen Recording permission. Captured frames are never recorded, saved, uploaded, analyzed, or sent to a cloud service.

For the active-window clear mask, Rainpane only needs basic window metadata: bounds, title, and process/app name when available. On macOS, that may require Accessibility permission. On Windows, it uses foreground-window metadata from local Win32 APIs.

## The Vibe

- **Cozy Rain:** soft rain, light haze, easy background motion.
- **Storm Lock-in:** heavier weather and stronger inactive-area dimming.
- **Night Drive:** darker blue-grey rain with diagonal streaks and moody contrast.
- **Greyglass:** minimal color, slow droplets, premium haze.
- **Winterglass:** sparse snow, quiet frost build-up, colder glass texture.

The default visuals are procedural canvas effects with no external weather art assets. Optional Photoreal Refraction replaces eligible droplet heads with native, local scene sampling while retaining the procedural film, trails, condensation, and edge runoff.

## Development

```bash
npm install
npm run dev
```

This starts Vite and launches Electron with:

- A transparent always-on-top click-through overlay window.
- A normal Settings / Demo window.
- A tray menu for showing/hiding Rainpane, choosing a scene, toggling rain/fog, checking for updates, opening Demo Mode, and quitting.

For a production-style app build:

```bash
npm run build
npm start
```

## Build & Release

The current stable release is `0.1.13`. It refines wet-glass optics, improves rendering performance, adds smoother focus and scene transitions, and corrects macOS overlay alignment. See [the 0.1.13 release record](docs/RELEASE_0.1.13.md) and [visual and performance validation](docs/VISUAL_PERFORMANCE_PASS.md). The [0.1.12 release record](docs/RELEASE_0.1.12.md) remains available as historical evidence.

Create an unpacked local app:

```bash
npm run package
```

Create distributable macOS artifacts:

```bash
npm run dist
# or
npm run dist:mac
```

The distributable command fails fast unless a Developer ID Application identity and one supported notarization credential set are present. This prevents a successful local build from being mistaken for a signed and notarized public release.

Prepare Windows zip artifacts:

```bash
npm run dist:win
```

This creates a Windows x64 zip. For Windows on ARM:

```bash
npm run dist:win:arm64
```

macOS and Windows package output goes to `/tmp/rainpane-release/`. The temporary output path avoids macOS File Provider metadata that can break ad-hoc code signing when the project lives under Documents or another synced folder, and keeps generated release archives out of the repo.

macOS release builds are Developer ID signed and notarized by the maintainer. Windows builds are unsigned ZIP artifacts for now.

For a local unsigned macOS build:

```bash
npm run dist:mac:unsigned
```

Local ad-hoc builds use a separate compatibility entitlement because their nested Electron frameworks do not share a Developer ID Team ID. Signed release builds keep library validation enabled and use the minimal production entitlement profile.

App icons are generated procedurally from `scripts/generate-icons.mjs` into:

- `build/icon.svg`
- `build/icon.png`
- `build/icon.icns`
- `build/icon.ico`

## Platform Support

- macOS 13+: active-window clear mask is implemented with CoreGraphics plus Accessibility fallback; optional native refraction uses ScreenCaptureKit and Metal.
- Windows: active-window clear mask is implemented with PowerShell-hosted Win32 foreground-window APIs.
- Linux: overlay rendering architecture is present, but active-window detection is not implemented yet.
- Multi-monitor: primary-display mode and all-displays mode are implemented.

## Demo Mode

- Fake desktop scene with Browser, Music, and Notes windows.
- Click a fake window to make it active.
- Drag windows by their title bars.
- Active fake window stays clear.
- Inactive windows and the desktop background receive procedural rain, fog, and droplets.
- The Atmosphere studio is organized into Scene, Tune, and Behavior so common choices stay clear while detailed controls remain available.
- Press and hold the clear comparison to see the demo desktop without weather, then release to return to the current atmosphere.
- `Reset windows` restores the demo layout after dragging or switching among the fake windows.
- Live controls cover rain intensity, fog intensity, droplet density, wind angle, animation speed, visual toggles, reduced motion, and low-power rendering.
- Scenes: Cozy Rain, Storm Lock-in, Night Drive, Greyglass, and Winterglass.

## Desktop Overlay

- Transparent frameless overlay window covering the primary display.
- Overlay is always-on-top and click-through.
- Overlay renders procedural rain/fog/droplets across the screen.
- Settings / Demo window remains interactive and is not click-through.
- Tray menu supports show/hide, radio selection among the five scenes, rain and fog toggles, opening settings/demo, and quit.
- Manual update check opens the latest matching GitHub release download for the current platform.
- Global shortcuts:
  - `CommandOrControl+Alt+R`: toggle overlay visibility
  - `CommandOrControl+Alt+F`: toggle fog
  - `CommandOrControl+Alt+S`: open Settings / Demo

## Active Window Masking

- Main-process active-window detection interface:
  - `getActiveWindowBounds(): Promise<WindowBounds | null>`
- Polls active window bounds frequently for responsive focus switching.
- Sends active-window state to the overlay renderer over IPC.
- Clears the detected active window rectangle in the real desktop overlay.
- Clips the mask to the primary display overlay.
- Debug Mask toggle shows the detected clear rectangle and app label.
- Graceful fallback: if bounds are unavailable, weather renders across the whole overlay.
- macOS detection tries a local CoreGraphics helper first, then falls back to Accessibility/System Events.
- Windows detection uses PowerShell to call `GetForegroundWindow`, `GetWindowRect`, and process metadata from Win32 APIs.

### macOS Permission Note

macOS may require Accessibility permission before System Events can read frontmost window bounds. Rainpane requests this on launch and also exposes tray actions:

- `Request Accessibility Permission`
- `Open macOS Accessibility Settings`

If Rainpane is not listed, use `+` in System Settings > Privacy & Security > Accessibility and add the app that is running it. In dev mode this is usually Electron from:

```text
node_modules/electron/dist/Electron.app
```

You may need to quit and restart `npm run dev` after enabling Accessibility permission. In its default mode Rainpane only requests window bounds/title/process metadata for the clear mask.

Photoreal Refraction has a separate, explicit permission boundary. When you enable it under **Behavior → Glass fidelity**, macOS may ask for Screen Recording access once a live droplet needs desktop pixels. Rainpane's native ScreenCaptureKit renderer excludes its capture overlays from the sampled display to prevent recursive feedback, keeps frames in memory, and uses them only to refract pixels beneath live droplets. The protected focus pane is also treated as a complete optical sampling boundary: refraction, blur, dispersion, and reflection taps are rejected rather than borrowing pixels from inside it. Capture pauses when there are no native droplets to sample, while the Mac is locked or asleep, or while Rainpane's interactive surfaces suppress the desktop overlay. Turning the setting off stops the capture helper. You may need to restart the app after granting Screen Recording permission.

The dev build compiles a tiny Swift CoreGraphics helper into the system temp directory to improve bounds detection for Electron/Chromium-style apps such as ChatGPT or Codex. If Swift tooling is unavailable, Rainpane falls back to the Accessibility path.

## Troubleshooting

### Overlay is not visible

- Check the tray menu and choose `Show Rainpane`.
- Increase rain/fog/droplet intensity in Settings / Demo.
- Turn off `Cover full screen` only if you expect the active window to remain clear.

### Overlay blocks clicks

The overlay window uses Electron `setIgnoreMouseEvents(true, { forward: true })`. If clicks seem blocked, quit Rainpane from the tray and restart it with `npm run dev`.

### Active window does not clear on macOS

- Grant Accessibility permission to the running app.
- In dev mode, manually add:

```text
node_modules/electron/dist/Electron.app
```

- Quit and restart `npm run dev` after granting permission.
- If active-window detection fails, Rainpane falls back to whole-screen rain.

### Active window does not clear on Windows

- Use the Windows ZIP build from `npm run dist:win`.
- Run `Rainpane.exe` from the extracted folder.
- If PowerShell is blocked by policy or security tooling, active-window detection may fail and Rainpane will fall back to whole-screen rain.
- Windows packages are unsigned in the current alpha, so SmartScreen may warn before launch.

### ChatGPT, Codex, or other Electron apps do not clear correctly

Rainpane uses a local Swift/CoreGraphics helper before Accessibility/System Events because some Electron/Chromium apps expose inconsistent Accessibility window bounds. If Swift tooling is unavailable in dev mode, those apps may fall back to less reliable detection.

### Multi-monitor behavior is wrong

- Use `Displays > Primary display` to keep Rainpane on one display.
- Use `Displays > All displays` to create one overlay per display.
- Rainpane updates its overlay windows when displays are connected, disconnected, rearranged, or change resolution.
- If the operating system still reports stale bounds, toggle the display mode or restart Rainpane.

### Checking for updates

- Use the tray menu or app menu item `Check for Updates...`.
- Rainpane checks GitHub Releases and compares the latest release tag with the installed app version.
- If an update is available, Rainpane opens the matching download for your platform.
- Updates are manual in the current alpha: macOS users replace the app from the downloaded DMG/ZIP, and Windows users extract the new ZIP and run the new `Rainpane.exe`.

## Weather Engine

- Mode-specific rain density, slant, opacity, fog tint, and inactive-area shadowing.
- Winterglass atmosphere with quiet blue haze, stronger edge frost, sparse sleet, and slow procedural snow.
- Layered rain depth with faint far rain, main rain, sparse foreground streaks, tapered strokes, occasional broken streaks, and subtle gust pulses.
- Softer focus falloff around the active-window clear mask.
- A cached, irregular condensation film layers faint mist, medium beads, clear islands, and a few crisp lens drops without simulating thousands of moving objects every frame.
- Stateful droplets pin, creep, merge by conserved surface area, gather into larger runners, and cut persistent clear wakes through the wet film.
- Optional subtle Storm Lock-in lightning. It is disabled by default and disabled automatically under reduced motion.
- Optional procedural grain layer for a glass/noise texture.
- A separate sharper glass surface renders dark menisci, refractive highlights, warm room glints, long gravity channels, and larger lens-like pane drops above the softer atmosphere.
- The focus pane uses source-consistent display coordinates, a tiny particle-safe gutter, and one shared rounded clip across atmosphere, beads, and trails.
- Grain and lightning are procedural canvas effects; no external assets are used.
- Low Power Mode is enabled by default to cap canvas frame rate, reduce Retina pixel work, and lower rain/droplet/fog simulation density for laptop-friendly background use.

## Settings

- A prominent status control shows whether the overlay preference is on or off and lets you change it without reaching for the tray.
- The Atmosphere, Scene, Tune, and Behavior sections separate the everyday mood controls from detailed rendering and focus behavior.
- Settings are saved automatically to local JSON under Electron `userData`.
- Mode, intensities, toggles, debug state, reduced motion, low-power mode, grain, lightning, display mode, cover-full-screen, moving-window behavior, and fog build-up survive restarts.
- Settings / Demo includes `Reset to defaults`.
- Fog build-up is enabled by default: inactive areas start lightly hazed and slowly accumulate toward a frosted-glass look, while the active-window mask fades back toward clear.

## Multi-Monitor

- Display mode setting:
  - `Primary display`
  - `All displays`
- All-display mode creates one transparent click-through overlay per display.
- Active-window masks are mapped into each overlay's local display coordinates.
- Display hot-plug and layout changes resynchronize the overlay windows and remap the active-window mask without requiring a routine restart.
- `Cover full screen` ignores the active-window clear mask for a fully rainy cozy mode.
- `Full rain while moving` temporarily hides the clear mask while detected window bounds are changing, avoiding a laggy pane-following effect while dragging or resizing windows.

## Focus-Friendly Details

- Lock-in dimming adds subtle inactive-area darkening, with stronger treatment in Storm Lock-in and Night Drive.
- These features are purely visual. Rainpane still does not block apps, score focus, run timers, or send notifications.

## Non-Goals

- App blocking
- Timers, streaks, points, or productivity scoring
- Background screen recording, cloud upload, or capture without explicit opt-in
- Accounts or sync
- Realistic fluid simulation
- Audio ambience in the current version

## Structure

```text
electron/
  main.ts
  activeWindow.ts
  permissions.ts
  preload.ts
  settings.ts
  settingsPersistence.ts
  shortcuts.ts
  tray.ts
  windows.ts
scripts/
  generate-icons.mjs
src/
  app/
    App.tsx
  components/
    ControlsPanel.tsx
    FakeDesktop.tsx
    FakeWindow.tsx
    ModeSelector.tsx
  state/
    settingsStore.ts
  styles/
    globals.css
  weather/
    RainCanvas.tsx
    droplets.ts
    edgeRunoff.ts
    fog.ts
    fogAccumulation.ts
    frostedGlass.ts
    focusEffects.ts
    grain.ts
    lightning.ts
    masks.ts
    paneVignette.ts
    raindrops.ts
    snow.ts
    splashes.ts
    types.ts
    wetGlassCondensation.ts
    wetGlassEngine.ts
    wetGlassTrails.ts
    weatherEngine.ts
```

## Roadmap

- Package polish: signing/notarization notes and screenshots/GIF.
- Windows release validation on a real Windows machine.
- More multi-monitor validation across mixed-DPI layouts and separate physical displays.
- Optional future focus refinements that remain purely visual.

## License

Rainpane is released under the [MIT License](LICENSE).
