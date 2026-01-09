# DuckDB UI Integration

This document explains how dbxlite can serve as a replacement UI for DuckDB's built-in web interface (`duckdb -ui`).

## Overview

DuckDB v1.2.1+ includes a local web UI via the `ui` extension. When you run `duckdb -ui`, it starts an embedded HTTP server on port 4213 that:
1. Serves UI assets (HTML, JS, CSS) proxied from a remote server
2. Handles SQL execution requests via a binary protocol

By default, assets are fetched from `https://ui.duckdb.org`. We can override this to serve dbxlite instead.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
│                  http://localhost:4213/                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DuckDB HTTP Server                             │
│                      (port 4213)                                 │
│                                                                  │
│  GET /*  ──────► Proxy to ui_remote_url (our asset server)      │
│  POST /ddb/run ──► Execute SQL, return binary result            │
│  GET /info ────► Server info headers                            │
│  GET /localEvents ► SSE for catalog changes                     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ GET requests proxied
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  dbxlite Asset Server                            │
│                      (port 8080)                                 │
│                                                                  │
│  Serves: index.html, *.js, *.css, *.wasm, etc.                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Build dbxlite

```bash
cd /path/to/dbxlite/apps/web-client
pnpm build
```

### 2. Start the Asset Server

```bash
cd apps/web-client/dist
node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = '.' + req.url.split('?')[0];
  if (filePath === './') filePath = './index.html';

  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.png': 'image/png',
    '.json': 'application/json',
  };
  const contentType = contentTypes[path.extname(filePath)] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': 9 });
      res.end('Not found');
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length
      });
      res.end(content);
    }
  });
});

server.listen(8080, '0.0.0.0', () => console.log('Asset server on port 8080'));
"
```

### 3. Start DuckDB with Custom UI

```bash
export ui_remote_url="http://127.0.0.1:8080"
duckdb -unsigned -cmd "LOAD ui; CALL start_ui();"
```

### 4. Open Browser

Navigate to `http://localhost:4213/` to see dbxlite connected to your local DuckDB instance.

## Important Requirements

### The `-unsigned` Flag

The `ui_remote_url` setting is only respected when DuckDB is started with the `-unsigned` flag (which enables `allow_unsigned_extensions`). This is a security measure since custom UIs can access your data.

### Content-Length Headers

The asset server MUST set `Content-Length` headers on responses. DuckDB's HTTP proxy doesn't handle chunked transfer encoding correctly.

### Environment Variable vs SQL SET

The `ui_remote_url` can be configured via:
- Environment variable: `export ui_remote_url="http://..."`
- SQL command: `SET ui_remote_url = 'http://...'` (after loading UI extension)

The environment variable is recommended as it's applied before the extension loads.

## How dbxlite Detects HTTP Mode

dbxlite automatically detects when it's running under DuckDB's HTTP server:

```typescript
// packages/connectors/src/mode-detection.ts
export function detectMode(): DbxliteMode {
  if (typeof window !== 'undefined' && window.location.port === '4213') {
    return 'http'
  }
  return 'wasm'
}
```

In HTTP mode, dbxlite uses `DuckDBHttpConnector` which:
- Sends SQL to `POST /ddb/run`
- Deserializes binary responses using DuckDB's BinarySerializer format
- Listens to `/localEvents` SSE for schema changes

## Binary Protocol

DuckDB's HTTP API uses a binary serialization format (not JSON or Arrow). Key characteristics:
- Field IDs as uint16 little-endian
- VarInt (LEB128-like) encoding for lengths
- 0xFFFF as object terminator
- Nested structures for types, columns, and data chunks

See `packages/connectors/src/duckdb-http/` for the TypeScript deserializer implementation.

## Troubleshooting

### "Could not establish connection"

1. Ensure the asset server is running before starting DuckDB
2. Verify the server is accessible: `curl http://127.0.0.1:8080/`
3. Check that `-unsigned` flag is used

### "ERR_INVALID_CHUNKED_ENCODING"

The asset server must set `Content-Length` headers. Don't rely on Node's default chunked encoding.

### Default DuckDB UI Still Appears

1. Ensure `-unsigned` flag is passed to duckdb
2. Verify environment variable is set: `echo $ui_remote_url`
3. Restart DuckDB after setting the variable

## References

- [DuckDB UI Extension Documentation](https://duckdb.org/docs/stable/core_extensions/ui)
- [DuckDB UI Extension Source](https://github.com/duckdb/duckdb-ui)
- [DuckDB UI Announcement](https://duckdb.org/2025/03/12/duckdb-ui)
