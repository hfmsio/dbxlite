#!/usr/bin/env bash
set -e

TAG="v1.29.0"
REPO="duckdb/duckdb-wasm"

FILES=(
  "duckdb-wasm-eh.wasm"
  "duckdb-wasm-eh.worker.js"
  "duckdb-wasm-eh.js"
)

DEST_DIR="./apps/web-client/public/duckdb"
mkdir -p "$DEST_DIR"

echo "Downloading DuckDB WASM bundle for $TAG …"

for FILE in "${FILES[@]}"; do
  URL="https://github.com/$REPO/releases/download/$TAG/$FILE"
  DEST="$DEST_DIR/$FILE"

  echo " → $FILE"
  curl -L -o "$DEST" "$URL"
done

echo "✅ DuckDB WASM bundle installed into $DEST_DIR"

