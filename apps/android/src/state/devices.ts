import { create } from 'zustand';
import type { DeviceSummary } from '@omp-console/protocol';
import { ApiClient } from '../api/client';
import { buildUrls } from '../api/url';
import { useConnection } from './connection';
import { describeError, type ConnectionError } from './connectionErrors';

const NO_SESSION: ConnectionError = {
  code: 'no_token',
  title: 'Not connected',
  message: 'Pair this device and connect before managing devices.',
  retryable: true,
};

interface DevicesStore {
  devices: DeviceSummary[];
  loading: boolean;
  /** Device id with an in-flight action, for per-row spinners. */
  busyId: string | null;
  error: ConnectionError | null;

  refresh(): Promise<void>;
  rename(id: string, name: string): Promise<boolean>;
  revoke(id: string): Promise<boolean>;
  rotate(id: string): Promise<boolean>;
  clearError(): void;
  reset(): void;
}

/** Resolve the API client and token from the live connection, or null. */
function target(): { api: ApiClient; token: string } | null {
  const { token, config } = useConnection.getState();
  if (!token || config.host.trim() === '') return null;
  return { api: new ApiClient(buildUrls(config)), token };
}

export const useDevices = create<DevicesStore>((set, get) => ({
  devices: [],
  loading: false,
  busyId: null,
  error: null,

  async refresh() {
    const live = target();
    if (!live) {
      set({ loading: false, error: NO_SESSION });
      return;
    }
    set({ loading: true, error: null });
    try {
      const result = await live.api.devices(live.token);
      set({ devices: result.devices, loading: false });
    } catch (error) {
      set({ loading: false, error: describeError(error) });
    }
  },

  async rename(id, name) {
    const trimmed = name.trim();
    if (trimmed === '') return false;
    const live = target();
    if (!live) {
      set({ error: NO_SESSION });
      return false;
    }
    set({ busyId: id, error: null });
    try {
      const result = await live.api.renameDevice(live.token, id, trimmed);
      set({ devices: result.devices, busyId: null });
      return true;
    } catch (error) {
      set({ busyId: null, error: describeError(error) });
      return false;
    }
  },

  async revoke(id) {
    const live = target();
    if (!live) {
      set({ error: NO_SESSION });
      return false;
    }
    set({ busyId: id, error: null });
    try {
      const result = await live.api.revokeDevice(live.token, id);
      set({ devices: result.devices, busyId: null });
      return true;
    } catch (error) {
      set({ busyId: null, error: describeError(error) });
      return false;
    }
  },

  /**
   * Rotation is only offered for the current device, so the new token can be
   * stored immediately. Rotating another phone would strand its old token with
   * no way to deliver the new one.
   */
  async rotate(id) {
    const live = target();
    if (!live) {
      set({ error: NO_SESSION });
      return false;
    }
    set({ busyId: id, error: null });
    try {
      const result = await live.api.rotateDevice(live.token, id);
      if (useConnection.getState().deviceId === id) {
        await useConnection.getState().updateToken(result.deviceToken);
      }
      set({ busyId: null });
      await get().refresh();
      return true;
    } catch (error) {
      set({ busyId: null, error: describeError(error) });
      return false;
    }
  },

  clearError() {
    set({ error: null });
  },

  reset() {
    set({ devices: [], loading: false, busyId: null, error: null });
  },
}));