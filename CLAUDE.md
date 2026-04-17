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

**Last updated:** 2026-04-17 (session 2)
**Branch:** `main` (pushed, clean)
**Status:** BNBScan was 39k blocks behind chain tip. Shipped 3 perf fixes: async holder-balance queue, merged-batch coalescing, and deferred startup retention. All live on Render as of ~06:50 UTC. Indexer should now catch up without re-starving itself on every restart.

### What just shipped (this session — 2026-04-17 session 2)
- **`669fec9` async holder-balance queue** — `batchUpdateHolderBalances` was ~38% of per-block time. Now `enqueueHolderBalanceUpdate` pushes rows to a module-level queue; a single worker drains it. Removes cross-worker row-lock contention on hot rows (USDT/WBNB/USDC). Block workers no longer await holder UPSERTs.
- **`5315176` coalesced drain** — the initial drainer pulled one batch per UPSERT round-trip, so it couldn't keep up with enqueue rate. Replaced `shift()` with `splice(0, length)` and concatenate before calling `batchUpdateHolderBalances`. Delta aggregation is commutative — N batches merge into one UPSERT. Bounds memory growth even when DB is slow.
- **`cb349ba` deferred startup retention** — `startRetentionCleanup()` used to `await runCleanup()` on startup. With 3-day retention on a 15GB/day DB, the resulting DELETE saturated the 12-connection pool for 30+ min, starving the holder-queue drainer (observed 85→508 batches in ~8min). Now deferred by **15 minutes** via `setTimeout`, so block workers get a warm pool to catch up. The 6h `setInterval` still runs on schedule. Crash-restart loops still get a retention pass within 15 min — disk stays bounded.

### Why 15min-delay instead of pure-remove
Pure-remove (no startup retention) is cleaner, but if the process crashes every <6h (history of OOM / SIGABRT), retention would never run and disk would fill. 15min delay is the pragmatic middle ground — pool stays hot for the critical catch-up window, and retention still runs once per restart.

### Post-deploy measurement (5315176, 06:37-06:45 UTC — BEFORE retention-defer)
- Indexer: 1.79 blk/s | Chain: 2.27 blk/s | Net: -0.48 blk/s
- Queue oscillated: drained 182→8 once at 06:40:12, then grew 8→508 while startup retention ran
- Coalesce fix confirmed working (queue CAN drain in one big cycle), but retention was blocking most cycles

### Next session — what to check first
1. **Verify cb349ba is actually helping**: Fetch bnbscan-indexer logs from ~06:50 UTC onward (the cb349ba deploy went live ~06:50). Look for:
   - `[retention] startup cleanup deferred by 15min` message on startup
   - Block throughput in the first 15 min after restart — should be ≥2.1 blk/s and lag should START DECREASING
   - Queue depth should stay low (<200) during that window
2. If lag is decreasing → we're done with the catch-up effort. Leave it indexing.
3. If still net-negative after 15 min of clean pool → retention isn't the whole story; next suspect is token_balances table bloat. Run `SELECT pg_size_pretty(pg_total_relation_size('token_balances')), pg_size_pretty(pg_indexes_size('token_balances'))` via admin endpoint or Render shell.

### Commands to measure
```bash
# Fetch indexer logs (OWNER=tea-d6roaibuibrs73dteu2g, svc=srv-d70kbmia214c73ebs3a0)
curl -s -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
  "https://api.render.com/v1/logs?ownerId=tea-d6roaibuibrs73dteu2g&resource=srv-d70kbmia214c73ebs3a0&limit=200&direction=backward"
```

### Previous session (2026-04-17 session 1)
- **Live /status page** (commit `ee00dcd`) — REVERTED in commit `91f6e90`. Per user: use external `https://status-page-6ez4.onrender.com/` instead. Footer link already points there.
- **Fixed CSP blocking Next.js dev HMR** — the production CSP in `next.config.mjs` forbade `'unsafe-eval'`, which broke the webpack `eval-source-map` devtool in dev. Gated `'unsafe-eval'` on `NODE_ENV=development`. Production CSP is unchanged. **If you ever see a client component fail to hydrate silently in dev, suspect CSP first.**

