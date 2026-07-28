# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Native Parquet export via parquetjs (cloud export currently uses a JSON intermediate)
- Advanced connection testing for cloud connectors
- BigQuery to CatalogProvider migration (UX parity with Snowflake)
- Per-dialect SQL autocomplete (Snowflake QUALIFY/IFF, BigQuery STRUCT, DuckDB-specific)
- Hosted Cortex model manifest for auto-refresh as Snowflake adds/deprecates models

## [0.5.0] - 2026-07-28

### Added
- Flexible results layout: place the results grid below or beside the editor, or hide it, with drag-to-resize and a focus-panel maximize overlay for the editor or results.
- Share any query as a link: a tab-bar popup builds a URL with theme, layout, auto-run, and explorer options and a live preview, plus opt-in GitHub Gist links (locally-stored token) for queries too long for a URL.
- `layout` URL parameter (`bottom`/`right`/`hidden`, with `vertical`/`horizontal` aliases) honored when a shared link loads.
- Self-hosted Docker image: a small multi-stage build served by nginx with the cross-origin isolation headers DuckDB needs, published multi-arch (amd64/arm64) to GHCR and Docker Hub, plus docker-compose and docs.

### Changed
- Redesigned the header for clarity and low-resolution responsiveness: subtle dividers instead of section blocks, a single cycle-theme control, responsive label collapse, and clearer tooltips across the header and tab bar.

## [0.4.1] - 2026-07-27

### Fixed
- The in-app version (About screen) is now injected from `package.json` at build time, so it no longer drifts from the released version.

### Changed
- Pin `@duckdb/duckdb-wasm` to `^1.32.0`, the latest stable release (no functional change; the previous `^1.31.0` already resolved to 1.32.0).

## [0.4.0] - 2026-07-27

### Added
- **BigQuery onboarding wizard**: staged setup with live post-connect preflight, a minimal OAuth scope set, and a paste-a-token auth mode for users who can't run the OAuth flow.
- **Schema-aware autocomplete**: suggestions come from your connected catalog across DuckDB, BigQuery, and Snowflake, resolving CTEs, aliases, quoted identifiers, and multi-level catalogs. Cloud and inline DuckDB file/URL columns load lazily on first reference, with a "Loading columns" placeholder that fills in when the fetch completes.
- **Cancel control for BigQuery sign-in** so a closed or errored Google popup returns immediately instead of waiting on a timeout.
- **Export cost confirmation**: a pre-run dialog surfaces row/scope and potential warehouse cost before a full-result export, so large pulls are never triggered silently.
- **Full-result export with no row cap**: exports always re-run the query for the complete result set. OPFS-streamed Parquet and streamed CSV/JSON, with a buffered fallback when OPFS is unavailable.
- **Parquet compression setting** (default ZSTD).
- **ESC-to-cancel exports** with a confirmation prompt to guard against accidental cancellation of long-running downloads.
- Catalog-aware engine auto-detection: switches on definitive single-engine syntax and on table names present in the attached DuckDB catalog.

### Changed
- Decomposed the `streaming-query-service` god object into individually tested collaborators (connector registry, pagination planner, query executor, row-count estimator, abort registry, file VFS, per-connector lifecycles) behind an unchanged public facade.
- Replaced ten UI state-sync polling loops with a connector event surface plus ref-counted remote probes and focus/visibility permission rechecks.
- DuckDB attach introspects each schema with a fixed set of batched queries and estimated row counts instead of per-table column and COUNT(*) queries, keeping attach time flat on large catalogs.
- xlsx sources are read with `all_varchar=true`, so a column that sniffs numeric but holds text further down no longer aborts the read.
- Autocomplete alias resolution is scoped to the statement under the cursor, so a reused alias in another statement no longer offers the wrong table's columns.

### Fixed
- BigQuery / Google OAuth: closing or cancelling the popup now returns a graceful error instead of hanging until the timeout.
- Attached DuckDB databases appear in the in-browser explorer again (they were being routed to the server-mode path).
- Autocomplete inserts columns as identifiers (bare or double-quoted) rather than single-quoted string literals.
- xlsx queries with mixed-type columns no longer fail with a type-conversion error.
- BigQuery project listing no longer strands users on a disabled API (projects.list primary, Cloud Resource Manager fallback).
- BigQuery dot-completion (`alias.` / `table.`) resolves columns on demand.
- DuckDB Parquet export reports the real exported row count instead of 0.

### Documentation
- Synced ARCHITECTURE, README, CHANGELOG, and test coverage to the current codebase.

## [0.3.0] - 2026-05-03

