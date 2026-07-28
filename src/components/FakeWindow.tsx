import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

export type FakeWindowKind = 'browser' | 'music' | 'notes';

export interface FakeWindowModel {
  id: string;
  kind: FakeWindowKind;
  title: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

interface FakeWindowProps {
  windowModel: FakeWindowModel;
  active: boolean;
  onActivate: (id: string) => void;
  onDragStart: (id: string, event: ReactPointerEvent<HTMLElement>) => void;
}

function BrowserContent() {
  return (
    <div className="fake-window-body fake-window-body--browser">
      <div className="browser-toolbar" aria-hidden="true">
        <span>‹</span><span>›</span>
        <div className="browser-address"><i /> fieldnotes.local / attention</div>
        <span>•••</span>
      </div>
      <div className="research-layout">
        <aside className="research-index" aria-label="Research topics">
          <small>Notebook 04</small>
          <strong>Attention</strong>
          <span className="is-selected">Quiet interfaces</span>
          <span>Ambient systems</span>
          <span>Visual rhythm</span>
        </aside>
        <div className="research-document">
          <p className="window-role">Field note · 12 min read</p>
          <h3>The shape of sustained attention</h3>
          <p>Clarity is not the absence of atmosphere. It is knowing where the atmosphere should fall away.</p>
          <blockquote>Keep one surface sharp. Let everything beyond it soften.</blockquote>
          <div className="research-meta"><span>7 annotations</span><span>Saved today</span></div>
        </div>
      </div>
    </div>
  );
}

function MusicContent() {
  return (
    <div className="fake-window-body fake-window-body--music">
      <div className="music-artwork" aria-hidden="true">
        <i /><i /><i /><i />
        <span>Side A</span>
      </div>
      <div className="music-copy">
        <p className="window-role">Now playing</p>
        <h3>Low Clouds</h3>
        <p>Mara Vale · Rain Room Sessions</p>
      </div>
      <div className="music-progress" aria-label="Track progress: 2 minutes 14 seconds of 4 minutes 8 seconds">
        <i><span /></i>
        <small>2:14</small><small>4:08</small>
      </div>
      <div className="music-controls" aria-hidden="true"><span>↶</span><strong>Ⅱ</strong><span>↷</span></div>
    </div>
  );
}

function NotesContent() {
  return (
    <div className="fake-window-body fake-window-body--notes">
      <div className="notes-heading">
        <div>
          <p className="window-role">Today · 7:14 AM</p>
          <h3>A quieter desktop</h3>
        </div>
        <span aria-label="Pinned note">Pinned</span>
      </div>
      <ul className="notes-list">
        <li><i aria-hidden="true" />Keep the active thought clear.</li>
        <li><i aria-hidden="true" />Let the periphery breathe.</li>
        <li><i aria-hidden="true" />No timers. No scoring. Just weather.</li>
      </ul>
    </div>
  );
}

function WindowContent({ kind }: { kind: FakeWindowKind }) {
  if (kind === 'music') {
    return <MusicContent />;
  }
  if (kind === 'notes') {
    return <NotesContent />;
  }
  return <BrowserContent />;
}

export function FakeWindow({ windowModel, active, onActivate, onDragStart }: FakeWindowProps) {
  const activateFromKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(windowModel.id);
    }
  };

  return (
    <article
      className={`fake-window fake-window--${windowModel.kind} ${active ? 'is-active' : 'is-inactive'}`}
      style={{
        left: windowModel.x,
        top: windowModel.y,
        width: windowModel.width,
        height: windowModel.height,
        zIndex: windowModel.z,
        pointerEvents: 'auto',
      }}
      role="button"
      tabIndex={0}
      aria-label={`${windowModel.title} window. ${windowModel.role}`}
      aria-pressed={active}
      onKeyDown={activateFromKeyboard}
      onPointerDown={(event) => {
        if (event.isPrimary && event.button === 0) {
          onActivate(windowModel.id);
        }
      }}
    >
      <header className="fake-window-chrome" onPointerDown={(event) => onDragStart(windowModel.id, event)}>
        <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
        <div className="fake-window-title">
          <span>{windowModel.title}</span>
          <small>{windowModel.role}</small>
        </div>
        <span className="fake-window-active-state">{active ? 'Focused' : ''}</span>
      </header>
      <WindowContent kind={windowModel.kind} />
    </article>
  );
}
