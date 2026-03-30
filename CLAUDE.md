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

**Last updated:** 2026-03-30
**Branch:** `main`
**Version:** 0.1.1.0
**Status:** Render deploy fix in progress — builds were failing, root cause found and pushed

### What just shipped (this session)
- **QA fixes** — reltuples -1 clamp (7 locations), address First Seen fallback, TxTable Pending badge removed
- **Token page ERC labels** — `apps/explorer/app/token/page.tsx` now shows ERC-20/721/1155 when `CHAIN=eth`
- **Build fix 1** — `min` import missing in `apps/explorer/app/address/[address]/page.tsx` (commit `98a98b6`)
- **Build fix 2** — Deleted 22 accidental Finder "copy 2" duplicate files from packages/ and infra/ that were committed to git and breaking Render TypeScript builds (commit `4b3ff98`)

### Deploy status
- Last push: `4b3ff98` — should trigger auto-deploy on Render for both `ethscan-web` and `bnbscan-web`
- **FIRST TASK in new session**: Check if deploy succeeded. Run:
  ```bash
  RENDER_API_KEY=$(grep -o 'rnd_[^[:space:]]*' .render-api-key)
  curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/srv-d70kbdqa214c73ebrtqg/deploys?limit=3" | python3 -c "
  import sys, json; data = json.load(sys.stdin)
  for item in data:
    d = item.get('deploy', item)
    print(d.get('status'), d.get('commit',{}).get('id','')[:12], d.get('createdAt',''))
  "
  ```
- If still `build_failed`, check the build logs via Render dashboard or trigger another deploy
- Verify live: `https://ethscan.io/token` should show **ERC-20 Tokens** (not BEP-20)

### Render service IDs
- `ethscan-web`: `srv-d70kbdqa214c73ebrtqg` — rootDir: `apps/explorer`, CHAIN=eth
- `bnbscan-web`: `srv-d70kbmia214c73ebs3ag` — rootDir: `apps/explorer`, CHAIN=bnb
- `bnbscan-indexer`: `srv-d70kbmia214c73ebs3a0`
- `eth-indexer`: `srv-d70kbdqa214c73ebrtq0`
- Render API key: `.render-api-key` (gitignored)

### Session tips
- `pnpm install && pnpm dev` to start all apps
- Schema: `packages/db/schema.ts`
- Render deploys; Postgres 25GB limit is a constraint

## Run Commands

```bash
pnpm install
pnpm dev          # starts all apps via turbo
pnpm test         # runs vitest
```
