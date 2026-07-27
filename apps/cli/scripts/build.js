#!/usr/bin/env node

/**
 * Build script for dbxlite-ui npm package
 *
 * 1. Copies CLI script to dist/
 * 2. Copies web-client build to assets/
 */

import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname, extname, basename, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WEB_CLIENT_DIST = join(ROOT, '..', 'web-client', 'dist');

console.log('Building dbxlite-ui package...\n');

// Check web-client build exists
if (!existsSync(WEB_CLIENT_DIST)) {
  console.error('Error: web-client not built.');
  console.error('Run: cd ../web-client && pnpm build');
  process.exit(1);
}

// Clean previous build
const distDir = join(ROOT, 'dist');
const assetsDir = join(ROOT, 'assets');

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
if (existsSync(assetsDir)) {
  rmSync(assetsDir, { recursive: true });
}

// Create directories
mkdirSync(distDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

// Copy CLI script
console.log('Copying CLI script...');
cpSync(join(ROOT, 'src', 'cli.js'), join(distDir, 'cli.js'));

// Copy web-client assets, excluding files the CLI-served app never loads so
// the npm tarball stays lean. The app forces DuckDB's EH bundle
// (see web-client worker.ts), so the mvp (legacy no-EH) and coi (threaded /
// SharedArrayBuffer) WASM bundles and their workers are dead weight — ~72 MB.
// Screenshots are GitHub/README images, not served at runtime.
const EXCLUDE_FROM_PACKAGE = new Set([
  'duckdb-mvp.wasm',
  'duckdb-coi.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-browser-coi.worker.js',
  'duckdb-browser-coi.pthread.worker.js',
]);

console.log('Copying web-client assets...');
cpSync(WEB_CLIENT_DIST, assetsDir, {
  recursive: true,
  filter: (src) => {
    if (EXCLUDE_FROM_PACKAGE.has(basename(src))) return false;
    // Drop the screenshots directory (docs images, never served).
    if (relative(WEB_CLIENT_DIST, src).split(sep).includes('screenshots')) {
      return false;
    }
    return true;
  },
});

// Drop the public/duckdb/.gitignore that tags along from the web-client tree.
// That .gitignore says "ignore *" (the wasm files are auto-downloaded), and
// npm publish honors .gitignore when no .npmignore is present, so it was
// silently excluding the actual .wasm/.worker.js files from the npm tarball.
const rogueGitignore = join(assetsDir, 'duckdb', '.gitignore');
if (existsSync(rogueGitignore)) {
  rmSync(rogueGitignore);
  console.log('Removed assets/duckdb/.gitignore (was excluding wasm files from publish)');
}

// Secret-scan the tarball contents before allowing the publish to
// proceed. Catches accidentally-shipped private keys, API tokens, etc.
// Run on text-like extensions only; binaries (.wasm, .png, fonts) are
// not human-typed and can't carry pasted secrets in a meaningful way.
const SECRET_PATTERNS = [
  // Private-key headers
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  // Common API-key shapes
  /\bsk-[A-Za-z0-9_-]{20,}/,           // OpenAI / Anthropic-style
  /\bxoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+/, // Slack bot tokens
  /\bAIza[0-9A-Za-z_-]{35}/,           // Google API keys
  /\bAKIA[0-9A-Z]{16}/,                // AWS access key IDs
  /\bghp_[A-Za-z0-9]{36}/,             // GitHub personal-access tokens
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT
];
const TEXT_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.md', '.html', '.css', '.txt', '.svg',
]);

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkFiles(p);
    else yield p;
  }
}

console.log('\nScanning packaged assets for accidentally-shipped secrets...');
const hits = [];
for (const filePath of walkFiles(assetsDir)) {
  if (!TEXT_EXTS.has(extname(filePath).toLowerCase())) continue;
  const content = readFileSync(filePath, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      hits.push({ file: filePath, pattern: pattern.toString(), sample: match[0].slice(0, 30) + '...' });
    }
  }
}
if (hits.length > 0) {
  console.error('\n❌ Secret-scan found suspicious patterns in the publish tarball:');
  for (const h of hits) {
    console.error(`  - ${h.file}: matched ${h.pattern} ("${h.sample}")`);
  }
  console.error('\nReview each match. If a false positive, refine SECRET_PATTERNS in scripts/build.js.');
  process.exit(1);
}
console.log('  → no suspicious patterns found');

console.log('\nBuild complete!');
console.log(`  dist/cli.js - CLI entry point`);
console.log(`  assets/ - Web UI files`);
console.log('\nTo test locally:');
console.log('  node dist/cli.js');
console.log('\nTo publish:');
console.log('  npm publish');
