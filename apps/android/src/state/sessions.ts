import { create } from 'zustand';
import type {
  AgentStatusEvent,
  CreateSessionRequest,
  ModelInfo,
  Project,
  Session,
  SessionEvent,
  SessionStreamEvent,
} from '@omp-console/protocol';
import {
  AgentStatusEventSchema,
  SessionStreamEventSchema,
  TOPICS,
  sessionIdFromTopic,
} from '@omp-console/protocol';
import { ApiClient } from '../api/client';
import { buildUrls } from '../api/url';
import { getRealtimeClient } from './connection';
import { useConnection } from './connection';
import { describeError, type ConnectionError } from './connectionErrors';
import { applySessionEvent } from './sessionEvents';
import { toLiveMessage, type LiveMessage } from './sessionTypes';

/** The opaque stats payload `GET /v1/sessions/:id/stats` returns for a session. */
export type SessionStats = Record<string, unknown>;

/** Transcript page size for the initial backfill and each older page. */
const TRANSCRIPT_PAGE_SIZE = 50;

const NO_SESSION: ConnectionError = {
  code: 'no_token',
  title: 'Not connected',
  message: 'Pair this device and connect before working with sessions.',
  retryable: true,
};

interface SessionsStore {
  projects: Project[];
  sessions: Session[];
  openTabs: string[];
  activeTabId: string | null;
  transcripts: Record<string, LiveMessage[]>;
  /** Opaque cursor for the next older transcript page, per session. */
  transcriptCursors: Record<string, string | null>;
  /** Per-session busy flag driven by agent lifecycle events. */
  busy: Record<string, boolean>;
  /** Per-session pending prompt count from `queue.update` events. */
  queued: Record<string, number>;
  /** Selectable models per session, from `GET /v1/sessions/:id/models`. */
  models: Record<string, ModelInfo[]>;
  /** Session stats and context usage per session, from `GET /v1/sessions/:id/stats`. */
  stats: Record<string, SessionStats>;
  loadingModels: Record<string, boolean>;
  loadingStats: Record<string, boolean>;
  agentStatus: AgentStatusEvent | null;
  loadingProjects: boolean;
  loadingSessions: boolean;
  creating: boolean;
  lastError: ConnectionError | null;

  refreshProjects(): Promise<void>;
  addProject(path: string, name?: string): Promise<boolean>;
  removeProject(id: string): Promise<boolean>;
  refreshSessions(): Promise<void>;
  createSession(input: CreateSessionRequest): Promise<Session | null>;
  openSession(id: string): void;
  closeTab(id: string): void;
  setActive(id: string): void;
  loadTranscript(id: string): Promise<void>;
  loadMore(id: string): Promise<void>;
  sendPrompt(id: string, text: string): Promise<boolean>;
  steer(id: string, message: string): Promise<boolean>;
  followUp(id: string, message: string): Promise<boolean>;
  abort(id: string): Promise<boolean>;
  loadModels(id: string): Promise<void>;
  setModel(id: string, model: string): Promise<boolean>;
  setThinking(id: string, level: string): Promise<boolean>;
  loadStats(id: string): Promise<void>;
  applyEvent(sessionId: string, event: SessionEvent): void;
  applyAgentStatus(status: AgentStatusEvent): void;
  clearError(): void;
}

/** Resolve the API client and token from the live connection, or null. */
function target(): { api: ApiClient; token: string } | null {
  const { token, config } = useConnection.getState();
  if (!token || config.host.trim() === '') return null;
  return { api: new ApiClient(buildUrls(config)), token };
}

function mergeSession(sessions: Session[], session: Session): Session[] {
  const idx = sessions.findIndex(item => item.id === session.id);
  if (idx >= 0) {
    const next = sessions.slice();
    next[idx] = session;
    return next;
  }
  return [session, ...sessions];
}

/** Merge a live status payload into the sessions list, updating and adding. */
function mergeSessions(sessions: Session[], incoming: Session[]): Session[] {
  return incoming.reduce((acc, session) => mergeSession(acc, session), sessions);
}

