# BNBScan Block Explorer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-featured BNB Chain block explorer (BscScan parity) deployed at bnbscan.com on Render with a Next.js frontend, Node.js indexer worker, and PostgreSQL database.

**Architecture:** Hybrid data model — a persistent indexer worker polls BNB Chain RPC every 3 seconds for new blocks and writes decoded data (blocks, transactions, token transfers, DEX trades, logs, validators) into PostgreSQL; the Next.js frontend reads from Postgres for indexed data and falls back to RPC for real-time lookups. Contract verification uses both a custom Solidity compiler integration and Sourcify as a fallback.

**Tech Stack:** TypeScript, Next.js 14 (App Router), Tailwind CSS, PostgreSQL (Render managed), ethers.js v6, Drizzle ORM, BullMQ + Redis (job queues), Render (web service + worker + Postgres), Cloudflare (DNS + CDN for bnbscan.com)

---

## Project Layout

```
bnbscan/
├── apps/
│   ├── web/                          # Next.js 14 App Router frontend + API
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (header, footer, theme)
│   │   │   ├── page.tsx              # Home — stats + latest blocks + txs
│   │   │   ├── blocks/
│   │   │   │   ├── page.tsx          # Block list (paginated)
│   │   │   │   └── [number]/page.tsx # Block detail
│   │   │   ├── tx/
│   │   │   │   └── [hash]/page.tsx   # Transaction detail
│   │   │   ├── address/
│   │   │   │   └── [address]/page.tsx # Address + contract detail
│   │   │   ├── token/
│   │   │   │   ├── page.tsx          # BEP-20 token list
│   │   │   │   └── [address]/page.tsx # Token detail + holders
│   │   │   ├── nft/
│   │   │   │   └── [address]/page.tsx # NFT collection (BEP-721/1155)
│   │   │   ├── dex/
│   │   │   │   └── page.tsx          # DEX trade feed
│   │   │   ├── gas/
│   │   │   │   └── page.tsx          # Gas tracker
│   │   │   ├── validators/
│   │   │   │   └── page.tsx          # Validator list + stats
│   │   │   ├── verify/
│   │   │   │   └── page.tsx          # Contract verification form
│   │   │   └── api/
│   │   │       └── v1/               # Public developer API
│   │   │           ├── blocks/route.ts
│   │   │           ├── blocks/[number]/route.ts
│   │   │           ├── transactions/route.ts
│   │   │           ├── transactions/[hash]/route.ts
│   │   │           ├── addresses/[address]/route.ts
│   │   │           ├── tokens/route.ts
│   │   │           ├── tokens/[address]/route.ts
│   │   │           ├── dex/route.ts
│   │   │           └── stats/route.ts
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx        # Nav + search bar
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── SearchBar.tsx     # Universal search (block/tx/address/token)
│   │   │   ├── ui/
│   │   │   │   ├── Table.tsx         # Reusable sortable table
│   │   │   │   ├── Pagination.tsx
│   │   │   │   ├── Badge.tsx         # Status badges (success/fail/pending)
│   │   │   │   ├── CopyButton.tsx    # Copy-to-clipboard
│   │   │   │   ├── AddressLink.tsx   # Truncated address with label + link
│   │   │   │   ├── TxHashLink.tsx
│   │   │   │   ├── TimeAgo.tsx       # Relative timestamps
│   │   │   │   ├── GasBar.tsx        # Gas used/limit progress bar
│   │   │   │   └── Skeleton.tsx      # Loading skeletons
│   │   │   ├── blocks/
│   │   │   │   ├── BlockTable.tsx
│   │   │   │   └── BlockDetail.tsx
│   │   │   ├── transactions/
│   │   │   │   ├── TxTable.tsx
│   │   │   │   └── TxDetail.tsx
│   │   │   ├── address/
│   │   │   │   ├── AddressOverview.tsx
│   │   │   │   ├── AddressTxTable.tsx
│   │   │   │   └── ContractTab.tsx   # ABI viewer + source code + interact
│   │   │   ├── tokens/
│   │   │   │   ├── TokenTable.tsx
│   │   │   │   ├── TokenDetail.tsx
│   │   │   │   └── HolderTable.tsx
│   │   │   ├── dex/
│   │   │   │   └── TradeTable.tsx
│   │   │   ├── gas/
│   │   │   │   └── GasTracker.tsx
│   │   │   └── validators/
│   │   │       └── ValidatorTable.tsx
│   │   └── lib/
│   │       ├── db.ts                 # Drizzle client (web)
│   │       ├── rpc.ts                # ethers JsonRpcProvider (fallback)
│   │       ├── search.ts             # Search router logic
│   │       ├── format.ts             # BNB/gwei/hex formatters
│   │       └── api-rate-limit.ts     # Simple API key rate limiter
│   └── indexer/
│       ├── src/
│       │   ├── index.ts              # Entry — starts all workers
│       │   ├── block-indexer.ts      # Main loop: poll latest block, queue jobs
│       │   ├── block-processor.ts    # Write block + txs to DB
│       │   ├── log-processor.ts      # Decode event logs from receipts
│       │   ├── token-decoder.ts      # BEP-20/721/1155 transfer decoding
│       │   ├── dex-decoder.ts        # PancakeSwap/Biswap Swap event decoding
│       │   ├── contract-detector.ts  # Detect + store new contracts
│       │   ├── contract-verifier.ts  # Solidity compile + verify + Sourcify
│       │   ├── validator-syncer.ts   # Fetch validator set from staking contract
│       │   ├── backfill.ts           # Historical block backfill CLI
│       │   └── queue.ts              # BullMQ queues + Redis config
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── db/
│   │   ├── schema.ts                 # Drizzle table definitions (source of truth)
│   │   ├── client.ts                 # Shared Drizzle client factory
│   │   └── migrations/               # Drizzle Kit auto-generated SQL migrations
│   └── types/
│       └── index.ts                  # Shared TypeScript interfaces
├── render.yaml                        # Render services config (web + worker + db)
├── package.json                       # Root (pnpm workspaces)
├── pnpm-workspace.yaml
└── turbo.json                         # Turborepo build pipeline
```

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `apps/web/package.json`
- Create: `apps/indexer/package.json`
- Create: `packages/db/package.json`
- Create: `packages/types/package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Init git + root package.json**

```bash
cd bnbscan
git init
cat > package.json << 'EOF'
{
  "name": "bnbscan",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
EOF
```

- [ ] **Step 2: Create pnpm workspace + turbo config**

```bash
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {}
  }
}
EOF
```

- [ ] **Step 3: Create .env.example**

```bash
cat > .env.example << 'EOF'
# BNB Chain RPC (use Ankr free tier or your own node)
BNB_RPC_URL=https://bsc-dataseed1.binance.org/
BNB_WS_URL=wss://bsc-ws-node.nariox.org:443

# Database (Render managed Postgres)
DATABASE_URL=postgresql://user:pass@host:5432/bnbscan

# Redis (Render managed Redis or Upstash free tier)
REDIS_URL=redis://localhost:6379

# Contract verification
SOURCIFY_API=https://sourcify.dev/server

# API rate limiting
API_SECRET=changeme
EOF
```

- [ ] **Step 4: Create .gitignore**

```bash
cat > .gitignore << 'EOF'
node_modules/
.next/
dist/
.env
*.env.local
.turbo/
EOF
```

- [ ] **Step 5: Commit scaffold**

```bash
git add .
git commit -m "chore: init monorepo scaffold"
```

---

## Task 2: Shared Types Package

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/index.ts`
- Create: `packages/types/tsconfig.json`

- [ ] **Step 1: Write types package**

```bash
cat > packages/types/package.json << 'EOF'
{
  "name": "@bnbscan/types",
  "version": "0.0.1",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": { "default": "./index.ts" }
  }
}
EOF

cat > packages/types/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["index.ts"]
}
EOF
```

- [ ] **Step 2: Write shared TypeScript interfaces**

Create `packages/types/index.ts`:

```typescript
export interface Block {
  number: number
  hash: string
  parentHash: string
  timestamp: Date
  miner: string
  gasUsed: bigint
  gasLimit: bigint
  baseFeePerGas: bigint | null
  txCount: number
  size: number
}

export interface Transaction {
  hash: string
  blockNumber: number
  fromAddress: string
  toAddress: string | null
  value: bigint
  gas: bigint
  gasPrice: bigint
  gasUsed: bigint
  input: string
  status: boolean
  methodId: string | null
  txIndex: number
  timestamp: Date
}

export interface TokenTransfer {
  id?: number
  txHash: string
  logIndex: number
  tokenAddress: string
  fromAddress: string
  toAddress: string
  value: bigint
  tokenId: bigint | null  // NFT only
  blockNumber: number
  timestamp: Date
}

export interface Token {
  address: string
  name: string
  symbol: string
  decimals: number
  type: 'BEP20' | 'BEP721' | 'BEP1155'
  totalSupply: bigint
  holderCount: number
  logoUrl: string | null
}

export interface DexTrade {
  id?: number
  txHash: string
  dex: string
  pairAddress: string
  tokenIn: string
  tokenOut: string
  amountIn: bigint
  amountOut: bigint
  maker: string
  blockNumber: number
  timestamp: Date
}

export interface Validator {
  address: string
  moniker: string
  votingPower: bigint
  commission: number
  uptime: number
  status: 'active' | 'inactive' | 'jailed'
  updatedAt: Date
}

export interface Contract {
  address: string
  bytecode: string
  abi: object[] | null
  sourceCode: string | null
  compilerVersion: string | null
  verifiedAt: Date | null
  verifySource: 'own' | 'sourcify' | null
  license: string | null
}

export interface GasStats {
  slow: bigint
  standard: bigint
  fast: bigint
  baseFee: bigint
  blockNumber: number
  timestamp: Date
}

export interface ChainStats {
  latestBlock: number
  tps: number
  avgBlockTime: number
  totalTransactions: number
  bnbPrice: number
  marketCap: number
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/types/
git commit -m "feat: add shared types package"
```

---

