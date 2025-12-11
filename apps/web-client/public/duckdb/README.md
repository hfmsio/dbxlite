# DuckDB WASM Files

This directory contains DuckDB WebAssembly bundles (~107 MB total).

## Auto-Downloaded (not in git)

Files are automatically downloaded when you run:
```bash
pnpm install  # Runs postinstall hook
```

Or manually:
```bash
bash scripts/download-duckdb-wasm.sh
```

## Files
- `duckdb-*.wasm` - WebAssembly modules (34-39 MB each)
- `duckdb-browser-*.worker.js` - Web Workers (667-886 KB each)
- `duckdb-browser*.mjs` - JavaScript loaders

## Why not in git?
These files total ~107 MB and would bloat the repository.
They're sourced from `@duckdb/duckdb-wasm` npm package instead.
