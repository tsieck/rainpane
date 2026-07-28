import { app, type BrowserWindow, type Display } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import {
  getElectronSystemVersion,
  isPhotorealRefractionPlatformSupported,
} from './platformSupport.js';

export type PhotorealRefractionStatus =
  | 'off'
  | 'paused'
  | 'starting'
  | 'live'
  | 'permission-needed'
  | 'unsupported'
  | 'error';

export interface PhotorealRefractionDroplet {
  x: number;
  y: number;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  opacity?: number;
  refraction?: number;
  blur?: number;
  seed?: number;
  highlight?: number;
}

export interface PhotorealRefractionProtectedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
}

export interface PhotorealRefractionFrame {
  width: number;
  height: number;
  droplets: readonly PhotorealRefractionDroplet[];
  protectedRects?: readonly PhotorealRefractionProtectedRect[];
}

export interface PhotorealRefractionOverlay {
  window: BrowserWindow;
  display: Display;
}

export interface PhotorealRefractionSyncState {
  enabled: boolean;
  visible: boolean;
  overlays: readonly PhotorealRefractionOverlay[];
}

export interface PhotorealRefractionDisplayState {
  displayId: number;
  status: PhotorealRefractionStatus;
  message?: string;
}

export interface PhotorealRefractionState {
  enabled: boolean;
  visible: boolean;
  status: PhotorealRefractionStatus;
  displays: readonly PhotorealRefractionDisplayState[];
}

export interface PhotorealRefractionRuntimeTarget {
  display: { id: number };
  window: { webContents: { id: number } };
}

export interface PhotorealRefractionManagerCallbacks {
  onStatusChange?: (state: PhotorealRefractionState) => void;
  onHelperLog?: (displayId: number, stream: 'stdout' | 'stderr', message: string) => void;
}

export interface PhotorealRefractionManagerDependencies {
  platform?: NodeJS.Platform;
  systemVersion?: string;
  spawnHelper?: typeof spawn;
  helperPath?: () => string;
}

interface HelperEntry {
  child: ChildProcessWithoutNullStreams;
  display: Display;
  displaySignature: string;
  senderWebContentsId: number;
  status: PhotorealRefractionStatus;
  message?: string;
  stopping: boolean;
  pendingFrame?: string;
  forceKillTimer?: NodeJS.Timeout;
  stdoutBuffer: string;
  stderrBuffer: string;
}

interface HelperRecoveryState {
  attempts: number;
  status: PhotorealRefractionStatus;
  message?: string;
  restartWhenClosed?: boolean;
  restartImmediately?: boolean;
  timer?: NodeJS.Timeout;
  stabilityTimer?: NodeJS.Timeout;
}

interface HelperStatusLine {
  type?: unknown;
  status?: unknown;
  message?: unknown;
}

