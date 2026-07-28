export interface CaptureAvailabilityState {
  systemIsSuspended: boolean;
  screenIsLocked: boolean;
}

export type CaptureAvailabilityEvent = 'suspend' | 'resume' | 'lock' | 'unlock';

export const AVAILABLE_CAPTURE_STATE: CaptureAvailabilityState = {
  systemIsSuspended: false,
  screenIsLocked: false,
};

export function reduceCaptureAvailability(
  state: CaptureAvailabilityState,
  event: CaptureAvailabilityEvent,
): CaptureAvailabilityState {
  switch (event) {
    case 'suspend':
      return state.systemIsSuspended ? state : { ...state, systemIsSuspended: true };
    case 'resume':
      return state.systemIsSuspended ? { ...state, systemIsSuspended: false } : state;
    case 'lock':
      return state.screenIsLocked ? state : { ...state, screenIsLocked: true };
    case 'unlock':
      return state.screenIsLocked ? { ...state, screenIsLocked: false } : state;
  }
}

export function systemAllowsCapture(state: CaptureAvailabilityState) {
  return !state.systemIsSuspended && !state.screenIsLocked;
}
