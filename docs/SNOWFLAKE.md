# Snowflake — design and contributor reference

> Public-facing design doc for the Snowflake feature. Open work, plans,
> and operational deploy notes live elsewhere — see *Status and open work*
> at the bottom.
>
> If the doc disagrees with the code, the code is right and the doc
> needs an update.

## Concept

dbxlite is a browser-native SQL utility. The Snowflake feature lets users
connect to a Snowflake account, browse its catalog, and run queries from
the same editor they use for DuckDB and BigQuery.

**Goals**:
- Feel native to Snowflake users (Snowsight-comparable workflow ergonomics)
- Zero server (everything runs in the browser; the only server piece is a
  thin CORS proxy in production)
- Reuse dbxlite's existing query editor, result pane, settings UI, etc.
- Provide an abstraction that's straightforward to extend to a 4th cloud
  warehouse (Databricks, Redshift, etc.) without rewriting UI

**Non-goals (this iteration)**:
- Replacing Snowsight for power features (worksheet sharing, dashboards,
  account admin, Streamlit integration)
- Server-side execution
- Connection pooling for multiple concurrent Snowflake users

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web-client (browser)                                   │
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────────┐   │
│  │  SnowflakeSetupDialog│    │  CatalogExplorer         │   │
│  │  (one-time OAuth)    │    │  (generic, any provider) │   │
│  └──────────┬───────────┘    └────────────┬─────────────┘   │
│             │                              │                 │
│             └──────────────┬───────────────┘                 │
│                            ▼                                 │
│            ┌───────────────────────────────┐                 │
│            │  SnowflakeCatalogProvider     │                 │
│            │  implements CatalogProvider   │                 │
│            └───────────────┬───────────────┘                 │
│                            ▼                                 │
│         streaming-query-service.ts                           │
│         (setupSnowflake / restoreSnowflakeConnection /       │
│          isSnowflakeConnected / getSnowflake* helpers)       │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/connectors                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SnowflakeConnector implements CloudConnector        │   │
│  │  - OAuth 2.0 PKCE + state                            │   │
│  │  - retry with exp backoff on 408/429/503             │   │
│  │  - partition iteration                               │   │
│  │  - parseSnowflakeValue (FIXED scale, TIMESTAMP_*)    │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐   │
│  │  RequestTransport (interface) + BrowserTransport     │   │
│  │  routes Snowflake URLs through proxy when localhost  │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼──────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Dev:  Vite middleware  /api/snowflake/<acct>/* → upstream  │
│  Prod: Vercel Edge Function (in dbxlite-cloud repo, same    │
│        path contract — no client code change)               │
└─────────────────────────┬──────────────────────────────────┘
                          ▼
                Snowflake REST API
                /api/v2/statements, /oauth/token-request, …
```

### Key decisions

1. **OAuth 2.0 with PKCE** — matches how BigQuery is wired, no Snowflake-CLI
   dependency, no shared password.
2. **`session:role:<ROLE>` scope is mandatory** — sending an empty scope
   produces an opaque "invalid consent request" error. The form defaults
   role to `PUBLIC`.
3. **Triple-channel callback** (BroadcastChannel → postMessage →
   localStorage poll + storage events) so OAuth completes reliably under
   COOP=same-origin / COEP=credentialless. 5-second grace on `popup.closed`
   to absorb transient cross-origin redirects.
4. **Always include `warehouse` in statement body** — Snowflake rejects
   queries without it, and includes a clearer error than if absent.
5. **Real partition iteration** — old reference code only yielded the first
   partition (silent truncation on >1M rows). Our `query()` loops
   `resultSetMetaData.partitionInfo`, fetching `/statements/:handle?partition=N`
   per partition; chunk semantics (schema first, queryStats last,
   `done: true` only on last chunk) match BigQuery exactly.
6. **`RequestTransport` seam** — inline localhost-detection would lock us
   into the dev proxy. Constructor takes an optional transport; default
   `BrowserTransport` rewrites `*.snowflakecomputing.com` → `/api/snowflake/<acct>/...`
   on `localhost`. Production `BrowserTransport` (when origin is non-localhost)
   leaves URLs untouched, hitting the same `/api/snowflake/...` path served
   by the Vercel Edge Function.
7. **`CatalogProvider` abstraction** — built when Snowflake became the third
   catalog source (rule of three). Generic `CatalogExplorer` component
   renders any `CatalogProvider`. BigQuery sketch validates the interface
   fits its quirks (three-part backticks, pinned projects, cost estimation).
   BigQuery migration is a future ticket.

### Wire format learnings (preserved in `parseSnowflakeValue`)

- All scalars arrive as strings; numerics need explicit parsing
- `FIXED` scale 0 → integer; scale > 0 → keep as string for precision
- `VARIANT`/`OBJECT`/`ARRAY` arrive as JSON-encoded strings
- `BOOLEAN` may be `'true'` / `'false'` / `true` / `false` / `1` / `0`
- `TIMESTAMP_LTZ` / `_NTZ` / `_TZ` are nanosecond-epoch strings (TZ adds
  ` offset_minutes` suffix)
- `SHOW COLUMNS` returns `data_type` as a JSON blob, not a plain type name
- Empty result sets must guard both `data` and `rowType`

## Known limitations

Ship-time facts. Follow-up work tracked in GitHub Issues; PRs welcome.

- 10 BigQuery OAuth tests `.skip`'d — jest event-loop semantics didn't translate cleanly to vitest + jsdom. Diagnostic-led un-skip pending.
- BigQuery still uses the legacy `BigQueryExplorer.tsx` — UX asymmetry vs Snowflake (no quick-switch dropdowns, no compute badge, no column preview / search / history). Migration to `CatalogProvider` planned.
- DuckDB-attached databases use the legacy explorer path; migration depends on the BigQuery `CatalogProvider` migration landing first.
- No static fitness function for "active connector leaks" — pre-release audit caught the sites that needed pinning, but defense-in-depth would be cleaner.
- Polling on Snowflake state (compute status, query history, dropdown options) uses independent timers; consolidation into a single source of truth would reduce overhead.

## Adding a new connector — using Snowflake as a worked example

The `CatalogProvider` abstraction (`apps/web-client/src/providers/catalog/types.ts`) is designed for vendor-neutral extension. To add a 4th connector (Databricks, Redshift, etc.):

1. **Connector layer** (`packages/connectors/`): implement `CloudConnector` (see `snowflake-connector.ts` as reference). Auth, retry, type coercion, and a `query()` async generator yielding the chunk protocol that BigQuery and Snowflake already share.
2. **Transport** (`packages/connectors/src/transport.ts`): if the vendor's API needs a CORS proxy, add a URL-rewrite branch in `BrowserTransport`. Otherwise the default passes through.
3. **Type normalization** (`apps/web-client/src/utils/dataTypes.ts`): add `normalize<Vendor>Type()` mapping the wire types into the unified `DataType` enum. Snowflake's mapping (FIXED → DECIMAL, TIMESTAMP_LTZ → TIMESTAMPTZ, VARIANT → JSON) is a useful template.
4. **`CatalogProvider` implementation** (`apps/web-client/src/providers/catalog/<vendor>CatalogProvider.ts`): implement schema discovery, session-context switching, query history, compute lifecycle. Set `catalogTerm`, accent color, capability flags. The generic `CatalogExplorer` renders it without further changes.
5. **OAuth callback** (if cloud): add a multi-page Vite entry like `oauth-callback.html` for popup destination.
6. **Engine detection** (`apps/web-client/src/utils/engineDetectors/<vendor>.ts`): regex patterns + weights for syntax-routing.
7. **Tests**: parameterize the existing `BaseConnector` contract test (`packages/connectors/src/__tests__/contract.test.ts`) over your connector + add vendor-specific edge cases.

Wire-format quirks to expect: every cloud warehouse has them. The Snowflake list above (FIXED scale, TIMESTAMP_LTZ epoch strings, VARIANT-as-string, BOOLEAN polymorphism, empty-result-set guard) is representative of the kind of investigation each new connector requires. Capture yours in code comments, not docs that decay.

## Operations — local development

```bash
cd ~/dev/dbxlite
pnpm dev
# Visit http://localhost:5173 (or 5174 if 5173 is taken)
# Settings → Connections → Snowflake → Configure
```

### One-time Snowflake account setup

In a worksheet as `ACCOUNTADMIN`:

```sql
-- Recommended: PUBLIC client type (PKCE-only, no secret to leak).
-- RFC 8252 §8.5 — browser apps shouldn't store client secrets.
CREATE OR REPLACE SECURITY INTEGRATION DBXLITE_LOCAL
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'PUBLIC'
  OAUTH_REDIRECT_URI = 'http://localhost:5173/oauth-callback.html'
  OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE  -- only for http dev
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;

DESCRIBE SECURITY INTEGRATION DBXLITE_LOCAL;
-- Copy the OAUTH_CLIENT_ID. Leave the Client Secret field blank.

-- If using PUBLIC role with default warehouse, grant access:
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE PUBLIC;

-- Set warehouse auto-suspend tight to avoid idle credit burn:
ALTER WAREHOUSE COMPUTE_WH SET AUTO_SUSPEND = 60;
```

For backward compatibility, `OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'` still works — use `SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('DBXLITE_LOCAL')` to reveal the secret and paste it into the dialog. The secret is stored at rest with AES-GCM (device-bound key in IndexedDB), but a public client is the safer default.

The setup dialog includes a copy-paste-ready guide with this SQL inline; the redirect URI is rendered live from `window.location.origin`.

## Status

This doc is **frozen reference material** — it describes the design and the shipped feature. For active work, see GitHub Issues; for shipped history, see `git log`.
