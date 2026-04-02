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

**Last updated:** 2026-04-02
**Branch:** `main`
**Status:** All 4 services live and healthy — both indexers processing blocks

### What just shipped (this session)
- **Fixed web app crash cycle (CRITICAL)** — commit `472c426`: all external fetches in `app/page.tsx` and `tx/[hash]/page.tsx` were missing `AbortSignal.timeout(5000)`. CoinGecko/bscscan/CoinCap/4byte.directory could hang indefinitely. With `force-dynamic` + 10s `AutoRefresh`, hanging renders accumulated until OOM → ~15min crash cycle → 5 leaked DB connections per crash → max_connections hit after ~20 crashes.
- **Fixed "Total Tokens: ---"** — same commit: switched `count(*)::int` on tokens table to `fetchTableEstimate('tokens')` (reltuples), same as transactions. Full COUNT(*) on 111k+ rows was slow.
- **Previous session:** sequential index builds, startup retry on DB errors, DB_POOL_SIZE=3 for indexers (see git log for details)

### Remaining known issues
- **Whales page shows no data**: The query (`transactions.value > 0`) is correct but native BNB/ETH transfers are rare in our indexed blocks — modern DeFi uses WBNB/WETH via token_transfers, not native value. Fix: rewrite whales page to query `token_transfers` for large ERC-20 moves (USDT, WBNB, etc.).
- **GA CSP violation** (low priority): `analytics.google.com` blocked. CSP only allows `www.google-analytics.com`. Update CSP headers in `next.config.ts`.
- **DB_POOL_SIZE for web apps**: Not set in render.yaml for bnbscan-web/ethscan-web. Currently defaults to 5. Consider setting to 3 to reduce connection footprint during crash cycles.

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