const HELPER_NAME = 'rainpane-refraction-helper';
const FORCE_KILL_DELAY_MS = 800;
export const MAX_HELPER_RESTART_ATTEMPTS = 4;
export const HELPER_LIVE_STABILITY_MS = 4_000;
const STATUS_VALUES = new Set<PhotorealRefractionStatus>([
  'off',
  'paused',
  'starting',
  'live',
  'permission-needed',
  'unsupported',
  'error',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStatus(value: unknown): value is PhotorealRefractionStatus {
  return typeof value === 'string' && STATUS_VALUES.has(value as PhotorealRefractionStatus);
}

export function parsePhotorealRefractionStatusLine(
  line: string,
): Pick<PhotorealRefractionDisplayState, 'status' | 'message'> | null {
  let parsed: HelperStatusLine;
  try {
    parsed = JSON.parse(line) as HelperStatusLine;
  } catch {
    return null;
  }

  if ((parsed.type !== undefined && parsed.type !== 'status') || !isStatus(parsed.status)) {
    return null;
  }

  return {
    status: parsed.status,
    message: typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim() : undefined,
  };
}

export function aggregatePhotorealRefractionStatus(
  enabled: boolean,
  visible: boolean,
  platformSupported: boolean,
  displayStates: readonly PhotorealRefractionDisplayState[],
): PhotorealRefractionStatus {
  if (!enabled) {
    return 'off';
  }
  if (!platformSupported) {
    return 'unsupported';
  }
  if (displayStates.length === 0) {
    return 'starting';
  }
  if (displayStates.some((state) => state.status === 'permission-needed')) {
    return 'permission-needed';
  }
  if (displayStates.some((state) => state.status === 'error')) {
    return 'error';
  }
  if (displayStates.some((state) => state.status === 'unsupported')) {
    return 'unsupported';
  }
  if (!visible) {
    return 'paused';
  }
  if (displayStates.every((state) => state.status === 'live' || state.status === 'paused')) {
    return displayStates.some((state) => state.status === 'live') ? 'live' : 'paused';
  }
  return 'starting';
}

/**
 * Overlay renderers need the status of their own native helper so a failure or
 * restart on a different display does not re-enable duplicate Canvas heads.
 * Non-overlay callers omit displayId and retain the aggregate status used by
 * the settings UI. Global disabled/hidden states still apply to every display.
 */
export function getPhotorealRefractionStatusForDisplay(
  state: PhotorealRefractionState,
  displayId?: number,
): PhotorealRefractionStatus {
  if (displayId === undefined || !state.enabled || !state.visible) {
    return state.status;
  }

  return state.displays.find((display) => display.displayId === displayId)?.status ?? state.status;
}

export function getPhotorealRefractionDisplayIdForSender(
  overlays: readonly PhotorealRefractionRuntimeTarget[],
  senderWebContentsId: number,
): number | undefined {
  return overlays.find((overlay) => overlay.window.webContents.id === senderWebContentsId)?.display.id;
}

export function getPhotorealRefractionRestartDelay(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(Math.floor(attempt), MAX_HELPER_RESTART_ATTEMPTS));
  return 250 * 2 ** (boundedAttempt - 1);
}

export function canSubmitPhotorealRefractionGeometry(status: PhotorealRefractionStatus): boolean {
  // Starting lets geometry arrive before the first capture frame; paused lets
  // an idle helper see the first returning droplet and wake ScreenCaptureKit.
  return status === 'starting' || status === 'live' || status === 'paused';
}

/**
 * Electron replaces Display objects after display-metrics-changed. Comparing
 * the fields that affect native capture makes scale, rotation and geometry
 * transitions explicit instead of relying on object identity.
 */
export function getPhotorealRefractionDisplaySignature(display: Display): string {
  const { bounds, nativeOrigin, rotation, scaleFactor, size } = display;
  return [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    nativeOrigin?.x ?? bounds.x * scaleFactor,
    nativeOrigin?.y ?? bounds.y * scaleFactor,
    size.width,
    size.height,
    scaleFactor,
    rotation,
  ].join(':');
}

export function getPhotorealRefractionHelperPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native', HELPER_NAME);
  }

  return path.join(app.getAppPath(), 'build', 'native', HELPER_NAME);
}

/**
 * Owns the native ScreenCaptureKit helper processes used by overlay windows.
 * The renderer remains the source of droplet geometry; this class only routes
 * frames to the helper associated with the sending overlay's webContents.
 */
export class PhotorealRefractionManager {
  private readonly callbacks: PhotorealRefractionManagerCallbacks;
  private readonly platform: NodeJS.Platform;
  private readonly platformSupported: boolean;
  private readonly spawnHelper: typeof spawn;
  private readonly helperPath: () => string;
  private readonly helpers = new Map<number, HelperEntry>();
  private readonly recoveries = new Map<number, HelperRecoveryState>();
  private desiredOverlays = new Map<number, PhotorealRefractionOverlay>();
  private enabled = false;
  private visible = false;
  private unsupportedDisplays: readonly PhotorealRefractionOverlay[] = [];
  private lastEmittedState = '';

  constructor(
    callbacks: PhotorealRefractionManagerCallbacks = {},
    dependencies: PhotorealRefractionManagerDependencies = {},
  ) {
    this.callbacks = callbacks;
    this.platform = dependencies.platform ?? process.platform;
    const systemVersion = dependencies.systemVersion ?? getElectronSystemVersion(this.platform);
    this.platformSupported = isPhotorealRefractionPlatformSupported(this.platform, systemVersion);
    this.spawnHelper = dependencies.spawnHelper ?? spawn;
    this.helperPath = dependencies.helperPath ?? getPhotorealRefractionHelperPath;
  }

