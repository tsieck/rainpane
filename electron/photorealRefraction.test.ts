import type { BrowserWindow, Display } from 'electron';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/tmp/rainpane-test',
  },
}));

import {
  HELPER_LIVE_STABILITY_MS,
  MAX_HELPER_RESTART_ATTEMPTS,
  PhotorealRefractionManager,
  aggregatePhotorealRefractionStatus,
  canSubmitPhotorealRefractionGeometry,
  getPhotorealRefractionDisplayIdForSender,
  getPhotorealRefractionDisplaySignature,
  getPhotorealRefractionRestartDelay,
  getPhotorealRefractionStatusForDisplay,
  parsePhotorealRefractionStatusLine,
} from './photorealRefraction.js';

class MockHelperProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kill = vi.fn((signal: NodeJS.Signals = 'SIGTERM') => {
    this.signalCode = signal;
    return true;
  });

  close(code = 0, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('close', code, signal);
  }
}

function display(overrides: Partial<Display> = {}): Display {
  return {
    id: 7,
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    nativeOrigin: { x: 0, y: 0 },
    size: { width: 1440, height: 900 },
    scaleFactor: 2,
    rotation: 0,
    ...overrides,
  } as Display;
}

function overlay(screen: Display, senderWebContentsId = 101) {
  return {
    display: screen,
    window: {
      isDestroyed: () => false,
      webContents: { id: senderWebContentsId },
    } as unknown as BrowserWindow,
  };
}

