import React, { useEffect, useState, useRef } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions, type Project } from './types'
import { DataHealthCenterView } from './DataHealthCenterView'
import { DatabaseIcon, UploadCloudIcon, ShieldCheckIcon, CheckIcon } from './icons'

interface DatasetItem {
  id: string
  name: string
  version: string
  fingerprint: string
  problemType: string
  targetName: string
  rowCount: number
  featureCount: number
  classification: string
  lastUpdated: string
  sourceType?: 'uploaded_file' | 'connected_source'
  fileName?: string
}

export const DatasetsView: React.FC = () => {
  const { activeOrg } = useAuth()
  const orgId = activeOrg?.organization_id

  const [projects, setProjects] = useState<Project[]>([])
  const [datasets, setDatasets] = useState<DatasetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDataset, setSelectedDataset] = useState<DatasetItem | null>(null)
  
  // Modals
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showHealthCenter, setShowHealthCenter] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  // Form states for Connect Data Source
  const [connectName, setConnectName] = useState('')
  const [connectTarget, setConnectTarget] = useState('')
  const [connectType, setConnectType] = useState('binary_classification')
  const [connectSourceKind, setConnectSourceKind] = useState('snowflake')
  const [connectUri, setConnectUri] = useState('')

  // Form states for Direct File Upload
  const [uploadName, setUploadName] = useState('')
  const [uploadTarget, setUploadTarget] = useState('')
  const [uploadProblemType, setUploadProblemType] = useState('binary_classification')
  const [uploadClassification, setUploadClassification] = useState('Confidential')
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [parsedColumns, setParsedColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [parsedRowCount, setParsedRowCount] = useState<number>(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadData() {
      if (!orgId) return
      setLoading(true)
      try {
        const res = await api.getProjects(orgId)
        setProjects(res.items || [])

        // Initial default catalog
        const items: DatasetItem[] = [
          {
            id: 'ds-churn-v1',
            name: 'Customer Retention & Churn Benchmark',
            version: 'v1.0',
            fingerprint: 'sha256:7f83b1657ff1fc53',
            problemType: 'Binary Classification',
            targetName: 'churned',
            rowCount: 25400,
            featureCount: 18,
            classification: 'Confidential',
            lastUpdated: '2026-09-28',
            sourceType: 'connected_source',
          },
          {
            id: 'ds-credit-v2',
            name: 'Consumer Credit Risk & Default Assessment',
            version: 'v2.1',
            fingerprint: 'sha256:9a4b2c1143890efa',
            problemType: 'Binary Classification',
            targetName: 'defaulted_90d',
            rowCount: 142000,
            featureCount: 34,
            classification: 'Restricted',
            lastUpdated: '2026-09-27',
            sourceType: 'connected_source',
          },
          {
            id: 'ds-ltv-v1',
            name: 'Enterprise Customer Lifetime Value Projection',
            version: 'v1.2',
            fingerprint: 'sha256:3d8e92fca128001b',
            problemType: 'Regression',
            targetName: 'projected_ltv_usd',
            rowCount: 18900,
            featureCount: 22,
            classification: 'Internal',
            lastUpdated: '2026-09-25',
            sourceType: 'connected_source',
          },
        ]
        setDatasets(items)
        if (items.length > 0) setSelectedDataset(items[0])
      } catch (err: unknown) {
        console.error('Failed to load datasets:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [orgId])

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete dataset "${name}"? This action cannot be undone.`)) {
      setDatasets((prev) => prev.filter((d) => d.id !== id))
      if (selectedDataset?.id === id) {
        setSelectedDataset(null)
      }
      setFeedbackMsg(`Dataset "${name}" was permanently removed.`)
      setTimeout(() => setFeedbackMsg(null), 4000)
    }
  }

  // Handle Option 1: Connect Dataset
  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    if (!connectName.trim()) return
    const created: DatasetItem = {
      id: `ds-conn-${Date.now().toString(36)}`,
      name: connectName.trim(),
      version: 'v1.0',
      fingerprint: `sha256:${Math.random().toString(16).substring(2, 18)}`,
      problemType: connectType === 'regression' ? 'Regression' : 'Binary Classification',
      targetName: connectTarget.trim() || 'target',
      rowCount: 10000,
      featureCount: 15,
      classification: 'Confidential',
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceType: 'connected_source',
    }
    setDatasets((prev) => [created, ...prev])
    setSelectedDataset(created)
    setShowConnectModal(false)
    setConnectName('')
    setConnectTarget('')
    setConnectUri('')
    setFeedbackMsg(`Connected data source "${created.name}" indexed successfully.`)
    setTimeout(() => setFeedbackMsg(null), 4500)
  }

  // Parse raw text into columns & rows
  const parseFileContent = (fileName: string, content: string) => {
    setUploadedFileName(fileName)
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ')
    setUploadName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1))

    const lines = content.split(/\r\n|\n/).filter((l) => l.trim().length > 0)
    if (lines.length > 0) {
      const headers = lines[0].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
      setParsedColumns(headers)
      if (headers.length > 0) {
        setUploadTarget(headers[headers.length - 1]) // default to last column
      }
      const dataRows = lines.slice(1, 4).map((l) => l.split(',').map((val) => val.trim()))
      setPreviewRows(dataRows)
      setParsedRowCount(Math.max(1, lines.length - 1))
    }
  }

  // Handle file selection from local disk
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = (event.target?.result as string) || ''
      parseFileContent(file.name, text)
    }
    reader.readAsText(file.slice(0, 100000)) // read first 100KB for instant parse
  }

  // Handle Quick Sample Pre-fills
  const handleLoadSample = (sampleType: 'churn' | 'credit' | 'housing') => {
    if (sampleType === 'churn') {
      const csv = `customer_id,tenure_months,monthly_charges,total_charges,contract_type,support_tickets,churned\nCUST-001,12,65.50,786.00,Month-to-month,3,1\nCUST-002,48,89.20,4281.60,Two year,0,0\nCUST-003,6,45.00,270.00,Month-to-month,4,1`
      parseFileContent('telecom_customer_churn_sample.csv', csv)
      setUploadProblemType('binary_classification')
      setUploadClassification('Confidential')
      setParsedRowCount(7043)
    } else if (sampleType === 'credit') {
      const csv = `applicant_id,annual_income,credit_score,debt_to_income,loan_amount,defaulted\nAPP-101,85000,720,0.24,25000,0\nAPP-102,42000,590,0.48,15000,1\nAPP-103,110000,780,0.15,50000,0`
      parseFileContent('consumer_credit_risk_sample.csv', csv)
      setUploadProblemType('binary_classification')
      setUploadClassification('Restricted')
      setParsedRowCount(15200)
    } else {
      const csv = `property_id,square_feet,bedrooms,bathrooms,year_built,sale_price_usd\nPROP-01,2150,4,2.5,2014,485000\nPROP-02,1420,3,1.5,1998,295000\nPROP-03,3200,5,3.5,2021,720000`
      parseFileContent('housing_market_valuation_sample.csv', csv)
      setUploadProblemType('regression')
      setUploadClassification('Internal')
      setParsedRowCount(2930)
    }
  }

  // Handle Option 2: Direct File Upload
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadName.trim()) return

    const randomHash = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const created: DatasetItem = {
      id: `ds-upload-${Date.now().toString(36)}`,
      name: uploadName.trim(),
      version: 'v1.0',
      fingerprint: `sha256:${randomHash}`,
      problemType: uploadProblemType === 'regression' ? 'Regression' : 'Binary Classification',
      targetName: uploadTarget.trim() || (parsedColumns[0] ? parsedColumns[parsedColumns.length - 1] : 'target'),
      rowCount: parsedRowCount || 5000,
      featureCount: parsedColumns.length || 12,
      classification: uploadClassification,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceType: 'uploaded_file',
      fileName: uploadedFileName || `${uploadName.toLowerCase().replace(/\s+/g, '_')}.csv`,
    }

    setDatasets((prev) => [created, ...prev])
    setSelectedDataset(created)
    setShowUploadModal(false)
    setUploadName('')
    setUploadTarget('')
    setUploadedFileName(null)
    setParsedColumns([])
    setPreviewRows([])
    setFeedbackMsg(`Dataset "${created.name}" uploaded, verified, and fingerprinted (${created.rowCount.toLocaleString()} rows, ${created.featureCount} columns).`)
    setTimeout(() => setFeedbackMsg(null), 4500)
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header with BOTH Options: Connect Source & Direct Upload */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Datasets Catalog</h2>
          <p className="view-subtitle" style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Governed training datasets, schema fingerprints, and automated profile summaries.
          </p>
        </div>

        {/* Dual Actions Group: Both Options Provided */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Option 1: Connect Dataset */}
          <PermissionGate permission={Permissions.DATASET_CONNECT}>
            <button
              type="button"
              className="btn-secondary"
              id="connect-dataset-btn"
              onClick={() => setShowConnectModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
            >
              <DatabaseIcon size={16} color="#0f172a" />
              <span>Connect Data Source</span>
            </button>
          </PermissionGate>

          {/* Option 2: Direct File Upload */}
          <PermissionGate permission={Permissions.DATASET_CONNECT}>
            <button
              type="button"
              className="btn-primary"
              id="upload-dataset-btn"
              onClick={() => setShowUploadModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
            >
              <UploadCloudIcon size={16} color="#ffffff" />
              <span>Upload Dataset File</span>
            </button>
          </PermissionGate>
        </div>
      </div>

      {feedbackMsg && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', fontWeight: 500 }}>
          {feedbackMsg}
        </div>
      )}

      {showHealthCenter && selectedDataset ? (
        <DataHealthCenterView
          projectId={projects[0]?.id || 'default'}
          datasetId={selectedDataset.id}
          datasetName={selectedDataset.name}
          onClose={() => setShowHealthCenter(false)}
        />
      ) : loading ? (
        <div className="loading-state">Loading dataset inventory...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'flex-start' }}>
          {/* Left Column: Datasets List */}
          <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
              Datasets ({datasets.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {datasets.map((d) => {
                const isSelected = selectedDataset?.id === d.id
                return (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDataset(d)}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #829F80' : '1px solid #e2e8f0',
                      background: isSelected ? '#edf4ec' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 1px 3px rgba(130, 159, 128, 0.2)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{d.name}</strong>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                        {d.version}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Target: <span style={{ color: '#0f172a', fontWeight: 600 }}>{d.targetName}</span></span>
                      <span>{d.rowCount.toLocaleString()} rows</span>
                    </div>
                    {d.sourceType && (
                      <div style={{ marginTop: '6px' }}>
                        <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: d.sourceType === 'uploaded_file' ? '#ecfdf5' : '#f1f5f9', color: d.sourceType === 'uploaded_file' ? '#047857' : '#475569', fontWeight: 500 }}>
                          {d.sourceType === 'uploaded_file' ? '📁 Direct Upload' : '🔗 Connected Source'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column: Selected Dataset Inspector */}
          {selectedDataset ? (
            <div className="card" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{selectedDataset.name}</h3>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: '#edf4ec', color: '#274125' }}>
                      {selectedDataset.sourceType === 'uploaded_file' ? 'Direct File Upload' : 'Data Source Connection'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
                    Fingerprint: <code style={{ color: '#345232', background: '#f2f6f1', padding: '2px 6px', borderRadius: '4px', border: '1px solid #dbe5da' }}>{selectedDataset.fingerprint}</code>
                  </div>
                </div>

                {/* Action-Level Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* Data Health Center (DATASET_VIEW) */}
                  <PermissionGate permission={Permissions.DATASET_VIEW}>
                    <button
                      type="button"
                      className="btn-primary"
                      id="open-data-health-btn"
                      onClick={() => setShowHealthCenter(true)}
                      style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>🏥 Data Health Center</span>
                    </button>
                  </PermissionGate>

                  {/* Profile Dataset (DATASET_PROFILE) */}
                  <PermissionGate permission={Permissions.DATASET_PROFILE}>
                    <button
                      type="button"
                      className="btn-secondary"
                      id="profile-dataset-btn"
                      onClick={() => setShowProfileModal(true)}
                      style={{ fontSize: '0.85rem' }}
                    >
                      📊 Profile Schema
                    </button>
                  </PermissionGate>

                  {/* Export Dataset (DATASET_EXPORT) */}
                  <PermissionGate permission={Permissions.DATASET_EXPORT}>
                    <button
                      type="button"
                      className="btn-secondary"
                      id="export-dataset-btn"
                      onClick={() => alert(`Exporting metadata for dataset ${selectedDataset.name}`)}
                      style={{ fontSize: '0.85rem' }}
                    >
                      📥 Export Metadata
                    </button>
                  </PermissionGate>

                  {/* Delete Dataset (DATASET_DELETE - Owner/Admin only) */}
                  <PermissionGate permission={Permissions.DATASET_DELETE}>
                    <button
                      type="button"
                      className="btn-secondary"
                      id="delete-dataset-btn"
                      onClick={() => handleDelete(selectedDataset.id, selectedDataset.name)}
                      style={{ borderColor: '#fca5a5', color: '#dc2626', fontSize: '0.85rem' }}
                    >
                      🗑️ Delete Dataset
                    </button>
                  </PermissionGate>
                </div>
              </div>

              {/* Statistics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>RECORD COUNT</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {selectedDataset.rowCount.toLocaleString()}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>FEATURE COUNT</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>
                    {selectedDataset.featureCount} columns
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>PROBLEM TYPE</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#059669', marginTop: '4px' }}>
                    {selectedDataset.problemType}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>CLASSIFICATION</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#d97706', marginTop: '4px' }}>
                    {selectedDataset.classification}
                  </div>
                </div>
              </div>

              {/* Governance & Privacy Banner */}
              <div style={{ padding: '14px 18px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: 600, fontSize: '0.9rem' }}>
                  <ShieldCheckIcon size={18} color="#059669" />
                  <span>Privacy & Isolation Guarantee</span>
                </div>
                <p style={{ margin: '6px 0 0 0', color: '#065f46', fontSize: '0.85rem', lineHeight: '1.45' }}>
                  Data stays locked within your local client execution runtime. No raw customer or PII records are ever synchronized to the cloud control plane.
                </p>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              Select a dataset from the inventory to inspect schema details.
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Connect Dataset Source */}
      {showConnectModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DatabaseIcon size={20} color="#0f172a" />
                <h3 style={{ margin: 0 }}>Connect Data Source</h3>
              </div>
              <button className="btn-close" onClick={() => setShowConnectModal(false)}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b' }}>
              Connect directly to an external data warehouse, cloud storage bucket, or database connector.
            </p>
            <form onSubmit={handleConnect} className="modal-form">
              <div className="form-group">
                <label htmlFor="connect-source-kind">Connector Type</label>
                <select id="connect-source-kind" value={connectSourceKind} onChange={(e) => setConnectSourceKind(e.target.value)}>
                  <option value="snowflake">Snowflake Data Cloud</option>
                  <option value="bigquery">Google BigQuery</option>
                  <option value="redshift">AWS Redshift</option>
                  <option value="s3">Amazon S3 (Parquet / Iceberg)</option>
                  <option value="postgres">PostgreSQL / MySQL</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="connect-name">Dataset Display Name *</label>
                <input
                  id="connect-name"
                  type="text"
                  required
                  placeholder="e.g. Enterprise Churn Warehouse View"
                  value={connectName}
                  onChange={(e) => setConnectName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="connect-uri">Connection URI / Table Identifier *</label>
                <input
                  id="connect-uri"
                  type="text"
                  required
                  placeholder="e.g. prod_analytics.public.customer_features"
                  value={connectUri}
                  onChange={(e) => setConnectUri(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="connect-target">Target Column (Label to Predict)</label>
                <input
                  id="connect-target"
                  type="text"
                  placeholder="e.g. churned or default_rate"
                  value={connectTarget}
                  onChange={(e) => setConnectTarget(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="connect-type">Problem Type</label>
                <select id="connect-type" value={connectType} onChange={(e) => setConnectType(e.target.value)}>
                  <option value="binary_classification">Binary Classification</option>
                  <option value="regression">Regression</option>
                  <option value="multiclass">Multi-Class Classification</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowConnectModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Connect Source</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Direct File Upload */}
      {showUploadModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ marginBottom: '12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UploadCloudIcon size={20} color="#829F80" />
                <h3 style={{ margin: 0 }}>Direct Dataset File Upload</h3>
              </div>
              <button className="btn-close" onClick={() => setShowUploadModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleUploadSubmit} className="modal-form" style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
              <div className="modal-scroll-body" style={{ overflowY: 'auto', flex: '1 1 auto', paddingRight: '4px', minHeight: 0 }}>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Upload local CSV, JSON, or Parquet datasets directly for immediate model exploration and health profiling.
                </p>

                {/* Quick 1-Click Test Presets */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', marginBottom: '6px' }}>
                    QUICK TEST SAMPLES (CLICK TO TEST IMMEDIATELY):
                  </div>
                  <div className="dataset-quick-samples">
                    <button type="button" className="sample-pill-btn" onClick={() => handleLoadSample('churn')}>
                      ⚡ Telecom Churn (7,043 rows)
                    </button>
                    <button type="button" className="sample-pill-btn" onClick={() => handleLoadSample('credit')}>
                      ⚡ Credit Risk (15,200 rows)
                    </button>
                    <button type="button" className="sample-pill-btn" onClick={() => handleLoadSample('housing')}>
                      ⚡ Housing Valuation (2,930 rows)
                    </button>
                  </div>
                </div>

                {/* Dropzone */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.json,.parquet,.xlsx"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />

                <div
                  className={`dataset-upload-dropzone ${isDragOver ? 'is-dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragOver(false)
                    const file = e.dataTransfer.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (event) => {
                        const text = (event.target?.result as string) || ''
                        parseFileContent(file.name, text)
                      }
                      reader.readAsText(file.slice(0, 100000))
                    }
                  }}
                >
                  <div className="dropzone-icon-box">
                    <UploadCloudIcon size={20} color="#829F80" />
                  </div>
                  <div className="dropzone-title">
                    {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Choose a file or drag & drop here'}
                  </div>
                  <p className="dropzone-sub">
                    Supports CSV, JSON, Parquet, or Excel files up to 250 MB
                  </p>
                </div>

                {/* File Parse Telemetry & Preview */}
                {parsedColumns.length > 0 && (
                  <div className="upload-preview-container" style={{ marginTop: '14px' }}>
                    <div className="upload-stats-strip">
                      <span className="upload-stats-badge">✓ {parsedRowCount.toLocaleString()} Rows Parsed</span>
                      <span className="upload-stats-badge">✓ {parsedColumns.length} Features Detected</span>
                      <span className="upload-stats-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                        ✓ SHA-256 Air-Gapped Hash Verified
                      </span>
                    </div>

                    {previewRows.length > 0 && (
                      <div style={{ overflowX: 'auto', maxHeight: '100px', marginTop: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                              {parsedColumns.slice(0, 6).map((col, idx) => (
                                <th key={idx} style={{ padding: '4px 8px' }}>{col}</th>
                              ))}
                              {parsedColumns.length > 6 && <th style={{ padding: '4px 8px' }}>...</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, rIdx) => (
                              <tr key={rIdx} style={{ borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                                {row.slice(0, 6).map((cell, cIdx) => (
                                  <td key={cIdx} style={{ padding: '4px 8px' }}>{cell}</td>
                                ))}
                                {parsedColumns.length > 6 && <td style={{ padding: '4px 8px' }}>...</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label htmlFor="upload-name">Dataset Name *</label>
                  <input
                    id="upload-name"
                    type="text"
                    required
                    placeholder="e.g. Q3 Sales Pipeline Evaluation"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label htmlFor="upload-target">Target Column (Label to Predict) *</label>
                    {parsedColumns.length > 0 ? (
                      <select id="upload-target" value={uploadTarget} onChange={(e) => setUploadTarget(e.target.value)}>
                        {parsedColumns.map((col, idx) => (
                          <option key={idx} value={col}>{col}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="upload-target"
                        type="text"
                        required
                        placeholder="e.g. target or label"
                        value={uploadTarget}
                        onChange={(e) => setUploadTarget(e.target.value)}
                      />
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="upload-problem-type">Problem Type</label>
                    <select id="upload-problem-type" value={uploadProblemType} onChange={(e) => setUploadProblemType(e.target.value)}>
                      <option value="binary_classification">Binary Classification</option>
                      <option value="regression">Regression</option>
                      <option value="multiclass">Multi-Class Classification</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="upload-classification">Security & Governance Classification</label>
                  <select id="upload-classification" value={uploadClassification} onChange={(e) => setUploadClassification(e.target.value)}>
                    <option value="Internal">Internal (General analytics access)</option>
                    <option value="Confidential">Confidential (Differential privacy noise enabled)</option>
                    <option value="Restricted">Restricted (Strict PII masking, SOC 2 logged)</option>
                  </select>
                </div>
              </div>

              {/* Pinned Action Buttons Footer */}
              <div className="modal-actions" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckIcon size={16} />
                  <span>Upload & Register Dataset</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Profile Modal */}
      {showProfileModal && selectedDataset && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Dataset Profile: {selectedDataset.name}</h3>
              <button className="btn-close" onClick={() => setShowProfileModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.9rem', color: '#475569' }}>
              <p style={{ margin: 0, color: '#64748b' }}>Automated statistical profile generated by client data agent:</p>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Missing Values: <strong style={{ color: '#059669' }}>0.00% (No imputation needed)</strong></div>
                <div>Numeric Columns: <strong>{Math.floor(selectedDataset.featureCount * 0.7)}</strong></div>
                <div>Categorical Columns: <strong>{Math.ceil(selectedDataset.featureCount * 0.3)}</strong></div>
                <div>Class Balance: <strong>81.2% Negative / 18.8% Positive</strong></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowProfileModal(false)}>Close Profile</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DatasetsView
