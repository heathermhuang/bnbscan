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

**Last updated:** 2026-04-18 ~09:07 UTC (session 3)
**Branch:** `main` synced (HEAD = `a8a2938`, both local + origin)
**Status:** Agent-readiness tier 2 shipped and verified live on both domains via PR [#32](https://github.com/heathermhuang/bnbscan/pull/32). Deploys `dep-d7hkgftbu82c73b7putg` (bnbscan-web) and `dep-d7hkgl9knles738b52hg` (ethscan-web) both went live 09:05 UTC. Disk/retention state unchanged from session 2: pinned at 87.2% with `RETENTION_DAYS=1`, bloat-bound until a `VACUUM FULL` maintenance window is taken. 24H Transactions em-dash still open (TODOS.md, P2).

### This session (2026-04-18 session 3)

Shipped tier 2 of the isitagentready.com fixes (tier 1 was [#31](https://github.com/heathermhuang/bnbscan/pull/31)):

- **Markdown negotiation** — middleware rewrites `Accept: text/markdown` to `/md<path>` for `/`, `/about`, `/developer`, `/api-docs`. Browser path (HTML) unchanged. Verified: `curl -H "Accept: text/markdown" https://bnbscan.com/` → `text/markdown; charset=utf-8` with `Vary: Accept`. Dynamic pages (tx/block/address) intentionally out — per-request DB reads would bypass ISR.
- **Agent Skills index** — `/.well-known/agent-skills/index.json` per agentskills.io v0.2.0 + `SKILL.md` at `api-usage/`. sha256 in the index is computed from the live SKILL.md body via a shared `skillBody()` import; verified matching on both chains in prod (`d693a…` for bnb, `2e116…` for eth).
- **WebMCP** — `components/agent/WebMcpProvider.tsx` mounted in RootLayout registers 4 read-only tools: `open_transaction`, `open_address`, `open_block`, `search`. Feature-detected; silent no-op on browsers without `navigator.modelContext`.
- **Homepage `Link` header** gained `rel="https://agentskills.io/rel/index"`. Verified live.

**Intentionally skipped** (documented in TODOS.md → Open → "Agent-readiness: OAuth/OIDC discovery, MCP Server Card"):
- Goals 2, 3 (OAuth/OIDC + Protected Resource) — no OAuth server exists; admin uses shared bearer. Publishing fake discovery docs would mislead agents.
- Goal 4 (MCP Server Card) — no MCP transport endpoint. Tier-3 project.

The SKILL.md body explicitly tells agents these three well-known docs are absent by design so they stop retrying.

### Next session — what to check first

1. **Re-run isitagentready.com scan** against both bnbscan.com and ethscan.io — expect 3 fewer failures than the tier-1 baseline.
2. **Disk still 87%** — next 6h retention cycle ~13:13 UTC should deliver a clean disk number. Plan the `VACUUM FULL` window (will reclaim ~20-25GB); set `VACUUM_FULL=1` on the indexer, restart, remove after completion.
3. **Homepage "24H Transactions" em-dash bug** (TODOS.md P2) still open.
4. **Tier 3 follow-up** if the isitagentready score is still not where we want it: either (a) stand up a minimal read-only MCP server at `/api/mcp` and publish the server card, or (b) extend markdown negotiation to `/tx/:hash`, `/block/:n`, `/address/:addr` (accepting the ISR-bypass cost).

### This session (2026-04-18 session 2)

**Why we went from 2d → 1d:** The first 2d cleanup completed 03:36 UTC at disk=88.6%, **above** the 85% emergency threshold. Self-heal fired at 05:07 UTC (right after VACUUM finished), ran 1d emergency, ended at disk=88.8%. Same oscillation pattern as the 3d days — 2d wasn't enough headroom. Setting `RETENTION_DAYS=1` makes 1d the explicit floor, eliminates the 3hr-long emergency oscillation, and removes the post-cleanup lag spikes. Trade-off: users see 24h of history instead of 2d.

**Why NOT VACUUM FULL during this session:** would reclaim ~20-25GB from the tx table heap, but needs an exclusive lock on a 48GB table for ~30-60min while indexer writes. High risk of indexer lag explosion AND `/txs` page hangs. Should be a planned maintenance window with the user watching. Code path exists already at [retention-cleanup.ts:299](apps/indexer/src/retention-cleanup.ts:299) — set `VACUUM_FULL=1` env var on the indexer, restart, remove env var after completion.

**1d cycle profile (07:13:38–07:16:24 UTC):**
- `cutoff block_number = 93019727`
- `dex_trades` + `token_transfers` deletes: 7s (212,334 rows tt)
- `transactions` delete: 9s (127,110 rows)
- `logs` + `blocks` deletes: 8s (1,059 blocks)
- Total deletion: 38s. VACUUM ANALYZE: ~3 min.
- Disk after VACUUM: 87.2% (down from 88.8% earlier)
- Indexer lag during cleanup: stayed 0-7 blocks, 5-7 blk/s.

### This session (2026-04-18 session 1)

**Finding: disk was structurally over-committed at 3d retention.**
- tt was still climbing toward 3d steady-state: 25GB → 35.5GB in 14h (+10GB, ~0.7GB/hr). Projected 3d steady = ~51GB.
- tx stable at 49GB. At 3d, tt+tx alone targets ~100GB — plus indexes, logs, tb → over 100GB disk ceiling.
- 01:15 UTC retention cycle logged "⚠ DB at 87.1%", self-heal (PR #28) fired correctly at 02:13 UTC after VACUUM ANALYZE finished (58min gap), triggered 1d emergency re-run.
- **Plain `VACUUM ANALYZE` doesn't return space to OS — only `VACUUM FULL` does.** So `pg_total_relation_size` stays at peak post-delete. Disk will hover ~87% permanently because reclaimed pages refill before OS sees them back.
- Net behavior without fix: emergency 1d retention would fire **on every 6h cycle forever**. Retention window oscillates between aspirational 3d and actual 1d.

**Fix applied:** `RETENTION_DAYS=3 → 2` via Render API (PUT /v1/services/srv-d70kbmia214c73ebs3a0/env-vars/RETENTION_DAYS `{"value":"2"}`). Triggered explicit deploy after env set (per prior session's lesson). Expected new steady state: tx ~33GB + tt ~34GB ≈ 70GB total, well under 85% emergency threshold. Users see 2d of history instead of 3d.

**First 2d cleanup observations (02:43–03:29 UTC, in flight at handoff):**
- `cutoff block_number = 92791959` (rows older than 2026-04-16 02:43 UTC)
- `dex_trades` + `token_transfers` deletes: 02:43 → 02:51 (8 min)
- `transactions` delete: 02:51 → 03:07 (16 min)
- `logs` + `blocks` deletes: started 03:07, **still running at 03:29** (22+ min). The blocks DELETE's `NOT EXISTS` subquery against the 49GB tx table (pre-VACUUM, full of dead tuples) is the slow part. One-time pain — subsequent 6h cycles delete 8% as much data.
- Indexer lag during cleanup: 1163 → peak ~2500 → recovering to 2309 by 03:29. Throughput recovered to 3.3 blk/s avg (chain ~2.3, beating it).
- **Disk % NOT yet logged** — size report fires after the run completes + VACUUM ANALYZE. Won't see it until first cycle finishes.

**QA review (`/qa` invoked, quick tier):**
- All pages render, no console errors. `/`, `/blocks`, `/txs` all clean.
- ONE finding (P2, logged in TODOS.md `## Open`): Homepage "Network Overview → 24H Transactions" card renders literally `—` instead of a count. Other 3 cards (Latest Block, Market Cap, BNB Price) populate fine. Sub-label "last 9m ago" timestamps to the 02:28 UTC indexer restart — likely ISR-cached a null query result. Unrelated to retention change (2d > 24h window). Evidence in `.gstack/qa-reports/qa-report-bnbscan-com-2026-04-18.md` (gitignored).

### Next session — what to check first
1. **Steady-state confirmation.** Next 6h cycle ~13:13 UTC will only delete 6h of data, complete in seconds, give a clean disk reading. Should still be ~87% (no growth, no shrinkage — bloat is locked in until VACUUM FULL).
2. **VACUUM FULL maintenance window decision.** Disk has nowhere to go without it. `tx` table heap is ~46GB but real row footprint is much less. Plan: pick a low-traffic window, set `VACUUM_FULL=1` on indexer, restart, expect 30-60min of indexer pause + tx-table read pause, remove env var, restart again. Will reclaim ~20-25GB → disk ~62-67%.
3. **24H Transactions `—` bug.** If it's still showing dash post-revalidate, open `apps/explorer/app/page.tsx`, find the 24h-count query. Suspect: statement_timeout, or query returns 0 and code renders 0 as `—`.
4. **Remote+local in sync at `44e508a`.** Pull is a no-op.
5. **Old known todos still valid:** holder-balance write hardcoded-skipped; historical gap 92978800–93018666 was DROPPED by 1d retention (cutoff 93019727 > 93018666 high end).
6. **Live env drift:** `MAX_LAG_BLOCKS=5000` (tightened from 30000 in a prior session — origin unclear).
7. **Pending gstack upgrade:** 0.16.3.0 → 0.18.3.0. Run `/gstack-upgrade` when convenient.

### Full session arc (2026-04-17 session 3)

**Phase 1 — Skip the 40k backlog** (commits `1b36a0b` dead-code, env var `MAX_LAG_BLOCKS=30000`)
- Lowered `MAX_LAG_BLOCKS` 100000 → 30000 → auto-skip at [index.ts:140-142](apps/indexer/src/index.ts:140) fired: `40072 blocks behind (>30000) — skipping to block 93018667`
- Indexer jumped from 40k lag to <300 in one step.
- ~40k blocks of history (92978800–93018666) intentionally unindexed — acceptable tradeoff.
- Side commit `1b36a0b` added MIN_START_BLOCK support in block-indexer.ts. **DEAD CODE — wrong file.** Live cursor is in [index.ts:111-121](apps/indexer/src/index.ts:111).

**Phase 2 — Discover the real bottleneck**
- Post-skip health check: homepage fast, but /blocks and /txs taking 12-19 MINUTES.
- Root cause: holder-queue depth growing unbounded (472→1072 batches in 6min). The async drainer could NEVER keep up with enqueue rate — each merged UPSERT locked hot `token_balances` rows (USDT/WBNB/USDC) and blocked every other DB query.
- Indexer lag was also drifting (+1616 blocks in 46 min).

**Phase 3 — The actual fix** (commit `c642193`)
- Hardcoded `const SKIP_HOLDER_BALANCES = true` in `apps/indexer/src/block-processor.ts`. `enqueueHolderBalanceUpdate` is now a no-op.
- **Why hardcoded not env-var:** I initially shipped it as `SKIP_HOLDER_BALANCES=1` env var (commit `8d9546f`), and set the var via Render API. Three redeploys later, `process.env.SKIP_HOLDER_BALANCES` was STILL not reaching the running container (verified by `[holder-queue] depth=N batches` logs continuing). Gave up on env propagation and hardcoded. **Do not trust mid-build env var changes on Render — always set BEFORE triggering deploy, or hardcode for urgent fixes.**
- Also restarted bnbscan-web (srv-d70kbmia214c73ebs3ag) once to flush stuck DB connections that had accumulated during the lock storm.

### Final verified state (2026-04-17 ~10:06 UTC)
- Homepage `/` : 0.8s
- `/blocks` : 0.73s (was 45-90s timeout)
- `/txs` : 0.45s (was 90s timeout)
- Indexer: 2.27 blk/s avg, lag -16 over 6min (beating chain), zero holder-queue logs
- Live env: `MAX_LAG_BLOCKS=30000`, `SKIP_HOLDER_BALANCES=1` (set but IGNORED — code is hardcoded)
- Dead env: `MIN_START_BLOCK` — deleted
- DB unchanged

### Consequences of hardcoded skip
- Token "Top holders" pages are FROZEN at their pre-fix state. Balances for any activity from ~09:53 UTC onward are NOT being aggregated.
- All other data keeps flowing: blocks, transactions, token_transfers, logs, DEX trades, addresses.
- To re-enable: edit `apps/indexer/src/block-processor.ts` line ~595 — change `const SKIP_HOLDER_BALANCES = true` back to env-based check, commit, deploy. But don't re-enable until the underlying bottleneck (batch UPSERT throughput vs enqueue rate) is solved, or it'll strangle the DB again.

### Key takeaways (don't re-learn these)
- **Live resume cursor is [index.ts:111-121](apps/indexer/src/index.ts:111), NOT block-indexer.ts.** Two codepaths exist; block-indexer.ts is unused.
- **Render env vars set via API mid-build DO NOT reliably reach the running container.** Set env BEFORE `POST /deploys`, or hardcode for urgent fixes.
- **Holder-balance UPSERTs were the strangler.** Drain capacity < enqueue rate → unbounded queue → row-lock contention → whole DB slows. Until the write rate is fundamentally cut (batch size, chunk strategy, or lazy computation), holder writes cannot be re-enabled safely.

### Next session — what to check first
1. **Is lag still holding?** Expected near-zero with skip active. If lag grows past 30k again, MAX_LAG_BLOCKS will auto-re-skip.
2. **Should holder balances be re-enabled?** Requires solving the batch-UPSERT bottleneck FIRST. Options to explore:
   - Move token_balances to a write-behind log (append-only transfers table) + periodic materialized view.
   - Batch by token, process one token at a time to reduce lock fan-out.
   - Cap queue depth at enqueue site (drop oldest) to bound memory + backpressure.
3. **Historical gap 92978800-93018666** still unindexed. Use `FORCE_START_BLOCK` env to backfill if needed. Retention (3d) will evict eventually.

### Previous session (2026-04-17 session 2)
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


codex will review your output once you are done
