import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { RainCanvas } from '../weather/RainCanvas';
import type { Rect, WeatherSettings } from '../weather/types';
import { FakeWindow, type FakeWindowModel } from './FakeWindow';

const INITIAL_WINDOWS: FakeWindowModel[] = [
  {
    id: 'browser',
    title: 'Browser',
    role: 'Research workspace',
    x: 72,
    y: 72,
    width: 470,
    height: 330,
    z: 3,
    content: ['Design notes for ambient focus', 'Transparent overlay architecture', 'Canvas weather rendering prototype'],
  },
  {
    id: 'music',
    title: 'Music',
    role: 'Now playing',
    x: 575,
    y: 110,
    width: 300,
    height: 250,
    z: 2,
    content: ['Low Clouds - Side A', 'Rain Room Mix', 'Volume 34%'],
  },
  {
    id: 'notes',
    title: 'Notes',
    role: 'Scratchpad',
    x: 245,
    y: 425,
    width: 410,
    height: 240,
    z: 1,
    content: ['Keep the active task clear.', 'Let the rest fade into rain.', 'No timers. No blocking.'],
  },
];

interface FakeDesktopProps {
  settings: WeatherSettings;
}

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

export function FakeDesktop({ settings }: FakeDesktopProps) {
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const [windows, setWindows] = useState(INITIAL_WINDOWS);
  const [activeId, setActiveId] = useState('browser');
  const [dragState, setDragState] = useState<DragState | null>(null);

  const activeMask = useMemo<Rect | null>(() => {
    const activeWindow = windows.find((windowModel) => windowModel.id === activeId);
    if (!activeWindow) {
      return null;
    }
    return {
      x: activeWindow.x,
      y: activeWindow.y,
      width: activeWindow.width,
      height: activeWindow.height,
    };
  }, [activeId, windows]);

  const activate = (id: string) => {
    setActiveId(id);
    setWindows((current) => {
      const maxZ = Math.max(...current.map((item) => item.z));
      return current.map((item) => (item.id === id ? { ...item, z: maxZ + 1 } : item));
    });
  };

  const startDrag = (id: string, event: ReactPointerEvent<HTMLElement>) => {
    const desktop = desktopRef.current;
    if (!desktop) {
      return;
    }

    activate(id);
    const windowModel = windows.find((item) => item.id === id);
    const desktopRect = desktop.getBoundingClientRect();
    if (!windowModel) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - desktopRect.left - windowModel.x,
      offsetY: event.clientY - desktopRect.top - windowModel.y,
    });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || !desktopRef.current) {
      return;
    }

    const desktopRect = desktopRef.current.getBoundingClientRect();
    setWindows((current) =>
      current.map((item) => {
        if (item.id !== dragState.id) {
          return item;
        }

        const x = Math.min(
          Math.max(16, event.clientX - desktopRect.left - dragState.offsetX),
          desktopRect.width - item.width - 16,
        );
        const y = Math.min(
          Math.max(16, event.clientY - desktopRect.top - dragState.offsetY),
          desktopRect.height - item.height - 16,
        );

        return { ...item, x, y };
      }),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      setDragState(null);
    }
  };

  return (
    <section
      ref={desktopRef}
      className="fake-desktop"
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="desktop-grid" aria-hidden="true" />
      <div className="dock" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      {windows.map((windowModel) => (
        <FakeWindow
          key={windowModel.id}
          windowModel={windowModel}
          active={windowModel.id === activeId}
          onActivate={activate}
          onDragStart={startDrag}
        />
      ))}
      <RainCanvas activeMask={activeMask} settings={settings} />
    </section>
  );
}
