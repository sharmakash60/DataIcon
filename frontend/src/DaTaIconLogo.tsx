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
    <img
      src="/logo.png"
      alt="DaTaIcon Emblem"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        objectFit: 'contain',
        ...style
      }}
    />
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