  sync(state: PhotorealRefractionSyncState): void {
    const wasVisible = this.visible;
    this.enabled = state.enabled;
    this.visible = state.visible;

    if (!state.enabled) {
      this.unsupportedDisplays = [];
      this.desiredOverlays.clear();
      this.stopAll();
      this.emitStatus();
      return;
    }

    if (!this.platformSupported) {
      this.stopAll();
      this.desiredOverlays.clear();
      this.unsupportedDisplays = state.overlays;
      this.emitStatus();
      return;
    }

    this.unsupportedDisplays = [];
    const overlays = state.overlays.filter(({ window }) => !window.isDestroyed());
    this.desiredOverlays = new Map(overlays.map((overlay) => [overlay.display.id, overlay]));
    const desiredDisplayIds = new Set(overlays.map(({ display }) => display.id));

    for (const displayId of this.recoveries.keys()) {
      if (!desiredDisplayIds.has(displayId)) {
        this.clearRecovery(displayId);
      }
    }

    for (const [displayId, entry] of this.helpers) {
      if (!desiredDisplayIds.has(displayId)) {
        this.stopHelper(displayId, entry);
      }
    }

    for (const overlay of overlays) {
      const senderWebContentsId = overlay.window.webContents.id;
      const existing = this.helpers.get(overlay.display.id);
      const displaySignature = getPhotorealRefractionDisplaySignature(overlay.display);

      if (
        existing
        && (existing.senderWebContentsId !== senderWebContentsId || existing.displaySignature !== displaySignature)
      ) {
        this.restartHelper(
          overlay.display.id,
          existing,
          existing.displaySignature !== displaySignature
            ? 'Display geometry changed; restarting native refraction.'
            : 'Overlay renderer changed; restarting native refraction.',
          true,
        );
        continue;
      }

      // A stopped helper is relaunched only by its close/backoff path. This
      // prevents a later sync from overlapping old and new capture panels.
      if (!existing && this.recoveries.has(overlay.display.id)) {
        continue;
      }

      const entry = this.helpers.get(overlay.display.id) ?? this.startHelper(overlay);
      if (!entry) {
        this.scheduleRecovery(overlay.display.id, 'Could not launch the native refraction helper.');
        continue;
      }

      entry.display = overlay.display;
      entry.displaySignature = displaySignature;
      entry.senderWebContentsId = senderWebContentsId;
      if (state.visible && !wasVisible && entry.status === 'live') {
        entry.status = 'starting';
        entry.message = undefined;
        this.cancelLiveStabilityWindow(entry.display.id);
      }
      if (!state.visible) {
        entry.pendingFrame = undefined;
      }
      this.writeMessage(entry, { type: 'visibility', visible: state.visible }, true);
    }

    this.emitStatus();
  }

  submitFrame(senderWebContentsId: number, frame: PhotorealRefractionFrame): boolean {
    if (!this.enabled || !this.visible || !this.platformSupported || !isRecord(frame)) {
      return false;
    }

    const entry = Array.from(this.helpers.values()).find(
      (candidate) => candidate.senderWebContentsId === senderWebContentsId && !candidate.stopping,
    );
    if (!entry || !canSubmitPhotorealRefractionGeometry(entry.status)) {
      return false;
    }

    return this.writeLatestFrame(entry, { ...frame, type: 'frame' });
  }

  getState(): PhotorealRefractionState {
    const platformSupported = this.platformSupported;
    const displays = platformSupported
      ? Array.from(this.desiredOverlays.values(), ({ display }) => {
          const entry = this.helpers.get(display.id);
          const recovery = this.recoveries.get(display.id);
          const status = entry?.status ?? recovery?.status ?? 'starting';
          const message = entry?.message ?? recovery?.message;
          return {
            displayId: display.id,
            status,
            ...(message ? { message } : {}),
          };
        }).sort((left, right) => left.displayId - right.displayId)
      : this.unsupportedDisplays
          .map(({ display }) => ({ displayId: display.id, status: 'unsupported' as const }))
          .sort((left, right) => left.displayId - right.displayId);

    return {
      enabled: this.enabled,
      visible: this.visible,
      status: aggregatePhotorealRefractionStatus(this.enabled, this.visible, platformSupported, displays),
      displays,
    };
  }

