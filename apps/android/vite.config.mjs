import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite config for the browser build of the same mobile UI, rendered with
 * react-native-web. It is served by Caddy at the same origin as the API and is
 * also what the HTTPS end-to-end run loads. It is not a separate product; the
 * UI stays mobile-first.
 *
 * For local development the dev server proxies /v1 to the control plane so the
 * browser sees a single origin (no CORS) and the WebSocket upgrade is
 * forwarded. In the end-to-end run Caddy plays that role over HTTPS instead.
 */
export default {
  root: path.join(dir, 'web'),
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      {
        find: /^@omp-console\/protocol$/,
        replacement: path.resolve(dir, '../../packages/protocol/dist/index.js'),
      },
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
  },
  optimizeDeps: {
    // These ship their own .web variants; prebundling can pick the native
    // entry and pull RN internals. Let Vite resolve them with the extensions
    // above instead.
    exclude: ['react-native-safe-area-context', 'react-native-screens'],
  },
  define: {
    global: 'globalThis',
    __DEV__: 'true',
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:8722',
        changeOrigin: true,
        ws: true,
      },
    },
  },
};