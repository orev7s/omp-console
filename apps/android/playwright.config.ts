import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end run of the real mobile UI, rendered with react-native-web, against
 * the real control plane through Caddy over HTTPS and WSS.
 *
 * Caddy terminates TLS with its local CA for this host, serves the built UI,
 * and proxies /v1 (including the WebSocket upgrade) to the control plane on
 * loopback. The browser validates the certificate through the trust store, so
 * no verification is disabled. This is the same topology as production; only
 * the certificate authority differs (see installer/caddy/).
 */
const APP_DIR = __dirname;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://localhost:8443',
    trace: 'off',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command:
        'sh -c "rm -rf /tmp/omp-console-e2e && mkdir -p /tmp/omp-console-e2e && ' +
        'OMP_CONSOLE_DATA_DIR=/tmp/omp-console-e2e OMP_CONSOLE_HOST=127.0.0.1 ' +
        'OMP_CONSOLE_PORT=8722 OMP_CONSOLE_PAIRING_CODE=TESTCODE OMP_CONSOLE_LOG_LEVEL=error ' +
        'node ../backend/dist/src/index.js"',
      url: 'http://127.0.0.1:8722/v1/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'caddy run --config ../../installer/caddy/Caddyfile.local --adapter caddyfile',
      cwd: APP_DIR,
      env: {
        OMP_CONSOLE_WEB_ROOT: path.join(APP_DIR, 'web/dist'),
        OMP_CONSOLE_UPSTREAM: '127.0.0.1:8722',
        OMP_CONSOLE_DEMO_HOST: 'localhost',
      },
      port: 8443,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});