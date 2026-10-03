import React, { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import {
  Permissions,
  type DataHealthAssessment,
  type DataHealthIssue,
  type HealthIssueSeverity,
} from './types'

interface DataHealthCenterViewProps {
  projectId: string
  datasetId: string
  datasetName: string
  onClose?: () => void
}

export const DataHealthCenterView: React.FC<DataHealthCenterViewProps> = ({
  projectId,
  datasetId,
  datasetName,
  onClose,
}) => {
  const { activeOrg } = useAuth()
  const orgId = activeOrg?.organization_id

  const [assessment, setAssessment] = useState<DataHealthAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'issues' | 'overview' | 'completeness' | 'duplicates' | 'validity' | 'quality' | 'outliers' | 'correlations' | 'target' | 'leakage'
  >('issues')
  const [selectedIssue, setSelectedIssue] = useState<DataHealthIssue | null>(null)
  const [showScoringModal, setShowScoringModal] = useState(false)
  const [issueFilter, setIssueFilter] = useState<string>('all')

  // Target and Datetime customization
  const [targetCol, setTargetCol] = useState('churn')
  const [datetimeCol, setDatetimeCol] = useState('signup_date')
  const [showConfig, setShowConfig] = useState(false)

  const fetchHealth = async () => {
    if (!orgId || !projectId || !datasetId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getDatasetHealth(orgId, projectId, datasetId, targetCol, datetimeCol)
      setAssessment(data)
      if (data.target_column) setTargetCol(data.target_column)
      if (data.datetime_column) setDatetimeCol(data.datetime_column)
    } catch (err: unknown) {
      console.error('Failed to load health assessment:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dataset health.')
    } finally {
      setLoading(false)
    }
  }

  const handleRunAnalysis = async () => {
    if (!orgId || !projectId || !datasetId) return
    setAnalyzing(true)
    setError(null)
    try {
      const data = await api.analyzeDatasetHealth(orgId, projectId, datasetId, {
        target_column: targetCol.trim() || undefined,
        datetime_column: datetimeCol.trim() || undefined,
      })
      setAssessment(data)
      setShowConfig(false)
    } catch (err: unknown) {
      console.error('Analysis failed:', err)
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [orgId, projectId, datasetId])

  const getSeverityBadgeColor = (severity: HealthIssueSeverity | string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5', border: '#ef4444' }
      case 'high':
        return { bg: 'rgba(249, 115, 22, 0.15)', text: '#fdba74', border: '#f97316' }
      case 'medium':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d', border: '#f59e0b' }
      case 'low':
      default:
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#93c5fd', border: '#3b82f6' }
    }
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
        return '#10b981'
      case 'B':
        return '#3b82f6'
      case 'C':
        return '#f59e0b'
      case 'D':
        return '#f97316'
      case 'F':
      default:
        return '#ef4444'
    }
  }

  const filteredIssues = assessment?.issues.filter((iss) => {
    if (issueFilter === 'all') return true
    return iss.severity.toLowerCase() === issueFilter.toLowerCase()
  }) || []

  return (
    <div className="health-center-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#1e293b',
          padding: '20px 24px',
          borderRadius: '12px',
          border: '1px solid #334155',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.6rem' }}>🏥</span>
            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.4rem' }}>
              Data Health Center
            </h2>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '3px 8px',
                borderRadius: '6px',
                background: '#0f172a',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                fontWeight: 600,
              }}
            >
              Client Data Plane Isolated
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Professional Data Scientist-level diagnostic assessment for dataset:{' '}
            <strong style={{ color: '#e2e8f0' }}>{datasetName}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowConfig(!showConfig)}
            style={{ fontSize: '0.85rem' }}
          >
            ⚙️ Target & Parameters
          </button>

          <PermissionGate permission={Permissions.DATASET_PROFILE}>
            <button
              type="button"
              className="btn-primary"
              id="run-health-analysis-btn"
              onClick={handleRunAnalysis}
              disabled={analyzing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            >
              <span>{analyzing ? '⏳ Analyzing...' : '🔄 Run Full Assessment'}</span>
            </button>
          </PermissionGate>

          {onClose && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ fontSize: '0.85rem' }}
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* Target & Datetime Configuration Card */}
      {showConfig && (
        <div
          style={{
            background: '#0f172a',
            padding: '16px 20px',
            borderRadius: '8px',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Target Column (for leakage & class imbalance detection)
            </label>
            <input
              type="text"
              value={targetCol}
              onChange={(e) => setTargetCol(e.target.value)}
              placeholder="e.g. churn, default, ltv"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Datetime Column (for temporal leakage & sequencing)
            </label>
            <input
              type="text"
              value={datetimeCol}
              onChange={(e) => setDatetimeCol(e.target.value)}
              placeholder="e.g. signup_date, event_time"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingTop: '18px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleRunAnalysis}
              disabled={analyzing}
              style={{ height: '38px', padding: '0 16px' }}
            >
              Apply & Analyze
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Running Client Data Plane Health Diagnostics...</div>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Analyzing completeness, duplicates, validity, distributions, multicollinearity, and leakage.</p>
        </div>
      ) : assessment ? (
        <>
          {/* Top Score & Health Gauge Banner */}
          <div
            className="card"
            style={{
              padding: '24px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              display: 'grid',
              gridTemplateColumns: '260px 1fr',
              gap: '24px',
              alignItems: 'center',
            }}
          >
            {/* Score Ring / Block */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                background: '#0f172a',
                borderRadius: '12px',
                border: `2px solid ${getGradeColor(assessment.health_score.grade)}`,
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Overall Data Health Score
              </div>
              <div
                style={{
                  fontSize: '3.2rem',
                  fontWeight: 800,
                  color: getGradeColor(assessment.health_score.grade),
                  lineHeight: '1.1',
                  marginTop: '6px',
                }}
              >
                {assessment.health_score.overall_score}
                <span style={{ fontSize: '1.5rem', color: '#64748b' }}>/100</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    padding: '2px 10px',
                    borderRadius: '6px',
                    background: getGradeColor(assessment.health_score.grade),
                    color: '#0f172a',
                  }}
                >
                  Grade {assessment.health_score.grade}
                </span>
                <button
                  type="button"
                  id="view-methodology-btn"
                  onClick={() => setShowScoringModal(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Methodology & Deductions
                </button>
              </div>
            </div>

            {/* Severity Issues Breakdown & Quick Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>
                  Diagnostic Health Summary
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Analyzed at {new Date(assessment.analyzed_at).toLocaleTimeString()}
                </span>
              </div>

              {/* Severity Counts Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {(['critical', 'high', 'medium', 'low'] as HealthIssueSeverity[]).map((sev) => {
                  const count = assessment.issues.filter((i) => i.severity.toLowerCase() === sev).length
                  const colors = getSeverityBadgeColor(sev)
                  return (
                    <div
                      key={sev}
                      onClick={() => {
                        setIssueFilter(sev)
                        setActiveTab('issues')
                      }}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: colors.text, fontWeight: 600 }}>
                        {sev} Issues
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
                        {count}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Zero-Leakage Privacy Note */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  background: '#0f172a',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                }}
              >
                <span>🔒</span>
                <span>
                  <strong>Client Data Plane Guarantee:</strong> Zero raw records were transferred to the Cloud Control Plane. Only statistical aggregates and findings are stored.
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Subtabs across the 9 Dimensions */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              borderBottom: '1px solid #334155',
              paddingBottom: '8px',
              overflowX: 'auto',
            }}
          >
            {[
              { id: 'issues', label: `Issues Registry (${assessment.issues.length})`, icon: '⚠️' },
              { id: 'overview', label: '1. Overview', icon: '📊' },
              { id: 'completeness', label: '2. Completeness', icon: '📉' },
              { id: 'duplicates', label: '3. Duplicates', icon: '👯' },
              { id: 'validity', label: '4. Validity', icon: '🛡️' },
              { id: 'quality', label: '5. Feature Quality', icon: '✨' },
              { id: 'outliers', label: '6. Outliers', icon: '📈' },
              { id: 'correlations', label: '7. Correlations', icon: '🔗' },
              { id: 'target', label: '8. Target Analysis', icon: '🎯' },
              { id: 'leakage', label: '9. Leakage Detection', icon: '🚨' },
            ].map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`health-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isActive ? '#3b82f6' : '#1e293b',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* TAB CONTENT PANELS */}

          {/* 0. Issues Registry */}
          {activeTab === 'issues' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Filter by Severity:</span>
                  {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setIssueFilter(sev)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        border: issueFilter === sev ? '1px solid #38bdf8' : '1px solid #334155',
                        background: issueFilter === sev ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                        color: issueFilter === sev ? '#38bdf8' : '#cbd5e1',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {sev} ({sev === 'all' ? assessment.issues.length : assessment.issues.filter(i => i.severity.toLowerCase() === sev).length})
                    </button>
                  ))}
                </div>
              </div>

              {filteredIssues.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#10b981' }}>
                  ✅ No issues found matching filter criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredIssues.map((issue) => {
                    const colors = getSeverityBadgeColor(issue.severity)
                    return (
                      <div
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '16px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'border 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: colors.bg,
                                color: colors.text,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              {issue.severity}
                            </span>
                            <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{issue.title}</strong>
                            {issue.column && (
                              <code style={{ fontSize: '0.75rem', background: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
                                column: {issue.column}
                              </code>
                            )}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                            <strong style={{ color: '#cbd5e1' }}>Evidence:</strong> {issue.evidence}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#38bdf8' }}>Inspect Details →</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 1. Overview */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL ROWS</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
                    {assessment.overview.rows.toLocaleString()}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL COLUMNS</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                    {assessment.overview.columns}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>MEMORY FOOTPRINT</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                    {assessment.overview.memory_usage_formatted}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>NUMERICAL RATIO</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                    {Math.round((assessment.overview.numerical_columns.length / Math.max(1, assessment.overview.columns)) * 100)}%
                  </div>
                </div>
              </div>

              {/* Semantic Column Type Classification */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '14px' }}>
                  Semantic Column Type Classification
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
                  <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600 }}>
                      Numerical ({assessment.overview.numerical_columns.length})
                    </div>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                      {assessment.overview.numerical_columns.map(c => <li key={c}>{c}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.8rem', color: '#fcd34d', fontWeight: 600 }}>
                      Categorical ({assessment.overview.categorical_columns.length})
                    </div>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                      {assessment.overview.categorical_columns.map(c => <li key={c}>{c}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>
                      Datetime ({assessment.overview.datetime_columns.length})
                    </div>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                      {assessment.overview.datetime_columns.map(c => <li key={c}>{c}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>
                      Boolean ({assessment.overview.boolean_columns.length})
                    </div>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                      {assessment.overview.boolean_columns.map(c => <li key={c}>{c}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.8rem', color: '#f472b6', fontWeight: 600 }}>
                      Text ({assessment.overview.text_columns.length})
                    </div>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                      {assessment.overview.text_columns.length === 0 ? (
                        <li style={{ color: '#64748b' }}>None</li>
                      ) : (
                        assessment.overview.text_columns.map(c => <li key={c}>{c}</li>)
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Completeness */}
          {activeTab === 'completeness' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL MISSING CELLS</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
                    {assessment.completeness.total_missing_values.toLocaleString()}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>OVERALL MISSING RATIO</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: assessment.completeness.overall_missing_percentage > 5 ? '#f59e0b' : '#10b981', marginTop: '4px' }}>
                    {assessment.completeness.overall_missing_percentage}%
                  </div>
                </div>
              </div>

              {/* Per-column Missingness Table */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Features with Missing Values ({assessment.completeness.columns_with_missing.length})
                </h3>
                {assessment.completeness.columns_with_missing.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.9rem' }}>✅ Complete dataset! Zero missing values detected across all columns.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Column</th>
                        <th style={{ padding: '8px' }}>Missing Count</th>
                        <th style={{ padding: '8px' }}>Missing %</th>
                        <th style={{ padding: '8px' }}>Visualization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessment.completeness.columns_with_missing.map((c) => (
                        <tr key={c.column} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 600 }}>{c.column}</td>
                          <td style={{ padding: '8px', color: '#94a3b8' }}>{c.missing_count}</td>
                          <td style={{ padding: '8px', color: c.missing_percentage > 20 ? '#ef4444' : '#f59e0b' }}>
                            {c.missing_percentage}%
                          </td>
                          <td style={{ padding: '8px', width: '240px' }}>
                            <div style={{ background: '#0f172a', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  background: c.missing_percentage > 20 ? '#ef4444' : '#f59e0b',
                                  width: `${Math.min(100, c.missing_percentage)}%`,
                                  height: '100%',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Missing Patterns / Co-occurrences */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Missingness Co-occurrence Patterns (Non-Random Missingness)
                </h3>
                {assessment.completeness.missing_patterns.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No synchronized multi-column missingness patterns detected.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assessment.completeness.missing_patterns.map((p) => (
                      <div key={p.pattern_id} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                        <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem' }}>{p.description}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                          Synchronized Jaccard overlap: {(p.cooccurrence_ratio * 100).toFixed(1)}% across {p.affected_rows} rows.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Duplicates */}
          {activeTab === 'duplicates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>DUPLICATE ROWS</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: assessment.duplicates.duplicate_rows_count > 0 ? '#ef4444' : '#10b981', marginTop: '4px' }}>
                    {assessment.duplicates.duplicate_rows_count}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>DUPLICATE ROW RATIO</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
                    {assessment.duplicates.duplicate_rows_percentage}%
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>POTENTIAL NEAR-DUPLICATES</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                    {assessment.duplicates.potential_near_duplicates_count}
                  </div>
                </div>
              </div>

              {/* Duplicate Identifiers */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Duplicate Candidate Identifiers (Primary Key Collisions)
                </h3>
                {assessment.duplicates.duplicate_identifiers.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ All entity identifiers and candidate keys are strictly unique.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assessment.duplicates.duplicate_identifiers.map((di) => (
                      <div key={di.column} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #ef4444' }}>
                        <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '0.9rem' }}>
                          Collision in candidate identifier: <code>{di.column}</code>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                          {di.duplicate_key_count} keys appear multiple times. Collisions indicate incorrect joins or duplicate ingestion.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Data Validity */}
          {activeTab === 'validity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Biologically / Physically Impossible Values
                </h3>
                {assessment.validity.impossible_values.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ No impossible values detected (e.g. negative ages, durations, or financial values).</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assessment.validity.impossible_values.map((iv, idx) => (
                      <div key={idx} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #ef4444' }}>
                        <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '0.9rem' }}>
                          Rule Violated: {iv.rule_violated} (Column: <code>{iv.column}</code>)
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>{iv.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Invalid Sentinel Values & Mixed Types
                </h3>
                {assessment.validity.invalid_values.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ Clean types and no legacy sentinel values (-999, 9999).</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assessment.validity.invalid_values.map((v, idx) => (
                      <div key={idx} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #f59e0b' }}>
                        <div style={{ color: '#fcd34d', fontWeight: 600, fontSize: '0.9rem' }}>
                          {v.issue_type === 'sentinel_placeholder' ? 'Numeric Sentinel Value' : 'Mixed Type String'}: <code>{v.column}</code>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>{v.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. Feature Quality */}
          {activeTab === 'quality' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {/* Constant Features */}
                <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '0.95rem' }}>
                    Zero Variance / Constant Features ({assessment.feature_quality.constant_features.length})
                  </h4>
                  {assessment.feature_quality.constant_features.length === 0 ? (
                    <div style={{ color: '#10b981', fontSize: '0.85rem' }}>None</div>
                  ) : (
                    assessment.feature_quality.constant_features.map(f => (
                      <div key={f.column} style={{ fontSize: '0.85rem', color: '#fcd34d', marginBottom: '6px' }}>
                        • <code>{f.column}</code> (constant value: &quot;{f.value}&quot;)
                      </div>
                    ))
                  )}
                </div>

                {/* Near-Constant Features */}
                <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '0.95rem' }}>
                    Near-Constant Features ({assessment.feature_quality.near_constant_features.length})
                  </h4>
                  {assessment.feature_quality.near_constant_features.length === 0 ? (
                    <div style={{ color: '#10b981', fontSize: '0.85rem' }}>None</div>
                  ) : (
                    assessment.feature_quality.near_constant_features.map(f => (
                      <div key={f.column} style={{ fontSize: '0.85rem', color: '#fcd34d', marginBottom: '6px' }}>
                        • <code>{f.column}</code> ({f.dominant_ratio}% dominant value: &quot;{f.dominant_value}&quot;)
                      </div>
                    ))
                  )}
                </div>

                {/* High Cardinality */}
                <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '0.95rem' }}>
                    High Cardinality Categoricals ({assessment.feature_quality.high_cardinality_features.length})
                  </h4>
                  {assessment.feature_quality.high_cardinality_features.length === 0 ? (
                    <div style={{ color: '#10b981', fontSize: '0.85rem' }}>None</div>
                  ) : (
                    assessment.feature_quality.high_cardinality_features.map(f => (
                      <div key={f.column} style={{ fontSize: '0.85rem', color: '#93c5fd', marginBottom: '6px' }}>
                        • <code>{f.column}</code> ({f.unique_count} distinct categories)
                      </div>
                    ))
                  )}
                </div>

                {/* Unique Identifiers */}
                <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '0.95rem' }}>
                    Unique Identifiers ({assessment.feature_quality.unique_identifiers.length})
                  </h4>
                  {assessment.feature_quality.unique_identifiers.map(f => (
                    <div key={f.column} style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px' }}>
                      • <code>{f.column}</code> ({f.unique_count} unique keys)
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. Outlier Analysis */}
          {activeTab === 'outliers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '14px' }}>
                  Tukey&apos;s IQR Outlier Detection (1.5x Interquartile Range)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {assessment.outliers.columns.map((col) => (
                    <div key={col.column} style={{ background: '#0f172a', padding: '14px', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{col.column}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '10px' }}>
                            Bounds: [{col.lower_bound.toLocaleString()}, {col.upper_bound.toLocaleString()}]
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: col.outlier_percentage > 5 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            color: col.outlier_percentage > 5 ? '#fca5a5' : '#93c5fd',
                          }}
                        >
                          {col.outlier_count} outliers ({col.outlier_percentage}%)
                        </span>
                      </div>

                      {/* Boxplot percentiles summary */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', fontSize: '0.75rem', color: '#94a3b8', background: '#1e293b', padding: '8px', borderRadius: '4px' }}>
                        <div>Min: <strong style={{ color: '#e2e8f0' }}>{col.min.toLocaleString()}</strong></div>
                        <div>Q1 (25%): <strong style={{ color: '#e2e8f0' }}>{col.q25.toLocaleString()}</strong></div>
                        <div>Median (50%): <strong style={{ color: '#38bdf8' }}>{col.median.toLocaleString()}</strong></div>
                        <div>Q3 (75%): <strong style={{ color: '#e2e8f0' }}>{col.q75.toLocaleString()}</strong></div>
                        <div>Max: <strong style={{ color: '#e2e8f0' }}>{col.max.toLocaleString()}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 7. Correlation Analysis */}
          {activeTab === 'correlations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Suspicious Relationships / Multicollinearity */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Suspicious Multicollinearity Alerts (|r| &gt; 0.85)
                </h3>
                {assessment.correlations.suspicious_relationships.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ No severe multicollinearity detected between numerical features.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assessment.correlations.suspicious_relationships.map((rel, idx) => (
                      <div key={idx} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #f59e0b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#fcd34d', fontWeight: 600 }}>
                            <code>{rel.feature_a}</code> ↔ <code>{rel.feature_b}</code>
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                            r = {rel.pearson_r}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                          Relationship: {rel.relationship_type}. Redundant features destabilize linear model coefficients and tree splits.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pairwise correlation table */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  Numerical Pearson Correlation Pairs
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Feature A</th>
                      <th style={{ padding: '8px' }}>Feature B</th>
                      <th style={{ padding: '8px' }}>Pearson r</th>
                      <th style={{ padding: '8px' }}>Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessment.correlations.matrix.slice(0, 15).map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #0f172a' }}>
                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{m.column_a}</td>
                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{m.column_b}</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: Math.abs(m.pearson_r) > 0.7 ? '#f59e0b' : '#38bdf8' }}>
                          {m.pearson_r}
                        </td>
                        <td style={{ padding: '8px', color: '#94a3b8' }}>
                          {Math.abs(m.pearson_r) > 0.8 ? 'Very Strong' : Math.abs(m.pearson_r) > 0.5 ? 'Moderate' : 'Weak'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. Target Analysis */}
          {activeTab === 'target' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {assessment.target_analysis ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TARGET COLUMN</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                        {assessment.target_analysis.target_name}
                      </div>
                    </div>
                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>PROBLEM TYPE</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                        {assessment.target_analysis.problem_type}
                      </div>
                    </div>
                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>CLASS IMBALANCE STATUS</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: assessment.target_analysis.class_imbalance?.is_imbalanced ? '#ef4444' : '#10b981', marginTop: '4px' }}>
                        {assessment.target_analysis.class_imbalance?.is_imbalanced ? 'Imbalanced' : 'Balanced'}
                      </div>
                    </div>
                  </div>

                  {/* Distribution breakdown */}
                  {assessment.target_analysis.distribution && (
                    <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                      <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                        Class Label Distribution
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {assessment.target_analysis.distribution.map((cls) => (
                          <div key={cls.class_label} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ color: '#f8fafc', fontWeight: 600 }}>Class &quot;{cls.class_label}&quot;</span>
                              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{cls.count} ({Math.round(cls.ratio * 100)}%)</span>
                            </div>
                            <div style={{ background: '#1e293b', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ background: '#3b82f6', width: `${cls.ratio * 100}%`, height: '100%' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Predictive Association with Important Features */}
                  {assessment.target_analysis.relationship_with_important_features && (
                    <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                      <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                        Top Feature Associations with Target
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {assessment.target_analysis.relationship_with_important_features.map(f => (
                          <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                            <span style={{ color: '#cbd5e1' }}><code>{f.feature}</code></span>
                            <span style={{ color: f.abs_correlation > 0.5 ? '#f59e0b' : '#38bdf8', fontWeight: 600 }}>
                              r = {f.correlation_with_target}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  No target defined for this dataset. Click &quot;⚙️ Target & Parameters&quot; to configure a target variable.
                </div>
              )}
            </div>
          )}

          {/* 9. Leakage Detection */}
          {activeTab === 'leakage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Target Leakage */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  🚨 Target Leakage Features (|r| &gt; 0.95 with Target)
                </h3>
                {assessment.leakage.target_leakage.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ No direct target leakage features detected.</div>
                ) : (
                  assessment.leakage.target_leakage.map((tl, idx) => (
                    <div key={idx} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #ef4444', marginBottom: '8px' }}>
                      <div style={{ color: '#fca5a5', fontWeight: 700 }}>Direct Target Leakage: <code>{tl.feature}</code></div>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>{tl.explanation}</div>
                      <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: '4px' }}>Action: {tl.recommended_action}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Post-Outcome Features */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  ⏱️ Post-Outcome Features (Created Chronologically After Target Event)
                </h3>
                {assessment.leakage.post_outcome_features.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ No post-outcome lifecycle marker columns found.</div>
                ) : (
                  assessment.leakage.post_outcome_features.map((po, idx) => (
                    <div key={idx} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #ef4444', marginBottom: '8px' }}>
                      <div style={{ color: '#fca5a5', fontWeight: 700 }}>Post-Outcome Feature: <code>{po.feature}</code></div>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>{po.explanation}</div>
                      <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: '4px' }}>Action: {po.recommended_action}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Train / Test Contamination */}
              <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
                  🔄 Train/Test Split Contamination
                </h3>
                {assessment.leakage.train_test_contamination.length === 0 ? (
                  <div style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ Clean split boundaries. Zero entity overlaps between partitions.</div>
                ) : (
                  assessment.leakage.train_test_contamination.map((ttc, idx) => (
                    <div key={idx} style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #ef4444', marginBottom: '8px' }}>
                      <div style={{ color: '#fca5a5', fontWeight: 700 }}>
                        Cross-Split Contamination in <code>{ttc.identifier_column}</code> ({ttc.overlapping_entities_count} entities overlap)
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>
                        Overlapping entities in validation set: {(ttc.overlap_ratio_in_test * 100).toFixed(1)}%. Sample IDs: {ttc.sample_overlapping_ids.join(', ')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Issue Detail Inspection Modal */}
      {selectedIssue && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    ...getSeverityBadgeColor(selectedIssue.severity),
                  }}
                >
                  {selectedIssue.severity}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
                  {selectedIssue.title}
                </h3>
              </div>
              <button className="btn-close" onClick={() => setSelectedIssue(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.9rem', color: '#cbd5e1' }}>
              {selectedIssue.column && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>AFFECTED FEATURE</div>
                  <code style={{ fontSize: '0.9rem', background: '#0f172a', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8' }}>
                    {selectedIssue.column}
                  </code>
                </div>
              )}

              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>EVIDENCE & TELEMETRY</div>
                <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', border: '1px solid #334155', color: '#f8fafc' }}>
                  {selectedIssue.evidence}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>DATA SCIENTIST EXPLANATION</div>
                <p style={{ margin: '4px 0 0 0', lineHeight: '1.4' }}>{selectedIssue.explanation}</p>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 600 }}>POTENTIAL PRODUCTION IMPACT</div>
                <p style={{ margin: '4px 0 0 0', lineHeight: '1.4', color: '#fca5a5' }}>{selectedIssue.potential_impact}</p>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 600 }}>RECOMMENDED ACTION</div>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid #10b981', color: '#6ee7b7' }}>
                  {selectedIssue.recommended_action}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setSelectedIssue(null)}>
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transparent Scoring Methodology Modal */}
      {showScoringModal && assessment && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
                Transparent Scoring Methodology
              </h3>
              <button className="btn-close" onClick={() => setShowScoringModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                <strong style={{ color: '#38bdf8' }}>Formula:</strong>{' '}
                <code>Score = Max(0, 100 - Sum(Severity Deductions))</code>
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>Penalty Rules:</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                  <li><strong style={{ color: '#ef4444' }}>Critical (-15 pts):</strong> Data leakage, severe contamination, destructive data corruption.</li>
                  <li><strong style={{ color: '#f97316' }}>High (-8 pts):</strong> Biologically impossible values, severe class imbalance, duplicate IDs.</li>
                  <li><strong style={{ color: '#f59e0b' }}>Medium (-4 pts):</strong> Constant features, multicollinearity, sentinel values, high outliers.</li>
                  <li><strong style={{ color: '#3b82f6' }}>Low (-2 pts):</strong> Near-constant features, mild skewness, minor outliers.</li>
                </ul>
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>Current Deductions ({assessment.health_score.deductions.length}):</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {assessment.health_score.deductions.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#0f172a', borderRadius: '4px', border: '1px solid #334155' }}>
                      <span>{d.title}</span>
                      <strong style={{ color: '#ef4444' }}>-{d.points_deducted} pts</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowScoringModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DataHealthCenterView
