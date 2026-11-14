# OMP Console Android app

Bare React Native (Community CLI) with TypeScript. No Expo. The client half of
OMP Console, a coding environment for running and steering Oh My Pi (`omp`)
coding agents. It builds for Android and for the browser, and talks only to the
control plane over HTTP and WebSocket.

## Prerequisites

- Node.js 22 or newer (the project targets Node 24/26 for the backend, but the
  app builds on 22).
- JDK 17 or newer (this host has 21).
- Android SDK with platform 37, build-tools 37.0.0, and NDK 27.1.12297006. Set
  `ANDROID_HOME` or put `sdk.dir` in `android/local.properties`.

## Build the shared protocol first

The app consumes `@omp-console/protocol` from its TypeScript build output. From
the repository root:

```sh
npm run build:protocol
```

Metro is configured (see `metro.config.js`) to watch `packages/protocol` and
resolve the package from there, so no extra linking step is needed.

## Build an APK

```sh
npm install
npm run apk:release   # self-contained release APK, JS bundle embedded
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

For a debug build that loads JS from Metro, use `npm run apk:debug` and start
Metro with `npm start`.

## Develop

```sh
npm start             # Metro
npm run android       # install and launch on a connected device or emulator
```

## Tests

```sh
npm test              # Jest (pure logic tests)
npm run typecheck     # tsc --noEmit
```

## Browser build (no APK, no emulator)

The same mobile UI builds for the browser. Caddy serves it at the same origin as
the API, so it can be used and tested without installing the APK or running an
emulator. It is not a separate product; the layout stays mobile-first.

```sh
npm run build:web     # writes web/dist
```

The HTTPS end-to-end run builds it, starts the control plane and Caddy, and
drives the real UI through `https://localhost:8443` with WSS. The certificate
is Caddy's local CA, validated through the trust store, not bypassed.

```sh
npm run e2e:web
```

See `installer/caddy/README.md` for the production domain, IP, and private
network paths.

## Connection modes

The connection screen supports HTTPS (domain certificate), HTTPS (Let's Encrypt
IP certificate), HTTPS over a private network, and direct HTTP. HTTP is disabled
by default in the UI flow: selecting it shows a warning that credentials and
traffic are unencrypted. The app never downgrades from HTTPS to HTTP on its own.

`android/app/src/main/res/xml/network_security_config.xml` permits cleartext so
the HTTP mode works in release builds. The app only uses cleartext when the user
selects HTTP; it defaults to HTTPS.

## Note on runtime testing

This build host has no `/dev/kvm`, so emulator testing is unreliable. The APK is
provided for manual testing on a real device. The browser build is the
no-install path and the surface used by `npm run e2e:web`; it exercises the same
screens, store, HTTP client, and realtime client over HTTPS and WSS.