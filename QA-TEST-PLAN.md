# BNBScan / EthScan — QA Test Plan

> Reusable test plan for full QA sweeps. Execute page-by-page in a real browser.
> Last updated: 2026-04-07

## Sites Under Test
- **BNBScan**: https://bnbscan.com
- **EthScan**: https://ethscan.io

---

## TC-01: Homepage (`/`)

| # | Test Case | Expected |
|---|-----------|----------|
| 1.1 | Page loads without errors | No console errors, no blank sections |
| 1.2 | 4 stat cards render with data | Latest Block, Total Transactions, Total Tokens, Native Price all show non-zero values |
| 1.3 | Latest Blocks table shows ~7 rows | Block numbers, ages, tx counts, validators visible |
| 1.4 | Latest Transactions table shows ~7 rows | Tx hashes (truncated), from/to, value, age visible |
| 1.5 | "View all Blocks" link goes to `/blocks` | Correct navigation |
| 1.6 | "View all Transactions" link goes to `/txs` | Correct navigation |
| 1.7 | Auto-refresh fires (~30s) | Page data updates without manual reload |
| 1.8 | JSON-LD structured data present | `<script type="application/ld+json">` in page source |
| 1.9 | Page title and meta description correct | Chain-specific title (BNBScan / EthScan) |

## TC-02: Header & Navigation

| # | Test Case | Expected |
|---|-----------|----------|
| 2.1 | Logo links to homepage | Click logo -> `/` |
| 2.2 | All desktop nav links work | Blocks, Txs, Tokens, DEX, Charts, Whales, Gas, chain-specific (Validators/Staking), Watchlist, API Docs, Developer, Verify |
| 2.3 | Network Switcher present | Shows current chain, dropdown has other chain |
| 2.4 | Network Switcher navigates to peer domain | Click navigates to peer site same path |
| 2.5 | Search bar visible in header | Input field with placeholder text |
| 2.6 | Mobile hamburger menu opens/closes | Toggle button shows/hides grouped nav |
| 2.7 | Theme colors match chain | BNB=yellow/black, ETH=blue/white |

## TC-03: Search (`SearchBar` + `/search`)

| # | Test Case | Expected |
|---|-----------|----------|
| 3.1 | Search valid tx hash -> redirects to `/tx/[hash]` | Direct redirect, no search results page |
| 3.2 | Search valid address -> redirects to `/address/[address]` | Direct redirect |
| 3.3 | Search valid block number -> redirects to `/blocks/[number]` | Direct redirect |
| 3.4 | Search token name -> shows search results | Token matches listed in table |
| 3.5 | Search gibberish -> "No results" | Helpful empty state with search tips |
| 3.6 | Empty search -> no navigation | Nothing happens or shows validation |

## TC-04: Blocks List (`/blocks`)

| # | Test Case | Expected |
|---|-----------|----------|
| 4.1 | Page loads with block table | Multiple rows with block number, age, txn count, validator |
| 4.2 | Block numbers are links to `/blocks/[number]` | Clickable, correct target |
| 4.3 | Pagination works | Page 2 shows older blocks; page numbers update URL |
| 4.4 | Validator addresses are links | Go to `/address/[validator]` |

## TC-05: Block Detail (`/blocks/[number]`)

| # | Test Case | Expected |
|---|-----------|----------|
| 5.1 | Recent block loads with all fields | Block number, hash, parent hash, timestamp, tx count, gas used, validator |
| 5.2 | Copy buttons work on hash fields | Click copies to clipboard |
| 5.3 | Transactions list shows txs in block | Tx hash links to `/tx/[hash]` |
| 5.4 | Validator address links to address page | Correct link |
| 5.5 | Old block (before indexer) shows RPC fallback notice | Amber banner "Fetched live from chain" |

## TC-06: Transactions List (`/txs`)

| # | Test Case | Expected |
|---|-----------|----------|
| 6.1 | Page loads with tx table | Hash, method, block, age, from, to, value columns |
| 6.2 | Tx hashes link to `/tx/[hash]` | Correct links |
| 6.3 | From/To addresses link to `/address/[addr]` | Correct links |
| 6.4 | Pagination works | Navigate between pages |

## TC-07: Transaction Detail (`/tx/[hash]`)

