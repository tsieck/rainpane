import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { FakeDesktop } from '../components/FakeDesktop';
import { ControlsPanel } from '../components/ControlsPanel';
import { DEFAULT_SETTINGS, MODE_PRESETS } from '../state/settingsStore';
import { RainCanvas } from '../weather/RainCanvas';
import type { Rect, WeatherSettings, WindowBounds } from '../weather/types';

interface ActiveWindowState {
  bounds: WindowBounds | null;
  mask: Rect | null;
  error?: string;
  isMoving?: boolean;
}

interface RuntimeState {
  onBatteryPower: boolean;
  idleDeepeningActive: boolean;
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
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ onBatteryPower: false, idleDeepeningActive: false });
  const preset = MODE_PRESETS[settings.mode];
  const effectiveSettings = useMemo(() => applyRuntimeSettings(settings, runtimeState), [settings, runtimeState]);
  const overlaySettings = useMemo(() => {
    const isWindowsOverlay = view === 'overlay' && window.rainpane?.platform === 'win32';
    if (!isWindowsOverlay) {
      return effectiveSettings;
    }

    return {
      ...effectiveSettings,
      lowPowerMode: true,
      grainEnabled: false,
      renderBudget: 'conservative' as const,
    };
  }, [effectiveSettings, view]);

  useEffect(() => {
    document.documentElement.dataset.view = view;
    document.body.dataset.view = view;
  }, [view]);

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
        setRuntimeState(state);
      }
    });

    const unsubscribe = window.rainpane.onRuntimeChanged((state) => {
      setRuntimeState(state);
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

  if (view === 'overlay') {
    const effectiveMask =
      settings.coverFullScreen || (settings.fullRainWhileMoving && activeWindowState.isMoving)
        ? null
        : activeWindowState.mask;

    return (
      <main className="overlay-shell" style={appStyle}>
        <RainCanvas activeMask={effectiveMask} settings={overlaySettings} />
        {settings.debugMode ? <DebugMask state={activeWindowState} /> : null}
      </main>
    );
  }

  return (
    <main className="app-shell" style={appStyle}>
      <FakeDesktop settings={effectiveSettings} />
      <ControlsPanel settings={settings} onChange={updateSettings} onReset={resetSettings} />
    </main>
  );
}
