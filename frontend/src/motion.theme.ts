/**
 * motion.theme.ts
 *
 * Physics-backed spring transitions and motion design system.
 * Components never hard-code transitions; everything resolves from this file.
 */

export interface SpringConfig {
  stiffness: number
  damping: number
}

export type MotionPresetKey = 'snap' | 'ui' | 'gentle' | 'lively' | 'ambient'

export interface MotionTheme {
  transitions: Record<MotionPresetKey, SpringConfig>
  stagger: {
    tight: number
    base: number
    relaxed: number
  }
  travel: {
    hover: number
    enter: number
    section: number
  }
  reducedMotion: 'calm'
}

export const motionTheme: MotionTheme = {
  transitions: {
    snap: { stiffness: 1218, damping: 70 },
    ui: { stiffness: 305, damping: 33 },
    gentle: { stiffness: 110, damping: 20 },
    lively: { stiffness: 622, damping: 17 },
    ambient: { stiffness: 43, damping: 13 },
  },
  stagger: {
    tight: 0.04,
    base: 0.08,
    relaxed: 0.15,
  },
  travel: {
    hover: 4,
    enter: 24,
    section: 48,
  },
  reducedMotion: 'calm',
}

/**
 * Computes analytical spring response x(t) for unit step:
 * m = 1, k = stiffness, c = damping.
 * Returns value at time t (seconds).
 */
export function solveSpring(stiffness: number, damping: number, t: number): number {
  if (t <= 0) return 0
  const m = 1
  const omega0 = Math.sqrt(stiffness / m)
  const zeta = damping / (2 * Math.sqrt(stiffness * m))

  if (zeta < 1) {
    // Underdamped (oscillatory with overshoot)
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta)
    const decay = Math.exp(-zeta * omega0 * t)
    return 1 - decay * (Math.cos(omegaD * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t))
  } else if (Math.abs(zeta - 1) < 0.001) {
    // Critically damped
    return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t)
  } else {
    // Overdamped
    const s1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1))
    const s2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1))
    const c1 = s2 / (s2 - s1)
    const c2 = -s1 / (s2 - s1)
    return 1 - (c1 * Math.exp(s1 * t) + c2 * Math.exp(s2 * t))
  }
}

/**
 * Approximate CSS transition timing and bezier for each spring preset
 */
export function getPresetCssTransition(preset: MotionPresetKey): { duration: string; timingFunction: string } {
  switch (preset) {
    case 'snap':
      return { duration: '220ms', timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    case 'ui':
      return { duration: '340ms', timingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' }
    case 'gentle':
      return { duration: '650ms', timingFunction: 'cubic-bezier(0.33, 1, 0.68, 1)' }
    case 'lively':
      return { duration: '480ms', timingFunction: 'cubic-bezier(0.34, 1.45, 0.64, 1)' }
    case 'ambient':
      return { duration: '1200ms', timingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    default:
      return { duration: '340ms', timingFunction: 'ease-out' }
  }
}

/**
 * Generates polyline SVG coordinate points for the motion curve X(t) preview
 */
export function generateSpringCurvePoints(
  stiffness: number,
  damping: number,
  width: number,
  height: number,
  duration = 0.8
): string {
  const steps = 60
  const points: string[] = []

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration
    const val = solveSpring(stiffness, damping, t)
    // Map val [0, 1.5] to Y [height, 0] with baseline 1.0 at 35% height
    const x = (i / steps) * width
    const y = height - (val / 1.5) * (height - 16) - 8
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }

  return points.join(' ')
}

export default motionTheme
