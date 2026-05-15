# bnbscan — Session Handoff Archive

> Archived from CLAUDE.md on 2026-04-20 to reduce session-start context cost.
> Newest archived session first. Current session lives in CLAUDE.md `## Current Work`.

---

### This session (2026-05-15 HKT) - BNB indexer lag root cause + prod fix

**User report:** "the bnbscan.com lag is big, why and how to resolve?"

**Root cause:** BNB indexer was stuck retrying block `98190747` with:

`invalid byte sequence for encoding "UTF8": 0x00`

The bad byte came from on-chain token metadata (`name` / `symbol`) containing NUL/control characters. PostgreSQL rejects U+0000 in text/varchar columns, so one malformed token metadata fetch froze the sequential indexer. As lag grew past live `MAX_LAG_BLOCKS=5000`, the running worker auto-skipped forward, restoring visible freshness but leaving a recent gap around the poison block. After the first fix deployed, the still-unfixed worker also hit the same NUL-byte failure later at `98204021`, confirming this was not a one-off block issue.

**Code shipped to `main`:**
- `f31e95a fix(indexer): sanitize token metadata before insert`
  - Adds `apps/indexer/src/postgres-text.ts`.
  - Sanitizes token `name` / `symbol` before inserting into `tokens`.
  - Adds `apps/indexer/src/postgres-text.test.ts`.
- `575ebcb fix(indexer): cast resume gap scan bounds`
  - Fixes the startup gap scan query with explicit `generate_series(...::bigint, ...::bigint)` casts.

**Render deploys:**
- `dep-d82ofb42m8qs73c5thl0` from `f31e95a` built and went live, but immediately failed at startup:
  - `function generate_series(unknown, unknown) is not unique`
  - Deactivated after follow-up deploy.
- `dep-d82oggb7uimc73enqt9g` from `575ebcb` is live.
  - Created `2026-05-14T08:30:57Z`, finished `2026-05-14T08:32:14Z`.

**Important behavior change:** `apps/indexer/src/index.ts` now scans the last `RESUME_GAP_SCAN_BLOCKS` (default `20000`) on startup. If it finds a missing block, it resumes from the first gap and temporarily disables the `MAX_LAG_BLOCKS` skip guard until it backfills through the previous max indexed block. This is why the second deploy repaired the auto-skip gap instead of skipping it again.

**Production verification:**
- New worker detected: `Resume gap detected at block 98184040; backfilling before tip 98204040`.
- It passed the original stuck block:
  - `2026-05-14T09:07:23Z Indexed block 98190750`
  - No new `invalid byte sequence` loop.
- It later caught up fully:
  - `2026-05-15T01:00:20Z Indexed block 98338798 (tip: 98338798, lag: 0, 7.85 blk/s)`
  - `/api/health` at handoff: `latestBlock=98338798`, `lagSeconds=4`.
  - RPC comparison at handoff: indexed `98338798`, chain `98338807`, `lagBlocks=9` (~0.5 min).

**Local verification caveat:** `git diff --check` passed. Local `corepack pnpm --filter @bnbscan/indexer build` and `corepack pnpm exec vitest run apps/indexer/src/postgres-text.test.ts` hung in this workspace and were killed. Render built and deployed successfully, and production logs are the confidence source for this incident.

**Current workspace state:** only untracked `AGENTS.md` remains; it was pre-existing/unrelated and intentionally left untouched.

**Next recommended checks:**
1. Re-check BNB `/api/health` and Render logs if lag grows again; look specifically for `invalid byte sequence`, `Block N failed`, and `Resume gap detected`.
2. Fix local test/build hangs separately. The repo currently relies too much on production/Render as the practical build gate.
3. Consider adding a public/internal gap metric so `MAX(blocks.number)` cannot hide skipped ranges after future auto-skips.

### This session (2026-04-19 session 5) — ethscan-db disk alert

**Alert:** PostgreSQL database `ethscan-db` using more than 90% of 30GB.

**Diagnosis (no code change, log-reading only):**
- Size-report trajectory from retention-cleanup output: 15.30GB on 2026-04-16 → 25.30GB on 2026-04-19 06:48 UTC (84.3% of 30GB). Growth ~**3.3 GB/day**, steeper than the prior "~3GB/day" note.
- `RETENTION_DAYS=7` was set, but the three most recent retention cycles (2026-04-18T18:48, 2026-04-19T00:48, 2026-04-19T06:48) all logged `cutoff block_number = 24867353` and `Done — 0 total rows removed`. This was correct: the ETH DB was created 2026-04-13, so no rows were old enough for 7-day eviction yet.
- Projected Day-7 steady state at the observed rate: 3.3 × 7 ≈ 23GB data + ~4-5GB indexes ≈ **~28GB = 93% of 30GB**. The alert fired because steady state was past the disk ceiling.

