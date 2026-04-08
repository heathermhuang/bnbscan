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

**Last updated:** 2026-04-08
**Branch:** `main`
**Status:** All services healthy. OG image + About/FAQ page shipped. DB at ~73GB/100GB — optimize script ready.

### What just shipped (this session)
- **og:image** — Dynamic OG image via `opengraph-image.tsx` (chain-aware, 1200x630)
- **About/FAQ page** — `/about` with FAQ structured data (schema.org FAQPage), footer link, sitemap entry
- **Health check** — Both sites responding (bnbscan.com lag ~150s, ethscan.io lag ~23s)

### Remaining known issues
- **DB disk growth**: BNB DB at ~73GB/100GB. Run `psql $DATABASE_URL -f scripts/db-optimize.sql` against both DBs.
- **Whales page may show empty**: Depends on indexed token_transfers data.
- **isBot always false**: Bot detection disabled to enable ISR.
- **www.ethscan.io unverified**: Subdomain custom domain shows `unverified` in Render — apex `ethscan.io` works fine.

### Incident: BNB DB connection exhaustion (resolved)
- Root cause: OOM crash-restart cycle leaking 5 DB connections per crash; 20 crashes = max_connections hit
- Resolution: pro plan (2GB) eliminates crash cycle; ISR reduces render pressure
- BNB postgres ID: `dpg-d70kb62a214c73ebro4g-a` — restart via `POST /v1/postgres/dpg-d70kb62a214c73ebro4g-a/restart`

### Render service IDs
- `ethscan-web`: `srv-d70kbdqa214c73ebrtqg` — rootDir: `apps/explorer`, CHAIN=eth
- `bnbscan-web`: `srv-d70kbmia214c73ebs3ag` — rootDir: `apps/explorer`, CHAIN=bnb
- `bnbscan-indexer`: `srv-d70kbmia214c73ebs3a0`
- `eth-indexer`: `srv-d70kbdqa214c73ebrtq0`
- Render API key: `.render-api-key` (gitignored)
- Owner ID: `tea-d6roaibuibrs73dteu2g`
- Build logs: `GET /v1/logs?ownerId=tea-d6roaibuibrs73dteu2g&resource=<serviceId>&type=build&limit=100&direction=backward`

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- Render deploys; BNB DB is basic-4gb (100GB disk); ETH DB is also basic-1gb
- Postgres can be restarted via Render API: `POST /v1/postgres/<id>/restart`
- Homepage uses `revalidate=30` (ISR) — do NOT change back to `force-dynamic`
- All pages now use ISR (`revalidate=30` or `revalidate=300`) — do NOT add `force-dynamic` back
- Both web services are on pro plan (2GB) — do NOT downgrade to standard

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
