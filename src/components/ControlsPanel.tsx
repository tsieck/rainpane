import { applyMode } from '../state/settingsStore';
import type { WeatherSettings } from '../weather/types';
import { ModeSelector } from './ModeSelector';

interface ControlsPanelProps {
  settings: WeatherSettings;
  onChange: (settings: WeatherSettings) => void;
  onReset: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control-row">
      <span>
        {label}
        <strong>
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export function ControlsPanel({ settings, onChange, onReset }: ControlsPanelProps) {
  const update = (patch: Partial<WeatherSettings>) => onChange({ ...settings, ...patch });

  return (
    <aside className="controls-panel" aria-label="Rainpane controls">
      <div className="panel-title">
        <p>Rainpane</p>
        <h1>Demo Mode</h1>
      </div>

      <ModeSelector value={settings.mode} onChange={(mode) => onChange(applyMode(settings, mode))} />

      <label className="select-row">
        <span>Displays</span>
        <select
          value={settings.displayMode}
          onChange={(event) => update({ displayMode: event.currentTarget.value as WeatherSettings['displayMode'] })}
        >
          <option value="primary">Primary display</option>
          <option value="all">All displays</option>
        </select>
      </label>

      <div className="toggle-grid">
        <label>
          <input
            type="checkbox"
            checked={settings.rainEnabled}
            onChange={(event) => update({ rainEnabled: event.currentTarget.checked })}
          />
          Rain
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.fogEnabled}
            onChange={(event) => update({ fogEnabled: event.currentTarget.checked })}
          />
          Fog
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.dropletsEnabled}
            onChange={(event) => update({ dropletsEnabled: event.currentTarget.checked })}
          />
          Droplets
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => update({ reducedMotion: event.currentTarget.checked })}
          />
          Reduced motion
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.lowPowerMode}
            onChange={(event) => update({ lowPowerMode: event.currentTarget.checked })}
          />
          Low power
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.debugMode}
            onChange={(event) => update({ debugMode: event.currentTarget.checked })}
          />
          Debug mask
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.lightningEnabled}
            onChange={(event) => update({ lightningEnabled: event.currentTarget.checked })}
          />
          Lightning
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.grainEnabled}
            onChange={(event) => update({ grainEnabled: event.currentTarget.checked })}
          />
          Grain
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.fogAccumulationEnabled}
            onChange={(event) => update({ fogAccumulationEnabled: event.currentTarget.checked })}
          />
          Fog build-up
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.coverFullScreen}
            onChange={(event) => update({ coverFullScreen: event.currentTarget.checked })}
          />
          Cover full screen
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.fullRainWhileMoving}
            onChange={(event) => update({ fullRainWhileMoving: event.currentTarget.checked })}
          />
          Full rain while moving
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.lockInDimmingEnabled}
            onChange={(event) => update({ lockInDimmingEnabled: event.currentTarget.checked })}
          />
          Lock-in dimming
        </label>
      </div>

      <div className="slider-stack">
        <Slider
          label="Rain intensity"
          min={0}
          max={1}
          step={0.01}
          value={settings.rainIntensity}
          onChange={(rainIntensity) => update({ rainIntensity })}
        />
        <Slider
          label="Fog intensity"
          min={0}
          max={1}
          step={0.01}
          value={settings.fogIntensity}
          onChange={(fogIntensity) => update({ fogIntensity })}
        />
        <Slider
          label="Droplet density"
          min={0}
          max={1}
          step={0.01}
          value={settings.dropletDensity}
          onChange={(dropletDensity) => update({ dropletDensity })}
        />
        <Slider
          label="Wind angle"
          min={-75}
          max={75}
          step={1}
          value={settings.windAngle}
          suffix="deg"
          onChange={(windAngle) => update({ windAngle })}
        />
        <Slider
          label="Animation speed"
          min={0.25}
          max={1.5}
          step={0.01}
          value={settings.animationSpeed}
          onChange={(animationSpeed) => update({ animationSpeed })}
        />
      </div>

      <button className="reset-button" type="button" onClick={onReset}>
        Reset to defaults
      </button>
    </aside>
  );
}
