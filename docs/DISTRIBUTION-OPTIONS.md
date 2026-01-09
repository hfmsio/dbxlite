# Distribution Options for dbxlite as DuckDB UI

This document explores options for distributing dbxlite as a DuckDB UI replacement.

## Can We Use the Extension Marketplace?

**Short answer: No, not directly.**

The DuckDB Community Extensions system is designed for C++ compiled extensions, not UI replacements. The UI extension itself is a core extension maintained by MotherDuck, and there's no plugin system for registering alternative UI frontends.

## Distribution Options

### Option 1: Hosted Service (Recommended)

Host dbxlite on a public URL and instruct users to configure DuckDB to use it.

**Setup:**
```bash
# User runs:
export ui_remote_url="https://dbxlite.example.com"
duckdb -unsigned -ui
```

**Pros:**
- No installation required for users
- Automatic updates when you deploy
- Works with any DuckDB installation

**Cons:**
- Requires `-unsigned` flag (security implication)
- Users must trust your hosted version
- Requires hosting infrastructure

**Deployment options:**
- Vercel, Netlify, Cloudflare Pages (static hosting)
- GitHub Pages
- Self-hosted nginx/caddy

### Option 2: Local NPX Command

Create an npm package that starts the asset server and DuckDB together.

```bash
npx dbxlite-ui
# or
npx dbxlite-ui --database mydata.duckdb
```

**Implementation sketch:**
```javascript
#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// 1. Start asset server on random port
const server = createAssetServer();
const port = server.address().port;

// 2. Start DuckDB with ui_remote_url
const duckdb = spawn('duckdb', ['-unsigned', '-cmd', `LOAD ui; SET ui_remote_url='http://127.0.0.1:${port}'; CALL start_ui();`], {
  env: { ...process.env },
  stdio: 'inherit'
});

// 3. Open browser
import('open').then(open => open.default('http://localhost:4213'));
```

**Pros:**
- Single command to run
- Works offline after install
- Users get a specific version

**Cons:**
- Requires Node.js
- Users must install the package
- Still requires `-unsigned` flag

### Option 3: Standalone Executable

Bundle dbxlite assets with a Go/Rust HTTP server into a single binary.

```bash
# Download and run
./dbxlite-ui
```

**Pros:**
- No dependencies (except DuckDB)
- Single file distribution
- Cross-platform binaries

**Cons:**
- Larger binary size (~10-20MB)
- More complex build process
- Manual updates

### Option 4: Docker Image

Package everything in a Docker container.

```bash
docker run -p 4213:4213 -v $(pwd):/data dbxlite/ui
```

**Pros:**
- Complete isolation
- Includes DuckDB
- Easy deployment

**Cons:**
- Requires Docker
- Larger download
- Container overhead

### Option 5: Fork duckdb-ui Extension

Fork the official duckdb-ui repository and modify it to bundle dbxlite instead of the default UI.

**Pros:**
- Could potentially be distributed as a proper extension
- No `-unsigned` flag needed if signed
- Seamless `duckdb -ui` experience

**Cons:**
- Requires maintaining C++ code
- Must track upstream changes
- Complex build process
- Unlikely to be accepted into core extensions

## Comparison Matrix

| Option | Ease of Use | Offline | No Unsigned | Auto-Update |
|--------|-------------|---------|-------------|-------------|
| Hosted Service | High | No | No | Yes |
| NPX Command | Medium | Yes | No | On install |
| Standalone Binary | High | Yes | No | No |
| Docker | Medium | Yes | Yes* | On pull |
| Fork Extension | High | Yes | Yes | On install |

*Docker bundles its own DuckDB, bypassing the flag requirement

## Recommended Approach

For maximum reach with minimum friction:

1. **Primary:** Host on Vercel/Netlify with custom domain
   - Users just set one environment variable
   - Zero installation

2. **Secondary:** Publish NPX package for offline use
   - `npx dbxlite-ui` for quick start
   - Full package install for regular use

3. **Future:** If DuckDB adds a UI plugin system, integrate with that

## Security Considerations

The `-unsigned` flag requirement exists because custom UIs have full access to:
- All data loaded in DuckDB
- File system access (via DuckDB's file operations)
- Network access (via httpfs extension)

When distributing dbxlite:
- Clearly document the security implications
- Use HTTPS for hosted versions
- Consider code signing for binaries
- Be transparent about data handling

## Feature Request to DuckDB

Consider opening a GitHub discussion requesting:
1. UI plugin system for registering alternative frontends
2. Signed third-party UI extensions
3. Local UI asset bundling option

This would enable proper distribution without the `-unsigned` requirement.
