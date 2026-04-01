# Claude Handoff

## Project

- Name: BNBScan / EthScan
- Workspace: `/Users/heatherm/Documents/Claude/bnbscan`
- Version: 0.1.1.0
- Monorepo: pnpm + Turborepo

## Architecture

- `apps/explorer` — Unified Next.js 14 frontend (replaces `apps/web` + `apps/ethscan`). CHAIN env var selects chain: `bnb` or `eth`.
- `apps/indexer` — BullMQ indexer (replaces separate BNB + ETH indexers). CHAIN env var selects chain.
- `packages/chain-config` — `getChainConfig()` returns chain-specific config (dbEnvVar, labels, features, etc.)
- `packages/db` — Drizzle ORM schema + Postgres
- `packages/explorer-core` — Shared utils (rate limiting with Redis, formatting)
- `packages/ui` — Shared React components

## Current Work

> **Update this section at the end of each session before closing.**

**Last updated:** 2026-04-01
**Branch:** `main`
**Status:** All 4 services live and healthy — both indexers processing blocks

### What just shipped (this session)
- **ETH indexer unblocked** — pnpm 9 vs 10 lockfile specifier mismatch; regenerated with pnpm 10.32.1 + `--no-frozen-lockfile`
- **upsertAddresses restored** — lost in merge conflict at `fb4bae7`; now uses `VALUES + sql.join` (drizzle arrays are `record`, not `text[]`)
- **BigInt type fixes** — `gasUsed`, `gasLimit`, `gas` no longer call `.toString()` (Drizzle bigint columns need real BigInt)
- **chain-config build script** — pnpm 10 exits 1 on missing script; added `build: tsc --noEmit`
- **CONCURRENTLY sequential indexes** — indexer now builds indexes in background one-at-a-time (Promise.all caused connection exhaustion); `ensureSchema()` returns immediately after "Schema ready"
- **Startup retry on DB errors** — indexer retries with backoff instead of crash-looping on max_connections; prevents Render restart cascade
- **DB_POOL_SIZE=3** for both indexers — prevents connection pileup during restart cycles (was default 5)

### Incident: BNB DB connection exhaustion
- Root cause: multiple rapid deploys + Promise.all launching 22 concurrent index builds = 97 connections (Render basic-1gb max). Required postgres restart via `POST /v1/postgres/dpg-d70kb62a214c73ebro4g-a/restart`
- BNB postgres ID: `dpg-d70kb62a214c73ebro4g-a`

### Deploy status
- BNB: block 89951112+ | ETH: block 24783172+ — both indexers running normally
- Build logs: `GET /v1/logs?ownerId=tea-d6roaibuibrs73dteu2g&resource=<serviceId>&type=build&limit=100&direction=backward`

### Render service IDs
- `ethscan-web`: `srv-d70kbdqa214c73ebrtqg` — rootDir: `apps/explorer`, CHAIN=eth
- `bnbscan-web`: `srv-d70kbmia214c73ebs3ag` — rootDir: `apps/explorer`, CHAIN=bnb
- `bnbscan-indexer`: `srv-d70kbmia214c73ebs3a0`
- `eth-indexer`: `srv-d70kbdqa214c73ebrtq0`
- Render API key: `.render-api-key` (gitignored)
- Owner ID: `tea-d6roaibuibrs73dteu2g`

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- Render deploys; BNB DB is basic-1gb (97 max_connections); ETH DB is also basic-1gb
- Postgres can be restarted via Render API: `POST /v1/postgres/<id>/restart`
- Render deploys; Postgres 25GB limit is a constraint
- Pages with DB/RPC calls must use `force-dynamic` not `revalidate` — build workers can't pre-render pages that make slow external connections

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