  stop(): void {
    this.enabled = false;
    this.visible = false;
    this.unsupportedDisplays = [];
    this.desiredOverlays.clear();
    this.stopAll();
    this.emitStatus();
  }

  private startHelper(overlay: PhotorealRefractionOverlay): HelperEntry | null {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnHelper(this.helperPath(), [String(overlay.display.id), String(process.pid)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      this.callbacks.onHelperLog?.(
        overlay.display.id,
        'stderr',
        error instanceof Error ? error.message : 'Could not start the refraction helper.',
      );
      return null;
    }

    const entry: HelperEntry = {
      child,
      display: overlay.display,
      displaySignature: getPhotorealRefractionDisplaySignature(overlay.display),
      senderWebContentsId: overlay.window.webContents.id,
      status: 'starting',
      stopping: false,
      stdoutBuffer: '',
      stderrBuffer: '',
    };
    this.helpers.set(overlay.display.id, entry);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consumeStdout(entry, chunk));
    child.stderr.on('data', (chunk: string) => this.consumeStderr(entry, chunk));
    child.stdin.on('drain', () => this.flushLatestFrame(entry));
    child.stdin.on('error', (error) => {
      if (!entry.stopping) {
        this.restartHelper(entry.display.id, entry, error.message);
      }
    });
    child.on('error', (error) => {
      if (!entry.stopping) {
        this.restartHelper(entry.display.id, entry, error.message);
      }
    });
    child.on('close', (code, signal) => {
      if (entry.forceKillTimer) {
        clearTimeout(entry.forceKillTimer);
        entry.forceKillTimer = undefined;
      }
      this.flushBuffers(entry);
      const displayId = entry.display.id;
      const recovery = this.recoveries.get(displayId);
      if (entry.stopping) {
        if (recovery?.restartWhenClosed) {
          recovery.restartWhenClosed = false;
          const restartImmediately = recovery.restartImmediately;
          recovery.restartImmediately = false;
          this.scheduleRecovery(displayId, recovery.message ?? 'Restarting native refraction.', restartImmediately);
        }
        return;
      }

      if (this.helpers.get(displayId) !== entry) {
        return;
      }
      this.helpers.delete(displayId);

      if (entry.status === 'permission-needed' || entry.status === 'unsupported') {
        this.clearRecovery(displayId);
        this.recoveries.set(displayId, {
          attempts: 0,
          status: entry.status,
          ...(entry.message ? { message: entry.message } : {}),
        });
      } else {
        const reason = entry.message
          ?? (signal ? `Helper stopped with ${signal}.` : `Helper exited with code ${code ?? 'unknown'}.`);
        this.scheduleRecovery(displayId, reason);
      }
      this.emitStatus();
    });

    this.writeMessage(entry, { type: 'visibility', visible: this.visible }, true);
    this.emitStatus();
    return entry;
  }

  private stopAll(): void {
    for (const displayId of this.recoveries.keys()) {
      this.clearRecovery(displayId);
    }
    for (const [displayId, entry] of this.helpers) {
      this.stopHelper(displayId, entry);
    }
  }

  private stopHelper(displayId: number, entry: HelperEntry, preserveRecovery = false): void {
    if (entry.stopping) {
      return;
    }

    entry.stopping = true;
    entry.pendingFrame = undefined;
    this.helpers.delete(displayId);
    if (!preserveRecovery) {
      this.clearRecovery(displayId);
    }
    this.writeMessage(entry, { type: 'visibility', visible: false }, true);
    this.writeMessage(entry, { type: 'shutdown' }, true);
    entry.child.stdin.end();

    entry.forceKillTimer = setTimeout(() => {
      if (entry.child.exitCode === null && entry.child.signalCode === null) {
        entry.child.kill('SIGTERM');
      }
    }, FORCE_KILL_DELAY_MS);
    entry.forceKillTimer.unref();
  }