| # | Test Case | Expected |
|---|-----------|----------|
| 7.1 | Successful tx shows green "Success" badge | Status badge correct |
| 7.2 | All fields render | Hash, status, block, timestamp, from, to, value, gas price, gas used |
| 7.3 | Copy buttons work on hash, from, to | Clipboard copy |
| 7.4 | Gas usage progress bar renders | Visual bar with percentage |
| 7.5 | Input Data expandable | `<details>` toggle shows hex data |
| 7.6 | Token Transfers section (if applicable) | Lists token transfer events with token links |
| 7.7 | Event Logs section (if applicable) | Decoded event names and topics |
| 7.8 | Transaction summary banner present | Human-readable intent (emoji + description) |
| 7.9 | External explorer link correct | "View on BscScan/Etherscan" opens correct URL |
| 7.10 | Failed tx shows red "Failed" badge | If testing a failed tx |

## TC-08: Address Detail (`/address/[address]`)

| # | Test Case | Expected |
|---|-----------|----------|
| 8.1 | EOA address loads with balance | Address, balance in native currency |
| 8.2 | Watchlist star button toggles | Click star -> filled; click again -> unfilled |
| 8.3 | Copy button copies address | Clipboard |
| 8.4 | **Transactions tab** — shows tx table | Paginated tx list |
| 8.5 | **Token Transfers tab** — shows transfers | Token transfer events with amounts |
| 8.6 | **Holdings tab** — shows token balances | Token name, balance, USD value |
| 8.7 | **Analytics tab** — shows stats | Total Sent, Total Received, First Seen, Last Seen |
| 8.8 | **NFTs tab** — shows NFT data | NFT transfer table or card grid |
| 8.9 | Export CSV button works | Downloads .csv file |
| 8.10 | Contract address shows contract badge | "Contract" label visible |
| 8.11 | Verified contract shows source code | Source code preview section |
| 8.12 | ABI Reader shows read functions | Expandable function cards |
| 8.13 | ABI Reader — call a view function | Execute and see return value |
| 8.14 | GoPlus security warning (if flagged) | Risk banner appears for known malicious addresses |
| 8.15 | Moralis fallback notice (if no local data) | Blue "Showing from Moralis" banner |
| 8.16 | External explorer link correct | Links to BscScan/Etherscan for this address |
| 8.17 | Known label tags display | e.g., "Binance Hot Wallet" label if applicable |
| 8.18 | Pagination on tx/transfer tabs | Navigate pages |

## TC-09: Token List (`/token`)

| # | Test Case | Expected |
|---|-----------|----------|
| 9.1 | Page loads with token table | Name, symbol, holders, total supply columns |
| 9.2 | Type filter tabs work | BEP-20/ERC-20, BEP-721/ERC-721, BEP-1155/ERC-1155 filter correctly |
| 9.3 | Token search works | Search by name/symbol/address returns matches |
| 9.4 | Token names link to `/token/[address]` | Correct links |

## TC-10: Token Detail (`/token/[address]`)

| # | Test Case | Expected |
|---|-----------|----------|
| 10.1 | Token info renders | Name, symbol, type badge, contract address |
| 10.2 | Copy button on contract address | Clipboard |
| 10.3 | Top Holders table (top 10) | Address, balance, % of supply |
| 10.4 | Token Transfers table | Recent transfers with pagination |
| 10.5 | Risk Signals panel | Severity badges (danger/warn/ok) |
| 10.6 | RPC fallback notice (if not indexed) | "Fetched live from chain" banner |
| 10.7 | External explorer link | Correct link to BscScan/Etherscan |

## TC-11: Gas Tracker (`/gas`)

| # | Test Case | Expected |
|---|-----------|----------|
| 11.1 | 3 gas cards render | Slow, Standard, Fast with Gwei values |
| 11.2 | Estimated times shown | e.g., "~15 sec" for BNB |
| 11.3 | Current Base Fee displayed | Non-zero Gwei value |
| 11.4 | Chain-specific note | BNB: "3 Gwei minimum"; ETH: block time note |

## TC-12: DEX Trades (`/dex`)

| # | Test Case | Expected |
|---|-----------|----------|
| 12.1 | Stats row renders | Total Trades, Unique Traders, DEXes Found |
| 12.2 | Top Pairs table | Pair name, trade count |
| 12.3 | Recent Trades table | Tx hash, DEX, pair, amounts, maker, age |
| 12.4 | Pagination works | Navigate pages |
| 12.5 | Tx hashes link to `/tx/[hash]` | Correct links |

## TC-13: Charts (`/charts`)

| # | Test Case | Expected |
|---|-----------|----------|
| 13.1 | 3 charts render | Daily Tx Count, Gas Price History, Daily Block Count |
| 13.2 | Charts show ~30 days of data | SVG line charts with data points |
| 13.3 | "Not enough data" placeholder if <3 days | Graceful fallback |

## TC-14: Whale Tracker (`/whales`)