**Fix applied:** `RETENTION_DAYS=7 → 4` on eth-indexer (`srv-d70kbdqa214c73ebrtq0`). Rationale: matches the tighter policy adopted for BNB after similar disk pressure, reversible, no cost delta. Alternative (expand disk to 50GB at ~$10/mo) was offered but not chosen. With the 4-day cutoff the first post-deploy cleanup should evict ~3 days × 3.3GB ≈ **10GB** and land disk around 50-55%.

**Expected timeline after 09:16:29 UTC deploy:**
1. Build completes ~09:20 UTC.
2. Startup retention is deferred 15 min, so first cleanup with the new cutoff runs ~09:35 UTC. `blocks` DELETE with `NOT EXISTS (tx)` subquery against the 25GB tx table is the slow phase; expect 5-20 min based on BNB session-2 precedent.
3. Scheduled retention resumes every 6h.

**Env verification after fix:**
- ETH indexer env vars confirmed via API: `RETENTION_DAYS=4`, `DB_DISK_GB=30`, `INDEX_CONCURRENCY=8`, `DB_POOL_SIZE=3`, `ETH_RPC_URL=https://ethereum-rpc.publicnode.com`, `START_BLOCK=24710000`, `NODE_OPTIONS=--max-old-space-size=1280`, `CHAIN=eth`.
- DB still `ethscan-db` (dpg-d7e4b83bc2fs73ec3la0-a), basic_1gb, 30GB disk.

**Next session notes from then:**
1. Verify the ScheduleWakeup fired and the 4-day retention ran.
2. If retention did not free space, drop to `RETENTION_DAYS=2`, expand disk to 50GB, or both.
3. Consider `VACUUM_FULL=1` on eth-indexer after retention frees rows if disk stays above 70%.
4. Correct stale ETH steady-state docs; 7d retention did not fit in 30GB.

---

### This session (2026-04-18 session 4)

**Three workstreams in parallel after the user said "all":**

