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

**Last updated:** 2026-04-04
**Branch:** `main`
**Status:** Both sites stable on pro plan (2GB). OOM crash-loop resolved.

### What just shipped (this session)
- **CSP fix for GA4** — commit `c36d005`: added GA4 domains to connect-src
- **ISR on all pages** — commits `07f328c`, `9a4acef`: replaced all `force-dynamic` with `revalidate=30` (fast pages) or `revalidate=300` (slow pages). Removed `headers()` call from address page that was forcing dynamic rendering.
- **Build fix** — commit `165d457`: added `const isBot = false` after removing `headers()` import
- **Pro plan upgrade** — both bnbscan-web and ethscan-web upgraded from standard (1GB) to pro (2GB) via Render API. NODE_OPTIONS set to `--max-old-space-size=1536`.
- **render.yaml sync** — updated to reflect pro plan + 1536MB heap limit

### Remaining known issues
- **Whales page shows no data**: Modern DeFi uses WBNB/WETH via `token_transfers`, not native `value`. Fix: rewrite whales page to query `token_transfers` for large ERC-20 moves (USDT, WBNB, etc.).
- **og:image missing**: No social preview image on any page. Needs static image or dynamic OG image generation.
- **About/FAQ page missing**: Recommended for AEO (AI citation engines prefer clear factual Q&A).
- **isBot always false**: Bot detection disabled to enable ISR. Bots now get Moralis-enriched pages (costs API calls). Could re-enable with middleware-based detection if Moralis costs become an issue.

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
