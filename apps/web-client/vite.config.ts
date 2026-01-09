import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  // Use relative paths for assets - required for duckdb -ui serving via ui_remote_url
  base: './',
  // Treat SQL files as assets to prevent Vite from parsing them as JS
  assetsInclude: ['**/*.sql'],
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@ide/connectors': path.resolve(__dirname, '../../packages/connectors/src/index.ts'),
      '@ide/storage': path.resolve(__dirname, '../../packages/storage/src/index.ts'),
      '@ide/duckdb-adapter': path.resolve(__dirname, '../../packages/duckdb-wasm-adapter/src/index.ts'),
      '@ide/schema-cache': path.resolve(__dirname, '../../packages/schema-cache/src/index.ts'),
      '@ide/plugins': path.resolve(__dirname, '../../packages/plugins/src/index.ts'),
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm', 'argon2-browser']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
          'react-vendor': ['react', 'react-dom']
        }
      },
      // External modules (argon2-browser has unusual WASM imports that can't be bundled)
      external: ['a']
    },
    target: 'esnext'
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // Use credentialless mode instead of require-corp to allow fetching remote files
      // without strict CORS requirements while still enabling SharedArrayBuffer
      'Cross-Origin-Embedder-Policy': 'credentialless'
    },
    // Allow connections from DuckDB -ui proxy
    cors: true,
    hmr: {
      // When accessed via DuckDB proxy, HMR should connect to Vite server directly
      clientPort: 5173
    }
  }
})
