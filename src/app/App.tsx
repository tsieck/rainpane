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
  const preset = MODE_PRESETS[settings.mode];

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
        <RainCanvas activeMask={effectiveMask} settings={settings} />
        {settings.debugMode ? <DebugMask state={activeWindowState} /> : null}
      </main>
    );
  }

  return (
    <main className="app-shell" style={appStyle}>
      <FakeDesktop settings={settings} />
      <ControlsPanel settings={settings} onChange={updateSettings} onReset={resetSettings} />
    </main>
  );
}
