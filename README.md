# Rainpane

Make everything but the task fade into rain.

Rainpane is a quiet desktop overlay that makes your computer feel like a rainy windowpane. The app you are using stays clear. Everything else settles into rain, fog, droplets, frost, and soft atmospheric glass.

It is not a productivity timer, app blocker, habit tracker, or focus cop. It just makes the unfocused parts of your desktop visually fall away so the current task feels calmer and easier to stay with.

## See It In Motion

[Watch the focus pane demo](https://sieck.dev/media/rainpane-focus.mp4)

## Try It

Download the latest build from [GitHub Releases](https://github.com/tsieck/rainpane/releases/latest).

- macOS Apple Silicon: use the `.dmg` for the cleanest install.
- macOS builds are Developer ID signed and notarized.
- Windows x64: use the `.zip`, extract it, and run `Rainpane.exe`.
- Windows builds are unsigned for now, so SmartScreen may warn on first launch.

## What It Does

- Keeps the active window visually clear.
- Covers inactive windows and desktop background with procedural rain, fog, droplets, frost, grain, and occasional subtle weather detail.
- Runs as a transparent, click-through overlay so normal desktop clicks still go to the apps underneath.
- Offers calm presets like Cozy Rain, Night Drive, Greyglass, Storm Lock-in, and Winterglass.
- Saves settings locally and works without an account, cloud sync, analytics, or subscriptions.
- Includes a Demo Mode with fake draggable windows so you can tune the look without relying on native window detection.

## Privacy

Rainpane is local-only. It does not capture your screen, read window contents, upload data, or use cloud services.

For the active-window clear mask, Rainpane only needs basic window metadata: bounds, title, and process/app name when available. On macOS, that may require Accessibility permission. On Windows, it uses foreground-window metadata from local Win32 APIs.

## The Vibe

- **Cozy Rain:** soft rain, light haze, easy background motion.
- **Storm Lock-in:** heavier weather and stronger inactive-area dimming.
- **Night Drive:** darker blue-grey rain with diagonal streaks and moody contrast.
- **Greyglass:** minimal color, slow droplets, premium haze.
- **Winterglass:** sparse snow, quiet frost build-up, colder glass texture.

All visuals are procedural canvas effects. No external weather art assets are used.

## Development

```bash
npm install
npm run dev
```

This starts Vite and launches Electron with:

- A transparent always-on-top click-through overlay window.
- A normal Settings / Demo window.
- A tray menu for showing/hiding Rainpane, toggling rain/fog, checking for updates, opening Demo Mode, and quitting.

For a production-style app build:

```bash
npm run build
npm start
```

## Build & Release

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

App icons are generated procedurally from `scripts/generate-icons.mjs` into:

- `build/icon.svg`
- `build/icon.png`
- `build/icon.icns`
- `build/icon.ico`

## Platform Support

- macOS: active-window clear mask is implemented with CoreGraphics plus Accessibility fallback.
- Windows: active-window clear mask is implemented with PowerShell-hosted Win32 foreground-window APIs.
- Linux: overlay rendering architecture is present, but active-window detection is not implemented yet.
- Multi-monitor: primary-display mode and all-displays mode are implemented.

## Demo Mode

- Fake desktop scene with Browser, Music, and Notes windows.
- Click a fake window to make it active.
- Drag windows by their title bars.
- Active fake window stays clear.
- Inactive windows and the desktop background receive procedural rain, fog, and droplets.
- Live controls for rain intensity, fog intensity, droplet density, wind angle, animation speed, toggles, reduced motion, and low-power rendering.
- Presets: Cozy Rain, Storm Lock-in, Night Drive, Greyglass, and Winterglass.

## Desktop Overlay

- Transparent frameless overlay window covering the primary display.
- Overlay is always-on-top and click-through.
- Overlay renders procedural rain/fog/droplets across the screen.
- Settings / Demo window remains interactive and is not click-through.
- Tray menu supports show/hide, rain toggle, fog toggle, opening settings/demo, and quit.
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

You may need to quit and restart `npm run dev` after enabling the permission. Rainpane does not capture screen contents and does not upload anything; it only requests window bounds/title/process metadata for the clear mask.

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
- If a display is connected/disconnected while Rainpane is running, restart the app if overlay bounds look stale.

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
- More natural droplets with slow drift, wobble, sliding, and mode-specific density.
- Optional subtle Storm Lock-in lightning. It is disabled by default and disabled automatically under reduced motion.
- Optional procedural grain layer for a glass/noise texture.
- Stylized-realism droplets with micro-beads, regular beads, sparse larger pane drops, richer highlights, subtle shadow/refraction, and slow sliding trails.
- Grain and lightning are procedural canvas effects; no external assets are used.
- Low Power Mode is enabled by default to cap canvas frame rate, reduce Retina pixel work, and lower rain/droplet/fog simulation density for laptop-friendly background use.

## Settings

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
- `Cover full screen` ignores the active-window clear mask for a fully rainy cozy mode.
- `Full rain while moving` temporarily hides the clear mask while detected window bounds are changing, avoiding a laggy pane-following effect while dragging or resizing windows.

## Focus-Friendly Details

- Lock-in dimming adds subtle inactive-area darkening, with stronger treatment in Storm Lock-in and Night Drive.
- These features are purely visual. Rainpane still does not block apps, score focus, run timers, or send notifications.

## Non-Goals

- App blocking
- Timers, streaks, points, or productivity scoring
- Screen capture or cloud upload
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
    weatherEngine.ts
```

## Roadmap

- Package polish: signing/notarization notes and screenshots/GIF.
- Windows release validation on a real Windows machine.
- More multi-monitor hardening for hot-plug/display-layout changes.
- Optional future focus refinements that remain purely visual.
