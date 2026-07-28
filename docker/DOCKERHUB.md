# dbxlite — a browser-native SQL workbench powered by DuckDB

**Query real data in your browser. No server, no upload, no lock-in.**

dbxlite is a fast, private SQL IDE that runs [DuckDB](https://duckdb.org) compiled to WebAssembly directly in the browser. This image ships the whole app as a single static-web container — point your team at one URL and everyone gets a full SQL workbench, sandboxed in their own browser tab. There is **no database server and no backend to operate**: every query runs client-side on the user's machine.

Ideal for **internal SQL training**, **self-hosted analytics scratchpads**, **air-gapped/offline environments**, and **giving a team a shared query tool without provisioning any infrastructure**.

- 🐙 Source & docs: https://github.com/hfmsio/dbxlite
- 🌐 Hosted demo (same app): https://sql.dbxlite.com
- 📦 npm (server-mode CLI): https://www.npmjs.com/package/dbxlite-ui

---

## Quick start

```bash
docker run -p 8080:80 hfmsio/dbxlite
# then open http://localhost:8080
```

With Docker Compose:

```yaml
services:
  dbxlite:
    image: hfmsio/dbxlite:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

```bash
docker compose up -d
```

That's it. No volumes, environment variables, or secrets are required for the core DuckDB workflow.

---

## Supported tags & architectures

- `latest` — most recent release
- `X.Y.Z` (e.g. `0.4.1`) — pinned version, recommended for reproducible deployments
- `X.Y` — latest patch within a minor line

Every tag is a **multi-arch manifest** built for **`linux/amd64`** and **`linux/arm64`**, so it runs natively on Intel/AMD servers, Apple Silicon, and ARM cloud instances (AWS Graviton, etc.).

---

## What you can do with it

**Query local files larger than RAM.** In WASM mode dbxlite reads local files through the browser's File System Access API on demand, so you can query files bigger than browser memory instead of loading them in. The result grid streams arbitrarily large result sets via virtual scrolling.

**Read many formats.** CSV, Parquet, Excel (`.xlsx`), JSON, and JSONL — local or remote. Remote URLs are read on demand via DuckDB's `httpfs` extension, so you can query a Parquet or CSV file straight from a URL.

**Use full DuckDB SQL.** Window functions, CTEs, `PIVOT`, `QUALIFY`, list/struct/map types, and DuckDB's extension ecosystem. Attach and reuse `.db` database files.

**Connect to warehouses (optional).** BigQuery and Snowflake connect directly from the browser (BigQuery via Google's CORS-enabled APIs; Snowflake via a thin proxy). OAuth 2.0 PKCE and Programmatic Access Tokens are supported. Not required for the DuckDB workflow.

**Write SQL comfortably.** A Monaco-based editor with SQL autocomplete (keywords, dialect functions, table and column names, alias resolution), multiple query tabs, and a fast, keyboard-driven UI.

**Make it yours.** Ten color themes (light and dark), a configurable results layout (results below, beside, or hidden), and a focus-panel maximize mode.

**Share queries as links.** Any query becomes a URL that runs on click, with options baked in: `?sql=`, `?example=`, `?share=gist:…`, plus `&theme=`, `&layout=`, and `&run=true`. Great for handing a colleague a ready-to-run example.

**Learn by example.** A built-in library of ready-to-run example queries (DuckDB tutorials, remote datasets, BigQuery samples) — click the bulb icon. A solid starting point for a training curriculum.

**Optional AI assistant.** An opt-in chat panel to help write and explain SQL.

---

## Privacy

dbxlite is client-side by design. In the default DuckDB/WASM mode, **your data never leaves your machine** — the container serves only static UI assets (HTML, JS, the DuckDB WASM engine). Queries execute in your browser tab against your local and remote files. Nothing is uploaded to the container or to any dbxlite service.

---

## Configuration

**Port.** The container serves on port `80`; map it wherever you like (`-p 8080:80`).

**Cross-origin isolation headers (built in).** The bundled nginx config sets the headers DuckDB needs for OPFS persistence and file export:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless` — keeps the context cross-origin-isolated while still letting `httpfs` fetch remote files/CSVs that do not send CORP headers
- `Cross-Origin-Resource-Policy: cross-origin`

This is the reason to use this image rather than serving the assets from a bare web server that omits these headers (which silently disables OPFS features). If you put dbxlite behind your own reverse proxy or TLS terminator, preserve these headers.

**Behind a reverse proxy / sub-path.** Assets are referenced relatively, so the app can be served from any host or sub-path. Terminate TLS at your proxy and forward to the container's port 80.

---

## Server mode: attach a native DuckDB engine

Need full native DuckDB (all extensions, unlimited memory, direct filesystem access)? The container serves the same UI that DuckDB's `ui` extension uses, so a user can drive it with a **native DuckDB running on their own machine**:

```bash
export ui_remote_url="http://localhost:8080"   # this container
duckdb -unsigned -ui                            # native engine + dbxlite UI on :4213
```

The engine runs locally next to the user's files; the container only ships the interface. Do **not** run a shared DuckDB engine inside the container for multiple users — arbitrary SQL implies filesystem and extension access, and a single shared engine has no per-user isolation. Keep the engine on each user's machine.

---

## Health check & operations

- The app is a static site; a simple HTTP GET on `/` returns `200` when ready.
- Stateless: no persistent volumes needed. Restart freely.
- Logs are standard nginx access/error logs on stdout/stderr.

---

## Links

- **GitHub** (source, issues, full docs): https://github.com/hfmsio/dbxlite
- **Live demo**: https://sql.dbxlite.com
- **npm** (`dbxlite-ui`, the server-mode CLI / `duckdb -ui` replacement): https://www.npmjs.com/package/dbxlite-ui
- **License**: MIT

---

*Keywords: DuckDB, SQL, WebAssembly, WASM, browser SQL, SQL IDE, SQL editor, data analytics, Parquet, CSV, Excel, JSON, BigQuery, Snowflake, self-hosted, SQL training, offline analytics, query tool, data workbench.*
