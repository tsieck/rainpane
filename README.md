# Rainpane

Rainpane is an ambient focus overlay for the desktop. Rain, droplets, fog, and glassy atmospheric effects appear over the parts of the desktop that are not currently focused, while the active window stays clear.

It is intentionally passive: no timers, blockers, scores, streaks, accounts, notifications, cloud sync, or productivity guilt.

Rainpane is built with Electron, React, TypeScript, Vite, and procedural HTML Canvas rendering. No external visual assets are used for the weather effects.

## Run

```bash
npm install
npm run dev
```

This starts Vite and launches Electron with:

- A transparent always-on-top click-through overlay window.
- A normal Settings / Demo window.
- A tray menu for showing/hiding Rainpane, toggling rain/fog, opening Demo Mode, and quitting.

For a production-style app build:

```bash
npm run build
npm start
```

## Package

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

Packaging output goes to `release/`.

The current package config is unsigned for local development. macOS may show normal warnings for unsigned apps. Windows builds currently package the overlay and demo architecture, but active-window clear masking is still macOS-only until a Windows active-window provider is implemented.

App icons are generated procedurally from `scripts/generate-icons.mjs` into:

- `build/icon.svg`
- `build/icon.png`
- `build/icon.icns`
- `build/icon.ico`

## Current Platform Support

- macOS: active-window clear mask is implemented.
- Windows/Linux: overlay rendering architecture is present, but active-window detection is not implemented yet.
- Multi-monitor: primary-display mode and all-displays mode are implemented.

## Phase 1 Features

- Fake desktop scene with Browser, Music, and Notes windows.
- Click a fake window to make it active.
- Drag windows by their title bars.
- Active fake window stays clear.
- Inactive windows and the desktop background receive procedural rain, fog, and droplets.
- Live controls for rain intensity, fog intensity, droplet density, wind angle, animation speed, toggles, and reduced motion.
- Presets: Cozy Rain, Storm Lock-in, Night Drive, and Greyglass.

## Phase 2 Features

- Transparent frameless overlay window covering the primary display.
- Overlay is always-on-top and click-through.
- Overlay renders procedural rain/fog/droplets across the screen.
- Settings / Demo window remains interactive and is not click-through.
- Tray menu supports show/hide, rain toggle, fog toggle, opening settings/demo, and quit.
- Global shortcuts:
  - `CommandOrControl+Alt+R`: toggle overlay visibility
  - `CommandOrControl+Alt+F`: toggle fog
  - `CommandOrControl+Alt+S`: open Settings / Demo

## Phase 3 Features

- Main-process active-window detection interface:
  - `getActiveWindowBounds(): Promise<WindowBounds | null>`
- Polls active window bounds frequently for responsive focus switching.
- Sends active-window state to the overlay renderer over IPC.
- Clears the detected active window rectangle in the real desktop overlay.
- Clips the mask to the primary display overlay.
- Debug Mask toggle shows the detected clear rectangle and app label.
- Graceful fallback: if bounds are unavailable, weather renders across the whole overlay.
- macOS detection tries a local CoreGraphics helper first, then falls back to Accessibility/System Events.

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

### ChatGPT, Codex, or other Electron apps do not clear correctly

Rainpane uses a local Swift/CoreGraphics helper before Accessibility/System Events because some Electron/Chromium apps expose inconsistent Accessibility window bounds. If Swift tooling is unavailable in dev mode, those apps may fall back to less reliable detection.

### Multi-monitor behavior is wrong

- Use `Displays > Primary display` to keep Rainpane on one display.
- Use `Displays > All displays` to create one overlay per display.
- If a display is connected/disconnected while Rainpane is running, restart the app if overlay bounds look stale.

## Phase 4 Features

- Mode-specific rain density, slant, opacity, fog tint, and inactive-area shadowing.
- Layered rain depth with faint far rain, main rain, sparse foreground streaks, tapered strokes, occasional broken streaks, and subtle gust pulses.
- Softer focus falloff around the active-window clear mask.
- More natural droplets with slow drift, wobble, sliding, and mode-specific density.
- Optional subtle Storm Lock-in lightning. It is disabled by default and disabled automatically under reduced motion.
- Optional procedural grain layer for a glass/noise texture.
- Stylized-realism droplets with micro-beads, regular beads, sparse larger pane drops, richer highlights, subtle shadow/refraction, and slow sliding trails.
- Grain and lightning are procedural canvas effects; no external assets are used.

## Phase 5 Features

- Settings are saved automatically to local JSON under Electron `userData`.
- Mode, intensities, toggles, debug state, reduced motion, grain, lightning, display mode, cover-full-screen, moving-window behavior, and fog build-up survive restarts.
- Settings / Demo includes `Reset to defaults`.
- Fog build-up is enabled by default: inactive areas start lightly hazed and slowly accumulate toward a frosted-glass look, while the active-window mask fades back toward clear.

## Phase 6 Features

- Display mode setting:
  - `Primary display`
  - `All displays`
- All-display mode creates one transparent click-through overlay per display.
- Active-window masks are mapped into each overlay's local display coordinates.
- `Cover full screen` ignores the active-window clear mask for a fully rainy cozy mode.
- `Full rain while moving` temporarily hides the clear mask while detected window bounds are changing, avoiding a laggy pane-following effect while dragging or resizing windows.

## Phase 7 Features

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
    fog.ts
    fogAccumulation.ts
    focusEffects.ts
    grain.ts
    lightning.ts
    masks.ts
    raindrops.ts
    types.ts
    weatherEngine.ts
```

## Roadmap

- Package polish: signing/notarization notes and screenshots/GIF.
- Windows active-window detection implementation.
- More multi-monitor hardening for hot-plug/display-layout changes.
- Optional future focus refinements that remain purely visual.
