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

**Last updated:** 2026-04-07
**Branch:** `main`
**Status:** Validator syncer fixed, whales page rewritten, design review completed. Both sites live.

### What just shipped (this session)
- **Validator syncer fix** — commit `6839391`: rewrote to use StakeHub `0x2002` (BEP-294 Fusion) with ValidatorSet `0x1000` fallback. Extended KNOWN_VALIDATORS. Awaiting first hourly sync cycle to populate data.
- **Whales page rewrite** — commit `6839391`: now queries both native transfers AND token_transfers for WBNB/WETH/USDT/USDC whale moves. Stablecoin threshold $10k, native/wrapped 10 BNB / 1 ETH.
- **Design review** — 3 CSS fixes pushed:
  - `7492e49`: H2 headings bumped from text-base to text-lg
  - `951ff8a`: Footer link touch targets increased (py-2)
  - `f508c38`: TxTable links use chainConfig.theme.linkText instead of hardcoded blue
- **Design score**: B overall / A on AI slop. Clean, professional, ship-ready.

### Remaining known issues
- **Validators page**: Syncer code fixed and deployed. Should populate on next hourly cycle. If still empty, check Render indexer logs for `[validator-syncer]` messages.
- **Whales page may show empty**: Token transfer query is deployed but depends on indexed token_transfers data. Will populate as indexer catches up.
- **DB disk growth**: BNBScan at ~73GB/100GB (73%). Need to run `psql $DATABASE_URL -f scripts/db-optimize.sql` against both DBs.
- **og:image missing**: No social preview image on any page.
- **About/FAQ page missing**: Recommended for AEO/trust.
- **isBot always false**: Bot detection disabled to enable ISR.
- **Design polish (optional)**: Bump H2s further to text-xl, add tabular-nums to number columns.

### Incident: BNB DB connection exhaustion (resolved)
- Root cause: OOM crash-restart cycle leaking 5 DB connections per crash; 20 crashes = max_connections hit
- Resolution: pro plan (2GB) eliminates crash cycle; ISR reduces render pressure
- BNB postgres ID: `dpg-d70kb62a214c73ebro4g-a` — restart via `POST /v1/postgres/dpg-d70kb62a214c73ebro4g-a/restart`

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
- Render deploys; BNB DB is basic-1gb (97 max_connections); ETH DB is also basic-1gb
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
