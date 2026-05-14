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

**Last updated:** 2026-05-14 ~08:10 HKT (Codex housekeeping)
**Branch / remote:** local `main` preserved the prior session-5 handoff commit, merged `origin/main` at `e3fb5c0`, then this handoff cleanup was committed on top. Production deploys from `main` via Render auto-deploy.
**Status:** **BNBScan content loading incident resolved; EthScan tx summary currency bug resolved.** Both web services deployed from `main` and smoke checks passed.

### This session (2026-05-13) — BNB web DB starvation + EthScan summary bug

**Initial symptom:** bnbscan.com loaded shell/market data but DB-backed content was missing or stale: homepage block/tx tables empty at first, `/api/health` returned `latestBlock: null`, and heavy API/page requests timed out.

**Root cause:** `bnbscan-web` was being hammered by `meta-webindexer/1.1` on DB-heavy paths (`/tx/*`, `/address/*`). Existing middleware throttled some crawlers but did not match `meta-webindexer` and matched user agents case-sensitively. Those requests held the small web DB pool for 25–50s, starving homepage and health DB reads. BNB indexer itself was healthy and writing fresh blocks to the same DB.

**Fixes shipped to `main`:**
- `9ddf1dd` — `fix(explorer): throttle Meta crawler heavy paths`
  - Adds `meta-webindexer` and `facebookexternalhit` to aggressive crawler matching.
  - Makes aggressive bot UA matching case-insensitive.
  - Adds DB-heavy API prefixes (`/api/v1/blocks`, `/api/v1/transactions`, `/api/v1/addresses`, `/api/v1/tokens`, `/api/v1/contracts`) to crawler throttling.
- `2740d2a` — `fix(explorer): make homepage tx count cheap`
  - Changes homepage 24H tx count from `COUNT(*)` on the huge `transactions` table to `SUM(blocks.tx_count)` over the last 24h of indexed blocks.
- `e3fb5c0` — `fix(explorer): use chain currency in tx summary`
  - `decodeTx()` no longer hardcodes `BNB` in simple native-transfer summaries.
  - Tx page passes `chainConfig.currency`, so EthScan banners use `ETH` and BNBScan banners use `BNB`.

**Deploys / verification:**
- BNB web deploy for `2740d2a`: `dep-d826a568bjmc73berf70`, live at 2026-05-13 11:51 UTC.
- EthScan web deploy for `e3fb5c0`: `dep-d826km6k1jcs73d89nag`, live at 2026-05-13 12:13 UTC.
- BNB web also reported a live deploy for `e3fb5c0`: `dep-d826km6k1jcs73d89n20`.
- Verified `meta-webindexer` on `https://bnbscan.com/tx/0x000...000` returns `429` with `X-Throttle-Reason: aggressive-crawler`.
- Verified `https://bnbscan.com/api/health` returned `latestBlock: 98040337` after deploy.
- Verified bnbscan.com homepage rendered block/tx rows and `24H Transactions: 14,634,061`.
- Verified the user-reported EthScan URL now shows `Sent 0.0097 ETH to 0xa27cef8af2…` and no longer contains `Sent 0.0097 BNB`.
- 2026-05-14 refresh: `https://bnbscan.com/api/health` returned `latestBlock: 98137522`, `lagSeconds: 2`; `https://ethscan.io/api/health` returned `latestBlock: 25089585`, `lagSeconds: 14`.

### This session (2026-05-14) — worktree housekeeping

- Local `main` was three commits behind `origin/main`; the dirty `apps/explorer/app/page.tsx` and `apps/explorer/middleware.ts` edits were exact matches for already-shipped commits `2740d2a` and `9ddf1dd`.
- Added `HANDOFFS.md` as the archive for older session history, keeping `CLAUDE.md` focused on current state.
- Ignored recurring local artifacts: `.claude/scheduled_tasks.lock` and `*.bak`.
- Removed stale scratch files from the worktree before pushing: `AGENTS.md`, `CLAUDE.md.bak`, and `.claude/scheduled_tasks.lock`.

### Next session — what to check first

1. **Confirm crawler pressure remains controlled.** Pull recent BNB web logs filtered for `meta-webindexer`; expected: heavy paths should be fast `429`s, not 25–50s `200`s.
2. **Watch BNB lag and health if symptoms recur.** Lag recovered to 2s on the 2026-05-14 refresh, so the next check is only needed if pages slow down or users report stale data again.
3. **If BNB web slows again:** expand the crawler UA list or move more DB-heavy routes behind middleware throttling. The middleware currently protects route prefixes, not all possible query-heavy pages.
4. **Local checkout hygiene:** keep `CLAUDE.md` current and move older session detail into `HANDOFFS.md` instead of letting the active handoff grow without bound.

---


> Older session history archived in [HANDOFFS.md](./HANDOFFS.md). Replace the `### This session` block each session — move the previous one to HANDOFFS.md.

---

### QA findings (low severity, deferred)
- **DEX "Unique Traders" shows 1 when 0 trades** — `GREATEST(1, ...)` in `apps/explorer/app/dex/page.tsx:47`. Cosmetic.
- **ISR cold cache skeleton flash** — First visitor after cache expiry sees loading.tsx for 3-5s. Expected Next.js behavior.

### Remaining known issues
- **holder_count eventually consistent**: Updated every 5 min via `recomputeHolderCounts` instead of per-block. Token pages may show slightly stale counts during that window — acceptable tradeoff for ~6x ETH throughput gain.
- **BNB indexer env vars (verified during April incidents; re-check before relying on these):** `INDEX_CONCURRENCY=8`, `DB_POOL_SIZE` has drifted between 3 and 12 during incident response, `RETENTION_DAYS` was tightened under disk pressure, and `DB_DISK_GB=100`.
- **ETH indexer env vars (verified 2026-04-19 during disk incident; re-check before relying on these):** `RETENTION_DAYS=4`, `DB_DISK_GB=30`, `INDEX_CONCURRENCY=8`, `DB_POOL_SIZE=3`, `ETH_RPC_URL=https://ethereum-rpc.publicnode.com`, `START_BLOCK=24710000`, `NODE_OPTIONS=--max-old-space-size=1280`, `CHAIN=eth`.
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
- Steady-state estimates are incident-sensitive: BNB has seen ~15GB/day during high-volume periods, and ETH hit the 30GB ceiling at 7d retention, so re-check live Render/Postgres metrics before changing retention.
- `DB_DISK_GB` env var on each indexer drives the 70%-warn log — BNB=100, ETH=30.

### Render service IDs
- All Render service IDs, DB IDs, and owner ID are in the Render dashboard — do NOT hardcode them in the repo.
- Render API key: `.render-api-key` (gitignored)
- Build logs: `GET /v1/logs?ownerId=<OWNER_ID>&resource=<serviceId>&type=build&limit=100&direction=backward`

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- Render deploys; see "Current DB specs" above before changing plans or disk sizes.
- Data retention is chain-specific and has changed during incidents. Each run logs table sizes + disk-% via `DB_DISK_GB` env var (warns at 70%).
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
