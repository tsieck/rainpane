import { type CSSProperties } from 'react';
import { MODE_PRESETS } from '../state/settingsStore';
import type { WeatherMode } from '../weather/types';

interface ModeSelectorProps {
  value: WeatherMode;
  onChange: (mode: WeatherMode) => void;
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="mode-grid" role="radiogroup" aria-label="Weather mode">
      {Object.values(MODE_PRESETS).map((preset) => (
        <button
          key={preset.id}
          className={`mode-button ${value === preset.id ? 'is-active' : ''}`}
          type="button"
          role="radio"
          aria-checked={value === preset.id}
          onClick={() => onChange(preset.id)}
          style={
            {
              '--mode-a': preset.palette.desktopA,
              '--mode-b': preset.palette.desktopB,
              '--mode-fog': preset.palette.fog,
            } as CSSProperties
          }
        >
          <i aria-hidden="true" />
          <span>{preset.label}</span>
          <small>{preset.description}</small>
        </button>
      ))}
    </div>
  );
}
