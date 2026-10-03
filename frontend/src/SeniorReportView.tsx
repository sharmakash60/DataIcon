import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import type { GenerateReportRequest, SeniorReportDetail, SeniorReportSummary } from './reportTypes'
import type { Project } from './types'

interface Props {
  project: Project
  experimentId: string
  onBack: () => void
}

export default function SeniorReportView({ project, experimentId, onBack }: Props) {
  const { activeOrg } = useAuth()
  const orgId = activeOrg?.organization_id

  const [reports, setReports] = useState<SeniorReportSummary[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [reportDetail, setReportDetail] = useState<SeniorReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate modal state
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [includeAiSynthesis, setIncludeAiSynthesis] = useState(true)
  const [userContext, setUserContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Active section for table-of-contents highlight
  const [activeSectionKey, setActiveSectionKey] = useState<string>('executive_summary')

  const loadReports = async () => {
    if (!orgId) return
    try {
      setLoading(true)
      setError(null)
      const summaries = await api.getSeniorReports(orgId, project.id, experimentId)
      setReports(summaries)
      if (summaries.length > 0) {
        setSelectedReportId(summaries[0].id)
      } else {
        setSelectedReportId(null)
        setReportDetail(null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load senior reports.')
    } finally {
      setLoading(false)
    }
  }

  const loadReportDetail = async (id: string) => {
    if (!orgId) return
    try {
      setLoadingDetail(true)
      const detail = await api.getSeniorReport(orgId, project.id, experimentId, id)
      setReportDetail(detail)
      if (detail.sections && detail.sections.length > 0) {
        setActiveSectionKey(detail.sections[0].key)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report details.')
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [orgId, project.id, experimentId])

  useEffect(() => {
    if (selectedReportId) {
      loadReportDetail(selectedReportId)
    }
  }, [selectedReportId])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId) return
    try {
      setGenerating(true)
      setGenerateError(null)
      const payload: GenerateReportRequest = {
        title: reportTitle.trim() || undefined,
        include_ai_synthesis: includeAiSynthesis,
        user_context: userContext.trim() || undefined,
      }
      const newReport = await api.generateSeniorReport(orgId, project.id, experimentId, payload)
      setShowGenerateModal(false)
      setReportTitle('')
      setUserContext('')
      await loadReports()
      setSelectedReportId(newReport.id)
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate report.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadMarkdown = async () => {
    if (!orgId || !selectedReportId) return
    try {
      const md = await api.downloadSeniorReportMarkdown(orgId, project.id, experimentId, selectedReportId)
      const blob = new Blob([md], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const v = reportDetail?.version || 1
      a.download = `senior_report_v${v}_${experimentId.slice(0, 8)}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Markdown download failed')
    }
  }

  const handleDownloadHtml = async () => {
    if (!orgId || !selectedReportId) return
    try {
      const html = await api.downloadSeniorReportHtml(orgId, project.id, experimentId, selectedReportId)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const v = reportDetail?.version || 1
      a.download = `senior_report_v${v}_${experimentId.slice(0, 8)}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'HTML download failed')
    }
  }

  const handleDownloadPdf = async () => {
    if (!orgId || !selectedReportId) return
    try {
      const blob = await api.downloadSeniorReportPdf(orgId, project.id, experimentId, selectedReportId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const v = reportDetail?.version || 1
      a.download = `senior_report_v${v}_${experimentId.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'PDF download failed')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const scrollToSection = (key: string) => {
    setActiveSectionKey(key)
    const el = document.getElementById(`section-${key}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Format markdown helper for clean interactive display with callout recognition
  const renderMarkdownContent = (content: string) => {
    const lines = content.split('\n')
    return (
      <div style={{ fontSize: '0.92rem', lineHeight: '1.65', color: '#e2e8f0' }}>
        {lines.map((line, idx) => {
          // Provenance Callouts
          if (line.startsWith('> **[MEASURED RESULT]**')) {
            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  borderLeft: '4px solid #10b981',
                  padding: '8px 12px',
                  borderRadius: '0 6px 6px 0',
                  margin: '8px 0',
                  color: '#6ee7b7',
                  fontSize: '0.86rem',
                }}
              >
                {line.replace('> ', '')}
              </div>
            )
          }
          if (line.startsWith('> **[AI INTERPRETATION]**')) {
            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderLeft: '4px solid #f59e0b',
                  padding: '8px 12px',
                  borderRadius: '0 6px 6px 0',
                  margin: '8px 0',
                  color: '#fcd34d',
                  fontSize: '0.86rem',
                }}
              >
                {line.replace('> ', '')}
              </div>
            )
          }
          if (line.startsWith('> **[USER-PROVIDED ASSUMPTION]**')) {
            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderLeft: '4px solid #3b82f6',
                  padding: '8px 12px',
                  borderRadius: '0 6px 6px 0',
                  margin: '8px 0',
                  color: '#93c5fd',
                  fontSize: '0.86rem',
                }}
              >
                {line.replace('> ', '')}
              </div>
            )
          }

          if (line.startsWith('### ')) {
            return (
              <h4 key={idx} style={{ color: '#38bdf8', margin: '18px 0 8px 0', fontSize: '1.1rem' }}>
                {line.replace('### ', '')}
              </h4>
            )
          }
          if (line.startsWith('#### ')) {
            return (
              <h5 key={idx} style={{ color: '#fbbf24', margin: '14px 0 6px 0', fontSize: '0.95rem' }}>
                {line.replace('#### ', '')}
              </h5>
            )
          }
          if (line.startsWith('|')) {
            return (
              <div
                key={idx}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  background: line.includes('---') ? 'transparent' : idx % 2 === 0 ? '#0f172a' : '#1e293b',
                  padding: '2px 8px',
                  borderRadius: '2px',
                }}
              >
                {line}
              </div>
            )
          }
          if (line.startsWith('- ')) {
            return (
              <div key={idx} style={{ display: 'flex', gap: '8px', margin: '4px 0', paddingLeft: '8px' }}>
                <span style={{ color: '#38bdf8' }}>•</span>
                <span>{line.replace('- ', '')}</span>
              </div>
            )
          }
          if (line.trim() === '') {
            return <div key={idx} style={{ height: '8px' }} />
          }
          return (
            <p key={idx} style={{ margin: '6px 0' }}>
              {line}
            </p>
          )
        })}
      </div>
    )
  }

  const renderSourceBadge = (source: string) => {
    const s = source.toLowerCase()
    if (s.includes('ai')) {
      return (
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: '9999px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          ✦ AI Interpretation
        </span>
      )
    }
    if (s.includes('assumption')) {
      return (
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: '9999px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }}
        >
          👤 User Assumption
        </span>
      )
    }
    if (s.includes('composite')) {
      return (
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: '9999px',
            background: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.3)',
          }}
        >
          🛡️ Verified Composite
        </span>
      )
    }
    return (
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: '9999px',
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        ✓ Measured Result
      </span>
    )
  }

  return (
    <div className="senior-report-view" style={{ padding: '24px' }}>
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ← Back to Experiment
          </button>
          <div>
            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.4rem' }}>
              Senior Data Scientist Report Generator
            </h2>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Project: <strong>{project.name}</strong> · Experiment: <code>{experimentId.slice(0, 8)}</code>
            </div>
          </div>
        </div>

        {/* Action Buttons: HTML, PDF, Markdown, Print */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            id="generate-report-btn"
            onClick={() => setShowGenerateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚡ Generate Full Senior Report
          </button>

          {reportDetail && (
            <>
              <button
                type="button"
                className="btn-secondary"
                id="download-markdown-btn"
                onClick={handleDownloadMarkdown}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Download complete report as Markdown"
              >
                📥 Download .md
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="download-html-btn"
                onClick={handleDownloadHtml}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Download styled HTML document"
              >
                🌐 Download .html
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="download-pdf-btn"
                onClick={handleDownloadPdf}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Download PDF document"
              >
                📄 Download .pdf
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="print-report-btn"
                onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Print or Save as PDF"
              >
                🖨️ Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* Strict Provenance Guarantee Banner */}
      <div
        style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid #059669',
          padding: '12px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.25rem' }}>🛡️</span>
          <div>
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.88rem' }}>
              Senior Data Scientist Integrity & Provenance Guarantee
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: '1.4' }}>
              All 23 report sections compile deterministically from stored model runs, validation folds, and profiling artifacts.
              Metrics and statistics are never fabricated by the AI. Distinct provenance tags indicate measured results, AI interpretations, and user assumptions.
            </div>
          </div>
        </div>
        <span
          style={{
            background: 'rgba(16, 185, 129, 0.2)',
            color: '#10b981',
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          ✓ VERIFIED FACT-GROUNDED
        </span>
      </div>

      {error && (
        <div className="auth-error-banner" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Report Content or Empty State */}
      {loading ? (
        <div className="loading-state">Loading senior data scientist reports...</div>
      ) : reports.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            border: '1px dashed #475569',
            borderRadius: '8px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
          <h3 style={{ color: '#f8fafc', margin: '0 0 8px 0' }}>No Senior Data Scientist Report Generated Yet</h3>
          <p style={{ color: '#94a3b8', maxWidth: '520px', margin: '0 auto 20px auto', fontSize: '0.9rem' }}>
            Generate a full 23-section Senior Data Scientist Report covering Executive Summary, Problem Formulation,
            Dataset Quality, Leakage Analysis, Models Evaluated, Cross Validation, Explainability, Deployment, and Reproducibility.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowGenerateModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            ⚡ Generate Senior Report Now
          </button>
        </div>
      ) : loadingDetail || !reportDetail ? (
        <div className="loading-state">Loading report document...</div>
      ) : (
        <div>
          {/* Version Selector Header */}
          {reports.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#0f172a',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #1e293b',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Report Version:</span>
              <select
                value={selectedReportId || ''}
                onChange={(e) => setSelectedReportId(e.target.value)}
                style={{
                  background: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    v{r.version || 1} - {r.title} ({new Date(r.created_at).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Main Layout: Sticky TOC on Left, Document on Right */}
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'flex-start' }}>
            {/* Table of Contents Sticky Sidebar */}
            <aside
              style={{
                position: 'sticky',
                top: '20px',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
                maxHeight: 'calc(100vh - 80px)',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                  borderBottom: '1px solid #1e293b',
                  paddingBottom: '8px',
                }}
              >
                Report Sections ({reportDetail.sections.length})
              </div>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {reportDetail.sections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => scrollToSection(s.key)}
                    style={{
                      textAlign: 'left',
                      background: activeSectionKey === s.key ? '#1e293b' : 'none',
                      color: activeSectionKey === s.key ? '#38bdf8' : '#94a3b8',
                      border: 'none',
                      borderLeft: activeSectionKey === s.key ? '3px solid #38bdf8' : '3px solid transparent',
                      padding: '6px 10px',
                      borderRadius: '0 4px 4px 0',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      fontWeight: activeSectionKey === s.key ? 700 : 400,
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.title}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Document Content View */}
            <main style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Document Header Card */}
              <div
                style={{
                  background: '#1e293b',
                  padding: '24px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '1.5rem' }}>
                      {reportDetail.title}
                    </h2>
                    <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                      Generated at {new Date(reportDetail.created_at).toUTCString()} · Provenance Verified
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span
                      style={{
                        background: '#0b1329',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid #1e293b',
                        color: '#a78bfa',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                      }}
                    >
                      v{reportDetail.version || 1}
                    </span>
                    <span
                      style={{
                        background: '#0f172a',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid #334155',
                        color: '#38bdf8',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      {reportDetail.sections.length} Standard Sections
                    </span>
                  </div>
                </div>
              </div>

              {/* Render Each Section */}
              {reportDetail.sections.map((sec) => (
                <article
                  key={sec.key}
                  id={`section-${sec.key}`}
                  style={{
                    background: '#1e293b',
                    padding: '24px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #334155',
                      paddingBottom: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>{sec.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {renderSourceBadge(sec.source || 'measured_result')}
                    </div>
                  </div>

                  {renderMarkdownContent(sec.content_markdown)}
                </article>
              ))}
            </main>
          </div>
        </div>
      )}

      {/* Generate Report Modal */}
      {showGenerateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 id="modal-title">Generate Senior Data Scientist Report</h3>
              <button
                className="btn-close"
                aria-label="Close dialog"
                onClick={() => setShowGenerateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5' }}>
                  Compiles a comprehensive 23-section technical report from verified experiment benchmarks,
                  data quality telemetry, cross-validation metrics, and SHAP explainability artifacts.
                </p>

                {generateError && <div className="auth-error-banner">{generateError}</div>}

                <div className="form-group">
                  <label htmlFor="report-title-input">Report Title (Optional):</label>
                  <input
                    type="text"
                    id="report-title-input"
                    placeholder={`Senior Data Scientist Report: ${project.name}`}
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="user-context-input">Business Context / Stakeholder Notes (Optional):</label>
                  <textarea
                    id="user-context-input"
                    rows={3}
                    placeholder="e.g., Target enterprise customers with billing threshold > $1,000. Decision latency under 50ms is mandatory."
                    value={userContext}
                    onChange={(e) => setUserContext(e.target.value)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      width: '100%',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="ai-synthesis-checkbox"
                    checked={includeAiSynthesis}
                    onChange={(e) => setIncludeAiSynthesis(e.target.checked)}
                  />
                  <label htmlFor="ai-synthesis-checkbox" style={{ fontSize: '0.85rem', color: '#e2e8f0', cursor: 'pointer' }}>
                    Include qualitative AI executive commentary (grounded in verified facts)
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowGenerateModal(false)}
                  disabled={generating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  id="confirm-generate-report-btn"
                  disabled={generating}
                >
                  {generating ? 'Compiling Verified Report...' : 'Generate 23-Section Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