  private restartHelper(
    displayId: number,
    entry: HelperEntry,
    reason: string,
    resetAttempts = false,
  ): void {
    if (entry.stopping || this.helpers.get(displayId) !== entry) {
      return;
    }

    if (resetAttempts) {
      this.clearRecovery(displayId);
    }
    const recovery = this.recoveries.get(displayId) ?? {
      attempts: 0,
      status: 'starting' as const,
    };
    if (recovery.stabilityTimer) {
      clearTimeout(recovery.stabilityTimer);
      recovery.stabilityTimer = undefined;
    }
    recovery.status = 'starting';
    recovery.message = reason;
    recovery.restartWhenClosed = true;
    recovery.restartImmediately = resetAttempts;
    this.recoveries.set(displayId, recovery);
    this.stopHelper(displayId, entry, true);
    this.emitStatus();
  }

  private scheduleRecovery(displayId: number, reason: string, immediate = false): void {
    const overlay = this.desiredOverlays.get(displayId);
    if (!this.enabled || !this.platformSupported || !overlay || this.helpers.has(displayId)) {
      return;
    }

    const recovery = this.recoveries.get(displayId) ?? {
      attempts: 0,
      status: 'starting' as const,
    };
    if (recovery.timer || recovery.status === 'permission-needed' || recovery.status === 'unsupported') {
      return;
    }
    if (recovery.stabilityTimer) {
      clearTimeout(recovery.stabilityTimer);
      recovery.stabilityTimer = undefined;
    }
    if (recovery.attempts >= MAX_HELPER_RESTART_ATTEMPTS) {
      recovery.status = 'error';
      recovery.message = `${reason} Automatic recovery stopped after ${MAX_HELPER_RESTART_ATTEMPTS} attempts.`;
      recovery.restartWhenClosed = false;
      recovery.restartImmediately = false;
      this.recoveries.set(displayId, recovery);
      this.emitStatus();
      return;
    }

    recovery.attempts += 1;
    recovery.status = 'starting';
    recovery.message = `${reason} Retrying ${recovery.attempts}/${MAX_HELPER_RESTART_ATTEMPTS}.`;
    recovery.restartWhenClosed = false;
    recovery.restartImmediately = false;
    const delay = immediate ? 0 : getPhotorealRefractionRestartDelay(recovery.attempts);
    recovery.timer = setTimeout(() => {
      const current = this.recoveries.get(displayId);
      if (current !== recovery) {
        return;
      }
      current.timer = undefined;
      const desired = this.desiredOverlays.get(displayId);
      if (!this.enabled || !this.platformSupported || !desired || this.helpers.has(displayId)) {
        return;
      }

      if (!this.startHelper(desired)) {
        this.scheduleRecovery(displayId, 'Could not launch the native refraction helper.');
      }
    }, delay);
    recovery.timer.unref();
    this.recoveries.set(displayId, recovery);
    this.emitStatus();
  }

  private clearRecovery(displayId: number): void {
    const recovery = this.recoveries.get(displayId);
    if (recovery?.timer) {
      clearTimeout(recovery.timer);
    }
    if (recovery?.stabilityTimer) {
      clearTimeout(recovery.stabilityTimer);
    }
    this.recoveries.delete(displayId);
  }

  private cancelLiveStabilityWindow(displayId: number): void {
    const recovery = this.recoveries.get(displayId);
    if (!recovery?.stabilityTimer) {
      return;
    }
    clearTimeout(recovery.stabilityTimer);
    recovery.stabilityTimer = undefined;
  }

  private beginLiveStabilityWindow(entry: HelperEntry): void {
    const displayId = entry.display.id;
    const recovery = this.recoveries.get(displayId);
    if (!recovery) {
      return;
    }

    this.cancelLiveStabilityWindow(displayId);
    recovery.status = 'live';
    recovery.message = undefined;
    recovery.stabilityTimer = setTimeout(() => {
      const current = this.recoveries.get(displayId);
      if (
        current !== recovery
        || this.helpers.get(displayId) !== entry
        || entry.stopping
        || entry.status !== 'live'
      ) {
        return;
      }
      this.clearRecovery(displayId);
    }, HELPER_LIVE_STABILITY_MS);
    recovery.stabilityTimer.unref();
  }

