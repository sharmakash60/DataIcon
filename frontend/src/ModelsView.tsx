import React, { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions, type Project } from './types'

interface ModelItem {
  id: string
  name: string
  version: string
  algorithm: string
  primaryMetricName: string
  primaryMetricScore: number
  latencyMs: number
  status: 'active' | 'pending_approval' | 'draft'
  datasetName: string
  approvedBy?: string
  lastEvaluated: string
}

export const ModelsView: React.FC = () => {
  const { activeOrg } = useAuth()
  const orgId = activeOrg?.organization_id

  const [models, setModels] = useState<ModelItem[]>([
    {
      id: 'model-lgbm-v1',
      name: 'LightGBM Churn Risk Classifier',
      version: 'v1.4.2',
      algorithm: 'LightGBM (Gradient Boosted Trees)',
      primaryMetricName: 'ROC-AUC',
      primaryMetricScore: 0.9412,
      latencyMs: 8.4,
      status: 'active',
      datasetName: 'Customer Retention & Churn Benchmark',
      approvedBy: 'admin@datapilot.dev',
      lastEvaluated: '2026-09-28',
    },
    {
      id: 'model-xgb-v2',
      name: 'XGBoost Credit Default Predictor',
      version: 'v2.0.0',
      algorithm: 'XGBoost Regressor / Classifier',
      primaryMetricName: 'F1 Score',
      primaryMetricScore: 0.9185,
      latencyMs: 12.1,
      status: 'pending_approval',
      datasetName: 'Consumer Credit Risk & Default Assessment',
      lastEvaluated: '2026-09-29',
    },
    {
      id: 'model-rf-v1',
      name: 'Random Forest LTV Forecaster',
      version: 'v1.1.0',
      algorithm: 'Scikit-Learn Random Forest',
      primaryMetricName: 'R-Squared',
      primaryMetricScore: 0.8842,
      latencyMs: 6.2,
      status: 'draft',
      datasetName: 'Enterprise Customer Lifetime Value Projection',
      lastEvaluated: '2026-09-26',
    },
  ])

  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(models[0])
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleApprove = (id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: 'active', approvedBy: 'Authorized Approver' } : m)),
    )
    if (selectedModel?.id === id) {
      setSelectedModel((prev) => (prev ? { ...prev, status: 'active', approvedBy: 'Authorized Approver' } : null))
    }
    setFeedback(`Model "${selectedModel?.name}" approved and activated for production serving.`)
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleDeploy = (id: string) => {
    alert(`Deploying model ${selectedModel?.name} to local inference endpoint...`)
    setFeedback(`Deployment initiated for ${selectedModel?.name}. Ready for traffic.`)
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Model Registry</h2>
          <p className="view-subtitle" style={{ color: '#94a3b8', margin: '4px 0 0 0' }}>
            Production ML model catalog, benchmark verification, and separation-of-duties governance.
          </p>
        </div>
      </div>

      {feedback && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '8px', color: '#6ee7b7' }}>
          {feedback}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Column: Model List */}
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
            Registered Models ({models.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {models.map((m) => {
              const isSelected = selectedModel?.id === m.id
              const statusColors = {
                active: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
                pending_approval: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
                draft: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
              }
              const currentStatus = statusColors[m.status]
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedModel(m)}
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 1px 2px rgba(37, 99, 235, 0.1)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{m.name}</strong>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: currentStatus.bg,
                        color: currentStatus.text,
                        border: `1px solid ${currentStatus.border}`,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {m.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
                    {m.primaryMetricName}: <strong style={{ color: '#059669' }}>{m.primaryMetricScore.toFixed(4)}</strong> · {m.latencyMs}ms
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Model Details */}
        {selectedModel && (
          <div className="card" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{selectedModel.name}</h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
                  Version: <span style={{ color: '#2563eb', fontWeight: 600 }}>{selectedModel.version}</span> · Algorithm: <strong style={{ color: '#0f172a' }}>{selectedModel.algorithm}</strong>
                </div>
              </div>

              {/* Action Buttons with centralized PermissionGate */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Analyze Model (EXPERIMENT_VIEW) */}
                <PermissionGate permission={Permissions.EXPERIMENT_VIEW}>
                  <button
                    type="button"
                    className="btn-secondary"
                    id="analyze-model-btn"
                    onClick={() => alert(`Opening explainability & benchmark analysis for ${selectedModel.name}`)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    🔍 Analyze Model
                  </button>
                </PermissionGate>

                {/* Deploy Model (DEPLOYMENT_CREATE) - Viewer cannot see */}
                <PermissionGate permission={Permissions.DEPLOYMENT_CREATE}>
                  <button
                    type="button"
                    className="btn-primary"
                    id="deploy-model-btn"
                    onClick={() => handleDeploy(selectedModel.id)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    🚀 Deploy Model
                  </button>
                </PermissionGate>

                {/* Approve Model (MODEL_APPROVE) - Separation of Duties: Owner/Admin only, DS and Viewer cannot approve */}
                {selectedModel.status === 'pending_approval' && (
                  <PermissionGate permission={Permissions.MODEL_APPROVE}>
                    <button
                      type="button"
                      className="btn-primary"
                      id="approve-model-btn"
                      onClick={() => handleApprove(selectedModel.id)}
                      style={{ background: '#059669', borderColor: '#059669', fontSize: '0.85rem' }}
                    >
                      ✅ Approve Model
                    </button>
                  </PermissionGate>
                )}
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>PRIMARY METRIC</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
                  {selectedModel.primaryMetricScore.toFixed(4)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{selectedModel.primaryMetricName}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>INFERENCE LATENCY</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>
                  {selectedModel.latencyMs} ms
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>P95 on local client</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>TRAINED ON</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', marginTop: '6px' }}>
                  {selectedModel.datasetName}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>APPROVAL STATUS</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#d97706', marginTop: '6px', textTransform: 'capitalize' }}>
                  {selectedModel.status.replace('_', ' ')}
                </div>
                {selectedModel.approvedBy && (
                  <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '2px' }}>By: {selectedModel.approvedBy}</div>
                )}
              </div>
            </div>

            {/* Governance notice */}
            <div style={{ padding: '14px 18px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px' }}>
              <div style={{ color: '#4338ca', fontWeight: 600, fontSize: '0.9rem' }}>
                ⚖️ Separation of Duties (SoD) Active
              </div>
              <p style={{ margin: '6px 0 0 0', color: '#3730a3', fontSize: '0.85rem', lineHeight: '1.45' }}>
                Model training and deployment proposals are submitted by Data Scientists. Only designated Administrators or Organization Owners can approve models for production activation.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ModelsView