1. **Em-dash fix → [PR #34](https://github.com/heathermhuang/bnbscan/pull/34) `fix/homepage-24h-tx-count`** — Root cause: `fetchTxCount24h` ran `COUNT(*) WHERE timestamp > NOW() - INTERVAL '24 hours'`. Index scan on `tx_timestamp_idx` was fine, but COUNT must visit heap pages, and on the bloated tx heap that tripped the 15s `dbTimeout` fallback to 0 → rendered as `—`. Fix in [page.tsx:118-138](apps/explorer/app/page.tsx:118): switched to `block_number > tipBlock - blocksPer24h` (covered by `tx_block_idx`, no heap visibility-map dependence) AND made the function return `null` on error so the StatCard distinguishes "unknown" from a true zero. Verified locally against prod DB: 2,875,175 tx in last 24h. Now that VACUUM FULL is done the original timestamp query would also work — but the block_number filter is just better, no reason to revert.

2. **Tier-3 agent-readiness → [PR #35](https://github.com/heathermhuang/bnbscan/pull/35) `feat/markdown-tx-block`** — User chose "ship markdown today, plan MCP next session". Extends `Accept: text/markdown` to `/tx/{hash}` and `/block/{number}` (PK lookups, sub-ms reads, `Cache-Control: max-age=31536000, immutable`). `/address/*` intentionally excluded — fan-out queries against bloated heap can hang. Middleware regex-validates hash + block format before rewriting. Not-found returns 404 markdown with API/web pointers + 60s cache. SKILL.md updated; sha256 in agent-skills index auto-rotates from `skillBody()`. All five branches verified locally (tx-found 200, block-found 200, tx-not-found 404, /address-with-md no-rewrite, /block-no-md-header no-rewrite).

3. **VACUUM FULL → COMPLETE.** Recipe followed (per session 3 lesson "set env BEFORE deploy"): `PUT /v1/services/srv-d70kbmia214c73ebs3a0/env-vars/VACUUM_FULL` `{"value":"1"}`, then `POST /v1/services/srv-d70kbmia214c73ebs3a0/deploys`. Deploy `dep-d7hks9hf9bms73fm89b0` went live 09:27:10 UTC. VACUUM FULL ran sequentially per [retention-cleanup.ts:299-314](apps/indexer/src/retention-cleanup.ts:299):
   - `token_transfers`: 09:27:12 → 09:56:10 (29 min, ~18GB reclaimed)
   - `transactions`: 09:56:10 → 10:11:52 (16 min, ~38GB reclaimed)
   - `blocks`, `logs`, `dex_trades`, `gas_history`: 10:11:52 → 10:11:59 (~7s, mostly empty/small)
   - `token_balances`: 10:11:59 → 10:16:05 (4 min)
   - **Total: 49 minutes.** First post-VACUUM size report (10:10:25, mid-run): `total=64.61GB tx=10563MB tt=16997MB blocks=170MB logs=0MB tb=2645MB dex=0MB disk=64.6%of100GB`. Final reading will likely be slightly lower once the next 6h retention cycle (~16:00 UTC) reports.

**Indexer behaviour during VACUUM:** processed at 2-3 blk/s throughout, lag peaked around 3,642 blocks (under the 5,000 `MAX_LAG_BLOCKS` skip threshold) and was back to lag=0 by 10:30 UTC. The `transactions` VACUUM phase took an exclusive lock on the tx table — the `/txs` HTML page reads paused for 16 min — but `/blocks` and `/` stayed responsive (homepage uses ISR). No user-visible outage.

**isitagentready.com re-scan attempted but the SPA scanner is Cloudflare-blocked from headless Chromium** — the browser tab gets killed every time the form submits (`Target page, context or browser has been closed`). Pivoted to direct curl-verification of every tier-1+2 signal on both domains: robots.txt with AI rules, Link headers (with `agentskills.io/rel/index`), `/.well-known/api-catalog` (RFC 9727), `/.well-known/agent-skills/index.json` (sha256 d693a… BNB / 2e116… ETH), markdown negotiation on the 4 static pages. All clean. The actual SPA-scanner score the user wants — they'll need to run that themselves in a real browser, takes 30 seconds.

**Render API recipe (worth keeping for next time):**
- API key: `/Users/heatherm/Documents/Claude/bnbscan/.render-api-key`. File contains `RENDER_API_KEY=rnd_...`; strip the prefix before passing as `Authorization: Bearer rnd_...`.
- Owner: `tea-d6roaibuibrs73dteu2g`. Indexer service: `srv-d70kbmia214c73ebs3a0`.
- VACUUM FULL on/off: `PUT|DELETE /v1/services/{svc}/env-vars/VACUUM_FULL` then `POST /v1/services/{svc}/deploys`. Always trigger a deploy after env mutation; mid-build env changes are unreliable.
- Logs: `GET /v1/logs?ownerId=...&resource=...&limit=N&direction=backward[&text=...&startTime=...]`. Use `text=` with URL-encoded substring for filtering. The `text=disk` query reliably finds the size-report lines.

### Next session — what to check first

1. **Final disk %.** Pull a fresh size-report log: `text=disk&startTime=2026-04-18T10:30:00Z`. The first post-redeploy retention cycle (~16:00 UTC) will give the steady-state figure. If it's not there yet, look for it on the next pass.
2. **PR #34 + #35 + this session's handoff PR.** All three should be reviewed and merged. PR #36 is the *interim* handoff (pre-VACUUM-finalize) and is now superseded — close it or merge as historical context. The new handoff PR opened at the end of this session contains the post-VACUUM state.
3. **Verify VACUUM_FULL stays unset.** If the indexer ever restarts and the env var was somehow re-set, VACUUM FULL would run again. Spot-check via the env-vars endpoint.
4. **Tier-3 next move (MCP).** Stand up `/.well-known/mcp` + `/api/mcp` minimal read-only server. Multi-day project. Start by reading the Cloudflare MCP server spec and picking a transport (HTTP+SSE is simplest). Could also consider extending markdown to `/address/{addr}` now that the bloat is gone — the original concern (fan-out queries on a bloated heap hanging for minutes) is significantly reduced.
5. **Disk growth budget:** at 1d retention with the now-clean heap, total should stay well under 70GB even at peak. If it climbs past 75% within a few days, a follow-up VACUUM FULL is cheap and we know the recipe works.

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
