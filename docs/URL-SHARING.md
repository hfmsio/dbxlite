# URL Sharing (Local Development)

Share queries via URL parameters when running locally at `http://localhost:5173`.

## Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `example` | Load built-in example | `example=wikipedia` |
| `sql` | Direct SQL (URL-encoded) | `sql=SELECT%201` |
| `share` | Load from GitHub Gist | `share=gist:abc123` |
| `run` | Auto-execute query | `run=true` |
| `tab` | Custom tab name | `tab=My%20Query` |
| `theme` | UI theme | `theme=dracula` |
| `explorer` | Show file explorer | `explorer=true` |

## Examples

**Load built-in example:**
```
http://localhost:5173/?example=wikipedia&run=true
```

**Direct SQL (simple):**
```
http://localhost:5173/?sql=SELECT%20*%20FROM%20range(10)&run=true
```

**Remote CSV with analytics:**
```
http://localhost:5173/?sql=SELECT%20cut%2C%20round%28avg%28price%29%29%20as%20avg_price%2C%20count%28*%29%20as%20total%20FROM%20%27https%3A%2F%2Fraw.githubusercontent.com%2Ftidyverse%2Fggplot2%2Fmain%2Fdata-raw%2Fdiamonds.csv%27%20GROUP%20BY%20cut&run=true
```

**GitHub Gist:**
```
http://localhost:5173/?share=gist:abc123def456&run=true
```

**With theme:**
```
http://localhost:5173/?example=duckdb-advanced&run=true&theme=tokyo-night
```

## Built-in Example IDs

| Category | IDs |
|----------|-----|
| Getting Started | `duckdb-temp`, `duckdb-series` |
| Remote Data | `remote-datasets`, `wikipedia`, `covid`, `population`, `baby-names` |
| Learn DuckDB | `duckdb-feature-tour`, `duckdb-advanced`, `duckdb-datatypes` |
| Analytics | `advanced-analytics` |
| Extensions | `core-extensions`, `community-extensions` |
| BigQuery | `bigquery-advanced`, `bigquery-datatypes`, `bigquery-github`, `bigquery-stackoverflow`, `bigquery-taxi` |

## Themes

`vs-dark` (default), `vs-light`, `dracula`, `solarized-light`, `one-dark`, `ayu-light`, `nord`, `github-light`, `tokyo-night`, `catppuccin`

## GitHub Gist Sharing

**Create a gist:**
1. Go to [gist.github.com](https://gist.github.com)
2. Paste SQL, name file `query.sql`
3. Create gist, copy the ID from URL

**Share:**
```
http://localhost:5173/?share=gist:{gist_id}&run=true
```

## Bookmarklet

Open any GitHub Gist in dbxlite with one click.

**Install:**
1. Show bookmarks bar (`Cmd+Shift+B` / `Ctrl+Shift+B`)
2. Create a new bookmark with:
   - **Name:** `Run in dbxlite`
   - **URL:** (paste the code below)

```javascript
javascript:(function(){var m=location.href.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);if(m)window.open('http://localhost:5173/?share=gist:'+m[1]+'&run=true');else alert('Not a gist page')})()
```

**Usage:**
1. Visit any gist page (e.g., `gist.github.com/user/abc123`)
2. Click the bookmarklet
3. dbxlite opens with your SQL loaded and executed

## README Badge

Add a "Run in dbxlite" badge to your gist or repo:

```markdown
[![Run in dbxlite](https://img.shields.io/badge/Run%20in-dbxlite-blue)](http://localhost:5173/?share=gist:YOUR_GIST_ID&run=true)
```

Preview: ![Run in dbxlite](https://img.shields.io/badge/Run%20in-dbxlite-blue)

## URL Encoding

Use `encodeURIComponent()` for SQL:

```javascript
const sql = "SELECT * FROM 'https://example.com/data.csv'";
const url = `http://localhost:5173/?sql=${encodeURIComponent(sql)}&run=true`;
```
