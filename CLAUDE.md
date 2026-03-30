# Claude Handoff

## Project

- Name: BNBScan / EthScan
- Workspace: `/Users/heatherm/Documents/Claude/bnbscan`
- Version: 0.1.1.0
- Monorepo: pnpm + Turborepo

## Architecture

- `apps/web` — Next.js 14, BNBScan frontend + API
- `apps/ethscan` — Next.js 14, EthScan frontend + API
- `apps/indexer` — BullMQ indexer for BNB Chain
- `apps/eth-indexer` — Node.js indexer for Ethereum
- `packages/db` — Drizzle ORM schema + Postgres
- `packages/explorer-core` — Shared utils (rate limiting, formatting)
- `packages/ui` — Shared React components

## Current Work

> **Update this section at the end of each session before closing.**

**Last updated:** 2026-03-30
**Branch:** `main`
**Version:** 0.1.1.0
**Status:** P0 + P1 shipped this session

### What just shipped
- **P0 reorg handling** — batch-boundary parent hash validation in both indexers
  - `apps/indexer/src/reorg-handler.ts` + `apps/eth-indexer/src/reorg-handler.ts`
  - On mismatch: walks back to fork point (max 64 blocks), deletes orphaned rows by range, resets `lastIndexed`
- **P1 token holder counts** — live `tokens.holder_count` via `token_balances` table
  - New `token_balances (token_address, holder_address, balance)` table in both DBs
  - Both `token-decoder.ts` files now upsert balances and detect zero-crossings to adjust `holder_count`
  - Replay-safe: only updates when `token_transfers` INSERT actually inserts (RETURNING check)
- **P1 address rows** — both indexers now write `addresses` (tx_count, first_seen, last_seen)
  - `block-processor.ts` and `indexBlock()` use RETURNING + unnest batch-upsert
  - Fixes `generateMetadata` showing "0 transactions", and populates first/last seen on address pages

### Uncommitted changes
- All P0/P1 work above (not yet committed)
- Duplicate "copy 2" files in packages/ (accidental Finder duplicates, safe to delete)
- Modified `.claude/launch.json`

### What just shipped (this session continued)
- **P2 Redis rate limiting**: `explorer-core` rate-limit now uses Redis INCR+PEXPIRE sliding window, falls back to in-memory. All 21 callers awaited. `ioredis` added to explorer-core.
- **P2 Negative caching**: both `rpc-fallback.ts` files have 5-min null cache; both `moralis.ts` files use `NULL_SENTINEL` pattern.
- **P2 Storage**: zero-balance `token_balances` rows pruned in retention cleanup; functional DATE indexes added to transactions/token_transfers/gas_history for chart queries.
- **P3 Wallet signature**: `POST /api/v1/keys` requires `signature`+`timestamp`, verified via `ethers.verifyMessage()`. 5-min expiry. Dev page examples updated.

### Next steps
- Run `pnpm install` to pick up `ioredis` in explorer-core
- All TODOS.md items now complete — backlog is clear

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- See `TODOS.md` for full prioritized backlog
- Render deploys; Postgres 25GB limit is a constraint

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
