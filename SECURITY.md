# Security Policy

## Supported Versions
- Latest release on `main`
- Previously tagged releases still in active use may receive fixes at maintainers' discretion

## Reporting a Vulnerability
- Please submit a private report via GitHub Security Advisories (Security → Report a vulnerability) so maintainers can triage and respond discreetly.
- Include: vulnerability description, reproduction steps, and potential impact

## What to Expect
- We aim to acknowledge new reports within 3 business days.
- After triage, we will provide a remediation plan or mitigation timeline and follow up when a fix ships.
- When appropriate, we will coordinate a public disclosure once a patch is available.

## Threat Model

dbxlite is a **browser-resident** SQL workbench. It runs in your browser, talks directly to user-provided databases (DuckDB WASM, BigQuery, Snowflake), and (in WASM mode) keeps your data on your machine. No application server processes user data; the only server-side runtime in the OSS deployment is a thin Snowflake CORS proxy that forwards requests with no logging of query bodies.

### What is protected
- **AI provider API keys, OAuth tokens, OAuth client secrets** are stored in `localStorage` encrypted with AES-GCM using a 256-bit device-bound key persisted in IndexedDB. This protects against casual reading of localStorage exports, malicious browser extensions without IndexedDB access, and dev-tools paste leaks.
- **OAuth flows** use PKCE (RFC 7636) with cryptographically random state. Snowflake supports public-client (`OAUTH_CLIENT_TYPE = 'PUBLIC'`, recommended) so no secret needs to be stored at all.
- **SQL identifier interpolation** uses dialect-aware quoting (`"name"`, doubled `""` for embedded quotes) and literal escaping (doubled `''` for embedded apostrophes).
- **Markdown rendering of AI responses** uses React text nodes only; user-supplied content rendered to HTML elsewhere passes through DOMPurify.

### What is NOT protected
- **XSS in the same origin**. Any malicious script running in dbxlite's origin can read the device key from IndexedDB and decrypt stored credentials. Do not run dbxlite alongside untrusted scripts on the same origin.
- **Full filesystem access on the user's machine.** A local attacker can read the IndexedDB store directly.
- **Browser extensions with site-data permission.** Extensions can read both localStorage and IndexedDB.
- **Shoulder-surfing / screen capture.** Plaintext credentials are entered into setup forms and visible during entry.

### Boundary summary
| Boundary | Crosses what | Protection |
|---|---|---|
| Browser ↔ Snowflake | OAuth tokens, queries, results | TLS + Vercel Edge proxy (account-whitelist regex; no logging of bodies) |
| Browser ↔ BigQuery | OAuth tokens, queries, results | TLS direct (Google supports CORS) |
| Browser ↔ AI provider | API key, prompts, completions | TLS direct (provider's CORS rules); Gemini sends key as URL param per Google's API design |
| Browser ↔ DuckDB WASM | Local-only | None needed (in-process) |

### Hardening recommendations
- Use Snowflake `OAUTH_CLIENT_TYPE = 'PUBLIC'` rather than `'CONFIDENTIAL'` whenever possible — eliminates the secret entirely.
- Run dbxlite on a dedicated origin without other apps mounted.
- Set short OAuth refresh token validity (`OAUTH_REFRESH_TOKEN_VALIDITY = 7776000` is 90 days; consider less for shared machines).
- For self-hosted deployments, set conservative HTTP cache and CSP headers; the Snowflake CORS proxy in `dbxlite-cloud` sets COOP/COEP for cross-origin isolation.
