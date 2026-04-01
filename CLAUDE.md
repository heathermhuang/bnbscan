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
**Version:** 0.1.1.0
**Status:** All services live and healthy

### What just shipped (this session)
- **ETH indexer unblocked** — build was failing since 2026-03-30 due to pnpm 9 vs 10 lockfile specifier format mismatch; fixed by regenerating with pnpm 10.32.1 and adding `--no-frozen-lockfile`
- **Missing upsertAddresses restored** — function was lost in merge conflict at `fb4bae7`; restored from `254a199`
- **Type fixes** — bigint schema fields now receive BigInt not `.toString()` (TS2769/TS2322 in block-processor/log-processor)
- **Array casting** — `upsertAddresses` switched from `unnest(array::text[])` to `VALUES + sql.join`; drizzle passes JS arrays as `record` type, not `text[]`
- **chain-config build script** — pnpm 10 fails (exit 1) on missing build scripts; added `build: tsc --noEmit`
- **logo_url migration** — now deployed to ETH indexer; tokens should populate

### Deploy status
- All 4 services live on `af9bffe`: ethscan-web, bnbscan-web, eth-indexer, bnbscan-indexer
- Build logs accessible via Render API: `GET /v1/logs?ownerId=tea-d6roaibuibrs73dteu2g&resource=<serviceId>&type=build&limit=100&direction=backward`

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
- Render deploys; Postgres 25GB limit is a constraint
- Pages with DB/RPC calls must use `force-dynamic` not `revalidate` — build workers can't pre-render pages that make slow external connections

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
