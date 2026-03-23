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

## Security

### API key ownership verification via wallet signature
**Priority:** P3
**Why:** Currently anyone can call `POST /api/v1/keys` with any `ownerAddress` and get a key "linked" to that address. There's no proof the caller controls the wallet.
**Current state:** Keys are created and enforced via `X-API-Key` header, but ownership is just a metadata field.
**Fix:** Require a wallet signature when creating keys — user signs a message `BNBScan API Key Request: <timestamp>` with their private key, and the server verifies it via `ethers.verifyMessage()`. This is wallet-connect UX on the developer page.
**Pros:** Real ownership proof; prevents griefing (claiming someone else's address).
**Cons:** Requires wallet connection UI (MetaMask etc.) on the developer page; adds friction.
**Depends on:** Developer page UX update.

## Completed