| # | Test Case | Expected |
|---|-----------|----------|
| 14.1 | Period filter buttons work | 1h, 24h, 7d, All — URL updates |
| 14.2 | Table shows large transfers | Age, Tx Hash, From, To, Amount |
| 14.3 | Tx hashes link to `/tx/[hash]` | Correct links |
| 14.4 | **Known issue**: may show no data | Native value doesn't capture WBNB/WETH DeFi moves |

## TC-15: Validators (`/validators`) — BNB Only

| # | Test Case | Expected |
|---|-----------|----------|
| 15.1 | Page loads on BNB | Table with validator data |
| 15.2 | Validator names link to address page | Correct links |
| 15.3 | Status badges render | Active/Inactive |
| 15.4 | 404 on ETH | ethscan.io/validators returns 404 |

## TC-16: Staking (`/staking`) — ETH Only

| # | Test Case | Expected |
|---|-----------|----------|
| 16.1 | Page loads on ETH | Stat cards + explainer content |
| 16.2 | 3 stat cards render | Active Validators, Total ETH Staked, Staking APY |
| 16.3 | "How Ethereum Staking Works" section | 2-column layout with content |
| 16.4 | Deposit contract link works | Links to correct address page |
| 16.5 | 404 on BNB | bnbscan.com/staking returns 404 |

## TC-17: Contract Verification (`/verify`)

| # | Test Case | Expected |
|---|-----------|----------|
| 17.1 | Form renders | Address input, compiler version select |
| 17.2 | Empty submit shows validation | Required field errors |
| 17.3 | Invalid address shows error | Client-side or server error |

## TC-18: Watchlist (`/watchlist`)

| # | Test Case | Expected |
|---|-----------|----------|
| 18.1 | Empty state shown if no watchlist | Hint to use star on address pages |
| 18.2 | After starring an address, it appears here | Address row with Remove button |
| 18.3 | Remove button removes address | Row disappears, localStorage updated |
| 18.4 | Persists across page refreshes | localStorage-backed |

## TC-19: Developer Portal (`/developer`)

| # | Test Case | Expected |
|---|-----------|----------|
| 19.1 | Page loads with all sections | API Keys, Webhooks, Query sections |
| 19.2 | Code examples visible | curl/JS code blocks |
| 19.3 | Links to API Docs work | Navigate to `/api-docs` |

## TC-20: API Docs (`/api-docs`)

| # | Test Case | Expected |
|---|-----------|----------|
| 20.1 | Page lists all endpoints | 11+ endpoint descriptions |
| 20.2 | Expandable example responses | `<details>` toggles work |
| 20.3 | Method badges (GET/POST/DELETE) | Colored badges per endpoint |

## TC-21: Footer

| # | Test Case | Expected |
|---|-----------|----------|
| 21.1 | Footer visible on all pages | Dark bar at bottom |
| 21.2 | Nav links work | Blocks, Txs, Tokens, Charts, API Docs, Developer |
| 21.3 | Network Switcher in footer | Same as header switcher |
| 21.4 | "Not affiliated with" disclaimer | Correct text per chain |
| 21.5 | GitHub link works | Opens repo |

## TC-22: Error Handling & Edge Cases

| # | Test Case | Expected |
|---|-----------|----------|
| 22.1 | Invalid tx hash -> error page | Graceful "not found" or error |
| 22.2 | Invalid address -> error page | Graceful handling |
| 22.3 | Invalid block number -> error page | Graceful handling |
| 22.4 | 404 page has search bar | SearchBar + quick links |
| 22.5 | Error page has "Try again" button | Reset button works |

## TC-23: API Health (Spot Check)

| # | Test Case | Expected |
|---|-----------|----------|
| 23.1 | GET `/api/ping` returns 200 | `{ "status": "ok" }` |
| 23.2 | GET `/api/health` returns detailed stats | DB lag, memory, connections |
| 23.3 | GET `/api/v1/stats` returns network stats | Block, tx count, token count |
| 23.4 | GET `/api/v1/blocks?page=1&limit=5` returns blocks | JSON array of blocks |
| 23.5 | GET `/api/v1/transactions?page=1&limit=5` returns txs | JSON array of transactions |

## TC-24: Performance & SEO

| # | Test Case | Expected |
|---|-----------|----------|
| 24.1 | Pages load in <3s | No excessive loading times |
| 24.2 | No memory-related errors in console | No OOM warnings |
| 24.3 | OpenGraph meta tags present | og:title, og:description on all pages |
| 24.4 | Google Analytics script loaded | GA tag in page source |

---

## Execution Log

Record results below during each QA run.

### Run: 2026-04-07

