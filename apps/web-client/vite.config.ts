import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * Snowflake REST API dev proxy as a Vite plugin.
 *
 * Snowflake's REST API has no CORS support, so the browser-side connector
 * routes through `/api/snowflake/<account>/*` which we forward to
 * `https://<account>.snowflakecomputing.com/*`.
 *
 * We don't use Vite's built-in `proxy: {...}` config because the underlying
 * `http-proxy` library doesn't support per-request dynamic targets — it
 * needs `target` to be a static string. Instead we register a connect-style
 * middleware that does the proxying with `fetch` directly.
 *
 * Header handling matches the production Vercel Edge Function:
 *   - Strip request headers Vite/Node add (host, connection, etc.)
 *   - Strip response headers that conflict with COEP=credentialless
 *   - Inject Cross-Origin-Resource-Policy: cross-origin on responses
 */
function snowflakeProxyPlugin(): Plugin {
  const ACCOUNT_RE = /^[a-z0-9][a-z0-9._-]*$/i
  const STRIP_REQUEST_HEADERS = new Set([
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'origin',
    'referer',
    // We re-frame the body via fetch(), which sets these itself.
    // Forwarding the browser-set values can cause upstream to truncate-read.
    'content-length',
    'content-encoding',
  ])
  const STRIP_RESPONSE_HEADERS = new Set([
    'cross-origin-resource-policy',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'content-security-policy',
    'set-cookie',
    // fetch() auto-decompresses the body, so we must NOT propagate the
    // original Content-Encoding (or the browser will try to decompress
    // a plain-text body and fail with ERR_CONTENT_DECODING_FAILED).
    // Same for Content-Length: post-decompression length differs.
    'content-encoding',
    'content-length',
    'transfer-encoding',
  ])

  return {
    name: 'dbxlite:snowflake-proxy',
    configureServer(server) {
      server.middlewares.use('/api/snowflake', async (req: IncomingMessage, res: ServerResponse) => {
        // req.url here is relative to the mount point: /<account>/<rest>
        const m = req.url?.match(/^\/([^/?]+)(\/[^?]*)?(\?.*)?$/)
        if (!m) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Bad path' }))
          return
        }
        const account = m[1].toLowerCase()
        const rest = m[2] ?? '/'
        const query = m[3] ?? ''
        if (!ACCOUNT_RE.test(account)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid Snowflake account identifier' }))
          return
        }

        const targetUrl = `https://${account}.snowflakecomputing.com${rest}${query}`

        // Build forwarded headers from raw request
        const fwdHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (v == null) continue
          if (STRIP_REQUEST_HEADERS.has(k.toLowerCase())) continue
          fwdHeaders[k] = Array.isArray(v) ? v.join(', ') : v
        }

        // Read request body (for non-GET/HEAD)
        let body: Buffer | undefined
        if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
          body = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = []
            req.on('data', (c) => chunks.push(Buffer.from(c)))
            req.on('end', () => resolve(Buffer.concat(chunks)))
            req.on('error', reject)
          })
        }

        let upstream: Response
        try {
          upstream = await fetch(targetUrl, {
            method: req.method,
            headers: fwdHeaders,
            body: body && body.length ? body : undefined,
            redirect: 'manual',
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown'
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Snowflake proxy upstream fetch failed',
              message: msg,
              upstream: targetUrl.replace(/\?.*$/, ''),
            }),
          )
          return
        }

        // Copy response headers, sanitized
        res.statusCode = upstream.status
        upstream.headers.forEach((value, key) => {
          if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
            res.setHeader(key, value)
          }
        })
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

        const respBuf = Buffer.from(await upstream.arrayBuffer())
        res.end(respBuf)
      })
    },
  }
}

export default defineConfig({
  // Use relative paths for assets - required for duckdb -ui serving via ui_remote_url
  base: './',
  // Treat SQL files as assets to prevent Vite from parsing them as JS
  assetsInclude: ['**/*.sql'],
  plugins: [react(), wasm(), topLevelAwait(), snowflakeProxyPlugin()],
  resolve: {
    alias: {
      '@ide/connectors': path.resolve(__dirname, '../../packages/connectors/src/index.ts'),
      '@ide/storage': path.resolve(__dirname, '../../packages/storage/src/index.ts'),
      '@ide/duckdb-adapter': path.resolve(__dirname, '../../packages/duckdb-wasm-adapter/src/index.ts'),
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
      input: {
        // Main app
        main: path.resolve(__dirname, 'index.html'),
        // OAuth callback page (popup destination for Snowflake OAuth).
        // Served at `/oauth-callback.html` in both dev and prod.
        'oauth-callback': path.resolve(__dirname, 'oauth-callback.html'),
      },
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
    port: 5177,
    // Fail loudly rather than walking to the next free port. OAuth redirect
    // URIs are registered per exact origin in Google Cloud, so a silent hop to
    // 5178 turns a working BigQuery connection into `redirect_uri_mismatch`
    // with no obvious cause. Better to be told the port is busy.
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // Use credentialless mode instead of require-corp to allow fetching remote files
      // without strict CORS requirements while still enabling SharedArrayBuffer
      'Cross-Origin-Embedder-Policy': 'credentialless'
    },
    // Allow connections from DuckDB -ui proxy
    cors: true,
    hmr: {
      // When accessed via DuckDB proxy, HMR should connect to Vite server
      // directly. Keep this in step with `port` above.
      clientPort: 5177
    },
  }
})
