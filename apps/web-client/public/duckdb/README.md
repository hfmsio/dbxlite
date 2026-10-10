# DuckDB WASM Files

This directory contains DuckDB WebAssembly bundles (~107 MB total).

## Copied from node_modules (not in git)

Files are copied out of the installed `@duckdb/duckdb-wasm` package when you
run:
```bash
pnpm install  # Runs postinstall hook
```

Or manually, after the install:
```bash
bash scripts/download-duckdb-wasm.sh
```

## Files
- `duckdb-*.wasm` - WebAssembly modules (34-39 MB each)
- `duckdb-browser-*.worker.js` - Web Workers (667-886 KB each)
- `duckdb-browser*.mjs` - JavaScript loaders

## Why not in git?
These files total ~107 MB and would bloat the repository. They come from the
`@duckdb/duckdb-wasm` package the workspace already depends on, at the version
the lockfile pins, so the bundles served always match the JavaScript that
drives them.
