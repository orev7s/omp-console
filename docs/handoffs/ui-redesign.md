# Handoff: OMP Console UI and onboarding redesign

Copy the block below into a new session.

---

## Mission

Rewrite the OMP Console Android UI and onboarding from scratch, driven by a real
design system, and write a `design.md` at the repository root that defines the
visual and UX language for the entire product. The current UI is functional but
ugly, generic, desktop-ish, and intimidating. Tear it down and rebuild it so it
looks like a polished, native-feeling Android app and so onboarding is as close
to effortless as possible. Onboarding is the most important surface in this
product.

You are not changing what the app does. You are changing how it looks, reads,
and flows.

## First, load your skills

Load these in order and actually follow them:

1. `ux-skill` (design intelligence: direction, tokens, palette, type pairing,
   WCAG gate, anti-slop lint, component and state contract)
2. `android-ux` (Material 3 UX principles, touch targets, spacing, navigation,
   accessibility, M3 compliance audit)
3. `mobile-design-android` (Android 16 / Material 3 Expressive, shape variety,
   spring motion, native patterns)
4. `interface-design` (designing screens, dashboards and tools, layout and
   hierarchy)
5. `refactoring-ui` (visual hierarchy, spacing, color, depth, finishing)
6. `emil-design-eng` (the polish details and motion decisions)

Use their outputs. Do not hand-wave past them. If a skill produces concrete
tokens, palettes, or component contracts, put them in `design.md` and implement
them.

## Read before you touch anything

Repository: `/home/ubuntu/projects/omp-console`

- `AGENTS.md` (hard rules: boundaries, style, testing, docs, phase scope)
- `spec.md` (architecture and decisions)
- `roadmap.md` (Phase 1 scope and status)
- `docs/phase-reports/phase-1.md` (what is built and verified)

Then read the app:

- `apps/android/src/screens/ConnectionScreen.tsx` (the screen to replace)
- `apps/android/src/ui/theme.ts` (current tokens, generic and thin)
- `apps/android/src/state/connection.ts` (zustand store and flow)
- `apps/android/src/api/`, `apps/android/src/realtime/`
- `apps/android/App.tsx`, `apps/android/web/`, `apps/android/e2e/`

## What the product is

OMP Console is an Android app plus a small service the user runs on their own
VPS, so they can run and control Oh My Pi (`omp`) coding agents from their phone.
The app connects to the VPS service over HTTP and WebSocket. Four connection
modes exist: HTTPS with a domain certificate, HTTPS with a Let's Encrypt IP
certificate, HTTPS over a private network, and direct HTTP (explicitly insecure,
opt-in). Phase 1 is connectivity and onboarding only.

## What works today (do not break)

- Backend control plane, tested (15 tests). HTTP `/v1/health`, `/v1/meta`,
  `/v1/pair`, and a WebSocket hub with Bearer or `bearer.<token>` subprotocol
  auth, heartbeats, and a `server.status` topic.
- Android app (bare React Native 0.88.1, no Expo, TypeScript): pairing, HTTP
  health and meta, a reconnecting WebSocket client, token storage.
- A browser harness renders the real UI with react-native-web and drives it with
  Playwright against the real backend. Use it constantly to see and verify the
  UI. Run it with:

  ```sh
  cd apps/android
  npm run e2e:web        # starts backend + Vite, runs Playwright, writes a screenshot
  ```

  Screenshot lands in `apps/android/e2e/artifacts/connection.png`.
  You can also run `npm run web` and open the Vite URL to look at it live.

- Other commands: `npm run typecheck`, `npm test` in `apps/android`; backend
  tests from the repo root with `npm test`.

## Why the current UI is bad (be honest about all of it)

- Every piece of the flow is dumped on one long scroll. Serving, pairing,
  connecting, and a raw event log compete for attention.
- It is a developer panel, not an onboarding flow. Raw state words like
  "connected", "unavailable", and a timestamped frame log are shown to the user.
- No visual hierarchy, no clear single primary action, everything is the same
  weight of bordered card.
- Generic, unresolved color and type. It reads like a default template.
- Desktop thinking on a phone: dense rows, small targets, long forms.
- It smells like AI slop: evenly spaced bordered cards, no intent, no brand.
- Even the words are wrong for a normal person. "Control plane", "mode",
  "secure=false", and "api CW45fcbd" mean nothing to the user.

## Design principles (non-negotiable)

- Mobile first. Thumb-reachable primary actions, minimum 48dp touch targets,
  comfortable spacing, one clear thing to do per screen.
- Onboarding is the whole game. Fewest possible steps, fewest possible words,
  sensible defaults, forgiveness for mistakes.
- One primary action per screen. Secondary and destructive actions are visually
  quieter and placed out of the way.
- Progressive disclosure. Hide the technical machinery (port, TLS mode, raw
  events) behind an explicit "Advanced" affordance. The default path is one or
  two taps.
- Plain language. No jargon. Never show wire values to the user. Say what the
  user is doing, not what the system is doing. For example "Connect to your
  server", not "Configure control plane endpoint".
- Show state, do not dump enums. A clear dot plus a human sentence. Make success
  feel good and errors actionable with a next step, never a stack string.
- Recommend, do not interrogate. Default the secure and common path, and make
  the alternative available without making the user think.
- Keep the insecure HTTP mode, but surface it as a deliberate choice with the
  warning at the moment of choice, not a banner shouting on the main screen.
  Never downgrade silently.
- Consistency. One spacing scale, one radius scale, one type scale, one color
  system, light and dark, used everywhere. No magic numbers in screens.
- Accessibility. Contrast, targets, labels, screen reader names, dynamic type.
  Pass the WCAG gate from `ux-skill`.

## Deliverable 1: `design.md` (repo root)

