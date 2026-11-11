# ADR 0004: Brand-driven UI system, bundled fonts, and a platform navigator

Status: Accepted.
Date: 2026-11-11

## Context

Phase 1 shipped a functional but generic connection screen: one long scroll with
a raw event log, unresolved colour and type, and desktop density. The product is
onboarding-first, so the visual and UX layer is part of the deliverable, not
polish to defer. The brand identity (`OMP-console-identity`) fixes the palette
(Ink, Paper, Bone, Signal, Signal Deep, Graphite) and the type (Inter for UI,
JetBrains Mono for code), and `design.md` is the contract that implements it.

Three choices needed a decision:

1. How to express the design system in code.
2. Whether to bundle the brand fonts.
3. How to keep the browser end-to-end harness green while using React
   Navigation on the device.

## Decision

1. Tokens live in `src/ui/theme/` (primitives, semantic roles, type, motion) and
   components in `src/ui/components/`. Screens read semantic roles only; no
   screen hardcodes a value. `design.md` is authoritative and code follows it.

2. Bundle Inter (400/500/600/700) and JetBrains Mono (400/500) as static TTFs in
   `android/app/src/main/assets/fonts/`. They are assets, not a runtime
   dependency, the brand requires them, and the fallback stack is
   `Inter, "Helvetica Neue", Arial, sans-serif`. The web harness self-hosts the
   same files under `web/fonts` behind `@font-face`.

3. Use React Navigation native-stack on Android. The web harness uses a small
   in-memory stack (`src/app/nav.web.tsx`) instead, because react-native-screens
   does not lay out under react-native-web. Screens depend only on the shared
   `AppNavigation` contract in `src/app/navigationTypes.ts`, resolved per
   platform through `src/app/hooks.ts` and `hooks.web.ts`.

## Alternatives

- CSS or a third-party component library: rejected. The app is bare React
  Native; adding a styling or component dependency is not justified against the
  small approved set, and the brand is custom.
- System fonts only: rejected. The brand sets Inter and JetBrains Mono; falling
  back would not match the identity the user supplied.
- A JS stack navigator (`@react-navigation/stack`): rejected. It adds gesture
  handler and reanimated dependencies for a test-only path.
- Drop React Navigation and hand-roll routing on device: rejected. The device
  build should use the platform-standard navigator.

## Consequences

- The web harness renders the real screens, theme, and store, but not the
  native-stack container. It is strong evidence for UI and flow, and it is not
  Android device testing.
- Native font rendering and the native navigator remain unverified on a device
  (no reliable emulator on the build host). This is recorded in the phase report.
- `design.md` must be updated in the same change as any token or component
  change, or the contract drifts.
