# ADR 0005: A browser build of the mobile UI for no-install access and testing

Status: Accepted.
Date: 2026-11-11

## Context

The console is an Android app. Testing it has required a device or an emulator,
and this build host has no `/dev/kvm`, so the emulator is unreliable. The same
screens already render with react-native-web for the end-to-end harness, so the
browser can exercise the real UI, store, HTTP client, and realtime client
without an APK.

Separately, some users want to reach the console from a browser without
installing anything. The product is mobile-first, not a desktop web app, and
that does not change.

## Decision

1. Ship a browser build of the same mobile-first UI (`npm run build:web`) and
   serve it from Caddy at the same origin as the API.
2. Use that build as the end-to-end surface, over HTTPS and WSS through Caddy.
   The local run uses Caddy's local CA, validated through the trust store, not a
   certificate bypass.
3. It is not a separate product surface. No separate routing, features, or
   design system. The phone viewport is the target, the layout stays
   mobile-first, and the L1 contract is unchanged.
4. The Android app remains the primary native client. Browser access is an
   optional no-install path.

## Alternatives

- APK only: rejected. Install friction, and it makes testing depend on a device
  or an emulator the host cannot run reliably.
- A separate web dashboard: rejected. It would fork the UI and the feature set,
  which is scope and product drift.
- A device farm or cloud emulator: rejected. It adds a dependency and cost, and
  it does not give users a no-install path.
- Desktop-first responsive web app: rejected. The product is mobile-first.

## Consequences

- The web build is a static artifact served by Caddy through
  `OMP_CONSOLE_WEB_ROOT`, not a dev server. `npm run e2e:web` builds it first.
- Same-origin serving removes CORS and mixed-content concerns. A different origin
  would need explicit CORS and a WebSocket auth story.
- Web token storage is `localStorage` today. That is acceptable for the local
  verification run, but a public browser deployment needs an HttpOnly cookie or
  an in-memory token before it ships. This is recorded as an open item.
- Android native paths (Keystore, the native WebSocket, the Android TLS stack)
  still need a real device if the APK remains supported.
- The browser test is strong evidence for the UI, the L1 protocol, and the TLS
  and WSS path. It is not Android device testing.