#!/usr/bin/env node

/**
 * dbxlite-ui CLI
 *
 * Three modes of operation:
 *
 * 1. Hosted (recommended):
 *    export ui_remote_url="https://sql.dbxlite.com"
 *    duckdb -unsigned -ui
 *
 * 2. Local asset server:
 *    npx dbxlite-ui --serve              # Runs server, user runs duckdb separately
 *
 * 3. All-in-one:
 *    npx dbxlite-ui                      # Starts server + duckdb + opens browser
 *    npx dbxlite-ui mydata.duckdb        # With specific database
 */

import { createServer } from 'http';
import { spawn } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOSTED_URL = 'https://sql.dbxlite.com';
const DEFAULT_PORT = 8080;

// Parse command line arguments
const args = process.argv.slice(2);
let databasePath = null;
let assetPort = DEFAULT_PORT; // Default to 8080
let noBrowser = false;
let launchDuckDB = false; // --launch flag to also start DuckDB
let showInfo = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' && args[i + 1]) {
    assetPort = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--no-browser') {
    noBrowser = true;
  } else if (arg === '--launch' || arg === '-l') {
    launchDuckDB = true;
  } else if (arg === '--info' || arg === '-i') {
    showInfo = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
dbxlite-ui - Local UI for DuckDB

USAGE:

  npx dbxlite-ui              Start asset server on port 8080
                              Then run: duckdb -unsigned -ui

  npx dbxlite-ui --launch     Start server + DuckDB + open browser

ALTERNATIVE (no install):

  export ui_remote_url="${HOSTED_URL}"
  duckdb -unsigned -ui

OPTIONS:

  --port <port>   Asset server port (default: ${DEFAULT_PORT})
  --launch, -l    Also start DuckDB and open browser
  --no-browser    Don't open browser (with --launch)
  --info, -i      Show setup instructions
  -h, --help      Show this help

EXAMPLES:

  dbxlite-ui                       Start asset server on :8080
  dbxlite-ui --port 9000           Start on custom port
  dbxlite-ui --launch              Start server + DuckDB + browser
  dbxlite-ui --launch data.duckdb  With specific database
`);
    process.exit(0);
  } else if (!arg.startsWith('-')) {
    databasePath = arg;
    launchDuckDB = true; // If database provided, assume --launch
  }
}

// Show info/setup instructions
if (showInfo) {
  console.log(`
dbxlite-ui - Setup Instructions

OPTION 1: Use hosted version (easiest)
─────────────────────────────────────
Add to your shell config (~/.zshrc or ~/.bashrc):

  export ui_remote_url="${HOSTED_URL}"

Then run:

  duckdb -unsigned -ui


OPTION 2: Run local asset server
────────────────────────────────
Terminal 1 - Start server:

  npx dbxlite-ui --serve

Terminal 2 - Use DuckDB:

  export ui_remote_url="http://127.0.0.1:8080"
  duckdb -unsigned -ui


OPTION 3: All-in-one command
────────────────────────────
  npx dbxlite-ui [database.duckdb]

This starts the asset server, DuckDB, and opens your browser.
`);
  process.exit(0);
}

// MIME types for serving assets
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Find assets directory (in dev: ../web-client/dist, in published: ./assets)
function findAssetsDir() {
  // Check for published package structure
  const publishedPath = join(__dirname, '..', 'assets');
  if (existsSync(publishedPath)) {
    return publishedPath;
  }

  // Check for dev structure (sibling web-client)
  const devPath = join(__dirname, '..', '..', 'web-client', 'dist');
  if (existsSync(devPath)) {
    return devPath;
  }

  console.error('Error: Could not find assets directory.');
  console.error('Run "pnpm build" in apps/web-client first.');
  process.exit(1);
}

const ASSETS_DIR = findAssetsDir();
console.log(`Assets directory: ${ASSETS_DIR}`);

// Create asset server
const server = createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = join(ASSETS_DIR, urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ASSETS_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': 9 });
      res.end('Not found');
      return;
    }

    const content = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch (err) {
    console.error(`Error serving ${urlPath}:`, err.message);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// Start server (and optionally DuckDB)
server.listen(assetPort, '127.0.0.1', async () => {
  const port = server.address().port;

  // Default mode: just run the asset server
  if (!launchDuckDB) {
    console.log(`
dbxlite asset server running on http://127.0.0.1:${port}

Next step - run DuckDB with dbxlite UI:

  export ui_remote_url="http://127.0.0.1:${port}"
  duckdb -unsigned -ui

Tip: Add to ~/.zshrc or ~/.bashrc for permanent setup:

  export ui_remote_url="http://127.0.0.1:${port}"

Press Ctrl+C to stop the server.
`);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down asset server...');
      server.close();
      process.exit(0);
    });

    return; // Don't start DuckDB
  }

  // Launch mode: start DuckDB too
  console.log(`Asset server running on http://127.0.0.1:${port}`);

  // Check if duckdb is available
  const duckdbPath = 'duckdb'; // Assume it's in PATH

  // Build DuckDB command
  // Use -cmd to load UI and start it, keeping DuckDB in interactive mode
  const duckdbArgs = ['-unsigned'];
  if (databasePath) {
    duckdbArgs.unshift(databasePath);
  }

  // Add commands to load UI extension and start it
  duckdbArgs.push('-cmd', 'LOAD ui; CALL start_ui();');

  console.log(`Starting DuckDB with dbxlite UI...`);
  if (databasePath) {
    console.log(`Database: ${databasePath}`);
  }

  // Start DuckDB with ui_remote_url pointing to our server
  // Use stdio 'inherit' for interactive mode
  const duckdb = spawn(duckdbPath, duckdbArgs, {
    env: {
      ...process.env,
      ui_remote_url: `http://127.0.0.1:${port}`,
    },
    stdio: 'inherit',
    // Ensure DuckDB gets a proper TTY for interactive mode
    detached: false,
  });

  duckdb.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('\nError: DuckDB not found in PATH');
      console.error('Install DuckDB: https://duckdb.org/docs/installation/');
    } else {
      console.error('Failed to start DuckDB:', err.message);
    }
    server.close();
    process.exit(1);
  });

  duckdb.on('close', (code) => {
    console.log(`\nDuckDB exited with code ${code}`);
    server.close();
    process.exit(code || 0);
  });

  // Open browser after a short delay
  if (!noBrowser) {
    setTimeout(async () => {
      try {
        const open = (await import('open')).default;
        await open('http://localhost:4213');
        console.log('Opened browser at http://localhost:4213');
      } catch (err) {
        console.log('Open http://localhost:4213 in your browser');
      }
    }, 1000);
  } else {
    console.log('Open http://localhost:4213 in your browser');
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    duckdb.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    duckdb.kill('SIGTERM');
  });
});

server.on('error', (err) => {
  console.error('Failed to start asset server:', err.message);
  process.exit(1);
});
