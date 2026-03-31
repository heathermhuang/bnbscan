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

**Last updated:** 2026-03-31
**Branch:** `main`
**Version:** 0.1.1.0
**Status:** Both services live on commit `0ee7182`

### What just shipped (this session)
- **Whale Tracker fix** (`3b3cd62`) — now queries `transactions` table for native BNB/ETH transfers instead of `tokenTransfers` (ERC-20/BEP-20 shitcoins)
- **Build timeout fix** (`0ee7182`) — 5 pages with `revalidate` + DB/RPC calls were timing out during static pre-render on Render build workers; switched to `force-dynamic` on: `charts`, `gas`, `staking`, `validators`, `page` (homepage)

### Deploy status
- Both `ethscan-web` and `bnbscan-web` are **live** on `0ee7182`
- Build logs accessible via Render API: `GET /v1/logs?ownerId=tea-d6roaibuibrs73dteu2g&resource=<serviceId>&type=build&limit=100&direction=backward`

### Render service IDs
- `ethscan-web`: `srv-d70kbdqa214c73ebrtqg` — rootDir: `apps/explorer`, CHAIN=eth
- `bnbscan-web`: `srv-d70kbmia214c73ebs3ag` — rootDir: `apps/explorer`, CHAIN=bnb
- `bnbscan-indexer`: `srv-d70kbmia214c73ebs3a0`
- `eth-indexer`: `srv-d70kbdqa214c73ebrtq0`
- Render API key: `.render-api-key` (gitignored)
- Owner ID: `tea-d6roaibuibrs73dteu2g`

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- Render deploys; Postgres 25GB limit is a constraint
- Pages with DB/RPC calls must use `force-dynamic` not `revalidate` — build workers can't pre-render pages that make slow external connections

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
