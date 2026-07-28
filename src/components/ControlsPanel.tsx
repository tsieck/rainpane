import { useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { applyIntensity, applyMode, INTENSITY_PRESETS, MODE_PRESETS } from '../state/settingsStore';
import type {
  DisplayMode,
  PhotorealRefractionStatus,
  WeatherIntensity,
  WeatherSettings,
} from '../weather/types';
import { ModeSelector } from './ModeSelector';

interface ControlsPanelProps {
  settings: WeatherSettings;
  onChange: (settings: WeatherSettings) => void;
  onReset: () => void;
  overlayEnabled: boolean;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onBatteryPower: boolean;
  photorealRefractionStatus: PhotorealRefractionStatus;
  photorealRefractionSupported: boolean;
  onOpenScreenRecordingSettings: () => void;
}

type ControlTab = 'scene' | 'tune' | 'behavior';
type UpdateState = 'idle' | 'checking' | 'current' | 'available' | 'error' | 'unavailable';

const CONTROL_TABS: Array<{ id: ControlTab; label: string }> = [
  { id: 'scene', label: 'Scene' },
  { id: 'tune', label: 'Tune' },
  { id: 'behavior', label: 'Behavior' },
];

const INTENSITY_LABELS: Array<{ id: WeatherIntensity; label: string }> = [
  { id: 'mist', label: 'Mist' },
  { id: 'rain', label: 'Rain' },
  { id: 'downpour', label: 'Downpour' },
  { id: 'frosted', label: 'Frosted' },
];

function matchesIntensity(settings: WeatherSettings, preset: WeatherIntensity) {
  const values = INTENSITY_PRESETS[preset];
  return (
    Math.abs(settings.rainIntensity - values.rainIntensity) < 0.005 &&
    Math.abs(settings.fogIntensity - values.fogIntensity) < 0.005 &&
    Math.abs(settings.dropletDensity - values.dropletDensity) < 0.005 &&
    Math.abs(settings.animationSpeed - values.animationSpeed) < 0.005
  );
}

function SparkIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 1.8c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6Z" />
      <path d="M14.4 12.2c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z" />
    </svg>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onChange,
  compact = false,
  disabled = false,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <label className={`setting-switch${checked ? ' is-checked' : ''}${compact ? ' is-compact' : ''}`}>
      <input
        id={inputId}
        className="setting-switch-input"
        type="checkbox"
        role="switch"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="setting-switch-control" aria-hidden="true">
        <span />
      </span>
      <span className="setting-switch-copy">
        <strong id={labelId}>{label}</strong>
        {description ? <small id={descriptionId}>{description}</small> : null}
      </span>
    </label>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <label className="atmosphere-slider" htmlFor={id}>
      <span className="atmosphere-slider-label">
        <span>{label}</span>
        <output htmlFor={id}>{formatValue(value)}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <header className="control-section-heading">
      {eyebrow ? <span>{eyebrow}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

export function ControlsPanel({
  settings,
  onChange,
  onReset,
  overlayEnabled,
  onOverlayEnabledChange,
  onBatteryPower,
  photorealRefractionStatus,
  photorealRefractionSupported,
  onOpenScreenRecordingSettings,
}: ControlsPanelProps) {
  const [activeTab, setActiveTab] = useState<ControlTab>('scene');
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const panelRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const preset = MODE_PRESETS[settings.mode];
  const activeIntensity = INTENSITY_LABELS.find((intensity) => matchesIntensity(settings, intensity.id));
  const update = (patch: Partial<WeatherSettings>) => onChange({ ...settings, ...patch });

  const overlayStatus = !overlayEnabled
    ? 'Paused — your desktop is untouched'
    : onBatteryPower && (settings.autoLowPower || settings.lowPowerMode)
      ? 'Ready — conserving battery'
      : 'Ready — weather follows your focus';
  const refractionStatusCopy: Record<PhotorealRefractionStatus, string> = {
    off: 'Off — the default renderer never samples the display',
    paused: 'Paused — Settings is open, the overlay is hidden, or no droplets need sampling',
    starting: 'Starting the local optical pipeline…',
    live: 'Live — clean scene pixels are bending beneath each drop',
    'permission-needed': 'macOS Screen Recording permission is needed',
    unsupported: 'Available in the macOS desktop app',
    error: 'The optical pipeline could not start',
  };
  const refractionPipelineActive = photorealRefractionStatus === 'starting' || photorealRefractionStatus === 'live';

  const selectTab = (index: number) => {
    const nextIndex = (index + CONTROL_TABS.length) % CONTROL_TABS.length;
    setActiveTab(CONTROL_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectTab(CONTROL_TABS.length - 1);
    }
  };

  const handleGlassPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel || settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const bounds = panel.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
    panel.style.setProperty('--glass-x', `${Math.min(100, Math.max(0, x)).toFixed(2)}%`);
    panel.style.setProperty('--glass-y', `${Math.min(100, Math.max(0, y)).toFixed(2)}%`);
    panel.style.setProperty('--glass-presence', '1');
  };

  const quietGlass = () => {
    panelRef.current?.style.setProperty('--glass-presence', '0.32');
  };

  const surpriseMe = () => {
    const modes = Object.keys(MODE_PRESETS) as Array<WeatherSettings['mode']>;
    const intensityIds = INTENSITY_LABELS.map(({ id }) => id);
    const differentModes = modes.filter((mode) => mode !== settings.mode);
    const mode = differentModes[Math.floor(Math.random() * differentModes.length)] ?? modes[0];
    const intensity = intensityIds[Math.floor(Math.random() * intensityIds.length)];
    onChange(applyIntensity(applyMode(settings, mode), intensity));
  };

  const checkForUpdates = async () => {
    if (!window.rainpane?.checkForUpdates) {
      setUpdateState('unavailable');
      setUpdateMessage('Update checks are available in the desktop app.');
      return;
    }

    setUpdateState('checking');
    setUpdateMessage('Looking for a newer atmosphere…');
    try {
      const result = await window.rainpane.checkForUpdates();
      if (result.hasUpdate) {
        setUpdateState('available');
        setUpdateMessage(`${result.tagName ?? result.latestVersion ?? 'A new release'} is available.`);
      } else {
        setUpdateState('current');
        setUpdateMessage(`Rainpane ${result.currentVersion} is current.`);
      }
    } catch {
      setUpdateState('error');
      setUpdateMessage('Could not check right now. Try again in a moment.');
    }
  };

  return (
    <aside
      ref={panelRef}
      className="controls-panel"
      data-overlay-enabled={overlayEnabled}
      aria-label="Rainpane atmosphere controls"
      onPointerMove={handleGlassPointerMove}
      onPointerLeave={quietGlass}
    >
      <header className="atmosphere-header">
        <div className="atmosphere-title">
          <span className="atmosphere-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28">
              <path d="M14 3.1c4.1 5.2 6.2 9.1 6.2 11.7A6.2 6.2 0 1 1 7.8 14.8C7.8 12.2 9.9 8.3 14 3.1Z" />
              <path d="M10.7 17.2c.6 1.3 1.7 2 3.3 2.1" />
            </svg>
          </span>
          <div>
            <p>Rainpane</p>
            <h1>Atmosphere</h1>
          </div>
        </div>
        <SettingSwitch
          compact
          label="Overlay"
          checked={overlayEnabled}
          onChange={onOverlayEnabledChange}
        />
        <p className={`atmosphere-status${overlayEnabled ? ' is-active' : ' is-paused'}`} aria-live="polite">
          <span aria-hidden="true" />
          {overlayStatus}
        </p>
      </header>

      <div className="control-tabs" data-active-tab={activeTab} role="tablist" aria-label="Atmosphere settings">
        <span className="control-tab-lens" aria-hidden="true" />
        {CONTROL_TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`control-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`control-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'is-active' : undefined}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="controls-scroll-region">
        {activeTab === 'scene' ? (
          <section
            id="control-panel-scene"
            className="control-tab-panel scene-panel"
            role="tabpanel"
            aria-labelledby="control-tab-scene"
          >
            <SectionHeading
              eyebrow="Weather rooms"
              title="Choose a scene"
              description="Each scene changes the light, weather, and quiet around your focus pane."
            />
            <ModeSelector value={settings.mode} onChange={(mode) => onChange(applyMode(settings, mode))} />

            <div className="intensity-control">
              <div className="control-label-row">
                <span>Intensity</span>
                <small>{activeIntensity?.label ?? 'Scene balance'}</small>
              </div>
              <div className="segmented-control intensity-segments" role="group" aria-label="Weather intensity">
                {INTENSITY_LABELS.map((intensity) => {
                  const active = matchesIntensity(settings, intensity.id);
                  return (
                    <button
                      key={intensity.id}
                      type="button"
                      aria-pressed={active}
                      className={active ? 'is-active' : undefined}
                      onClick={() => onChange(applyIntensity(settings, intensity.id))}
                    >
                      {intensity.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="surprise-button" type="button" onClick={surpriseMe}>
              <SparkIcon />
              <span>
                <strong>Surprise me</strong>
                <small>Find a different weather room</small>
              </span>
            </button>

            <p className="scene-footnote">
              Local only · {refractionPipelineActive ? 'opt-in display sampling in memory' : 'no active screen capture'}
            </p>
          </section>
        ) : null}

        {activeTab === 'tune' ? (
          <section
            id="control-panel-tune"
            className="control-tab-panel tune-panel"
            role="tabpanel"
            aria-labelledby="control-tab-tune"
          >
            <SectionHeading
              eyebrow={preset.label}
              title="Shape the weather"
              description="Adjust the atmosphere without leaving the scene."
            />

            <div className="scene-summary" aria-label="Current scene summary">
              <span className="scene-summary-swatch" aria-hidden="true" />
              <div>
                <strong>{preset.label}</strong>
                <small>
                  {Math.round(settings.rainIntensity * 100)}% rain · {Math.round(settings.fogIntensity * 100)}% fog ·{' '}
                  {Math.round(settings.dropletDensity * 100)}% glass
                </small>
              </div>
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Weather layers</span>
                <small>Build your pane</small>
              </div>
              <div className="layer-switches">
                <SettingSwitch label="Rain" checked={settings.rainEnabled} onChange={(rainEnabled) => update({ rainEnabled })} />
                <SettingSwitch label="Fog" checked={settings.fogEnabled} onChange={(fogEnabled) => update({ fogEnabled })} />
                <SettingSwitch
                  label="Droplets"
                  checked={settings.dropletsEnabled}
                  onChange={(dropletsEnabled) => update({ dropletsEnabled })}
                />
              </div>
            </div>

            <div className="slider-stack">
              <Slider
                id="rain-intensity"
                label="Rain"
                min={0}
                max={1}
                step={0.01}
                value={settings.rainIntensity}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(rainIntensity) => update({ rainIntensity })}
              />
              <Slider
                id="fog-intensity"
                label="Fog"
                min={0}
                max={1}
                step={0.01}
                value={settings.fogIntensity}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(fogIntensity) => update({ fogIntensity })}
              />
              <Slider
                id="droplet-density"
                label="Droplets"
                min={0}
                max={1}
                step={0.01}
                value={settings.dropletDensity}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(dropletDensity) => update({ dropletDensity })}
              />
              <Slider
                id="wind-angle"
                label="Wind"
                min={-75}
                max={75}
                step={1}
                value={settings.windAngle}
                formatValue={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}°`}
                onChange={(windAngle) => update({ windAngle })}
              />
              <Slider
                id="animation-speed"
                label="Pace"
                min={0.25}
                max={1.5}
                step={0.01}
                value={settings.animationSpeed}
                formatValue={(value) => `${value.toFixed(2)}×`}
                onChange={(animationSpeed) => update({ animationSpeed })}
              />
            </div>

            <div className="texture-switches">
              <SettingSwitch
                label="Grain"
                description="A fine, tactile glass texture"
                checked={settings.grainEnabled}
                onChange={(grainEnabled) => update({ grainEnabled })}
              />
              <SettingSwitch
                label="Lightning"
                description={settings.mode === 'storm-lock-in' ? 'Rare flashes in Storm Lock-in' : 'Appears in Storm Lock-in'}
                checked={settings.lightningEnabled}
                onChange={(lightningEnabled) => update({ lightningEnabled })}
              />
            </div>
          </section>
        ) : null}

        {activeTab === 'behavior' ? (
          <section
            id="control-panel-behavior"
            className="control-tab-panel behavior-panel"
            role="tabpanel"
            aria-labelledby="control-tab-behavior"
          >
            <SectionHeading
              eyebrow="Focus pane"
              title="Let the rest fall away"
              description="Choose how Rainpane behaves while you work."
            />

            <div className="behavior-group">
              <h3>Focus behavior</h3>
              <div className="settings-list">
                <SettingSwitch
                  label="Weather everywhere"
                  description="Cover the focused window too"
                  checked={settings.coverFullScreen}
                  onChange={(coverFullScreen) => update({ coverFullScreen })}
                />
                <SettingSwitch
                  label="Rain while moving windows"
                  description="Fill the screen until the window settles"
                  checked={settings.fullRainWhileMoving}
                  onChange={(fullRainWhileMoving) => update({ fullRainWhileMoving })}
                />
                <SettingSwitch
                  label="Deepen while idle"
                  description="Let the background grow quieter when you step away"
                  checked={settings.idleDeepeningEnabled}
                  onChange={(idleDeepeningEnabled) => update({ idleDeepeningEnabled })}
                />
              </div>
            </div>

            <div className="behavior-group display-group">
              <div className="control-label-row">
                <span>Displays</span>
                <small>Where weather appears</small>
              </div>
              <div className="segmented-control display-segments" role="group" aria-label="Displays">
                {(
                  [
                    ['primary', 'Primary'],
                    ['all', 'All displays'],
                  ] as Array<[DisplayMode, string]>
                ).map(([displayMode, label]) => (
                  <button
                    key={displayMode}
                    type="button"
                    aria-pressed={settings.displayMode === displayMode}
                    className={settings.displayMode === displayMode ? 'is-active' : undefined}
                    onClick={() => update({ displayMode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="behavior-group refraction-group">
              <div className="control-label-row">
                <span>Glass fidelity</span>
                <small>Native optics</small>
              </div>
              <div className="refraction-control">
                <SettingSwitch
                  label="Photoreal refraction"
                  description="Locally samples this display so droplets can bend the pixels beneath them"
                  checked={settings.photorealRefractionEnabled}
                  disabled={!photorealRefractionSupported}
                  onChange={(photorealRefractionEnabled) => update({ photorealRefractionEnabled })}
                />
                <p
                  className={`refraction-status is-${photorealRefractionStatus}`}
                  role="status"
                  aria-live="polite"
                >
                  <span aria-hidden="true" />
                  {refractionStatusCopy[photorealRefractionStatus]}
                </p>
                {photorealRefractionStatus === 'permission-needed' ? (
                  <button
                    className="permission-settings-button"
                    type="button"
                    onClick={onOpenScreenRecordingSettings}
                  >
                    Open Screen Recording Settings
                  </button>
                ) : null}
              </div>
            </div>

            <div className="behavior-group">
              <h3>Comfort & power</h3>
              <div className="settings-list">
                <SettingSwitch
                  label="Reduced motion"
                  description="Reduce movement, flashes, and elasticity"
                  checked={settings.reducedMotion}
                  onChange={(reducedMotion) => update({ reducedMotion })}
                />
                <SettingSwitch
                  label="Low power"
                  description="Use a lighter render profile"
                  checked={settings.lowPowerMode}
                  onChange={(lowPowerMode) => update({ lowPowerMode })}
                />
                <SettingSwitch
                  label="Auto on battery"
                  description={onBatteryPower ? 'Battery power detected' : 'Conserve power when unplugged'}
                  checked={settings.autoLowPower}
                  onChange={(autoLowPower) => update({ autoLowPower })}
                />
              </div>
            </div>

            <details className="advanced-settings">
              <summary>
                <span>
                  <strong>Advanced</strong>
                  <small>Glass behavior and diagnostics</small>
                </span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </summary>
              <div className="settings-list">
                <SettingSwitch
                  label="Fog build-up"
                  description="Let haze gather gradually"
                  checked={settings.fogAccumulationEnabled}
                  onChange={(fogAccumulationEnabled) => update({ fogAccumulationEnabled })}
                />
                <SettingSwitch
                  label="Lock-in dimming"
                  description="Darken unfocused areas slightly"
                  checked={settings.lockInDimmingEnabled}
                  onChange={(lockInDimmingEnabled) => update({ lockInDimmingEnabled })}
                />
                <SettingSwitch
                  label="Debug focus mask"
                  description="Show the detected clear window bounds"
                  checked={settings.debugMode}
                  onChange={(debugMode) => update({ debugMode })}
                />
              </div>
            </details>

            <div className="privacy-note">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2.5 16 5v4.4c0 3.7-2 6.4-6 8.1-4-1.7-6-4.4-6-8.1V5l6-2.5Z" />
                <path d="m7.2 10 1.8 1.8 3.8-4" />
              </svg>
              <p>
                <strong>{photorealRefractionStatus === 'live' ? 'Local optical sampling' : 'Private by default'}</strong>
                <span>
                  {photorealRefractionStatus === 'live'
                    ? 'The selected display is sampled in memory for refraction only — never recorded, saved, or uploaded.'
                    : photorealRefractionStatus === 'starting'
                      ? 'The local optical pipeline is starting. Frames stay in memory and are never recorded, saved, or uploaded.'
                    : photorealRefractionStatus === 'permission-needed'
                      ? 'Screen capture stays off until you grant macOS permission and relaunch Rainpane.'
                      : 'No display frames are being sampled, recorded, saved, or uploaded.'}
                </span>
              </p>
            </div>

            <div className="maintenance-actions">
              <button
                className="update-button"
                type="button"
                disabled={updateState === 'checking'}
                onClick={checkForUpdates}
              >
                {updateState === 'checking' ? 'Checking…' : 'Check for updates'}
              </button>
              {updateMessage ? (
                <p className={`update-status is-${updateState}`} role="status">
                  {updateMessage}
                </p>
              ) : null}
              <button className="reset-button" type="button" onClick={onReset}>
                Reset every setting
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