Write a real design system document, not a mood board. It must be specific
enough that a future agent can build any new screen and match. Required sections:

- Product and brand direction: the one-paragraph point of view, in plain
  language, plus the personality (calm, competent, fast, trustworthy).
- Color system: primitives and semantic tokens for light and dark, with hex
  values and usage rules. Include status colors (success, warning, danger,
  info) and the "insecure" treatment. State the contrast results.
- Typography: the family choice with justification, the full scale with sizes,
  weights, line heights, and where each is used.
- Spacing, radius, elevation, and border system, with the scales.
- Iconography: the set, the sizes, and the rules.
- Motion: durations, easings, and where motion is used versus not, with a
  reduced-motion story.
- Component specs: buttons (primary, secondary, ghost, destructive), text
  fields, code input, chips/segmented control, list rows, cards, banners,
  status indicator, progress, empty and error states, dialogs/sheets. For each:
  anatomy, states, sizes, spacing, and the accessibility contract.
- Copy and tone: voice rules, button verb rules, error message rules.
- Flow and screen map: the onboarding flow and the app shell, as a list of
  screens with the single job of each and the transition between them.
- Anti-patterns: the specific things this product must never look like (seed
  the list with what is wrong today).
- How the tokens map to code: the `src/ui/` files and the token names.

Keep the document tight and usable. It can exceed normal file size limits since
it is a spec, but stay disciplined.

## Deliverable 2: the redesigned onboarding flow

Propose a short flow, then implement it. A strong starting point to react to,
not a mandate:

1. Welcome: one headline, one line of explanation, one primary button
   ("Connect to my server"), optionally "I already have a code".
2. Connect: a single smart field that accepts either `host` or `host:port`,
   a big friendly primary button, and a subtle "Advanced" disclosure that
   holds the port, the connection mode, and the HTTP warning when relevant.
3. Pair: a large, obvious pairing-code entry with paste support and clear
   feedback, or skip it entirely if a token already exists.
4. Done/Home: a calm connected state that confirms success and shows the next
   useful thing, with the raw event log moved to a debug screen, not the main
   flow.

Design so the future steps work: a pairing deep link or QR from the installer
should drop straight into step 2 or 3. Do not build the QR or installer yet,
but do not design yourself into a corner that prevents it.

Wire it through the existing store. Keep the four connection modes in the
advanced section, HTTPS default, HTTP with the explicit warning at the choice.

## Deliverable 3: implementation

- Replace `apps/android/src/ui/theme.ts` with a proper token layer (primitives
  and semantic tokens, light and dark) matching `design.md`.
- Build a small `src/ui/` component library: button, text field, code input,
  segmented control/chip, card/row, banner, status indicator, screen scaffold,
  and whatever else the flow needs. Every component is a named, typed,
  reusable unit.
- Build the screens under `src/features/` (onboarding, connect, pair, home,
  debug) wired with React Navigation. Keep `App.tsx` thin.
- No networking or business logic in components. Screens read state and
  dispatch intents. Reuse the existing `api/`, `realtime/`, and `state/` layers.
- Every source file stays under 800 lines. Names describe intent. No dumping
  grounds.

## Deliverable 4: verification and evidence

- Keep the browser end-to-end harness green and extend it to cover the new flow
  (welcome, connect, pair, connected, error states). Add tests for the insecure
  warning appearing only at the choice, and for a failed pairing showing a
  friendly error.
- Capture screenshots of each key screen, in light and dark, and reference them
  from your report. Show them to the user before you consider the work done.
- Keep `npm run typecheck` and `npm test` (app) and the backend tests passing.
- Update `design.md`, `spec.md` (only if architecture-adjacent), `roadmap.md`
  status, and `docs/phase-reports/phase-1.md`.

## Constraints (from AGENTS.md, enforced)

- No em dashes or en dashes anywhere. No filler, no marketing tone.
- Do not change the backend protocol or auth except by proposal. If the flow
  needs a small backend addition (for example a pre-auth server info endpoint),
  propose it, keep it inside Phase 1 scope, and do not silently expand scope.
- Do not add dependencies without justification. The approved set is small.
- No Expo. Bare React Native only.
- Do not delete or rewrite unrelated code. Treat unfamiliar files as someone
  else's work.
- Do not ship an insecure shortcut to make something look nicer.
- Verify on the browser harness. Do not claim Android device testing. If you
  cannot run something, say so.

## Acceptance criteria

1. `design.md` exists, is specific, and is implemented by the app.
2. Onboarding is a short, calm, obvious flow with a single primary action per
   screen and hidden technical detail.
3. The app looks intentional, consistent, and native, in light and dark, with
   no generic template feel and none of the anti-patterns from `design.md`.
4. The insecure HTTP mode is still available, only via a deliberate choice, with
   the warning at the decision point, and never a silent downgrade.
5. The browser end-to-end tests pass, cover the new flow, and produce
   screenshots you have shown to the user.
6. Typecheck, app tests, and backend tests all pass.
7. Docs updated. No em dashes. Files under 800 lines.

## Non-goals

- Do not build the installer, QR enrollment, or hosted broker. Phase 2 and 3.
- Do not add agent chat, sessions, monitoring, files, or terminal. Those are
  later phases.
- Do not touch the agent host or any Oh My Pi integration. Not built yet.
- Do not redesign the backend.

## Suggested first steps

1. Load the skills above.
2. Read the docs and the current app code.
3. Run the browser harness and screenshot the current UI so you can see the
   problem yourself.
4. Draft `design.md` and the proposed onboarding flow, then show them to the
   user for approval before implementing. Onboarding decisions are worth a
   checkpoint.
5. Implement the tokens and component library, then the screens, then update
   the tests and evidence.
