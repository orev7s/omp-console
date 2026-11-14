# Phase 5 report - Agent sessions and the live run view

Status: Built, 2026-11-11. Backend and agent host are covered by a 70-test and a
20-test suite; the app typechecks, has a 71-test Jest suite, and builds for the
web. The browser harness was not executed and no Android device was used.
Runtime: Node.js 26.13.1. Real `omp` v18.18.9.

## What shipped

Protocol:

- `packages/protocol/src/sessions.ts`: the L1 contract. Session, Message, and
  Project schemas; the prompt, abort, model, thinking, stats, steer, and
  follow-up request and response shapes; the normalized `SessionEvent` union
  (including `queue.update`); and `AgentStatusEvent`, which now carries the
  session list.
- `packages/protocol/src/ws.ts`: `agent.status`, the dynamic
  `session:<id>.events` topic (`sessionEventTopic`, `topicRequiredScope`), and a
  `read` scope gate for session streams.

Control plane:

- `apps/backend/src/sessions/registry.ts`: an in-memory view of sessions and
  transcripts, fed only by L2 events and the create response. It is a
  reconstructable cache, not durable state.
- `apps/backend/src/sessions/events.ts`: the single L2 to L1 translation point.
- Routes: `GET /v1/projects`, `POST /v1/projects`, `DELETE /v1/projects/:id`
  (list, add, remove); `GET /v1/sessions`, `POST /v1/sessions`,
  `GET /v1/sessions/:id`, `POST /v1/sessions/:id/prompt`,
  `POST /v1/sessions/:id/abort`, `GET /v1/sessions/:id/messages` (cursor and
  `limit`), `GET /v1/sessions/:id/models`, `POST /v1/sessions/:id/model`,
  `POST /v1/sessions/:id/thinking`, `GET /v1/sessions/:id/stats`,
  `POST /v1/sessions/:id/steer`, `POST /v1/sessions/:id/follow-up`. Scopes are
  `read` for reads, `agent` for create, prompt, abort, model, thinking, steer,
  and follow-up, and `manage` for project changes. Agent-dependent routes return
  a retryable 503 `agent_unavailable` when L2 is down.
- Store schema v3 adds a project registry, migrated in place from v2.
- WebSocket: `agent.status` (with the session list) and `session:<id>.events`
  are broadcast to subscribers; session topics are scope-gated.

Agent host:

- `SessionInfo` gained `title`. A session is named from the first user message
  (one line, 80 chars) when no name is set, and the change is emitted.
- `session.messages` and `session.messagesPage` over L2: best-effort
  `get_messages` and `get_messages_page` calls normalized through the existing
  mapper. They return `[]` and a null cursor on any error or unexpected shape.
- Model and thinking controls: `session.availableModels`, `session.setModel`,
  and `session.setThinking`, backed by `get_available_models`, `set_model`, and
  `set_thinking_level`.
- `session.stats`, `session.steer`, and `session.followUp`, backed by
  `get_session_stats`, `steer`, and `follow_up`.
- `queue.update`, translated from OMP's `queue_update`.

App (`apps/android`):

- Session-first shell per ADR 0008. `Home` is retired; the routes are `Sessions`
  (landing) and `Session`, with `Devices`, `Connection`, and `Activity` moved
  into a settings sheet. Onboarding is unchanged.
- Landing: compact live status, projects with add and remove, recent sessions
  grouped Today / Yesterday / Earlier (title with the folder as subtitle), and a
  New session primary action.
- Live run view: an in-app tab strip for open sessions, a header with title,
  folder, state, and Abort, a streaming transcript, and a prompt composer.
- Density UI pass: transcript text on the compact type scale (`bodySm`,
  `bodySmStrong`, `title3`), the dense row-height tokens (`row.compact`,
  `row.tab`, `row.dense`, `row.settings`), a `Markdown` component for assistant and user
  messages (paragraphs, headings, lists, fenced code, links, bold, italic, and
  inline code), and `Collapsible` blocks for thinking (`Thought`) and tool calls
  (`Ran bash`, `Tool read`) with the status as a word inside. No icons beyond
  the brand mark and the abstract functional glyphs.