### Added
- **Snowflake connector**: SQL REST API v2 with two auth modes — OAuth 2.0 PKCE (public-client recommended; confidential supported) and Programmatic Access Token (no `CREATE SECURITY INTEGRATION` / ACCOUNTADMIN required). CORS proxy via Vite middleware in dev, Vercel Edge Function in production.
- **CatalogProvider abstraction**: vendor-neutral catalog explorer with quick-switch dropdowns for role / warehouse / database / schema, compute status badge with one-click resume, query history modal with privilege-aware help, column preview / drag-drop, full-text search, pinned catalogs.
- **AI SQL Assistant**: streaming chat panel with dialect-aware system prompts, SQL block extraction + run-in-editor, multi-provider support.
- BYO providers: OpenAI, Anthropic, Gemini, Groq.
- Warehouse-native AI: Snowflake Cortex (Claude, Llama 3.x, Mistral, DeepSeek, Mixtral).
- **PII consent dialog** before the first send to any external AI service. Per-provider, persisted in localStorage. Warehouse backends skip (data stays in the warehouse).
- Inline `<ApiKeyInlineField>` in chat WelcomeCard + Settings.
- Backend picker grouped by kind; per-backend model picker remembering selection.
- Topbar Snowflake context popover (clickable role / warehouse / db / schema editors, accessible without the explorer panel).
- Privilege-aware error UX in catalog explorer (`🔒 No access — role X lacks USAGE` + copy-able GRANT, instead of raw SQL error dumps).
- Engine auto-detection (suggest mode by default, auto mode opt-in).
- Vendor-aware SQL formatter (Snowflake / BigQuery / DuckDB via sql-formatter@10).

### Security
- **Encrypted credential storage**: AES-GCM with 256-bit device-bound key persisted in IndexedDB. AI API keys, OAuth tokens (Snowflake + BigQuery), OAuth client secrets when used, and Snowflake PATs are all encrypted at rest.
- **PKCE-only public OAuth client recommended for Snowflake**: setup defaults to `OAUTH_CLIENT_TYPE = 'PUBLIC'`. No client secret to store or leak.
- BigQuery OAuth state uses `crypto.randomUUID()`.
- Snowflake identifier interpolations hardened with `quoteSfIdent()` / `escapeSfLiteral()` helpers.

### Reliability
- **AbortSignal plumbing** through `BaseConnector.query()` for DuckDB, BigQuery, and Snowflake — cancelling a query now actually stops cloud-warehouse jobs server-side (Snowflake `cancel(handle)`, BigQuery `jobs.cancel`).
- OAuth refresh-token race coalesced via in-flight `refreshPromise`; concurrent expired-access-token requests share one `/oauth/token-request` call.
- Closing a tab mid-query aborts the in-flight query, stopping cloud-warehouse billing on dropped tabs.
- Per-tab streaming snapshot cache: LRU at 50 entries with 1h TTL.
- Snowflake row-count probe strips trailing semicolons before the `SELECT COUNT(*) FROM (sql)` wrap; previously parse-errored for any pasted query ending in `;`.
- Toast notifications use `role="alert"` for errors and `role="status"` otherwise (screen reader announce).

### Fixed
- Snowflake OAuth callback under Cross-Origin-Opener-Policy `same-origin`: `popup.closed` polling triggered false-positive "OAuth cancelled" rejects; now relies on three-channel delivery (BroadcastChannel + postMessage + localStorage poll) plus a 5-minute hard timeout.
- BigQuery OAuth popup callback reliable under COOP=same-origin (same fix class as above).
- Snowflake `isConnected()` honors refresh token (explorer was collapsing every ~10 min after access-token expiry).
- Cortex chat-array form (flat role-prefixed strings caused the model to echo `"ASSISTANT:"`).
- INFORMATION_SCHEMA query history fully qualifies the function call (was failing for roles lacking MONITOR USAGE).
- Aggregation regex missed `COUNT(*)` because `(` and `*` are both non-word characters.
- Snapshot cache cross-contamination across connectors (key now includes connector type).
- Stop Query button stuck on after cache-restore.
- Tab horizontal jiggle, tab order rotation, and three other latent v0.2.0 bugs.

## [0.2.0] - 2025-12-10

### Added
- DuckDB WASM integration as primary query engine (v1.31.0)
- BigQuery connector with OAuth 2.0 authentication (PKCE)
- File import from CSV, TSV, JSON, Parquet, Excel, JSONL
- Export results to CSV, JSON, and Parquet formats (Parquet via JSON intermediate)
- Monaco editor with syntax highlighting and autocomplete
- 10 color themes (Light, Dark, Dracula, etc.)
- Virtual scrolling for large result sets
- Persistent file handles via File System Access API
- Multi-tab SQL editor interface
- Cost estimation for BigQuery queries
- Materialization of query results to local DuckDB
- Test suite (unit + E2E)
- TypeScript strict mode

### Fixed
- XSS in hint rendering (DOMPurify sanitization)
- Alert dialogs replaced with logging

### Documentation
- ARCHITECTURE.md
- CONTRIBUTING.md
- SECURITY.md
- CODE_OF_CONDUCT.md
- README with screenshots

## [0.1.0] - 2025-11-15

### Added
- Initial project setup with Vite + React
- DuckDB WASM basic integration
- File handling infrastructure
- Web Worker for query execution
