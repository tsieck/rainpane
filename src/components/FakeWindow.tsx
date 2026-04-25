import type { PointerEvent as ReactPointerEvent } from 'react';

export interface FakeWindowModel {
  id: string;
  title: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  content: string[];
}

interface FakeWindowProps {
  windowModel: FakeWindowModel;
  active: boolean;
  onActivate: (id: string) => void;
  onDragStart: (id: string, event: ReactPointerEvent<HTMLElement>) => void;
}

export function FakeWindow({ windowModel, active, onActivate, onDragStart }: FakeWindowProps) {
  return (
    <article
      className={`fake-window ${active ? 'is-active' : 'is-inactive'}`}
      style={{
        left: windowModel.x,
        top: windowModel.y,
        width: windowModel.width,
        height: windowModel.height,
        zIndex: windowModel.z,
      }}
      onPointerDown={() => onActivate(windowModel.id)}
      aria-label={`${windowModel.title} window`}
    >
      <header className="fake-window-chrome" onPointerDown={(event) => onDragStart(windowModel.id, event)}>
        <div className="traffic-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>{windowModel.title}</span>
      </header>
      <div className="fake-window-body">
        <p className="window-role">{windowModel.role}</p>
        {windowModel.content.map((line) => (
          <div key={line} className="content-line">
            {line}
          </div>
        ))}
      </div>
    </article>
  );
}