## Task 3: Database Schema + Migrations

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/schema.ts`
- Create: `packages/db/client.ts`
- Create: `packages/db/drizzle.config.ts`

- [ ] **Step 1: Init db package**

```bash
cat > packages/db/package.json << 'EOF'
{
  "name": "@bnbscan/db",
  "version": "0.0.1",
  "main": "./client.ts",
  "exports": {
    ".": { "default": "./client.ts" }
  },
  "scripts": {
    "migrate": "drizzle-kit migrate",
    "generate": "drizzle-kit generate"
  },
  "dependencies": {
    "drizzle-orm": "^0.31.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.22.0"
  }
}
EOF

cat > packages/db/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["schema.ts", "client.ts", "drizzle.config.ts"]
}
EOF
```

> **Note:** Using drizzle-orm `^0.31.0` and drizzle-kit `^0.22.0` — this enables `db.$count()` support and the modern `drizzle.config.ts` syntax. Older versions had API differences.

- [ ] **Step 2: Write Drizzle schema (`packages/db/schema.ts`)**

```typescript
import { pgTable, bigint, varchar, boolean, timestamp, integer, numeric, text, pgEnum, serial, jsonb, index } from 'drizzle-orm/pg-core'

export const tokenTypeEnum = pgEnum('token_type', ['BEP20', 'BEP721', 'BEP1155'])
export const validatorStatusEnum = pgEnum('validator_status', ['active', 'inactive', 'jailed'])
export const verifySourceEnum = pgEnum('verify_source', ['own', 'sourcify'])

export const blocks = pgTable('blocks', {
  number:       bigint('number', { mode: 'number' }).primaryKey(),
  hash:         varchar('hash', { length: 66 }).notNull().unique(),
  parentHash:   varchar('parent_hash', { length: 66 }).notNull(),
  timestamp:    timestamp('timestamp', { withTimezone: true }).notNull(),
  miner:        varchar('miner', { length: 42 }).notNull(),
  gasUsed:      bigint('gas_used', { mode: 'bigint' }).notNull(),
  gasLimit:     bigint('gas_limit', { mode: 'bigint' }).notNull(),
  baseFeePerGas: numeric('base_fee_per_gas', { precision: 36, scale: 0 }),
  txCount:      integer('tx_count').notNull().default(0),
  size:         integer('size').notNull().default(0),
}, (t) => ({
  minerIdx: index('blocks_miner_idx').on(t.miner),
  timestampIdx: index('blocks_timestamp_idx').on(t.timestamp),
}))

export const transactions = pgTable('transactions', {
  hash:         varchar('hash', { length: 66 }).primaryKey(),
  blockNumber:  bigint('block_number', { mode: 'number' }).notNull().references(() => blocks.number),
  fromAddress:  varchar('from_address', { length: 42 }).notNull(),
  toAddress:    varchar('to_address', { length: 42 }),
  value:        numeric('value', { precision: 36, scale: 18 }).notNull().default('0'),
  gas:          bigint('gas', { mode: 'bigint' }).notNull(),
  gasPrice:     numeric('gas_price', { precision: 36, scale: 0 }).notNull(),
  gasUsed:      bigint('gas_used', { mode: 'bigint' }).notNull().default(0n),
  input:        text('input').notNull().default('0x'),
  status:       boolean('status').notNull().default(true),
  methodId:     varchar('method_id', { length: 10 }),
  txIndex:      integer('tx_index').notNull(),
  timestamp:    timestamp('timestamp', { withTimezone: true }).notNull(),
}, (t) => ({
  fromIdx:      index('tx_from_idx').on(t.fromAddress),
  toIdx:        index('tx_to_idx').on(t.toAddress),
  blockIdx:     index('tx_block_idx').on(t.blockNumber),
  timestampIdx: index('tx_timestamp_idx').on(t.timestamp),
}))

export const addresses = pgTable('addresses', {
  address:      varchar('address', { length: 42 }).primaryKey(),
  balance:      numeric('balance', { precision: 36, scale: 18 }).notNull().default('0'),
  txCount:      integer('tx_count').notNull().default(0),
  isContract:   boolean('is_contract').notNull().default(false),
  label:        varchar('label', { length: 255 }),
  firstSeen:    timestamp('first_seen', { withTimezone: true }),
  lastSeen:     timestamp('last_seen', { withTimezone: true }),
})

export const tokenTransfers = pgTable('token_transfers', {
  id:           serial('id').primaryKey(),
  txHash:       varchar('tx_hash', { length: 66 }).notNull(),
  logIndex:     integer('log_index').notNull(),
  tokenAddress: varchar('token_address', { length: 42 }).notNull(),
  fromAddress:  varchar('from_address', { length: 42 }).notNull(),
  toAddress:    varchar('to_address', { length: 42 }).notNull(),
  value:        numeric('value', { precision: 78, scale: 0 }).notNull().default('0'),
  tokenId:      numeric('token_id', { precision: 78, scale: 0 }),
  blockNumber:  bigint('block_number', { mode: 'number' }).notNull(),
  timestamp:    timestamp('timestamp', { withTimezone: true }).notNull(),
}, (t) => ({
  tokenIdx:     index('tt_token_idx').on(t.tokenAddress),
  fromIdx:      index('tt_from_idx').on(t.fromAddress),
  toIdx:        index('tt_to_idx').on(t.toAddress),
  txIdx:        index('tt_tx_idx').on(t.txHash),
  blockIdx:     index('tt_block_idx').on(t.blockNumber),
}))

export const tokens = pgTable('tokens', {
  address:      varchar('address', { length: 42 }).primaryKey(),
  name:         varchar('name', { length: 255 }).notNull(),
  symbol:       varchar('symbol', { length: 50 }).notNull(),
  decimals:     integer('decimals').notNull().default(18),
  type:         tokenTypeEnum('type').notNull().default('BEP20'),
  totalSupply:  numeric('total_supply', { precision: 78, scale: 0 }).notNull().default('0'),
  holderCount:  integer('holder_count').notNull().default(0),
  logoUrl:      text('logo_url'),
})

export const logs = pgTable('logs', {
  id:           serial('id').primaryKey(),
  txHash:       varchar('tx_hash', { length: 66 }).notNull(),
  logIndex:     integer('log_index').notNull(),
  address:      varchar('address', { length: 42 }).notNull(),
  topic0:       varchar('topic0', { length: 66 }),
  topic1:       varchar('topic1', { length: 66 }),
  topic2:       varchar('topic2', { length: 66 }),
  topic3:       varchar('topic3', { length: 66 }),
  data:         text('data').notNull().default('0x'),
  blockNumber:  bigint('block_number', { mode: 'number' }).notNull(),
}, (t) => ({
  addressTopic0Idx: index('logs_address_topic0_idx').on(t.address, t.topic0),
  txIdx:            index('logs_tx_idx').on(t.txHash),
}))

export const contracts = pgTable('contracts', {
  address:        varchar('address', { length: 42 }).primaryKey(),
  bytecode:       text('bytecode').notNull(),
  abi:            jsonb('abi'),
  sourceCode:     text('source_code'),
  compilerVersion: varchar('compiler_version', { length: 50 }),
  verifiedAt:     timestamp('verified_at', { withTimezone: true }),
  verifySource:   verifySourceEnum('verify_source'),
  license:        varchar('license', { length: 100 }),
})

export const dexTrades = pgTable('dex_trades', {
  id:           serial('id').primaryKey(),
  txHash:       varchar('tx_hash', { length: 66 }).notNull(),
  dex:          varchar('dex', { length: 50 }).notNull(),
  pairAddress:  varchar('pair_address', { length: 42 }).notNull(),
  tokenIn:      varchar('token_in', { length: 42 }).notNull(),
  tokenOut:     varchar('token_out', { length: 42 }).notNull(),
  amountIn:     numeric('amount_in', { precision: 78, scale: 0 }).notNull(),
  amountOut:    numeric('amount_out', { precision: 78, scale: 0 }).notNull(),
  maker:        varchar('maker', { length: 42 }).notNull(),
  blockNumber:  bigint('block_number', { mode: 'number' }).notNull(),
  timestamp:    timestamp('timestamp', { withTimezone: true }).notNull(),
}, (t) => ({
  makerIdx:     index('dex_maker_idx').on(t.maker),
  pairIdx:      index('dex_pair_idx').on(t.pairAddress),
  blockIdx:     index('dex_block_idx').on(t.blockNumber),
}))