function managerHarness() {
  const children: MockHelperProcess[] = [];
  const manager = new PhotorealRefractionManager({}, {
    platform: 'darwin',
    systemVersion: '15.5',
    helperPath: () => '/tmp/rainpane-refraction-helper',
    spawnHelper: (() => {
      const child = new MockHelperProcess();
      children.push(child);
      return child as unknown as ChildProcessWithoutNullStreams;
    }) as typeof import('node:child_process').spawn,
  });
  return { children, manager };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('photoreal refraction lifecycle helpers', () => {
  it('parses helper status lines and rejects unrelated output', () => {
    expect(parsePhotorealRefractionStatusLine('{"type":"status","status":"paused","message":"  idle  "}'))
      .toEqual({ status: 'paused', message: 'idle' });
    expect(parsePhotorealRefractionStatusLine('{"type":"log","status":"live"}')).toBeNull();
    expect(parsePhotorealRefractionStatusLine('not json')).toBeNull();
  });

  it('preserves capture-free and idle states in aggregate status', () => {
    expect(aggregatePhotorealRefractionStatus(false, true, true, [])).toBe('off');
    expect(aggregatePhotorealRefractionStatus(true, false, true, [
      { displayId: 7, status: 'live' },
    ])).toBe('paused');
    expect(aggregatePhotorealRefractionStatus(true, true, true, [
      { displayId: 7, status: 'paused' },
    ])).toBe('paused');
    expect(aggregatePhotorealRefractionStatus(true, true, true, [
      { displayId: 7, status: 'live' },
      { displayId: 8, status: 'starting' },
    ])).toBe('starting');
    expect(aggregatePhotorealRefractionStatus(true, true, true, [
      { displayId: 7, status: 'live' },
      { displayId: 8, status: 'paused' },
    ])).toBe('live');
  });

  it('never hides a permission failure behind pause or startup', () => {
    expect(aggregatePhotorealRefractionStatus(true, false, true, [
      { displayId: 7, status: 'permission-needed' },
      { displayId: 8, status: 'starting' },
    ])).toBe('permission-needed');
  });

  it('routes mixed helper states to each overlay while keeping the aggregate for settings', () => {
    const displays = [
      { displayId: 7, status: 'live' as const },
      { displayId: 8, status: 'starting' as const },
    ];
    const state = {
      enabled: true,
      visible: true,
      status: aggregatePhotorealRefractionStatus(true, true, true, displays),
      displays,
    };
    const overlays = [overlay(display({ id: 7 }), 101), overlay(display({ id: 8 }), 202)];

    expect(state.status).toBe('starting');
    expect(getPhotorealRefractionStatusForDisplay(state)).toBe('starting');
    expect(getPhotorealRefractionStatusForDisplay(
      state,
      getPhotorealRefractionDisplayIdForSender(overlays, 101),
    )).toBe('live');
    expect(getPhotorealRefractionStatusForDisplay(
      state,
      getPhotorealRefractionDisplayIdForSender(overlays, 202),
    )).toBe('starting');
    expect(getPhotorealRefractionStatusForDisplay(
      state,
      getPhotorealRefractionDisplayIdForSender(overlays, 999),
    )).toBe('starting');
  });

  it('applies global disabled and hidden states before a stale live helper state', () => {
    const displays = [{ displayId: 7, status: 'live' as const }];

    expect(getPhotorealRefractionStatusForDisplay({
      enabled: false,
      visible: true,
      status: 'off',
      displays,
    }, 7)).toBe('off');
    expect(getPhotorealRefractionStatusForDisplay({
      enabled: true,
      visible: false,
      status: 'paused',
      displays,
    }, 7)).toBe('paused');
  });

  it('uses capped exponential helper restart delays', () => {
    expect(Array.from({ length: MAX_HELPER_RESTART_ATTEMPTS }, (_, index) => (
      getPhotorealRefractionRestartDelay(index + 1)
    ))).toEqual([250, 500, 1_000, 2_000]);
    expect(getPhotorealRefractionRestartDelay(99)).toBe(2_000);
    expect(getPhotorealRefractionRestartDelay(-3)).toBe(250);
  });

  it('keeps geometry flowing during startup and idle wakeup, but not permission failure', () => {
    expect(canSubmitPhotorealRefractionGeometry('starting')).toBe(true);
    expect(canSubmitPhotorealRefractionGeometry('live')).toBe(true);
    expect(canSubmitPhotorealRefractionGeometry('paused')).toBe(true);
    expect(canSubmitPhotorealRefractionGeometry('permission-needed')).toBe(false);
    expect(canSubmitPhotorealRefractionGeometry('error')).toBe(false);
    expect(canSubmitPhotorealRefractionGeometry('off')).toBe(false);
  });

  it('restarts for geometry, scale, or rotation changes', () => {
    const baseline = getPhotorealRefractionDisplaySignature(display());
    expect(getPhotorealRefractionDisplaySignature(display())).toBe(baseline);
    expect(getPhotorealRefractionDisplaySignature(display({ scaleFactor: 1 }))).not.toBe(baseline);
    expect(getPhotorealRefractionDisplaySignature(display({ rotation: 90 }))).not.toBe(baseline);
    expect(getPhotorealRefractionDisplaySignature(display({
      bounds: { x: 0, y: 0, width: 900, height: 1440 },
      size: { width: 900, height: 1440 },
    }))).not.toBe(baseline);
  });

  it('routes geometry by sender and shuts the helper down when disabled', async () => {
    const { children, manager } = managerHarness();
    manager.sync({ enabled: true, visible: true, overlays: [overlay(display(), 101)] });
    expect(children).toHaveLength(1);

    const input: string[] = [];
    children[0].stdin.on('data', (chunk) => input.push(String(chunk)));
    children[0].stdout.write('{"type":"status","status":"live"}\n');

    const frame = { width: 100, height: 80, droplets: [{ x: 10, y: 12, radius: 4 }] };
    expect(manager.submitFrame(999, frame)).toBe(false);
    expect(manager.submitFrame(101, frame)).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(input.join('')).toContain('"type":"frame"');

    manager.sync({ enabled: false, visible: false, overlays: [] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(manager.getState().status).toBe('off');
    expect(input.join('')).toContain('"type":"shutdown"');
  });

  it('does not launch the macOS 13 helper on an older macOS release', () => {
    const spawnHelper = vi.fn();
    const manager = new PhotorealRefractionManager({}, {
      platform: 'darwin',
      systemVersion: '12.7.6',
      helperPath: () => '/tmp/rainpane-refraction-helper',
      spawnHelper: spawnHelper as unknown as typeof import('node:child_process').spawn,
    });

    manager.sync({ enabled: true, visible: true, overlays: [overlay(display(), 101)] });

    expect(spawnHelper).not.toHaveBeenCalled();
    expect(manager.getState()).toMatchObject({
      enabled: true,
      visible: true,
      status: 'unsupported',
      displays: [{ displayId: 7, status: 'unsupported' }],
    });
    manager.stop();
  });

  it('restarts changed displays without overlap and resets retries only after stable live time', () => {
    vi.useFakeTimers();
    const { children, manager } = managerHarness();
    const initial = overlay(display(), 101);
    manager.sync({ enabled: true, visible: true, overlays: [initial] });
    expect(children).toHaveLength(1);

    children[0].stdout.write('{"type":"status","status":"live"}\n');
    const resized = overlay(display({ scaleFactor: 1 }), 101);
    manager.sync({ enabled: true, visible: true, overlays: [resized] });
    expect(children).toHaveLength(1);

    children[0].close();
    vi.advanceTimersByTime(0);
    expect(children).toHaveLength(2);

    children[1].stdout.write('{"type":"status","status":"live"}\n');
    vi.advanceTimersByTime(HELPER_LIVE_STABILITY_MS - 1);
    children[1].close(1);
    vi.advanceTimersByTime(499);
    expect(children).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(children).toHaveLength(3);

    children[2].stdout.write('{"type":"status","status":"live"}\n');
    vi.advanceTimersByTime(HELPER_LIVE_STABILITY_MS);
    children[2].close(1);
    vi.advanceTimersByTime(249);
    expect(children).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(children).toHaveLength(4);

    manager.stop();
  });

  it('cancels recovery timers on disable and never retries permission-needed', () => {
    vi.useFakeTimers();

    const permissionHarness = managerHarness();
    permissionHarness.manager.sync({
      enabled: true,
      visible: true,
      overlays: [overlay(display(), 101)],
    });
    permissionHarness.children[0].stdout.write(
      '{"type":"status","status":"permission-needed"}\n',
    );
    permissionHarness.children[0].close(1);
    vi.advanceTimersByTime(10_000);
    expect(permissionHarness.children).toHaveLength(1);
    permissionHarness.manager.stop();

    const recoveryHarness = managerHarness();
    recoveryHarness.manager.sync({
      enabled: true,
      visible: true,
      overlays: [overlay(display(), 202)],
    });
    recoveryHarness.children[0].close(1);
    recoveryHarness.manager.stop();
    vi.advanceTimersByTime(10_000);
    expect(recoveryHarness.children).toHaveLength(1);
    expect(recoveryHarness.manager.getState().status).toBe('off');
  });
});
