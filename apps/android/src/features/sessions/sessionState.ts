import type { SessionState } from '@omp-console/protocol';

/** A plain word for each session state. Never a raw wire value. */
export function sessionStateLabel(state: SessionState): string {
  switch (state) {
    case 'starting':
      return 'Starting';
    case 'ready':
      return 'Ready';
    case 'busy':
      return 'Working';
    case 'stopped':
      return 'Stopped';
    case 'crashed':
      return 'Crashed';
    case 'failed':
      return 'Failed';
    default:
      return state;
  }
}

/** Colour role for a state word rendered as text rather than a chip. */
export type SessionStateTone = 'muted' | 'live' | 'danger';

export function sessionStateTone(state: SessionState): SessionStateTone {
  if (state === 'crashed' || state === 'failed') return 'danger';
  if (state === 'busy' || state === 'starting') return 'live';
  return 'muted';
}
