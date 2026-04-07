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

**Last updated:** 2026-04-07
**Branch:** `main`
**Status:** Both sites stable. Memory fix deployed, DB optimization scripts ready.

### What just shipped (this session)
- **Memory fix** — commit `e679e55`: disabled Next.js fetch data cache (`cache: 'no-store'` on all fetches) — stopped 40MB/min heap growth
- **DB health metrics** — commit `e961e41`: added DB size, row counts, connection stats to `/api/health`
- **Health endpoint timeout fix** — commit `4efe1c1`: replaced `pg_database_size()` (slow on 73GB) with `pg_total_relation_size()` on main tables, bumped timeout to 5s
- **Composite indexes in schema** — commit `4efe1c1`: added `(from_address, timestamp)` and `(to_address, timestamp)` on transactions + token_transfers
- **DB optimization SQL** — `scripts/db-optimize.sql`: creates indexes CONCURRENTLY, prunes gas_history/logs/dex_trades, VACUUM ANALYZE
- **Monitor script fix** — commit `fc5eb26`: fixed false positive from HTTP 103 Early Hints
- **Footer disclaimer** — commit `a021591`: "Not affiliated with" instead of "Powered by"
- **Full-table scan elimination** — commit `7d24f7f`: address page uses pre-computed addresses.txCount/firstSeen instead of COUNT(*) on 36M rows

### Remaining known issues
- **DB disk growth**: BNBScan at ~73GB/100GB (73%). Need to run `psql $DATABASE_URL -f scripts/db-optimize.sql` against both DBs to create indexes and prune old data. Requires direct psql access.
- **Whales page shows no data**: Modern DeFi uses WBNB/WETH via `token_transfers`, not native `value`. Fix: rewrite whales page to query `token_transfers` for large ERC-20 moves.
- **og:image missing**: No social preview image on any page.
- **About/FAQ page missing**: Recommended for AEO.
- **isBot always false**: Bot detection disabled to enable ISR.

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
