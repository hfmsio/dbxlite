#!/usr/bin/env bash
#
# Copy DuckDB's browser bundles into the web client's public directory.
#
# The bundles ship inside @duckdb/duckdb-wasm, which the workspace already
# depends on, so this reads the copy the install just placed in node_modules.
# Fetching a second copy through a nested package manager cost three things:
# a download of something already on disk, a version resolved outside the
# lockfile that could differ from the one the app imports, and enough memory
# on top of the finished install to be killed on a 2 GiB build machine.

set -euo pipefail

TARGET_DIR="apps/web-client/public/duckdb"
# The workspace package that declares the dependency; resolution starts here
# because pnpm does not hoist it to the root.
RESOLVER_DIR="packages/duckdb-wasm-adapter"

# Resolve a file that is unambiguously inside dist/ rather than the package
# root: the package's "exports" map does not expose package.json.
DIST_DIR=$(node -e '
const path = require("path");
const entry = require.resolve("@duckdb/duckdb-wasm/dist/duckdb-browser.mjs", {
  paths: [path.resolve(process.argv[1])],
});
console.log(path.dirname(entry));
' "$RESOLVER_DIR" 2>/dev/null) || {
  echo "ERROR: cannot locate @duckdb/duckdb-wasm from $RESOLVER_DIR." >&2
  echo "Run the dependency install before this script." >&2
  exit 1
}

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: @duckdb/duckdb-wasm has no dist/ at $DIST_DIR" >&2
  echo "Run the dependency install before this script." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp "$DIST_DIR"/duckdb-*.wasm "$TARGET_DIR/"
cp "$DIST_DIR"/duckdb-browser-*.worker.js "$TARGET_DIR/"
cp "$DIST_DIR"/duckdb-browser*.mjs "$TARGET_DIR/"

# A silent partial copy would leave the app fetching a file that is not there.
for required in duckdb-eh.wasm duckdb-browser-eh.worker.js; do
  if [ ! -s "$TARGET_DIR/$required" ]; then
    echo "ERROR: $required missing after the copy" >&2
    exit 1
  fi
done

echo "duckdb-wasm bundles copied from $DIST_DIR"
ls -1 "$TARGET_DIR"
