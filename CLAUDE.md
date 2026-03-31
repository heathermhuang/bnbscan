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
**Status:** 11 commits uncommitted on main — needs deploy

### What just shipped (this session)
- **Design audit** — ETH theme changed from indigo to navy blue, emoji stripped from gas/watchlist/search/staking/developer pages, custom 404 page added
- **QA fixes** — rate-limit tests async (`b1a940d`), 5s timeouts on GoPlus/SpaceID/ENS/CoinGecko (`333b18f`), 8s timeout on charts DB queries (`cce560b`)
- **Theme sweep** — all hardcoded `text-blue-600`, `bg-yellow-500` buttons replaced with `chainConfig.theme.*` across all pages + components

### Deploy status
- Both `ethscan-web` and `bnbscan-web` are **live** on `0ee7182` (stale — 11 new commits on main, need deploy)
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

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

Key rules from the design system:
- **Fonts:** Plus Jakarta Sans (UI/labels) + JetBrains Mono (ALL data values — numbers, hashes, balances, not just code)
- **BNB accent:** `#F3BA2F` official hex; Tailwind `yellow-400` (#FACC15) is the approximation in use
- **ETH accent:** `#1E3A8A` / Tailwind `blue-900`
- **Page background:** `#F7F7F5` warm off-white (not pure white)
- **Links:** `#4B6CB7` blue-gray
- **Chain accent** appears on: left-border of stat cards, focus rings, active nav, primary buttons
