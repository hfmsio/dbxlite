#!/bin/bash
# Comprehensive installation script for Browser-native Data IDE

set -e

echo "========================================="
echo "Browser-native Data IDE - Installation"
echo "========================================="
echo ""

# Check for required tools
echo "→ Checking for required tools..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Please install Node.js first."; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
  exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check for pnpm, install if missing
if ! command -v pnpm >/dev/null 2>&1; then
  echo "→ pnpm not found. Installing pnpm..."
  if command -v npm >/dev/null 2>&1; then
    npm install -g pnpm
    echo "✅ pnpm installed successfully"
  else
    echo "❌ npm is required to install pnpm. Please install Node.js with npm first."
    exit 1
  fi
else
  echo "✅ pnpm $(pnpm -v) detected"
fi
echo ""

# Install dependencies
echo "→ Installing dependencies..."
pnpm install

echo ""
echo "→ Downloading DuckDB WASM bundles..."

# Download DuckDB bundles
if [ -x "./scripts/download-duckdb-wasm.sh" ]; then
  bash ./scripts/download-duckdb-wasm.sh
else
  # Fallback: download manually
  echo "→ Downloading DuckDB bundles manually..."
  TARGET_DIR="apps/web-client/public/duckdb"
  mkdir -p "$TARGET_DIR"

  TMP_DIR=$(mktemp -d)
  cd "$TMP_DIR"
  npm init -y >/dev/null 2>&1
  npm install @duckdb/duckdb-wasm@^1.28.0 >/dev/null 2>&1

  DIST_DIR="node_modules/@duckdb/duckdb-wasm/dist"

  if [ -d "$DIST_DIR" ]; then
    # Copy all DuckDB WASM bundles (mvp, eh, coi) and their workers
    cp "$DIST_DIR"/duckdb-*.wasm "$OLDPWD/$TARGET_DIR/" 2>/dev/null || true
    cp "$DIST_DIR"/duckdb-browser-*.worker.js "$OLDPWD/$TARGET_DIR/" 2>/dev/null || true
    cp "$DIST_DIR"/duckdb-browser*.mjs "$OLDPWD/$TARGET_DIR/" 2>/dev/null || true
    echo "✅ DuckDB bundles downloaded"
  fi

  cd "$OLDPWD"
  rm -rf "$TMP_DIR"
fi

echo ""
echo "========================================="
echo "✅ Installation complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Start development server:"
echo "     pnpm --filter web-client dev"
echo ""
echo "  2. Open http://localhost:5173 in your browser"
echo ""
echo "  3. Run tests:"
echo "     pnpm --filter web-client test       # Unit tests"
echo "     pnpm --filter web-client e2e        # E2E tests"
echo ""
echo "Features:"
echo "  • DuckDB WASM (local in-browser queries)"
echo "  • BigQuery connector (OAuth 2.0)"
echo "  • Encrypted credential vault"
echo "  • SQL editor with syntax highlighting"
echo "  • Query result grid"
echo ""
