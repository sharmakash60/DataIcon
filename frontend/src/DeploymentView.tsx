import React, { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import type {
  CreateDeploymentPayload,
  DeploymentDetail,
  DeploymentSummary,
  FeatureSchemaField,
  PredictionResponse,
} from './deploymentTypes'
import { Permissions, type Project } from './types'
import { MonitoringDashboardView } from './MonitoringDashboardView'

interface DeploymentViewProps {
  project: Project
  experimentId: string
  modelName?: string
  targetName?: string
  problemType?: string
  featureNames?: string[]
  onBack: () => void
}

export const DeploymentView: React.FC<DeploymentViewProps> = ({
  project,
  experimentId,
  modelName = 'AutoML Model',
  targetName = 'target',
  problemType = 'classification',
  featureNames = [],
  onBack,
}) => {
  const { activeOrg, user, hasPermission } = useAuth()
  const orgId = activeOrg?.organization_id

  const canCreateDeployment = hasPermission(Permissions.DEPLOYMENT_CREATE)
  const canApproveDeployment = hasPermission(Permissions.MODEL_APPROVE)
  const canUpdateDeployment = hasPermission(Permissions.DEPLOYMENT_UPDATE)

  const [deployments, setDeployments] = useState<DeploymentSummary[]>([])
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentDetail | null>(null)
  const [activeTab, setActiveTab] = useState<'console' | 'code' | 'docker' | 'monitoring' | 'lifecycle'>('console')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Creation form state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateDeploymentPayload>({
    name: `${modelName} Serving Service`,
    deployment_type: 'local',
    endpoint_url: 'http://localhost:8080',
    prediction_path: '/predict',
    notes: 'Low-latency serving runtime deployed inside client boundary.',
    auto_approve: true,
  })
  const [creating, setCreating] = useState(false)

  // Interactive Test Console state
  const [featureInputs, setFeatureInputs] = useState<Record<string, any>>({})
  const [apiKey, setApiKey] = useState('')
  const [predictLoading, setPredictLoading] = useState(false)
  const [predictResult, setPredictResult] = useState<PredictionResponse | null>(null)
  const [predictError, setPredictError] = useState<string | null>(null)
  const [codeLang, setCodeLang] = useState<'curl' | 'python' | 'node'>('curl')
  const [copied, setCopied] = useState(false)

  // Lifecycle action state
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const loadDeployments = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getExperimentDeployments(orgId, project.id, experimentId)
      const items = res?.items || []
      setDeployments(items)
      if (items.length > 0) {
        await loadDeploymentDetail(items[0].id)
      } else {
        setSelectedDeployment(null)
      }
    } catch (err: unknown) {
      setDeployments([])
      setError(err instanceof Error ? err.message : 'Failed to load deployments')
    } finally {
      setLoading(false)
    }
  }

  const loadDeploymentDetail = async (depId: string) => {
    if (!orgId) return
    try {
      const detail = await api.getDeployment(orgId, project.id, depId)
      setSelectedDeployment(detail)

      // Initialize default feature inputs
      const defaults: Record<string, any> = {}
      if (detail.input_schema && detail.input_schema.length > 0) {
        detail.input_schema.forEach((f: FeatureSchemaField) => {
          defaults[f.name] = f.example ?? (f.dtype === 'numeric' ? 0 : 'sample')
        })
      } else if (featureNames.length > 0) {
        featureNames.forEach((name) => {
          defaults[name] = 0
        })
      }
      setFeatureInputs(defaults)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load deployment details')
    }
  }

  useEffect(() => {
    loadDeployments()
  }, [orgId, project.id, experimentId])

  const handleCreateDeployment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId) return
    setCreating(true)
    setError(null)
    try {
      const created = await api.createDeployment(orgId, project.id, experimentId, createForm)
      setShowCreateModal(false)
      setActionSuccess(`Deployment '${created.name}' created successfully.`)
      await loadDeployments()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create deployment')
    } finally {
      setCreating(false)
    }
  }

  const handleApprove = async () => {
    if (!orgId || !selectedDeployment) return
    setActionLoading(true)
    try {
      const updated = await api.approveDeployment(orgId, project.id, selectedDeployment.id)
      setSelectedDeployment(updated)
      setActionSuccess('Deployment approved and activated.')
      await loadDeployments()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve deployment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRollback = async () => {
    if (!orgId || !selectedDeployment) return
    setActionLoading(true)
    try {
      const updated = await api.rollbackDeployment(
        orgId,
        project.id,
        selectedDeployment.id,
        actionReason || 'Manual rollback',
      )
      setSelectedDeployment(updated)
      setActionSuccess('Deployment rolled back.')
      setActionReason('')
      await loadDeployments()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to roll back deployment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStop = async () => {
    if (!orgId || !selectedDeployment) return
    setActionLoading(true)
    try {
      const updated = await api.stopDeployment(
        orgId,
        project.id,
        selectedDeployment.id,
        actionReason || 'Decommissioned',
      )
      setSelectedDeployment(updated)
      setActionSuccess('Deployment stopped.')
      setActionReason('')
      await loadDeployments()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to stop deployment')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeployment) return
    setPredictLoading(true)
    setPredictError(null)
    setPredictResult(null)

    // Convert string numbers to numbers if numeric
    const cleanFeatures: Record<string, any> = {}
    for (const [k, v] of Object.entries(featureInputs)) {
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
        cleanFeatures[k] = Number(v)
      } else {
        cleanFeatures[k] = v
      }
    }

    try {
      // Direct call to client serving endpoint — bypasses cloud control plane!
      const res = await api.predictDirectly(
        selectedDeployment.endpoint_url,
        selectedDeployment.prediction_path,
        { features: cleanFeatures },
        apiKey || undefined,
      )
      setPredictResult(res)
    } catch (err: unknown) {
      setPredictError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to local serving endpoint. Ensure local server or container is running.',
      )
    } finally {
      setPredictLoading(false)
    }
  }

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate code snippets
  const endpoint = selectedDeployment?.endpoint_url || 'http://localhost:8080'
  const path = selectedDeployment?.prediction_path || '/predict'
  const samplePayloadStr = JSON.stringify({ features: featureInputs }, null, 2)

  const curlSnippet = `curl -X POST ${endpoint}${path} \\
  -H "Content-Type: application/json" \\
  ${apiKey ? `-H "X-API-Key: ${apiKey}" \\\n  ` : ''}-d '${samplePayloadStr}'`

  const pythonSnippet = `import httpx

url = "${endpoint}${path}"
headers = {
    "Content-Type": "application/json",
    ${apiKey ? `"X-API-Key": "${apiKey}",` : ''}
}
payload = {samplePayloadStr}

with httpx.Client(timeout=10.0) as client:
    response = client.post(url, json=payload, headers=headers)
    result = response.json()
    print("Prediction:", result["predictions"])
    print("Latency:", result["latency_ms"], "ms")`

  const nodeSnippet = `const url = "${endpoint}${path}";
const headers = {
  "Content-Type": "application/json",
  ${apiKey ? `"X-API-Key": "${apiKey}",` : ''}
};
const payload = ${samplePayloadStr};

const response = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});
const result = await response.json();
console.log("Prediction:", result.predictions);
console.log("Latency:", result.latency_ms, "ms");`

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span style={{ padding: '3px 8px', borderRadius: '4px', background: '#065f46', color: '#34d399', fontSize: '0.75rem', fontWeight: 600 }}>
            🟢 ACTIVE
          </span>
        )
      case 'pending_approval':
        return (
          <span style={{ padding: '3px 8px', borderRadius: '4px', background: '#854d0e', color: '#fef08a', fontSize: '0.75rem', fontWeight: 600 }}>
            ⏳ PENDING APPROVAL
          </span>
        )
      case 'rolled_back':
        return (
          <span style={{ padding: '3px 8px', borderRadius: '4px', background: '#991b1b', color: '#fca5a5', fontSize: '0.75rem', fontWeight: 600 }}>
            ↩️ ROLLED BACK
          </span>
        )
      case 'stopped':
        return (
          <span style={{ padding: '3px 8px', borderRadius: '4px', background: '#334155', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>
            ⏹️ STOPPED
          </span>
        )
      default:
        return <span>{status}</span>
    }
  }

  return (
    <div className="requirements-container">
      {/* Header */}
      <div className="requirements-header" style={{ marginBottom: '20px' }}>
        <div>
          <button type="button" className="btn-secondary" onClick={onBack} style={{ marginBottom: '8px' }}>
            ← Back to Experiments
          </button>
          <h2>Model Deployment & REST Prediction API</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
            <span className="project-badge">Project: <strong>{project.name}</strong></span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>· Model: <strong style={{ color: '#e2e8f0' }}>{modelName}</strong></span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>· Target: <code style={{ color: '#38bdf8' }}>{targetName}</code></span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid #10b981',
              borderRadius: '8px',
              color: '#10b981',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>🛡️ Client Data Plane: Zero Prediction Data Sent to Cloud</span>
          </div>

          {canCreateDeployment && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              ➕ New Deployment
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {actionSuccess && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '8px', color: '#6ee7b7', marginBottom: '16px' }}>
          {actionSuccess}
        </div>
      )}

      {/* Main Grid: Sidebar Deployments List + Detail/Console Area */}
      <div className="requirements-grid" style={{ gridTemplateColumns: '320px 1fr', gap: '20px' }}>
        {/* Sidebar: Deployments */}
        <div className="requirements-form-card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '12px' }}>
            Deployments ({deployments.length})
          </h3>

          {loading ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading deployments...</p>
          ) : deployments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 8px', color: '#64748b' }}>
              {canCreateDeployment && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(true)}
                  style={{ fontSize: '0.85rem' }}
                >
                  Create First Deployment
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {deployments.map((d) => {
                const isSelected = selectedDeployment?.id === d.id
                return (
                  <div
                    key={d.id}
                    onClick={() => loadDeploymentDetail(d.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid #334155',
                      background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{d.name}</strong>
                      {getStatusBadge(d.status)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Type: <span style={{ color: '#38bdf8', textTransform: 'uppercase' }}>{d.deployment_type}</span> · {d.model_version}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', wordBreak: 'break-all' }}>
                      {d.endpoint_url}{d.prediction_path}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedDeployment ? (
          <div className="requirements-history-card" style={{ padding: '20px' }}>
            {/* Deployment Overview Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #334155', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>{selectedDeployment.name}</h3>
                  {getStatusBadge(selectedDeployment.status)}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '6px' }}>
                  Serving URL: <code style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{selectedDeployment.endpoint_url}{selectedDeployment.prediction_path}</code>
                </div>
                {selectedDeployment.notes && (
                  <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '6px', margin: 0 }}>
                    {selectedDeployment.notes}
                  </p>
                )}
              </div>

              {/* Mode indicator */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Deployment Mode</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', textTransform: 'uppercase' }}>
                  {selectedDeployment.deployment_type === 'docker' ? '🐳 Docker Container' : '💻 Local Client Agent'}
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '20px' }}>
              <button
                type="button"
                className={`btn-secondary ${activeTab === 'console' ? 'active' : ''}`}
                onClick={() => setActiveTab('console')}
                style={{
                  background: activeTab === 'console' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  borderColor: activeTab === 'console' ? '#3b82f6' : '#334155',
                  color: activeTab === 'console' ? '#60a5fa' : '#94a3b8',
                }}
              >
                🎮 Test Console (POST /predict)
              </button>
              <button
                type="button"
                className={`btn-secondary ${activeTab === 'code' ? 'active' : ''}`}
                onClick={() => setActiveTab('code')}
                style={{
                  background: activeTab === 'code' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  borderColor: activeTab === 'code' ? '#3b82f6' : '#334155',
                  color: activeTab === 'code' ? '#60a5fa' : '#94a3b8',
                }}
              >
                📋 Integration Snippets
              </button>
              <button
                type="button"
                className={`btn-secondary ${activeTab === 'docker' ? 'active' : ''}`}
                onClick={() => setActiveTab('docker')}
                style={{
                  background: activeTab === 'docker' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  borderColor: activeTab === 'docker' ? '#3b82f6' : '#334155',
                  color: activeTab === 'docker' ? '#60a5fa' : '#94a3b8',
                }}
              >
                🐳 Docker Packaging
              </button>
              <button
                type="button"
                className={`btn-secondary ${activeTab === 'monitoring' ? 'active' : ''}`}
                onClick={() => setActiveTab('monitoring')}
                style={{
                  background: activeTab === 'monitoring' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  borderColor: activeTab === 'monitoring' ? '#3b82f6' : '#334155',
                  color: activeTab === 'monitoring' ? '#60a5fa' : '#94a3b8',
                }}
              >
                📊 Monitoring & Drift
              </button>
              <button
                type="button"
                className={`btn-secondary ${activeTab === 'lifecycle' ? 'active' : ''}`}
                onClick={() => setActiveTab('lifecycle')}
                style={{
                  background: activeTab === 'lifecycle' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  borderColor: activeTab === 'lifecycle' ? '#3b82f6' : '#334155',
                  color: activeTab === 'lifecycle' ? '#60a5fa' : '#94a3b8',
                }}
              >
                ⚙️ Lifecycle & Approval
              </button>
            </div>

            {/* TAB 1: Test Prediction Console */}
            {activeTab === 'console' && (
              <div>
                <form onSubmit={handlePredict}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    {Object.keys(featureInputs).map((feat) => (
                      <div key={feat} className="form-group">
                        <label style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>
                          {feat}
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={featureInputs[feat] ?? ''}
                          onChange={(e) => setFeatureInputs({ ...featureInputs, [feat]: e.target.value })}
                          style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Optional API Key Input */}
                  <div style={{ marginBottom: '20px', maxWidth: '360px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>
                      Client API Key (X-API-Key) <span style={{ color: '#64748b' }}>(Optional)</span>
                    </label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="e.g. your-client-api-key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={predictLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '0.95rem' }}
                  >
                    {predictLoading ? '⏳ Running Inference...' : '🚀 Execute POST /predict'}
                  </button>
                </form>

                {predictError && (
                  <div style={{ marginTop: '20px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5' }}>
                    <strong>Inference Error:</strong> {predictError}
                  </div>
                )}

                {/* Prediction Result Display */}
                {predictResult && (
                  <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>Inference Output</h4>
                      <span style={{ fontSize: '0.8rem', background: '#065f46', color: '#34d399', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        ⚡ Latency: {predictResult.latency_ms} ms
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Target Prediction</span>
                        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#38bdf8' }}>
                          {predictResult.predictions.length > 0 ? String(predictResult.predictions[0]) : '—'}
                        </div>
                      </div>

                      {predictResult.probabilities && predictResult.probabilities.length > 0 && (
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>
                            Class Probabilities
                          </span>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {Object.entries(predictResult.probabilities[0]).map(([cls, prob]) => (
                              <div key={cls} style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5e1' }}>
                                  <span>Class {cls}</span>
                                  <span>{(prob * 100).toFixed(1)}%</span>
                                </div>
                                <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                                  <div
                                    style={{
                                      height: '100%',
                                      width: `${prob * 100}%`,
                                      background: cls === '1' ? '#ef4444' : '#10b981',
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Prediction ID: <code>{predictResult.prediction_id}</code> · Model: {predictResult.model_name} ({predictResult.model_version})
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Integration Code Snippets */}
            {activeTab === 'code' && (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className={`btn-secondary ${codeLang === 'curl' ? 'active' : ''}`}
                    onClick={() => setCodeLang('curl')}
                    style={{ fontSize: '0.85rem' }}
                  >
                    cURL
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary ${codeLang === 'python' ? 'active' : ''}`}
                    onClick={() => setCodeLang('python')}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Python (httpx)
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary ${codeLang === 'node' ? 'active' : ''}`}
                    onClick={() => setCodeLang('node')}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Node.js / TypeScript
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <pre
                    style={{
                      background: '#090d16',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid #1e293b',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
                    {codeLang === 'curl' && curlSnippet}
                    {codeLang === 'python' && pythonSnippet}
                    {codeLang === 'node' && nodeSnippet}
                  </pre>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      handleCopyCode(
                        codeLang === 'curl' ? curlSnippet : codeLang === 'python' ? pythonSnippet : nodeSnippet,
                      )
                    }
                    style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '0.75rem' }}
                  >
                    {copied ? '✅ Copied' : '📋 Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: Docker Deployment Guide */}
            {activeTab === 'docker' && (
              <div style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: '1.6' }}>
                <h4 style={{ color: '#f8fafc', marginBottom: '12px' }}>Containerized Air-Gapped Deployment Guide</h4>
                <p>Deploy this model inside your private VPC or on-premise infrastructure with full container isolation.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                  <div style={{ background: '#0f172a', padding: '12px 16px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <strong style={{ color: '#38bdf8' }}>Step 1: Export Docker Deployment Bundle via Client CLI</strong>
                    <pre style={{ background: '#090d16', padding: '8px', borderRadius: '4px', marginTop: '6px', fontSize: '0.8rem', color: '#f8fafc' }}>
                      datapilot-agent package-docker --artifact ./artifacts/models/{experimentId} --output-dir ./serving_bundle
                    </pre>
                  </div>

                  <div style={{ background: '#0f172a', padding: '12px 16px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <strong style={{ color: '#38bdf8' }}>Step 2: Build the Container Image Locally</strong>
                    <pre style={{ background: '#090d16', padding: '8px', borderRadius: '4px', marginTop: '6px', fontSize: '0.8rem', color: '#f8fafc' }}>
                      docker build -t datapilot-serving:{selectedDeployment.model_version} ./serving_bundle
                    </pre>
                  </div>

                  <div style={{ background: '#0f172a', padding: '12px 16px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <strong style={{ color: '#38bdf8' }}>Step 3: Run the Serving Container</strong>
                    <pre style={{ background: '#090d16', padding: '8px', borderRadius: '4px', marginTop: '6px', fontSize: '0.8rem', color: '#f8fafc' }}>
                      docker run -d -p 8080:8080 -e SERVING_API_KEY="your-secret-key" --name datapilot-serving datapilot-serving:{selectedDeployment.model_version}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Lifecycle & Approval */}
            {activeTab === 'lifecycle' && (
              <div>
                <h4 style={{ color: '#f8fafc', marginBottom: '12px' }}>Governance & Lifecycle Transitions</h4>
                <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Status:</span> <strong>{selectedDeployment.status}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Created:</span> {new Date(selectedDeployment.created_at).toLocaleString()}
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Approved At:</span> {selectedDeployment.approved_at ? new Date(selectedDeployment.approved_at).toLocaleString() : 'Not approved yet'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
                  {selectedDeployment.status === 'pending_approval' && canApproveDeployment && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleApprove}
                      disabled={actionLoading}
                      style={{ background: '#059669', borderColor: '#10b981' }}
                    >
                      {actionLoading ? 'Approving...' : '✅ Approve & Activate Deployment'}
                    </button>
                  )}

                  {selectedDeployment.status === 'active' && canUpdateDeployment && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Reason for rollback / decommissioning..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        style={{ padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleRollback}
                          disabled={actionLoading}
                          style={{ borderColor: '#ef4444', color: '#fca5a5' }}
                        >
                          ↩️ Rollback
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleStop}
                          disabled={actionLoading}
                          style={{ borderColor: '#64748b' }}
                        >
                          ⏹️ Stop / Decommission
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: Model Monitoring & Drift */}
            {activeTab === 'monitoring' && orgId && (
              <MonitoringDashboardView
                orgId={orgId}
                projectId={project.id}
                deployment={selectedDeployment}
              />
            )}
          </div>
        ) : (
          <div className="requirements-history-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', padding: '60px 20px' }}>
            Select or create a deployment to configure prediction serving.
          </div>
        )}
      </div>

      {/* Modal: Create Deployment */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
            }}
          >
            <h3 style={{ color: '#f8fafc', margin: '0 0 16px 0' }}>Configure Model Deployment</h3>
            <form onSubmit={handleCreateDeployment}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Deployment Name
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Deployment Target
                </label>
                <select
                  value={createForm.deployment_type}
                  onChange={(e) => setCreateForm({ ...createForm, deployment_type: e.target.value as 'local' | 'docker' })}
                  style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                >
                  <option value="local">Local Client Agent (Localhost Serving)</option>
                  <option value="docker">Docker Container (Client VPC / On-Premise)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Serving Endpoint URL
                </label>
                <input
                  type="text"
                  required
                  value={createForm.endpoint_url}
                  onChange={(e) => setCreateForm({ ...createForm, endpoint_url: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Notes / Documentation
                </label>
                <textarea
                  rows={3}
                  value={createForm.notes ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creating}
                >
                  {creating ? 'Saving...' : 'Deploy & Serve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeploymentView
