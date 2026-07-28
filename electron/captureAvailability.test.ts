import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_CAPTURE_STATE,
  reduceCaptureAvailability,
  systemAllowsCapture,
  type CaptureAvailabilityEvent,
} from './captureAvailability';

function run(events: readonly CaptureAvailabilityEvent[]) {
  return events.reduce(reduceCaptureAvailability, AVAILABLE_CAPTURE_STATE);
}

describe('capture availability', () => {
  it('stays paused until lock and suspend have both cleared', () => {
    const afterResume = run(['lock', 'suspend', 'resume']);
    expect(afterResume).toEqual({ systemIsSuspended: false, screenIsLocked: true });
    expect(systemAllowsCapture(afterResume)).toBe(false);
    expect(systemAllowsCapture(reduceCaptureAvailability(afterResume, 'unlock'))).toBe(true);
  });

  it('handles the inverse event order without resuming early', () => {
    const afterUnlock = run(['suspend', 'lock', 'unlock']);
    expect(afterUnlock).toEqual({ systemIsSuspended: true, screenIsLocked: false });
    expect(systemAllowsCapture(afterUnlock)).toBe(false);
    expect(systemAllowsCapture(reduceCaptureAvailability(afterUnlock, 'resume'))).toBe(true);
  });

  it('treats duplicate operating-system events as idempotent', () => {
    expect(run(['lock', 'lock', 'unlock', 'unlock', 'suspend', 'suspend', 'resume', 'resume']))
      .toEqual(AVAILABLE_CAPTURE_STATE);
  });
});
