#!/usr/bin/env node
// Smoke-test every DuckDB example query under
// apps/web-client/src/examples/queries/. For each file:
//   1. Split into statements with the same comment- and string-aware
//      splitter the app uses (see queryExtractor.ts:splitOnTopLevelSemicolons).
//      A regression here is exactly the class of bug that shipped a 44-second
//      hang on /examples → Joins.
//   2. Execute each statement against an in-memory DuckDB with a per-statement
//      timeout. Parser/runtime errors fail CI. Network / extension-install
//      errors are categorised SKIP with a warning so flaky external hosts
//      don't break the build.
//
// Warehouse-only examples (bigquery-*.sql, snowflake-*.sql) are skipped:
// they require live credentials that don't belong in CI.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DuckDBInstance } from '@duckdb/node-api'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXAMPLES_DIR = join(
  __dirname,
  '..',
  'apps',
  'web-client',
  'src',
  'examples',
  'queries',
)
const PER_STATEMENT_TIMEOUT_MS = 30_000

// ------------------------------------------------------------------
// Statement splitter — JS port of the production helper. Keep in sync
// with apps/web-client/src/utils/queryExtractor.ts. Only `;` outside
// line comments, block comments, and quoted strings/identifiers acts
// as a separator.
// ------------------------------------------------------------------
function splitOnTopLevelSemicolons(sql) {
  const parts = []
  let buf = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = i + 1 < n ? sql[i + 1] : ''
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') buf += sql[i++]
      continue
    }
    if (c === '/' && next === '*') {
      buf += sql[i++]
      buf += sql[i++]
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) buf += sql[i++]
      if (i < n) {
        buf += sql[i++]
        buf += sql[i++]
      }
      continue
    }
    if (c === "'" || c === '"') {
      const quote = c
      buf += sql[i++]
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            buf += sql[i++]
            buf += sql[i++]
            continue
          }
          buf += sql[i++]
          break
        }
        buf += sql[i++]
      }
      continue
    }
    if (c === ';') {
      parts.push(buf)
      buf = ''
      i++
      continue
    }
    buf += sql[i++]
  }
  parts.push(buf)
  return parts
}

// Classify an error message so CI can distinguish "the bug we care about"
// from "GitHub-runner can't reach the open internet today".
function classifyError(message) {
  const m = (message || '').toLowerCase()
  if (
    m.includes('http') ||
    m.includes('network') ||
    m.includes('could not establish') ||
    m.includes('failed to download') ||
    m.includes('certificate') ||
    m.includes('no such file')
  ) {
    return 'network'
  }
  if (m.includes('extension') && (m.includes('install') || m.includes('load'))) {
    return 'extension'
  }
  if (m.includes('s3:') || m.includes('aws')) {
    return 'network'
  }
  return 'fatal'
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function runFile(instance, filePath) {
  const sql = readFileSync(filePath, 'utf8')
  const statements = splitOnTopLevelSemicolons(sql)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(\/\*[\s\S]*\*\/|--[^\n]*)*$/.test(s))

  if (statements.length === 0) {
    return { status: 'skip', reason: 'no executable statements (comment-only file)' }
  }

  const conn = await instance.connect()
  try {
    for (let idx = 0; idx < statements.length; idx++) {
      const stmt = statements[idx]
      try {
        await withTimeout(conn.run(stmt), PER_STATEMENT_TIMEOUT_MS, `stmt #${idx + 1}`)
      } catch (err) {
        const message = err?.message ?? String(err)
        const kind = classifyError(message)
        return {
          status: kind === 'fatal' ? 'fail' : 'skip',
          reason: `[${kind}] stmt #${idx + 1}: ${message.split('\n')[0]}`,
          stmtPreview: stmt.slice(0, 120),
        }
      }
    }
    return { status: 'pass' }
  } finally {
    conn.disconnectSync?.()
  }
}

async function main() {
  const allFiles = readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // Files we don't run at all:
  //   - bigquery-* / snowflake-*: need live warehouse credentials
  //   - *-datatypes-test.sql / type-handling-tests.sql: diagnostic dumps
  //     (kept on disk for grid-render regression checks; not user-facing)
  //   - duckdb-iceberg-delta.sql / duckdb-extensions.sql: documentation
  //     examples with placeholder paths (`/path/to/your/iceberg/table`)
  //     and INSTALL of extensions that need network — by design they
  //     teach the user, they don't run end-to-end against :memory:
  const skipPatterns = [
    /^bigquery-/,
    /^snowflake-/,
    /-datatypes-test\.sql$/,
    /^type-handling-tests\.sql$/,
    /^duckdb-iceberg-delta\.sql$/,
    /^duckdb-extensions\.sql$/,
  ]
  const files = allFiles.filter((f) => !skipPatterns.some((p) => p.test(f)))
  const skippedByPolicy = allFiles.filter((f) => skipPatterns.some((p) => p.test(f)))

  console.log(
    `\n[smoke-examples] running ${files.length} DuckDB examples (skipping ${skippedByPolicy.length} warehouse/diagnostic files)\n`,
  )

  const instance = await DuckDBInstance.create(':memory:')

  const results = []
  for (const f of files) {
    const filePath = join(EXAMPLES_DIR, f)
    const t0 = Date.now()
    let r
    try {
      r = await runFile(instance, filePath)
    } catch (err) {
      r = { status: 'fail', reason: `runner crash: ${err?.message ?? err}` }
    }
    const ms = Date.now() - t0
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'skip' ? 'SKIP' : 'FAIL'
    const tail = r.reason ? ` — ${r.reason}` : ''
    console.log(`  ${icon}  ${f}  (${ms}ms)${tail}`)
    results.push({ file: f, ...r, ms })
  }

  const failed = results.filter((r) => r.status === 'fail')
  const skipped = results.filter((r) => r.status === 'skip')
  const passed = results.filter((r) => r.status === 'pass')

  console.log(`\n[smoke-examples] ${passed.length} passed · ${skipped.length} skipped · ${failed.length} failed\n`)

  if (failed.length > 0) {
    console.error('Failures:')
    for (const r of failed) {
      console.error(`  - ${r.file}: ${r.reason}`)
      if (r.stmtPreview) console.error(`      stmt: ${r.stmtPreview}…`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[smoke-examples] runner error:', err)
  process.exit(1)
})
