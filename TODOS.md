# TODOS

## Developer Platform

### Redis-backed rate limiting
**Priority:** P2
**Why:** Prevents rate limit bypass if Render auto-scales the web service to multiple instances. The current in-memory Map is per-process — each instance has an independent counter. An attacker hitting N instances gets N × 100 req/min effective limit.
**Current state:** Rate limiter lives in `packages/explorer-core/src/rate-limit.ts`. Redis is already in the stack (`REDIS_URL` env var on bnbscan-web, connected via ioredis in the indexer).
**Fix:** Replace `Map<string, ...>` with a Redis sliding window counter (ioredis + `INCR` + `EXPIRE`). Can be a drop-in replacement behind the same `checkRateLimit()` interface.
**Pros:** Correct rate limiting across all instances; uses Redis already paid for.
**Cons:** One Redis round-trip per API call (~1ms); requires `REDIS_URL` in the web app's env (already set).
**Depends on:** None. Redis is already deployed.

## Indexer Correctness

### Reorg handling — canonical chain validation
**Priority:** P0
**Why:** Both indexers write blocks blindly by height without validating parent hashes. BSC/ETH have routine reorgs (1-2 blocks is common on BSC). A reorg will silently corrupt the DB — orphaned transactions and logs will persist as if canonical.
**Current state:** `block-indexer.ts` and `eth-indexer/src/index.ts` advance by block number with no parent hash check and no unwind path.
**Fix:** Before inserting a block, verify `block.parentHash === db.blocks[block.number - 1].hash`. On mismatch, unwind from the fork point: delete transactions/logs/token_transfers for the orphaned blocks, then re-index the canonical chain. Use a `CONFIRMATION_DEPTH = 6` buffer — don't expose blocks shallower than 6 confirmations.
**Pros:** Correct explorer — critical for any DeFi use where a "confirmed" tx could be rolled back.
**Cons:** Significant implementation — needs atomic unwind + re-index; adds ~1 DB round-trip per block.
**Depends on:** None. Can be added to existing indexer loop.

### BNB ingestion idempotency — unique constraints on logs/token_transfers
**Priority:** P0
**Why:** The indexer uses `ON CONFLICT DO NOTHING` on log and token_transfer inserts, but neither table has a unique constraint on `(tx_hash, log_index)`. This means replays and retries silently duplicate rows instead of skipping them.
**Current state:** `packages/db/schema.ts` — `logs` and `tokenTransfers` tables have no unique index. `log-processor.ts` and `token-decoder.ts` use `onConflictDoNothing()` which is a no-op without a conflict target.
**Fix:** Add `unique('logs_tx_log_idx').on(logs.txHash, logs.logIndex)` and equivalent for `tokenTransfers`. Migration needed.
**Pros:** Replay-safe indexing; enables crash recovery without data corruption.
**Cons:** Migration on live DB; slight write overhead per insert.
**Depends on:** DB migration.

## Security

### Webhook management authentication
**Priority:** P1
**Why:** `GET /api/v1/webhooks?owner=0x...` and `DELETE /api/v1/webhooks/:id?ownerAddress=0x...` rely on `ownerAddress` in the query string with no proof of ownership. Knowing any address (e.g., from etherscan) is enough to enumerate or delete that address's webhooks.
**Current state:** `apps/web/app/api/v1/webhooks/route.ts` and `webhooks/[id]/route.ts` — ownerAddress is a query param, not authenticated.
**Fix:** Require a wallet signature on webhook management operations (same approach as the P3 API key ownership item). Or at minimum, require a valid `X-API-Key` whose `ownerAddress` matches the requested address.
**Pros:** Prevents webhook enumeration and unauthorized deletion.
**Cons:** Adds friction to webhook management UX; needs wallet-connect or API key requirement.
**Depends on:** Developer page UX update (can short-circuit with API key requirement).

### API key ownership verification via wallet signature
**Priority:** P3
**Why:** Currently anyone can call `POST /api/v1/keys` with any `ownerAddress` and get a key "linked" to that address. There's no proof the caller controls the wallet.
**Current state:** Keys are created and enforced via `X-API-Key` header, but ownership is just a metadata field.
**Fix:** Require a wallet signature when creating keys — user signs a message `BNBScan API Key Request: <timestamp>` with their private key, and the server verifies it via `ethers.verifyMessage()`. This is wallet-connect UX on the developer page.
**Pros:** Real ownership proof; prevents griefing (claiming someone else's address).
**Cons:** Requires wallet connection UI (MetaMask etc.) on the developer page; adds friction.
**Depends on:** Developer page UX update.

## Data Quality

### Live-update address balance and token holder counts
**Priority:** P1
**Why:** `addresses.balance`, `addresses.tx_count`, and `tokens.holder_count` are shown in the UI but never written by the indexers. Tokens are inserted with `holderCount: 0` and it never changes. Users see zeros and stale counts.
**Current state:** `token-decoder.ts` inserts tokens with `holderCount: 0`. No state updater exists in either indexer.
**Fix:** On each token transfer, increment/decrement `holder_count` via a DB trigger or indexer hook. For ETH/BNB balance, derive from `tx.value` deltas or call the RPC `eth_getBalance` at index time (cheaper: do it lazily on address page load with a short TTL cache).
**Pros:** Correct data — essential for token page credibility.
**Cons:** Balance tracking from tx deltas is complex (gas accounting); RPC calls add latency.
**Depends on:** None for token holder_count (indexer-only change). RPC balance needs caching layer.

### Negative caching for RPC/Moralis fallback calls
**Priority:** P2
**Why:** DB misses on the read path trigger live RPC + Moralis calls with no negative cache. Anyone can force repeated expensive misses by querying unindexed addresses/hashes — each miss costs RPC quota and Moralis credits.
**Current state:** `rpc-fallback.ts` and `moralis.ts` have no negative cache; `api-rate-limit.ts` rate-limits by IP but not by the cost of the specific miss.
**Fix:** Cache `null` results in Redis with a 5-minute TTL (or per-entity TTL). This prevents repeated Moralis/RPC calls for the same missing entity within the window.
**Pros:** Protects Moralis/RPC quota from abuse; reduces p99 latency on miss storms.
**Cons:** One Redis round-trip on each miss path; 5 min delay before a freshly-indexed entity is visible via fallback.
**Depends on:** Redis (already deployed).

## Infrastructure

### Storage planning — partitioning and retention policy
**Priority:** P2
**Why:** Render Standard Postgres is 25 GB. BSC + ETH produce millions of transactions/logs daily. Aggregate scans over `token_transfers` (holder pages, charts) will slow as tables grow, and the DB will fill up without a retention or partitioning strategy.
**Current state:** No table partitioning, no VACUUM tuning, no archival plan. Raw aggregates in the charts/token-holder pages.
**Fix:** (1) Partition `transactions` and `token_transfers` by month. (2) Add materialized views or pre-aggregated rollup tables for chart queries. (3) Decide retention: keep 90 days hot, archive older to S3 or drop.
**Pros:** Keeps query times predictable; prevents storage surprise.
**Cons:** Schema migration; rollup jobs add operational complexity.
**Depends on:** Render Postgres plan decision (may need to upgrade from 25 GB).

## Completed