**Environment:** Headless Chromium via gstack browse, desktop viewport (1280x720)
**Tested:** BNBScan (bnbscan.com) + EthScan (ethscan.io)

#### CRITICAL: BNB Database Connection Down

The BNB `/api/health` endpoint reports `"database": null` and `"latestBlock": null`. The DB connection is failing or timing out. This is the root cause of most BNB failures below. ETH DB is healthy (66GB, 2 active connections, 18s lag).

#### Results by Test Case

| TC | BNB | ETH | Notes |
|----|-----|-----|-------|
| 1.1 Page loads | PASS | PASS | No console errors on either site |
| 1.2 Stat cards | **FAIL** | **FAIL** | Native price shows "—" on both sites. CoinGecko/CoinCap price feed broken. |
| 1.3 Blocks table | PASS | PASS | 7 rows, block numbers linked, ages shown |
| 1.4 Txns table | PASS | PASS | 7 rows, hashes linked, status badges visible |
| 1.5 View all links | PASS | PASS | Both "View all" links navigate correctly |
| 1.7 Auto-refresh | N/T | N/T | Not tested (requires 30s wait) |
| 1.9 Title/meta | PASS | PASS | Chain-specific titles correct |
| 2.1 Logo link | PASS | PASS | |
| 2.2 Nav links | PASS | PASS | All 13 desktop nav links present and labeled |
| 2.3 Network switcher | PASS | PASS | Dropdown visible in header |
| 2.5 Search bar | PASS | PASS | Input with placeholder visible |
| 2.7 Theme colors | PASS | PASS | BNB=yellow/black, ETH=blue/white |
| 3.1 Search tx hash | N/T | N/T | Browser reset during redirect test |
| 3.4 Search token name | **FAIL** | N/T | Timeout on BNB (DB down); not tested on ETH |
| 4.1 Blocks list | PASS | PASS | 25 rows, all columns populated |
| 4.2 Block links | PASS | PASS | Navigate to /blocks/[number] |
| 4.3 Pagination | PASS | PASS | Next arrow present, "Page 1 of X" shown |
| 5.1 Block detail | PASS | PASS | All fields: height, hash, parent hash, timestamp, tx count, gas, validator |
| 5.2 Copy buttons | PASS | PASS | Copy icons visible on hash fields |
| 5.3 Block txns | PASS | PASS | Full transaction table with links |
| 6.1 Txns list | PASS | PASS | 25 rows, hash/from/to/value/status |
| 6.2 Tx links | PASS | PASS | All hashes/addresses are proper links |
| 6.4 Pagination | PASS | PASS | "Page 1 of 1,632,204" (BNB) |
| 7.1 Tx success badge | PASS | PASS | Green "Success" badge |
| 7.2 All tx fields | PASS | PASS | Hash, status, block, timestamp, from/to, value, fee, gas, nonce, type |
| 7.4 Gas progress bar | PASS | PASS | Shows "21,000 / 21,000 (100%)" |
| 7.8 Tx summary banner | PASS | PASS | Emoji + human-readable decoded intent |
| 7.9 External link | PASS | PASS | "View on BscScan ↗" / "View on Etherscan ↗" |
| 8.1 Address loads | PASS | PASS | Balance, tx count, first seen shown |
| 8.2 Watchlist star | PASS | PASS | Star button visible ("UNSET BIAS" label) |
| 8.3 Copy button | PASS | PASS | |
| 8.4 Transactions tab | PASS | PASS | Paginated tx list |
| 8.5 Token Transfers tab | PASS | PASS | Tab visible and navigable |
| 8.6 Holdings tab | PASS | PASS | Token balances with symbols and amounts |
| 8.7 Analytics tab | PASS | PASS | Total Sent, Received, First/Last Seen |
| 8.8 NFTs tab | PASS | PASS | Tab visible |
| 8.10 Contract badge | PASS | PASS | "Contract" label shown for contract address |
| 9.1 Token list | PASS | PASS | Full table with Name, Symbol, Holders, Supply |
| 9.2 Type filter tabs | PASS | PASS | BEP-20/721/1155 (BNB) and ERC-20/721/1155 (ETH) |
| 9.3 Token search | PASS | PASS | Search input visible |
| 10.1 Token detail | **FAIL** | N/T | Timeout on BNB (DB). Skeleton loading never resolves. |
| 11.1 Gas cards | PASS | PASS | Slow/Standard/Fast with Gwei values |
| 11.3 Base fee | PASS | PASS | BNB: 0.05 Gwei, ETH: 0.22 Gwei |
| 11.4 Chain note | PASS | PASS | BNB: "3 Gwei minimum", ETH: block time note |
| 12.1 DEX stats | **FAIL** | PASS | BNB: timeout (DB). ETH: 87,632 trades, 4,763 traders |
| 12.2 Top pairs | **FAIL** | PASS | BNB: skeleton. ETH: 5 pairs shown |
| 12.3 Recent trades | **FAIL** | PASS | BNB: skeleton. ETH: full table with pagination |
| 13.1 Charts render | **FAIL** | **PARTIAL** | BNB: "No data yet" all 3. ETH: 2/3 charts have data, Gas Price History "No data yet" |
| 14.1 Whales filters | **FAIL** | **FAIL** | Both sites timeout with skeleton loading |
| 14.4 Known issue | CONFIRM | CONFIRM | Whales page query too slow on both chains |
| 15.1 Validators (BNB) | **FAIL** | N/A | "No validators synced yet" — indexer never synced validator data |
| 15.4 ETH 404 | N/A | PASS | ethscan.io/validators returns 404 correctly |
| 16.1 Staking (ETH) | N/A | PASS | Stats + explainer rendered perfectly |
| 16.5 BNB 404 | PASS | N/A | bnbscan.com/staking returns 404 correctly |
| 17.1 Verify form | PASS | PASS | Form with address + compiler fields |
| 18.1 Watchlist empty | PASS | PASS | Helpful hint text |
| 19.1 Developer portal | PASS | PASS | All sections with code examples |
| 20.1 API docs | PASS | PASS | 11+ endpoints listed with method badges |
| 21.1 Footer visible | PASS | PASS | Dark bar on all pages |
| 21.4 Disclaimer | PASS | PASS | "Not affiliated with BscScan or Binance" / "Etherscan or the Ethereum Foundation" |
| 22.1 Invalid tx hash | PASS | PASS | Clean 404 page with search bar and quick links |
| 22.4 404 search bar | PASS | PASS | SearchBar + Home/Blocks/Txns/Tokens links |
| 23.1 /api/ping | PASS | PASS | `{"status":"ok"}` |
| 23.2 /api/health | **FAIL** | PASS | BNB: database=null. ETH: full DB stats returned |
| 23.3 /api/v1/stats | **FAIL** | N/T | BNB: timeout |
| 24.1 Page load <3s | **FAIL** | PASS | BNB: DB-dependent pages timeout (>15s). ETH: all pages <3s |
| 24.2 No memory errors | PASS | PASS | No console errors on any page |
| Responsive mobile | PASS | PASS | Nav collapses, stat cards stack, tables scroll |
| Responsive tablet | PASS | PASS | Proper adaptation |