  private writeLatestFrame(entry: HelperEntry, message: Record<string, unknown>): boolean {
    if (entry.child.stdin.destroyed || !entry.child.stdin.writable) {
      return false;
    }

    const serialized = `${JSON.stringify(message)}\n`;
    if (entry.child.stdin.writableNeedDrain) {
      entry.pendingFrame = serialized;
      return true;
    }

    try {
      entry.child.stdin.write(serialized);
      return true;
    } catch (error) {
      this.restartHelper(
        entry.display.id,
        entry,
        error instanceof Error ? error.message : 'Could not send data to the refraction helper.',
      );
      return false;
    }
  }

  private flushLatestFrame(entry: HelperEntry): void {
    if (
      entry.stopping
      || !this.enabled
      || !this.visible
      || !canSubmitPhotorealRefractionGeometry(entry.status)
      || this.helpers.get(entry.display.id) !== entry
      || !entry.pendingFrame
      || entry.child.stdin.destroyed
      || !entry.child.stdin.writable
    ) {
      entry.pendingFrame = undefined;
      return;
    }

    const latest = entry.pendingFrame;
    entry.pendingFrame = undefined;
    try {
      entry.child.stdin.write(latest);
    } catch (error) {
      this.restartHelper(
        entry.display.id,
        entry,
        error instanceof Error ? error.message : 'Could not send data to the refraction helper.',
      );
    }
  }

  private writeMessage(entry: HelperEntry, message: Record<string, unknown>, allowBackpressure = false): boolean {
    if (entry.child.stdin.destroyed || !entry.child.stdin.writable || (!allowBackpressure && entry.child.stdin.writableNeedDrain)) {
      return false;
    }

    try {
      return entry.child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      if (!entry.stopping) {
        this.updateEntryStatus(
          entry,
          'error',
          error instanceof Error ? error.message : 'Could not send data to the refraction helper.',
        );
      }
      return false;
    }
  }

  private consumeStdout(entry: HelperEntry, chunk: string): void {
    entry.stdoutBuffer += chunk;
    const lines = entry.stdoutBuffer.split(/\r?\n/);
    entry.stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      this.handleStdoutLine(entry, line);
    }
  }

  private consumeStderr(entry: HelperEntry, chunk: string): void {
    entry.stderrBuffer += chunk;
    const lines = entry.stderrBuffer.split(/\r?\n/);
    entry.stderrBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        this.callbacks.onHelperLog?.(entry.display.id, 'stderr', line.trim());
      }
    }
  }

  private flushBuffers(entry: HelperEntry): void {
    if (entry.stdoutBuffer.trim()) {
      this.handleStdoutLine(entry, entry.stdoutBuffer);
    }
    if (entry.stderrBuffer.trim()) {
      this.callbacks.onHelperLog?.(entry.display.id, 'stderr', entry.stderrBuffer.trim());
    }
    entry.stdoutBuffer = '';
    entry.stderrBuffer = '';
  }

  private handleStdoutLine(entry: HelperEntry, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const statusLine = parsePhotorealRefractionStatusLine(trimmed);
    if (statusLine) {
      this.updateEntryStatus(entry, statusLine.status, statusLine.message);
      return;
    }

    this.callbacks.onHelperLog?.(entry.display.id, 'stdout', trimmed);
  }

  private updateEntryStatus(entry: HelperEntry, status: PhotorealRefractionStatus, message?: string): void {
    if (entry.stopping || this.helpers.get(entry.display.id) !== entry) {
      return;
    }

    entry.status = status;
    entry.message = message;
    if (status === 'live') {
      this.beginLiveStabilityWindow(entry);
    } else if (status === 'permission-needed' || status === 'unsupported') {
      entry.pendingFrame = undefined;
      this.clearRecovery(entry.display.id);
    } else if (status === 'error') {
      entry.pendingFrame = undefined;
      this.restartHelper(entry.display.id, entry, message ?? 'Native refraction reported an error.');
      return;
    } else {
      this.cancelLiveStabilityWindow(entry.display.id);
    }
    this.emitStatus();
  }

  private emitStatus(): void {
    const state = this.getState();
    const serialized = JSON.stringify(state);
    if (serialized === this.lastEmittedState) {
      return;
    }

    this.lastEmittedState = serialized;
    this.callbacks.onStatusChange?.(state);
  }
}
