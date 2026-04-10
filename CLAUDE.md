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

**Last updated:** 2026-04-10
**Branch:** `main`
**Status:** Both chains caught up and operational. ETH lag 0 after holder_count refactor, BNB lag 0 after perf rewrite.

### What just shipped (this session)
- **Indexer perf rewrite (f1ffadf)** — Inlined log/token/dex decoding, batched token_transfers + tx_status updates, pre-filtered logs by topic, concurrency window with Promise.allSettled. BNB went from degraded to lag 0.
- **unnest→VALUES cast fix (4192257)** — Drizzle sql template serializes JS arrays as `(a,b,c)` record literals, not postgres arrays, so `${arr}::text[]` fails. Replaced all unnest-based batched queries with VALUES clauses.
- **Parallelize RPC + fix blk/s (8d6f828)** — `getBlock` and `eth_getBlockReceipts` now run concurrently (~800ms savings per block on ETH). Throughput display now tracks actual blocks/elapsed instead of chunk.length/elapsed.
- **holder_count off hot path (f4cc147)** — THE big ETH unlock. The two-phase CTE in `batchUpdateHolderBalances` (old_state → upsert → aggregate) was the single bottleneck: 1000+ row LEFT JOINs per ETH block caused deadlocks under concurrency and negative scaling past concurrency=4. Now a simple `INSERT ... ON CONFLICT DO UPDATE` and a periodic `recomputeHolderCounts` runs every 5 min via retention scheduler. ETH caught up from ~400 block lag to 0 in ~2 min.
- **Status page polish** — Service names show full domains (bnbscan.com, ethscan.io), adaptive timeline scales to available data (min 45m, max 24h), no more empty bar gaps
- **Footer links** — Added "Status ↗" link to explorer footer (both sites), removed "MDT Website ↗" link
- **README upgrade (ef41f13)** — Added 4 Playwright screenshots, architecture diagram, tech stack table, getting started, env var reference, deployment guide.

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
- BNB postgres ID: `dpg-d7bl0ih17lss73algol0-a` (50GB, basic-4gb, autoscaling off)
- ETH postgres ID: `dpg-d7bevuh17lss73ahvii0-a` (50GB, basic-1gb, autoscaling off)

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
- Render deploys; BNB DB is basic-4gb (50GB disk); ETH DB is basic-1gb (50GB disk)
- Data retention: 7 days. Indexer `RETENTION_DAYS=7` runs cleanup every 6h. DB should stay ~25-30GB.
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
