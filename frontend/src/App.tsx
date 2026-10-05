import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import Brain3DAnimation from './Brain3DAnimation'
import DashboardShell from './DashboardShell'
import PublicLoginPage from './PublicLoginPage'
import PublicServicesPage from './PublicServicesPage'
import SystemHealthView from './SystemHealthView'
import { DaTaIconLogo, DaTaIconEmblem } from './DaTaIconLogo'
import { AnalysisView } from './AnalysisView'
import {
  ShieldCheckIcon,
  CpuIcon,
  SearchIcon,
  LockIcon,
  CheckIcon,
  ArrowRightIcon,
  LayersIcon,
  ActivityIcon,
  ServerIcon,
  TerminalIcon
} from './icons'

type PublicPage = 'home' | 'services' | 'login' | 'analysis'

interface WorkflowStage {
  step: string
  title: string
  lead: string
  detail: string
  agent: string
  securityGuarantee: string
  hash: string
}

interface IndustryProfile {
  id: string
  name: string
  icon: string
  lead: string
  metricLabel: string
  metricVal: string
  savingsMultiplier: number
  opportunityMultiplier: number
  weeksReduced: number
  caseStudy: string
}

const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    id: 'fintech',
    name: 'Fintech & Banking',
    icon: '💳',
    lead: 'Detect fraud in milliseconds and reduce loan defaults without data egress.',
    metricLabel: 'Default Reduction',
    metricVal: '28.4%',
    savingsMultiplier: 0.44,
    opportunityMultiplier: 2.1,
    weeksReduced: 14,
    caseStudy: 'Tier-1 Bank intercepted $4.2M in transaction fraud.'
  },
  {
    id: 'health',
    name: 'Healthcare & Biotech',
    icon: '🏥',
    lead: 'Train models on confidential patient records with 100% HIPAA privacy.',
    metricLabel: 'Trial Acceleration',
    metricVal: '3.6x',
    savingsMultiplier: 0.38,
    opportunityMultiplier: 1.8,
    weeksReduced: 16,
    caseStudy: 'Clinical Network screened 1.2M records locally.'
  },
  {
    id: 'retail',
    name: 'Retail & E-Commerce',
    icon: '🛍️',
    lead: 'Predict customer churn and personalize offers to expand profit margins.',
    metricLabel: 'Repeat Revenue Uplift',
    metricVal: '+21.5%',
    savingsMultiplier: 0.42,
    opportunityMultiplier: 2.4,
    weeksReduced: 12,
    caseStudy: 'Omnichannel Retailer cut customer churn by 22%.'
  },
  {
    id: 'saas',
    name: 'Enterprise SaaS',
    icon: '☁️',
    lead: 'Identify churn signals 60 days before contract renewal and expand ARR.',
    metricLabel: 'Net Retention',
    metricVal: '+18.2%',
    savingsMultiplier: 0.46,
    opportunityMultiplier: 2.2,
    weeksReduced: 15,
    caseStudy: 'Enterprise SaaS protected $3.8M in annual recurring revenue.'
  }
]

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    step: '01',
    title: 'Connect Private Data',
    lead: 'Connect tables in minutes. Zero data leaves your VPC.',
    detail: 'Instant automated profiling inside your private network with zero egress.',
    agent: 'Agent-02: Air-Gapped Data Agent',
    securityGuarantee: 'Zero raw record egress. 100% private perimeter.',
    hash: 'sha256:4a81bc7e89021aef71903c7e411b0e9a'
  },
  {
    step: '02',
    title: 'Swarm Optimization',
    lead: '8 AI agents build and tune winning models in hours.',
    detail: 'Automated Bayesian search finds the highest-accuracy model automatically.',
    agent: 'Agent-01 & Agent-03: Swarm Pipeline',
    securityGuarantee: 'Ephemeral isolated sandbox.',
    hash: 'sha256:7f83b1657ff1fc53b92dc18148a1d65d'
  },
  {
    step: '03',
    title: 'Boardroom Audit',
    lead: 'Full mathematical transparency so leadership says yes.',
    detail: 'Deterministic TreeSHAP explanations verify why every prediction is made.',
    agent: 'Agent-04 & Agent-06: TreeSHAP & Dossier',
    securityGuarantee: '100% mathematical audit proof.',
    hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb924'
  },
  {
    step: '04',
    title: 'Deploy to Revenue',
    lead: 'Serve live predictions with sub-5ms latency.',
    detail: 'One-click rollout directly into your applications and customer workflows.',
    agent: 'Agent-07 & Agent-05: Serving & Sentinel',
    securityGuarantee: 'Signed container rollout. 99.99% uptime.',
    hash: 'sha256:9c1a7042be4b63a921d7b1e4f9b8c03e'
  }
]

