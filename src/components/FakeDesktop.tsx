import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MODE_PRESETS } from '../state/settingsStore';
import { RainCanvas } from '../weather/RainCanvas';
import type { Rect, WeatherSettings } from '../weather/types';
import { FakeWindow, type FakeWindowModel } from './FakeWindow';

const STAGE_WIDTH = 1000;
const STAGE_HEIGHT = 500;
const WINDOW_GUTTER = 20;

const INITIAL_WINDOWS: FakeWindowModel[] = [
  {
    id: 'browser',
    kind: 'browser',
    title: 'Research',
    role: 'Browser · Field notes',
    x: 48,
    y: 32,
    width: 600,
    height: 370,
    z: 3,
  },
  {
    id: 'music',
    kind: 'music',
    title: 'Music',
    role: 'Now playing',
    x: 692,
    y: 38,
    width: 300,
    height: 270,
    z: 2,
  },
  {
    id: 'notes',
    kind: 'notes',
    title: 'Notes',
    role: 'A thought worth keeping',
    x: 474,
    y: 294,
    width: 420,
    height: 190,
    z: 1,
  },
];

interface FakeDesktopProps {
  settings: WeatherSettings;
  previewCleared: boolean;
  onPreviewClearedChange: (clear: boolean) => void;
}

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface StageMetrics {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

const INITIAL_STAGE_METRICS: StageMetrics = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

function freshWindows() {
  return INITIAL_WINDOWS.map((windowModel) => ({ ...windowModel }));
}

function calculateStageMetrics(width: number, height: number): StageMetrics {
  const scale = Math.max(0.01, Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
  return {
    width,
    height,
    scale,
    offsetX: (width - STAGE_WIDTH * scale) / 2,
    offsetY: (height - STAGE_HEIGHT * scale) / 2,
  };
}

function bringToFront(windows: FakeWindowModel[], id: string) {
  const ordered = [...windows].sort((first, second) => first.z - second.z);
  const target = ordered.find((windowModel) => windowModel.id === id);
  if (!target) {
    return windows;
  }

  return [...ordered.filter((windowModel) => windowModel.id !== id), target].map((windowModel, index) => ({
    ...windowModel,
    z: index + 1,
  }));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function FakeDesktop({ settings, previewCleared, onPreviewClearedChange }: FakeDesktopProps) {
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const [windows, setWindows] = useState(freshWindows);
  const [activeId, setActiveId] = useState('browser');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [stageMetrics, setStageMetrics] = useState<StageMetrics>(INITIAL_STAGE_METRICS);
  const preset = MODE_PRESETS[settings.mode];

  useLayoutEffect(() => {
    const desktop = desktopRef.current;
    if (!desktop) {
      return;
    }

    const measure = () => {
      const width = Math.max(1, desktop.clientWidth);
      const height = desktop.clientHeight;
      if (width > 0 && height > 0) {
        setStageMetrics(calculateStageMetrics(width, height));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(desktop);
    return () => observer.disconnect();
  }, []);

  const previewSettings = useMemo<WeatherSettings>(
    () => ({
      ...settings,
      renderBudget: settings.lowPowerMode ? 'conservative' : 'standard',
    }),
    [settings],
  );

  const activeWindow = useMemo(
    () => windows.find((windowModel) => windowModel.id === activeId) ?? null,
    [activeId, windows],
  );

  const activeMask = useMemo<Rect | null>(() => {
    if (settings.coverFullScreen || (settings.fullRainWhileMoving && dragState)) {
      return null;
    }

    if (!activeWindow) {
      return null;
    }

    return {
      x: stageMetrics.offsetX + activeWindow.x * stageMetrics.scale,
      y: stageMetrics.offsetY + activeWindow.y * stageMetrics.scale,
      width: activeWindow.width * stageMetrics.scale,
      height: activeWindow.height * stageMetrics.scale,
    };
  }, [activeWindow, dragState, settings.coverFullScreen, settings.fullRainWhileMoving, stageMetrics]);

  const stageStyle = useMemo<CSSProperties>(
    () => ({
      position: 'absolute',
      left: 0,
      top: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      zIndex: 10,
      transform: `translate3d(${stageMetrics.offsetX}px, ${stageMetrics.offsetY}px, 0) scale(${stageMetrics.scale})`,
      transformOrigin: 'top left',
    }),
    [stageMetrics],
  );

  const activate = (id: string) => {
    setActiveId(id);
    setWindows((current) => bringToFront(current, id));
  };

  const pointInStage = (clientX: number, clientY: number) => {
    const desktop = desktopRef.current;
    if (!desktop) {
      return null;
    }

    const desktopRect = desktop.getBoundingClientRect();
    return {
      x: (clientX - desktopRect.left - desktop.clientLeft - stageMetrics.offsetX) / stageMetrics.scale,
      y: (clientY - desktopRect.top - desktop.clientTop - stageMetrics.offsetY) / stageMetrics.scale,
    };
  };

  const startDrag = (id: string, event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = pointInStage(event.clientX, event.clientY);
    const windowModel = windows.find((item) => item.id === id);
    if (!point || !windowModel) {
      return;
    }

    activate(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      id,
      pointerId: event.pointerId,
      offsetX: point.x - windowModel.x,
      offsetY: point.y - windowModel.y,
    });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const point = pointInStage(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setWindows((current) =>
      current.map((item) => {
        if (item.id !== dragState.id) {
          return item;
        }

        const x = clamp(point.x - dragState.offsetX, WINDOW_GUTTER, STAGE_WIDTH - item.width - WINDOW_GUTTER);
        const y = clamp(point.y - dragState.offsetY, WINDOW_GUTTER, STAGE_HEIGHT - item.height - WINDOW_GUTTER);
        return { ...item, x, y };
      }),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      setDragState(null);
    }
  };

  const resetWindows = () => {
    setWindows(freshWindows());
    setActiveId('browser');
    setDragState(null);
  };

  const beginClearPreview = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onPreviewClearedChange(true);
  };

  const finishClearPreview = (event: ReactPointerEvent<HTMLButtonElement>) => {
    onPreviewClearedChange(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className={`fake-desktop ${dragState ? 'is-dragging' : ''} ${previewCleared ? 'is-preview-cleared' : ''}`}
      aria-labelledby="demo-stage-title"
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <header className="demo-stage-topbar">
        <div className="demo-brand" aria-label="Rainpane live preview">
          <span className="demo-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Rainpane</span>
        </div>
        <div className="demo-stage-status" aria-live="polite">
          <i aria-hidden="true" />
          <span>{previewCleared ? 'Clear preview' : 'Live preview'}</span>
          <strong>{preset.label}</strong>
        </div>
      </header>

      <div className="demo-stage-intro">
        <p className="demo-stage-kicker">A little weather. A little space.</p>
        <h2 id="demo-stage-title">Find your <em>quiet.</em></h2>
        <p className="demo-stage-prompt">Keep your work in the clear. Let everything else settle into rain.</p>
      </div>

      <div ref={desktopRef} className="demo-workspace">
        <div className="demo-stage" style={stageStyle}>
          <div
            className="stage-windows"
            style={{ position: 'absolute', inset: 0, zIndex: 10, isolation: 'isolate', pointerEvents: 'none' }}
            aria-label="Interactive demo windows"
          >
            {windows.map((windowModel) => (
              <FakeWindow
                key={windowModel.id}
                windowModel={windowModel}
                active={windowModel.id === activeId}
                onActivate={activate}
                onDragStart={startDrag}
              />
            ))}
          </div>
        </div>

        <RainCanvas activeMask={activeMask} focusKey={activeId} settings={previewSettings} surface="preview" paused={previewCleared} />
      </div>
      <div className="demo-workspace-caption">
        <span>Click a window to focus · Drag to rearrange</span>
        <button className="reset-windows-button" type="button" onClick={resetWindows}>Reset windows</button>
      </div>

      <div className="focus-shelf" style={{ position: 'absolute', zIndex: 70 }}>
        <div className="focus-shelf-active">
          <span>Clear focus pane</span>
          <strong>{activeWindow?.title ?? 'No active window'}</strong>
          <small>{activeWindow?.role ?? 'Choose a window to begin'}</small>
        </div>
        <button
          className="hold-to-clear-button"
          type="button"
          aria-pressed={previewCleared}
          onPointerDown={beginClearPreview}
          onPointerUp={finishClearPreview}
          onPointerCancel={finishClearPreview}
          onLostPointerCapture={() => onPreviewClearedChange(false)}
          onKeyDown={(event) => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
              event.preventDefault();
              onPreviewClearedChange(true);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              onPreviewClearedChange(false);
            }
          }}
          onBlur={() => onPreviewClearedChange(false)}
        >
          <span aria-hidden="true">{previewCleared ? 'Clear' : 'Hold'}</span>
          <strong>{previewCleared ? 'The glass is clear' : 'Press and hold to clear'}</strong>
        </button>
      </div>
    </section>
  );
}
