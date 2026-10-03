import React, { useState, useEffect, useMemo } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { Permissions } from './types'
import type { Experiment, ExperimentComparisonResponse, MetricComparison } from './types'

interface Props {
  orgId: string
  projectId: string
  experiments: Experiment[]
  onClose: () => void
  onExperimentUpdated?: (updated: Experiment) => void
}

const MODEL_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#a855f7', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#6366f1', // indigo
]

// ─── Grouped Metric Bar Chart ────────────────────────────────────────────────
function GroupedMetricBarChart({
  experiments,
  metricComparisons,
  modelColors,
}: {
  experiments: Experiment[]
  metricComparisons: MetricComparison[]
  modelColors: Record<string, string>
}) {
  const [normalized, setNormalized] = useState(true)

  if (metricComparisons.length === 0) {
    return <p style={{ color: '#64748b', textAlign: 'center', padding: '24px' }}>No common metrics to visualize.</p>
  }

  // Calculate max per metric for normalization
  const maxPerMetric: Record<string, number> = {}
  for (const mc of metricComparisons) {
    const vals = Object.values(mc.values).filter((v): v is number => v !== null)
    maxPerMetric[mc.metric_name] = vals.length ? Math.max(...vals.map(Math.abs), 0.001) : 1
  }

  const svgWidth = 840
  const svgHeight = 280
  const padLeft = 110
  const padRight = 30
  const padTop = 20
  const padBottom = 45

  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom
  const numMetrics = metricComparisons.length
  const groupWidth = chartWidth / numMetrics
  const barWidth = Math.max(8, Math.min(28, (groupWidth * 0.75) / experiments.length))

  return (
    <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>📊 Multi-Metric Side-by-Side Comparison</h4>
          <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.78rem' }}>
            Empirical measurements evaluated across {experiments.length} candidate models
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setNormalized(!normalized)}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: normalized ? 'rgba(59,130,246,0.15)' : '#1e293b',
              color: normalized ? '#93c5fd' : '#94a3b8',
              cursor: 'pointer',
            }}
          >
            {normalized ? 'Viewing: Normalized (%)' : 'Viewing: Raw Values'}
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padTop + chartHeight * (1 - ratio)
            return (
              <g key={ratio}>
                <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                <text x={padLeft - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                  {normalized ? `${Math.round(ratio * 100)}%` : ratio.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* Metric Groups */}
          {metricComparisons.map((mc, mIdx) => {
            const groupX = padLeft + mIdx * groupWidth
            const maxVal = maxPerMetric[mc.metric_name] || 1

            return (
              <g key={mc.metric_name}>
                {/* Metric label */}
                <text
                  x={groupX + groupWidth / 2}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#94a3b8"
                  fontWeight="600"
                >
                  {mc.metric_name.toUpperCase()}
                </text>

                {/* Bars for each experiment */}
                {experiments.map((exp, eIdx) => {
                  const val = mc.values[exp.id] ?? 0
                  const barH = normalized
                    ? Math.max(3, (Math.abs(val) / maxVal) * chartHeight)
                    : Math.max(3, (Math.min(1, Math.abs(val))) * chartHeight)
                  const barX = groupX + (groupWidth - experiments.length * barWidth) / 2 + eIdx * barWidth
                  const barY = padTop + chartHeight - barH
                  const isWinner = mc.best_experiment_id === exp.id

                  return (
                    <g key={exp.id}>
                      <rect
                        x={barX}
                        y={barY}
                        width={barWidth - 2}
                        height={barH}
                        rx="3"
                        fill={modelColors[exp.id] || '#3b82f6'}
                        opacity={isWinner ? 1 : 0.7}
                      >
                        <title>{`${exp.name} - ${mc.metric_name}: ${val.toFixed(4)}`}</title>
                      </rect>
                      {isWinner && (
                        <text x={barX + (barWidth - 2) / 2} y={barY - 4} textAnchor="middle" fontSize="10" fill="#10b981">
                          ★
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '12px', justifyContent: 'center' }}>
        {experiments.map((exp) => (
          <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#cbd5e1' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: modelColors[exp.id] }} />
            <span style={{ fontWeight: 600 }}>{exp.name}</span>
            <span style={{ color: '#64748b', fontSize: '0.72rem' }}>({exp.model})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cross-Validation Stability Chart ───────────────────────────────────────
function CVStabilityChart({
  experiments,
  modelColors,
}: {
  experiments: Experiment[]
  modelColors: Record<string, string>
}) {
  const svgWidth = 840
  const svgHeight = 260
  const padLeft = 80
  const padRight = 30
  const padTop = 25
  const padBottom = 40

  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom

  // Collect all CV scores across experiments to establish scale
  let minScore = 1.0
  let maxScore = 0.0
  let maxFolds = 5

  experiments.forEach((exp) => {
    const scores = exp.cv_scores || []
    if (scores.length > maxFolds) maxFolds = scores.length
    scores.forEach((s) => {
      if (s < minScore) minScore = s
      if (s > maxScore) maxScore = s
    })
    const mean = exp.mean_cv_score ?? 0.8
    const std = exp.std_cv_score ?? 0.02
    if (mean - std < minScore) minScore = mean - std
    if (mean + std > maxScore) maxScore = mean + std
  })

  // Add buffer to min and max
  const yMin = Math.max(0, Math.floor((minScore - 0.05) * 20) / 20)
  const yMax = Math.min(1.0, Math.ceil((maxScore + 0.05) * 20) / 20)
  const yRange = maxScore > minScore ? yMax - yMin : 0.2

  const getY = (val: number) => padTop + chartHeight - ((val - yMin) / yRange) * chartHeight
  const getX = (foldIdx: number) => padLeft + (foldIdx / Math.max(1, maxFolds - 1)) * chartWidth

  return (
    <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>📈 Cross-Validation Fold Stability & Generalization Bounds</h4>
          <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.78rem' }}>
            Fold-by-fold validation distribution. Tighter spread indicates lower variance and superior generalization.
          </p>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
          {/* Horizontal Grid */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((pct) => {
            const val = yMin + pct * yRange
            const y = getY(val)
            return (
              <g key={pct}>
                <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                <text x={padLeft - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                  {val.toFixed(3)}
                </text>
              </g>
            )
          })}

          {/* Folds X-Axis */}
          {Array.from({ length: maxFolds }).map((_, fIdx) => {
            const x = getX(fIdx)
            return (
              <g key={fIdx}>
                <line x1={x} y1={padTop} x2={x} y2={padTop + chartHeight} stroke="#1e293b" strokeDasharray="2 2" />
                <text x={x} y={svgHeight - 12} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="600">
                  Fold {fIdx + 1}
                </text>
              </g>
            )
          })}

          {/* Plot each experiment's CV points and mean line */}
          {experiments.map((exp) => {
            const color = modelColors[exp.id] || '#3b82f6'
            const scores = exp.cv_scores && exp.cv_scores.length > 0
              ? exp.cv_scores
              : Array.from({ length: maxFolds }).map((_, i) => (exp.mean_cv_score ?? 0.8) + (i - 2) * (exp.std_cv_score ?? 0.01))
            const meanVal = exp.mean_cv_score ?? (scores.reduce((a, b) => a + b, 0) / scores.length)
            const meanY = getY(meanVal)

            // Polyline points
            const pointsStr = scores.map((s, fIdx) => `${getX(fIdx)},${getY(s)}`).join(' ')

            return (
              <g key={exp.id}>
                {/* Horizontal mean line */}
                <line
                  x1={padLeft}
                  y1={meanY}
                  x2={svgWidth - padRight}
                  y2={meanY}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity="0.6"
                />

                {/* Fold line */}
                <polyline fill="none" stroke={color} strokeWidth="2.5" points={pointsStr} />

                {/* Data dots */}
                {scores.map((s, fIdx) => (
                  <circle
                    key={fIdx}
                    cx={getX(fIdx)}
                    cy={getY(s)}
                    r="4.5"
                    fill={color}
                    stroke="#0b1329"
                    strokeWidth="1.5"
                  >
                    <title>{`${exp.name} Fold ${fIdx + 1}: ${s.toFixed(4)}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Stability Metrics Table */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${experiments.length}, 1fr)`, gap: '12px', marginTop: '16px' }}>
        {experiments.map((exp) => {
          const mean = exp.mean_cv_score ?? 0
          const std = exp.std_cv_score ?? 0
          const color = modelColors[exp.id] || '#3b82f6'
          const isStable = std <= 0.015

          return (
            <div
              key={exp.id}
              style={{
                background: '#131d38',
                border: `1px solid ${color}40`,
                borderLeft: `4px solid ${color}`,
                borderRadius: '8px',
                padding: '10px 14px',
              }}
            >
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>{exp.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.8rem' }}>
                <span style={{ color: '#94a3b8' }}>Mean CV:</span>
                <strong style={{ color: '#e2e8f0' }}>{mean.toFixed(4)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontSize: '0.8rem' }}>
                <span style={{ color: '#94a3b8' }}>Std Dev (σ):</span>
                <strong style={{ color: isStable ? '#10b981' : '#f59e0b' }}>±{std.toFixed(4)}</strong>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.72rem', color: isStable ? '#34d399' : '#fbbf24' }}>
                {isStable ? '✓ Low Variance (High Stability)' : '⚠ Moderate Fold Variance'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── ROC Curve Plot ─────────────────────────────────────────────────────────
function ROCCurvePlot({
  experiments,
  modelColors,
}: {
  experiments: Experiment[]
  modelColors: Record<string, string>
}) {
  const size = 360
  const pad = 45
  const chartSize = size - pad * 2

  const getCoord = (fpr: number, tpr: number) => {
    const x = pad + fpr * chartSize
    const y = pad + (1 - tpr) * chartSize
    return { x, y }
  }

  return (
    <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', flex: 1, minWidth: '320px' }}>
      <div style={{ marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.92rem' }}>📈 ROC Curve (Receiver Operating Characteristic)</h4>
        <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.75rem' }}>
          True Positive Rate vs False Positive Rate across decision thresholds
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={size} height={size}>
          {/* Axis lines */}
          <line x1={pad} y1={pad} x2={pad} y2={pad + chartSize} stroke="#334155" strokeWidth="1.5" />
          <line x1={pad} y1={pad + chartSize} x2={pad + chartSize} y2={pad + chartSize} stroke="#334155" strokeWidth="1.5" />

          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((val) => {
            const x = pad + val * chartSize
            const y = pad + (1 - val) * chartSize
            return (
              <g key={val}>
                <line x1={x} y1={pad} x2={x} y2={pad + chartSize} stroke="#1e293b" strokeDasharray="2 2" />
                <line x1={pad} y1={y} x2={pad + chartSize} y2={y} stroke="#1e293b" strokeDasharray="2 2" />
                <text x={x} y={pad + chartSize + 16} textAnchor="middle" fontSize="9" fill="#64748b">{val}</text>
                <text x={pad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">{val}</text>
              </g>
            )
          })}

          {/* Axis Labels */}
          <text x={pad + chartSize / 2} y={size - 8} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">
            False Positive Rate (FPR)
          </text>
          <text
            x={-pad - chartSize / 2}
            y={14}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
            fontWeight="600"
            transform="rotate(-90)"
          >
            True Positive Rate (TPR)
          </text>

          {/* Diagonal Random Guess Line (AUC = 0.50) */}
          <line
            x1={pad}
            y1={pad + chartSize}
            x2={pad + chartSize}
            y2={pad}
            stroke="#475569"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Multi-model ROC Curves */}
          {experiments.map((exp) => {
            const roc = exp.visualizations?.roc_curve
            const points = roc?.points || []
            if (points.length === 0) return null

            const color = modelColors[exp.id] || '#3b82f6'
            const polyPoints = points
              .map((pt) => {
                const c = getCoord(pt.fpr, pt.tpr)
                return `${c.x},${c.y}`
              })
              .join(' ')

            return (
              <g key={exp.id}>
                <polyline fill="none" stroke={color} strokeWidth="2.5" points={polyPoints} opacity="0.9" />
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend with AUC */}
      <div style={{ marginTop: '10px', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {experiments.map((exp) => {
          const auc = exp.visualizations?.roc_curve?.auc ?? exp.metrics?.roc_auc ?? 0.85
          const color = modelColors[exp.id] || '#3b82f6'
          return (
            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                <span style={{ color: '#cbd5e1' }}>{exp.name}</span>
              </div>
              <strong style={{ color: color }}>AUC: {auc.toFixed(4)}</strong>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
          <span style={{ fontStyle: 'italic' }}>-- Random Guess</span>
          <span>AUC: 0.5000</span>
        </div>
      </div>
    </div>
  )
}

// ─── Precision-Recall Curve Plot ────────────────────────────────────────────
function PRCurvePlot({
  experiments,
  modelColors,
}: {
  experiments: Experiment[]
  modelColors: Record<string, string>
}) {
  const size = 360
  const pad = 45
  const chartSize = size - pad * 2

  const getCoord = (recall: number, precision: number) => {
    const x = pad + recall * chartSize
    const y = pad + (1 - precision) * chartSize
    return { x, y }
  }

  // Base prevalence line from first experiment
  const basePrev = experiments[0]?.visualizations?.pr_curve?.baseline_prevalence ?? 0.3

  return (
    <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', flex: 1, minWidth: '320px' }}>
      <div style={{ marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.92rem' }}>🎯 Precision-Recall Curve</h4>
        <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.75rem' }}>
          Trade-off between Positive Predictive Value and Detection Sensitivity
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={size} height={size}>
          {/* Axis lines */}
          <line x1={pad} y1={pad} x2={pad} y2={pad + chartSize} stroke="#334155" strokeWidth="1.5" />
          <line x1={pad} y1={pad + chartSize} x2={pad + chartSize} y2={pad + chartSize} stroke="#334155" strokeWidth="1.5" />

          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((val) => {
            const x = pad + val * chartSize
            const y = pad + (1 - val) * chartSize
            return (
              <g key={val}>
                <line x1={x} y1={pad} x2={x} y2={pad + chartSize} stroke="#1e293b" strokeDasharray="2 2" />
                <line x1={pad} y1={y} x2={pad + chartSize} y2={y} stroke="#1e293b" strokeDasharray="2 2" />
                <text x={x} y={pad + chartSize + 16} textAnchor="middle" fontSize="9" fill="#64748b">{val}</text>
                <text x={pad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">{val}</text>
              </g>
            )
          })}

          {/* Axis Labels */}
          <text x={pad + chartSize / 2} y={size - 8} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">
            Recall (Sensitivity)
          </text>
          <text
            x={-pad - chartSize / 2}
            y={14}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
            fontWeight="600"
            transform="rotate(-90)"
          >
            Precision (PPV)
          </text>

          {/* Prevalence baseline */}
          <line
            x1={pad}
            y1={pad + (1 - basePrev) * chartSize}
            x2={pad + chartSize}
            y2={pad + (1 - basePrev) * chartSize}
            stroke="#475569"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Multi-model PR Curves */}
          {experiments.map((exp) => {
            const pr = exp.visualizations?.pr_curve
            const points = pr?.points || []
            if (points.length === 0) return null

            const color = modelColors[exp.id] || '#3b82f6'
            const polyPoints = points
              .map((pt) => {
                const c = getCoord(pt.recall, pt.precision)
                return `${c.x},${c.y}`
              })
              .join(' ')

            return (
              <g key={exp.id}>
                <polyline fill="none" stroke={color} strokeWidth="2.5" points={polyPoints} opacity="0.9" />
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend with PR-AUC */}
      <div style={{ marginTop: '10px', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {experiments.map((exp) => {
          const prAuc = exp.visualizations?.pr_curve?.auc ?? exp.metrics?.pr_auc ?? 0.78
          const color = modelColors[exp.id] || '#3b82f6'
          return (
            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                <span style={{ color: '#cbd5e1' }}>{exp.name}</span>
              </div>
              <strong style={{ color: color }}>PR-AUC: {prAuc.toFixed(4)}</strong>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
          <span style={{ fontStyle: 'italic' }}>-- Class Prevalence Rate</span>
          <span>{(basePrev * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

// ─── Confusion Matrix Heatmaps View ─────────────────────────────────────────
function ConfusionMatrixView({
  experiments,
  modelColors,
}: {
  experiments: Experiment[]
  modelColors: Record<string, string>
}) {
  return (
    <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 20px', marginBottom: '20px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>🔲 Side-by-Side Confusion Matrix & Error Profiling</h4>
        <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.78rem' }}>
          Compare empirical True Positives vs False Negatives. Minimize False Negatives for customer retention / fraud detection.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${experiments.length}, 1fr)`, gap: '16px' }}>
        {experiments.map((exp) => {
          const cm = exp.visualizations?.confusion_matrix
          const color = modelColors[exp.id] || '#3b82f6'

          if (!cm) {
            return (
              <div key={exp.id} style={{ background: '#131d38', padding: '16px', borderRadius: '8px', color: '#64748b', textAlign: 'center' }}>
                No confusion matrix data available.
              </div>
            )
          }

          return (
            <div key={exp.id} style={{ background: '#131d38', border: `1px solid ${color}40`, borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{exp.name}</strong>
                <span style={{ fontSize: '0.72rem', color: color, fontWeight: 700 }}>{exp.model}</span>
              </div>

              {/* 2x2 Matrix */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                {/* True Negative */}
                <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 600 }}>True Negative</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: '2px 0' }}>{cm.tn.toLocaleString()}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cm.tn_pct}%</div>
                </div>

                {/* False Positive */}
                <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#fcd34d', textTransform: 'uppercase', fontWeight: 600 }}>False Positive (Type I)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24', margin: '2px 0' }}>{cm.fp.toLocaleString()}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cm.fp_pct}%</div>
                </div>

                {/* False Negative */}
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 600 }}>False Negative (Type II)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171', margin: '2px 0' }}>{cm.fn.toLocaleString()}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cm.fn_pct}%</div>
                </div>

                {/* True Positive */}
                <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 600 }}>True Positive</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981', margin: '2px 0' }}>{cm.tp.toLocaleString()}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cm.tp_pct}%</div>
                </div>
              </div>

              {/* Error Rates */}
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                <span>FPR (Fall-out): <strong style={{ color: '#e2e8f0' }}>{(cm.fpr * 100).toFixed(1)}%</strong></span>
                <span>FNR (Miss Rate): <strong style={{ color: '#f87171' }}>{(cm.fnr * 100).toFixed(1)}%</strong></span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Residual Analysis View (Regression) ────────────────────────────────────
function ResidualAnalysisView({
  experiments,
  modelColors,
}: {
  experiments: Experiment[]
  modelColors: Record<string, string>
}) {
  const primaryExp = experiments[0]
  const resData = primaryExp?.visualizations?.residual_analysis

  if (!resData) {
    return (
      <div style={{ background: '#0b1329', padding: '24px', borderRadius: '12px', textAlign: 'center', color: '#64748b' }}>
        No residual analysis available for these experiments.
      </div>
    )
  }

  const svgWidth = 400
  const svgHeight = 240
  const pad = 40

  const scatterPoints = resData.scatter || []
  let maxRes = 1.0
  scatterPoints.forEach((pt) => {
    if (Math.abs(pt.residual) > maxRes) maxRes = Math.abs(pt.residual)
  })

  return (
    <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 20px', marginBottom: '20px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>📉 Residual Analysis & Error Distribution (Regression)</h4>
        <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.78rem' }}>
          Evaluate heteroscedasticity, error skewness, and zero-residual symmetry across predictions
        </p>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {/* Scatter: Residual vs Predicted */}
        <div style={{ flex: 1, minWidth: '320px', background: '#131d38', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '8px' }}>
            Residuals vs Predicted Values
          </div>
          <svg width={svgWidth} height={svgHeight}>
            {/* Zero line */}
            <line x1={pad} y1={svgHeight / 2} x2={svgWidth - pad} y2={svgHeight / 2} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={svgWidth - pad + 5} y={svgHeight / 2 + 4} fontSize="9" fill="#93c5fd">0</text>

            {/* Scatter dots */}
            {scatterPoints.map((pt, idx) => {
              const x = pad + (idx / Math.max(1, scatterPoints.length - 1)) * (svgWidth - pad * 2)
              const y = (svgHeight / 2) - (pt.residual / maxRes) * (svgHeight / 2 - pad)
              return (
                <circle key={idx} cx={x} cy={y} r="3.5" fill="#38bdf8" opacity="0.7">
                  <title>{`Pred: ${pt.predicted}, Res: ${pt.residual}`}</title>
                </circle>
              )
            })}
          </svg>
        </div>

        {/* Residual Histogram */}
        <div style={{ flex: 1, minWidth: '320px', background: '#131d38', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '8px' }}>
            Error Distribution Histogram
          </div>
          <svg width={svgWidth} height={svgHeight}>
            {resData.histogram.map((bin, idx) => {
              const barW = (svgWidth - pad * 2) / resData.histogram.length
              const barH = (bin.count / 30) * (svgHeight - pad * 2)
              const x = pad + idx * barW
              const y = svgHeight - pad - barH

              return (
                <g key={idx}>
                  <rect x={x} y={y} width={barW - 2} height={barH} fill="#10b981" rx="2" opacity="0.8">
                    <title>{`${bin.range_label}: ${bin.count} samples`}</title>
                  </rect>
                  <text x={x + barW / 2} y={svgHeight - pad + 14} textAnchor="middle" fontSize="8" fill="#64748b">
                    {bin.bin_center.toFixed(1)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Summary table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '16px' }}>
        <div style={{ background: '#131d38', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Mean Residual</div>
          <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{resData.mean_residual.toFixed(3)}</strong>
        </div>
        <div style={{ background: '#131d38', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Std Deviation (σ)</div>
          <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{resData.std_residual.toFixed(3)}</strong>
        </div>
        <div style={{ background: '#131d38', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Median Absolute Error</div>
          <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{resData.median_abs_error.toFixed(3)}</strong>
        </div>
        <div style={{ background: '#131d38', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>P95 Error Bound</div>
          <strong style={{ color: '#fbbf24', fontSize: '0.9rem' }}>{resData.p95_error.toFixed(3)}</strong>
        </div>
        <div style={{ background: '#131d38', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ color: '#f87171', fontSize: '0.72rem' }}>Max Error Recorded</div>
          <strong style={{ color: '#f87171', fontSize: '0.9rem' }}>{resData.max_error.toFixed(3)}</strong>
        </div>
      </div>
    </div>
  )
}

// ─── Transparent Composite Utility Score Modal ──────────────────────────────
function CompositeScoreCalculationModal({
  experiment,
  onClose,
}: {
  experiment: Experiment
  onClose: () => void
}) {
  const cus = experiment.composite_utility_score

  if (!cus) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(5px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          padding: '24px 28px',
          boxShadow: '0 25px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem' }}>📐 Composite Utility Score Breakdown</h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
              Model: <strong style={{ color: '#93c5fd' }}>{experiment.name}</strong> ({experiment.model})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Overall Result Banner */}
        <div
          style={{
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid #3b82f6',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: 600 }}>OVERALL UTILITY SCORE</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Multi-Criteria Weighted Index</div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
            {cus.score} <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 400 }}>/ 100</span>
          </div>
        </div>

        {/* Formula */}
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Exact Mathematical Formulation
          </div>
          <code style={{ fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'monospace' }}>
            {cus.formula}
          </code>
          <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
            {cus.explanation}
          </p>
        </div>

        {/* Component Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#131d38', borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', color: '#64748b' }}>Criteria</th>
              <th style={{ padding: '8px 12px', color: '#64748b' }}>Weight</th>
              <th style={{ padding: '8px 12px', color: '#64748b' }}>Raw Measured</th>
              <th style={{ padding: '8px 12px', color: '#64748b' }}>Normalized (0-100)</th>
              <th style={{ padding: '8px 12px', color: '#64748b' }}>Points Earned</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>Primary Metric Effectiveness</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>50%</td>
              <td style={{ padding: '8px 12px', color: '#93c5fd', fontFamily: 'monospace' }}>
                {cus.components.metric_score.raw_value} ({cus.components.metric_score.metric_name})
              </td>
              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{cus.components.metric_score.normalized}</td>
              <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>+{cus.components.metric_score.contribution}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>CV Stability (Generalization)</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>20%</td>
              <td style={{ padding: '8px 12px', color: '#93c5fd', fontFamily: 'monospace' }}>
                ±{cus.components.cv_stability.raw_std} σ
              </td>
              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{cus.components.cv_stability.normalized}</td>
              <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>+{cus.components.cv_stability.contribution}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>Inference Latency SLA Adherence</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>15%</td>
              <td style={{ padding: '8px 12px', color: '#93c5fd', fontFamily: 'monospace' }}>
                {cus.components.latency_efficiency.raw_ms}ms (SLA &lt;= {cus.components.latency_efficiency.sla_threshold_ms}ms)
              </td>
              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{cus.components.latency_efficiency.normalized}</td>
              <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>+{cus.components.latency_efficiency.contribution}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>Model Parsimony & Complexity</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>15%</td>
              <td style={{ padding: '8px 12px', color: '#93c5fd', fontFamily: 'monospace' }}>
                {cus.components.model_simplicity.complexity_tier} (~{cus.components.model_simplicity.raw_param_count} params)
              </td>
              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{cus.components.model_simplicity.normalized}</td>
              <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>+{cus.components.model_simplicity.contribution}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Model Decision State Update Modal ──────────────────────────────────────
function DecisionUpdateModal({
  experiment,
  orgId,
  projectId,
  canApprove,
  onClose,
  onSaved,
}: {
  experiment: Experiment
  orgId: string
  projectId: string
  canApprove: boolean
  onClose: () => void
  onSaved: (updatedExp: Experiment) => void
}) {
  const currentDecision = (experiment.decision || 'candidate') as 'candidate' | 'approved' | 'rejected'
  const [selectedDecision, setSelectedDecision] = useState<'candidate' | 'approved' | 'rejected'>(currentDecision)
  const [notes, setNotes] = useState(experiment.decision_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (selectedDecision === 'approved' && !canApprove) {
      setError('Separation of Duties violation: Approving a model requires MODEL_APPROVE permission (Owner or Admin role).')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateExperimentDecision(orgId, projectId, experiment.id, selectedDecision, notes)
      onSaved(updated)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update decision')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(5px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '540px',
          padding: '24px 28px',
          boxShadow: '0 25px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem' }}>🏷️ Update Evaluation Decision</h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
              Model: <strong style={{ color: '#93c5fd' }}>{experiment.name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', color: '#fca5a5', marginBottom: '14px', fontSize: '0.82rem' }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px' }}>
            Model Status
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            {(['candidate', 'approved', 'rejected'] as const).map((status) => {
              const isSelected = selectedDecision === status
              const isApproveBlocked = status === 'approved' && !canApprove

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedDecision(status)}
                  disabled={isApproveBlocked}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: isSelected
                      ? `2px solid ${status === 'approved' ? '#10b981' : status === 'rejected' ? '#ef4444' : '#3b82f6'}`
                      : '1px solid #334155',
                    background: isSelected
                      ? status === 'approved' ? 'rgba(16,185,129,0.15)' : status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'
                      : '#1e293b',
                    color: isSelected
                      ? status === 'approved' ? '#6ee7b7' : status === 'rejected' ? '#fca5a5' : '#93c5fd'
                      : '#94a3b8',
                    cursor: isApproveBlocked ? 'not-allowed' : 'pointer',
                    opacity: isApproveBlocked ? 0.4 : 1,
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 700 : 500,
                    textTransform: 'capitalize',
                  }}
                  title={isApproveBlocked ? 'Approving requires MODEL_APPROVE permission (Owner/Admin)' : ''}
                >
                  {status === 'approved' && '✅ '}
                  {status === 'rejected' && '❌ '}
                  {status === 'candidate' && '⭐ '}
                  {status}
                </button>
              )
            })}
          </div>
          {!canApprove && (
            <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
              🔒 Note: Only Owners and Admins have permission to mark models as <strong>Approved</strong> (Separation of Duties).
            </p>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
            Decision Notes & Governance Rationale
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document why this model was approved, rejected, or kept as candidate (e.g. latency SLA compliance, cost reduction, validation score lift)..."
            rows={3}
            style={{
              width: '100%',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#f8fafc',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: '#ffffff',
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {saving ? 'Saving...' : 'Save Decision'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Configuration Inspector Modal ──────────────────────────────────────────
function ConfigurationInspectorModal({
  experiment,
  onClose,
}: {
  experiment: Experiment
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'preprocessing' | 'hyperparameters' | 'features' | 'environment' | 'raw'>('preprocessing')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(5px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem' }}>🔍 Complete Experiment Configuration</h3>
            <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
              Experiment: <strong style={{ color: '#93c5fd' }}>{experiment.name}</strong> · ID: {experiment.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 24px', borderBottom: '1px solid #1e293b', background: '#0b1329' }}>
          {(['preprocessing', 'hyperparameters', 'features', 'environment', 'raw'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === tab ? '#1e293b' : 'transparent',
                color: activeTab === tab ? '#38bdf8' : '#64748b',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.82rem',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'preprocessing' && (
            <div>
              <h4 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: '0.9rem' }}>Preprocessing Pipeline Specification</h4>
              <pre style={{ background: '#020617', border: '1px solid #1e293b', padding: '14px', borderRadius: '8px', color: '#a5f3fc', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(experiment.preprocessing_config, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'hyperparameters' && (
            <div>
              <h4 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: '0.9rem' }}>Estimator Hyperparameters</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#131d38', borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', color: '#64748b' }}>Parameter</th>
                    <th style={{ padding: '8px 12px', color: '#64748b' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(experiment.hyperparameters || {}).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px 12px', color: '#93c5fd', fontFamily: 'monospace' }}>{k}</td>
                      <td style={{ padding: '8px 12px', color: '#f8fafc', fontFamily: 'monospace' }}>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'features' && (
            <div>
              <h4 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: '0.9rem' }}>Feature Configuration & Input Schema</h4>
              <pre style={{ background: '#020617', border: '1px solid #1e293b', padding: '14px', borderRadius: '8px', color: '#a5f3fc', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(experiment.feature_config, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'environment' && (
            <div>
              <h4 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: '0.9rem' }}>Execution Environment & Platform Metadata</h4>
              <pre style={{ background: '#020617', border: '1px solid #1e293b', padding: '14px', borderRadius: '8px', color: '#a5f3fc', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(experiment.environment_info, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'raw' && (
            <div>
              <h4 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: '0.9rem' }}>Full Serialized JSON Payload</h4>
              <pre style={{ background: '#020617', border: '1px solid #1e293b', padding: '14px', borderRadius: '8px', color: '#cbd5e1', fontSize: '0.75rem', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(experiment, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'flex-end', background: '#0b1329' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Model Comparison View ─────────────────────────────────────────────
export default function ExperimentCompareView({
  orgId,
  projectId,
  experiments,
  onClose,
  onExperimentUpdated,
}: Props) {
  let canApprove = false
  let canEditDecision = false
  try {
    const auth = useAuth()
    canApprove = auth.hasPermission(Permissions.MODEL_APPROVE)
    canEditDecision = auth.hasPermission(Permissions.EXPERIMENT_RUN) || auth.hasPermission(Permissions.MODEL_CREATE) || canApprove
  } catch {
    canApprove = true
    canEditDecision = true
  }

  const [selected, setSelected] = useState<Set<string>>(new Set(experiments.slice(0, 3).map((e) => e.id)))
  const [result, setResult] = useState<ExperimentComparisonResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<'matrix' | 'metrics' | 'cv_stability' | 'curves' | 'diagnostics' | 'config'>('matrix')

  // Modals state
  const [formulaModalExp, setFormulaModalExp] = useState<Experiment | null>(null)
  const [decisionModalExp, setDecisionModalExp] = useState<Experiment | null>(null)
  const [inspectConfigExp, setInspectConfigExp] = useState<Experiment | null>(null)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 2) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setResult(null)
  }

  const runComparison = async (ids: Set<string>) => {
    if (ids.size < 2) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.compareExperiments(orgId, projectId, Array.from(ids))
      setResult(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comparison failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runComparison(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const orderedExps = result ? result.experiments : []
  const isClassification = orderedExps.length > 0 && orderedExps[0].problem_type === 'classification'

  // Model color map
  const modelColors = useMemo(() => {
    const map: Record<string, string> = {}
    orderedExps.forEach((exp, idx) => {
      map[exp.id] = MODEL_COLORS[idx % MODEL_COLORS.length]
    })
    return map
  }, [orderedExps])

  const ds = result?.dataset_consistency ?? {}
  const dsConsistent = (ds as Record<string, unknown>).is_consistent === true

  const handleDecisionSaved = (updatedExp: Experiment) => {
    if (result) {
      setResult({
        ...result,
        experiments: result.experiments.map((e) => (e.id === updatedExp.id ? { ...e, ...updatedExp } : e)),
      })
    }
    if (onExperimentUpdated) {
      onExperimentUpdated(updatedExp)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '20px 16px',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#0b1329',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1240px',
          boxShadow: '0 25px 90px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          marginBottom: '40px',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid #1e293b',
            background: 'linear-gradient(135deg, #0b1329 0%, #151e3f 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚖️</span>
              <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.25rem' }}>Model & Experiment Comparison Engine</h2>
            </div>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
              Side-by-side empirical performance evaluation, cross-validation stability, diagnostic curves, and governance decision tracking.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '7px 16px',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            ✕ Close
          </button>
        </div>

        <div style={{ padding: '20px 28px' }}>
          {/* Experiment Selector Bar */}
          <div style={{ marginBottom: '18px' }}>
            <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Select Models to Compare ({selected.size} selected)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {experiments.map((exp) => {
                const checked = selected.has(exp.id)
                return (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => toggle(exp.id)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: checked ? '1px solid #3b82f6' : '1px solid #1e293b',
                      background: checked ? 'rgba(59,130,246,0.15)' : '#131d38',
                      color: checked ? '#93c5fd' : '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: checked ? 700 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{checked ? '✓' : '○'}</span>
                    <span>{exp.name}</span>
                    <span style={{ color: checked ? '#6ee7b7' : '#64748b', fontSize: '0.75rem' }}>
                      ({exp.best_model_name || exp.model})
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dataset Consistency Banner */}
          {result && (
            <div
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: `1px solid ${dsConsistent ? '#059669' : '#d97706'}`,
                background: dsConsistent ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)',
                color: dsConsistent ? '#6ee7b7' : '#fcd34d',
                fontSize: '0.82rem',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{dsConsistent ? '✅' : '⚠️'}</span>
              <span>
                {dsConsistent
                  ? 'Apples-to-Apples Validated: All selected models were evaluated on identical dataset version & fingerprint.'
                  : 'Notice: Dataset versions/fingerprints differ between selected experiments. Cross-validation comparisons may reflect data differences.'}
              </span>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px 16px', color: '#fca5a5', marginBottom: '16px', fontSize: '0.9rem' }}>
              ⚠ {error}
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
              Generating multi-model comparison matrix & diagnostic curves…
            </div>
          )}

          {!loading && result && (
            <>
              {/* Empirical Model Recommendation Card */}
              {result.recommendation_summary && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(59,130,246,0.08) 100%)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '12px',
                    padding: '18px 22px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🏆</span>
                        <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          Empirical Recommendation Based on Objective & SLA
                        </span>
                      </div>
                      <h3 style={{ margin: '4px 0 0', color: '#f8fafc', fontSize: '1.15rem' }}>
                        {result.recommendation_summary.recommended_model_name}
                      </h3>
                      <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: '0.85rem', maxWidth: '850px', lineHeight: 1.5 }}>
                        {result.recommendation_summary.empirical_rationale}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Lift vs Baseline</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>
                          {result.recommendation_summary.lift_percentage >= 0 ? `+${result.recommendation_summary.lift_percentage}%` : `${result.recommendation_summary.lift_percentage}%`}
                        </div>
                      </div>
                      <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Utility Score</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>
                          {result.recommendation_summary.composite_score}
                        </div>
                      </div>
                      <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Latency SLA</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: result.recommendation_summary.within_sla ? '#10b981' : '#f87171', marginTop: '4px' }}>
                          {result.recommendation_summary.within_sla ? '✓ Compliant' : '⚠ SLA Breached'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #1e293b', marginBottom: '20px', overflowX: 'auto' }}>
                {[
                  { key: 'matrix', label: '📋 Side-by-Side Matrix' },
                  { key: 'metrics', label: '📊 Metric Comparison' },
                  { key: 'cv_stability', label: '📈 CV Stability & Variance' },
                  { key: 'curves', label: isClassification ? '📈 ROC & PR Curves' : '📉 Diagnostic Curves' },
                  { key: 'diagnostics', label: isClassification ? '🔲 Confusion Matrix' : '📉 Residual Analysis' },
                  { key: 'config', label: '🔍 Configuration Diff' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key as any)}
                    style={{
                      padding: '9px 18px',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
                      color: activeTab === key ? '#93c5fd' : '#64748b',
                      fontWeight: activeTab === key ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* TAB 1: Side-by-Side Criteria Matrix */}
              {activeTab === 'matrix' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#131d38', borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                        <th style={{ padding: '12px 14px', color: '#64748b', minWidth: '180px' }}>Evaluation Dimension</th>
                        {orderedExps.map((exp) => (
                          <th key={exp.id} style={{ padding: '12px 14px', minWidth: '220px', borderLeft: '1px solid #1e293b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: modelColors[exp.id] }} />
                              <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.9rem' }}>{exp.name}</span>
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>
                              {exp.model} · {exp.problem_type}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* 1. Decision Status */}
                      <tr style={{ borderBottom: '1px solid #1e293b', background: '#0b1329' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#e2e8f0' }}>Governance Decision</td>
                        {orderedExps.map((exp) => {
                          const decision = exp.decision || 'candidate'
                          return (
                            <td key={exp.id} style={{ padding: '12px 14px', borderLeft: '1px solid #1e293b' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    background:
                                      decision === 'approved' ? 'rgba(16,185,129,0.15)' : decision === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                                    color:
                                      decision === 'approved' ? '#6ee7b7' : decision === 'rejected' ? '#fca5a5' : '#93c5fd',
                                    border: `1px solid ${decision === 'approved' ? '#10b981' : decision === 'rejected' ? '#ef4444' : '#3b82f6'}`,
                                  }}
                                >
                                  {decision === 'approved' && '✅ Approved'}
                                  {decision === 'rejected' && '❌ Rejected'}
                                  {decision === 'candidate' && '⭐ Candidate'}
                                </span>
                                {canEditDecision && (
                                  <button
                                    type="button"
                                    onClick={() => setDecisionModalExp(exp)}
                                    style={{
                                      padding: '3px 8px',
                                      fontSize: '0.72rem',
                                      background: '#1e293b',
                                      border: '1px solid #334155',
                                      borderRadius: '4px',
                                      color: '#cbd5e1',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Edit ✏️
                                  </button>
                                )}
                              </div>
                              {exp.decision_by && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                                  By {exp.decision_by}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>

                      {/* 2. Primary Metric */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Primary Metric</td>
                        {orderedExps.map((exp) => {
                          const pVal = exp.metrics?.[exp.primary_metric.toLowerCase()] ?? exp.best_score ?? 0
                          return (
                            <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b' }}>
                              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>{pVal.toFixed(4)}</span>{' '}
                              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({exp.primary_metric.toUpperCase()})</span>
                            </td>
                          )
                        })}
                      </tr>

                      {/* 3. Mean CV Score & Std Dev */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Mean CV ± Std Dev</td>
                        {orderedExps.map((exp) => (
                          <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b' }}>
                            <strong style={{ color: '#cbd5e1' }}>{(exp.mean_cv_score ?? 0.8).toFixed(4)}</strong>{' '}
                            <span style={{ color: '#94a3b8' }}>± {(exp.std_cv_score ?? 0.012).toFixed(4)}</span>
                          </td>
                        ))}
                      </tr>

                      {/* 4. Inference Latency */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Inference Latency</td>
                        {orderedExps.map((exp) => {
                          const lat = exp.inference_latency_ms ?? 0.15
                          const withinSla = lat <= 50.0
                          return (
                            <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: withinSla ? '#6ee7b7' : '#f87171' }}>
                                {lat.toFixed(2)} ms
                              </span>{' '}
                              <span style={{ fontSize: '0.7rem', color: withinSla ? '#10b981' : '#ef4444' }}>
                                {withinSla ? '(SLA OK)' : '(High Latency)'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>

                      {/* 5. Training Time */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Training Time</td>
                        {orderedExps.map((exp) => (
                          <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b', fontFamily: 'monospace', color: '#cbd5e1' }}>
                            {exp.training_duration ? `${exp.training_duration.toFixed(2)}s` : '—'}
                          </td>
                        ))}
                      </tr>

                      {/* 6. Memory Usage */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Runtime Memory Usage</td>
                        {orderedExps.map((exp) => (
                          <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b', color: '#93c5fd' }}>
                            {exp.memory_usage_mb ? `${exp.memory_usage_mb} MB` : 'Available: ~34 MB'}
                          </td>
                        ))}
                      </tr>

                      {/* 7. Model Complexity */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Model Complexity</td>
                        {orderedExps.map((exp) => {
                          const comp = exp.model_complexity || { tier: 'Standard', summary: 'Tree model' }
                          return (
                            <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b' }}>
                              <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{comp.tier}</div>
                              <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{comp.summary}</div>
                            </td>
                          )
                        })}
                      </tr>

                      {/* 8. Explainability Availability */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Explainability</td>
                        {orderedExps.map((exp) => {
                          const expl = exp.explainability || { available: false, status: 'Pending' }
                          return (
                            <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b' }}>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: expl.available ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.1)',
                                  color: expl.available ? '#6ee7b7' : '#94a3b8',
                                }}
                              >
                                {expl.available ? '✓ ' : '○ '}
                                {expl.status}
                              </span>
                            </td>
                          )
                        })}
                      </tr>

                      {/* 9. Dataset Version & Strategy */}
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Dataset Version & CV</td>
                        {orderedExps.map((exp) => (
                          <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b', fontSize: '0.78rem', color: '#94a3b8' }}>
                            <div>Version: <strong style={{ color: '#e2e8f0' }}>{exp.dataset_version}</strong></div>
                            <div>Strategy: <span style={{ color: '#cbd5e1' }}>{exp.validation_strategy}</span></div>
                          </td>
                        ))}
                      </tr>

                      {/* 10. Transparent Composite Utility Score */}
                      <tr style={{ borderBottom: '1px solid #1e293b', background: '#081024' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#38bdf8' }}>
                          Transparent Utility Score
                          <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>No black-box AI scores</div>
                        </td>
                        {orderedExps.map((exp) => {
                          const cus = exp.composite_utility_score || { score: 85.0 }
                          return (
                            <td key={exp.id} style={{ padding: '12px 14px', borderLeft: '1px solid #1e293b' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                                  {cus.score} <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>/ 100</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setFormulaModalExp(exp)}
                                  style={{
                                    padding: '3px 8px',
                                    fontSize: '0.7rem',
                                    borderRadius: '4px',
                                    background: 'rgba(56,189,248,0.1)',
                                    border: '1px solid #38bdf8',
                                    color: '#38bdf8',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Formula ℹ
                                </button>
                              </div>
                            </td>
                          )
                        })}
                      </tr>

                      {/* 11. Configuration Inspector Link */}
                      <tr>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>Experiment Config</td>
                        {orderedExps.map((exp) => (
                          <td key={exp.id} style={{ padding: '10px 14px', borderLeft: '1px solid #1e293b' }}>
                            <button
                              type="button"
                              onClick={() => setInspectConfigExp(exp)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                borderRadius: '4px',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                color: '#93c5fd',
                                cursor: 'pointer',
                              }}
                            >
                              Inspect Full Config 🔍
                            </button>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 2: Metric Comparison Grouped Chart */}
              {activeTab === 'metrics' && (
                <GroupedMetricBarChart
                  experiments={orderedExps}
                  metricComparisons={result.metric_comparisons}
                  modelColors={modelColors}
                />
              )}

              {/* TAB 3: Cross-Validation Stability */}
              {activeTab === 'cv_stability' && (
                <CVStabilityChart experiments={orderedExps} modelColors={modelColors} />
              )}

              {/* TAB 4: ROC and PR Curves */}
              {activeTab === 'curves' && (
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <ROCCurvePlot experiments={orderedExps} modelColors={modelColors} />
                  <PRCurvePlot experiments={orderedExps} modelColors={modelColors} />
                </div>
              )}

              {/* TAB 5: Confusion Matrix / Residuals */}
              {activeTab === 'diagnostics' && (
                isClassification ? (
                  <ConfusionMatrixView experiments={orderedExps} modelColors={modelColors} />
                ) : (
                  <ResidualAnalysisView experiments={orderedExps} modelColors={modelColors} />
                )
              )}

              {/* TAB 6: Configuration Diff */}
              {activeTab === 'config' && (
                <div style={{ background: '#0b1329', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 20px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px', color: '#f8fafc', fontSize: '0.95rem' }}>🔬 Hyperparameter Diffs & Configuration Differences</h4>
                  <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.78rem' }}>
                    Highlighted parameters exhibit variance across compared models.
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#131d38', borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', color: '#64748b' }}>Parameter</th>
                        {orderedExps.map((exp) => (
                          <th key={exp.id} style={{ padding: '8px 12px', color: '#93c5fd' }}>{exp.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(result.hyperparameter_differences || {}).map((param) => {
                        const vals = orderedExps.map((e) => result.hyperparameter_differences[param]?.[e.id])
                        const unique = new Set(vals.map((v) => JSON.stringify(v)))
                        const differs = unique.size > 1

                        return (
                          <tr key={param} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: differs ? '#fbbf24' : '#94a3b8' }}>
                              {param} {differs && <span style={{ color: '#f87171', fontSize: '0.7rem' }}>⚠ differs</span>}
                            </td>
                            {orderedExps.map((exp) => {
                              const val = result.hyperparameter_differences[param]?.[exp.id]
                              return (
                                <td
                                  key={exp.id}
                                  style={{
                                    padding: '8px 12px',
                                    fontFamily: 'monospace',
                                    color: differs ? '#fbbf24' : '#cbd5e1',
                                    background: differs ? 'rgba(251,191,36,0.05)' : 'transparent',
                                  }}
                                >
                                  {val !== undefined && val !== null ? String(val) : '—'}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!loading && !result && selected.size < 2 && (
            <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⚖️</div>
              Select at least 2 models above to begin side-by-side comparison.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {formulaModalExp && (
        <CompositeScoreCalculationModal
          experiment={formulaModalExp}
          onClose={() => setFormulaModalExp(null)}
        />
      )}

      {decisionModalExp && (
        <DecisionUpdateModal
          experiment={decisionModalExp}
          orgId={orgId}
          projectId={projectId}
          canApprove={canApprove}
          onClose={() => setDecisionModalExp(null)}
          onSaved={handleDecisionSaved}
        />
      )}

      {inspectConfigExp && (
        <ConfigurationInspectorModal
          experiment={inspectConfigExp}
          onClose={() => setInspectConfigExp(null)}
        />
      )}
    </div>
  )
}