export const validators = pgTable('validators', {
  address:      varchar('address', { length: 42 }).primaryKey(),
  moniker:      varchar('moniker', { length: 255 }).notNull(),
  votingPower:  numeric('voting_power', { precision: 36, scale: 0 }).notNull().default('0'),
  commission:   numeric('commission', { precision: 5, scale: 4 }).notNull().default('0'),
  uptime:       numeric('uptime', { precision: 5, scale: 4 }).notNull().default('0'),
  status:       validatorStatusEnum('status').notNull().default('active'),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const gasHistory = pgTable('gas_history', {
  id:           serial('id').primaryKey(),
  slow:         numeric('slow', { precision: 36, scale: 0 }).notNull(),
  standard:     numeric('standard', { precision: 36, scale: 0 }).notNull(),
  fast:         numeric('fast', { precision: 36, scale: 0 }).notNull(),
  baseFee:      numeric('base_fee', { precision: 36, scale: 0 }).notNull(),
  blockNumber:  bigint('block_number', { mode: 'number' }).notNull(),
  timestamp:    timestamp('timestamp', { withTimezone: true }).notNull(),
})
```

- [ ] **Step 3: Write db client (`packages/db/client.ts`)**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null

export function getDb(connectionString?: string) {
  if (_db) return _db
  const url = connectionString ?? process.env.DATABASE_URL!
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = postgres(url, { max: 10 })
  _db = drizzle(sql, { schema })
  return _db
}

export { schema }
export type Db = ReturnType<typeof getDb>
```

- [ ] **Step 4: Write drizzle config**

```typescript
// packages/db/drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './schema.ts',
  out: './migrations',
  driver: 'pg',
  dbCredentials: { connectionString: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 5: Install deps + generate migration**

```bash
cd bnbscan
pnpm install
cd packages/db
DATABASE_URL=postgresql://localhost/bnbscan pnpm generate
```

- [ ] **Step 6: Commit schema**

```bash
git add packages/db/
git commit -m "feat: add Drizzle schema with all 10 tables + indexes"
```

---

## Task 4: Indexer — Core Block + Transaction Processor

**Files:**
- Create: `apps/indexer/package.json`
- Create: `apps/indexer/tsconfig.json`
- Create: `apps/indexer/src/queue.ts`
- Create: `apps/indexer/src/block-indexer.ts`
- Create: `apps/indexer/src/block-processor.ts`
- Create: `apps/indexer/src/index.ts`

- [ ] **Step 1: Init indexer package**

```bash
cat > apps/indexer/package.json << 'EOF'
{
  "name": "@bnbscan/indexer",
  "version": "0.0.1",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "backfill": "tsx src/backfill.ts"
  },
  "dependencies": {
    "@bnbscan/db": "workspace:*",
    "@bnbscan/types": "workspace:*",
    "ethers": "^6.11.0",
    "bullmq": "^5.4.0",
    "ioredis": "^5.3.0",
    "dotenv": "^16.4.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
EOF

cat > apps/indexer/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": {
      "@bnbscan/db": ["../../packages/db/client.ts"],
      "@bnbscan/types": ["../../packages/types/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

- [ ] **Step 2: Write queue setup (`apps/indexer/src/queue.ts`)**

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const QUEUES = {
  BLOCKS: 'blocks',
  LOGS: 'logs',
  VALIDATORS: 'validators',
} as const

export const blockQueue = new Queue(QUEUES.BLOCKS, { connection })
export const logQueue = new Queue(QUEUES.LOGS, { connection })
export const validatorQueue = new Queue(QUEUES.VALIDATORS, { connection })

export { Worker }
```

- [ ] **Step 3: Write block indexer (`apps/indexer/src/block-indexer.ts`)**

This is the main polling loop — runs every 3 seconds, detects new blocks, enqueues them.

```typescript
import { JsonRpcProvider } from 'ethers'
import { blockQueue } from './queue'
import { getDb, schema } from '@bnbscan/db'
import { desc } from 'drizzle-orm'

const POLL_INTERVAL_MS = 3000
const RPC_URL = process.env.BNB_RPC_URL ?? 'https://bsc-dataseed1.binance.org/'

export async function startBlockIndexer() {
  const provider = new JsonRpcProvider(RPC_URL)
  const db = getDb()
  console.log('[block-indexer] Starting polling loop...')

  let lastIndexed = await getLastIndexedBlock(db)
  console.log(`[block-indexer] Resuming from block ${lastIndexed}`)

  while (true) {
    try {
      const latestBlock = await provider.getBlockNumber()

      if (latestBlock > lastIndexed) {
        for (let n = lastIndexed + 1; n <= latestBlock; n++) {
          await blockQueue.add('process-block', { blockNumber: n }, {
            jobId: `block-${n}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          })
        }
        console.log(`[block-indexer] Queued blocks ${lastIndexed + 1}–${latestBlock}`)
        lastIndexed = latestBlock
      }
    } catch (err) {
      console.error('[block-indexer] Poll error:', err)
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

async function getLastIndexedBlock(db: ReturnType<typeof getDb>): Promise<number> {
  const result = await db
    .select({ number: schema.blocks.number })
    .from(schema.blocks)
    .orderBy(desc(schema.blocks.number))
    .limit(1)
  return result[0]?.number ?? Number(process.env.START_BLOCK ?? '38000000')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

- [ ] **Step 4: Write block processor (`apps/indexer/src/block-processor.ts`)**

```typescript
import { JsonRpcProvider, formatUnits, formatEther } from 'ethers'
import { getDb, schema } from '@bnbscan/db'
import { logQueue } from './queue'

const provider = new JsonRpcProvider(process.env.BNB_RPC_URL ?? 'https://bsc-dataseed1.binance.org/')

export async function processBlock(blockNumber: number) {
  const db = getDb()
  const block = await provider.getBlock(blockNumber, true)  // true = include txs
  if (!block) throw new Error(`Block ${blockNumber} not found`)

  const timestamp = new Date(Number(block.timestamp) * 1000)

  // Insert block
  await db.insert(schema.blocks).values({
    number: block.number,
    hash: block.hash!,
    parentHash: block.parentHash,
    timestamp,
    miner: block.miner.toLowerCase(),
    gasUsed: block.gasUsed,
    gasLimit: block.gasLimit,
    baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
    txCount: block.transactions.length,
    size: 0,  // not available via ethers, set 0
  }).onConflictDoNothing()

  // Insert transactions
  const txValues = block.prefetchedTransactions.map((tx, idx) => ({
    hash: tx.hash,
    blockNumber: block.number,
    fromAddress: tx.from.toLowerCase(),
    toAddress: tx.to?.toLowerCase() ?? null,
    value: tx.value.toString(),  // store raw wei as string — NOT formatEther()
    gas: tx.gasLimit,
    gasPrice: tx.gasPrice?.toString() ?? '0',
    gasUsed: 0n,  // filled later from receipt
    input: tx.data,
    status: true,  // updated from receipt
    methodId: tx.data.length >= 10 ? tx.data.slice(0, 10) : null,
    txIndex: idx,
    timestamp,
  }))

  if (txValues.length > 0) {
    await db.insert(schema.transactions).values(txValues).onConflictDoNothing()
  }

  // Queue log processing for each tx
  for (const tx of block.prefetchedTransactions) {
    await logQueue.add('process-logs', {
      txHash: tx.hash,
      blockNumber: block.number,
      timestamp: timestamp.toISOString(),
    }, {
      jobId: `logs-${tx.hash}`,
      attempts: 3,
    })
  }

  console.log(`[block-processor] Block ${block.number} — ${block.prefetchedTransactions.length} txs`)
}
```

- [ ] **Step 5: Write entry point (`apps/indexer/src/index.ts`)**

```typescript
import 'dotenv/config'
import { startBlockIndexer } from './block-indexer'
import { Worker, connection } from './queue'  // static import — no dynamic import()
import { processBlock } from './block-processor'
import { processLogs } from './log-processor'
import { syncValidators } from './validator-syncer'

async function main() {
  console.log('[indexer] Starting BNBScan indexer...')

  // Block processor worker
  new Worker('blocks', async (job) => {
    await processBlock(job.data.blockNumber)
  }, { connection, concurrency: 5 })

  // Log processor worker
  new Worker('logs', async (job) => {
    await processLogs(job.data.txHash, job.data.blockNumber, new Date(job.data.timestamp))
  }, { connection, concurrency: 10 })

  // Sync validators every 10 minutes
  setInterval(() => syncValidators(), 10 * 60 * 1000)
  await syncValidators()

  // Start main polling loop
  await startBlockIndexer()
}

main().catch(err => {
  console.error('[indexer] Fatal error:', err)
  process.exit(1)
})
```

- [ ] **Step 6: Commit indexer core**

```bash
git add apps/indexer/
git commit -m "feat: add indexer core — block polling + queue architecture"
```

---

## Task 5: Indexer — Log, Token Transfer + DEX Decoder

**Files:**
- Create: `apps/indexer/src/log-processor.ts`
- Create: `apps/indexer/src/token-decoder.ts`
- Create: `apps/indexer/src/dex-decoder.ts`

- [ ] **Step 1: Write log processor (`apps/indexer/src/log-processor.ts`)**

```typescript
import { JsonRpcProvider, id as keccak256id } from 'ethers'
import { eq } from 'drizzle-orm'  // import directly — never use .where(({eq})=>) callback
import { getDb, schema } from '@bnbscan/db'
import { decodeTokenTransfer } from './token-decoder'
import { decodeDexTrade } from './dex-decoder'

const provider = new JsonRpcProvider(process.env.BNB_RPC_URL!)

// Well-known topic0 signatures
const TRANSFER_TOPIC = keccak256id('Transfer(address,address,uint256)')
const TRANSFER_SINGLE_TOPIC = keccak256id('TransferSingle(address,address,address,uint256,uint256)')
const SWAP_V2_TOPIC = keccak256id('Swap(address,uint256,uint256,uint256,uint256,address)')
const SWAP_V3_TOPIC = keccak256id('Swap(address,address,int256,int256,uint160,uint128,int24)')

export async function processLogs(txHash: string, blockNumber: number, timestamp: Date) {
  const db = getDb()
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) return

  // Update tx status + gasUsed
  await db.update(schema.transactions)
    .set({ status: receipt.status === 1, gasUsed: receipt.gasUsed })
    .where(eq(schema.transactions.hash, txHash))

  // Bulk insert raw logs
  const logValues = receipt.logs.map(log => ({
    txHash,
    logIndex: log.index,
    address: log.address.toLowerCase(),
    topic0: log.topics[0] ?? null,
    topic1: log.topics[1] ?? null,
    topic2: log.topics[2] ?? null,
    topic3: log.topics[3] ?? null,
    data: log.data,
    blockNumber,
  }))

  if (logValues.length > 0) {
    await db.insert(schema.logs).values(logValues).onConflictDoNothing()
  }

  // Decode token transfers + DEX trades
  for (const log of receipt.logs) {
    const topic0 = log.topics[0]
    if (topic0 === TRANSFER_TOPIC && log.topics.length === 3) {
      await decodeTokenTransfer(log, 'BEP20', blockNumber, timestamp, txHash)
    } else if (topic0 === TRANSFER_TOPIC && log.topics.length === 4) {
      await decodeTokenTransfer(log, 'BEP721', blockNumber, timestamp, txHash)
    } else if (topic0 === TRANSFER_SINGLE_TOPIC) {
      await decodeTokenTransfer(log, 'BEP1155', blockNumber, timestamp, txHash)
    } else if (topic0 === SWAP_V2_TOPIC || topic0 === SWAP_V3_TOPIC) {
      await decodeDexTrade(log, txHash, blockNumber, timestamp)
    }
  }
}
```

- [ ] **Step 2: Write token decoder (`apps/indexer/src/token-decoder.ts`)**

```typescript
import { Log, AbiCoder, Contract, JsonRpcProvider } from 'ethers'
import { eq } from 'drizzle-orm'  // always import eq directly — never use .where(({eq}) => ...) callback
import { getDb, schema } from '@bnbscan/db'

const provider = new JsonRpcProvider(process.env.BNB_RPC_URL!)
const abi = AbiCoder.defaultAbiCoder()

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
]

export async function decodeTokenTransfer(
  log: Log,
  type: 'BEP20' | 'BEP721' | 'BEP1155',
  blockNumber: number,
  timestamp: Date,
  txHash: string
) {
  const db = getDb()

  try {
    let from: string, to: string, value: bigint, tokenId: bigint | null = null

    if (type === 'BEP20') {
      from = '0x' + log.topics[1].slice(26)
      to = '0x' + log.topics[2].slice(26)
      value = abi.decode(['uint256'], log.data)[0] as bigint
    } else if (type === 'BEP721') {
      from = '0x' + log.topics[1].slice(26)
      to = '0x' + log.topics[2].slice(26)
      tokenId = BigInt(log.topics[3])
      value = 1n
    } else {
      // BEP1155 TransferSingle
      from = '0x' + log.topics[2].slice(26)
      to = '0x' + log.topics[3].slice(26)
      const decoded = abi.decode(['uint256', 'uint256'], log.data)
      tokenId = decoded[0] as bigint
      value = decoded[1] as bigint
    }

    const tokenAddress = log.address.toLowerCase()

    // Upsert token metadata if not known
    await ensureToken(tokenAddress, type)

    await db.insert(schema.tokenTransfers).values({
      txHash,
      logIndex: log.index,
      tokenAddress,
      fromAddress: from.toLowerCase(),
      toAddress: to.toLowerCase(),
      value: value.toString(),
      tokenId: tokenId?.toString() ?? null,
      blockNumber,
      timestamp,
    }).onConflictDoNothing()

  } catch (err) {
    // Silent — malformed log
  }
}

const tokenCache = new Set<string>()

async function ensureToken(address: string, type: 'BEP20' | 'BEP721' | 'BEP1155') {
  if (tokenCache.has(address)) return
  const db = getDb()

  const existing = await db.select().from(schema.tokens)
    .where(eq(schema.tokens.address, address))  // use imported eq, not callback
    .limit(1)

  if (existing.length > 0) {
    tokenCache.add(address)
    return
  }

  try {
    const contract = new Contract(address, ERC20_ABI, provider)
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name().catch(() => 'Unknown'),
      contract.symbol().catch(() => '???'),
      contract.decimals().catch(() => 18),
      contract.totalSupply().catch(() => 0n),
    ])

    await db.insert(schema.tokens).values({
      address,
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
      type,
      totalSupply: totalSupply.toString(),
      holderCount: 0,
    }).onConflictDoNothing()

    tokenCache.add(address)
  } catch {
    // Skip unknown tokens
  }
}
```

- [ ] **Step 3: Write DEX decoder (`apps/indexer/src/dex-decoder.ts`)**

> **Note:** `tokenIn`/`tokenOut` columns are `varchar(42)` — they must be real EVM addresses. We resolve `token0`/`token1` from the pair contract on first encounter (cached in-memory).

```typescript
import { Log, AbiCoder, Contract, JsonRpcProvider } from 'ethers'
import { getDb, schema } from '@bnbscan/db'

const provider = new JsonRpcProvider(process.env.BNB_RPC_URL!)
const abi = AbiCoder.defaultAbiCoder()

// Cache pair → [token0, token1] to avoid repeated RPC calls
const pairCache = new Map<string, [string, string]>()

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

async function getPairTokens(pairAddress: string): Promise<[string, string] | null> {
  if (pairCache.has(pairAddress)) return pairCache.get(pairAddress)!
  try {
    const pair = new Contract(pairAddress, PAIR_ABI, provider)
    const [t0, t1] = await Promise.all([pair.token0(), pair.token1()])
    const tokens: [string, string] = [t0.toLowerCase(), t1.toLowerCase()]
    pairCache.set(pairAddress, tokens)
    return tokens
  } catch {
    return null
  }
}

export async function decodeDexTrade(
  log: Log,
  txHash: string,
  blockNumber: number,
  timestamp: Date
) {
  const db = getDb()

  try {
    const pairAddress = log.address.toLowerCase()

    // V2 Swap: Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
    // topics[0]=event sig, topics[1]=sender, topics[2]=to — data has 4 x uint256
    const isV2 = log.topics.length === 3 && log.data.length >= 130

    if (!isV2) return  // Skip V3 for now (complex tick math)

    const tokens = await getPairTokens(pairAddress)
    if (!tokens) return  // Can't resolve pair tokens — skip

    const [token0, token1] = tokens
    const [a0In, a1In, a0Out, a1Out] = abi.decode(
      ['uint256', 'uint256', 'uint256', 'uint256'], log.data
    ) as bigint[]

    let tokenIn: string, tokenOut: string, amountIn: bigint, amountOut: bigint

    if (a0In > 0n) {
      // token0 → token1
      tokenIn = token0; tokenOut = token1
      amountIn = a0In; amountOut = a1Out
    } else {
      // token1 → token0
      tokenIn = token1; tokenOut = token0
      amountIn = a1In; amountOut = a0Out
    }

    const maker = ('0x' + log.topics[2].slice(26)).toLowerCase()

    await db.insert(schema.dexTrades).values({
      txHash,
      dex: 'PancakeSwap V2',
      pairAddress,
      tokenIn,   // real EVM address (varchar 42 ✓)
      tokenOut,  // real EVM address (varchar 42 ✓)
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      maker,
      blockNumber,
      timestamp,
    })
  } catch {
    // Skip malformed swap events
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/indexer/src/
git commit -m "feat: add log processor, token transfer + DEX trade decoder"
```

---

## Task 6: Indexer — Validator Syncer + Contract Detector

**Files:**
- Create: `apps/indexer/src/validator-syncer.ts`
- Create: `apps/indexer/src/contract-detector.ts`
- Create: `apps/indexer/src/contract-verifier.ts`
- Create: `apps/indexer/src/backfill.ts`

- [ ] **Step 1: Write validator syncer (`apps/indexer/src/validator-syncer.ts`)**

BSC uses a staking system. After BEP-294 (StakeHub, 2023), the staking contract is at `0x2001`.
> ⚠️ **Important:** The exact ABI must be verified against the live contract before deployment. Check https://bscscan.com/address/0x0000000000000000000000000000000000002001#readContract for the current ABI. The fragment below reflects the StakeHub interface at time of writing — verify before use.

```typescript
import { JsonRpcProvider, Contract } from 'ethers'
import { getDb, schema } from '@bnbscan/db'

const provider = new JsonRpcProvider(process.env.BNB_RPC_URL!)

// BSC StakeHub contract (BEP-294, verify ABI at bscscan.com/address/0x2001#readContract)
const STAKING_ADDRESS = '0x0000000000000000000000000000000000002001'
const STAKING_ABI = [
  'function getValidatorElectionInfo(uint256 offset, uint256 limit) view returns (address[] consensusAddrs, uint256[] votingPowers, bytes[] voteAddrs, uint256 totalLength)',
  'function getValidatorBasicInfo(address operatorAddress) view returns (address consensusAddress, address operatorAddress, address creditContract, uint256 createdTime, bool jailed, uint8 incomingFromBreathe)',
]

export async function syncValidators() {
  const db = getDb()

  try {
    const staking = new Contract(STAKING_ADDRESS, STAKING_ABI, provider)
    // Fetch up to 100 validators — BSC has ~40 active validators at any time
    const result = await staking.getValidatorElectionInfo(0, 100)
    const validators: string[] = Array.from(result[0])  // consensusAddrs

    const now = new Date()

    for (const addr of validators) {
      try {
        const info = await staking.getValidatorBasicInfo(addr)

        await db.insert(schema.validators).values({
          address: addr.toLowerCase(),
          moniker: addr.slice(0, 8) + '...' + addr.slice(-4),
          votingPower: 0n.toString(),
          commission: '0.1',
          uptime: '0.99',
          status: info.jailed ? 'jailed' : 'active',
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [schema.validators.address],
          set: { status: info.jailed ? 'jailed' : 'active', updatedAt: now },
        })
      } catch {
        // Individual validator fetch failed — skip
      }
    }

    console.log(`[validator-syncer] Synced ${validators.length} validators`)
  } catch (err) {
    console.error('[validator-syncer] Error syncing validators:', err)
  }
}
```

- [ ] **Step 2: Write contract verifier (`apps/indexer/src/contract-verifier.ts`)**

```typescript
import axios from 'axios'
import { getDb, schema } from '@bnbscan/db'

const SOURCIFY_API = process.env.SOURCIFY_API ?? 'https://sourcify.dev/server'
const BSC_CHAIN_ID = 56

export interface VerifyRequest {
  address: string
  sourceCode: string
  compilerVersion: string
  contractName: string
  constructorArgs?: string
  license?: string
}

export async function verifyContract(req: VerifyRequest): Promise<{ success: boolean; abi?: object[] }> {
  const db = getDb()

  // Try Sourcify first (free, no API key)
  try {
    const sourcifyResult = await checkSourcify(req.address)
    if (sourcifyResult) {
      await db.insert(schema.contracts).values({
        address: req.address.toLowerCase(),
        bytecode: '',
        abi: sourcifyResult.abi,
        sourceCode: sourcifyResult.sourceCode,
        compilerVersion: req.compilerVersion,
        verifiedAt: new Date(),
        verifySource: 'sourcify',
        license: req.license ?? null,
      }).onConflictDoUpdate({
        target: [schema.contracts.address],
        set: {
          abi: sourcifyResult.abi,
          sourceCode: sourcifyResult.sourceCode,
          verifiedAt: new Date(),
          verifySource: 'sourcify',
        }
      })
      return { success: true, abi: sourcifyResult.abi }
    }
  } catch {}

  // Fall back to own Solidity compiler (solc-js)
  // TODO: integrate solc-js compilation in v1.1
  return { success: false }
}

async function checkSourcify(address: string) {
  try {
    const res = await axios.get(
      `${SOURCIFY_API}/files/any/${BSC_CHAIN_ID}/${address}`
    )
    const files = res.data?.files ?? []
    const metaFile = files.find((f: any) => f.name.includes('metadata'))
    if (!metaFile) return null
    const meta = JSON.parse(metaFile.content)
    return {
      abi: meta.output?.abi ?? [],
      sourceCode: files.find((f: any) => f.name.endsWith('.sol'))?.content ?? '',
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Write backfill CLI (`apps/indexer/src/backfill.ts`)**

```typescript
import 'dotenv/config'
import { blockQueue } from './queue'

const START = Number(process.argv[2] ?? '38000000')
const END = Number(process.argv[3] ?? '38001000')
const BATCH = 100

async function backfill() {
  console.log(`[backfill] Queueing blocks ${START}–${END}`)

  for (let n = START; n <= END; n += BATCH) {
    const batchEnd = Math.min(n + BATCH - 1, END)
    const jobs = []
    for (let i = n; i <= batchEnd; i++) {
      jobs.push({ name: 'process-block', data: { blockNumber: i }, opts: { jobId: `block-${i}` } })
    }
    await blockQueue.addBulk(jobs)
    console.log(`[backfill] Queued ${n}–${batchEnd}`)
  }

  console.log('[backfill] Done. Check queue for progress.')
  process.exit(0)
}

backfill()
```

- [ ] **Step 4: Commit**

```bash
git add apps/indexer/src/
git commit -m "feat: add validator syncer, contract verifier, backfill CLI"
```

---

## Task 7: Next.js App — Scaffold + Shared UI

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/components/layout/Header.tsx`
- Create: `apps/web/components/layout/Footer.tsx`
- Create: `apps/web/components/layout/SearchBar.tsx`
- Create: `apps/web/components/ui/` (all shared UI)
- Create: `apps/web/lib/format.ts`
- Create: `apps/web/lib/db.ts`
- Create: `apps/web/lib/rpc.ts`

- [ ] **Step 1: Init Next.js app**

```bash
cd bnbscan
pnpm create next-app apps/web --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

- [ ] **Step 2: Add workspace dependencies to web**

```bash
cd apps/web
pnpm add @bnbscan/db@workspace:* @bnbscan/types@workspace:*
pnpm add ethers@^6.11.0 axios@^1.6.0
```

- [ ] **Step 3: Write lib/format.ts**

```typescript
// apps/web/lib/format.ts
import { formatUnits, formatEther } from 'ethers'

export function formatBNB(wei: bigint | string, decimals = 4): string {
  return Number(formatEther(BigInt(wei))).toFixed(decimals)
}

export function formatGwei(wei: bigint | string): string {
  return Number(formatUnits(BigInt(wei), 'gwei')).toFixed(2)
}

export function formatAddress(addr: string, chars = 6): string {
  return `${addr.slice(0, chars)}...${addr.slice(-4)}`
}

export function formatNumber(n: number | bigint): string {
  return Number(n).toLocaleString('en-US')
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function formatHash(hash: string, chars = 16): string {
  return `${hash.slice(0, chars)}...${hash.slice(-4)}`
}
```

- [ ] **Step 4: Write lib/db.ts (Next.js singleton)**

```typescript
// apps/web/lib/db.ts
import { getDb } from '@bnbscan/db'
export const db = getDb(process.env.DATABASE_URL!)
export { schema } from '@bnbscan/db'
```

- [ ] **Step 5: Write lib/rpc.ts**

```typescript
// apps/web/lib/rpc.ts
import { JsonRpcProvider } from 'ethers'
let _provider: JsonRpcProvider | null = null
export function getProvider() {
  if (!_provider) _provider = new JsonRpcProvider(process.env.BNB_RPC_URL!)
  return _provider
}
```

- [ ] **Step 6: Write root layout (apps/web/app/layout.tsx)**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BNBScan — BNB Chain Block Explorer',
  description: 'The BNB Chain Block Explorer and Analytics Platform',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
```

- [ ] **Step 7: Write Header component**

```tsx
// apps/web/components/layout/Header.tsx
import Link from 'next/link'
import { SearchBar } from './SearchBar'

export function Header() {
  return (
    <header className="bg-yellow-500 text-black shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-xl tracking-tight shrink-0">
          🔍 BNBScan
        </Link>
        <SearchBar />
        <nav className="hidden md:flex gap-6 text-sm font-medium shrink-0">
          <Link href="/blocks">Blocks</Link>
          <Link href="/token">Tokens</Link>
          <Link href="/dex">DEX</Link>
          <Link href="/gas">Gas</Link>
          <Link href="/validators">Validators</Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 8: Write SearchBar component**

```tsx
// apps/web/components/layout/SearchBar.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SearchBar() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (/^0x[0-9a-fA-F]{64}$/.test(q)) router.push(`/tx/${q}`)
    else if (/^0x[0-9a-fA-F]{40}$/.test(q)) router.push(`/address/${q}`)
    else if (/^\d+$/.test(q)) router.push(`/blocks/${q}`)
    else router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <form onSubmit={handleSearch} className="flex-1 max-w-xl">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by address / tx hash / block number"
        className="w-full px-4 py-2 rounded-lg text-sm border border-yellow-600 bg-yellow-400 placeholder-yellow-800 focus:outline-none focus:ring-2 focus:ring-yellow-700"
      />
    </form>
  )
}
```

- [ ] **Step 9: Write shared UI components**

Create `apps/web/components/ui/Badge.tsx`:
```tsx
type Variant = 'success' | 'fail' | 'pending' | 'default'
const VARIANTS: Record<Variant, string> = {
  success: 'bg-green-100 text-green-700',
  fail:    'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  default: 'bg-gray-100 text-gray-700',
}
export function Badge({ variant = 'default', children }: { variant?: Variant, children: React.ReactNode }) {
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${VARIANTS[variant]}`}>{children}</span>
}
```

Create `apps/web/components/ui/CopyButton.tsx`:
```tsx
'use client'
import { useState } from 'react'
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="text-xs text-gray-400 hover:text-gray-600 ml-1">
      {copied ? '✓' : '⎘'}
    </button>
  )
}
```

Create `apps/web/components/ui/Pagination.tsx`:
```tsx
import Link from 'next/link'
export function Pagination({ page, total, perPage, baseUrl }: {
  page: number, total: number, perPage: number, baseUrl: string
}) {
  const totalPages = Math.ceil(total / perPage)
  return (
    <div className="flex gap-2 items-center text-sm">
      {page > 1 && <Link href={`${baseUrl}?page=${page - 1}`} className="px-3 py-1 rounded border hover:bg-gray-100">←</Link>}
      <span className="text-gray-600">Page {page} of {totalPages}</span>
      {page < totalPages && <Link href={`${baseUrl}?page=${page + 1}`} className="px-3 py-1 rounded border hover:bg-gray-100">→</Link>}
    </div>
  )
}
```

- [ ] **Step 10: Commit UI scaffold**

```bash
git add apps/web/
git commit -m "feat: add Next.js app scaffold, layout, shared UI components"
```

---

## Task 8: Home Page + Block List + Block Detail

**Files:**
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/blocks/page.tsx`
- Create: `apps/web/app/blocks/[number]/page.tsx`
- Create: `apps/web/components/blocks/BlockTable.tsx`

- [ ] **Step 1: Write home page (`apps/web/app/page.tsx`)**

```tsx
import { db, schema } from '@/lib/db'
import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { formatBNB, formatNumber, timeAgo } from '@/lib/format'
import { BlockTable } from '@/components/blocks/BlockTable'
import { TxTable } from '@/components/transactions/TxTable'

export const revalidate = 10

export default async function HomePage() {
  const [latestBlocks, latestTxs] = await Promise.all([
    db.select().from(schema.blocks).orderBy(desc(schema.blocks.number)).limit(7),
    db.select().from(schema.transactions).orderBy(desc(schema.transactions.timestamp)).limit(7),
  ])

  const latestBlock = latestBlocks[0]

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Latest Block" value={formatNumber(latestBlock?.number ?? 0)} />
        <StatCard label="Transactions" value="Loading..." />
        <StatCard label="BNB Price" value="Loading..." />
        <StatCard label="Avg Block Time" value="~3s" />
      </div>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <SectionHeader title="Latest Blocks" href="/blocks" />
          <BlockTable blocks={latestBlocks} compact />
        </section>
        <section>
          <SectionHeader title="Latest Transactions" href="/txs" />
          <TxTable txs={latestTxs} compact />
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}

function SectionHeader({ title, href }: { title: string, href: string }) {
  return (
    <div className="flex justify-between items-center mb-3">
      <h2 className="font-semibold text-gray-800">{title}</h2>
      <Link href={href} className="text-sm text-yellow-600 hover:underline">View all →</Link>
    </div>
  )
}
```

- [ ] **Step 2: Write BlockTable component**

```tsx
// apps/web/components/blocks/BlockTable.tsx
import Link from 'next/link'
import { formatNumber, timeAgo } from '@/lib/format'

export function BlockTable({ blocks, compact = false }: {
  blocks: Array<{ number: number, timestamp: Date, miner: string, txCount: number, gasUsed: bigint | null }>
  compact?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Block</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Age</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Txns</th>
            {!compact && <th className="text-left px-4 py-2 font-medium text-gray-500">Miner</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {blocks.map(b => (
            <tr key={b.number} className="hover:bg-gray-50">
              <td className="px-4 py-2">
                <Link href={`/blocks/${b.number}`} className="text-yellow-600 font-medium hover:underline">
                  {formatNumber(b.number)}
                </Link>
              </td>
              <td className="px-4 py-2 text-gray-500">{timeAgo(new Date(b.timestamp))}</td>
              <td className="px-4 py-2">{b.txCount}</td>
              {!compact && (
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                  {b.miner.slice(0, 10)}...
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Write block list page**

```tsx
// apps/web/app/blocks/page.tsx
import { db, schema } from '@/lib/db'
import { desc } from 'drizzle-orm'
import { BlockTable } from '@/components/blocks/BlockTable'
import { Pagination } from '@/components/ui/Pagination'

export const revalidate = 5

const PER_PAGE = 25

export default async function BlocksPage({ searchParams }: { searchParams: { page?: string } }) {
  const page = Number(searchParams.page ?? 1)
  const offset = (page - 1) * PER_PAGE

  const blocks = await db.select().from(schema.blocks)
    .orderBy(desc(schema.blocks.number))
    .limit(PER_PAGE).offset(offset)

  const total = await db.$count(schema.blocks)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Blocks</h1>
      <BlockTable blocks={blocks} />
      <div className="mt-4 flex justify-end">
        <Pagination page={page} total={total} perPage={PER_PAGE} baseUrl="/blocks" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write block detail page**

```tsx
// apps/web/app/blocks/[number]/page.tsx
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { TxTable } from '@/components/transactions/TxTable'
import { formatBNB, formatGwei, formatNumber, timeAgo } from '@/lib/format'
import { CopyButton } from '@/components/ui/CopyButton'

export default async function BlockDetailPage({ params }: { params: { number: string } }) {
  const blockNumber = Number(params.number)
  const [block] = await db.select().from(schema.blocks)
    .where(eq(schema.blocks.number, blockNumber))

  if (!block) notFound()

  const txs = await db.select().from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, blockNumber))
    .limit(50)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Block #{formatNumber(block.number)}</h1>

      <div className="bg-white rounded-xl border shadow-sm mb-8">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <DetailRow label="Block Height" value={formatNumber(block.number)} />
            <DetailRow label="Timestamp" value={`${timeAgo(new Date(block.timestamp))} (${new Date(block.timestamp).toUTCString()})`} />
            <DetailRow label="Transactions" value={`${block.txCount} transactions`} />
            <DetailRow label="Miner" value={block.miner} mono copy />
            <DetailRow label="Block Hash" value={block.hash} mono copy />
            <DetailRow label="Parent Hash" value={block.parentHash} mono copy />
            <DetailRow label="Gas Used" value={`${formatNumber(Number(block.gasUsed))} (${((Number(block.gasUsed) / Number(block.gasLimit)) * 100).toFixed(2)}%)`} />
            <DetailRow label="Gas Limit" value={formatNumber(Number(block.gasLimit))} />
            {block.baseFeePerGas && (
              <DetailRow label="Base Fee" value={`${formatGwei(BigInt(block.baseFeePerGas))} Gwei`} />
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold mb-4">Transactions</h2>
      <TxTable txs={txs} />
    </div>
  )
}

function DetailRow({ label, value, mono = false, copy = false }: {
  label: string, value: string, mono?: boolean, copy?: boolean
}) {
  return (
    <tr>
      <td className="px-6 py-3 text-gray-500 w-40 font-medium">{label}</td>
      <td className={`px-6 py-3 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        {copy && <CopyButton text={value} />}
      </td>
    </tr>
  )
}
```

- [ ] **Step 5: Commit blocks pages**

```bash
git add apps/web/
git commit -m "feat: add home page, block list, block detail pages"
```

---

## Task 9: Transaction + Address Pages

**Files:**
- Create: `apps/web/app/tx/[hash]/page.tsx`
- Create: `apps/web/app/address/[address]/page.tsx`
- Create: `apps/web/components/transactions/TxTable.tsx`
- Create: `apps/web/components/transactions/TxDetail.tsx`

- [ ] **Step 1: Write TxTable component**

```tsx
// apps/web/components/transactions/TxTable.tsx
import Link from 'next/link'
import { formatBNB, formatAddress, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'

export function TxTable({ txs, compact = false }: {
  txs: Array<{ hash: string, fromAddress: string, toAddress: string | null, value: string | null, status: boolean, timestamp: Date }>
  compact?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Tx Hash</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Age</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">From</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">To</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Value</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {txs.map(tx => (
            <tr key={tx.hash} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs">
                <Link href={`/tx/${tx.hash}`} className="text-yellow-600 hover:underline">
                  {formatAddress(tx.hash, 10)}
                </Link>
              </td>
              <td className="px-4 py-2 text-gray-500">{timeAgo(new Date(tx.timestamp))}</td>
              <td className="px-4 py-2 font-mono text-xs">
                <Link href={`/address/${tx.fromAddress}`} className="text-blue-600 hover:underline">
                  {formatAddress(tx.fromAddress)}
                </Link>
              </td>
              <td className="px-4 py-2 font-mono text-xs">
                {tx.toAddress ? (
                  <Link href={`/address/${tx.toAddress}`} className="text-blue-600 hover:underline">
                    {formatAddress(tx.toAddress)}
                  </Link>
                ) : <span className="text-gray-400">Contract Creation</span>}
              </td>
              <td className="px-4 py-2">{formatBNB(BigInt(tx.value ?? '0'))} BNB</td>
              <td className="px-4 py-2">
                <Badge variant={tx.status ? 'success' : 'fail'}>
                  {tx.status ? 'Success' : 'Failed'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Write transaction detail page**

```tsx
// apps/web/app/tx/[hash]/page.tsx
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { formatBNB, formatGwei, formatNumber, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { CopyButton } from '@/components/ui/CopyButton'
import Link from 'next/link'

export default async function TxDetailPage({ params }: { params: { hash: string } }) {
  const [tx] = await db.select().from(schema.transactions)
    .where(eq(schema.transactions.hash, params.hash))

  if (!tx) notFound()

  const txLogs = await db.select().from(schema.logs)
    .where(eq(schema.logs.txHash, params.hash))

  const transfers = await db.select().from(schema.tokenTransfers)
    .where(eq(schema.tokenTransfers.txHash, params.hash))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Transaction Details</h1>
        <Badge variant={tx.status ? 'success' : 'fail'}>{tx.status ? 'Success' : 'Failed'}</Badge>
      </div>

      <div className="bg-white rounded-xl border shadow-sm mb-6">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <Row label="Transaction Hash" value={tx.hash} mono copy />
            <Row label="Status" value={tx.status ? 'Success' : 'Failed'} />
            <Row label="Block" value={String(tx.blockNumber)} link={`/blocks/${tx.blockNumber}`} />
            <Row label="Timestamp" value={`${timeAgo(new Date(tx.timestamp))} (${new Date(tx.timestamp).toUTCString()})`} />
            <Row label="From" value={tx.fromAddress} mono copy link={`/address/${tx.fromAddress}`} />
            <Row label="To" value={tx.toAddress ?? 'Contract Creation'} mono copy link={tx.toAddress ? `/address/${tx.toAddress}` : undefined} />
            <Row label="Value" value={`${formatBNB(BigInt(tx.value))} BNB`} />
            <Row label="Transaction Fee" value={`${formatBNB(BigInt(tx.gasUsed) * BigInt(tx.gasPrice))} BNB`} />
            <Row label="Gas Price" value={`${formatGwei(BigInt(tx.gasPrice))} Gwei`} />
            <Row label="Gas Used" value={`${formatNumber(Number(tx.gasUsed))} / ${formatNumber(Number(tx.gas))}`} />
          </tbody>
        </table>
      </div>

      {transfers.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm mb-6 p-4">
          <h2 className="font-semibold mb-3">Token Transfers ({transfers.length})</h2>
          <div className="space-y-2">
            {transfers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">From</span>
                <Link href={`/address/${t.fromAddress}`} className="text-blue-600 font-mono text-xs hover:underline">{t.fromAddress.slice(0,10)}...</Link>
                <span className="text-gray-500">To</span>
                <Link href={`/address/${t.toAddress}`} className="text-blue-600 font-mono text-xs hover:underline">{t.toAddress.slice(0,10)}...</Link>
                <span className="text-gray-500">Token</span>
                <Link href={`/token/${t.tokenAddress}`} className="text-yellow-600 hover:underline">{t.tokenAddress.slice(0,10)}...</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {txLogs.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="font-semibold mb-3">Logs ({txLogs.length})</h2>
          <div className="space-y-3">
            {txLogs.map((log, i) => (
              <div key={i} className="bg-gray-50 rounded p-3 font-mono text-xs">
                <div><span className="text-gray-500">Address:</span> {log.address}</div>
                {log.topic0 && <div><span className="text-gray-500">Topic0:</span> {log.topic0}</div>}
                <div><span className="text-gray-500">Data:</span> {log.data.slice(0, 100)}{log.data.length > 100 ? '...' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono, copy, link }: {
  label: string, value: string, mono?: boolean, copy?: boolean, link?: string
}) {
  return (
    <tr>
      <td className="px-6 py-3 text-gray-500 w-48 font-medium">{label}</td>
      <td className={`px-6 py-3 ${mono ? 'font-mono text-xs' : ''}`}>
        {link ? <Link href={link} className="text-blue-600 hover:underline">{value}</Link> : value}
        {copy && <CopyButton text={value} />}
      </td>
    </tr>
  )
}
```

- [ ] **Step 3: Write address detail page**

```tsx
// apps/web/app/address/[address]/page.tsx
import { db, schema } from '@/lib/db'
import { eq, or } from 'drizzle-orm'
import { formatBNB, formatNumber, timeAgo } from '@/lib/format'
import { TxTable } from '@/components/transactions/TxTable'
import { CopyButton } from '@/components/ui/CopyButton'
import { Badge } from '@/components/ui/Badge'

export default async function AddressPage({ params }: { params: { address: string } }) {
  const addr = params.address.toLowerCase()

  const [addressInfo] = await db.select().from(schema.addresses)
    .where(eq(schema.addresses.address, addr))

  const txs = await db.select().from(schema.transactions)
    .where(or(
      eq(schema.transactions.fromAddress, addr),
      eq(schema.transactions.toAddress, addr)
    ))
    .limit(25)

  const contract = addressInfo?.isContract
    ? await db.select().from(schema.contracts).where(eq(schema.contracts.address, addr)).limit(1)
    : []

  const tokens = await db.select().from(schema.tokenTransfers)
    .where(or(
      eq(schema.tokenTransfers.fromAddress, addr),
      eq(schema.tokenTransfers.toAddress, addr)
    )).limit(25)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Address</h1>
        {addressInfo?.isContract && <Badge variant="default">Contract</Badge>}
        {addressInfo?.label && <Badge variant="default">{addressInfo.label}</Badge>}
      </div>

      <div className="bg-white rounded-xl border shadow-sm mb-6 p-4">
        <div className="font-mono text-sm break-all">
          {addr}
          <CopyButton text={addr} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">BNB Balance</p>
            <p className="font-bold">{formatBNB(BigInt(addressInfo?.balance ?? '0'))} BNB</p>
          </div>
          <div>
            <p className="text-gray-500">Transactions</p>
            <p className="font-bold">{formatNumber(addressInfo?.txCount ?? 0)}</p>
          </div>
          <div>
            <p className="text-gray-500">First Seen</p>
            <p className="font-bold">{addressInfo?.firstSeen ? timeAgo(new Date(addressInfo.firstSeen)) : 'Unknown'}</p>
          </div>
        </div>
      </div>

      {contract[0] && (
        <div className="bg-white rounded-xl border shadow-sm mb-6 p-4">
          <h2 className="font-semibold mb-2">Contract</h2>
          {contract[0].verifiedAt ? (
            <div>
              <Badge variant="success">Verified</Badge>
              <p className="mt-2 text-sm text-gray-600">Verified via {contract[0].verifySource} • {contract[0].compilerVersion}</p>
              {contract[0].sourceCode && (
                <pre className="mt-3 bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64">
                  {contract[0].sourceCode.slice(0, 2000)}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="pending">Unverified</Badge>
              <a href="/verify" className="text-sm text-yellow-600 hover:underline">Verify contract →</a>
            </div>
          )}
        </div>
      )}

      <h2 className="font-semibold mb-4">Transactions</h2>
      <TxTable txs={txs} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat: add transaction detail, address detail pages"
```

---

## Task 10: Token, NFT, DEX, Gas, Validators Pages

**Files:**
- Create: `apps/web/app/token/page.tsx`
- Create: `apps/web/app/token/[address]/page.tsx`
- Create: `apps/web/app/nft/[address]/page.tsx`
- Create: `apps/web/app/dex/page.tsx`
- Create: `apps/web/app/gas/page.tsx`
- Create: `apps/web/app/validators/page.tsx`
- Create: `apps/web/app/verify/page.tsx`

- [ ] **Step 1: Token list page**

```tsx
// apps/web/app/token/page.tsx
import { db, schema } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import Link from 'next/link'
import { formatNumber } from '@/lib/format'

export const revalidate = 60

export default async function TokenListPage() {
  const tokens = await db.select().from(schema.tokens)
    .where(eq(schema.tokens.type, 'BEP20'))
    .orderBy(desc(schema.tokens.holderCount))
    .limit(50)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">BEP-20 Tokens</h1>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">#</th>
              <th className="text-left px-4 py-2 text-gray-500">Token</th>
              <th className="text-left px-4 py-2 text-gray-500">Symbol</th>
              <th className="text-left px-4 py-2 text-gray-500">Holders</th>
              <th className="text-left px-4 py-2 text-gray-500">Total Supply</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tokens.map((t, i) => (
              <tr key={t.address} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2">
                  <Link href={`/token/${t.address}`} className="text-yellow-600 hover:underline font-medium">{t.name}</Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{t.symbol}</td>
                <td className="px-4 py-2">{formatNumber(t.holderCount)}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.totalSupply.slice(0, 20)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Token detail page**

```tsx
// apps/web/app/token/[address]/page.tsx
import { db, schema } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { formatNumber } from '@/lib/format'
import { CopyButton } from '@/components/ui/CopyButton'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'

export default async function TokenDetailPage({ params }: { params: { address: string } }) {
  const addr = params.address.toLowerCase()
  const [token] = await db.select().from(schema.tokens).where(eq(schema.tokens.address, addr))
  if (!token) notFound()

  const transfers = await db.select().from(schema.tokenTransfers)
    .where(eq(schema.tokenTransfers.tokenAddress, addr))
    .orderBy(desc(schema.tokenTransfers.blockNumber))
    .limit(25)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{token.name}</h1>
        <Badge variant="default">{token.symbol}</Badge>
        <Badge variant="default">{token.type}</Badge>
      </div>

      <div className="bg-white rounded-xl border shadow-sm mb-6 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-500">Contract</p><p className="font-mono text-xs">{addr.slice(0,10)}...<CopyButton text={addr} /></p></div>
          <div><p className="text-gray-500">Decimals</p><p className="font-bold">{token.decimals}</p></div>
          <div><p className="text-gray-500">Total Supply</p><p className="font-bold">{formatNumber(Number(BigInt(token.totalSupply) / 10n ** BigInt(token.decimals)))}</p></div>
          <div><p className="text-gray-500">Holders</p><p className="font-bold">{formatNumber(token.holderCount)}</p></div>
        </div>
      </div>

      <h2 className="font-semibold mb-4">Token Transfers</h2>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">Tx Hash</th>
              <th className="text-left px-4 py-2 text-gray-500">From</th>
              <th className="text-left px-4 py-2 text-gray-500">To</th>
              <th className="text-left px-4 py-2 text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transfers.map((t, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/tx/${t.txHash}`} className="text-yellow-600 hover:underline">{t.txHash.slice(0,12)}...</Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/address/${t.fromAddress}`} className="text-blue-600 hover:underline">{t.fromAddress.slice(0,10)}...</Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/address/${t.toAddress}`} className="text-blue-600 hover:underline">{t.toAddress.slice(0,10)}...</Link>
                </td>
                <td className="px-4 py-2 text-sm">{(Number(BigInt(t.value)) / 10 ** token.decimals).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: DEX trades page**

```tsx
// apps/web/app/dex/page.tsx
import { db, schema } from '@/lib/db'
import { desc } from 'drizzle-orm'
import { timeAgo } from '@/lib/format'
import Link from 'next/link'

export const revalidate = 10

export default async function DexPage() {
  const trades = await db.select().from(schema.dexTrades)
    .orderBy(desc(schema.dexTrades.blockNumber))
    .limit(50)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">DEX Trades</h1>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">Tx</th>
              <th className="text-left px-4 py-2 text-gray-500">DEX</th>
              <th className="text-left px-4 py-2 text-gray-500">Pair</th>
              <th className="text-left px-4 py-2 text-gray-500">Maker</th>
              <th className="text-left px-4 py-2 text-gray-500">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {trades.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/tx/${t.txHash}`} className="text-yellow-600 hover:underline">{t.txHash.slice(0,12)}...</Link>
                </td>
                <td className="px-4 py-2 text-gray-700">{t.dex}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.pairAddress.slice(0,10)}...</td>
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/address/${t.maker}`} className="text-blue-600 hover:underline">{t.maker.slice(0,10)}...</Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{timeAgo(new Date(t.timestamp))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Gas tracker page**

```tsx
// apps/web/app/gas/page.tsx
import { db, schema } from '@/lib/db'
import { desc } from 'drizzle-orm'
import { formatGwei } from '@/lib/format'
import { getProvider } from '@/lib/rpc'

export const revalidate = 15

export default async function GasPage() {
  const provider = getProvider()
  const feeData = await provider.getFeeData()

  const history = await db.select().from(schema.gasHistory)
    .orderBy(desc(schema.gasHistory.blockNumber))
    .limit(20)

  const baseFee = feeData.gasPrice ?? 0n
  const slow = (baseFee * 100n) / 100n
  const standard = (baseFee * 110n) / 100n
  const fast = (baseFee * 130n) / 100n

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Gas Tracker</h1>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <GasCard label="🐢 Slow" gwei={formatGwei(slow)} est="~30s" color="green" />
        <GasCard label="🚗 Standard" gwei={formatGwei(standard)} est="~15s" color="yellow" />
        <GasCard label="🚀 Fast" gwei={formatGwei(fast)} est="~5s" color="orange" />
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4">
        <h2 className="font-semibold mb-3">Current Base Fee</h2>
        <p className="text-3xl font-bold">{formatGwei(baseFee)} <span className="text-lg font-normal text-gray-500">Gwei</span></p>
      </div>
    </div>
  )
}

function GasCard({ label, gwei, est, color }: { label: string, gwei: string, est: string, color: string }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
      <p className="text-lg font-medium mb-2">{label}</p>
      <p className="text-3xl font-bold mb-1">{gwei}</p>
      <p className="text-sm text-gray-500">Gwei • {est}</p>
    </div>
  )
}
```

- [ ] **Step 5: Validators page**

```tsx
// apps/web/app/validators/page.tsx
import { db, schema } from '@/lib/db'
import { desc } from 'drizzle-orm'
import { formatNumber } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'

export const revalidate = 120

export default async function ValidatorsPage() {
  const validators = await db.select().from(schema.validators)
    .orderBy(desc(schema.validators.votingPower))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">BNB Chain Validators ({validators.length})</h1>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">#</th>
              <th className="text-left px-4 py-2 text-gray-500">Validator</th>
              <th className="text-left px-4 py-2 text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-gray-500">Voting Power</th>
              <th className="text-left px-4 py-2 text-gray-500">Commission</th>
              <th className="text-left px-4 py-2 text-gray-500">Uptime</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {validators.map((v, i) => (
              <tr key={v.address} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2">
                  <Link href={`/address/${v.address}`} className="text-yellow-600 hover:underline font-medium">{v.moniker}</Link>
                </td>
                <td className="px-4 py-2">
                  <Badge variant={v.status === 'active' ? 'success' : v.status === 'jailed' ? 'fail' : 'default'}>
                    {v.status}
                  </Badge>
                </td>
                <td className="px-4 py-2">{formatNumber(Number(v.votingPower))}</td>
                <td className="px-4 py-2">{(Number(v.commission) * 100).toFixed(1)}%</td>
                <td className="px-4 py-2">{(Number(v.uptime) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Contract verification page**

```tsx
// apps/web/app/verify/page.tsx
'use client'
import { useState } from 'react'

export default function VerifyPage() {
  const [address, setAddress] = useState('')
  const [source, setSource] = useState('')
  const [compiler, setCompiler] = useState('v0.8.19+commit.7dd6d404')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/v1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, sourceCode: source, compilerVersion: compiler }),
      })
      const data = await res.json()
      if (data.success) { setStatus('success'); setMessage('Contract verified successfully!') }
      else { setStatus('error'); setMessage(data.error ?? 'Verification failed') }
    } catch { setStatus('error'); setMessage('Network error') }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Verify Contract Source Code</h1>
      <p className="text-gray-500 mb-6">Verify and publish your contract source code to make it readable on BNBScan.</p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Contract Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 font-mono text-sm" placeholder="0x..." />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Compiler Version</label>
          <input value={compiler} onChange={e => setCompiler(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Source Code (Solidity)</label>
          <textarea value={source} onChange={e => setSource(e.target.value)}
            rows={12} className="w-full border rounded-lg px-3 py-2 font-mono text-xs" placeholder="// SPDX-License-Identifier: MIT..." />
        </div>
        {status !== 'idle' && (
          <div className={`p-3 rounded-lg text-sm ${status === 'success' ? 'bg-green-50 text-green-700' : status === 'error' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
            {status === 'loading' ? 'Verifying...' : message}
          </div>
        )}
        <button type="submit" disabled={status === 'loading'}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-medium py-2 px-4 rounded-lg disabled:opacity-50">
          Verify & Publish
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 7: Commit all feature pages**

```bash
git add apps/web/app/
git commit -m "feat: add token, DEX, gas tracker, validators, contract verify pages"
```

---

## Task 11: Developer API Routes

**Files:**
- Create: `apps/web/app/api/v1/blocks/route.ts`
- Create: `apps/web/app/api/v1/blocks/[number]/route.ts`
- Create: `apps/web/app/api/v1/transactions/route.ts`
- Create: `apps/web/app/api/v1/transactions/[hash]/route.ts`
- Create: `apps/web/app/api/v1/addresses/[address]/route.ts`
- Create: `apps/web/app/api/v1/tokens/route.ts`
- Create: `apps/web/app/api/v1/stats/route.ts`
- Create: `apps/web/app/api/v1/verify/route.ts`
- Create: `apps/web/lib/api-rate-limit.ts`

- [ ] **Step 1: Simple rate limiter**

```typescript
// apps/web/lib/api-rate-limit.ts
// In-memory rate limiter (per IP, 100 req/min)
const store = new Map<string, { count: number; reset: number }>()

export function checkRateLimit(ip: string, limit = 100, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = store.get(ip)
  if (!entry || now > entry.reset) {
    store.set(ip, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
```

- [ ] **Step 2: Write all API routes**

`apps/web/app/api/v1/blocks/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { desc } from 'drizzle-orm'
import { checkRateLimit } from '@/lib/api-rate-limit'

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? 1)
  const limit = Math.min(Number(searchParams.get('limit') ?? 25), 100)
  const offset = (page - 1) * limit

  const blocks = await db.select().from(schema.blocks)
    .orderBy(desc(schema.blocks.number)).limit(limit).offset(offset)

  return NextResponse.json({ data: blocks, page, limit })
}
```

`apps/web/app/api/v1/stats/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { desc, count } from 'drizzle-orm'
import { getProvider } from '@/lib/rpc'

export async function GET(req: NextRequest) {
  const [latestBlock] = await db.select().from(schema.blocks).orderBy(desc(schema.blocks.number)).limit(1)
  const txTotal = await db.$count(schema.transactions)
  const feeData = await getProvider().getFeeData()

  return NextResponse.json({
    latestBlock: latestBlock?.number ?? 0,
    totalTransactions: txTotal,
    gasPrice: feeData.gasPrice?.toString() ?? '0',
    avgBlockTime: 3,
  })
}
```

`apps/web/lib/verifier.ts` (duplicate Sourcify logic here — apps cannot import each other):
```typescript
// apps/web/lib/verifier.ts
// NOTE: contract-verifier.ts logic lives in BOTH apps/indexer/src/ AND here.
// Do NOT import from @bnbscan/indexer — apps are not consumable packages.
// If this grows, extract to packages/verifier workspace package.
import axios from 'axios'
import { getDb, schema } from '@/lib/db'

const SOURCIFY_API = process.env.SOURCIFY_API ?? 'https://sourcify.dev/server'
const BSC_CHAIN_ID = 56

export async function verifyContractViaSourceify(address: string) {
  try {
    const res = await axios.get(`${SOURCIFY_API}/files/any/${BSC_CHAIN_ID}/${address}`)
    const files = res.data?.files ?? []
    const metaFile = files.find((f: any) => f.name.includes('metadata'))
    if (!metaFile) return null
    const meta = JSON.parse(metaFile.content)
    return {
      abi: meta.output?.abi ?? [],
      sourceCode: files.find((f: any) => f.name.endsWith('.sol'))?.content ?? '',
    }
  } catch { return null }
}
```

`apps/web/app/api/v1/verify/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyContractViaSourceify } from '@/lib/verifier'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { address, compilerVersion } = body
  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })

  const result = await verifyContractViaSourceify(address)
  if (!result) return NextResponse.json({ success: false, error: 'Not found on Sourcify' })

  await db.insert(schema.contracts).values({
    address: address.toLowerCase(),
    bytecode: '',
    abi: result.abi,
    sourceCode: result.sourceCode,
    compilerVersion: compilerVersion ?? null,
    verifiedAt: new Date(),
    verifySource: 'sourcify',
    license: null,
  }).onConflictDoUpdate({
    target: [schema.contracts.address],
    set: { abi: result.abi, sourceCode: result.sourceCode, verifiedAt: new Date() }
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit API routes**

```bash
git add apps/web/app/api/
git commit -m "feat: add developer API v1 routes with rate limiting"
```

---

## Task 12: Render Deployment

**Files:**
- Create: `render.yaml`
- Create: `apps/web/.env.production` (template)
- Create: `apps/indexer/.env.production` (template)

- [ ] **Step 1: Write render.yaml**

```yaml
# render.yaml
services:
  - type: web
    name: bnbscan-web
    runtime: node
    region: singapore
    plan: standard
    buildCommand: pnpm install && pnpm --filter @bnbscan/web build
    startCommand: pnpm --filter @bnbscan/web start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: bnbscan-db
          property: connectionString
      - key: BNB_RPC_URL
        value: https://bsc-dataseed1.binance.org/
      - key: REDIS_URL
        fromService:
          name: bnbscan-redis
          type: redis
          property: connectionString
      - key: NODE_ENV
        value: production

  - type: redis
    name: bnbscan-redis
    region: singapore
    plan: standard

  - type: worker
    name: bnbscan-indexer
    runtime: node
    region: singapore
    plan: standard
    buildCommand: pnpm install && pnpm --filter @bnbscan/indexer build
    startCommand: pnpm --filter @bnbscan/indexer start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: bnbscan-db
          property: connectionString
      - key: BNB_RPC_URL
        value: https://bsc-dataseed1.binance.org/
      - key: REDIS_URL
        fromService:
          name: bnbscan-redis
          type: redis
          property: connectionString
      - key: NODE_ENV
        value: production

databases:
  - name: bnbscan-db
    databaseName: bnbscan
    region: singapore
    plan: standard
# NOTE: Redis goes under `services:` (above), NOT `databases:`. Already declared above as type: redis.
```

- [ ] **Step 2: Run migrations on Render deploy (add to build command)**

Update `render.yaml` web buildCommand to:
```
pnpm install && cd packages/db && pnpm migrate && cd ../.. && pnpm --filter @bnbscan/web build
```

- [ ] **Step 3: Connect bnbscan.com via Cloudflare**

1. In Render dashboard → Custom Domain → add `bnbscan.com`
2. In Cloudflare DNS → add CNAME record: `bnbscan.com` → `your-render-app.onrender.com`
3. Enable Cloudflare proxy (orange cloud) for CDN + DDoS protection
4. In Render → enable "Cloudflare trusted IPs" for real IP forwarding

- [ ] **Step 4: Commit deployment config**

```bash
git add render.yaml
git commit -m "feat: add Render deployment config (web + worker + Postgres + Redis)"
```

---

## Task 13: Final QA Checklist

- [ ] `pnpm install` runs clean from root
- [ ] `pnpm --filter @bnbscan/web dev` starts Next.js on localhost:3000
- [ ] `pnpm --filter @bnbscan/indexer dev` connects to RPC + Redis, starts polling
- [ ] Home page loads with latest blocks + txs
- [ ] Search: paste a tx hash → navigates to tx detail
- [ ] Search: paste an address → navigates to address detail
- [ ] Search: paste a block number → navigates to block detail
- [ ] `/blocks` list paginates correctly
- [ ] `/token` shows token list ordered by holders
- [ ] `/gas` shows live gas prices from RPC
- [ ] `/validators` shows validator list
- [ ] `/verify` form submits and shows result
- [ ] `/api/v1/stats` returns JSON
- [ ] `/api/v1/blocks` returns paginated blocks
- [ ] Rate limiter returns 429 after 100 req/min
- [ ] `render.yaml` validates in Render dashboard
- [ ] bnbscan.com DNS resolves after Cloudflare setup

---

## RPC Providers (choose one for BNB_RPC_URL)

| Provider | Free Tier | Latency |
|----------|-----------|---------|
| Ankr | 30M req/mo | Low |
| NodeReal | 25M req/mo | Low |
| GetBlock | 40M req/mo | Medium |
| Binance public | Unlimited | Variable |
| QuickNode | 10M req/mo | Very low |

Recommendation: **Ankr** for free tier, **QuickNode** for production.
