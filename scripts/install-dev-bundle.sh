#!/bin/sh
# Place your tested duckdb-wasm bundle file named 'duckdb-wasm-dev.wasm' into scripts/bundles/
# This script will copy it into apps/web-client/public/duckdb/duckdb-wasm.wasm
SRC="./scripts/bundles/duckdb-wasm-dev.wasm"
DST="./apps/web-client/public/duckdb/duckdb-wasm.wasm"
if [ ! -f "$SRC" ]; then
  echo "Bundle not found at $SRC. Place your bundle there and re-run."
  exit 1
fi
mkdir -p "$(dirname "$DST")"
cp "$SRC" "$DST"
echo "Copied $SRC to $DST"
