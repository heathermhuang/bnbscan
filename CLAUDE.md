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
**Status:** Security audit complete. All 3 findings fixed. Next.js 15 + React 19 upgrade shipped. Indexer deadlocks and validator syncer fixed.

### What just shipped (this session)
- **Indexer deadlock fix** — `3346701`: sort addresses alphabetically before bulk upsert for consistent lock ordering + retry with backoff
- **Validator syncer fix** — `3346701`: added consensus→operator address resolution via `getOperatorAddressByConsensusAddress`, logging at every stage
- **Security: /api/health gated** — `c0865dd`: internals (memory, DB connections, table sizes) now require ADMIN_SECRET bearer token. Public response is just status/latestBlock/lagSeconds
- **Security: CSP hardened** — `c0865dd`: removed `unsafe-eval` from script-src, added explicit GA/GTM script domains
- **Security: Next.js 14→15 upgrade** — `98ad00e`: resolves 3 HIGH CVEs (GHSA-h25m-26qc-wcjf, GHSA-9g9p-9gw9-jx7f, GHSA-3v7f-55p6-f55p). React 18→19. All API routes now have explicit `export const dynamic = 'force-dynamic'`.

### Remaining known issues
- **Validators page**: Syncer now resolves operator addresses correctly. Check Render logs for `[validator-syncer] Starting sync...` and `Resolved X/N operator addresses` after next deploy.
- **Whales page may show empty**: Depends on indexed token_transfers data.
- **DB disk growth**: BNBScan at ~73GB/100GB (73%). Need to run `psql $DATABASE_URL -f scripts/db-optimize.sql` against both DBs.
- **og:image missing**: No social preview image on any page.
- **About/FAQ page missing**: Recommended for AEO/trust.
- **isBot always false**: Bot detection disabled to enable ISR.
- **Monitor Next.js 15 deploy**: `isrMemoryCacheSize` was removed (deprecated in 15). Watch memory on 2GB pro plan — Next.js 15 has better defaults but monitor first deploy.

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
- Render deploys; BNB DB is basic-1gb (97 max_connections); ETH DB is also basic-1gb
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
