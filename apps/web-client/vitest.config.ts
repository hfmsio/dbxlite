import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec,vitest}.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Coverage thresholds - will be enforced progressively
      // Stage 0: baseline (no threshold)
      // Stage 1: 30%
      // Stage 3: 50%
      // Stage 5: 60%
      // Uncomment thresholds as we progress through refactoring stages
      // thresholds: {
      //   lines: 30,
      //   functions: 30,
      //   branches: 25,
      //   statements: 30,
      // },
    },
  },
  resolve: {
    alias: {
      '@ide/connectors': path.resolve(__dirname, '../../packages/connectors/src/index.ts'),
      '@ide/storage': path.resolve(__dirname, '../../packages/storage/src/index.ts'),
      '@ide/duckdb-adapter': path.resolve(__dirname, '../../packages/duckdb-wasm-adapter/src/index.ts'),
      '@ide/schema-cache': path.resolve(__dirname, '../../packages/schema-cache/src/index.ts'),
      '@ide/plugins': path.resolve(__dirname, '../../packages/plugins/src/index.ts'),
      'test': path.resolve(__dirname, './test'),
    },
  },
})
