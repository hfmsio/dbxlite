# syntax=docker/dockerfile:1

# dbxlite is a fully client-side app: DuckDB runs as WebAssembly in the
# browser, so there is no backend to run. This image just builds the static
# assets and serves them with the cross-origin-isolation headers the app needs.

# ---- Build stage: compile the browser app to static assets ----
# The build output is arch-neutral static files, so pin this heavy Node stage
# to the native builder arch ($BUILDPLATFORM). For multi-arch builds only the
# tiny nginx runtime below is emulated per target, not the whole Node build.
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

# pnpm via corepack, pinned to the repo's packageManager version.
# bash is required by the repo's postinstall (scripts/download-duckdb-wasm.sh),
# which fetches the DuckDB wasm bundles; alpine ships only sh by default.
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate \
    && apk add --no-cache bash

WORKDIR /app

# .dockerignore keeps node_modules/dist out of the context, so a plain copy
# stays small. Install the full workspace (apps/* + packages/*) then build
# only the web client.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -C apps/web-client build

# The worker always loads the EH DuckDB bundle (see worker.ts: it selects
# `selectedBundles.eh`), so the MVP and COI wasm blobs (~70 MB combined) are
# never fetched. Drop them to keep the image lean.
RUN rm -f apps/web-client/dist/duckdb/duckdb-mvp.wasm \
          apps/web-client/dist/duckdb/duckdb-coi.wasm \
          apps/web-client/dist/duckdb/duckdb-browser-mvp.worker.js \
          apps/web-client/dist/duckdb/duckdb-browser-coi.worker.js \
          apps/web-client/dist/duckdb/duckdb-browser-coi.pthread.worker.js

# ---- Runtime stage: serve static assets with the required headers ----
FROM nginx:alpine AS runtime

# Rich image metadata for registry search and `docker inspect`. Version,
# revision, and created timestamp are injected per-release by the CI metadata
# step; the descriptive labels below are the stable defaults.
LABEL org.opencontainers.image.title="dbxlite" \
      org.opencontainers.image.description="Browser-native SQL workbench powered by DuckDB (WebAssembly). Query local files larger than RAM, remote Parquet/CSV/JSON/Excel, BigQuery and Snowflake - fully client-side, no backend. Ideal for self-hosted SQL training and offline analytics." \
      org.opencontainers.image.url="https://github.com/hfmsio/dbxlite" \
      org.opencontainers.image.documentation="https://github.com/hfmsio/dbxlite#readme" \
      org.opencontainers.image.source="https://github.com/hfmsio/dbxlite" \
      org.opencontainers.image.vendor="dbxlite" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="docker.io/library/nginx:alpine" \
      io.dbxlite.engine="duckdb-wasm" \
      io.dbxlite.keywords="duckdb,sql,wasm,webassembly,sql-ide,sql-editor,parquet,csv,bigquery,snowflake,analytics,self-hosted,offline,data-workbench"

# The custom config is the whole point of this image: a bare nginx would omit
# the COOP/COEP/CORP headers and silently break DuckDB's OPFS features.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web-client/dist /usr/share/nginx/html

EXPOSE 80
