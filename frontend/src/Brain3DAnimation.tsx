import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { BrainIcon, ShieldCheckIcon, CpuIcon, ZapIcon } from './icons'

export type AnimationMode = 'brain' | 'privacy' | 'matrix'

export interface AgentNode {
  id: string
  number: string
  title: string
  role: string
  orbitIndex: number
  angleOffset: number
  description: string
  capabilities: string[]
  color?: string
}

export const DATAPILOT_AGENTS: AgentNode[] = [
  {
    id: 'strategy',
    number: '01',
    title: 'STRATEGY',
    role: 'AI Data Strategist',
    orbitIndex: 0,
    angleOffset: 0.1,
    description: 'Translates high-level business goals directly into profitable ML targets. Aligns predictive accuracy with measurable enterprise revenue.',
    capabilities: ['Problem Formulation & ROI Alignment', '+38% Faster Model Validation', 'Guaranteed Business KPI Targets']
  },
  {
    id: 'data-agent',
    number: '02',
    title: 'DATA AGENT',
    role: 'Zero-Knowledge Engine',
    orbitIndex: 1,
    angleOffset: 0.9,
    description: 'Profiles and transforms customer data strictly within customer VPC. Zero raw records ever leave your private network boundary.',
    capabilities: ['Zero Raw Data Egress ($0 Liability)', 'Air-Gapped In-VPC Profiling', 'Local Differential Privacy (ε=0.1)']
  },
  {
    id: 'marketing',
    number: '03',
    title: 'GOVERNANCE',
    role: 'Compliance & Audit Guard',
    orbitIndex: 2,
    angleOffset: 1.7,
    description: 'Guarantees turnkey compliance for General Counsel and CISOs. Enforces immutable audit logging and strict tenant isolation.',
    capabilities: ['Tamper-Proof Audit Trails', 'Turnkey SOC 2, HIPAA & GDPR', 'Strict Multi-Tenant Access Governance']
  },
  {
    id: 'sales',
    number: '04',
    title: 'ML PIPELINE',
    role: 'Autonomous AutoML Agent',
    orbitIndex: 0,
    angleOffset: 2.5,
    description: 'Orchestrates multi-model Bayesian hyperparameter search across CatBoost, XGBoost, and LightGBM models in hours instead of quarters.',
    capabilities: ['10x Faster Time-to-Production', 'Bayesian Search & Model Ranking', 'Automated Cross-Validation Matrix']
  },
  {
    id: 'explainability',
    number: '05',
    title: 'EXPLAINABILITY',
    role: 'SHAP & Provenance Agent',
    orbitIndex: 1,
    angleOffset: 3.3,
    description: 'Calculates exact TreeSHAP attributions and What-If counterfactuals, providing transparent mathematical proof that wins executive trust.',
    capabilities: ['Deterministic TreeSHAP Attribution', 'Audit-Ready Executive Proof', 'Non-Causal Guardrails']
  },
  {
    id: 'gtm',
    number: '06',
    title: 'DEPLOYMENT',
    role: 'Zero-Trust Serving Agent',
    orbitIndex: 2,
    angleOffset: 4.1,
    description: 'Packages models into signed containers for sub-5ms real-time scoring directly within your private edge or cloud infrastructure.',
    capabilities: ['Sub-5ms Real-Time Inference', 'Cryptographically Signed Rollouts', 'Zero Cloud Egress Invoices']
  },
  {
    id: 'finance',
    number: '07',
    title: 'ANALYTICS',
    role: 'Executive Intelligence Agent',
    orbitIndex: 0,
    angleOffset: 4.9,
    description: 'Synthesizes C-suite audit dossiers, ROI impact summaries, and board presentations, saving 100+ reporting hours quarterly.',
    capabilities: ['Boardroom-Ready ROI Synthesis', 'Quantified Revenue & Cost Metrics', 'Transparent Mathematical Provenance']
  },
  {
    id: 'technology',
    number: '08',
    title: 'MONITORING',
    role: 'Continuous Health Sentinel',
    orbitIndex: 1,
    angleOffset: 5.7,
    description: 'Guards recurring revenue 24/7 by detecting feature drift, concept decay, and inference latency violations with automated alerting.',
    capabilities: ['24/7 Automated Revenue Guardrails', 'Kolmogorov-Smirnov & PSI Drift Alerts', '99.99% Availability & SLA Protection']
  }
]

