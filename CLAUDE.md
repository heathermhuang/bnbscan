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

**Last updated:** 2026-04-15
**Branch:** `main`
**Status:** BNB indexer tuned (pool=8, concurrency=8) + retention shortened to 3d. Disk at 74.8%; stabilization expected from 2026-04-16 01:24 UTC onward as retention begins evicting day-0 data.

### What just shipped (this session)
- **Investigated reported site outage** — sites were NOT down. Render access logs show real users getting fast 200s (100-500ms). Observed local curl hang was a throttled path from dev machine to Render edge, not an app issue. Lesson: always cross-check with server-side Render logs before claiming an outage from a local curl.
- **BNB indexer falling behind** — was at 1.2-2.5 blk/s vs chain's 3 blk/s, lag growing from 800s to 950s+. Bumped `DB_POOL_SIZE` 3→**8** and set `INDEX_CONCURRENCY=8` explicitly on bnbscan-indexer (matches eth-indexer). Pool bump alone insufficient — RPC (`bsc-dataseed1.binance.org`) is the real bottleneck. Chainstack quota resets in ~7 days; revisit then.
- **Discovered BNB retention math was broken** — actual write rate is ~**15GB/day** (tx table alone), not the ~2.3GB/day estimate in prior handoff. 7d × 15GB = ~105GB, impossible on 50GB disk. Shortened `RETENTION_DAYS` 7→**3** on bnbscan-indexer. Expected steady-state ~45-48GB (90-96% of 50GB) — tight but viable.
- **Danger window 2026-04-15 13:22 → 2026-04-16 01:24 UTC (~12h)** — no rows are >3d old yet so retention can't evict; disk will grow from 74.8% to ~90% during this window. If disk-alert fires, manual prune: `POST /api/admin/db-prune?days=3` with `Authorization: Bearer <ADMIN_SECRET>`.

### Previous session (2026-04-14)
- Root-caused bnbscan-db 90% disk alert (indexer pointed at fresh 15GB DB, not the 100GB v2). Disk expansions: bnbscan-db 15→50GB, ethscan-db 15→30GB. Sized for old (underestimated) 2.3GB/day rate — see above for correction.
- eth-indexer `NODE_OPTIONS` 768→1280MB for occasional SIGABRT.
- Retention observability shipped in `apps/indexer/src/retention-cleanup.ts` — every run logs per-table sizes and WARNs at >70% via `DB_DISK_GB` env var.

### Previous session (2026-04-12)
- Homepage redesigned with Market Cap + 24H Transactions. Design Score B, AI Slop Score A. 3 design fixes shipped.

### QA findings (low severity, deferred)
- **DEX "Unique Traders" shows 1 when 0 trades** — `GREATEST(1, ...)` in `apps/explorer/app/dex/page.tsx:47`. Cosmetic.
- **ISR cold cache skeleton flash** — First visitor after cache expiry sees loading.tsx for 3-5s. Expected Next.js behavior.

### Remaining known issues
- **holder_count eventually consistent**: Updated every 5 min via `recomputeHolderCounts` instead of per-block. Token pages may show slightly stale counts during that window — acceptable tradeoff for ~6x ETH throughput gain.
- **BNB indexer env vars (updated 2026-04-15)**: `DB_POOL_SIZE=8`, `INDEX_CONCURRENCY=8`, `RETENTION_DAYS=3` — matches ETH on pool/concurrency, retention shorter due to higher BNB write rate.
- **ETH indexer env vars**: `INDEX_CONCURRENCY=8`, `DB_POOL_SIZE=8`, `RETENTION_DAYS=7` (unchanged — ~3GB/day steady-state fits comfortably in 30GB disk).
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

### Current DB specs (as of 2026-04-16)
- **Active** `bnbscan-db` (dpg-d7e4b83bc2fs73ec3l9g-a) — **basic_4gb**, **100GB disk**, created 2026-04-13. Upgraded from basic_1gb on 2026-04-16 to permanently fix query timeouts under indexer load.
- **Active** `ethscan-db`  (dpg-d7e4b83bc2fs73ec3la0-a) — basic_1gb, **30GB disk**, created 2026-04-13
- **Suspended** `bnbscan-db-v2` (dpg-d7bl0ih17lss73algol0-a) — basic_4gb, 100GB, suspended 2026-04-14 (not billing). Hard-delete after ~1 week of confidence.
- **Suspended** `ethscan-db-v2` (dpg-d7bevuh17lss73ahvii0-a) — basic_1gb, 50GB, suspended 2026-04-14 (not billing). Same.
- Steady-state: BNB ~45GB at 3d retention (~15GB/day), ETH ~12GB at 7d retention (~3GB/day).
- `DB_DISK_GB` env var on each indexer drives the 70%-warn log — BNB=100, ETH=30.

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