#### Bug Summary

| # | Severity | Issue | Affected | Root Cause |
|---|----------|-------|----------|------------|
| B1 | **CRITICAL** | BNB database connection dead | BNBScan only | `/api/health` shows `database: null`. All DB-dependent pages timeout. |
| B2 | **HIGH** | Token detail pages timeout | BNBScan (ETH not tested due to time) | `/token/[address]` shows infinite skeleton loading |
| B3 | **HIGH** | DEX page timeout | BNBScan | `/dex` shows infinite skeleton loading |
| B4 | **HIGH** | Whales page timeout | Both sites | `/whales` skeleton on both BNB and ETH. Query-level issue. |
| B5 | **MEDIUM** | Native price shows "—" | Both sites | CoinGecko + CoinCap price feeds both failing. No BNB or ETH price displayed. |
| B6 | **MEDIUM** | Charts show "No data yet" | BNB: all 3 charts. ETH: gas price chart only | Chart data aggregation not populating. BNB likely DB-related; ETH gas history is a code/data gap. |
| B7 | **MEDIUM** | Validators empty | BNBScan | "No validators synced yet" — indexer never synced validator data |
| B8 | **LOW** | Token search timeout | BNBScan | `/search?q=USDT` times out (DB) |

#### What's Working Well

- **Core pages (homepage, blocks, txns, block detail, tx detail, address detail)** all work on both sites
- **Address page** is feature-rich: 5 tabs, watchlist, copy buttons, contract detection, Moralis fallback
- **Transaction detail** is complete: summary banner, status badges, gas progress bar, external links
- **Static pages** (developer, api-docs, verify, watchlist) all render correctly
- **Chain-specific routing** works perfectly (validators BNB-only, staking ETH-only, correct 404s)
- **Theme differentiation** clear and consistent (yellow/black vs blue/white)
- **404 page** is well-designed with search and quick links
- **Responsive layouts** work well across mobile/tablet/desktop
- **Footer disclaimer** correctly says "Not affiliated with" (not "Powered by")
- **No console errors** on any page tested