export const ENTERPRISE_AGENTS: AgentNode[] = [
  {
    id: 'e-strategy',
    number: '01',
    title: 'STRATEGY',
    role: 'AI Strategist',
    orbitIndex: 0,
    angleOffset: 0.1,
    description: 'Simulates corporate strategic roadmaps, competitive positioning, and M&A scenarios with 100% board confidentiality. Zero strategic intelligence ever leaks to third-party models.',
    capabilities: ['Zero-Egress Board Strategy Enclave', 'Air-Gapped M&A & Scenario Modeling', 'Proprietary IP & Roadmap Sovereignty']
  },
  {
    id: 'e-product',
    number: '02',
    title: 'PRODUCT',
    role: 'AI Product Manager',
    orbitIndex: 1,
    angleOffset: 0.9,
    description: 'Analyzes user telemetry and customer usage patterns to prioritize high-impact features with differential privacy noise, ensuring zero customer identifiers leave your cloud.',
    capabilities: ['Differential Privacy Telemetry (ε=0.1)', 'Zero Raw Customer Record Retention', 'Anonymized Feature Behavioral Aggregation']
  },
  {
    id: 'e-marketing',
    number: '03',
    title: 'MARKETING',
    role: 'AI Marketer',
    orbitIndex: 2,
    angleOffset: 1.7,
    description: 'Powers customer segmentation, conversion modeling, and campaign attribution without exposing sensitive email lists, names, or contact data outside your enterprise.',
    capabilities: ['Pseudonymized Audience Segmentation', 'Zero Customer PII Exposure', 'Turnkey GDPR & CCPA Consumer Privacy']
  },
  {
    id: 'e-sales',
    number: '04',
    title: 'SALES',
    role: 'AI Sales Agent',
    orbitIndex: 0,
    angleOffset: 2.5,
    description: 'Scores deal velocity and pipeline expansion opportunities directly against your internal CRM records with strict tenant isolation. No sales data trains external public LLMs.',
    capabilities: ['Air-Gapped CRM Enclave Processing', 'No Public Model Training on Sales Data', 'Strict Tenant-Bound Pipeline Privacy']
  },
  {
    id: 'e-gtm',
    number: '06',
    title: 'GTM',
    role: 'GTM Agent',
    orbitIndex: 2,
    angleOffset: 4.1,
    description: 'Choreographs multi-regional product launches, pricing changes, and sales enablement within an encrypted, isolated boundary, preventing leaks of unreleased products.',
    capabilities: ['Confidential Unreleased Product Security', 'VPC-Isolated Launch Intelligence', 'Zero External Egress for Partner Data']
  },
  {
    id: 'e-finance',
    number: '07',
    title: 'FINANCE',
    role: 'AI Analyst',
    orbitIndex: 0,
    angleOffset: 4.9,
    description: 'Forecasts cash runway, customer ARR expansion, and unit economics on encrypted ledgers. Payroll, revenue, and banking numbers never leave your private accounting perimeter.',
    capabilities: ['Encrypted In-Memory Ledger Modeling', 'Air-Gapped P&L & Payroll Privacy', 'Zero Financial Data Egress or Exposure']
  },
  {
    id: 'e-technology',
    number: '08',
    title: 'TECHNOLOGY',
    role: 'AI Engineer',
    orbitIndex: 1,
    angleOffset: 5.7,
    description: 'Synthesizes clean microservice architectures and automated verification tests without ever exporting proprietary source code, credentials, or architecture diagrams to public cloud servers.',
    capabilities: ['Zero Proprietary Code or IP Egress', 'Private Container Sandbox Execution', 'FIPS 140-3 Cryptographic Integrity']
  }
]

interface ProjectedNode {
  node: AgentNode
  x: number
  y: number
  scale: number
  opacity: number
  zIndex: number
  inFront: boolean
}

// Check for WebGL capability safely in all environments (including test/jsdom)
function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return Boolean(gl && gl instanceof WebGLRenderingContext)
  } catch {
    return false
  }
}