/** Apply a local model or thinking change to one session, if it is known. */
function patchSession(
  sessions: Session[],
  id: string,
  patch: Partial<Pick<Session, 'model' | 'thinkingLevel'>>,
): Session[] {
  const idx = sessions.findIndex(item => item.id === id);
  if (idx < 0) return sessions;
  const next = sessions.slice();
  next[idx] = { ...next[idx], ...patch };
  return next;
}

/** Prepend older transcript pages, dropping ids already present. */
function prependMessages(existing: LiveMessage[], older: LiveMessage[]): LiveMessage[] {
  const seen = new Set(existing.map(message => message.id));
  const fresh = older.filter(message => !seen.has(message.id));
  return fresh.length > 0 ? [...fresh, ...existing] : existing;
}

export const useSessions = create<SessionsStore>((set, get) => {
  const realtime = getRealtimeClient();
  if (realtime) {
    realtime.onFrame(frame => {
      if (frame.type !== 'event') return;
      if (frame.topic === TOPICS.agentStatus) {
        const parsed = AgentStatusEventSchema.safeParse(frame.data);
        if (parsed.success) get().applyAgentStatus(parsed.data);
        return;
      }
      const sessionId = sessionIdFromTopic(frame.topic);
      if (!sessionId) return;
      const parsed = SessionStreamEventSchema.safeParse(frame.data);
      if (parsed.success) {
        const stream: SessionStreamEvent = parsed.data;
        get().applyEvent(stream.sessionId, stream.event);
      }
    });
  }

  return {
    projects: [],
    sessions: [],
    openTabs: [],
    activeTabId: null,
    transcripts: {},
    transcriptCursors: {},
    busy: {},
    queued: {},
    models: {},
    stats: {},
    loadingModels: {},
    loadingStats: {},
    agentStatus: null,
    loadingProjects: false,
    loadingSessions: false,
    creating: false,
    lastError: null,

    async refreshProjects() {
      const live = target();
      if (!live) {
        set({ loadingProjects: false, lastError: NO_SESSION });
        return;
      }
      set({ loadingProjects: true, lastError: null });
      try {
        const result = await live.api.projects(live.token);
        set({ projects: result.projects, loadingProjects: false });
      } catch (error) {
        set({ loadingProjects: false, lastError: describeError(error) });
      }
    },

    async addProject(path, name) {
      const trimmed = path.trim();
      if (trimmed === '') return false;
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        const result = await live.api.addProject(live.token, trimmed, name?.trim() || undefined);
        set(state => ({
          projects: state.projects.some(project => project.id === result.project.id)
            ? state.projects
            : [...state.projects, result.project],
        }));
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async removeProject(id) {
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.removeProject(live.token, id);
        set(state => ({ projects: state.projects.filter(project => project.id !== id) }));
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async refreshSessions() {
      const live = target();
      if (!live) {
        set({ loadingSessions: false, lastError: NO_SESSION });
        return;
      }
      set({ loadingSessions: true, lastError: null });
      try {
        const result = await live.api.sessions(live.token);
        set({ sessions: result.sessions, loadingSessions: false });
      } catch (error) {
        set({ loadingSessions: false, lastError: describeError(error) });
      }
    },

    async createSession(input) {
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return null;
      }
      set({ creating: true, lastError: null });
      try {
        const result = await live.api.createSession(live.token, input);
        set(state => ({ creating: false, sessions: mergeSession(state.sessions, result.session) }));
        get().openSession(result.session.id);
        return result.session;
      } catch (error) {
        set({ creating: false, lastError: describeError(error) });
        return null;
      }
    },

    openSession(id) {
      set(state => ({
        openTabs: state.openTabs.includes(id) ? state.openTabs : [...state.openTabs, id],
        activeTabId: id,
      }));
      getRealtimeClient()?.subscribeSession(id);
      // A deep link can name a session the recent list has not loaded yet.
      if (!get().sessions.some(session => session.id === id)) void get().refreshSessions();
      if (get().transcripts[id]) return;
      void get().loadTranscript(id);
    },

    closeTab(id) {
      set(state => {
        const openTabs = state.openTabs.filter(tab => tab !== id);
        const activeTabId =
          state.activeTabId === id ? (openTabs[openTabs.length - 1] ?? null) : state.activeTabId;
        return { openTabs, activeTabId };
      });
      getRealtimeClient()?.unsubscribeSession(id);
    },

    setActive(id) {
      set({ activeTabId: id });
    },

    async loadTranscript(id) {
      const live = target();
      if (!live) return;
      try {
        const result = await live.api.messages(live.token, id, { limit: TRANSCRIPT_PAGE_SIZE });
        // Do not clobber live events that arrived while the backfill was in
        // flight; the first writer wins for a given session.
        set(state =>
          state.transcripts[id]
            ? state
            : {
                transcripts: { ...state.transcripts, [id]: result.messages.map(toLiveMessage) },
                transcriptCursors: { ...state.transcriptCursors, [id]: result.nextCursor },
              },
        );
      } catch (error) {
        set({ lastError: describeError(error) });
      }
    },

    async loadMore(id) {
      const live = target();
      if (!live) return;
      const cursor = get().transcriptCursors[id];
      if (!cursor) return;
      try {
        const result = await live.api.messages(live.token, id, {
          cursor,
          limit: TRANSCRIPT_PAGE_SIZE,
        });
        set(state => ({
          transcripts: {
            ...state.transcripts,
            [id]: prependMessages(state.transcripts[id] ?? [], result.messages.map(toLiveMessage)),
          },
          transcriptCursors: { ...state.transcriptCursors, [id]: result.nextCursor },
        }));
      } catch (error) {
        set({ lastError: describeError(error) });
      }
    },

    async sendPrompt(id, text) {
      const trimmed = text.trim();
      if (trimmed === '') return false;
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.prompt(live.token, id, trimmed);
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async steer(id, message) {
      const trimmed = message.trim();
      if (trimmed === '') return false;
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.steer(live.token, id, trimmed);
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async followUp(id, message) {
      const trimmed = message.trim();
      if (trimmed === '') return false;
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.followUp(live.token, id, trimmed);
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async abort(id) {
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.abort(live.token, id);
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async loadModels(id) {
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return;
      }
      set(state => ({ loadingModels: { ...state.loadingModels, [id]: true } }));
      try {
        const result = await live.api.models(live.token, id);
        set(state => ({
          models: { ...state.models, [id]: result.models },
          loadingModels: { ...state.loadingModels, [id]: false },
        }));
      } catch (error) {
        set(state => ({
          loadingModels: { ...state.loadingModels, [id]: false },
          lastError: describeError(error),
        }));
      }
    },

    async setModel(id, model) {
      const trimmed = model.trim();
      if (trimmed === '') return false;
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.setModel(live.token, id, trimmed);
        set(state => ({ sessions: patchSession(state.sessions, id, { model: trimmed }) }));
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async setThinking(id, level) {
      const trimmed = level.trim();
      if (trimmed === '') return false;
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return false;
      }
      set({ lastError: null });
      try {
        await live.api.setThinking(live.token, id, trimmed);
        set(state => ({ sessions: patchSession(state.sessions, id, { thinkingLevel: trimmed }) }));
        return true;
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    },

    async loadStats(id) {
      const live = target();
      if (!live) {
        set({ lastError: NO_SESSION });
        return;
      }
      set(state => ({ loadingStats: { ...state.loadingStats, [id]: true } }));
      try {
        const result = await live.api.stats(live.token, id);
        set(state => ({
          stats: { ...state.stats, [id]: result.stats },
          loadingStats: { ...state.loadingStats, [id]: false },
        }));
      } catch (error) {
        set(state => ({
          loadingStats: { ...state.loadingStats, [id]: false },
          lastError: describeError(error),
        }));
      }
    },

    applyEvent(sessionId, event) {
      set(state => {
        const messages = state.transcripts[sessionId] ?? [];
        const result = applySessionEvent(messages, event);
        const next: Partial<SessionsStore> = {
          transcripts: { ...state.transcripts, [sessionId]: result.messages },
        };
        if (result.busy !== undefined) {
          next.busy = { ...state.busy, [sessionId]: result.busy };
        }
        if (result.queued !== undefined) {
          next.queued = { ...state.queued, [sessionId]: result.queued };
        }
        return next;
      });
    },

    applyAgentStatus(status) {
      set(state => ({
        agentStatus: status,
        sessions: mergeSessions(state.sessions, status.sessions),
      }));
    },

    clearError() {
      set({ lastError: null });
    },
  };
});
