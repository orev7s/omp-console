# 0008 - Session-first shell and in-app session tabs

Status: Accepted (Phase 5). Decided 2026-11-11.
Date: 2026-11-11

## Context

Phases 1 to 4 built connectivity, the installer, enrollment, and the agent host.
The app shell today is connection-centric: after onboarding the user lands on
`Home`, which confirms the connection, shows the server and agent state, and links
out to Devices, Connection, and Activity. That shape made sense while reaching the
server was the whole product.

Phase 5 makes agent sessions the product surface: create a session, open it,
watch a real run with live tool calls, and steer it. The shell has to change from
connection-centric to session-centric, or sessions end up buried behind a
connection screen.

Reference: the OpenCode V2 app (repo `sst/opencode`, branch `2.0`), read from the
source. What it actually does, so the parts we copy and the parts we change are
explicit:

- Shell is a `w-16` icon rail pinned left (`packages/app/src/pages/layout/sidebar-shell.tsx`).
  The rail holds project tiles drawn as avatars (`sidebar-items.tsx`, `ProjectIcon`),
  draggable to reorder, a `+` to open a project, and at the bottom a settings gear
  and a help icon.
- Selecting a project expands a panel beside the rail (`sidebar-project.tsx`,
  `sidebar-workspace.tsx`) listing that project's sessions, grouped by workspace
  (local or sandbox) and sorted by recency, with a New session item and a Load more
  control. With the rail collapsed, hovering a project shows a preview card with
  the two most recent sessions.
- A session row (`sidebar-items.tsx`, `SessionItem` and `SessionRow`) is a title
  plus a status mark shown only when needed: a spinner while working, dots for a
  pending permission, an error, or unseen output. Rows link to
  `/{slug}/session/{id}`.
- The landing is `pages/home.tsx`: a centered page with the logo, a server button
  carrying a health dot, and a "Recent projects" list of up to five projects with
  relative times.
- Day buckets are not in the web app. The Today / Yesterday / date grouping is in
  the TUI session dialog
  (`packages/opencode/src/cli/cmd/tui/component/dialog-session-list.tsx`), which
  buckets by `date.toDateString()` and relabels today as "Today". The web app
  groups by project and workspace instead.
- Tabs (`packages/ui/src/components/tabs.tsx`, a Kobalte primitive with normal,
  alt, pill, and settings variants) are used in-session: on mobile a two-way
  Session and Changes strip (`pages/session.tsx`), and for file tabs
  (`components/session/session-sortable-tab.tsx`, draggable and closable). OpenCode
  does not tab sessions; sessions are routes.
- OpenCode uses an icon set throughout (plus, settings-gear, help, new-session,
  archive, dot-grid, branch, chevrons).

Two parts of our design are adaptations, not copies. Our session list sits on the
landing itself, because we have no project registry until Phase 7. And we apply
the tab pattern to open sessions rather than to files.

One UI, two packages. The same React Native screens render in the browser build
and the Android build. The browser is the acceptance surface and no APK is
produced (ADR 0005). The layout stays mobile-first; the browser is the same UI,
not a desktop fork. Tabs are a horizontal, scrollable strip, not desktop browser
chrome.

## Decision

1. The landing is session-first. When no session is open, the app shows a session
   list grouped by recency (Today, Yesterday, Earlier, the TUI pattern). Each row
   shows the session title and the project folder it ran in. Rows carry no icon,
   except the transient working spinner and the unseen or error dot, which are
   state, not decoration.

2. Open sessions live in an in-app tab strip across the top of the session view.
   Tapping a tab switches sessions without losing state. The strip scrolls
   horizontally when it overflows. Tabs are a session switcher, not routes; the
   open-tab set and active tab are app state, not router state. This is our
   adaptation of the OpenCode tab primitive, which OpenCode uses for files and
   sections.

3. The connection-centric `Home` is retired. Connection status becomes a compact
   live element in the shell chrome (the live node plus the server name). The
   full server details, Devices, Connection, and Activity move into a settings
   sheet reachable from a corner control, matching the settings control at the
   foot of the OpenCode rail. Onboarding (Welcome, Connect, Pair) is unchanged.

4. New session is the single primary action on the landing, so creating a session
   is always one tap from the list.

5. No project rail in Phase 5. The OpenCode rail is project-based, and we have no
   project registry until Phase 7. Until then the landing is the selector. The
   rail arrives with the project registry.

6. Icons: the app ships no icon set beyond the brand mark and the abstract,
   functional glyphs already defined (chevron, check, close, spinner, warning,
   info). No per-session icons, no agent avatars, no navigation pictograms, no
   emoji. Rows, tabs, and actions are labeled with words. This is a deliberate
   divergence from OpenCode, which uses an icon set throughout.

7. Navigation stays on the existing `AppNavigation` contract. The router gains a
   `Sessions` route (the landing) and a `Session` route (renders the active tab).
   The tab set itself lives in a session store.

## Alternatives

- Keep `Home` and branch sessions off it: rejected. It makes a connection screen
  the center of a coding product and puts the session list two taps deep.
- Copy the OpenCode rail now (project avatars plus a project-scoped session
  panel): rejected for Phase 5. It needs a project registry that does not exist
  until Phase 7, so the rail would have one tile and no meaning. Deferred to
  Phase 7 with the registry.
- A fixed bottom navigation bar (Sessions, Monitor, Files, Terminal): rejected
  for now. Those sections do not all exist yet, and a fixed bar fixes the shape
  before the features are real. Revisit when monitoring and files land.
- Literal browser tabs (multiple documents): not applicable. This is one app and
  the tabs are a session switcher.

## Consequences

- `apps/android/src/app/navigationTypes.ts` changes: `Home` becomes `Sessions`
  plus a `Session` route; `Devices`, `Connection`, and `Debug` move under a
  settings sheet.
- A new session store (open tabs, active tab) is needed, separate from the
  server-state cache.
- The `Home` connection-detail block and the "sessions are coming later" info
  banner are retired.
- The landing depends on the Phase 5 backend session endpoints. Until those
  exist, the landing lists nothing.
- The project rail and the per-project grouping from OpenCode are Phase 7
  (project registry), not Phase 5.
- `design.md` sections 5, 9, and 12 and `spec.md` section 6 are revised in the
  same change.
- App shell and the live run view are both Phase 5, so the phase is larger than a
  pure backend-plus-screen phase. The backend session API is still built first so
  the shell has real data.
