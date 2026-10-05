import React, { useEffect, useState, useId } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions, type Project } from './types'
import {
  motionTheme,
  getPresetCssTransition,
  generateSpringCurvePoints,
  type MotionPresetKey,
} from './motion.theme'

export type AnalysisViewMode = 'analytics' | 'hardware'

export interface AnalysisViewProps {
  onBack?: () => void
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ onBack }) => {
  const { activeOrg, user } = useAuth()
  const orgId = activeOrg?.organization_id

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'quarter'>('7d')
  const [viewMode, setViewMode] = useState<AnalysisViewMode>('analytics')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showBriefBanner, setShowBriefBanner] = useState(true)
  const [activeCircuitPulse, setActiveCircuitPulse] = useState(false)
  const [selectedModule, setSelectedModule] = useState<string | null>('vector-core')

  // Physics-backed Motion Theme Preset State
  const [motionPreset, setMotionPreset] = useState<MotionPresetKey>('ambient')
  const [showMotionInspector, setShowMotionInspector] = useState(true)
  const [chartKey, setChartKey] = useState(0)

  // Hover state for interactive multi-line chart
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)

  useEffect(() => {
    async function loadProjects() {
      if (!orgId) return
      try {
        const res = await api.getProjects(orgId)
        setProjects(res.items || [])
      } catch (err) {
        console.error('Failed to load projects for analysis:', err)
      }
    }
    loadProjects()
  }, [orgId])

  const handleExport = () => {
    setFeedback('Analytical telemetry & model performance metrics exported as CSV.')
    setTimeout(() => setFeedback(null), 4000)
  }

  const triggerVectorCompute = () => {
    setActiveCircuitPulse(true)
    setFeedback('⚡ Vector Compute Core executed inference batch through hardware bus.')
    setTimeout(() => setActiveCircuitPulse(false), 2200)
    setTimeout(() => setFeedback(null), 4000)
  }

  // Time-series telemetry points
  const timelineDates = ['Feb 12', 'Feb 13', 'Feb 14', 'Feb 15', 'Feb 16', 'Feb 17', 'Feb 18']
  const modelASeries = [17800, 17900, 16900, 17800, 19200, 19300, 19100] // MindBrew / CatBoost
  const modelBSeries = [16800, 16500, 19800, 18500, 16400, 17100, 17800] // BrainBoosters / XGBoost

  // Bar chart telemetry data
  const barData = [
    { day: 'Feb 12', valA: 17200, valB: 15400 },
    { day: 'Feb 13', valA: 18100, valB: 16200 },
    { day: 'Feb 14', valA: 16900, valB: 19400 },
    { day: 'Feb 15', valA: 18400, valB: 17800 },
    { day: 'Feb 16', valA: 19600, valB: 16200 },
    { day: 'Feb 17', valA: 19800, valB: 17400 },
    { day: 'Feb 18', valA: 19200, valB: 18100 },
  ]

  // Sparkline data for top KPI cards
  const sparklineUsers = [22400, 22100, 21900, 21600, 21800, 21400, 21300] // Negative trend
  const sparklineSessions = [17200, 17400, 17800, 18100, 18000, 18300, 18500] // Positive trend
  const sparklineDuration = [305, 300, 295, 290, 288, 284, 281] // Negative trend (4m 41s)
  const sparklineRequests = [1120, 1140, 1160, 1150, 1180, 1195, 1200] // Positive trend

  return (
    <div className="analysis-view-root">
      {/* Top Filter & Toolbar Bar */}
      <div className="analysis-top-nav">
        <div className="top-nav-left">
          {onBack && (
            <button
              type="button"
              className="btn-back"
              id="back-to-dashboard-btn"
              onClick={onBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #dce2d8',
                background: '#ffffff',
                color: '#174e3f',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Back to Dashboard
            </button>
          )}

          {/* Site / Project Selector */}
          <div className="site-selector-dropdown">
            <span className="dropdown-label-bold">All models & sites</span>
            <span className="dropdown-chevron">▾</span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="hidden-select-overlay"
              aria-label="Select Model / Project"
            >
              <option value="all">All Models & Initiatives</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.classification})</option>
              ))}
            </select>
          </div>

          {/* Mode Switcher: SaaS Analytics vs Hardware Vector Console */}
          <div className="analysis-view-mode-toggle" role="tablist">
            <button
              type="button"
              className={`mode-toggle-pill ${viewMode === 'analytics' ? 'active' : ''}`}
              onClick={() => setViewMode('analytics')}
              role="tab"
              aria-selected={viewMode === 'analytics'}
            >
              📊 Telemetry & Charts
            </button>
            <button
              type="button"
              className={`mode-toggle-pill ${viewMode === 'hardware' ? 'active' : ''}`}
              onClick={() => setViewMode('hardware')}
              role="tab"
              aria-selected={viewMode === 'hardware'}
            >
              ⚡ The Vector Computer
            </button>
          </div>
        </div>

        <div className="top-nav-right">
          {/* Date Range Filter */}
          <div className="date-filter-box">
            <span className="calendar-icon">📅</span>
            <span>{timeRange === '7d' ? 'Last week' : timeRange === '30d' ? 'Last 30 days' : 'Q3 2026'}</span>
            <span className="dropdown-chevron">▾</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="hidden-select-overlay"
              aria-label="Filter Date Range"
            >
              <option value="7d">Last week</option>
              <option value="30d">Last 30 days</option>
              <option value="quarter">Q3 2026</option>
            </select>
          </div>

          {/* Set up dashboard / Export action */}
          <button
            type="button"
            className="setup-dashboard-btn"
            onClick={triggerVectorCompute}
            title="Execute vector hardware pipeline"
          >
            ⚡ Run Inference
          </button>

          <PermissionGate permission={Permissions.REPORT_EXPORT}>
            <button
              type="button"
              className="export-data-btn"
              onClick={handleExport}
              title="Export Analytics CSV"
            >
              📥 Export
            </button>
          </PermissionGate>

          {/* Notifications & User profile */}
          <div className="nav-profile-pill">
            <div className="notification-bell" title="System alerts">
              🔔
              <span className="bell-badge-dot" />
            </div>
            <div className="avatar-circle">
              {user?.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="analysis-alert-banner" role="status">
          <span className="alert-icon">✓</span>
          <span>{feedback}</span>
        </div>
      )}

      {/* =====================================================================
          VIEW MODE 1: SAAS ANALYTICS DASHBOARD & CHARTS (TRAFFIC TRACE STYLE)
         ===================================================================== */}
      {viewMode === 'analytics' && (
        <div className="analytics-dashboard-content">
          {/* Motion Theme & Spring Physics Presets Toolbar (from motion.theme.ts) */}
          <div className="motion-theme-toolbar">
            <div className="motion-theme-left">
              <span className="motion-eyebrow">&gt; THEME &middot; TRANSITIONS</span>
              <strong className="motion-title">Consistent, customisable motion</strong>
              <p className="motion-desc">
                Every transition resolves from <code style={{ color: '#fbbf24', background: '#111827', padding: '1px 5px', borderRadius: '4px' }}>motion.theme.ts</code>. Tuning happens across physics presets.
              </p>
            </div>

            <div className="motion-presets-row" role="tablist" aria-label="Motion presets">
              {(['snap', 'ui', 'gentle', 'lively', 'ambient'] as MotionPresetKey[]).map((p) => {
                const cfg = motionTheme.transitions[p]
                const isActive = motionPreset === p
                return (
                  <button
                    key={p}
                    type="button"
                    className={`motion-preset-pill ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setMotionPreset(p)
                      setChartKey((k) => k + 1)
                    }}
                    title={`Stiffness: ${cfg.stiffness}, Damping: ${cfg.damping}`}
                    role="tab"
                    aria-selected={isActive}
                  >
                    {p.toUpperCase()}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="btn-toggle-inspector"
              onClick={() => setShowMotionInspector(!showMotionInspector)}
            >
              {showMotionInspector ? 'Hide Physics Curve ✕' : 'Inspect Physics X(T) ⚙'}
            </button>
          </div>

          {/* Interactive Spring Physics Oscilloscope Inspector */}
          {showMotionInspector && (
            <div className="motion-inspector-card">
              <div>
                <div className="motion-inspector-header">
                  <span className="inspector-formula">&gt; X(T)</span>
                  <span className="inspector-preset-tag">
                    {motionPreset.toUpperCase()} K {motionTheme.transitions[motionPreset].stiffness} - C {motionTheme.transitions[motionPreset].damping}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                  Background loops: pulses, sweeps, blinks.
                </div>
                <div className="inspector-curve-container">
                  <svg viewBox="0 0 320 80" className="spring-curve-svg">
                    <line x1="0" y1="20" x2="320" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="0" y1="45" x2="320" y2="45" stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="0" y1="70" x2="320" y2="70" stroke="#334155" />
                    <text x="6" y="16" fill="#64748b" fontSize="8">1.5</text>
                    <text x="6" y="42" fill="#64748b" fontSize="8">1.0</text>
                    <text x="6" y="68" fill="#64748b" fontSize="8">0</text>
                    {/* Active spring trajectory polyline */}
                    <polyline
                      key={`curve-${chartKey}`}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="2.5"
                      points={generateSpringCurvePoints(
                        motionTheme.transitions[motionPreset].stiffness,
                        motionTheme.transitions[motionPreset].damping,
                        310,
                        70
                      )}
                    />
                  </svg>
                </div>
              </div>

              <div className="motion-travel-bar">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="travel-label">TRAVEL &plusmn;206PX</span>
                  <span style={{ fontSize: '11px', color: '#fbbf24', fontFamily: 'monospace' }}>
                    stagger: {motionTheme.stagger.base}s &middot; hover: {motionTheme.travel.hover}px
                  </span>
                </div>
                <div className="travel-track">
                  <div
                    className="travel-thumb"
                    key={`thumb-${chartKey}`}
                    style={{
                      animation: `springSlide ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                    }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Timing approximation: <code>{getPresetCssTransition(motionPreset).duration} {getPresetCssTransition(motionPreset).timingFunction}</code>
                </div>
              </div>
            </div>
          )}

          {/* Top 4 KPI Metric Cards with Sparklines */}
          <div className="kpi-sparkline-grid">
            {/* Card 1: Users / Model Predictions */}
            <div className="kpi-spark-card">
              <div className="kpi-meta">
                <span className="kpi-label">Predictions</span>
                <div className="kpi-val-row">
                  <span className="kpi-number">21.3K</span>
                  <span className="delta-badge negative">-2.5%</span>
                </div>
              </div>
              <div className="kpi-sparkline-canvas">
                <SparklineSvg
                  data={sparklineUsers}
                  color="#ef4444"
                  isNegative
                  motionDuration={getPresetCssTransition(motionPreset).duration}
                  motionEase={getPresetCssTransition(motionPreset).timingFunction}
                  chartKey={chartKey}
                />
              </div>
            </div>

            {/* Card 2: Inference Sessions */}
            <div className="kpi-spark-card">
              <div className="kpi-meta">
                <span className="kpi-label">Sessions</span>
                <div className="kpi-val-row">
                  <span className="kpi-number">18.5K</span>
                  <span className="delta-badge positive">+1.5%</span>
                </div>
              </div>
              <div className="kpi-sparkline-canvas">
                <SparklineSvg
                  data={sparklineSessions}
                  color="#10b981"
                  motionDuration={getPresetCssTransition(motionPreset).duration}
                  motionEase={getPresetCssTransition(motionPreset).timingFunction}
                  chartKey={chartKey}
                />
              </div>
            </div>

            {/* Card 3: Avg Processing Time / Latency */}
            <div className="kpi-spark-card">
              <div className="kpi-meta">
                <span className="kpi-label">Avg. session duration</span>
                <div className="kpi-val-row">
                  <span className="kpi-number">4m 41s</span>
                  <span className="delta-badge negative">-3.5%</span>
                </div>
              </div>
              <div className="kpi-sparkline-canvas">
                <SparklineSvg
                  data={sparklineDuration}
                  color="#ef4444"
                  isNegative
                  motionDuration={getPresetCssTransition(motionPreset).duration}
                  motionEase={getPresetCssTransition(motionPreset).timingFunction}
                  chartKey={chartKey}
                />
              </div>
            </div>

            {/* Card 4: Requests Received / Throughput */}
            <div className="kpi-spark-card">
              <div className="kpi-meta">
                <span className="kpi-label">Requests received</span>
                <div className="kpi-val-row">
                  <span className="kpi-number">1.2K</span>
                  <span className="delta-badge positive">+1.5%</span>
                </div>
              </div>
              <div className="kpi-sparkline-canvas">
                <SparklineSvg
                  data={sparklineRequests}
                  color="#10b981"
                  motionDuration={getPresetCssTransition(motionPreset).duration}
                  motionEase={getPresetCssTransition(motionPreset).timingFunction}
                  chartKey={chartKey}
                />
              </div>
            </div>
          </div>

          {/* Primary Visual Charts Row */}
          <div className="main-charts-row">
            {/* Left Large Card: Time Series Multi-Line Bézier Chart */}
            <div className="chart-card line-chart-card">
              <div className="chart-card-header">
                <div className="header-left-title">
                  <h3>Users & Inferences</h3>
                </div>
                <div className="chart-legend-row">
                  <span className="legend-item">
                    <span className="legend-dot color-blue" />
                    MindBrew (CatBoost)
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot color-orange" />
                    BrainBoosters (XGBoost)
                  </span>
                  <span className="card-menu-dots">•••</span>
                </div>
              </div>

              {/* Smooth Bézier SVG Chart */}
              <div className="interactive-bezier-chart">
                <svg
                  viewBox="0 0 720 280"
                  className="bezier-svg-canvas"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="blueGlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="orangeGlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[
                    { y: 40, label: '21000' },
                    { y: 100, label: '19000' },
                    { y: 160, label: '17000' },
                    { y: 220, label: '15000' },
                  ].map((grid, i) => (
                    <g key={i}>
                      <text x="35" y={grid.y + 4} className="chart-axis-label">
                        {grid.label}
                      </text>
                      <line
                        x1="80"
                        y1={grid.y}
                        x2="700"
                        y2={grid.y}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                    </g>
                  ))}

                  {/* Vertical timeline date markings */}
                  {timelineDates.map((date, i) => {
                    const x = 90 + i * 100
                    return (
                      <g key={i}>
                        <line
                          x1={x}
                          y1="35"
                          x2={x}
                          y2="230"
                          stroke="#f1f5f9"
                          strokeDasharray="2 4"
                        />
                        <text x={x} y="255" textAnchor="middle" className="chart-date-label">
                          {date}
                        </text>
                      </g>
                    )
                  })}

                  {/* Model A (Blue Line & Area) */}
                  <path
                    key={`areaA-${chartKey}`}
                    d={computeAreaSvgPath(modelASeries, 90, 100, 220, 15000, 6000)}
                    fill="url(#blueGlowGrad)"
                    style={{
                      animation: `fadeArea ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                    }}
                  />
                  <path
                    key={`lineA-${chartKey}`}
                    d={computeSmoothSvgPath(modelASeries, 90, 100, 220, 15000, 6000)}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{
                      animation: `drawPath ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                    }}
                  />

                  {/* Model B (Orange Line & Area) */}
                  <path
                    key={`areaB-${chartKey}`}
                    d={computeAreaSvgPath(modelBSeries, 90, 100, 220, 15000, 6000)}
                    fill="url(#orangeGlowGrad)"
                    style={{
                      animation: `fadeArea ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                      animationDelay: `${motionTheme.stagger.tight}s`,
                    }}
                  />
                  <path
                    key={`lineB-${chartKey}`}
                    d={computeSmoothSvgPath(modelBSeries, 90, 100, 220, 15000, 6000)}
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{
                      animation: `drawPath ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                      animationDelay: `${motionTheme.stagger.tight}s`,
                    }}
                  />

                  {/* Interactive hover points */}
                  {timelineDates.map((_, i) => {
                    const x = 90 + i * 100
                    const yA = 220 - ((modelASeries[i] - 15000) / 6000) * 180
                    const yB = 220 - ((modelBSeries[i] - 15000) / 6000) * 180
                    const isHovered = hoveredPointIndex === i

                    return (
                      <g
                        key={i}
                        onMouseEnter={() => setHoveredPointIndex(i)}
                        onMouseLeave={() => setHoveredPointIndex(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Hover vertical crosshair line */}
                        {isHovered && (
                          <line
                            x1={x}
                            y1="35"
                            x2={x}
                            y2="230"
                            stroke="#94a3b8"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />
                        )}
                        <circle
                          cx={x}
                          cy={yA}
                          r={isHovered ? 6 : 4}
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <circle
                          cx={x}
                          cy={yB}
                          r={isHovered ? 6 : 4}
                          fill="#ea580c"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      </g>
                    )
                  })}
                </svg>

                {/* Floating tooltip on hover */}
                {hoveredPointIndex !== null && (
                  <div
                    className="chart-hover-tooltip"
                    style={{ left: `${14 + hoveredPointIndex * 13.8}%` }}
                  >
                    <div className="tooltip-date">{timelineDates[hoveredPointIndex]}</div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot blue" />
                      <span>MindBrew: <strong>{modelASeries[hoveredPointIndex].toLocaleString()}</strong></span>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot orange" />
                      <span>BrainBoosters: <strong>{modelBSeries[hoveredPointIndex].toLocaleString()}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Card: Users by Source Breakdown (Exact TrafficTrace format) */}
            <div className="chart-card source-breakdown-card">
              <div className="chart-card-header">
                <div>
                  <span className="breakdown-title">Users by source</span>
                  <div className="breakdown-headline">
                    <span className="headline-big">21.3K</span>
                    <span className="delta-badge negative">-2.5%</span>
                  </div>
                </div>
                <span className="card-menu-dots">•••</span>
              </div>

              {/* Source pills grid */}
              <div className="source-pill-list">
                <div className="source-pill-row pill-blue">
                  <span className="source-name">Google Cloud VPC</span>
                  <span className="source-count">8,224</span>
                </div>
                <div className="source-pill-row pill-pink">
                  <span className="source-name">Air-Gapped Edge Agent</span>
                  <span className="source-count">5,255</span>
                </div>
                <div className="source-pill-row pill-purple">
                  <span className="source-name">Internal Feature Store</span>
                  <span className="source-count">2,512</span>
                </div>
                <div className="source-pill-row pill-orange">
                  <span className="source-name">Batch Air-Gapped API</span>
                  <span className="source-count">1,642</span>
                </div>
                <div className="source-pill-row pill-yellow">
                  <span className="source-name">Direct gRPC Gateway</span>
                  <span className="source-count">1,341</span>
                </div>
                <div className="source-pill-row pill-gray">
                  <span className="source-name">Automated Webhooks</span>
                  <span className="source-count">2,326</span>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Row: Sessions by Country & Grouped Bar Chart */}
          <div className="secondary-charts-row">
            {/* Country / Enclave Distribution Card */}
            <div className="chart-card country-card">
              <div className="chart-card-header">
                <h3>Sessions by country</h3>
                <span className="card-menu-dots">•••</span>
              </div>

              <div className="country-bars-list">
                <div className="country-row">
                  <div className="country-info">
                    <span className="country-flag">🇺🇸</span>
                    <span className="country-name">United States Enclave</span>
                  </div>
                  <span className="country-percent">50%</span>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      key={`country1-${chartKey}`}
                      style={{
                        width: '50%',
                        background: '#3b82f6',
                        transition: `width ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction}`,
                      }}
                    />
                  </div>
                </div>

                <div className="country-row">
                  <div className="country-info">
                    <span className="country-flag">🇩🇪</span>
                    <span className="country-name">Germany Sovereign Cloud</span>
                  </div>
                  <span className="country-percent">28%</span>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      key={`country2-${chartKey}`}
                      style={{
                        width: '28%',
                        background: '#10b981',
                        transition: `width ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction}`,
                      }}
                    />
                  </div>
                </div>

                <div className="country-row">
                  <div className="country-info">
                    <span className="country-flag">🇯🇵</span>
                    <span className="country-name">Japan Edge VPC</span>
                  </div>
                  <span className="country-percent">14%</span>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      key={`country3-${chartKey}`}
                      style={{
                        width: '14%',
                        background: '#f59e0b',
                        transition: `width ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction}`,
                      }}
                    />
                  </div>
                </div>

                <div className="country-row">
                  <div className="country-info">
                    <span className="country-flag">🇬🇧</span>
                    <span className="country-name">United Kingdom Enclave</span>
                  </div>
                  <span className="country-percent">8%</span>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      key={`country4-${chartKey}`}
                      style={{
                        width: '8%',
                        background: '#8b5cf6',
                        transition: `width ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction}`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sessions / Inferences Grouped Bar Chart */}
            <div className="chart-card bar-chart-card">
              <div className="chart-card-header">
                <h3>Sessions</h3>
                <div className="chart-legend-row">
                  <span className="legend-item">
                    <span className="legend-dot color-blue" />
                    MindBrew
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot color-orange" />
                    BrainBoosters
                  </span>
                  <span className="card-menu-dots">•••</span>
                </div>
              </div>

              {/* Grouped Bar Chart SVG */}
              <div className="grouped-bar-container">
                <svg viewBox="0 0 540 220" className="bar-svg-canvas">
                  {/* Grid lines */}
                  {[40, 90, 140, 190].map((y, idx) => (
                    <line key={idx} x1="30" y1={y} x2="520" y2={y} stroke="#f1f5f9" strokeDasharray="3 3" />
                  ))}

                  {/* Grouped Bars */}
                  {barData.map((d, i) => {
                    const x = 50 + i * 68
                    const heightA = (d.valA / 22000) * 150
                    const heightB = (d.valB / 22000) * 150
                    const yA = 190 - heightA
                    const yB = 190 - heightB
                    const delay = i * motionTheme.stagger.base

                    return (
                      <g key={`${i}-${chartKey}`}>
                        {/* Bar A (Blue) */}
                        <rect
                          x={x}
                          y={yA}
                          width="12"
                          height={heightA}
                          rx="3"
                          fill="#3b82f6"
                          className="bar-rect"
                          style={{
                            transformOrigin: `${x + 6}px 190px`,
                            animation: `barRise ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                            animationDelay: `${delay}s`,
                          }}
                        />
                        {/* Bar B (Orange) */}
                        <rect
                          x={x + 14}
                          y={yB}
                          width="12"
                          height={heightB}
                          rx="3"
                          fill="#f97316"
                          className="bar-rect"
                          style={{
                            transformOrigin: `${x + 20}px 190px`,
                            animation: `barRise ${getPresetCssTransition(motionPreset).duration} ${getPresetCssTransition(motionPreset).timingFunction} forwards`,
                            animationDelay: `${delay + motionTheme.stagger.tight}s`,
                          }}
                        />
                        {/* Day label */}
                        <text x={x + 13} y="208" textAnchor="middle" className="bar-day-label">
                          {d.day.split(' ')[1]}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* Model Benchmark Comparative Matrix */}
          <div className="benchmark-matrix-card">
            <div className="matrix-card-header">
              <div>
                <h3>Production Model Evaluation & Candidate Rankings</h3>
                <p>Transparent benchmark calculations across current active initiatives.</p>
              </div>
              <span className="matrix-badge">Empirical Results</span>
            </div>

            <table className="benchmark-table">
              <thead>
                <tr>
                  <th>CANDIDATE MODEL</th>
                  <th>ROC-AUC</th>
                  <th>F1 SCORE</th>
                  <th>PRECISION</th>
                  <th>RECALL</th>
                  <th>LATENCY</th>
                  <th>RECOMMENDATION</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>CatBoost Enterprise v2.4 (Champion)</strong></td>
                  <td><span className="score-badge best">0.942</span></td>
                  <td>0.891</td>
                  <td>0.912</td>
                  <td>0.871</td>
                  <td>11.4 ms</td>
                  <td><span className="rec-badge approved">Production Champion</span></td>
                </tr>
                <tr>
                  <td><strong>XGBoost Gradient Matrix (Challenger)</strong></td>
                  <td><span className="score-badge high">0.931</span></td>
                  <td>0.879</td>
                  <td>0.895</td>
                  <td>0.864</td>
                  <td>14.8 ms</td>
                  <td><span className="rec-badge canary">Canary Traffic (15%)</span></td>
                </tr>
                <tr>
                  <td><strong>LightGBM Fast-Inference</strong></td>
                  <td><span className="score-badge">0.915</span></td>
                  <td>0.862</td>
                  <td>0.880</td>
                  <td>0.845</td>
                  <td>8.2 ms</td>
                  <td><span className="rec-badge shadow">Shadow Evaluation</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bottom Floating Action Brief Banner (Exact match to Image 2!) */}
          {showBriefBanner && (
            <div className="traffic-brief-banner">
              <div className="brief-content-left">
                <span className="brief-icon">📋</span>
                <div>
                  <strong>Start a Model Optimization Brief</strong>
                  <p>Tell us what performance targets you need and find the right hyperparameter strategy for your project.</p>
                </div>
              </div>
              <div className="brief-actions">
                <button
                  type="button"
                  className="btn-primary brief-cta-btn"
                  onClick={triggerVectorCompute}
                >
                  Get Started
                </button>
                <button
                  type="button"
                  className="btn-close brief-close-btn"
                  onClick={() => setShowBriefBanner(false)}
                  aria-label="Dismiss banner"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          VIEW MODE 2: THE VECTOR COMPUTER / HARDWARE CONSOLE (SUPERLINKED STYLE)
         ===================================================================== */}
      {viewMode === 'hardware' && (
        <div className="hardware-console-container">
          {/* Hardware Header Details */}
          <div className="console-top-strip">
            <div className="console-brand">
              <span className="console-logo">⬡</span>
              <strong>Superlinked // DaTaIcon Vector Computer</strong>
            </div>
            <div className="console-specs">
              <span>SYSTEM: 0.9.2</span>
              <span>BUS: e2733/xv-4LDF</span>
              <span>PCB: Superlinked Pilo v3.2</span>
              <span className="status-led-group">
                <span className="led-dot green" />
                <span className="led-dot green" />
                <span className="led-dot orange" />
              </span>
            </div>
          </div>

          {/* Motherboard PCB Stage */}
          <div className={`pcb-motherboard-surface ${activeCircuitPulse ? 'pulse-active' : ''}`}>
            {/* Background Circuit Traces with Amber Glowing Data Conduits */}
            <svg className="pcb-circuit-traces-svg" viewBox="0 0 1100 680" preserveAspectRatio="none">
              <defs>
                <linearGradient id="amberTraceGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#ffedd5" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Physical Circuit tracks */}
              <path d="M 280 180 L 420 180 L 480 300 L 520 300" className="circuit-bus-base" />
              <path d="M 280 320 L 430 320 L 490 340 L 520 340" className="circuit-bus-base" />
              <path d="M 280 460 L 420 460 L 480 380 L 520 380" className="circuit-bus-base" />
              <path d="M 680 320 L 760 320 L 820 220 L 880 220" className="circuit-bus-base" />
              <path d="M 680 360 L 780 360 L 830 380 L 880 380" className="circuit-bus-base" />
              <path d="M 680 400 L 760 400 L 820 500 L 880 500" className="circuit-bus-base" />

              {/* Glowing Amber Pulse Conduits (dots flowing) */}
              <path d="M 280 180 L 420 180 L 480 300 L 520 300" className="circuit-conduit-glow" />
              <path d="M 280 320 L 430 320 L 490 340 L 520 340" className="circuit-conduit-glow" />
              <path d="M 280 460 L 420 460 L 480 380 L 520 380" className="circuit-conduit-glow" />
              <path d="M 680 320 L 760 320 L 820 220 L 880 220" className="circuit-conduit-glow" />
              <path d="M 680 360 L 780 360 L 830 380 L 880 380" className="circuit-conduit-glow" />
            </svg>

            {/* Left Module Stack */}
            <div className="pcb-left-rack">
              {/* Module 1: Knowledge Base */}
              <div
                className={`tactile-pcb-card ${selectedModule === 'knowledge-base' ? 'selected' : ''}`}
                onClick={() => setSelectedModule('knowledge-base')}
              >
                <div className="tactile-card-header">
                  <div className="tactile-icon-badge">📄 🌿</div>
                  <span className="tactile-led-dot active" />
                </div>
                <div className="tactile-card-label">KNOWLEDGE BASE</div>
                <div className="tactile-card-sub">Vector retrieval store</div>
                <div className="pin-contacts-row">
                  {[...Array(6)].map((_, i) => (
                    <span key={i} className="pin-dot" />
                  ))}
                </div>
              </div>

              {/* Module 2: Accepted Answers */}
              <div
                className={`tactile-pcb-card ${selectedModule === 'accepted-answers' ? 'selected' : ''}`}
                onClick={() => setSelectedModule('accepted-answers')}
              >
                <div className="tactile-card-header">
                  <div className="tactile-icon-badge">👁️ 🌿</div>
                  <span className="tactile-led-dot active" />
                </div>
                <div className="tactile-card-label">ACCEPTED ANSWERS</div>
                <div className="tactile-card-sub">Synthesized outputs</div>
                <div className="pin-contacts-row">
                  {[...Array(6)].map((_, i) => (
                    <span key={i} className="pin-dot" />
                  ))}
                </div>
              </div>

              {/* Module 3: Analytics */}
              <div
                className={`tactile-pcb-card ${selectedModule === 'analytics-core' ? 'selected' : ''}`}
                onClick={() => setSelectedModule('analytics-core')}
              >
                <div className="tactile-card-header">
                  <div className="tactile-icon-badge">🎯 ⚙️</div>
                  <span className="tactile-led-dot active" />
                </div>
                <div className="tactile-card-label">ANALYTICS</div>
                <div className="tactile-card-sub">Inference telemetry</div>
                <div className="pin-contacts-row">
                  {[...Array(6)].map((_, i) => (
                    <span key={i} className="pin-dot" />
                  ))}
                </div>
              </div>
            </div>

            {/* Center Piece: THE VECTOR COMPUTER Console */}
            <div className="pcb-center-core">
              <div className="the-vector-computer-box">
                <div className="vector-box-top-tag">
                  <span className="core-led-strip">
                    <span className="led orange" />
                    <span className="led orange" />
                    <span className="led orange" />
                  </span>
                  <span className="box-hex-mark">⬡</span>
                </div>

                <h2 className="vector-box-title">
                  THE VECTOR<br />COMPUTER
                </h2>

                <p className="vector-box-tagline">
                  The only compute platform your vector retrieval stack needs.
                </p>

                {/* Tactile Push Button */}
                <button
                  type="button"
                  className="tactile-action-button"
                  onClick={triggerVectorCompute}
                >
                  <span className="button-arrow">◂</span>
                  <span className="button-text">QUESTION ANSWERING</span>
                </button>

                {/* Hardware slot drive */}
                <div className="hardware-drive-slot">
                  <div className="slot-recess" />
                </div>
              </div>

              {/* Get Early Access / Hardware Trigger pill */}
              <div className="get-access-pill-wrapper">
                <button
                  type="button"
                  className="get-access-tactile-btn"
                  onClick={triggerVectorCompute}
                >
                  <span className="hex-btn-icon">⬡</span>
                  <span>HARDWARE ACCELERATE</span>
                </button>
              </div>
            </div>

            {/* Right Module Stack */}
            <div className="pcb-right-rack">
              {/* Module 4: Vector Database */}
              <div
                className={`tactile-rack-shelf ${selectedModule === 'vector-db' ? 'selected' : ''}`}
                onClick={() => setSelectedModule('vector-db')}
              >
                <div className="shelf-header">
                  <div className="shelf-title">VECTOR DATABASE</div>
                  <div className="shelf-icons">🗄️ ⚙️ 🔍</div>
                </div>
                <div className="shelf-meta">data-slot 01 // Air-Gapped</div>
                <div className="shelf-mount-screws">
                  <span className="screw-head" />
                  <span className="screw-head" />
                </div>
              </div>

              {/* Module 5: Secure Enclave Bus */}
              <div
                className={`tactile-rack-shelf ${selectedModule === 'enclave-bus' ? 'selected' : ''}`}
                onClick={() => setSelectedModule('enclave-bus')}
              >
                <div className="shelf-header">
                  <div className="shelf-title">SECURE ENCLAVE BUS</div>
                  <div className="shelf-icons">🔒 ⚡</div>
                </div>
                <div className="shelf-meta">zero-leakage verified</div>
                <div className="shelf-mount-screws">
                  <span className="screw-head" />
                  <span className="screw-head" />
                </div>
              </div>

              {/* Module 6: Audit Log Microchip */}
              <div
                className={`tactile-rack-shelf ${selectedModule === 'audit-chip' ? 'selected' : ''}`}
                onClick={() => setSelectedModule('audit-chip')}
              >
                <div className="shelf-header">
                  <div className="shelf-title">AUDIT LEDGER</div>
                  <div className="shelf-icons">📋 🛡️</div>
                </div>
                <div className="shelf-meta">SHA-256 tamper proof</div>
                <div className="shelf-mount-screws">
                  <span className="screw-head" />
                  <span className="screw-head" />
                </div>
              </div>
            </div>

            {/* Motherboard Details: DIP chips, barcode, cooling grills */}
            <div className="pcb-ic-chip chip-1">
              <span className="chip-label">DP-AI-X1</span>
            </div>
            <div className="pcb-ic-chip chip-2">
              <span className="chip-label">RAM-SEC</span>
            </div>
            <div className="pcb-barcode-stamp">
              <span className="barcode-bars">|||| ||| ||||| ||</span>
              <span className="barcode-text">DP-HW-9941</span>
            </div>
            <div className="pcb-cooling-vents">
              <span className="vent-line" />
              <span className="vent-line" />
              <span className="vent-line" />
              <span className="vent-line" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sparkline helper with physics spring motion
function SparklineSvg({
  data,
  color,
  isNegative,
  motionDuration,
  motionEase,
  chartKey,
}: {
  data: number[]
  color: string
  isNegative?: boolean
  motionDuration?: string
  motionEase?: string
  chartKey?: number
}) {
  const id = useId()
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 120
  const height = 44

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - 8) + 4
    const y = height - 6 - ((val - min) / range) * (height - 14)
    return { x, y }
  })

  // Smooth curve path
  let pathD = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
  const lastPoint = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="sparkline-svg">
      <defs>
        <linearGradient id={`sparkGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        key={`sparkArea-${chartKey}`}
        d={areaD}
        fill={`url(#sparkGrad-${id})`}
        style={{
          animation: `fadeArea ${motionDuration || '450ms'} ${motionEase || 'ease-out'} forwards`,
        }}
      />
      <path
        key={`sparkLine-${chartKey}`}
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          animation: `drawPath ${motionDuration || '450ms'} ${motionEase || 'ease-out'} forwards`,
        }}
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={color} />
    </svg>
  )
}

function computeSmoothSvgPath(
  data: number[],
  startX: number,
  stepX: number,
  baseY: number,
  minVal: number,
  rangeVal: number
): string {
  const points = data.map((val, i) => ({
    x: startX + i * stepX,
    y: baseY - ((val - minVal) / rangeVal) * 180,
  }))

  let pathD = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]

    const cp1x = p1.x + (p2.x - p0.x) / 4
    const cp1y = p1.y + (p2.y - p0.y) / 4
    const cp2x = p2.x - (p3.x - p1.x) / 4
    const cp2y = p2.y - (p3.y - p1.y) / 4

    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return pathD
}

function computeAreaSvgPath(
  data: number[],
  startX: number,
  stepX: number,
  baseY: number,
  minVal: number,
  rangeVal: number
): string {
  const linePath = computeSmoothSvgPath(data, startX, stepX, baseY, minVal, rangeVal)
  const lastX = startX + (data.length - 1) * stepX
  return `${linePath} L ${lastX} ${baseY} L ${startX} ${baseY} Z`
}

export default AnalysisView
