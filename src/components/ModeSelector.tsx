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
        >
          <span>{preset.label}</span>
          <small>{preset.description}</small>
        </button>
      ))}
    </div>
  );
}