### Previous session (2026-04-16 session 2)
- **Fixed silent receipts-pipeline disable after 3 rate-limit failures** (commit `1c3bb92`). The `blockReceiptsSupported` module-level flag in `block-processor.ts` latched to false after 3 consecutive `eth_getBlockReceipts` errors and NEVER re-enabled — dropping `token_transfers`, `dex_trades`, `tx.status/gasUsed`, and holder balance updates for the rest of the process lifetime. The "Per-tx fallback active (HIGH RPC COST)" warning log was misleading — no such fallback exists in `processBlock`. Observed locally during profiling: a 3×429 burst around block 92888107 flipped the flag; subsequent windows processed blocks at 12-20 blk/s (vs 4 blk/s before) because the receipts phase was being skipped entirely. **Fix:** drop the auto-disable, let each failure throw; worker pool at `index.ts:212-216` already catches and retries. Verified by vitest: 4 tests in `block-processor.test.ts` assert the post-fix recovery — the 4th call after 3 simulated 429s returns the expected receipt rows (pre-fix would have silently returned `[]`).

### Previous session (2026-04-16 session 1)
- **Root-caused + fixed `JsonRpcProvider failed to detect network` noise** — was seeing **55 errors/minute** steady-state after 2-RPC round-robin shipped. ethers v6 re-runs `eth_chainId` detection before every request unless pinned. Commit `79012c1` passes `Network.from(chain.chainId)` as `staticNetwork` to all three provider constructors (`index.ts`, `provider.ts`, `backfill.ts`). **Verified:** 0 detect-network errors in post-deploy window.
- **Throughput still bottlenecked** — post-fix measurement (2026-04-16 14:30–14:35 UTC): 0.74 blk/s, lag growing +494 blocks in 326s. Pre-fix baseline same day: 0.89 blk/s. Chain rate ~2.25 blk/s. With 8 workers at 0.74 blk/s aggregate, **each worker takes ~10.8s per block** → suggests per-block DB work (5-7 chunked UPSERT phases in `block-processor.ts`) is the real ceiling, not RPC. **Next session: profile a single-block run and find the dominant phase.**
- **Live indexer config (note CLAUDE.md was stale)**: `BNB_RPC_URL=<dataseed1>,<dataseed3>` (2-RPC round-robin), `DB_POOL_SIZE=12` (not 8), `INDEX_CONCURRENCY=8`, `MAX_LAG_BLOCKS=100000`, `RETENTION_DAYS=3`, `DB_DISK_GB=100`.

### Previous session (2026-04-15)
- BNB indexer tuned (pool=8→12, concurrency=8) + retention shortened 7d→3d. Disk at 74.8%; stabilization expected from 2026-04-16 01:24 UTC onward as retention begins evicting day-0 data.
- **Investigated reported site outage** — sites were NOT down. Render access logs show real users getting fast 200s (100-500ms). Observed local curl hang was a throttled path from dev machine to Render edge, not an app issue. Lesson: always cross-check with server-side Render logs before claiming an outage from a local curl.
- **Discovered BNB retention math was broken** — actual write rate is ~**15GB/day** (tx table alone), not the ~2.3GB/day estimate in prior handoff. Shortened `RETENTION_DAYS` 7→**3**.
- Shipped worker-pool pattern (commits `d182d8c`, `286ea9d`) + multi-RPC round-robin (`68a3e6e`) — small throughput lift but not enough to catch BSC tip.

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
- **BNB indexer env vars (verified live 2026-04-16)**: `DB_POOL_SIZE=12`, `INDEX_CONCURRENCY=8`, `RETENTION_DAYS=3`, `MAX_LAG_BLOCKS=100000`, `BNB_RPC_URL=https://bsc-dataseed1.binance.org/,https://bsc-dataseed3.binance.org/` (2-RPC round-robin), `DB_DISK_GB=100`.
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
