import { ImageResponse } from 'next/og'
import { chainConfig } from '@/lib/chain'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${chainConfig.brandDomain} — ${chainConfig.tagline}`

export default function OpenGraphImage() {
  const primary = chainConfig.theme.primaryHex
  // Derive a slightly dimmer version of the accent for secondary elements
  const primaryDim = `${primary}33` // ~20% opacity

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        padding: '72px 80px',
        position: 'relative',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Background geometric accent — top-right circle */}
      <div
        style={{
          position: 'absolute',
          top: -160,
          right: -160,
          width: 560,
          height: 560,
          borderRadius: '50%',
          background: primaryDim,
          display: 'flex',
        }}
      />

      {/* Secondary smaller circle, mid-right */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          right: 100,
          width: 200,
          height: 200,
          borderRadius: '50%',
          border: `2px solid ${primary}22`,
          display: 'flex',
        }}
      />

      {/* Bottom-left subtle dot grid accent — thin horizontal rule */}
      <div
        style={{
          position: 'absolute',
          bottom: 160,
          left: 80,
          right: 80,
          height: 1,
          background: `linear-gradient(to right, ${primary}66, transparent)`,
          display: 'flex',
        }}
      />

      {/* Chain letter badge — top-left */}
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 80,
          width: 56,
          height: 56,
          background: primary,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0f172a',
          fontWeight: '800',
          fontSize: 28,
          letterSpacing: '-1px',
        }}
      >
        {chainConfig.brandName.charAt(0)}
      </div>

      {/* MDT badge — top-left, beside logo */}
      <div
        style={{
          position: 'absolute',
          top: 76,
          left: 152,
          display: 'flex',
          alignItems: 'center',
          color: '#94a3b8',
          fontSize: 16,
          fontWeight: '500',
          letterSpacing: '0.05em',
        }}
      >
        by MDT
      </div>

      {/* Main brand domain */}
      <div
        style={{
          fontSize: 80,
          fontWeight: '800',
          color: '#f8fafc',
          letterSpacing: '-3px',
          lineHeight: 1,
          marginBottom: 20,
          display: 'flex',
        }}
      >
        {chainConfig.brandDomain}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 28,
          fontWeight: '400',
          color: primary,
          letterSpacing: '-0.5px',
          lineHeight: 1.3,
          marginBottom: 32,
          display: 'flex',
        }}
      >
        {chainConfig.tagline}
      </div>

      {/* Maintained by line */}
      <div
        style={{
          fontSize: 18,
          fontWeight: '400',
          color: '#475569',
          letterSpacing: '0.02em',
          display: 'flex',
        }}
      >
        Maintained by Measurable Data Token (MDT)
      </div>
    </div>,
    { ...size }
  )
}
