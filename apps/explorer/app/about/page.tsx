import { chainConfig } from '@/lib/chain'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

export const revalidate = false

export const metadata: Metadata = {
  title: 'About & FAQ',
  description: `Learn about ${chainConfig.brandName}, the independent open-source ${chainConfig.name} block explorer maintained by Measurable Data Token (MDT). Frequently asked questions about data, API access, and contract verification.`,
  alternates: { canonical: '/about' },
}

type FaqItem = { question: string; answer: string; answerNode?: never } | { question: string; answer: null; answerNode: ReactNode }

const faqItems: FaqItem[] = [
  {
    question: `What is ${chainConfig.brandName}?`,
    answer: `${chainConfig.brandName} is an independent, open-source block explorer for ${chainConfig.name}. It provides real-time access to blocks, transactions, tokens, DEX trades, gas prices, and whale activity — without being affiliated with or operated by the ${chainConfig.name} foundation or ${chainConfig.externalExplorer}.`,
  },
  {
    question: `Is ${chainConfig.brandName} free to use?`,
    answer: `Yes, completely free. You can browse blocks, transactions, addresses, and tokens at no cost. The API also has a free tier — no credit card required to get started.`,
  },
  {
    question: 'How often is data updated?',
    answer: `Data is indexed in real time. New blocks are typically available within seconds of being confirmed on ${chainConfig.name}. Transaction and token transfer data follows the same indexing pipeline.`,
  },
  {
    question: `What is the difference between ${chainConfig.brandName} and ${chainConfig.externalExplorer}?`,
    answer: `${chainConfig.brandName} is independently operated and open source. It is maintained by the MDT (Measurable Data Token) team rather than a centralized entity. This means the codebase is auditable, the data pipeline is transparent, and the product roadmap is community-informed.`,
  },
  {
    question: 'How can I use the API?',
    answer: null, // rendered with JSX below — handled via answerNode
    answerNode: (
      <>
        The {chainConfig.brandName} REST API is available at{' '}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">
          https://{chainConfig.brandDomain}/api/v1
        </code>
        . A free tier is available with no sign-up required. Visit the{' '}
        <Link href="/api-docs" className={`${chainConfig.theme.linkText} hover:underline`}>
          API documentation
        </Link>{' '}
        for endpoint reference and examples.
      </>
    ),
  },
  {
    question: 'Can I verify my smart contract?',
    answer: null,
    answerNode: (
      <>
        Yes. Submit your contract address and source code on the{' '}
        <Link href="/verify" className={`${chainConfig.theme.linkText} hover:underline`}>
          Verify Contract
        </Link>{' '}
        page. Verification is checked against{' '}
        <a
          href="https://sourcify.dev"
          className={`${chainConfig.theme.linkText} hover:underline`}
          target="_blank"
          rel="noreferrer"
        >
          Sourcify
        </a>
        , an open-source contract verification service.
      </>
    ),
  },
  {
    question: 'How do I report a bug or request a feature?',
    answer: null,
    answerNode: (
      <>
        Open an issue on{' '}
        <a
          href="https://github.com/heathermhuang/bnbscan"
          className={`${chainConfig.theme.linkText} hover:underline`}
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        . Pull requests are also welcome — the project is fully open source.
      </>
    ),
  },
  {
    question: `Who maintains ${chainConfig.brandName}?`,
    answer: null,
    answerNode: (
      <>
        {chainConfig.brandName} is maintained by the{' '}
        <a
          href="https://mdt.io"
          className={`${chainConfig.theme.linkText} hover:underline`}
          target="_blank"
          rel="noreferrer"
        >
          Measurable Data Token (MDT)
        </a>{' '}
        team. MDT is a blockchain-based data exchange ecosystem focused on data transparency and user privacy.
      </>
    ),
  },
]

