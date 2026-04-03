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

**Last updated:** 2026-04-03
**Branch:** `main`
**Status:** Full OOM crash fix deployed — waiting to confirm bnbscan stability

### What just shipped (this session)
- **SEO/AEO audit** — commit `5d741da`: canonical URLs, per-page metadata, JSON-LD (WebSite + SearchAction + Organization), dynamic `robots.ts` replacing static `robots.txt`, CSP fix for GA
- **revalidate=30 + AutoRefresh 30s** — commit `858e1f2`: replaced `force-dynamic` on homepage with ISR; 150x fewer concurrent renders under load; DB_POOL_SIZE=3 for web services
- **Moralis timeouts + heap limit** — commit `896c0e0`: `AbortSignal.timeout(10000)` on all 4 Moralis fetches (was missing NFT endpoint); `NODE_OPTIONS=--max-old-space-size=900` for bnbscan-web + ethscan-web to force GC before Render 1GB OOM kill

### Remaining known issues
- **Whales page shows no data**: Modern DeFi uses WBNB/WETH via `token_transfers`, not native `value`. Fix: rewrite whales page to query `token_transfers` for large ERC-20 moves (USDT, WBNB, etc.).
- **Deploy-overlap OOM**: During Render zero-downtime deploy, old + new Node.js processes overlap for ~60s, doubling memory on 1GB box. `NODE_OPTIONS=--max-old-space-size=900` mitigates but doesn't fully prevent. Upgrade bnbscan-web to 2GB plan ($50/mo) if crashes persist only during deploys.
- **og:image missing**: No social preview image on any page. Needs static image or dynamic OG image generation.
- **About/FAQ page missing**: Recommended for AEO (AI citation engines prefer clear factual Q&A).

### Incident: BNB DB connection exhaustion
- Root cause: crash-restart cycle leaking 5 DB connections per crash; 20 crashes = max_connections hit
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
- Inner pages with live DB/RPC still need `force-dynamic` (can't pre-render slow queries)

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
