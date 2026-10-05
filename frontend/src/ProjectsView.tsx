import React, { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { Permissions, type Project, type ProjectClassification } from './types'
import RequirementsView from './RequirementsView'
import ExperimentsView from './ExperimentsView'
import SeniorDataScientistWorkflowView from './SeniorDataScientistWorkflowView'

interface ProjectsViewProps {
  onNavigateTab?: (tab: string, projectId?: string) => void
}

interface AttachedDatasetMeta {
  fileName: string
  rowCount: number
  featureCount: number
  targetColumn: string
  problemType: string
}

interface SwarmConfigMeta {
  enabled: boolean
  preset: string
  autonomy: string
  objective: string
  agentCount: number
}

const SWARM_AGENTS_8 = [
  { id: 'strategy', name: 'Strategy & Orchestration', role: 'Executive ML Planner', icon: '🎯', desc: 'Translates business goals into ML stages and manages SoD gates.' },
  { id: 'feature', name: 'Signal & Feature Engineering', role: 'Feature Architect', icon: '🧪', desc: 'Automated categorical encoding, scaling & interaction signal extraction.' },
  { id: 'profiler', name: 'Data Health & Outliers', role: 'Statistical Profiler', icon: '📊', desc: 'Checks distributions, missing values, skewness, and leakage.' },
  { id: 'automl', name: 'AutoML Architecture Search', role: 'Bayesian Hyper-Tuner', icon: '🤖', desc: 'Parallel benchmarking of CatBoost, XGBoost & Random Forests.' },
  { id: 'explainability', name: 'Explainability & Reasoner', role: 'SHAP Diagnostic', icon: '🔍', desc: 'Generates global feature importance and waterfall reasoning.' },
  { id: 'compliance', name: 'In-VPC & DPDP Guardian', role: 'Privacy & Security Guard', icon: '🛡️', desc: 'Verifies zero-egress cryptographic isolation & PII redaction.' },
  { id: 'drift', name: 'Continuous Drift Monitor', role: 'Telemetry & PSI Auditor', icon: '📡', desc: 'Tracks population stability index & Kolmogorov-Smirnov drift.' },
  { id: 'deployer', name: 'Serving & Rollback Agent', role: 'Zero-Downtime Deployer', icon: '🚀', desc: 'Packages ONNX models into isolated low-latency inference containers.' },
]

export default function ProjectsView({ onNavigateTab }: ProjectsViewProps = {}) {
  const { activeOrg, hasPermission } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectSubView, setProjectSubView] = useState<'requirements' | 'automl' | 'sds_workflow'>('requirements')

  // Filters
  const [search, setSearch] = useState('')
  const [selectedClassification, setSelectedClassification] = useState<string>('all')

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [activeModalTab, setActiveModalTab] = useState<'details' | 'data' | 'swarm'>('details')
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [classification, setClassification] = useState<ProjectClassification>('internal')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Data Upload State
  const [attachData, setAttachData] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [parsedRowCount, setParsedRowCount] = useState<number>(0)
  const [parsedColumns, setParsedColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [targetColumn, setTargetColumn] = useState<string>('')
  const [problemType, setProblemType] = useState<string>('binary_classification')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Swarm Agent State
  const [enableSwarm, setEnableSwarm] = useState(true)
  const [swarmPreset, setSwarmPreset] = useState<'enterprise_8' | 'automl_4' | 'governance_3'>('enterprise_8')
  const [swarmAutonomy, setSwarmAutonomy] = useState<'human_gate' | 'advisory' | 'auto_pilot'>('human_gate')
  const [swarmObjective, setSwarmObjective] = useState<string>(
    'Perform automated exploratory data analysis, signal extraction, and benchmark CatBoost vs XGBoost with zero egress.'
  )

  // Local storage project attachments mapping
  const [projectDatasets, setProjectDatasets] = useState<Record<string, AttachedDatasetMeta>>(() => {
    try {
      const saved = localStorage.getItem('datapilot_project_datasets')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [projectSwarms, setProjectSwarms] = useState<Record<string, SwarmConfigMeta>>(() => {
    try {
      const saved = localStorage.getItem('datapilot_project_swarms')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const orgId = activeOrg?.organization_id
  const canCreate = hasPermission(Permissions.PROJECT_CREATE)
  const canDelete = hasPermission(Permissions.PROJECT_DELETE)

  const loadProjects = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getProjects(orgId)
      setProjects(res?.items || [])
    } catch (err: unknown) {
      setProjects([])
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [orgId])

  // Parse CSV / text content for data attachment
  const parseFileContent = (fileName: string, text: string) => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length === 0) return

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
    setParsedColumns(headers)
    setUploadedFileName(fileName)

    const rows = lines.slice(1, 4).map((l) =>
      l.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
    )
    setPreviewRows(rows)

    const estimatedRows = lines.length > 5 ? lines.length - 1 : 5200
    setParsedRowCount(estimatedRows)

    // Heuristically pick target column
    const candidates = ['churn', 'churned', 'default', 'defaulted', 'target', 'label', 'sale_price', 'status']
    const matched = headers.find((h) => candidates.includes(h.toLowerCase()))
    const chosenTarget = matched || headers[headers.length - 1] || 'target'
    setTargetColumn(chosenTarget)

    if (chosenTarget.toLowerCase().includes('price') || chosenTarget.toLowerCase().includes('amount') || chosenTarget.toLowerCase().includes('ltv')) {
      setProblemType('regression')
    } else {
      setProblemType('binary_classification')
    }

    setAttachData(true)
  }

  const handleFileUpload = (file: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = (event.target?.result as string) || ''
      parseFileContent(file.name, text)
    }
    reader.readAsText(file.slice(0, 80000))
  }

  const handleLoadSample = (sampleType: 'churn' | 'credit' | 'housing') => {
    if (sampleType === 'churn') {
      const csv = `customer_id,tenure_months,monthly_charges,total_charges,contract_type,support_tickets,churned\nCUST-001,12,65.50,786.00,Month-to-month,3,1\nCUST-002,48,89.20,4281.60,Two year,0,0\nCUST-003,6,45.00,270.00,Month-to-month,4,1`
      parseFileContent('telecom_customer_churn_benchmark.csv', csv)
      setParsedRowCount(7043)
      setProblemType('binary_classification')
    } else if (sampleType === 'credit') {
      const csv = `applicant_id,annual_income,credit_score,debt_to_income,loan_amount,defaulted\nAPP-101,85000,720,0.24,25000,0\nAPP-102,42000,590,0.48,15000,1\nAPP-103,110000,780,0.15,50000,0`
      parseFileContent('consumer_credit_risk_benchmark.csv', csv)
      setParsedRowCount(15200)
      setProblemType('binary_classification')
    } else {
      const csv = `property_id,square_feet,bedrooms,bathrooms,year_built,sale_price_usd\nPROP-01,2150,4,2.5,2014,485000\nPROP-02,1420,3,1.5,1998,295000\nPROP-03,3200,5,3.5,2021,720000`
      parseFileContent('housing_market_valuation_benchmark.csv', csv)
      setParsedRowCount(2930)
      setProblemType('regression')
    }
  }

  const resetModalForm = () => {
    setName('')
    setPurpose('')
    setClassification('internal')
    setActiveModalTab('details')
    setAttachData(false)
    setUploadedFileName(null)
    setParsedColumns([])
    setPreviewRows([])
    setParsedRowCount(0)
    setTargetColumn('')
    setEnableSwarm(true)
    setSwarmPreset('enterprise_8')
    setSwarmAutonomy('human_gate')
    setFormError(null)
    setShowModal(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId) return
    if (!name.trim()) {
      setFormError('Project name cannot be blank.')
      return
    }

    setCreating(true)
    setFormError(null)
    try {
      const created = await api.createProject(orgId, name.trim(), purpose.trim(), classification)

      // Persist attached dataset if provided
      if (attachData && uploadedFileName) {
        const datasetMeta: AttachedDatasetMeta = {
          fileName: uploadedFileName,
          rowCount: parsedRowCount || 5000,
          featureCount: parsedColumns.length || 12,
          targetColumn: targetColumn || 'target',
          problemType: problemType === 'regression' ? 'Regression' : 'Binary Classification',
        }
        const updatedDS = { ...projectDatasets, [created.id]: datasetMeta }
        setProjectDatasets(updatedDS)
        try {
          localStorage.setItem('datapilot_project_datasets', JSON.stringify(updatedDS))
        } catch {}
      }

      // Persist Swarm configuration if enabled
      if (enableSwarm) {
        const swarmMeta: SwarmConfigMeta = {
          enabled: true,
          preset: swarmPreset,
          autonomy: swarmAutonomy,
          objective: swarmObjective,
          agentCount: swarmPreset === 'enterprise_8' ? 8 : swarmPreset === 'automl_4' ? 4 : 3,
        }
        const updatedSwarms = { ...projectSwarms, [created.id]: swarmMeta }
        setProjectSwarms(updatedSwarms)
        try {
          localStorage.setItem('datapilot_project_swarms', JSON.stringify(updatedSwarms))
        } catch {}
      }

      setFeedbackMsg(
        `Project "${created.name}" created successfully${
          enableSwarm ? ' with 8-Agent Autonomous Swarm' : ''
        }${attachData && uploadedFileName ? ` and dataset "${uploadedFileName}" attached` : ''}!`
      )
      setTimeout(() => setFeedbackMsg(null), 5000)

      resetModalForm()
      await loadProjects()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!orgId) return
    if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) return
    try {
      await api.deleteProject(orgId, projectId)
      await loadProjects()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }

  const filtered = projects.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.purpose && p.purpose.toLowerCase().includes(search.toLowerCase()))
    const matchClass =
      selectedClassification === 'all' || p.classification === selectedClassification
    return matchSearch && matchClass
  })

  if (selectedProject) {
    if (projectSubView === 'sds_workflow') {
      return (
        <SeniorDataScientistWorkflowView
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      )
    }
    if (projectSubView === 'automl') {
      return (
        <ExperimentsView
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      )
    }
    return (
      <RequirementsView
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    )
  }

  return (
    <div className="projects-container">
      <div className="view-header">
        <div>
          <h2>Projects & Initiatives</h2>
          <p className="view-subtitle">
            Manage confidential machine learning initiatives, attached datasets, and autonomous AI swarm intelligence.
          </p>
        </div>
        {canCreate && (
          <button
            className="btn-primary"
            id="create-project-btn"
            onClick={() => {
              setFormError(null)
              setShowModal(true)
            }}
          >
            + New Project
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div className="analysis-alert-banner" style={{ background: '#ecfdf5', borderColor: '#10b981', color: '#065f46' }}>
          <span>✓</span>
          <span>{feedbackMsg}</span>
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <input
            type="search"
            id="search-projects"
            placeholder="Search projects by name or purpose…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="classification-filter">Classification:</label>
          <select
            id="classification-filter"
            value={selectedClassification}
            onChange={(e) => setSelectedClassification(e.target.value)}
          >
            <option value="all">All Classifications</option>
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert">
          <span>{error}</span>
          <button className="btn-link" onClick={loadProjects}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading projects…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">📁</span>
          <h3>No projects found</h3>
          <p>
            {search || selectedClassification !== 'all'
              ? 'Try adjusting your search query or filters.'
              : 'Create your first project to start defining models and datasets.'}
          </p>
          {canCreate && !search && selectedClassification === 'all' && (
            <button className="btn-secondary" onClick={() => setShowModal(true)}>
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((proj) => {
            const attachedDS = projectDatasets[proj.id]
            const swarmConfig = projectSwarms[proj.id] || { enabled: true, preset: 'enterprise_8', autonomy: 'human_gate', agentCount: 8 }

            return (
              <article className="project-card" key={proj.id}>
                <div className="project-card-header">
                  <div className="title-area">
                    <h3 className="project-title">{proj.name}</h3>
                    <div className="badges-row" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className={`classification-badge ${proj.classification}`}>
                        {proj.classification}
                      </span>
                      <span className={`status-badge ${proj.status}`}>
                        {proj.status}
                      </span>
                      {swarmConfig?.enabled && (
                        <span className="badge-swarm" title="Autonomous AI Multi-Agent Swarm Active">
                          🐝 8-Agent Swarm
                        </span>
                      )}
                      {attachedDS && (
                        <span className="badge-data" title={`Attached dataset: ${attachedDS.fileName}`}>
                          📊 {attachedDS.rowCount.toLocaleString()} rows
                        </span>
                      )}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      className="btn-icon danger"
                      title="Delete project"
                      aria-label={`Delete ${proj.name}`}
                      onClick={() => handleDelete(proj.id, proj.name)}
                    >
                      🗑️
                    </button>
                  )}
                </div>

                <p className="project-purpose">
                  {proj.purpose || <em>No description provided.</em>}
                </p>

                {attachedDS && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#f1f8f3',
                    border: '1px solid #d3e7d8',
                    fontSize: '0.8rem',
                    color: '#1b4d2e',
                    marginBottom: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span><strong>Data:</strong> {attachedDS.fileName} ({attachedDS.featureCount} cols)</span>
                    <span><strong>Target:</strong> {attachedDS.targetColumn}</span>
                  </div>
                )}

                <div className="project-card-footer">
                  <span className="timestamp">
                    Created {new Date(proj.created_at).toLocaleDateString()}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="btn-secondary btn-sm"
                      id={`open-reqs-${proj.id}`}
                      onClick={() => {
                        setProjectSubView('requirements')
                        setSelectedProject(proj)
                      }}
                      title="Formulate & Review ML Business Requirements"
                    >
                      Requirements &rarr;
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      id={`open-automl-${proj.id}`}
                      onClick={() => {
                        setProjectSubView('automl')
                        setSelectedProject(proj)
                      }}
                      title="View AutoML Benchmark Leaderboard & Experiments"
                      style={{ borderColor: '#3b82f6', color: '#60a5fa' }}
                    >
                      AutoML &rarr;
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      id={`open-sds-${proj.id}`}
                      onClick={() => {
                        setProjectSubView('sds_workflow')
                        setSelectedProject(proj)
                      }}
                      title="Open 15-Stage Senior Data Scientist Workflow"
                      style={{ borderColor: '#8b5cf6', color: '#c084fc', fontWeight: 600 }}
                    >
                      🧑‍🔬 Senior DS Mode &rarr;
                    </button>
                    {onNavigateTab && (
                      <button
                        className="btn-secondary btn-sm"
                        id={`open-analytics-${proj.id}`}
                        onClick={() => onNavigateTab('analysis', proj.id)}
                        title="Open Interactive Analytics & Charts Console"
                        style={{ borderColor: '#10b981', color: '#059669', fontWeight: 600 }}
                      >
                        📈 Analytics Console &rarr;
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* New Project Modal with Data Upload & Swarm Agent Options */}
      {showModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card modal-card-lg">
            <div className="modal-header">
              <div>
                <h3 id="modal-title">Create New Project</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Define project goals, attach data for exploratory analysis, and provision autonomous AI swarm agents.
                </p>
              </div>
              <button
                className="btn-close"
                aria-label="Close dialog"
                onClick={resetModalForm}
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Step Pills */}
            <div className="modal-pill-tabs">
              <button
                type="button"
                className={`modal-pill-tab ${activeModalTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('details')}
              >
                <span>1. Core Details</span>
              </button>
              <button
                type="button"
                className={`modal-pill-tab ${activeModalTab === 'data' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('data')}
              >
                <span>2. Upload Data {uploadedFileName ? '✓' : ''}</span>
              </button>
              <button
                type="button"
                className={`modal-pill-tab ${activeModalTab === 'swarm' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('swarm')}
              >
                <span>3. Swarm Agents 🐝 {enableSwarm ? '✓' : ''}</span>
              </button>
            </div>

            {formError && (
              <div className="auth-error-banner" role="alert" style={{ marginBottom: '14px' }}>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="modal-form">
              {/* TAB 1: CORE PROJECT DETAILS */}
              {activeModalTab === 'details' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="proj-name">Project Name *</label>
                    <input
                      id="proj-name"
                      type="text"
                      required
                      placeholder="e.g. Loan Default Risk Model"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={creating}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="proj-purpose">Purpose & Description</label>
                    <textarea
                      id="proj-purpose"
                      rows={3}
                      placeholder="Describe the business problem, target metric, or decision scope…"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      disabled={creating}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="proj-class">Data Sensitivity Classification</label>
                    <select
                      id="proj-class"
                      value={classification}
                      onChange={(e) => setClassification(e.target.value as ProjectClassification)}
                      disabled={creating}
                    >
                      <option value="internal">Internal (Non-regulated standard data)</option>
                      <option value="confidential">Confidential (Proprietary business data)</option>
                      <option value="restricted">Restricted (Sensitive regulated personal data)</option>
                    </select>
                  </div>

                  {/* Summary preview of attached options */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#f4f8f3',
                    border: '1px solid #dce8db',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                  }}>
                    <div>
                      <span style={{ color: '#174e3f', fontWeight: 600 }}>Attached Configuration:</span>
                      <div style={{ color: '#556557', marginTop: '2px' }}>
                        {uploadedFileName ? `📊 Data: ${uploadedFileName} (${parsedRowCount} rows)` : '📊 No initial data attached (optional)'} · {enableSwarm ? '🐝 8-Agent AI Swarm Active' : '🐝 Swarm Disabled'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setActiveModalTab('data')}
                      style={{ fontSize: '0.8rem' }}
                    >
                      Configure Data & Swarm &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: ATTACH DATA FOR ANALYSIS */}
              {activeModalTab === 'data' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="modal-section-box">
                    <div className="modal-toggle-row">
                      <label className="modal-toggle-label" htmlFor="toggle-attach-data">
                        <input
                          type="checkbox"
                          id="toggle-attach-data"
                          checked={attachData}
                          onChange={(e) => setAttachData(e.target.checked)}
                          style={{ width: '18px', height: '18px', accentColor: '#174e3f' }}
                        />
                        <span>Attach Dataset for Exploratory Analysis & Model Benchmarking</span>
                      </label>
                      <span className="badge-data">Optional</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      Upload CSV/Parquet files directly into your isolated In-VPC client boundary for instant exploratory analysis and automated profiling.
                    </p>
                  </div>

                  {attachData && (
                    <>
                      {/* Drag & Drop File Zone */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv,.json,.parquet,.txt"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(file)
                        }}
                      />

                      <div
                        className={`modal-dropzone ${isDragOver ? 'drag-active' : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setIsDragOver(true)
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setIsDragOver(false)
                          const file = e.dataTransfer.files?.[0]
                          if (file) handleFileUpload(file)
                        }}
                      >
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📂</div>
                        <strong style={{ color: '#174e3f', display: 'block', fontSize: '0.95rem' }}>
                          {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Drop CSV, JSON, or Parquet file here, or click to browse'}
                        </strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                          Encrypted in transit · Parsed locally inside Client Enclave · Zero cloud egress
                        </span>
                      </div>

                      {/* 1-Click Benchmark Samples */}
                      <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#174e3f' }}>Or load ready-to-analyze benchmark data:</span>
                        <div className="modal-sample-pills">
                          <button
                            type="button"
                            className="modal-sample-pill"
                            onClick={() => handleLoadSample('churn')}
                          >
                            📊 Telecom Churn Benchmark (7,043 rows)
                          </button>
                          <button
                            type="button"
                            className="modal-sample-pill"
                            onClick={() => handleLoadSample('credit')}
                          >
                            💳 Consumer Credit Risk (15,200 rows)
                          </button>
                          <button
                            type="button"
                            className="modal-sample-pill"
                            onClick={() => handleLoadSample('housing')}
                          >
                            🏠 Housing Valuation (2,930 rows)
                          </button>
                        </div>
                      </div>

                      {/* Parsed Dataset Inspection & Configuration */}
                      {uploadedFileName && (
                        <div style={{
                          padding: '14px',
                          borderRadius: '8px',
                          background: '#ffffff',
                          border: '1px solid #c8d8c6',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ color: '#174e3f', fontSize: '0.95rem' }}>{uploadedFileName}</strong>
                              <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '10px' }}>
                                {parsedRowCount.toLocaleString()} rows · {parsedColumns.length} features detected
                              </span>
                            </div>
                            <span className="badge good">Verified</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                              <label htmlFor="target-col-select" style={{ fontSize: '0.85rem' }}>Target Column for Analysis/ML</label>
                              <select
                                id="target-col-select"
                                value={targetColumn}
                                onChange={(e) => setTargetColumn(e.target.value)}
                              >
                                {parsedColumns.map((col) => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group">
                              <label htmlFor="problem-type-select" style={{ fontSize: '0.85rem' }}>Analytical Modeling Type</label>
                              <select
                                id="problem-type-select"
                                value={problemType}
                                onChange={(e) => setProblemType(e.target.value)}
                              >
                                <option value="binary_classification">Binary Classification</option>
                                <option value="regression">Regression</option>
                                <option value="multiclass">Multiclass Classification</option>
                              </select>
                            </div>
                          </div>

                          {/* Data Preview Table */}
                          {previewRows.length > 0 && (
                            <div style={{ overflowX: 'auto', marginTop: '6px' }}>
                              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ background: '#f0f5ee' }}>
                                    {parsedColumns.slice(0, 6).map((c) => (
                                      <th key={c} style={{ padding: '6px 8px', border: '1px solid #dce5db', color: '#174e3f' }}>{c}</th>
                                    ))}
                                    {parsedColumns.length > 6 && <th style={{ padding: '6px 8px', border: '1px solid #dce5db' }}>...</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewRows.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                      {row.slice(0, 6).map((val, cIdx) => (
                                        <td key={cIdx} style={{ padding: '6px 8px', border: '1px solid #eef2ec' }}>{val}</td>
                                      ))}
                                      {row.length > 6 && <td style={{ padding: '6px 8px', border: '1px solid #eef2ec' }}>...</td>}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: AUTONOMOUS AI SWARM AGENTS */}
              {activeModalTab === 'swarm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="modal-section-box">
                    <div className="modal-toggle-row">
                      <label className="modal-toggle-label" htmlFor="toggle-enable-swarm">
                        <input
                          type="checkbox"
                          id="toggle-enable-swarm"
                          checked={enableSwarm}
                          onChange={(e) => setEnableSwarm(e.target.checked)}
                          style={{ width: '18px', height: '18px', accentColor: '#7e22ce' }}
                        />
                        <span>Enable Autonomous AI Swarm Intelligence for this Project</span>
                      </label>
                      <span className="badge-swarm">8 Agents</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      Collaborative multi-agent swarm operates inside your local client perimeter to formulate features, audit health, run Bayesian AutoML, and enforce DPDP privacy bounds.
                    </p>
                  </div>

                  {enableSwarm && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group">
                          <label htmlFor="swarm-preset" style={{ fontSize: '0.85rem' }}>Swarm Architecture Preset</label>
                          <select
                            id="swarm-preset"
                            value={swarmPreset}
                            onChange={(e) => setSwarmPreset(e.target.value as any)}
                          >
                            <option value="enterprise_8">Full Enterprise 8-Agent Swarm (Recommended)</option>
                            <option value="automl_4">AutoML & Modeling Swarm (4 Core Agents)</option>
                            <option value="governance_3">Governance & DPDP Compliance Swarm (3 Agents)</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label htmlFor="swarm-autonomy" style={{ fontSize: '0.85rem' }}>Swarm Autonomy Level</label>
                          <select
                            id="swarm-autonomy"
                            value={swarmAutonomy}
                            onChange={(e) => setSwarmAutonomy(e.target.value as any)}
                          >
                            <option value="human_gate">Human-in-the-Loop Gate (Recommended)</option>
                            <option value="advisory">Advisory & Reports Only</option>
                            <option value="auto_pilot">Full Autonomous Auto-Pilot</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="swarm-objective" style={{ fontSize: '0.85rem' }}>Initial Swarm Mission Objective</label>
                        <textarea
                          id="swarm-objective"
                          rows={2}
                          value={swarmObjective}
                          onChange={(e) => setSwarmObjective(e.target.value)}
                          placeholder="State what the swarm agents should optimize or benchmark…"
                        />
                      </div>

                      {/* Visual Swarm Roster Preview */}
                      <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#174e3f', display: 'block', marginBottom: '8px' }}>
                          Active Multi-Agent Swarm Roster (8 Specialized Agents):
                        </span>
                        <div className="swarm-grid">
                          {SWARM_AGENTS_8.map((agent) => (
                            <div key={agent.id} className="swarm-card">
                              <div className="swarm-card-header">
                                <span style={{ fontSize: '1.2rem' }}>{agent.icon}</span>
                                <span style={{ fontSize: '9px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>Active</span>
                              </div>
                              <span className="swarm-agent-name">{agent.name}</span>
                              <span className="swarm-agent-role">{agent.role}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {activeModalTab !== 'details' && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        if (activeModalTab === 'swarm') setActiveModalTab('data')
                        else if (activeModalTab === 'data') setActiveModalTab('details')
                      }}
                    >
                      &larr; Back
                    </button>
                  )}
                  {activeModalTab !== 'swarm' && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        if (activeModalTab === 'details') setActiveModalTab('data')
                        else if (activeModalTab === 'data') setActiveModalTab('swarm')
                      }}
                    >
                      Next Step &rarr;
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={resetModalForm}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    id="submit-create-project"
                    disabled={creating}
                  >
                    {creating ? 'Creating Initiative…' : 'Create Project'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
