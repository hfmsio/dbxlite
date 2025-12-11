# Contributing to dbxlite

## Quick Start

```bash
git clone https://github.com/hfmsio/dbxlite.git
cd dbxlite
pnpm install    # Downloads DuckDB WASM automatically
pnpm dev        # http://localhost:5173
```

**Requirements:** Node.js 18+, pnpm 8+

## Development Workflow

1. Create a branch: `git checkout -b feature/your-feature`
2. Make changes and add tests
3. Run tests: `pnpm test` and `pnpm e2e`
4. Commit using conventional format (see below)
5. Open a pull request

## Commit Messages

We use [conventional commits](https://www.conventionalcommits.org/):

```
feat(editor): add SQL auto-formatting

- Integrate prettier-plugin-sql
- Add keyboard shortcut Cmd+Shift+F

Closes #123
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

## Testing

```bash
pnpm test       # Unit tests (Vitest)
pnpm e2e        # E2E tests (Playwright)
pnpm e2e:ui     # Interactive mode
```

## Adding Connectors

dbxlite runs in-browser, so connectors must use HTTP/REST APIs (not TCP):

| Platform | API | Status |
|----------|-----|--------|
| DuckDB WASM | In-browser | Implemented |
| BigQuery | REST + OAuth | Implemented |
| Snowflake | SQL REST API | Planned |
| Supabase | PostgREST | Candidate |

See `packages/connectors/src/bigquery/` for implementation reference.

**Why no PostgreSQL/MySQL?** Browsers can't create TCP sockets. Use REST-based alternatives like Supabase (PostgREST over PostgreSQL).

## Code Style

- TypeScript strict mode, avoid `any`
- Functional React components with hooks
- Colocate tests with source files
- Follow existing patterns in codebase

## License

Contributions are licensed under MIT.