- `state/sessions.ts` plus pure helpers for the event reducer and recency
  grouping; one WebSocket client with runtime subscribe/unsubscribe that
  survives reconnect. The store and the API client expose prompt, abort, steer,
  follow-up, model, thinking, stats, and transcript paging; the run view wires
  prompt and abort today.

## Verification

Backend and protocol behavior runs with `npm run test:all`; the app suite runs
with `npm test` from `apps/android`. The backend suite holds 70 tests (up from
55) and the agent host 20; the app adds 71 Jest tests. The agent host suite still
runs the real `omp`, bubblewrap, the L2 socket, and the reconnect tests.

This documentation pass did not rerun the suites, so the newest backend test
files (`session-controls`, `session-live`) and the app Jest tests have not been
rerun here; the last recorded run passed at 55 backend and 20 agent host.

New backend coverage:

- `session-controls.test.ts` (13): model list (empty and passthrough), set model,
  set thinking, stats, steer, and follow-up, each passed through to the agent
  host; transcript paging with `limit` and `cursor`; an out-of-range `limit`
  rejected; 404 for the control routes on an unknown session; scope enforcement
  (a read-only device is refused on agent control routes and allowed on models
  and stats); a retryable 503 for agent-dependent routes.
- `session-live.test.ts` (2): a `queue.update` streamed on the session topic and
  recorded in the registry; `agent.status` broadcast with the session list when a
  session state changes.
- `sessions.test.ts` (11): create, list, get, prompt, and abort; `projectId`
  resolved to the project path as `cwd`; agent title precedence over the created
  name; 404 for an unknown session; a session event streamed on its topic and
  folded into the transcript; best-effort backfill; scope enforcement; an empty
  list without an agent host; a retryable 503 on create; and session-topic scope
  gating.
- `projects.test.ts` (8): list, add with path resolution and a default name,
  dedupe by resolved path, an explicit name, a non-directory path rejected,
  remove, scope enforcement, and the v2 to v3 store migration.

New app coverage (Jest): the pure session event reducer (26), recency grouping
(10), session type helpers (6), and the API client request shapes (12).

## Completion criteria

Met on the backend, the agent host, and the app build:

- Create a session and drive it: `POST /v1/sessions` then prompt and abort,
  covered by tests.
- Stream a real run: L2 session events are translated to L1 and broadcast on the
  session topic, covered by tests.
- The app renders the landing, tabs, and run view and typechecks, has a Jest
  suite, and builds.

Not demonstrated:

- A browser end-to-end run of the new shell. The harness spec was updated to the
  session-first flow but was not executed, so no claim is made about the live UI.
- A real device or emulator.

## Deferred within Phase 5 (built APIs and store, no app UI yet)

- Model and thinking-level selectors, and the session stats or context display.
  The API, the L2 calls, and the store methods exist; no screen control calls
  them.
- Steer and follow-up controls, and the queue display. `queue.update` is stored
  and the run view's busy state is live, but no control or count is shown.
- Transcript load-more. The store pages with a cursor, but the run view has no
  control to fetch older pages.
- Replay-based resume over WebSocket. The server assigns a per-topic sequence
  number but holds no replay buffer, so a reconnecting client re-subscribes and
  refetches transcripts over REST.
- The landing list does not update live from `agent.status`; it refreshes on load
  and on session create.

## Known gaps

- The registry is in memory. A control-plane restart drops transcripts until the
  session streams again or the REST backfill reads them from `omp`.
- Backfill depends on `omp`'s `get_messages` shape and is best effort; it is not
  covered by a content assertion, only by the fallback path.
- The browser build still keeps the device token in `localStorage` (ADR 0005).
  Pre-existing, unchanged.

## Next

Surface the controls the backend and store already expose: model and thinking
selectors, session stats, steer, follow-up, the queue count, and transcript
load-more. Then a browser run of the new shell. Phase 6 (supervision and
monitoring) can reuse the session registry and the `agent.status` topic.
