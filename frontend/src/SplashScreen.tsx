import React, { useEffect, useRef, useState, useCallback } from 'react'
import { DaTaIconEmblem } from './DaTaIconLogo'

interface SplashScreenProps {
  onComplete: () => void
}

interface ShardVertex {
  x: number
  y: number
  z: number
}

interface Piece {
  // 3D coordinate on the brain mesh relative to brain center
  bx: number
  by: number
  bz: number

  // Shatter start position & burst velocity
  startX: number
  startY: number
  vx: number
  vy: number

  // Timing
  delay: number
  flightDuration: number

  // Visual type
  isShard: boolean // true = polygonal shard, false = glowing neural node
  size: number
  color: string
  borderColor: string
  polygonVertices?: ShardVertex[]

  // Local rotation
  rotX: number
  rotY: number
  rotZ: number
  rotSpeedX: number
  rotSpeedY: number
  rotSpeedZ: number

  // Computed screen coordinates per frame
  screenX: number
  screenY: number
  screenZ: number
  projScale: number
  progress: number
}

interface BrainEdge {
  from: number
  to: number
  pulsePos: number
  pulseSpeed: number
}

declare global {
  interface Window {
    __dataicon_splash_active?: boolean
  }
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'entering' | 'holding' | 'fracturing' | 'shattering' | 'fused'>('entering')
  const [targetOffset, setTargetOffset] = useState({ x: 320, y: 40 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const hasCompletedRef = useRef<boolean>(false)

  if (typeof window !== 'undefined' && !hasCompletedRef.current) {
    window.__dataicon_splash_active = true
  }

  const handleFinish = useCallback(() => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true
    if (typeof window !== 'undefined') {
      window.__dataicon_splash_active = false
      window.dispatchEvent(new CustomEvent('dataicon:splash-complete'))
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }
    onComplete()
  }, [onComplete])

  useEffect(() => {
    const updateTarget = () => {
      const brainCanvas = (document.querySelector('#visualizer canvas') ||
        document.querySelector('.brain-canvas') ||
        document.getElementById('visualizer')) as HTMLElement | null

      const isDesktop = window.innerWidth > 1080
      let tx = isDesktop ? window.innerWidth * 0.72 : window.innerWidth * 0.5
      let ty = isDesktop ? Math.max(380, window.innerHeight * 0.50) : window.innerHeight * 0.58

      if (brainCanvas) {
        const rect = brainCanvas.getBoundingClientRect()
        if (rect.width > 50 && rect.height > 50) {
          tx = rect.left + rect.width / 2
          ty = rect.top + rect.height * 0.575
        }
      }

      const cx = window.innerWidth / 2
      const cy = window.innerHeight * 0.45
      setTargetOffset({ x: Math.round(tx - cx), y: Math.round(ty - cy) })
    }

    updateTarget()
    const timer = setTimeout(updateTarget, 100)
    window.addEventListener('resize', updateTarget)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateTarget)
    }
  }, [])

  useEffect(() => {
    // Stage timeline:
    // 0ms    - entering (logo & wordmark assemble)
    // 1600ms - holding (ambient shimmer)
    // 2100ms - fracturing (clean crystalline fracture lines crack across logo)
    // 2500ms - shattering (pieces burst and form the 3D neural brain)
    // 4400ms - fused (synaptic flash and blend into 3D brain)
    // 4800ms - complete (hands off to live page)

    const t1 = setTimeout(() => setPhase('holding'), 1600)
    const t2 = setTimeout(() => setPhase('fracturing'), 2100)
    const t3 = setTimeout(() => setPhase('shattering'), 2500)
    const t4 = setTimeout(() => setPhase('fused'), 4400)
    const t5 = setTimeout(() => handleFinish(), 4800)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleFinish()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
      window.removeEventListener('keydown', handleKeyDown)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [handleFinish])

  // Canvas 3D particle & brain formation simulation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    const exactLogoImg = new Image()
    exactLogoImg.src = '/logo.png'

    // Locate the 3D neural brain element in the DOM with precise Three.js perspective alignment
    const getBrainTarget = () => {
      const brainCanvas = (document.querySelector('#visualizer canvas') ||
        document.querySelector('.brain-canvas') ||
        document.getElementById('visualizer')) as HTMLElement | null

      if (brainCanvas) {
        const rect = brainCanvas.getBoundingClientRect()
        if (rect.width > 50 && rect.height > 50) {
          // In Three.js: camera is at (0, 0.35, 7.2) with FOV 40.
          // Origin (0,0,0) projects to y = rect.top + rect.height * 0.567.
          // We set vertical center to rect.top + rect.height * 0.575 to be dead-center on the 3D brain mesh!
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height * 0.575,
            radius: rect.height * 0.265
          }
        }
      }

      // Responsive fallback
      const isDesktop = width > 1080
      return {
        x: isDesktop ? width * 0.72 : width * 0.5,
        y: isDesktop ? Math.max(380, height * 0.50) : height * 0.58,
        radius: Math.min(width, height) * (isDesktop ? 0.22 : 0.25)
      }
    }

    const brainTarget = getBrainTarget()
    const logoCenter = { x: width / 2, y: height * 0.45 }

    // Build the 3D Dual-Hemisphere Brain Model for the pieces
    const TOTAL_PIECES = 110
    const pieces: Piece[] = []
    const baseRadius = brainTarget.radius

    // Brand Theme Palette: Sage (#829F80), Light Sage (#adc4ab), Slate Forest (#22493e), White (#ffffff)
    const shardFills = [
      'rgba(130, 159, 128, 0.42)', // Primary Sage
      'rgba(173, 196, 171, 0.48)', // Light Sage
      'rgba(34, 73, 62, 0.52)',   // Slate Forest (matches Three.js wireframe)
      'rgba(236, 239, 233, 0.58)', // Soft Ivory (matches page base)
      'rgba(255, 255, 255, 0.65)'  // Pure White Glass
    ]
    const shardBorders = [
      'rgba(130, 159, 128, 0.85)',
      'rgba(173, 196, 171, 0.90)',
      'rgba(255, 255, 255, 0.95)',
      'rgba(34, 73, 62, 0.75)'
    ]

    // Points forming the DaTaIcon Emblem Logo inside the neural brain core
    const logoScale = baseRadius * 0.30

    // 13 Faceted Shield outline & seam points
    const shieldNormPoints = [
      { x: 0, y: -0.96 },     // 0: top apex
      { x: 0.42, y: -0.78 },  // 1: top right
      { x: 0.82, y: -0.58 },  // 2: right shoulder
      { x: 0.72, y: -0.18 },  // 3: right upper
      { x: 0.65, y: 0.12 },   // 4: right mid waist
      { x: 0.35, y: 0.58 },   // 5: right lower flank
      { x: 0, y: 0.98 },      // 6: bottom tip
      { x: -0.35, y: 0.58 },  // 7: left lower flank
      { x: -0.65, y: 0.12 },  // 8: left mid waist
      { x: -0.72, y: -0.18 }, // 9: left upper
      { x: -0.82, y: -0.58 }, // 10: left shoulder
      { x: -0.42, y: -0.78 }, // 11: top left
      { x: 0, y: 0.28 },      // 12: central facet junction
    ]

    // 14 points for iconic bold letter 'D'
    const dNormPoints = [
      // spine
      { x: -0.28, y: -0.52 }, // 13: spine top
      { x: -0.28, y: -0.26 }, // 14
      { x: -0.28, y: 0.0 },   // 15: spine mid
      { x: -0.28, y: 0.26 },  // 16
      { x: -0.28, y: 0.52 },  // 17: spine bottom
      // top bar & outer loop
      { x: -0.08, y: -0.52 }, // 18
      { x: 0.14, y: -0.48 },  // 19
      { x: 0.32, y: -0.32 },  // 20
      { x: 0.40, y: -0.12 },  // 21
      { x: 0.42, y: 0.0 },    // 22
      { x: 0.40, y: 0.12 },   // 23
      { x: 0.32, y: 0.32 },   // 24
      { x: 0.14, y: 0.48 },   // 25
      { x: -0.08, y: 0.52 },  // 26
    ]

    // 12 points for the core orbital ring encircling the shield
    const orbitalNormPoints: { x: number; y: number }[] = []
    for (let o = 0; o < 12; o++) {
      const oa = (o / 12) * Math.PI * 2
      const ox = Math.cos(oa) * 1.15
      const oy = Math.sin(oa) * 0.42
      const cosT = Math.cos(-0.42), sinT = Math.sin(-0.42)
      orbitalNormPoints.push({
        x: ox * cosT - oy * sinT,
        y: ox * sinT + oy * cosT
      })
    }

    const allLogoPoints = [...shieldNormPoints, ...dNormPoints, ...orbitalNormPoints]
    const LOGO_POINTS_COUNT = allLogoPoints.length // 39 points

    for (let i = 0; i < TOTAL_PIECES; i++) {
      const isLogoPiece = i < LOGO_POINTS_COUNT
      const isShard = i < 44 // 44 crystalline polygonal facets, remainder are neural nodes

      let bx = 0
      let by = 0
      let bz = 0

      if (isLogoPiece) {
        // Pieces that go inside assemble and form the DaTaIcon Logo inside the brain
        const lp = allLogoPoints[i]
        bx = lp.x * logoScale
        by = lp.y * logoScale
        bz = (Math.random() - 0.5) * (logoScale * 0.22)
      } else {
        // Surrounding 3D dual-hemisphere brain shell
        const outerIndex = i - LOGO_POINTS_COUNT
        const outerTotal = TOTAL_PIECES - LOGO_POINTS_COUNT
        const isRightHemisphere = outerIndex % 2 === 0

        const phi = Math.acos(1 - (2 * (outerIndex + 0.5)) / outerTotal)
        const theta = Math.PI * (1 + Math.sqrt(5)) * outerIndex

        let rx = 1.08
        let ry = 0.96
        let rz = 1.28

        bx = Math.sin(phi) * Math.cos(theta) * rx * baseRadius
        by = Math.cos(phi) * ry * baseRadius
        bz = Math.sin(phi) * Math.sin(theta) * rz * baseRadius

        const fissureGap = baseRadius * 0.16
        if (isRightHemisphere) {
          bx = Math.abs(bx) + fissureGap
        } else {
          bx = -Math.abs(bx) - fissureGap
        }

        const fold = (Math.sin(bx * 0.08) * Math.cos(by * 0.08) + Math.sin(bz * 0.06)) * (baseRadius * 0.06)
        bx += fold
        by += fold * 0.5
        bz += fold
      }

      // Shatter starting position around the logo
      const startScatterX = (Math.random() - 0.5) * 220
      const startScatterY = (Math.random() - 0.5) * 160
      const startX = logoCenter.x + startScatterX
      const startY = logoCenter.y + startScatterY

      // Initial explosive burst velocity
      const burstAngle = Math.atan2(startScatterY, startScatterX) + (Math.random() - 0.5) * 0.6
      const burstSpeed = 100 + Math.random() * 220
      const vx = Math.cos(burstAngle) * burstSpeed
      const vy = Math.sin(burstAngle) * burstSpeed

      // Create irregular polygonal shard vertices
      let polygonVertices: ShardVertex[] | undefined
      if (isShard) {
        const shardSides = 3 + Math.floor(Math.random() * 3) // 3 to 5 sides
        const shardRadius = 8 + Math.random() * 14
        polygonVertices = []
        for (let s = 0; s < shardSides; s++) {
          const a = (s / shardSides) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
          const r = shardRadius * (0.6 + Math.random() * 0.5)
          polygonVertices.push({
            x: Math.cos(a) * r,
            y: Math.sin(a) * r,
            z: (Math.random() - 0.5) * 4
          })
        }
      }

      pieces.push({
        bx,
        by,
        bz,
        startX,
        startY,
        vx,
        vy,
        delay: Math.random() * 0.32,
        flightDuration: 1.45 + Math.random() * 0.35,
        isShard,
        size: isShard ? 10 + Math.random() * 8 : 2.5 + Math.random() * 3.5,
        color: shardFills[i % shardFills.length],
        borderColor: shardBorders[i % shardBorders.length],
        polygonVertices,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
        rotSpeedX: (Math.random() - 0.5) * 3.5,
        rotSpeedY: (Math.random() - 0.5) * 3.5,
        rotSpeedZ: (Math.random() - 0.5) * 2.5,
        screenX: startX,
        screenY: startY,
        screenZ: 0,
        projScale: 1,
        progress: 0
      })
    }

    // Build neural connection edges: logo lines + outer brain connections
    const edges: BrainEdge[] = []

    // 1. Shield perimeter & facet lines
    for (let s = 0; s < 12; s++) {
      edges.push({ from: s, to: (s + 1) % 12, pulsePos: Math.random(), pulseSpeed: 1.2 })
    }
    edges.push({ from: 4, to: 12, pulsePos: 0.1, pulseSpeed: 1.0 })
    edges.push({ from: 8, to: 12, pulsePos: 0.3, pulseSpeed: 1.0 })
    edges.push({ from: 6, to: 12, pulsePos: 0.5, pulseSpeed: 1.0 })
    edges.push({ from: 0, to: 12, pulsePos: 0.7, pulseSpeed: 1.0 })

    // 2. Letter 'D' spine & outer loop
    for (let d = 13; d < 17; d++) {
      edges.push({ from: d, to: d + 1, pulsePos: Math.random(), pulseSpeed: 1.4 })
    }
    edges.push({ from: 13, to: 18, pulsePos: 0.2, pulseSpeed: 1.3 })
    for (let d = 18; d < 26; d++) {
      edges.push({ from: d, to: d + 1, pulsePos: Math.random(), pulseSpeed: 1.3 })
    }
    edges.push({ from: 26, to: 17, pulsePos: 0.8, pulseSpeed: 1.3 })

    // 3. Inner core orbital ring
    for (let o = 27; o < 38; o++) {
      edges.push({ from: o, to: o + 1, pulsePos: Math.random(), pulseSpeed: 1.1 })
    }
    edges.push({ from: 38, to: 27, pulsePos: 0.9, pulseSpeed: 1.1 })

    // 4. Logo to outer brain anchor connections
    edges.push({ from: 0, to: 39, pulsePos: 0.2, pulseSpeed: 0.9 })
    edges.push({ from: 2, to: 45, pulsePos: 0.4, pulseSpeed: 0.9 })
    edges.push({ from: 6, to: 55, pulsePos: 0.6, pulseSpeed: 0.9 })
    edges.push({ from: 10, to: 65, pulsePos: 0.8, pulseSpeed: 0.9 })

    // 5. Connections among outer neural brain nodes
    for (let i = LOGO_POINTS_COUNT; i < TOTAL_PIECES; i++) {
      let connections = 0
      for (let j = i + 1; j < TOTAL_PIECES; j++) {
        const dx = pieces[i].bx - pieces[j].bx
        const dy = pieces[i].by - pieces[j].by
        const dz = pieces[i].bz - pieces[j].bz
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < baseRadius * 0.46 && connections < 3) {
          edges.push({
            from: i,
            to: j,
            pulsePos: Math.random(),
            pulseSpeed: 0.8 + Math.random() * 1.4
          })
          connections++
        }
      }
    }

    // Animation Loop
    startTimeRef.current = performance.now()

    const render = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000 // seconds

      ctx.clearRect(0, 0, width, height)

      // Time checkpoints
      const shatterStart = 2.2 // seconds
      const bgFadeStart = 3.3
      const bgFadeEnd = 4.3
      const finishTime = 4.8

      // Background fade: smoothly reveals underlying webpage
      let bgAlpha = 1
      if (elapsed > bgFadeStart) {
        bgAlpha = Math.max(0, 1 - (elapsed - bgFadeStart) / (bgFadeEnd - bgFadeStart))
      }

      if (bgAlpha > 0.01) {
        ctx.save()
        // Deep executive slate background (from brand dark #172416)
        ctx.fillStyle = `rgba(19, 29, 22, ${bgAlpha * 0.98})`
        ctx.fillRect(0, 0, width, height)

        // Subtle tech grid pattern in sage brand color
        const gridSize = 48
        ctx.strokeStyle = `rgba(130, 159, 128, ${bgAlpha * 0.05})`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x < width; x += gridSize) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
        for (let y = 0; y < height; y += gridSize) {
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // Before shattering: draw ambient sage glow and clean crystalline fracture effects
      if (elapsed < shatterStart) {
        // Ambient sage glow behind logo
        const pulse = Math.sin(elapsed * 3.5) * 0.15 + 0.85
        const glowGrad = ctx.createRadialGradient(
          logoCenter.x,
          logoCenter.y,
          20,
          logoCenter.x,
          logoCenter.y,
          240 * pulse
        )
        glowGrad.addColorStop(0, 'rgba(130, 159, 128, 0.28)')
        glowGrad.addColorStop(0.5, 'rgba(173, 196, 171, 0.08)')
        glowGrad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGrad
        ctx.beginPath()
        ctx.arc(logoCenter.x, logoCenter.y, 240 * pulse, 0, Math.PI * 2)
        ctx.fill()

        // Fracturing phase (1.8s - 2.2s): clean white & sage crystalline fracture lines
        if (elapsed > 1.8) {
          const fracProgress = (elapsed - 1.8) / 0.4
          ctx.save()
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 + Math.random() * 0.2})`
          ctx.lineWidth = 1.2 + Math.random() * 1.2
          ctx.shadowColor = 'rgba(130, 159, 128, 0.85)'
          ctx.shadowBlur = 10

          // Spider-web fracture cracks
          for (let crack = 0; crack < 6; crack++) {
            const angle = (crack / 6) * Math.PI * 2 + 0.2
            const maxLen = 120 * fracProgress
            let cx = logoCenter.x
            let cy = logoCenter.y
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            for (let step = 0; step < 5; step++) {
              cx += Math.cos(angle) * (maxLen / 5) + (Math.random() - 0.5) * 20
              cy += Math.sin(angle) * (maxLen / 5) + (Math.random() - 0.5) * 20
              ctx.lineTo(cx, cy)
            }
            ctx.stroke()
          }
          ctx.restore()
        }
      }

      // Shattering & Neural Brain Formation phase
      if (elapsed >= shatterStart) {
        const timeSinceShatter = elapsed - shatterStart

        // Dynamic 3D rotation matching Three.js brain rotation
        const brainRotY = timeSinceShatter * 0.95
        const brainRotX = 0.15
        const cosY = Math.cos(brainRotY)
        const sinY = Math.sin(brainRotY)
        const cosX = Math.cos(brainRotX)
        const sinX = Math.sin(brainRotX)

        const currentBrain = getBrainTarget()

        // Master fade-out near the end of the intro
        let overallAlpha = 1
        if (elapsed > 4.3) {
          overallAlpha = Math.max(0, 1 - (elapsed - 4.3) / 0.5)
        }

        // 1. Update piece positions and 3D projection
        for (let i = 0; i < TOTAL_PIECES; i++) {
          const p = pieces[i]
          const pieceTime = timeSinceShatter - p.delay

          if (pieceTime <= 0) {
            p.screenX = p.startX
            p.screenY = p.startY
            p.progress = 0
            continue
          }

          // Progress from shatter to landed in brain [0 -> 1]
          const rawProgress = Math.min(1, pieceTime / p.flightDuration)
          // Smooth cubic bezier easing
          const progress =
            rawProgress < 0.5
              ? 4 * rawProgress * rawProgress * rawProgress
              : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2

          p.progress = progress

          // Rotate 3D target coordinates on the brain
          const rotBX = p.bx * cosY - p.bz * sinY
          const rotBZ = p.bz * cosY + p.bx * sinY
          const rotBY = p.by * cosX - rotBZ * sinX
          const finalBZ = rotBZ * cosX + p.by * sinX

          // 3D perspective projection onto 2D screen
          const fov = 650
          const projScale = fov / (fov + finalBZ)
          const targetScreenX = currentBrain.x + rotBX * projScale
          const targetScreenY = currentBrain.y + rotBY * projScale

          // Curved trajectory from logo start to brain target
          // During initial shatter: burst outward
          const burstFactor = Math.sin(rawProgress * Math.PI) * (1 - progress)
          const burstOffsetX = p.vx * 0.22 * burstFactor
          const burstOffsetY = p.vy * 0.22 * burstFactor

          // Gentle flight arc that strictly decays to 0 before arrival so pieces align perfectly
          const arcLift = progress < 0.72 ? Math.sin((progress / 0.72) * Math.PI) * -28 : 0

          p.screenX = (1 - progress) * (p.startX + burstOffsetX) + progress * targetScreenX
          p.screenY = (1 - progress) * (p.startY + burstOffsetY) + progress * targetScreenY + arcLift
          p.screenZ = finalBZ
          p.projScale = projScale

          // Spin pieces during flight
          p.rotX += p.rotSpeedX * 0.035
          p.rotY += p.rotSpeedY * 0.035
          p.rotZ += p.rotSpeedZ * 0.035
        }

        // 2. Draw Orbital Energy Rings around the assembling brain in Sage/Slate theme
        if (timeSinceShatter > 0.4) {
          const ringProgress = Math.min(1, (timeSinceShatter - 0.4) / 1.2)
          ctx.save()
          ctx.translate(currentBrain.x, currentBrain.y)

          // Ring 1 (Sage Green dashed ring, matching Brain3DAnimation)
          ctx.save()
          ctx.rotate(-0.35 + brainRotY * 0.2)
          ctx.beginPath()
          ctx.ellipse(0, 0, currentBrain.radius * 1.52, currentBrain.radius * 0.48, 0, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(130, 159, 128, ${0.5 * ringProgress * overallAlpha})`
          ctx.lineWidth = 1.2
          ctx.setLineDash([8, 12])
          ctx.stroke()
          ctx.restore()

          // Ring 2 (Light Sage ring)
          ctx.save()
          ctx.rotate(0.55 - brainRotY * 0.25)
          ctx.beginPath()
          ctx.ellipse(0, 0, currentBrain.radius * 1.72, currentBrain.radius * 0.52, 0, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(173, 196, 171, ${0.38 * ringProgress * overallAlpha})`
          ctx.lineWidth = 1.0
          ctx.setLineDash([4, 16])
          ctx.stroke()
          ctx.restore()

          ctx.restore()
        }

        // 2.5 Draw the glowing DaTaIcon Logo formed by the pieces inside the neural brain
        // Only visible AFTER pieces have traveled inside the brain and assemble into place
        if (timeSinceShatter > 1.35) {
          const formProgress = Math.min(1, (timeSinceShatter - 1.35) / 0.5)
          ctx.save()
          ctx.translate(currentBrain.x, currentBrain.y)

          // 3D perspective rotation of the logo plane matching the brain rotation
          const rotCosine = Math.cos(brainRotY)
          const logoSign = Math.sign(rotCosine) || 1
          // Higher visibility with clear contrast
          const logoAlpha = formProgress * overallAlpha * 0.95 * Math.min(1, Math.abs(rotCosine) * 1.4)

          if (logoAlpha > 0.02) {
            ctx.save()
            ctx.scale(Math.abs(rotCosine) * logoSign, 1)

            const s = currentBrain.radius * 0.0056

            // Ambient Core Glow with white/sage highlight for maximum visibility
            const coreGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 50 * s)
            coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.65 * logoAlpha})`)
            coreGrad.addColorStop(0.35, `rgba(173, 196, 171, ${0.45 * logoAlpha})`)
            coreGrad.addColorStop(0.7, `rgba(130, 159, 128, ${0.2 * logoAlpha})`)
            coreGrad.addColorStop(1, 'transparent')
            ctx.fillStyle = coreGrad
            ctx.beginPath()
            ctx.arc(0, 0, 50 * s, 0, Math.PI * 2)
            ctx.fill()

            // Draw Exact Brand Logo Image (/logo.png) with enhanced visibility
            if (exactLogoImg.complete && exactLogoImg.naturalWidth > 0) {
              const imgW = 76 * s
              const imgH = 76 * s
              ctx.globalAlpha = Math.min(1, logoAlpha * 1.1)
              ctx.drawImage(exactLogoImg, -imgW / 2, -imgH / 2, imgW, imgH)
              ctx.globalAlpha = 1
            }

            ctx.restore()
          }

          ctx.restore()
        }

        // 3. Draw Synaptic Connection Lines in Deep Slate (#22493e) & Sage (#829F80)
        ctx.save()
        for (let e = 0; e < edges.length; e++) {
          const edge = edges[e]
          const p1 = pieces[edge.from]
          const p2 = pieces[edge.to]

          // Only connect if nodes have arrived close to the brain; logo edges only form as pieces enter
          const lineStrength = Math.min(p1.progress, p2.progress)
          const isLogoEdge = edge.from < LOGO_POINTS_COUNT && edge.to < LOGO_POINTS_COUNT
          const lineThreshold = isLogoEdge ? 0.82 : 0.45

          if (lineStrength > lineThreshold) {
            const lineAlpha = (lineStrength - lineThreshold) / (1 - lineThreshold)
            const depthAlpha = ((p1.screenZ + p2.screenZ) / 2 + baseRadius) / (baseRadius * 2)
            const finalLineAlpha = Math.max(0.12, Math.min(0.85, lineAlpha * (0.35 + depthAlpha * 0.65))) * overallAlpha

            if (isLogoEdge) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${finalLineAlpha * 0.95})`
              ctx.lineWidth = edge.from >= 13 && edge.from <= 26 ? 2.0 : 1.4
              ctx.shadowColor = 'rgba(130, 159, 128, 0.9)'
              ctx.shadowBlur = 6
            } else {
              // Forest Slate line matching Three.js linesMat (0x22493e)
              ctx.strokeStyle = `rgba(34, 73, 62, ${finalLineAlpha})`
              ctx.lineWidth = 1.0
              ctx.shadowBlur = 0
            }

            ctx.beginPath()
            ctx.moveTo(p1.screenX, p1.screenY)
            ctx.lineTo(p2.screenX, p2.screenY)
            ctx.stroke()
            ctx.shadowBlur = 0

            // Draw traveling synaptic pulse spark in pure white/sage
            edge.pulsePos = (edge.pulsePos + edge.pulseSpeed * 0.016) % 1
            if (lineStrength > 0.8) {
              const pulseX = p1.screenX + (p2.screenX - p1.screenX) * edge.pulsePos
              const pulseY = p1.screenY + (p2.screenY - p1.screenY) * edge.pulsePos
              ctx.fillStyle = `rgba(255, 255, 255, ${0.92 * overallAlpha})`
              ctx.shadowColor = '#829F80'
              ctx.shadowBlur = 6
              ctx.beginPath()
              ctx.arc(pulseX, pulseY, 1.8, 0, Math.PI * 2)
              ctx.fill()
              ctx.shadowBlur = 0
            }
          }
        }
        ctx.restore()

        // 4. Sort pieces back-to-front (Z-sorting) for realistic 3D depth
        const sortedIndices = pieces
          .map((_, idx) => idx)
          .sort((a, b) => pieces[a].screenZ - pieces[b].screenZ)

        // 5. Draw Shards & Neural Nodes using Theme Colors
        for (let k = 0; k < sortedIndices.length; k++) {
          const i = sortedIndices[k]
          const p = pieces[i]

          if (p.progress <= 0) continue

          ctx.save()
          ctx.translate(p.screenX, p.screenY)

          const depthScale = Math.max(0.4, p.projScale)
          const nodeAlpha = Math.min(1, p.progress * 1.5) * overallAlpha

          if (p.isShard && p.polygonVertices) {
            // Draw 3D Crystalline Polygonal Shard
            ctx.rotate(p.rotZ)
            ctx.scale(depthScale, depthScale)

            ctx.fillStyle = p.color
            ctx.strokeStyle = p.borderColor
            ctx.lineWidth = 1.1
            ctx.shadowColor = 'rgba(130, 159, 128, 0.4)'
            ctx.shadowBlur = p.progress > 0.7 ? 8 : 3

            ctx.beginPath()
            for (let v = 0; v < p.polygonVertices.length; v++) {
              const vert = p.polygonVertices[v]
              if (v === 0) ctx.moveTo(vert.x, vert.y)
              else ctx.lineTo(vert.x, vert.y)
            }
            ctx.closePath()
            ctx.fill()
            ctx.stroke()

            // Micro center core for each shard in white
            ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * nodeAlpha})`
            ctx.beginPath()
            ctx.arc(0, 0, 1.6, 0, Math.PI * 2)
            ctx.fill()
          } else {
            // Draw Neural Node Data Point in Deep Slate (#0f2922) / Pure White (#ffffff)
            ctx.scale(depthScale, depthScale)
            ctx.shadowColor = 'rgba(130, 159, 128, 0.6)'
            ctx.shadowBlur = 6

            // Outer soft sage halo
            ctx.fillStyle = `rgba(130, 159, 128, ${0.45 * nodeAlpha})`
            ctx.beginPath()
            ctx.arc(0, 0, p.size * 1.6, 0, Math.PI * 2)
            ctx.fill()

            // Node core: logo nodes are highlighted in crisp white
            const isWhite = i < LOGO_POINTS_COUNT || i % 3 === 0
            ctx.fillStyle = isWhite
              ? `rgba(255, 255, 255, ${0.98 * nodeAlpha})`
              : `rgba(15, 41, 34, ${0.95 * nodeAlpha})`
            ctx.beginPath()
            ctx.arc(0, 0, (i < LOGO_POINTS_COUNT ? p.size * 0.9 : p.size * 0.75), 0, Math.PI * 2)
            ctx.fill()
          }

          ctx.restore()
        }

        // 6. Synaptic Flash / Shockwave in Pure White & Sage (at 4.4s)
        if (elapsed > 4.35 && elapsed < finishTime) {
          const flashProgress = (elapsed - 4.35) / 0.45
          ctx.save()
          ctx.translate(currentBrain.x, currentBrain.y)

          const waveRadius = currentBrain.radius * (0.8 + flashProgress * 1.5)
          const waveAlpha = Math.max(0, (1 - flashProgress) * 0.75)
          const grad = ctx.createRadialGradient(0, 0, waveRadius * 0.7, 0, 0, waveRadius)
          grad.addColorStop(0, `rgba(255, 255, 255, ${waveAlpha * 0.45})`)
          grad.addColorStop(0.7, `rgba(130, 159, 128, ${waveAlpha * 0.75})`)
          grad.addColorStop(1, 'transparent')

          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(0, 0, waveRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      if (elapsed < finishTime) {
        animFrameRef.current = requestAnimationFrame(render)
      } else {
        handleFinish()
      }
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [handleFinish])

  return (
    <div
      className={`splash-root splash-${phase}`}
      aria-label="DaTaIcon intro"
      role="presentation"
    >
      {/* ── High-performance 3D Shatter & Neural Brain Canvas ── */}
      <canvas ref={canvasRef} className="splash-canvas" />

      {/* ── Central DOM Content (Pristine entrance, flies inside neural brain on shatter) ── */}
      <div
        className={`splash-center-content ${
          phase === 'shattering' || phase === 'fused' ? 'splash-center--shattered' : ''
        }`}
        style={{
          '--logo-target-x': `${targetOffset.x}px`,
          '--logo-target-y': `${targetOffset.y}px`
        } as React.CSSProperties}
      >
        {/* Brand Emblem */}
        <div className="splash-emblem-wrap">
          <DaTaIconEmblem size={114} className="splash-emblem" />
        </div>

        {/* Wordmark: "DaTaIcon" */}
        <div className="splash-wordmark" aria-label="DaTaIcon">
          {'DaTaIcon'.split('').map((ch, i) => (
            <span
              key={i}
              className="splash-letter"
              style={{
                animationDelay: `${0.45 + i * 0.05}s`
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <div className="splash-tagline">
          <span className="splash-tagline-line" />
          <span className="splash-tagline-text">SINCE 2026</span>
          <span className="splash-tagline-line" />
        </div>
      </div>

      {/* ── Skip Button ───────────────────────────────────────── */}
      <button
        type="button"
        className="splash-skip-btn"
        onClick={handleFinish}
        aria-label="Skip intro"
      >
        Skip ✕
      </button>
    </div>
  )
}

export default SplashScreen
