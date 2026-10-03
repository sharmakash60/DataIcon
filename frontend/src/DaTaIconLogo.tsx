import React from 'react'

export interface DaTaIconLogoProps {
  /**
   * 'mark': Emblem only (orbital rings + faceted shield + D)
   * 'full': Vertical stacked emblem + DATAICON + SINCE 2026
   * 'horizontal': Inline emblem + DaTaIcon text
   */
  variant?: 'mark' | 'full' | 'horizontal'
  /** Pixel height / sizing scale */
  size?: number
  className?: string
  style?: React.CSSProperties
  /** Optional custom text color */
  textColor?: string
}

/**
 * Official DaTaIcon Brand Logo Component
 * Primary Palette:
 * - Primary Sage: #829F80 (RGB: 130, 159, 128 | HSL: 118°, 14%, 56%)
 * - Facet / Orbital Ring Tint: #adc4ab
 * - Drop Accent / Shadow: #5e795c
 * - Core Glyph: #ffffff
 */
export const DaTaIconEmblem: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 40,
  className = '',
  style = {}
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 130 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-label="DaTaIcon Emblem"
    >
      <defs>
        {/* Soft Drop Shadow for the letter D */}
        <filter id="di-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1.5" dy="2" stdDeviation="1" floodColor="#4a6348" floodOpacity="0.45" />
        </filter>
        {/* Subtle gradient for upper shield facet */}
        <linearGradient id="di-facet-top" x1="65" y1="18" x2="65" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8da98b" />
          <stop offset="100%" stopColor="#829F80" />
        </linearGradient>
        {/* Subtle gradient for lower shield facet */}
        <linearGradient id="di-facet-bottom" x1="65" y1="72" x2="65" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b6cca4" />
          <stop offset="100%" stopColor="#a3bfa0" />
        </linearGradient>
      </defs>

      {/* Back Segment of Upper Orbital Ring */}
      <path
        d="M 24 44 C 18 36 28 26 65 26 C 102 26 112 36 106 44"
        stroke="#adc4ab"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* Back Segment of Lower Orbital Ring */}
      <path
        d="M 24 64 C 18 56 28 46 65 46 C 102 46 112 56 106 64"
        stroke="#adc4ab"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* Central Shield: Lower Facet (Light Sage) */}
      <path
        d="M 28 70 L 65 83 L 102 70 L 65 116 Z"
        fill="url(#di-facet-bottom)"
        stroke="#96b293"
        strokeWidth="1.5"
      />

      {/* Central Shield: Upper Main Facet (#829F80 Primary Sage) */}
      <path
        d="M 65 18 L 106 36 L 98 72 L 65 83 L 32 72 L 24 36 Z"
        fill="url(#di-facet-top)"
        stroke="#738f71"
        strokeWidth="1.5"
      />

      {/* Front Segment of Upper Orbital Ring (Encircling foreground) */}
      <path
        d="M 24 44 C 30 52 50 56 65 56 C 80 56 100 52 106 44 C 114 34 94 28 65 28 C 36 28 16 34 24 44 Z"
        stroke="#adc4ab"
        strokeWidth="5.5"
        fill="none"
      />

      {/* Front Segment of Lower Orbital Ring (Encircling foreground) */}
      <path
        d="M 24 64 C 30 72 50 76 65 76 C 80 76 100 72 106 64 C 114 54 94 48 65 48 C 36 48 16 54 24 64 Z"
        stroke="#adc4ab"
        strokeWidth="5.5"
        fill="none"
      />

      {/* Iconic Bold Letter 'D' with Drop Shadow */}
      <text
        x="65"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Arial Black', sans-serif"
        fontWeight="900"
        fontSize="36"
        letterSpacing="0.5"
        filter="url(#di-shadow)"
      >
        D
      </text>
    </svg>
  )
}

export const DaTaIconLogo: React.FC<DaTaIconLogoProps> = ({
  variant = 'horizontal',
  size = 40,
  className = '',
  style = {},
  textColor = '#829F80'
}) => {
  if (variant === 'mark') {
    return <DaTaIconEmblem size={size} className={className} style={style} />
  }

  if (variant === 'full') {
    return (
      <div
        className={`dataicon-brand-full ${className}`}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          textAlign: 'center',
          ...style
        }}
      >
        <DaTaIconEmblem size={size * 1.5} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4 }}>
          <span
            style={{
              fontSize: size * 0.5,
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: textColor,
              lineHeight: 1.1,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            }}
          >
            DATAICON
          </span>
          <span
            style={{
              fontSize: size * 0.22,
              fontWeight: 600,
              letterSpacing: '0.36em',
              color: textColor,
              opacity: 0.85,
              marginTop: 4,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            }}
          >
            SINCE 2026
          </span>
        </div>
      </div>
    )
  }

  // Default: 'horizontal' (Emblem + DaTaIcon typography)
  return (
    <div
      className={`dataicon-brand-horizontal ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.25,
        ...style
      }}
    >
      <DaTaIconEmblem size={size} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          className="brand-title"
          style={{
            fontSize: size * 0.52,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: textColor,
            lineHeight: 1.05,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          }}
        >
          DaTaIcon
        </span>
        <span
          style={{
            fontSize: Math.max(9, size * 0.22),
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: textColor,
            opacity: 0.8,
            lineHeight: 1,
            marginTop: 2,
            textTransform: 'uppercase'
          }}
        >
          Since 2026
        </span>
      </div>
    </div>
  )
}

export default DaTaIconLogo
