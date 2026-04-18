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

**Last updated:** 2026-04-18 (session 5)
**Branch:** `main` (through merge commit `d2f6a70`, PR #29)
**Status:** Site partially degraded at handoff — `/blocks` and `/txs` timing out >15s; home 0.84s (ISR cache). VACUUM ANALYZE on 49GB `transactions` + 35GB `token_transfers` still running from the 01:15 UTC retention cycle. Crawler storm (ClaudeBot + meta-externalagent) amplifying the pain. **PR #29 merged + deploying now** to 429 aggressive crawlers on heavy paths — this is the durable fix. Disk at 87.1% → emergency retention (1-day window) will auto-fire after VACUUM loop completes via `EMERGENCY_DISK_PCT=85` branch.

### Session 5 arc (2026-04-18)

**Trigger:** user reported "getting slower again". Probed:
- `/` 0.84s ✅ (ISR cached)
- `/blocks` / `/txs` >60s ❌
- Indexer healthy, lag 700, gaining at 2-3 blk/s
- Retention fix from session 4 worked — 459,740 rows deleted at 01:15:40 UTC

**Root cause (two compounding):**
1. **VACUUM ANALYZE still running** on the two big tables (49GB + 35GB). Historical baselines show 11-26 min each under load. No "VACUUM ANALYZE transactions done" log line yet.
2. **Crawler storm**: `ClaudeBot` and `meta-externalagent` (Meta) were firing 50+ concurrent requests at `/blocks`, `/txs`, `/address/*` — visible in bnbscan-web logs with `responseTimeMS=10000-50000`. Both ignore `robots.txt` (which already disallows `/address/` and `/api/`).
3. **DB at 87.1%** of 100GB disk (tt grew 25GB→35GB overnight) — above `EMERGENCY_DISK_PCT=85`. Self-heal path in `retention-cleanup.ts:286-296` captures `diskPct` before VACUUM and recurses with `EMERGENCY_RETENTION_MIN_DAYS=1` after the loop completes.

**Fix shipped — PR #29 `fix(explorer): 429 aggressive crawlers on heavy paths`** (merge commit `d2f6a70`)
- New `apps/explorer/middleware.ts` matches UA substrings (`ClaudeBot`, `meta-externalagent`, `GPTBot`, `Bytespider`, `Amazonbot`, `PerplexityBot`, `CCBot`, `anthropic-ai`, `FacebookBot`, etc.) AND heavy paths (`/blocks`, `/txs`, `/tx/`, `/address/`, `/token/`, `/block/`) → returns **429 with `Retry-After: 3600`**.
- Real users unaffected — UA match only. Home + ISR paths not throttled.
- Deploy in progress at handoff: `dep-d7he3oernols73dqqfig` (build_in_progress).

### What to verify next session
1. **Deploy live?** `curl -H "User-Agent: meta-externalagent/1.1" https://bnbscan.com/blocks` should return 429. Real browser UA should return 200.
2. **VACUUM done?** Search indexer logs for `VACUUM ANALYZE transactions done` + `token_transfers done`. After completion, `/blocks` and `/txs` should drop back to sub-1s (planner re-stat + reduced IO contention).
3. **Emergency retention fired?** Search indexer logs for `emergency re-run with 1d window`. If disk% stays ≥85%, the self-heal path should have triggered a second deletion pass at 1-day retention. If NOT fired, check whether the 6h setInterval ran again.
4. **Disk recovery?** After emergency cleanup + VACUUM, `total=XX.XGB disk=YY.Y%of100GB` should drop below 85%. If still above 85%, consider `VACUUM FULL` (set `VACUUM_FULL=1` env var on indexer, restart, then remove — locks tables 10-30 min but returns space to OS).

### Still-TODO / future work
- **tt table growth 25→35GB overnight** not fully explained — investigate steady-state write rate vs bloat; possibly a surge of contract activity. Worth profiling.
- **BNB_RPC_URL** still only 2-RPC round-robin. Adding 2-3 more public BSC RPCs gives more headroom for catch-up after emergency skips.
- **PR #27** (session 4 handoff docs) still open? — check and close/merge as needed.

### Key takeaways (session 5)
- **Aggressive AI crawlers (ClaudeBot, GPTBot, PerplexityBot) + Meta's scraper ignore `robots.txt`**. Any heavy DB path MUST be protected at middleware level, not just in `robots.ts`. PR #29 is the template.
- **VACUUM ANALYZE under concurrent load is slow**: 11-26 min per big table even with only moderate indexer writes. During that window, any amplified traffic = user-visible outage. Bot throttling is the structural fix.
- **Disk pressure trigger works**: `EMERGENCY_DISK_PCT=85` in the refactored retention will auto-tighten to 1-day, but only AFTER the VACUUM loop finishes. If under real pressure, consider skipping VACUUM in favor of a faster second delete pass.

### Previous session handoff — session 4 (2026-04-17 → 04-18 early AM)
Root cause of weeks-long DB degradation: `drizzle-orm/postgres-js` `.execute()` returns `postgres.RowList` whose affected-row count is `.count`, NOT `.rowCount`. All 4 retention delete call sites + the admin prune route read undefined `.rowCount`, so the `if (totalDeleted > 0) VACUUM ANALYZE` guard never fired. Weeks of un-VACUUMed DELETEs → massive index bloat → `/blocks` and `/txs` collapsed to 30-60s.
- Commit `e0a3098` — fix rowCount → count in `retention-cleanup.ts` (4 sites) and `db-prune/route.ts` (1 site).
- Commit `2dbeafe` (PR #28) — refactor retention to block_number-based DELETE (100-1000x faster than timestamp seq scan), add `EMERGENCY_DISK_PCT=85` self-heal, add fallback for stale indexer, widen whitelist to include `token_balances`.
- First retention run after deploy deleted 1,178,369 rows, /blocks dropped 60s→0.29s before VACUUM even finished (planner re-stat).
- Also lowered `MAX_LAG_BLOCKS=5000` to trigger skip at 8365 lag — indexer caught up 7162→160.

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
