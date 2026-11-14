import type { RealtimeStatus } from '../../realtime/client';
import type { ConnectionError } from '../../state/connectionErrors';
import type { StatusState } from '../../ui/components';

export interface LiveStatus {
  state: StatusState;
  sentence: string;
  connected: boolean;
}

/**
 * One place that turns the realtime status and the last error into the compact
 * live element the shell shows. Mirrors the old Home screen's mapping.
 */
export function liveStatus(
  realtime: RealtimeStatus,
  lastError: ConnectionError | null,
  serverName: string,
): LiveStatus {
  const connected = realtime.state === 'connected';
  const connecting = realtime.state === 'connecting' || realtime.state === 'reconnecting';
  const state: StatusState = connected
    ? 'live'
    : connecting
      ? 'connecting'
      : lastError
        ? 'error'
        : 'offline';

  const sentence = connected
    ? `Connected to ${serverName}`
    : connecting
      ? 'Connecting to your server'
      : lastError
        ? 'Cannot reach your server'
        : 'Not connected';

  return { state, sentence, connected };
}
