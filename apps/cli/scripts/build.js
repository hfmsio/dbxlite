#!/usr/bin/env node

/**
 * Build script for dbxlite-ui npm package
 *
 * 1. Copies CLI script to dist/
 * 2. Copies web-client build to assets/
 */

import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
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

// Copy web-client assets
console.log('Copying web-client assets...');
cpSync(WEB_CLIENT_DIST, assetsDir, { recursive: true });

// Drop the public/duckdb/.gitignore that tags along from the web-client tree.
// That .gitignore says "ignore *" (the wasm files are auto-downloaded), and
// npm publish honors .gitignore when no .npmignore is present, so it was
// silently excluding the actual .wasm/.worker.js files from the npm tarball.
const rogueGitignore = join(assetsDir, 'duckdb', '.gitignore');
if (existsSync(rogueGitignore)) {
  rmSync(rogueGitignore);
  console.log('Removed assets/duckdb/.gitignore (was excluding wasm files from publish)');
}

console.log('\nBuild complete!');
console.log(`  dist/cli.js - CLI entry point`);
console.log(`  assets/ - Web UI files`);
console.log('\nTo test locally:');
console.log('  node dist/cli.js');
console.log('\nTo publish:');
console.log('  npm publish');
