# TODOS

## Developer Platform

### Redis-backed rate limiting
**Priority:** P2 → **Completed:** 2026-03-30
`packages/explorer-core/src/rate-limit.ts` now uses Redis sliding window (INCR + PEXPIRE) when `REDIS_URL` is set. Falls back to in-memory Map when Redis is unavailable. All callers updated to `await checkIpRateLimit()`. Added `ioredis` dep to explorer-core.

## Indexer Correctness

### Reorg handling — canonical chain validation
**Priority:** P0 → **Completed:** 2026-03-30
Batch-boundary parent hash check in both indexers (`reorg-handler.ts`). On mismatch, walks back up to 64 blocks to find fork point, deletes orphaned rows by block_number range (logs → token_transfers → dex_trades → transactions → blocks), resets `lastIndexed`. CONFIRMATION_DEPTH buffer deferred — needs API-layer changes to hide shallow blocks.

## Security

### API key ownership verification via wallet signature
**Priority:** P3 → **Completed:** 2026-03-30
`POST /api/v1/keys` now requires `signature` + `timestamp` in the request body. Server verifies with `ethers.verifyMessage()`. Signatures expire after 5 minutes. Developer page code examples updated. MetaMask UI on the page remains a future UX-only task.

## Data Quality

### Live-update address balance and token holder counts
**Priority:** P1 → **Completed:** 2026-03-30
- `tokens.holder_count`: new `token_balances` table tracks per-address balances; both `token-decoder.ts` files upsert on transfer and adjust `holder_count` on zero-crossings. Replay-safe via RETURNING.
- `addresses.tx_count` / `first_seen` / `last_seen`: both indexers now batch-upsert address rows after each block using `unnest` (one SQL statement per block). RETURNING on tx insert prevents double-counting on replay.
- `addresses.balance`: kept as live RPC on address page load (already implemented).

### Negative caching for RPC/Moralis fallback calls
**Priority:** P2 → **Completed:** 2026-03-30
Both `rpc-fallback.ts` files now cache null results in-memory with 5-min TTL (up to 10k entries). Both `moralis.ts` files now cache failed responses with 5-min TTL using a `NULL_SENTINEL` in the existing memCache. All `getCached()` checks updated to `!== undefined` to distinguish "not cached" from "cached null".

## Infrastructure

### Storage planning — partitioning and retention policy
**Priority:** P2 → **Completed (partial):** 2026-03-30
- Retention cleanup now also prunes zero-balance rows from `token_balances` and VACUUMs it.
- Added functional indexes `DATE(timestamp AT TIME ZONE 'UTC')` on `transactions`, `token_transfers`, `gas_history` to speed up charts' GROUP BY DATE queries.
- Table partitioning by month deferred — requires recreating live tables (destructive migration, out of scope without a maintenance window).

## Open

### Homepage "24H Transactions" shows em-dash instead of a count
**Priority:** P2 → **Found:** 2026-04-18 (by `/qa`)
Network Overview card on `/` renders `—` in the value row with sub-label "last 9m ago". Other cards (Latest Block, Market Cap, BNB Price) populate correctly. No console errors. Suspect: 24h-count DB query returning null, or ISR cache holding a null across revalidate. Unrelated to `RETENTION_DAYS=2` — 2d > 24h window. Repro: `https://bnbscan.com/`, third card in Network Overview strip. Evidence: `.gstack/qa-reports/qa-report-bnbscan-com-2026-04-18.md` + `screenshots/home2.png`. Check persists past 03:00 UTC before digging into `apps/explorer/app/page.tsx`.

## Completed

### Webhook management authentication
**Priority:** P1 → **Completed:** v0.1.1.0 (2026-03-23)
`GET /webhooks` and `DELETE /webhooks/:id` now require `X-API-Key` whose `ownerAddress` matches the requested owner. `requireApiKeyOwner()` helper added to both `apps/web/lib/api-auth.ts` and `apps/ethscan/lib/api-auth.ts`.

### BNB ingestion idempotency — unique constraints on logs/token_transfers
**Priority:** P0 → **Completed:** v0.1.1.0 (2026-03-23)
Added `unique('logs_tx_log_unique').on(txHash, logIndex)` and `unique('tt_tx_log_unique').on(txHash, logIndex)` to `packages/db/schema.ts`. `ON CONFLICT DO NOTHING` now functions correctly on replays and crash recovery.