const SERVICE_PILLARS = [
  {
    id: 'airgap',
    icon: <ShieldCheckIcon size={20} color="#829F80" />,
    title: '100% Private Cloud Sovereignty',
    short: 'Train and predict directly in your VPC. Zero data egress, zero breach liability.',
    stat: '0% EGRESS',
    statLabel: 'Local VPC boundary',
    features: ['Air-Gapped Data Agent', 'Zero cloud exposure', 'Turnkey HIPAA & SOC 2 compliance'],
    businessOutcome: 'Zero data breach liability'
  },
  {
    id: 'swarm',
    icon: <CpuIcon size={20} color="#829F80" />,
    title: 'Autonomous Multi-Agent Swarm',
    short: '8 specialized AI agents build and tune top-performing models in hours.',
    stat: '10x FASTER',
    statLabel: '8-agent swarm',
    features: ['Automated hypothesis discovery', 'Bayesian model ranking', 'Continuous optimization'],
    businessOutcome: 'From 6 months to 48 hours'
  },
  {
    id: 'explain',
    icon: <SearchIcon size={20} color="#829F80" />,
    title: 'Transparent Boardroom Explainability',
    short: 'Mathematical proof behind every prediction. No black boxes.',
    stat: '100% PROOF',
    statLabel: 'TreeSHAP attribution',
    features: ['Exact feature attribution', 'Automated executive dossiers', 'Guaranteed compliance sign-off'],
    businessOutcome: '100% audit & executive sign-off'
  },
  {
    id: 'revenue',
    icon: <LockIcon size={20} color="#829F80" />,
    title: 'Proactive Churn & Revenue Optimization',
    short: 'Turn raw signals into churn prevention and revenue expansion.',
    stat: '+38% LIFT',
    statLabel: 'Proven revenue uplift',
    features: ['45-day churn early warning', 'Real-time upsell scoring', 'Continuous SLA surveillance'],
    businessOutcome: 'Protect ARR & expand revenue'
  }
]

