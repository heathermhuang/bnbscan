# Claude Handoff

## Project

- Name: BNBScan / EthScan
- Workspace: (local clone root)
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

**Last updated:** 2026-04-14
**Branch:** `main`
**Status:** BNB disk-90% alert resolved. Both DBs right-sized to hold 7d retention.

### What just shipped (this session)
- **Root-caused the bnbscan-db disk-90% alert** — indexer+web `DATABASE_URL` pointed at a fresh 15GB `bnbscan-db` (basic_1gb, created 2026-04-13 to replace the crashed `bnbscan-db-v2`). Retention was running correctly every 6h but had nothing older than 7d to delete. A 15GB disk cannot hold BNB's ~2.3GB/day × 7d steady-state. The prior `bnbscan-db-v2` (basic_4gb, 100GB) is orphaned — nothing points to it.
- **Disk expansions via Render API** — `bnbscan-db` 15→**50GB**, `ethscan-db` 15→**30GB**. Sized to fit 7d steady-state + ~60% headroom for WAL/vacuum bloat.
- **eth-indexer exit 134 (SIGABRT/OOM)** — bumped `NODE_OPTIONS` 768→**1280MB**. Crashes were isolated (1 on 04-13, cluster on 04-11 coupled with DB-v2 outage); each auto-recovered in ~1s.
- **Retention observability** (`apps/indexer/src/retention-cleanup.ts`) — every run now logs per-table + total DB size, and WARNs at >70% disk-% via new `DB_DISK_GB` env var (set to 50 for BNB, 30 for ETH indexers). No more "Done — 0 rows removed" dead-end lines.

### Previous session (2026-04-12)
- Homepage redesigned with Market Cap + 24H Transactions. Design Score B, AI Slop Score A. 3 design fixes shipped.

### QA findings (low severity, deferred)
- **DEX "Unique Traders" shows 1 when 0 trades** — `GREATEST(1, ...)` in `apps/explorer/app/dex/page.tsx:47`. Cosmetic.
- **ISR cold cache skeleton flash** — First visitor after cache expiry sees loading.tsx for 3-5s. Expected Next.js behavior.

### Remaining known issues
- **holder_count eventually consistent**: Updated every 5 min via `recomputeHolderCounts` instead of per-block. Token pages may show slightly stale counts during that window — acceptable tradeoff for ~6x ETH throughput gain.
- **ETH env vars**: `INDEX_CONCURRENCY=8` and `DB_POOL_SIZE=8` set via Render API (previously 3 each). BNB indexer still at pool=3, CONCURRENCY unset (defaults to 8 for BNB, 4 for ETH).
- **Whales page may show empty**: Depends on indexed token_transfers data
- **isBot always false**: Bot detection disabled to enable ISR
- **www.ethscan.io unverified**: Subdomain custom domain shows `unverified` in Render — apex `ethscan.io` works fine
- **Free public RPCs**: Currently using publicnode.com (ETH) and binance.org (BNB) — switch back to Chainstack when quota resets

### Incident: BNB DB disk exhaustion (resolved 2026-04-08)
- Root cause: DB hit 100GB disk limit. Retention cleanup existed but couldn't keep up (5K batch size × 9000+ iterations). Postgres WAL checkpoint failed on recovery → crash loop.
- Resolution: Disk expanded to 150GB, 7-day retention enforced, VACUUM FULL reclaimed 72GB. Retention now runs every 6h with direct DELETE.
- To re-run manually: `POST /api/admin/db-prune?days=7` with `Authorization: Bearer <ADMIN_SECRET>`
- VACUUM FULL (if needed): Set `VACUUM_FULL=1` env var on indexer, restart, then remove env var after completion.

### Incident: BNB DB connection exhaustion (resolved)
- Root cause: OOM crash-restart cycle leaking 5 DB connections per crash; 20 crashes = max_connections hit
- Resolution: pro plan (2GB) eliminates crash cycle; ISR reduces render pressure

### Current DB specs (as of 2026-04-14)
- **Active** `bnbscan-db` (dpg-d7e4b83bc2fs73ec3l9g-a) — basic_1gb, **50GB disk**, created 2026-04-13
- **Active** `ethscan-db`  (dpg-d7e4b83bc2fs73ec3la0-a) — basic_1gb, **30GB disk**, created 2026-04-13
- **Suspended** `bnbscan-db-v2` (dpg-d7bl0ih17lss73algol0-a) — basic_4gb, 100GB, suspended 2026-04-14 (not billing). Verified no service/repo reference before suspend. Hard-delete after ~1 week of confidence, or `POST /v1/postgres/<id>/resume` to restore.
- **Suspended** `ethscan-db-v2` (dpg-d7bevuh17lss73ahvii0-a) — basic_1gb, 50GB, suspended 2026-04-14 (not billing). Same.
- Steady-state usage per `CLAUDE.md` estimate: BNB ~25-30GB, ETH ~15-20GB at 7d retention.
- `DB_DISK_GB` env var on each indexer drives the 70%-warn log — update it when resizing.

### Render service IDs
- All Render service IDs, DB IDs, and owner ID are in the Render dashboard — do NOT hardcode them in the repo.
- Render API key: `.render-api-key` (gitignored)
- Build logs: `GET /v1/logs?ownerId=<OWNER_ID>&resource=<serviceId>&type=build&limit=100&direction=backward`

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- Render deploys; BNB DB = basic_1gb/50GB disk; ETH DB = basic_1gb/30GB disk (see "Current DB specs" above)
- Data retention: 7 days. Indexer `RETENTION_DAYS=7` runs cleanup every 6h. Each run now logs table sizes + disk-% via `DB_DISK_GB` env var (warns at 70%).
- ADMIN_SECRET for health/prune endpoints: fetch from Render env vars on bnbscan-web
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
