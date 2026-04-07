import { db, schema } from '@/lib/db'
import { desc, eq, sql } from 'drizzle-orm'
import { timeAgo, formatAddress, safeBigInt, sanitizeSymbol } from '@/lib/format'
import Link from 'next/link'
import { chainConfig } from '@/lib/chain'
import type { Metadata } from 'next'

export const revalidate = 300

export const metadata: Metadata = {
  title: `Whale Tracker`,
  description: `Track large ${chainConfig.currency} transfers on ${chainConfig.name}. Monitor whale movements and high-value transactions on ${chainConfig.brandDomain}.`,
  alternates: { canonical: '/whales' },
}

type TokenTransferRow = {
  txHash: string
  tokenAddress: string
  fromAddress: string
  toAddress: string
  value: string
  blockNumber: number
  timestamp: Date
  symbol: string | null
  decimals: number | null
  name: string | null
}

type NativeTxRow = {
  hash: string
  fromAddress: string
  toAddress: string | null
  value: string
  blockNumber: number
  timestamp: Date
}

const PERIOD_LABELS: Record<string, string> = {
  '1h': 'Last 1h',
  '24h': 'Last 24h',
  '7d': 'Last 7d',
  all: 'All Time',
}

function formatTokenAmount(rawValue: string, decimals: number): string {
  try {
    const dec = BigInt(Math.max(0, Math.min(decimals, 77)))
    const raw = safeBigInt(rawValue)
    const divisor = 10n ** dec
    const whole = raw / divisor
    const frac = raw % divisor
    if (frac === 0n) return whole.toLocaleString()
    const fracStr = frac.toString().padStart(Number(dec), '0').slice(0, 4).replace(/0+$/, '')
    return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString()
  } catch {
    return '—'
  }
}

function formatNativeAmount(rawWei: string): string {
  try {
    const divisor = 10n ** 18n
    const raw = safeBigInt(rawWei)
    const whole = raw / divisor
    const frac = raw % divisor
    if (frac === 0n) return whole.toLocaleString()
    const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '')
    return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString()
  } catch {
    return '—'
  }
}