export default function Brain3DAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(null)
  const [hoveredAgent, setHoveredAgent] = useState<AgentNode | null>(null)
  const [activeSet, setActiveSet] = useState<'datapilot' | 'enterprise'>('datapilot')
  const [animationMode, setAnimationMode] = useState<AnimationMode>('brain')
  const [isRotating, setIsRotating] = useState(true)
  const [rotationSpeed, setRotationSpeed] = useState(1)
  const [projectedNodes, setProjectedNodes] = useState<ProjectedNode[]>([])
  const [synapsePulseTrigger, setSynapsePulseTrigger] = useState(0)

  const animationModeRef = useRef<AnimationMode>(animationMode)
  useEffect(() => {
    animationModeRef.current = animationMode
  }, [animationMode])

  const agents = useMemo(() => {
    return activeSet === 'datapilot' ? DATAPILOT_AGENTS : ENTERPRISE_AGENTS
  }, [activeSet])

  // Mouse drag interaction state
  const isDraggingRef = useRef(false)
  const previousMousePositionRef = useRef({ x: 0, y: 0 })
  const rotationAngleRef = useRef({ x: 0.15, y: -0.35 })
  const targetRotationRef = useRef({ x: 0.15, y: -0.35 })
  const autoRotateSpeedRef = useRef(0.0035)

  useEffect(() => {
    autoRotateSpeedRef.current = isRotating ? 0.0035 * rotationSpeed : 0
  }, [isRotating, rotationSpeed])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const hasWebGL = checkWebGLSupport()
    if (!hasWebGL) {
      // In non-WebGL environments (like jsdom/unit tests), compute deterministic projected positions
      const width = container.clientWidth || 640
      const height = container.clientHeight || 520
      const staticProjected: ProjectedNode[] = agents.map((agent, i) => {
        const angle = agent.angleOffset + (i * Math.PI) / 4
        const rx = width * 0.38
        const ry = height * 0.32
        const x = width / 2 + Math.cos(angle) * rx
        const y = height / 2 + Math.sin(angle) * ry
        return {
          node: agent,
          x,
          y,
          scale: 1,
          opacity: 1,
          zIndex: 10,
          inFront: true
        }
      })
      setProjectedNodes(staticProjected)
      return
    }

    // Initialize Three.js scene
    const scene = new THREE.Scene()
    const width = container.clientWidth || 640
    const height = container.clientHeight || 520

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
    camera.position.set(0, 0.35, 7.2)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height)
      renderer.setClearColor(0x000000, 0)
    } catch {
      return
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0x00d2ff, 2.5)
    keyLight.position.set(5, 6, 6)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x10b981, 1.8)
    fillLight.position.set(-6, -3, -4)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0x6366f1, 2.2)
    rimLight.position.set(0, -6, 5)
    scene.add(rimLight)

    // Master central pivot group
    const masterGroup = new THREE.Group()
    scene.add(masterGroup)

    // =========================================================================
    // 1. ANIMATION MODE: 3D NEURAL BRAIN
    // =========================================================================
    const brainSubGroup = new THREE.Group()
    masterGroup.add(brainSubGroup)

    const pointCount = 650
    const brainPoints: THREE.Vector3[] = []

    for (let i = 0; i < pointCount; i++) {
      const u = Math.random() * Math.PI * 2
      const v = (Math.random() - 0.5) * Math.PI
      const isRightHemisphere = Math.random() > 0.5

      let rx = 1.15
      let ry = 1.05
      let rz = 1.45

      let x = Math.cos(u) * Math.cos(v) * rx
      let y = Math.sin(v) * ry
      let z = Math.sin(u) * Math.cos(v) * rz

      if (z > 0) {
        y += 0.15 * Math.sin(z)
        z *= 1.1
      }
      if (z < 0) {
        y *= 0.95
        x *= 0.9
      }
      if (y < 0 && z > -0.5 && z < 0.8) {
        x *= 1.18
        y += 0.1
      }
      if (y < -0.4 && z < -0.2) {
        z -= 0.15
        x *= 0.75
      }

      const freq = 12.0
      const noise =
        Math.sin(x * freq) * Math.cos(y * freq) * Math.sin(z * freq) * 0.08 +
        Math.sin(y * 20.0) * 0.04
      const disp = 1.0 + noise

      x *= disp
      y *= disp
      z *= disp

      const fissureGap = 0.14
      if (isRightHemisphere) {
        x = Math.abs(x) + fissureGap
      } else {
        x = -Math.abs(x) - fissureGap
      }

      brainPoints.push(new THREE.Vector3(x, y, z))
    }

    const pointsGeo = new THREE.BufferGeometry().setFromPoints(brainPoints)
    const pointsMat = new THREE.PointsMaterial({
      color: 0x0f2922,
      size: 0.052,
      transparent: true,
      opacity: 0.85
    })
    const pointsMesh = new THREE.Points(pointsGeo, pointsMat)
    brainSubGroup.add(pointsMesh)

    const lineIndices: number[] = []
    const maxConnectionDistance = 0.38
    for (let i = 0; i < pointCount; i++) {
      let connections = 0
      for (let j = i + 1; j < pointCount; j++) {
        const dist = brainPoints[i].distanceTo(brainPoints[j])
        if (dist < maxConnectionDistance && connections < 4) {
          lineIndices.push(i, j)
          connections++
        }
      }
    }

    const linesGeo = new THREE.BufferGeometry().setFromPoints(brainPoints)
    linesGeo.setIndex(lineIndices)
    const linesMat = new THREE.LineBasicMaterial({
      color: 0x22493e,
      transparent: true,
      opacity: 0.28,
      linewidth: 1
    })
    const linesMesh = new THREE.LineSegments(linesGeo, linesMat)
    brainSubGroup.add(linesMesh)

    const cortexGeo = new THREE.IcosahedronGeometry(1.4, 4)
    const posAttr = cortexGeo.attributes.position
    for (let i = 0; i < posAttr.count; i++) {
      let vx = posAttr.getX(i)
      let vy = posAttr.getY(i)
      let vz = posAttr.getZ(i)

      vz *= 1.25
      vy *= 0.95
      vx *= 0.98

      const hemSplit = 0.12 * Math.sign(vx) * (1 - Math.exp(-Math.abs(vx) * 3))
      vx += hemSplit

      const fold = Math.sin(vx * 10) * Math.cos(vy * 10) * Math.sin(vz * 10) * 0.06
      vx += fold
      vy += fold
      vz += fold

      posAttr.setXYZ(i, vx, vy, vz)
    }
    cortexGeo.computeVertexNormals()

    const cortexMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6f4ef,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.72,
      ior: 1.45,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
    const cortexMesh = new THREE.Mesh(cortexGeo, cortexMat)
    brainSubGroup.add(cortexMesh)

    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0x1d4739,
      wireframe: true,
      transparent: true,
      opacity: 0.16
    })
    const wireframeMesh = new THREE.Mesh(cortexGeo, wireframeMat)
    brainSubGroup.add(wireframeMesh)

    const corePulseCount = 35
    const pulsePositions = new Float32Array(corePulseCount * 3)
    const pulseProgress = new Float32Array(corePulseCount)
    const pulseIndicesA = new Int32Array(corePulseCount)
    const pulseIndicesB = new Int32Array(corePulseCount)

    for (let p = 0; p < corePulseCount; p++) {
      pulseIndicesA[p] = Math.floor(Math.random() * pointCount)
      pulseIndicesB[p] = Math.floor(Math.random() * pointCount)
      pulseProgress[p] = Math.random()
    }

    const pulseGeo = new THREE.BufferGeometry()
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3))
    const pulseMat = new THREE.PointsMaterial({
      color: 0x10b981,
      size: 0.095,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    })
    const pulseMesh = new THREE.Points(pulseGeo, pulseMat)
    brainSubGroup.add(pulseMesh)

    // =========================================================================
    // 2. ANIMATION MODE: 3D PRIVACY SHIELD SPHERE (ZERO-KNOWLEDGE ENCLAVE)
    // =========================================================================
    const privacySubGroup = new THREE.Group()
    masterGroup.add(privacySubGroup)

    // Central glowing encrypted core
    const coreShieldGeo = new THREE.IcosahedronGeometry(0.85, 2)
    const coreShieldMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x064e3b,
      roughness: 0.25,
      metalness: 0.8,
      transparent: true,
      opacity: 0.75
    })
    const coreShieldMesh = new THREE.Mesh(coreShieldGeo, coreShieldMat)
    privacySubGroup.add(coreShieldMesh)

    // Outer geodesic cryptographic barrier cage
    const outerShieldGeo = new THREE.IcosahedronGeometry(1.6, 2)
    const outerShieldWireMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    })
    const outerShieldWireMesh = new THREE.Mesh(outerShieldGeo, outerShieldWireMat)
    privacySubGroup.add(outerShieldWireMesh)

    // Rotating latitude & longitude cybernetic security rings
    const ringMat1 = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.55 })
    const ringMat2 = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
    const ringMat3 = new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.55 })

    const privacyRingGeo1 = new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 1.85, 1.85, 0, Math.PI * 2, false, 0).getPoints(80).map((p) => new THREE.Vector3(p.x, p.y, 0))
    )
    const privacyRingMesh1 = new THREE.Line(privacyRingGeo1, ringMat1)
    privacySubGroup.add(privacyRingMesh1)

    const privacyRingGeo2 = new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 2.0, 2.0, 0, Math.PI * 2, false, 0).getPoints(80).map((p) => new THREE.Vector3(p.x, 0, p.y))
    )
    const privacyRingMesh2 = new THREE.Line(privacyRingGeo2, ringMat2)
    privacySubGroup.add(privacyRingMesh2)

    const privacyRingGeo3 = new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 1.9, 1.9, 0, Math.PI * 2, false, 0).getPoints(80).map((p) => new THREE.Vector3(0, p.x, p.y))
    )
    const privacyRingMesh3 = new THREE.Line(privacyRingGeo3, ringMat3)
    privacySubGroup.add(privacyRingMesh3)

    // Perimeter boundary firewall particles
    const privacyParticlesCount = 120
    const privacyParticlePositions = new Float32Array(privacyParticlesCount * 3)
    for (let i = 0; i < privacyParticlesCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = (Math.random() - 0.5) * Math.PI
      const r = 1.65 + (Math.random() - 0.5) * 0.2
      privacyParticlePositions[i * 3] = r * Math.cos(theta) * Math.cos(phi)
      privacyParticlePositions[i * 3 + 1] = r * Math.sin(phi)
      privacyParticlePositions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi)
    }
    const privacyParticleGeo = new THREE.BufferGeometry()
    privacyParticleGeo.setAttribute('position', new THREE.BufferAttribute(privacyParticlePositions, 3))
    const privacyParticleMat = new THREE.PointsMaterial({
      color: 0x34d399,
      size: 0.05,
      transparent: true,
      opacity: 0.8
    })
    const privacyParticleMesh = new THREE.Points(privacyParticleGeo, privacyParticleMat)
    privacySubGroup.add(privacyParticleMesh)

    // =========================================================================
    // 3. ANIMATION MODE: 3D SYNAPTIC NEURAL MATRIX & PIPELINE LATTICE
    // =========================================================================
    const matrixSubGroup = new THREE.Group()
    masterGroup.add(matrixSubGroup)

    const layerXPositions = [-2.1, -0.7, 0.7, 2.1]
    const layerNodeCounts = [5, 7, 7, 4]
    const matrixNodes: THREE.Vector3[] = []
    const matrixLayerIndex: number[] = []

    layerXPositions.forEach((lx, layerIdx) => {
      const count = layerNodeCounts[layerIdx]
      const spread = 2.4
      for (let n = 0; n < count; n++) {
        const ny = ((n / (count - 1)) - 0.5) * spread
        const nz = (Math.random() - 0.5) * 0.6
        matrixNodes.push(new THREE.Vector3(lx, ny, nz))
        matrixLayerIndex.push(layerIdx)
      }
    })

    const matrixPointsGeo = new THREE.BufferGeometry().setFromPoints(matrixNodes)
    const matrixPointsMat = new THREE.PointsMaterial({
      color: 0x0284c7,
      size: 0.08,
      transparent: true,
      opacity: 0.95
    })
    const matrixPointsMesh = new THREE.Points(matrixPointsGeo, matrixPointsMat)
    matrixSubGroup.add(matrixPointsMesh)

    const matrixLineIndices: number[] = []
    let offsetA = 0
    for (let l = 0; l < layerNodeCounts.length - 1; l++) {
      const countA = layerNodeCounts[l]
      const countB = layerNodeCounts[l + 1]
      const offsetB = offsetA + countA
      for (let i = 0; i < countA; i++) {
        for (let j = 0; j < countB; j++) {
          matrixLineIndices.push(offsetA + i, offsetB + j)
        }
      }
      offsetA = offsetB
    }

    const matrixLinesGeo = new THREE.BufferGeometry().setFromPoints(matrixNodes)
    matrixLinesGeo.setIndex(matrixLineIndices)
    const matrixLinesMat = new THREE.LineBasicMaterial({
      color: 0x1e3a8a,
      transparent: true,
      opacity: 0.16,
      linewidth: 1
    })
    const matrixLinesMesh = new THREE.LineSegments(matrixLinesGeo, matrixLinesMat)
    matrixSubGroup.add(matrixLinesMesh)

    // Flowing signals traveling forward between layers
    const signalCount = 28
    const signalProgress = new Float32Array(signalCount)
    const signalEdgeA = new Int32Array(signalCount)
    const signalEdgeB = new Int32Array(signalCount)
    const numMatrixEdges = matrixLineIndices.length / 2

    for (let s = 0; s < signalCount; s++) {
      const edge = Math.floor(Math.random() * numMatrixEdges)
      signalEdgeA[s] = matrixLineIndices[edge * 2]
      signalEdgeB[s] = matrixLineIndices[edge * 2 + 1]
      signalProgress[s] = Math.random()
    }

    const signalGeo = new THREE.BufferGeometry()
    const signalPos = new Float32Array(signalCount * 3)
    signalGeo.setAttribute('position', new THREE.BufferAttribute(signalPos, 3))
    const signalMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.1,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    })
    const signalMesh = new THREE.Points(signalGeo, signalMat)
    matrixSubGroup.add(signalMesh)

    // Central revolving tensor ring
    const tensorRingGeo = new THREE.TorusGeometry(1.6, 0.02, 16, 80)
    const tensorRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.45 })
    const tensorRingMesh = new THREE.Mesh(tensorRingGeo, tensorRingMat)
    tensorRingMesh.rotation.x = Math.PI / 2
    matrixSubGroup.add(tensorRingMesh)

    // =========================================================================
    // 3D ORBITAL ELLIPSES & FLOATING PARTICLES
    // =========================================================================
    const orbitDefinitions = [
      { rx: 2.7, ry: 2.1, rotX: 0.45, rotY: -0.25, rotZ: 0.35, color: 0x4a7566 },
      { rx: 2.9, ry: 2.3, rotX: -0.55, rotY: 0.35, rotZ: -0.4, color: 0x3d6657 },
      { rx: 3.1, ry: 2.5, rotX: 0.85, rotY: -0.7, rotZ: 0.65, color: 0x588574 }
    ]

    const orbitGroups: THREE.Group[] = []
    orbitDefinitions.forEach((def) => {
      const oGroup = new THREE.Group()
      oGroup.rotation.set(def.rotX, def.rotY, def.rotZ)

      const curve = new THREE.EllipseCurve(0, 0, def.rx, def.ry, 0, 2 * Math.PI, false, 0)
      const curvePoints = curve.getPoints(120)
      const curveGeo = new THREE.BufferGeometry().setFromPoints(
        curvePoints.map((p) => new THREE.Vector3(p.x, p.y, 0))
      )
      const curveMat = new THREE.LineBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.38,
        linewidth: 1
      })
      const curveLine = new THREE.Line(curveGeo, curveMat)
      oGroup.add(curveLine)

      const streamCount = 18
      const streamGeo = new THREE.BufferGeometry()
      const streamPos = new Float32Array(streamCount * 3)
      streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3))
      const streamMat = new THREE.PointsMaterial({
        color: 0x0f3e30,
        size: 0.045,
        transparent: true,
        opacity: 0.65
      })
      const streamPoints = new THREE.Points(streamGeo, streamMat)
      oGroup.add(streamPoints)

      scene.add(oGroup)
      orbitGroups.push(oGroup)
    })

    // Animation loop
    let animationFrameId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const time = clock.getElapsedTime()

      // Toggle group visibility according to selected animationMode
      const currentMode = animationModeRef.current
      brainSubGroup.visible = currentMode === 'brain'
      privacySubGroup.visible = currentMode === 'privacy'
      matrixSubGroup.visible = currentMode === 'matrix'

      // Smooth rotation dampening
      if (isRotating && !isDraggingRef.current) {
        targetRotationRef.current.y += autoRotateSpeedRef.current
      }

      rotationAngleRef.current.x += (targetRotationRef.current.x - rotationAngleRef.current.x) * 0.08
      rotationAngleRef.current.y += (targetRotationRef.current.y - rotationAngleRef.current.y) * 0.08

      masterGroup.rotation.x = rotationAngleRef.current.x
      masterGroup.rotation.y = rotationAngleRef.current.y

      // Organic breathing wave
      const breathe = 1 + Math.sin(time * 1.8) * 0.015
      masterGroup.scale.set(breathe, breathe, breathe)

      // Update Mode 1: Brain pulses
      if (brainSubGroup.visible) {
        const pulseAttr = pulseGeo.attributes.position as THREE.BufferAttribute
        for (let p = 0; p < corePulseCount; p++) {
          pulseProgress[p] += delta * (0.8 + (p % 4) * 0.4)
          if (pulseProgress[p] > 1.0) {
            pulseProgress[p] = 0
            pulseIndicesA[p] = Math.floor(Math.random() * pointCount)
            pulseIndicesB[p] = Math.floor(Math.random() * pointCount)
          }
          const pA = brainPoints[pulseIndicesA[p]]
          const pB = brainPoints[pulseIndicesB[p]]
          if (pA && pB) {
            const t = pulseProgress[p]
            pulseAttr.setXYZ(
              p,
              pA.x + (pB.x - pA.x) * t,
              pA.y + (pB.y - pA.y) * t,
              pA.z + (pB.z - pA.z) * t
            )
          }
        }
        pulseAttr.needsUpdate = true
      }

      // Update Mode 2: Privacy Shield
      if (privacySubGroup.visible) {
        privacyRingMesh1.rotation.z += 0.012
        privacyRingMesh2.rotation.y += 0.015
        privacyRingMesh3.rotation.x += 0.01
        outerShieldWireMesh.rotation.y -= 0.005
        coreShieldMesh.rotation.y += 0.008
      }

      // Update Mode 3: Synaptic Matrix
      if (matrixSubGroup.visible) {
        tensorRingMesh.rotation.z += 0.02
        const sigAttr = signalGeo.attributes.position as THREE.BufferAttribute
        for (let s = 0; s < signalCount; s++) {
          signalProgress[s] += delta * (0.9 + (s % 3) * 0.5)
          if (signalProgress[s] > 1.0) {
            signalProgress[s] = 0
            const edge = Math.floor(Math.random() * numMatrixEdges)
            signalEdgeA[s] = matrixLineIndices[edge * 2]
            signalEdgeB[s] = matrixLineIndices[edge * 2 + 1]
          }
          const nA = matrixNodes[signalEdgeA[s]]
          const nB = matrixNodes[signalEdgeB[s]]
          if (nA && nB) {
            const t = signalProgress[s]
            sigAttr.setXYZ(
              s,
              nA.x + (nB.x - nA.x) * t,
              nA.y + (nB.y - nA.y) * t,
              nA.z + (nB.z - nA.z) * t
            )
          }
        }
        sigAttr.needsUpdate = true
      }

      // Update orbiting stream particles
      orbitGroups.forEach((oGroup, idx) => {
        const streamMesh = oGroup.children[1] as THREE.Points
        if (streamMesh) {
          const sPos = streamMesh.geometry.attributes.position as THREE.BufferAttribute
          const def = orbitDefinitions[idx]
          for (let s = 0; s < 18; s++) {
            const phase = ((time * 0.15 + s / 18) % 1) * Math.PI * 2
            sPos.setXYZ(s, Math.cos(phase) * def.rx, Math.sin(phase) * def.ry, 0)
          }
          sPos.needsUpdate = true
        }
      })

      // Project 3D agent nodes to 2D screen space
      const currentWidth = container.clientWidth || 640
      const currentHeight = container.clientHeight || 520
      const projected: ProjectedNode[] = []

      agents.forEach((agent) => {
        const def = orbitDefinitions[agent.orbitIndex % orbitDefinitions.length]
        const orbitSpeed = 0.08 * (agent.orbitIndex % 2 === 0 ? 1 : -0.85)
        const angle = agent.angleOffset + time * orbitSpeed

        const localVec = new THREE.Vector3(Math.cos(angle) * def.rx, Math.sin(angle) * def.ry, 0)
        const euler = new THREE.Euler(def.rotX, def.rotY, def.rotZ, 'XYZ')
        localVec.applyEuler(euler)

        const screenPos = localVec.clone().project(camera)
        const x = ((screenPos.x + 1) * currentWidth) / 2
        const y = ((-screenPos.y + 1) * currentHeight) / 2
        const inFront = screenPos.z < 0.98

        const depthFactor = Math.max(0.2, (1.0 - screenPos.z) * 1.5)
        const scale = inFront ? Math.min(1.05, 0.85 + depthFactor * 0.25) : 0.8
        const opacity = inFront ? Math.min(1.0, 0.65 + depthFactor * 0.35) : 0.42
        const zIndex = inFront ? 10 : 2

        projected.push({
          node: agent,
          x,
          y,
          scale,
          opacity,
          zIndex,
          inFront
        })
      })

      setProjectedNodes(projected)
      renderer.render(scene, camera)
    }

    animate()

    const handleResize = () => {
      if (!container || !renderer) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      renderer.dispose()
      scene.clear()
    }
  }, [agents, isRotating, rotationSpeed])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const deltaX = e.clientX - previousMousePositionRef.current.x
    const deltaY = e.clientY - previousMousePositionRef.current.y

    targetRotationRef.current.y += deltaX * 0.008
    targetRotationRef.current.x = Math.max(
      -0.9,
      Math.min(0.9, targetRotationRef.current.x + deltaY * 0.008)
    )

    previousMousePositionRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true
      previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return
    const deltaX = e.touches[0].clientX - previousMousePositionRef.current.x
    const deltaY = e.touches[0].clientY - previousMousePositionRef.current.y

    targetRotationRef.current.y += deltaX * 0.009
    targetRotationRef.current.x = Math.max(
      -0.9,
      Math.min(0.9, targetRotationRef.current.x + deltaY * 0.009)
    )

    previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const handleTriggerSynapse = () => {
    setSynapsePulseTrigger((prev) => prev + 1)
  }

  const handleResetView = () => {
    targetRotationRef.current = { x: 0.15, y: -0.35 }
  }

  return (
    <div
      className="brain-3d-stage"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="3D Interactive Neural Architecture Visualizer"
    >
      <div className="brain-radial-glow" />
      <canvas ref={canvasRef} className="brain-canvas" />

      {/* Sighted Minimal Arrow Switcher (Non-tech, Clean & Professional for Layman Users) */}
      <div className="brain-arrow-switcher" aria-label="Perspective Switcher">
        <button
          type="button"
          className="arrow-nav-btn prev-arrow"
          onClick={() => setActiveSet(activeSet === 'datapilot' ? 'enterprise' : 'datapilot')}
          aria-label="Previous Perspective"
          title="Switch perspective"
        >
          ←
        </button>

        <div className="arrow-switcher-label">
          <span className="switcher-step-idx">
            {activeSet === 'datapilot' ? '01 / 02 · PLATFORM PURPOSE' : '02 / 02 · DATA PRIVACY'}
          </span>
          <span className="switcher-title">
            {activeSet === 'datapilot' ? 'Platform Purpose & Benefits' : 'Enterprise AI Team & Isolation'}
          </span>
        </div>

        <button
          type="button"
          className="arrow-nav-btn next-arrow"
          onClick={() => setActiveSet(activeSet === 'datapilot' ? 'enterprise' : 'datapilot')}
          aria-label="Next Perspective"
          title="Switch perspective"
        >
          →
        </button>
      </div>

      {/* Accessible DOM Controls for Screen Readers and Automated Tests */}
      <div className="sr-only-test-controls" aria-label="Accessible 3D Controls">
        <div role="tablist" aria-label="3D Visual Animation Styles">
          <button
            type="button"
            className={`pill-btn ${animationMode === 'brain' ? 'active' : ''}`}
            onClick={() => setAnimationMode('brain')}
            role="tab"
            aria-selected={animationMode === 'brain'}
          >
            <span>3D Brain</span>
          </button>
          <button
            type="button"
            className={`pill-btn ${animationMode === 'privacy' ? 'active' : ''}`}
            onClick={() => setAnimationMode('privacy')}
            role="tab"
            aria-selected={animationMode === 'privacy'}
          >
            <span>Privacy Shield</span>
          </button>
          <button
            type="button"
            className={`pill-btn ${animationMode === 'matrix' ? 'active' : ''}`}
            onClick={() => setAnimationMode('matrix')}
            role="tab"
            aria-selected={animationMode === 'matrix'}
          >
            <span>Synaptic Matrix</span>
          </button>
        </div>

        <div role="tablist" aria-label="Agent Role Presets">
          <button
            type="button"
            className={`pill-btn-sm ${activeSet === 'datapilot' ? 'active' : ''}`}
            onClick={() => setActiveSet('datapilot')}
            role="tab"
            aria-selected={activeSet === 'datapilot'}
          >
            DaTaIcon Platform Purpose
          </button>
          <button
            type="button"
            className={`pill-btn-sm ${activeSet === 'enterprise' ? 'active' : ''}`}
            onClick={() => setActiveSet('enterprise')}
            role="tab"
            aria-selected={activeSet === 'enterprise'}
          >
            Enterprise AI Team
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsRotating(!isRotating)}
          aria-label={isRotating ? 'Pause 3D rotation' : 'Play 3D rotation'}
        >
          {isRotating ? 'Pause 3D rotation' : 'Play 3D rotation'}
        </button>
        <button
          type="button"
          onClick={handleResetView}
          aria-label="Reset rotation angle"
        >
          Reset rotation angle
        </button>
        <button
          type="button"
          onClick={handleTriggerSynapse}
        >
          Pulse
        </button>
      </div>

      {/* Projected 3D Agent Badges */}
      <div className="projected-nodes-overlay">
        {projectedNodes.map(({ node, x, y, scale, opacity, zIndex, inFront }) => {
          const isSelected = selectedAgent?.id === node.id
          const isHovered = hoveredAgent?.id === node.id
          const highlight = isSelected || isHovered

          return (
            <div
              key={node.id}
              className={`agent-node-badge ${highlight ? 'is-highlighted' : ''} ${
                !inFront ? 'is-behind' : ''
              }`}
              style={{
                transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${
                  highlight ? scale * 1.12 : scale
                })`,
                opacity: highlight ? 1 : opacity,
                zIndex: highlight ? 50 : zIndex
              }}
              onMouseEnter={() => setHoveredAgent(node)}
              onMouseLeave={() => setHoveredAgent(null)}
              onClick={() => setSelectedAgent(selectedAgent?.id === node.id ? null : node)}
              tabIndex={0}
              role="button"
              aria-label={`${node.number} ${node.title} - ${node.role}`}
            >
              <div className="target-reticle">
                <span className="target-ring-outer" />
                <span className="target-ring-inner" />
                <span className="target-dot" />
              </div>

              <div className="badge-content">
                <span className="badge-number">{node.number}</span>
                <span className="badge-title">{node.title}</span>
                <span className="badge-role">{node.role}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Agent Detail Modal / Drawer */}
      {selectedAgent && (
        <div className="agent-detail-drawer" role="dialog" aria-modal="true">
          <div className="drawer-header">
            <div className="drawer-tag">
              <span className="badge-number">{selectedAgent.number}</span>
              <strong>{selectedAgent.title}</strong>
              <span className="drawer-mode-indicator">
                {activeSet === 'datapilot' ? '• Platform Benefit' : '• Data Privacy Guarantee'}
              </span>
            </div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setSelectedAgent(null)}
              aria-label="Close details"
            >
              ✕
            </button>
          </div>
          <h4 className="drawer-role">{selectedAgent.role}</h4>
          <p className="drawer-description">{selectedAgent.description}</p>
          <div className="drawer-capabilities">
            <span className="cap-label">
              {activeSet === 'datapilot'
                ? 'Key Platform Capabilities: Business Benefits'
                : 'Key Platform Capabilities: Enterprise Data Privacy'}
            </span>
            <div className="drawer-assurance-pill">
              {activeSet === 'datapilot' ? (
                <span className="assurance-tag roi-tag">⚡ Autonomous ROI Acceleration · Sub-48h Launch</span>
              ) : (
                <span className="assurance-tag privacy-tag">🔒 100% In-VPC Boundary · Zero Cloud Data Egress</span>
              )}
            </div>
            <ul>
              {selectedAgent.capabilities.map((cap, i) => (
                <li key={i}>{cap}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Subtle Drag Tip */}
      <div className="drag-hint">
        <span>⟲ Click & drag to rotate 3D visualization</span>
      </div>
    </div>
  )
}