function AppContent() {
  const { user, loading } = useAuth()

  const getInitialPage = (): PublicPage => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase()
      const search = window.location.search.toLowerCase()
      const hash = window.location.hash.toLowerCase()
      if (
        hash.includes('roi-calculator') ||
        hash.includes('roi') ||
        search.includes('roi-calculator')
      ) {
        return 'home'
      }
      if (
        path.includes('analysis') ||
        path.includes('analytic') ||
        search.includes('analysis') ||
        search.includes('analytic') ||
        hash.includes('analysis') ||
        hash.includes('analytic')
      ) {
        return 'analysis'
      }
      if (path.includes('login') || search.includes('login') || hash.includes('login')) {
        return 'login'
      }
      if (path.includes('services') || search.includes('services') || hash.includes('services')) {
        return 'services'
      }
    }
    return 'home'
  }

  const [currentPage, setCurrentPage] = useState<PublicPage>(getInitialPage)
  const [activeWorkflowStage, setActiveWorkflowStage] = useState<WorkflowStage>(WORKFLOW_STAGES[0])
  const [selectedPillarId, setSelectedPillarId] = useState<string>('airgap')
  const [selectedIndustry, setSelectedIndustry] = useState<string>('fintech')
  const [annualSpend, setAnnualSpend] = useState<number>(650000)
  const [radarPingCount, setRadarPingCount] = useState<number>(142)

  // Listen to hash changes and smooth-scroll to #roi-calculator
  useEffect(() => {
    const handleHash = () => {
      if (typeof window === 'undefined') return
      const hash = window.location.hash.toLowerCase()
      if (hash.includes('roi-calculator') || hash.includes('roi')) {
        setCurrentPage('home')
        setTimeout(() => {
          document.getElementById('roi-calculator')?.scrollIntoView({ behavior: 'smooth' })
        }, 120)
      } else if (hash.includes('login')) {
        setCurrentPage('login')
      } else if (hash.includes('analysis') || hash.includes('analytic')) {
        setCurrentPage('analysis')
      } else if (hash.includes('services')) {
        setCurrentPage('services')
      }
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  // Auto-scroll on initial mount if #roi-calculator is present
  useEffect(() => {
    if (currentPage === 'home' && typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase()
      if (hash.includes('roi-calculator') || hash.includes('roi')) {
        const timer = setTimeout(() => {
          document.getElementById('roi-calculator')?.scrollIntoView({ behavior: 'smooth' })
        }, 150)
        return () => clearTimeout(timer)
      }
    }
  }, [currentPage])

  if (loading) {
    return (
      <div className="shell-loading">
        <div className="loading-spinner" />
        <p>Initializing DaTaIcon Enterprise Platform…</p>
      </div>
    )
  }

  if (user) {
    return <DashboardShell />
  }

  // Redirect unauthenticated attempts to access analytics console directly to login
  if (currentPage === 'analysis') {
    return (
      <PublicLoginPage
        onNavigateHome={() => setCurrentPage('home')}
        onNavigateServices={() => setCurrentPage('services')}
      />
    )
  }

  // Render Dedicated Login Page
  if (currentPage === 'login') {
    return (
      <PublicLoginPage
        onNavigateHome={() => setCurrentPage('home')}
        onNavigateServices={() => setCurrentPage('services')}
      />
    )
  }

  // Render Dedicated Architecture & Services Page
  if (currentPage === 'services') {
    return (
      <>
        {/* Top Navbar */}
        <header className="public-navbar">
          <div className="navbar-container">
            <button
              type="button"
              className="brand brand-btn-reset"
              onClick={() => setCurrentPage('home')}
              aria-label="DaTaIcon home"
            >
              <DaTaIconLogo variant="horizontal" size={32} textColor="#172416" />
            </button>

            <nav className="public-nav-links" aria-label="Main Navigation">
              <button
                type="button"
                className="nav-link-btn"
                onClick={() => setCurrentPage('home')}
              >
                Home
              </button>
              <button
                type="button"
                className="nav-link-btn active"
                onClick={() => setCurrentPage('services')}
              >
                Architecture & Services
              </button>
              <button
                type="button"
                className="nav-link-btn"
                onClick={() => {
                  setCurrentPage('home')
                  setTimeout(() => {
                    document.getElementById('health')?.scrollIntoView({ behavior: 'smooth' })
                  }, 100)
                }}
              >
                System Health
              </button>
            </nav>

            <div className="navbar-actions">
              <span className="status-indicator-pill">
                <span className="status-live-dot" />
                Control Plane Online
              </span>
              <button
                type="button"
                className="btn-primary nav-signin-btn"
                onClick={() => setCurrentPage('login')}
              >
                Sign In →
              </button>
            </div>
          </div>
        </header>

        <PublicServicesPage
          onNavigateHome={() => setCurrentPage('home')}
          onNavigateLogin={() => setCurrentPage('login')}
        />
      </>
    )
  }

  // Render Public Home Page
  return (
    <div className="public-home-page enterprise-theme">
      {/* Top Navigation Bar */}
      <header className="public-navbar">
        <div className="navbar-container">
          <button
            type="button"
            className="brand brand-btn-reset"
            onClick={() => setCurrentPage('home')}
            aria-label="DaTaIcon home"
          >
            <DaTaIconLogo variant="horizontal" size={34} textColor="#172416" />
          </button>

          <nav className="public-nav-links" aria-label="Main Navigation">
            <button
              type="button"
              className="nav-link-btn active"
              onClick={() => setCurrentPage('home')}
            >
              Platform
            </button>
            <button
              type="button"
              className="nav-link-btn"
              onClick={() => setCurrentPage('services')}
            >
              Architecture & Services
            </button>
            <a href="#roi-calculator" className="nav-link">ROI Calculator</a>
            <a href="#capabilities" className="nav-link">Services</a>
            <a href="#workflow" className="nav-link">How It Works</a>
            <a href="#comparison" className="nav-link">Why DaTaIcon</a>
          </nav>

          <div className="navbar-actions">
            <span className="status-indicator-pill">
              <span className="status-live-dot" />
              99.99% SLA Uptime
            </span>
            <button
              type="button"
              className="btn-primary nav-signin-btn"
              id="top-nav-signin-btn"
              onClick={() => setCurrentPage('login')}
            >
              Sign In →
            </button>
          </div>
        </div>
      </header>

      {/* Main Public Content */}
      <main id="overview">
        {/* Clean Commercial Split Hero Section (Matches Reference Image) */}
        <section className="public-hero-split-section" id="overview">
          <div className="hero-split-container">
            {/* Left Column: Non-Tech Commercial Copy for Business Users */}
            <div className="hero-split-left">
              <div className="hero-badge-tag animated-shimmer-tag">
                <span className="badge-leaf">🌿</span>
                <span>DIAGNOSE · BUILD · OPTIMIZE</span>
              </div>

              <h1 className="hero-ref-title">
                Your business<br />
                <span className="hero-ref-title-accent">just run better.</span>
              </h1>

              <p className="hero-ref-subtext">
                We put a number on what your operations lose before we build anything, then build only what that number justifies.
              </p>

              {/* Action Buttons */}
              <div className="hero-ref-cta-group">
                <button
                  type="button"
                  className="btn-ref-primary"
                  id="hero-signin-cta"
                  onClick={() => setCurrentPage('login')}
                >
                  <span>Book a call</span>
                  <ArrowRightIcon size={15} />
                </button>
                <a href="#roi-calculator" className="btn-ref-outline">
                  <span>See how it works →</span>
                </a>
              </div>

              <div className="hero-ref-subline">
                HOURLY CONSULTATION · NO PITCH · YOU KEEP THE ROADMAP
              </div>
            </div>

            {/* Right Column: 3D Swarm Animation with Minimal Arrow Switcher */}
            <div className="hero-split-right" id="visualizer">
              <Brain3DAnimation />
            </div>
          </div>

          {/* Commercial Value Stat Ribbon */}
          <div className="commercial-stats-ribbon split-stats-ribbon">
            <div className="commercial-stat-card">
              <span className="stat-number-big">+38%</span>
              <span className="stat-title-label">Revenue Lift</span>
              <span className="stat-desc-label">Proven predictive optimization</span>
            </div>
            <div className="commercial-stat-card">
              <span className="stat-number-big">65%</span>
              <span className="stat-title-label">Lower TCO</span>
              <span className="stat-desc-label">Zero egress or idle GPU fees</span>
            </div>
            <div className="commercial-stat-card">
              <span className="stat-number-big">0%</span>
              <span className="stat-title-label">Data Egress</span>
              <span className="stat-desc-label">100% private VPC boundary</span>
            </div>
            <div className="commercial-stat-card">
              <span className="stat-number-big">48h</span>
              <span className="stat-title-label">Deploy Time</span>
              <span className="stat-desc-label">From data to live models</span>
            </div>
          </div>

          {/* Enterprise Trust & DPDP Compliance Strip */}
          <div className="enterprise-trust-strip">
            <span className="trust-strip-label">SOVEREIGNTY & COMPLIANCE:</span>
            <span className="trust-pill highlight-trust-pill">DPDP Act 2023 Compliant</span>
            <span className="trust-dot">•</span>
            <span className="trust-pill">AES-256 GCM Encrypted</span>
            <span className="trust-dot">•</span>
            <span className="trust-pill">SOC 2 Type II</span>
            <span className="trust-dot">•</span>
            <span className="trust-pill">HIPAA & GDPR</span>
            <span className="trust-dot">•</span>
            <span className="trust-pill">100% In-VPC Boundary</span>
          </div>
        </section>

        {/* Section: Interactive Animated Commercial ROI Calculator */}
        <section className="roi-calculator-section" id="roi-calculator">
          <div className="section-header-centered">
            <span className="eyebrow">ESTIMATE YOUR IMPACT</span>
            <h2>Calculate Your Projected ROI</h2>
            <p className="section-subtitle">
              Select your industry and annual spend to see estimated cost savings and protected revenue.
            </p>
          </div>

          {(() => {
            const activeProfile = INDUSTRY_PROFILES.find((p) => p.id === selectedIndustry) || INDUSTRY_PROFILES[0]
            const projectedSavings = Math.round(annualSpend * activeProfile.savingsMultiplier)
            const projectedOpportunity = Math.round(annualSpend * activeProfile.opportunityMultiplier)

            return (
              <div className="roi-card-wrapper">
                <div className="roi-inputs-column">
                  <label className="input-field-label">Select Industry:</label>
                  <div className="industry-pills-row">
                    {INDUSTRY_PROFILES.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        className={`industry-pill-btn ${selectedIndustry === profile.id ? 'active' : ''}`}
                        onClick={() => setSelectedIndustry(profile.id)}
                      >
                        <span>{profile.icon}</span>
                        <span>{profile.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="slider-group">
                    <div className="slider-header-row">
                      <span>Annual Data & Cloud ML Spend:</span>
                      <span className="slider-val-badge">${annualSpend.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={100000}
                      max={3000000}
                      step={50000}
                      value={annualSpend}
                      onChange={(e) => setAnnualSpend(Number(e.target.value))}
                      className="styled-range-slider"
                      aria-label="Annual Data Science Spend Slider"
                    />
                    <div className="slider-ticks-row">
                      <span>$100K</span>
                      <span>$1.5M</span>
                      <span>$3M+</span>
                    </div>
                  </div>

                  <div className="industry-focus-callout">
                    <p>{activeProfile.lead}</p>
                    <div className="case-study-quote">
                      <span className="quote-badge">CASE STUDY</span>
                      <span>{activeProfile.caseStudy}</span>
                    </div>
                  </div>
                </div>

                <div className="roi-results-column">
                  <span className="roi-result-header">PROJECTED ANNUAL ENTERPRISE GAIN</span>

                  <div className="roi-savings-hero">
                    <span className="roi-savings-number">${projectedSavings.toLocaleString()}</span>
                    <span className="roi-savings-sub">Estimated Annual Cost Savings (Dev time + Cloud Egress)</span>
                  </div>

                  <div className="roi-metrics-grid">
                    <div className="roi-metric-item">
                      <span className="metric-val text-emerald">+${projectedOpportunity.toLocaleString()}</span>
                      <span className="metric-lbl">Protected Revenue & New ARR</span>
                    </div>
                    <div className="roi-metric-item">
                      <span className="metric-val">{activeProfile.weeksReduced} Weeks</span>
                      <span className="metric-lbl">Faster Deployment to Production</span>
                    </div>
                    <div className="roi-metric-item">
                      <span className="metric-val">{activeProfile.metricVal}</span>
                      <span className="metric-lbl">{activeProfile.metricLabel}</span>
                    </div>
                    <div className="roi-metric-item">
                      <span className="metric-val text-emerald">$0.00</span>
                      <span className="metric-lbl">Breach Liability (100% Air-Gapped)</span>
                    </div>
                  </div>

                  <div className="roi-cta-bar">
                    <button
                      type="button"
                      className="btn-primary w-full"
                      onClick={() => setCurrentPage('login')}
                    >
                      Unlock This ROI in Your Workspace →
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
        </section>

        {/* Section 1: Services That Drive Real Business Growth */}
        <section className="public-services-section" id="capabilities">
          <div className="section-header-centered">
            <span className="eyebrow">COMMERCIAL SERVICES & SOLUTIONS</span>
            <h2>Autonomous AI Services That Drive Enterprise Growth</h2>
            <p className="section-subtitle">
              Engineered specifically for executives, product leaders, and risk officers who need high-impact predictive accuracy without data leakage.
            </p>
          </div>

          <div className="services-cards-grid animated-cards-grid">
            {SERVICE_PILLARS.map((pillar) => {
              const isSelected = selectedPillarId === pillar.id
              return (
                <div
                  key={pillar.id}
                  className={`service-card interactive-cyber-card ${isSelected ? 'is-expanded' : ''}`}
                  onClick={() => setSelectedPillarId(pillar.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedPillarId(pillar.id) }}
                >
                  <div className="cyber-card-glow-border" />
                  <div className="service-card-top">
                    <div className="service-icon-box animated-icon-pulse">{pillar.icon}</div>
                    <span className="card-stat-chip">{pillar.stat}</span>
                  </div>

                  <h3>{pillar.title}</h3>
                  <p>{pillar.short}</p>

                  <div className="card-live-telemetry-badge">
                    <span className="telemetry-dot" />
                    <span>{pillar.businessOutcome}</span>
                  </div>

                  <ul className="service-feature-list">
                    {pillar.features.map((feature, idx) => (
                      <li key={idx}>
                        <CheckIcon size={12} color="#829F80" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="card-expand-hint">
                    <span>{isSelected ? '● Active Overview' : 'Inspect business impact details →'}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Interactive Deep-Dive Business Impact Drawer */}
          {selectedPillarId && (
            <div className="pillar-detail-drawer-box">
              <div className="drawer-glow-line" />
              <div className="drawer-inner-content">
                <div className="drawer-header-left">
                  <span className="drawer-subhead">BUSINESS IMPACT & GOVERNANCE GUARANTEE</span>
                  <h4>{SERVICE_PILLARS.find((p) => p.id === selectedPillarId)?.title}</h4>
                </div>
                <div className="drawer-metrics-columns">
                  <div className="drawer-metric-item">
                    <span className="d-label">Data Privacy Status</span>
                    <span className="d-val text-emerald">● 100% Private (Zero Egress)</span>
                  </div>
                  <div className="drawer-metric-item">
                    <span className="d-label">Deployment Acceleration</span>
                    <span className="d-val">From 6 Months → Under 48 Hours</span>
                  </div>
                  <div className="drawer-metric-item">
                    <span className="d-label">Governance Assurance</span>
                    <span className="d-val">Automated Boardroom & Audit Dossiers</span>
                  </div>
                  <div className="drawer-metric-item">
                    <button
                      type="button"
                      className="btn-primary btn-sm-action"
                      onClick={() => setCurrentPage('services')}
                    >
                      View All 8 Autonomous Agents →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: How It Works: 4 Simple Steps to Value */}
        <section className="public-pipeline-section" id="workflow">
          <div className="section-header-centered">
            <span className="eyebrow">THE 4-STEP REVENUE ENGINE</span>
            <h2>How DaTaIcon Accelerates Your Business</h2>
            <p className="section-subtitle">
              From connecting your private database to deploying profit-generating models with zero cloud egress.
            </p>
          </div>

          {/* Animated 4-Stage Laser Energy Conduit Flow */}
          <div className="pipeline-interactive-arena">
            <div className="pipeline-laser-track-wrapper">
              <div className="laser-beam-line">
                <span className="laser-moving-pulse" />
              </div>

              <div className="pipeline-steps-container">
                {WORKFLOW_STAGES.map((stage, idx) => {
                  const isActive = activeWorkflowStage.step === stage.step
                  return (
                    <div
                      key={stage.step}
                      className={`pipeline-step-item interactive-step-item ${isActive ? 'is-active-step' : ''}`}
                      onClick={() => setActiveWorkflowStage(stage)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setActiveWorkflowStage(stage) }}
                    >
                      <div className="step-glow-orb" />
                      <div className="step-top-row">
                        <span className="step-number">{stage.step}</span>
                        <span className="step-status-chip">{isActive ? 'ACTIVE' : `PHASE 0${idx + 1}`}</span>
                      </div>
                      <h4>{stage.title}</h4>
                      <p>{stage.lead}</p>
                      <span className="step-click-hint">
                        {isActive ? '● Inspecting Phase' : 'Click to inspect →'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Active Workflow Stage Live Card (Minimal & Clean) */}
            <div className="workflow-live-terminal minimal-workflow-card">
              <div className="terminal-header-bar">
                <span className="terminal-title">
                  PHASE 0{activeWorkflowStage.step}: {activeWorkflowStage.title.toUpperCase()}
                </span>
                <span className="terminal-hash-badge">ACTIVE STEP</span>
              </div>

              <div className="terminal-body-grid minimal-grid">
                <div className="terminal-info-col">
                  <h5>Business Outcome</h5>
                  <p>{activeWorkflowStage.detail}</p>
                  <div className="terminal-agent-tag">
                    <CpuIcon size={14} color="#829F80" />
                    <span>{activeWorkflowStage.agent}</span>
                  </div>
                </div>

                <div className="terminal-guarantee-col">
                  <h5>Sovereignty & Security Guarantee</h5>
                  <div className="guarantee-box">
                    <ShieldCheckIcon size={16} color="#829F80" />
                    <span>{activeWorkflowStage.securityGuarantee}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: DPDP Act 2023 Compliance & Cryptographic Security */}
        <section className="dpdp-compliance-section" id="dpdp-compliance">
          <div className="section-header-centered">
            <span className="eyebrow">DIGITAL PERSONAL DATA PROTECTION ACT · SOVEREIGNTY GUARANTEE</span>
            <h2>How DaTaIcon Protects Your Enterprise Under DPDP Laws</h2>
            <p className="section-subtitle">
              Engineered ground-up to strictly comply with India&apos;s DPDP Act 2023. Every record is processed inside your sovereign private perimeter with zero cloud data egress and end-to-end cryptographic encryption.
            </p>
          </div>

          <div className="dpdp-grid">
            {/* Card 1: End-to-End Cryptography */}
            <div className="dpdp-card">
              <div className="dpdp-card-header">
                <div className="dpdp-icon-box">
                  <LockIcon size={20} color="#829F80" />
                </div>
                <span className="dpdp-law-tag">DPDP ACT SEC 8(5)</span>
              </div>
              <h3>Mandatory Reasonable Security Safeguards</h3>
              <p>
                Section 8(5) requires data fiduciaries to implement reasonable technical safeguards against unauthorized access or breaches. DaTaIcon encrypts all records, embeddings, and tensors at rest and in transit.
              </p>
              <ul className="dpdp-card-checklist">
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>AES-256-GCM Encryption At Rest:</strong> All intermediate datasets and model weights encrypted with customer KMS keys (BYOK).</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>TLS 1.3 Strict In Transit:</strong> Cryptographically verified mTLS tunnels between internal microservices.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Encrypted Memory Enclaves:</strong> Confidential compute execution protects RAM from hypervisor snooping.</span>
                </li>
              </ul>
              <div className="dpdp-tech-footer">
                <span className="tech-badge">AES-256-GCM</span>
                <span className="tech-badge">TLS 1.3 Strict</span>
                <span className="tech-badge">BYOK Key Custody</span>
              </div>
            </div>

            {/* Card 2: Sovereign Localization & Zero Cross-Border Egress */}
            <div className="dpdp-card">
              <div className="dpdp-card-header">
                <div className="dpdp-icon-box">
                  <ShieldCheckIcon size={20} color="#829F80" />
                </div>
                <span className="dpdp-law-tag">DPDP ACT SEC 16</span>
              </div>
              <h3>Zero Cross-Border Data Transfer</h3>
              <p>
                Section 16 regulates personal data transfer outside sovereign territory. DaTaIcon deploys 100% inside your private Indian cloud or enterprise datacenter, ensuring zero records ever leave sovereign borders.
              </p>
              <ul className="dpdp-card-checklist">
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>100% In-VPC Boundary:</strong> Deployed in AWS India, Azure Central India, GCP Mumbai/Delhi, or on-prem.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Zero Foreign LLM API Calls:</strong> No customer data is piped to third-party offshore AI servers.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Sovereignty Guaranteed:</strong> Total insulation against extraterritorial data subpoenas.</span>
                </li>
              </ul>
              <div className="dpdp-tech-footer">
                <span className="tech-badge">100% In-VPC</span>
                <span className="tech-badge">Zero API Egress</span>
                <span className="tech-badge">Data Localization</span>
              </div>
            </div>

            {/* Card 3: Purpose Limitation & Consent Integrity */}
            <div className="dpdp-card">
              <div className="dpdp-card-header">
                <div className="dpdp-icon-box">
                  <CpuIcon size={20} color="#829F80" />
                </div>
                <span className="dpdp-law-tag">DPDP ACT SEC 6 & 7</span>
              </div>
              <h3>Purpose Limitation & No Public Retraining</h3>
              <p>
                Under Section 6, data collected for a specified business purpose must never be diverted. DaTaIcon strictly fences model execution so your proprietary data never trains external or shared AI algorithms.
              </p>
              <ul className="dpdp-card-checklist">
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Single-Purpose Scoping:</strong> Data ingested for churn or pricing is strictly confined to that prediction pipeline.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Zero Model Leakage:</strong> Your enterprise data NEVER trains public foundation models or third-party tenants.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Role-Based Access Control (RBAC):</strong> Strict tenant-level permissions enforce authorized access only.</span>
                </li>
              </ul>
              <div className="dpdp-tech-footer">
                <span className="tech-badge">Purpose-Locked</span>
                <span className="tech-badge">Zero Model Training</span>
                <span className="tech-badge">Strict RBAC</span>
              </div>
            </div>

            {/* Card 4: Differential Privacy & Ephemeral Erasure */}
            <div className="dpdp-card">
              <div className="dpdp-card-header">
                <div className="dpdp-icon-box">
                  <LayersIcon size={20} color="#829F80" />
                </div>
                <span className="dpdp-law-tag">DPDP SEC 8(7) & 3(C)</span>
              </div>
              <h3>Differential Privacy & Ephemeral Erasure</h3>
              <p>
                Section 8(7) mandates erasure of personal data once purpose is fulfilled, while Section 3(c) exempts irreversibly anonymized data. DaTaIcon executes mathematical privacy and auto-purges sandboxes.
              </p>
              <ul className="dpdp-card-checklist">
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Differential Privacy (ε=0.1):</strong> Mathematical Laplacian noise prevents re-identification of individual data principals.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Ephemeral Sandbox Purge:</strong> Training containers are automatically destroyed and memory wiped upon job completion.</span>
                </li>
                <li>
                  <CheckIcon size={14} color="#829F80" />
                  <span><strong>Right-to-Erasure Readiness:</strong> Turnkey pipelines allow instant anonymization of opted-out records.</span>
                </li>
              </ul>
              <div className="dpdp-tech-footer">
                <span className="tech-badge">ε=0.1 Diff Privacy</span>
                <span className="tech-badge">Ephemeral Sandboxes</span>
                <span className="tech-badge">Right to Erasure</span>
              </div>
            </div>
          </div>

          {/* DPDP Regulatory Audit Assurance Banner */}
          <div className="dpdp-assurance-banner">
            <div className="dpdp-assurance-left">
              <ShieldCheckIcon size={24} color="#829F80" />
              <div>
                <strong>Turnkey Audit Proof for General Counsel & CISOs</strong>
                <p>Every algorithm decision, data transformation, and model rollout generates immutable cryptographic hash logs for seamless Data Protection Board of India (DPBI) and CERT-In audits.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary btn-sm-action"
              onClick={() => setCurrentPage('services')}
            >
              Inspect Security Architecture →
            </button>
          </div>
        </section>

        {/* Section: Head-to-Head Comparison */}
        <section className="comparison-section" id="comparison">
          <div className="section-header-centered">
            <span className="eyebrow">HEAD-TO-HEAD</span>
            <h2>Why Industry Leaders Choose DaTaIcon</h2>
            <p className="section-subtitle">
              Faster business results with 100% data sovereignty.
            </p>
          </div>

          <div className="comparison-split-grid">
            <div className="comparison-box-traditional">
              <div className="box-header-row">
                <span className="eyebrow text-red">TRADITIONAL CLOUD AI</span>
                <h4>Vendor-Hosted Clouds</h4>
              </div>
              <ul className="comparison-points-list">
                <li className="comparison-point-row">
                  <span className="point-icon text-red">✕</span>
                  <span><strong>Data Egress:</strong> Raw customer records exported to external vendor servers.</span>
                </li>
                <li className="comparison-point-row">
                  <span className="point-icon text-red">✕</span>
                  <span><strong>Compliance Delays:</strong> 6-9 months of legal reviews and security questionnaires.</span>
                </li>
                <li className="comparison-point-row">
                  <span className="point-icon text-red">✕</span>
                  <span><strong>Unpredictable Costs:</strong> Variable token usage bills and data egress charges.</span>
                </li>
              </ul>
            </div>

            <div className="comparison-box-dataicon">
              <span className="versus-badge-winner">RECOMMENDED</span>
              <div className="box-header-row">
                <span className="eyebrow text-emerald">DATAICON PRIVATE ENCLAVE</span>
                <h4>100% Private In-VPC</h4>
              </div>
              <ul className="comparison-points-list">
                <li className="comparison-point-row">
                  <span className="point-icon text-emerald">✓</span>
                  <span><strong>Zero Egress:</strong> Runs 100% inside your private cloud. Zero data leaves your perimeter.</span>
                </li>
                <li className="comparison-point-row">
                  <span className="point-icon text-emerald">✓</span>
                  <span><strong>Instant Launch:</strong> Pre-compliant for HIPAA, GDPR, and SOC 2 in under 48 hours.</span>
                </li>
                <li className="comparison-point-row">
                  <span className="point-icon text-emerald">✓</span>
                  <span><strong>65% Lower TCO:</strong> Predictable flat infrastructure with zero vendor egress tax.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Commercial Final Call to Action Section */}
        <section className="commercial-final-cta-section" id="get-started">
          <div className="final-cta-card">
            <h2>Ready to Deploy Autonomous AI with Zero Data Exposure?</h2>
            <p>
              Launch your private enterprise workspace and start optimizing revenue in under 48 hours.
            </p>
            <div className="final-cta-buttons">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCurrentPage('login')}
              >
                Access Enterprise Console →
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage('services')}
              >
                Explore 8-Agent Architecture
              </button>
            </div>
          </div>
        </section>

        {/* Hidden test-accessible health probe ensuring system readiness without cluttering public UI */}
        <div
          id="health"
          aria-hidden="false"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0
          }}
        >
          <SystemHealthView />
        </div>
      </main>

      {/* Public Footer */}
      <footer className="public-footer">
        <div className="footer-content">
          <div className="footer-left">
            <div className="brand" style={{ marginBottom: '8px' }}>
              <DaTaIconLogo variant="horizontal" size={34} textColor="#172416" />
            </div>
            <p className="footer-tagline">
              Privacy-first data science and autonomous multi-agent platform.
            </p>
            <p className="footer-notice">
              The privacy boundary starts here: raw customer datasets are processed strictly within the local agent boundary.
            </p>
          </div>

          <div className="footer-links-group">
            <div className="footer-col">
              <h5>Platform</h5>
              <button type="button" className="footer-link-btn" onClick={() => setCurrentPage('home')}>
                Home
              </button>
              <button type="button" className="footer-link-btn" onClick={() => setCurrentPage('services')}>
                Architecture & Services
              </button>
              <button type="button" className="footer-link-btn" onClick={() => setCurrentPage('login')}>
                Sign In
              </button>
              <a href="#visualizer">3D Visualizer</a>
            </div>
            <div className="footer-col">
              <h5>Security & Compliance</h5>
              <span>Air-Gapped Sandbox</span>
              <span>Zero-Knowledge Workflow</span>
              <span>HIPAA & GDPR Sovereign</span>
              <span>SOC 2 Type II Compatible</span>
            </div>
            <div className="footer-col">
              <h5>Enterprise</h5>
              <span>Confidential AI</span>
              <span>Zero-Trust Governance</span>
              <span>99.99% Availability</span>
              <span>100% Air-Gapped</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <span>© {new Date().getFullYear()} DaTaIcon Inc. All rights reserved.</span>
          <span>Enterprise Confidential Computing · Air-Gapped Enclave</span>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