export default async function WhalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = ['1h', '24h', '7d', 'all'].includes(periodParam ?? '')
    ? (periodParam as string)
    : '24h'

  // Use NOW() to avoid full-table scans. "All time" capped at 30 days.
  const cutoff =
    period === '1h'
      ? sql`NOW() - INTERVAL '1 hour'`
      : period === '24h'
      ? sql`NOW() - INTERVAL '24 hours'`
      : period === '7d'
      ? sql`NOW() - INTERVAL '7 days'`
      : sql`NOW() - INTERVAL '30 days'`

  let tokenTransfers: TokenTransferRow[] = []
  let nativeTxs: NativeTxRow[] = []

  // Query 1: large ERC-20 token transfers joined with token metadata
  try {
    const rows = await db
      .select({
        txHash: schema.tokenTransfers.txHash,
        tokenAddress: schema.tokenTransfers.tokenAddress,
        fromAddress: schema.tokenTransfers.fromAddress,
        toAddress: schema.tokenTransfers.toAddress,
        value: schema.tokenTransfers.value,
        blockNumber: schema.tokenTransfers.blockNumber,
        timestamp: schema.tokenTransfers.timestamp,
        symbol: schema.tokens.symbol,
        decimals: schema.tokens.decimals,
        name: schema.tokens.name,
      })
      .from(schema.tokenTransfers)
      .leftJoin(schema.tokens, eq(schema.tokenTransfers.tokenAddress, schema.tokens.address))
      .where(
        sql`${schema.tokenTransfers.timestamp} >= ${cutoff} AND ${schema.tokenTransfers.value}::numeric > 0`
      )
      .orderBy(desc(sql`${schema.tokenTransfers.value}::numeric`))
      .limit(50)

    tokenTransfers = rows.map(r => ({ ...r, timestamp: new Date(r.timestamp) }))
  } catch { /* DB not connected */ }

  // Query 2: large native transfers (secondary section)
  try {
    const rows = await db
      .select({
        hash: schema.transactions.hash,
        fromAddress: schema.transactions.fromAddress,
        toAddress: schema.transactions.toAddress,
        value: schema.transactions.value,
        blockNumber: schema.transactions.blockNumber,
        timestamp: schema.transactions.timestamp,
      })
      .from(schema.transactions)
      .where(
        sql`${schema.transactions.timestamp} >= ${cutoff} AND ${schema.transactions.value}::numeric > 0`
      )
      .orderBy(desc(sql`${schema.transactions.value}::numeric`))
      .limit(25)

    nativeTxs = rows.map(r => ({ ...r, timestamp: new Date(r.timestamp) }))
  } catch { /* DB not connected */ }

  const linkCls = `${chainConfig.theme.linkText} hover:underline`

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Whale Tracker</h1>
        <p className="text-gray-500 text-sm">Large token transfers on {chainConfig.name}</p>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 mb-8">
        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/whales?period=${key}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              period === key
                ? `${chainConfig.theme.headerBg} ${chainConfig.theme.border} ${chainConfig.theme.headerText}`
                : `bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 ${chainConfig.theme.linkHover}`
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Section 1: Large Token Transfers (ERC-20 / BEP-20) */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-3">
          Large Token Transfers
          <span className="ml-2 text-sm font-normal text-gray-500">ERC-20 / BEP-20</span>
        </h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Age</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Tx Hash</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Token</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">From</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">To</th>
                  <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {tokenTransfers.map((tt) => {
                  const decimals = tt.decimals ?? 18
                  const symbol = tt.symbol ? sanitizeSymbol(tt.symbol) : '???'
                  const amount = formatTokenAmount(tt.value, decimals)

                  return (
                    <tr key={`${tt.txHash}-${tt.tokenAddress}`} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {timeAgo(tt.timestamp)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link href={`/tx/${tt.txHash}`} className={linkCls}>
                          {tt.txHash.slice(0, 14)}…
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <Link href={`/token/${tt.tokenAddress}`} className={linkCls}>
                          <span className="font-medium">{symbol}</span>
                          {tt.name && (
                            <span className="ml-1 text-gray-400 dark:text-gray-500 hidden sm:inline">
                              {sanitizeSymbol(tt.name).slice(0, 20)}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link href={`/address/${tt.fromAddress}`} className={linkCls}>
                          {formatAddress(tt.fromAddress)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link href={`/address/${tt.toAddress}`} className={linkCls}>
                          {formatAddress(tt.toAddress)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-semibold text-right whitespace-nowrap">
                        {amount}{' '}
                        <span className="text-gray-500 dark:text-gray-400 font-normal text-xs">{symbol}</span>
                      </td>
                    </tr>
                  )
                })}
                {tokenTransfers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                      No large token transfers found for this time period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 2: Large Native Transfers */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          Large Native Transfers
          <span className="ml-2 text-sm font-normal text-gray-500">{chainConfig.currency}</span>
        </h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Age</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Tx Hash</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">From</th>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">To</th>
                  <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                    Amount ({chainConfig.currency})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {nativeTxs.map((w) => (
                  <tr key={w.hash} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {timeAgo(w.timestamp)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/tx/${w.hash}`} className={linkCls}>
                        {w.hash.slice(0, 14)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/address/${w.fromAddress}`} className={linkCls}>
                        {formatAddress(w.fromAddress)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {w.toAddress ? (
                        <Link href={`/address/${w.toAddress}`} className={linkCls}>
                          {formatAddress(w.toAddress)}
                        </Link>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">Contract Create</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-semibold text-right whitespace-nowrap">
                      {formatNativeAmount(w.value)}{' '}
                      <span className="text-gray-500 dark:text-gray-400 font-normal text-xs">
                        {chainConfig.currency}
                      </span>
                    </td>
                  </tr>
                ))}
                {nativeTxs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                      No large {chainConfig.currency} transfers found for this time period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
