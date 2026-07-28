import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { MODE_PRESETS } from '../state/settingsStore';
import type { WeatherMode } from '../weather/types';

interface ModeSelectorProps {
  value: WeatherMode;
  onChange: (mode: WeatherMode) => void;
}

function SceneGlyph({ mode }: { mode: WeatherMode }) {
  if (mode === 'storm-lock-in') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M10 15.5c1.7-4.2 5-6.3 9.8-6.3 5.6 0 9.1 2.9 10.2 8.6 3.3.2 5 2 5 5.4 0 3.7-2.4 5.6-7.1 5.6H11.7c-4.5 0-6.7-2.2-6.7-6.5 0-3.8 1.7-6 5-6.8Z" />
        <path d="m22.1 22.2-4.6 7h3.8l-2.2 5.6 7-8.4h-4.3l.3-4.2Z" />
      </svg>
    );
  }

  if (mode === 'night-drive') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 10 3 19M18 7 8 25M28 6 16 27M37 11 27 29M36 25l-5 9" />
      </svg>
    );
  }

  if (mode === 'greyglass') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M5 14.5c4.2-2.5 8.4-2.5 12.6 0s8.4 2.5 12.6 0M9.8 21c3.4-2 6.8-2 10.2 0s6.8 2 10.2 0M5 27.5c4.2-2.5 8.4-2.5 12.6 0s8.4 2.5 12.6 0" />
      </svg>
    );
  }

  if (mode === 'winterglass') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 5v30M7 12.5l26 15M7 27.5l26-15M14 8.5l6 4 6-4M14 31.5l6-4 6 4M8.5 19l5.8 3.5-.3 6.8M31.5 21l-5.8-3.5.3-6.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M12 7.5 8.5 15M22 5l-4 9M31.5 9 28 17M14 21l-4.5 10M24 19l-5 13M33 22l-3.5 9" />
    </svg>
  );
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const presets = Object.values(MODE_PRESETS);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAndFocus = (index: number) => {
    const nextIndex = (index + presets.length) % presets.length;
    onChange(presets[nextIndex].id);
    buttonsRef.current[nextIndex]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = index - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = presets.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectAndFocus(nextIndex);
  };

  return (
    <div className="scene-selector" role="radiogroup" aria-label="Atmosphere scene">
      {presets.map((preset, index) => {
        const active = value === preset.id;

        return (
          <button
            key={preset.id}
            ref={(element) => {
              buttonsRef.current[index] = element;
            }}
            className={`scene-item scene-item--${preset.id}${active ? ' is-active' : ''}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(preset.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={
              {
                '--scene-a': preset.palette.desktopA,
                '--scene-b': preset.palette.desktopB,
                '--scene-fog': preset.palette.fog,
                '--scene-accent': preset.palette.accent,
              } as CSSProperties
            }
          >
            <span className="scene-item-art" aria-hidden="true">
              <span className="scene-item-glow" />
              <SceneGlyph mode={preset.id} />
            </span>
            <span className="scene-item-copy">
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </span>
            <span className="scene-item-check" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <path d="m3.2 8.2 3 3.1 6.7-7" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}
