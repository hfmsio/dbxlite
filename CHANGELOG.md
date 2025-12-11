# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Snowflake connector integration
- Encrypted credential storage
- Native Parquet export via parquetjs
- Advanced connection testing
- Query result caching layer

## [0.2.0] - 2025-12-11

### Added
- DuckDB WASM integration as primary query engine (v1.31.0)
- BigQuery connector with OAuth 2.0 authentication
- File import from CSV, TSV, JSON, Parquet, Excel, JSONL
- Export results to CSV, JSON, and Parquet formats
- Monaco editor with syntax highlighting and autocomplete
- 10 color themes (Light, Dark, Dracula, etc.)
- Virtual scrolling for large result sets
- Persistent file handles via File System Access API
- Multi-tab SQL editor interface
- Cost estimation for BigQuery queries
- Materialization of query results to local DuckDB
- Comprehensive test suite (unit + E2E)
- Full TypeScript with strict mode enabled

### Fixed
- XSS vulnerability in hint rendering (DOMPurify sanitization)
- Alert dialogs replaced with proper logging

### Documentation
- Added comprehensive ARCHITECTURE.md
- Added CONTRIBUTING.md with development setup
- Added SECURITY.md for vulnerability reporting
- Added CODE_OF_CONDUCT.md
- Added extensive README with screenshots and badges

## [0.1.0] - 2025-11-15

### Added
- Initial project setup with Vite + React
- DuckDB WASM basic integration
- File handling infrastructure
- Web Worker for query execution
