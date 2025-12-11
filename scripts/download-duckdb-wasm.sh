#!/usr/bin/env bash

set -e

TARGET_DIR="apps/web-client/public/duckdb"
PACKAGE="@duckdb/duckdb-wasm"
# Use the version specified in package.json (^1.28.0, which resolves to latest compatible)
VERSION="^1.28.0"

echo "→ Preparing directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "→ Creating temp workspace..."
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "→ Initializing temp npm project..."
npm init -y >/dev/null 2>&1

echo "→ Installing $PACKAGE@$VERSION ..."
npm install "$PACKAGE@$VERSION" >/dev/null 2>&1

DIST_DIR="node_modules/@duckdb/duckdb-wasm/dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "❌ ERROR: Could not find dist/ folder inside NPM package."
  exit 1
fi

echo "→ Copying WASM + worker bundles to $OLDPWD/$TARGET_DIR ..."
cp "$DIST_DIR"/duckdb-*.wasm "$OLDPWD/$TARGET_DIR/" 2>/dev/null || true
cp "$DIST_DIR"/duckdb-browser-*.worker.js "$OLDPWD/$TARGET_DIR/" 2>/dev/null || true
cp "$DIST_DIR"/duckdb-browser*.mjs "$OLDPWD/$TARGET_DIR/" 2>/dev/null || true

echo "→ Cleaning up..."
cd - >/dev/null
rm -rf "$TMP_DIR"

echo "✅ Done!"
echo "Your bundles are now in $TARGET_DIR:"
ls -1 "$TARGET_DIR"