export default function AboutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      {/* About section */}
      <section>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
          <h1 className="text-2xl font-bold mb-2">About {chainConfig.brandName}</h1>
          <p className="text-gray-500 mb-6">{chainConfig.tagline}</p>

          <div className="space-y-4 text-gray-700">
            <p>
              {chainConfig.brandName} is an independent, open-source block explorer for{' '}
              {chainConfig.name}. It tracks real-time blockchain activity — blocks, transactions,
              token transfers, DEX trades, gas prices, and large-value movements — and makes that
              data freely accessible to developers and users.
            </p>
            <p>
              The project is maintained by{' '}
              <a
                href="https://mdt.io"
                className={`${chainConfig.theme.linkText} hover:underline`}
                target="_blank"
                rel="noreferrer"
              >
                Measurable Data Token (MDT)
              </a>
              , a blockchain-based data exchange ecosystem. {chainConfig.brandName} is not
              affiliated with, endorsed by, or operated by the {chainConfig.name} foundation or{' '}
              {chainConfig.externalExplorer}.
            </p>
          </div>

          {/* Feature grid */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Real-time Indexing',
                description: `Blocks and transactions indexed within seconds of confirmation on ${chainConfig.name}.`,
              },
              {
                title: 'Token Tracking',
                description: `Full BEP-20 / ERC-20 token support including transfers, holders, and supply.`,
              },
              {
                title: 'DEX Trades',
                description: 'Decoded decentralized exchange swap events across major DEX protocols.',
              },
              {
                title: 'Gas Tracker',
                description: 'Live and historical gas price data to help time your transactions.',
              },
              {
                title: 'Whale Tracker',
                description: `Monitor large ${chainConfig.currency} and token movements on-chain.`,
              },
              {
                title: 'API Access',
                description: 'Free REST API for querying blocks, transactions, tokens, and addresses.',
              },
              {
                title: 'Contract Verification',
                description: 'Verify and publish smart contract source code via Sourcify.',
              },
              {
                title: 'Open Source',
                description: 'Fully open codebase — auditable, forkable, and community-driven.',
              },
              {
                title: 'Webhooks',
                description: 'Register webhooks to receive real-time notifications for address activity.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <p className="font-semibold text-gray-900 text-sm mb-1">{feature.title}</p>
                <p className="text-gray-600 text-sm leading-snug">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ section */}
      <section>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
          <h2 className="text-xl font-bold mb-6">Frequently Asked Questions</h2>

          <div className="divide-y divide-gray-100">
            {faqItems.map((item) => (
              <details key={item.question} className="group py-4 first:pt-0 last:pb-0">
                <summary className="flex cursor-pointer select-none items-start justify-between gap-4 list-none">
                  <span className="font-medium text-gray-900 text-sm leading-relaxed">
                    {item.question}
                  </span>
                  <span
                    className="mt-0.5 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </summary>
                <div className="mt-3 text-sm text-gray-600 leading-relaxed">
                  {item.answerNode ?? item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / Links section */}
      <section>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
          <h2 className="text-xl font-bold mb-2">Links &amp; Resources</h2>
          <p className="text-gray-500 text-sm mb-6">
            Everything you need to get started or get involved.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="https://github.com/heathermhuang/bnbscan"
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5 mt-0.5 shrink-0 text-gray-700"
              >
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              <div>
                <p className="font-medium text-gray-900 text-sm">GitHub</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  Source code, issues, and pull requests
                </p>
              </div>
            </a>

            <a
              href="https://mdt.io"
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 mt-0.5 shrink-0 text-gray-700"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <div>
                <p className="font-medium text-gray-900 text-sm">MDT Website</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  Measurable Data Token — the team behind {chainConfig.brandName}
                </p>
              </div>
            </a>

            <Link
              href="/api-docs"
              className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 mt-0.5 shrink-0 text-gray-700"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <div>
                <p className="font-medium text-gray-900 text-sm">API Documentation</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  REST API reference with examples and rate limit info
                </p>
              </div>
            </Link>

            <Link
              href="/developer"
              className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 mt-0.5 shrink-0 text-gray-700"
              >
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <div>
                <p className="font-medium text-gray-900 text-sm">Developer Portal</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  API keys, webhooks, and developer tools
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
