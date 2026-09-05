import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { FakeDesktop } from '../components/FakeDesktop';
import { ControlsPanel } from '../components/ControlsPanel';
import { DEFAULT_SETTINGS, MODE_PRESETS } from '../state/settingsStore';
import { RainCanvas } from '../weather/RainCanvas';
import type { PhotorealRefractionStatus, Rect, WeatherSettings, WindowBounds } from '../weather/types';

interface ActiveWindowState {
  bounds: WindowBounds | null;
  mask: Rect | null;
  error?: string;
  isMoving?: boolean;
}

interface RuntimeState {
  onBatteryPower: boolean;
  idleDeepeningActive: boolean;
  overlayEnabled: boolean;
  prefersReducedTransparency: boolean;
  shouldUseHighContrastColors: boolean;
  shouldDifferentiateWithoutColor: boolean;
  photorealRefractionStatus: PhotorealRefractionStatus;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function applyRuntimeSettings(settings: WeatherSettings, runtime: RuntimeState): WeatherSettings {
  const lowPowerMode = settings.lowPowerMode || (settings.autoLowPower && runtime.onBatteryPower);
  if (!settings.idleDeepeningEnabled || !runtime.idleDeepeningActive) {
    return { ...settings, lowPowerMode };
  }

  return {
    ...settings,
    lowPowerMode,
    fogIntensity: clamp01(settings.fogIntensity + 0.14),
    dropletDensity: clamp01(settings.dropletDensity + 0.08),
    rainIntensity: clamp01(settings.rainIntensity + 0.04),
  };
}

function DebugMask({ state }: { state: ActiveWindowState }) {
  if (!state.mask) {
    return (
      <div className="debug-status">
        <strong>Debug mask</strong>
        <span>{state.error ? 'Detection unavailable' : 'No active window bounds'}</span>
      </div>
    );
  }

  const label = state.bounds?.appName ?? state.bounds?.processName ?? 'Active window';

  return (
    <>
      <div
        className="debug-mask"
        style={{
          left: state.mask.x,
          top: state.mask.y,
          width: state.mask.width,
          height: state.mask.height,
        }}
      >
        <span>{label}</span>
      </div>
      {state.error ? (
        <div className="debug-status">
          <strong>Debug mask</strong>
          <span>Last error: {state.error}</span>
        </div>
      ) : null}
    </>
  );
}

export function App() {
  const view = window.rainpane?.view ?? (new URLSearchParams(window.location.search).get('view') === 'overlay' ? 'overlay' : 'demo');
  const [settings, setSettings] = useState<WeatherSettings>(DEFAULT_SETTINGS);
  const [activeWindowState, setActiveWindowState] = useState<ActiveWindowState>({ bounds: null, mask: null });
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({
    onBatteryPower: false,
    idleDeepeningActive: false,
    overlayEnabled: true,
    prefersReducedTransparency: false,
    shouldUseHighContrastColors: false,
    shouldDifferentiateWithoutColor: false,
    photorealRefractionStatus: 'off',
  });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [previewCleared, setPreviewCleared] = useState(false);
  const preset = MODE_PRESETS[settings.mode];
  const effectiveSettings = useMemo(
    () => applyRuntimeSettings({ ...settings, reducedMotion: settings.reducedMotion || prefersReducedMotion }, runtimeState),
    [prefersReducedMotion, runtimeState, settings],
  );
  const overlaySettings = useMemo(() => {
    if (view !== 'overlay') {
      return effectiveSettings;
    }

    const conservativeOverlay = effectiveSettings.lowPowerMode || window.rainpane?.platform === 'win32';

    return {
      ...effectiveSettings,
      lowPowerMode: conservativeOverlay ? true : effectiveSettings.lowPowerMode,
      grainEnabled: conservativeOverlay ? false : effectiveSettings.grainEnabled,
      renderBudget: conservativeOverlay ? ('conservative' as const) : effectiveSettings.renderBudget,
    };
  }, [effectiveSettings, view]);

  useEffect(() => {
    document.documentElement.dataset.view = view;
    document.body.dataset.view = view;
  }, [view]);

  useEffect(() => {
    document.documentElement.dataset.mode = settings.mode;
    document.body.dataset.mode = settings.mode;
  }, [settings.mode]);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => setPrefersReducedMotion(motionQuery.matches);
    syncMotionPreference();
    motionQuery.addEventListener('change', syncMotionPreference);
    return () => motionQuery.removeEventListener('change', syncMotionPreference);
  }, []);

  useEffect(() => {
    const reducedMotion = settings.reducedMotion || prefersReducedMotion;
    const datasets = [document.documentElement.dataset, document.body.dataset];

    for (const dataset of datasets) {
      dataset.reducedMotion = String(reducedMotion);
      dataset.reducedTransparency = String(runtimeState.prefersReducedTransparency);
      dataset.highContrast = String(runtimeState.shouldUseHighContrastColors);
      dataset.differentiateWithoutColor = String(runtimeState.shouldDifferentiateWithoutColor);
    }
  }, [prefersReducedMotion, runtimeState, settings.reducedMotion]);

  useEffect(() => {
    const syncWindowFocus = () => {
      const focused = document.hasFocus();
      document.documentElement.dataset.windowFocused = String(focused);
      document.body.dataset.windowFocused = String(focused);
    };

    syncWindowFocus();
    window.addEventListener('focus', syncWindowFocus);
    window.addEventListener('blur', syncWindowFocus);
    return () => {
      window.removeEventListener('focus', syncWindowFocus);
      window.removeEventListener('blur', syncWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!window.rainpane) {
      return;
    }

    let active = true;
    window.rainpane.getSettings().then((nextSettings) => {
      if (active) {
        setSettings(nextSettings);
      }
    });

    const unsubscribe = window.rainpane.onSettingsChanged((nextSettings) => {
      setSettings(nextSettings);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!window.rainpane) {
      let lastInput = performance.now();
      const markActive = () => {
        lastInput = performance.now();
        setRuntimeState((state) => (state.idleDeepeningActive ? { ...state, idleDeepeningActive: false } : state));
      };
      const interval = window.setInterval(() => {
        const idleDeepeningActive = performance.now() - lastInput > 90000;
        setRuntimeState((state) =>
          state.idleDeepeningActive === idleDeepeningActive ? state : { ...state, idleDeepeningActive },
        );
      }, 5000);

      window.addEventListener('mousemove', markActive);
      window.addEventListener('keydown', markActive);
      window.addEventListener('pointerdown', markActive);
      return () => {
        window.clearInterval(interval);
        window.removeEventListener('mousemove', markActive);
        window.removeEventListener('keydown', markActive);
        window.removeEventListener('pointerdown', markActive);
      };
    }

    let active = true;
    window.rainpane.getRuntimeState().then((state) => {
      if (active) {
        setRuntimeState({ ...state, overlayEnabled: state.overlayEnabled ?? true });
      }
    });

    const unsubscribe = window.rainpane.onRuntimeChanged((state) => {
      setRuntimeState({ ...state, overlayEnabled: state.overlayEnabled ?? true });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!window.rainpane || view !== 'overlay') {
      return;
    }

    let active = true;
    window.rainpane.getActiveWindow().then((state) => {
      if (active) {
        setActiveWindowState(state);
      }
    });

    const unsubscribe = window.rainpane.onActiveWindowChanged((state) => {
      setActiveWindowState(state);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [view]);

  const appStyle = useMemo(
    () =>
      ({
        '--desktop-a': preset.palette.desktopA,
        '--desktop-b': preset.palette.desktopB,
        '--panel': preset.palette.panel,
        '--accent': preset.palette.accent,
        '--scene-fog': preset.palette.fog,
        '--scene-rain': preset.palette.rain,
        '--scene-shadow': preset.palette.shadow,
        '--glass-tint': preset.palette.tint,
        '--glass-highlight': preset.palette.fog,
        '--glass-shadow': preset.palette.shadow,
      }) as CSSProperties,
    [preset],
  );

  const updateSettings = (nextSettings: WeatherSettings) => {
    setSettings(nextSettings);
    window.rainpane?.updateSettings(nextSettings);
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    if (window.rainpane) {
      window.rainpane.resetSettings();
    } else {
      updateSettings(DEFAULT_SETTINGS);
    }
  };

  const setOverlayEnabled = (overlayEnabled: boolean) => {
    setRuntimeState((state) => ({ ...state, overlayEnabled }));
    window.rainpane?.setOverlayVisible(overlayEnabled);
  };

  if (view === 'overlay') {
    const effectiveMask =
      settings.coverFullScreen || (settings.fullRainWhileMoving && activeWindowState.isMoving)
        ? null
        : activeWindowState.mask;

    return (
      <main className="overlay-shell" style={appStyle}>
        <RainCanvas
          activeMask={effectiveMask}
          focusKey={activeWindowState.bounds
            ? activeWindowState.bounds.windowId ?? `${activeWindowState.bounds.processName ?? ''}:${activeWindowState.bounds.title ?? ''}`
            : null}
          settings={overlaySettings}
          surface="overlay"
          paused={!runtimeState.overlayEnabled}
          photorealRefractionStatus={runtimeState.photorealRefractionStatus}
        />
        {settings.debugMode ? <DebugMask state={activeWindowState} /> : null}
      </main>
    );
  }

  return (
    <main className="app-shell" style={appStyle} data-mode={settings.mode}>
      <FakeDesktop
        settings={effectiveSettings}
        previewCleared={previewCleared || !runtimeState.overlayEnabled}
        onPreviewClearedChange={setPreviewCleared}
      />
      <ControlsPanel
        settings={settings}
        onChange={updateSettings}
        onReset={resetSettings}
        overlayEnabled={runtimeState.overlayEnabled}
        onOverlayEnabledChange={setOverlayEnabled}
        onBatteryPower={runtimeState.onBatteryPower}
        photorealRefractionStatus={runtimeState.photorealRefractionStatus}
        photorealRefractionSupported={window.rainpane?.photorealRefractionSupported ?? false}
        onOpenScreenRecordingSettings={() => window.rainpane?.openScreenRecordingSettings()}
      />
    </main>
  );
}
