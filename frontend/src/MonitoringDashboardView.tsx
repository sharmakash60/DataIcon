import React, { useEffect, useState } from 'react'
import { api } from './api'
import type { DeploymentDetail } from './deploymentTypes'
import type {
  FeatureDriftItem,
  MonitoringAlert,
  MonitoringSnapshot,
} from './monitoringTypes'

interface MonitoringDashboardViewProps {
  orgId: string
  projectId: string
  deployment: DeploymentDetail
}

export const MonitoringDashboardView: React.FC<MonitoringDashboardViewProps> = ({
  orgId,
  projectId,
  deployment,
}) => {
  const [snapshots, setSnapshots] = useState<MonitoringSnapshot[]>([])
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters & Tabs
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'drift' | 'ground_truth' | 'alerts'>('overview')

  // Alert resolution modal
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')
  const [resolving, setResolving] = useState(false)

  // Direct Live Agent Monitoring
  const [isConnectingLive, setIsConnectingLive] = useState(false)
  const [liveMetrics, setLiveMetrics] = useState<any | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')

  // Ground Truth submission state
  const [gtRequestId, setGtRequestId] = useState('')
  const [gtActualValue, setGtActualValue] = useState('')
  const [gtSubmitting, setGtSubmitting] = useState(false)
  const [gtBatchJson, setGtBatchJson] = useState('[\n  {"request_id": "req-1", "actual": 1}\n]')
  const [syncingCloud, setSyncingCloud] = useState(false)

  const loadCloudMonitoring = async () => {
    setLoading(true)
    setError(null)
    try {
      const [snapRes, alertRes] = await Promise.all([
        api.getMonitoringSnapshots(orgId, projectId, deployment.id),
        api.getMonitoringAlerts(orgId, projectId, deployment.id, { unresolvedOnly }),
      ])
      setSnapshots(snapRes?.items || [])
      setAlerts(alertRes?.items || [])
    } catch (err: unknown) {
      setSnapshots([])
      setAlerts([])
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCloudMonitoring()
  }, [orgId, projectId, deployment.id, unresolvedOnly])

  const handleResolveAlert = async (alertId: string) => {
    setResolving(true)
    setError(null)
    try {
      await api.resolveMonitoringAlert(orgId, projectId, deployment.id, alertId, resolveNotes)
      setSuccessMsg('Alert resolved successfully.')
      setResolvingAlertId(null)
      setResolveNotes('')
      // Refresh alerts
      const alertRes = await api.getMonitoringAlerts(orgId, projectId, deployment.id, { unresolvedOnly })
      setAlerts(alertRes.items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert')
    } finally {
      setResolving(false)
    }
  }

  const handleFetchLiveLocalMetrics = async () => {
    setIsConnectingLive(true)
    setError(null)
    try {
      const data = await api.getLocalMonitoringMetrics(deployment.endpoint_url, apiKeyInput || undefined)
      setLiveMetrics(data)
      setSuccessMsg('Successfully connected to local serving microservice telemetry.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reach local serving microservice')
    } finally {
      setIsConnectingLive(false)
    }
  }

  const handleSyncLiveSnapshotToCloud = async () => {
    if (!liveMetrics) return
    setSyncingCloud(true)
    setError(null)
    try {
      await api.ingestMonitoringSnapshot(orgId, projectId, deployment.id, liveMetrics)
      setSuccessMsg('Aggregate metrics successfully ingested to Cloud Control Plane.')
      await loadCloudMonitoring()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sync snapshot to cloud')
    } finally {
      setSyncingCloud(false)
    }
  }

  const handleSubmitGroundTruth = async (e: React.FormEvent) => {
    e.preventDefault()
    setGtSubmitting(true)
    setError(null)
    try {
      let submissions: Array<{ request_id: string; actual: any }> = []
      if (gtRequestId.trim() && gtActualValue.trim()) {
        let parsedActual: any = gtActualValue.trim()
        if (!isNaN(Number(parsedActual))) parsedActual = Number(parsedActual)
        submissions = [{ request_id: gtRequestId.trim(), actual: parsedActual }]
      } else {
        submissions = JSON.parse(gtBatchJson)
      }

      const res = await api.submitGroundTruthDirectly(
        deployment.endpoint_url,
        submissions,
        apiKeyInput || undefined,
      )
      setSuccessMsg(`Ground truth submitted: ${res.matched_count} matched and evaluated.`)
      setGtRequestId('')
      setGtActualValue('')
      // Refresh local metrics
      await handleFetchLiveLocalMetrics()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit ground truth')
    } finally {
      setGtSubmitting(false)
    }
  }

  const latestSnapshot: MonitoringSnapshot | null = snapshots.length > 0 ? snapshots[0] : null
  const currentTelemetry = liveMetrics || latestSnapshot

  return (
    <div className="monitoring-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Privacy Gate Banner */}
      <div
        className="privacy-badge-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.3))',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '8px',
          padding: '12px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 600, color: '#34d399', fontSize: '0.95rem' }}>
              Zero Raw Inference Data Transmitted
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              All feature distributions, KS-tests, PSI calculations, and prediction evaluations run strictly inside the Client Data Plane.
              Only sanitized aggregate metrics and drift scores are sent to the cloud.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={loadCloudMonitoring}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            title="Refresh cloud aggregate snapshots"
          >
            🔄 Refresh Cloud
          </button>
          <button
            onClick={handleFetchLiveLocalMetrics}
            disabled={isConnectingLive}
            className="btn-secondary"
            style={{
              fontSize: '0.8rem',
              padding: '6px 12px',
              borderColor: '#10b981',
              color: '#34d399',
            }}
            title="Connect directly to client serving microservice"
          >
            {isConnectingLive ? 'Connecting...' : '⚡ Probe Local Agent'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ background: '#7f1d1d', color: '#fecaca', padding: '10px 14px', borderRadius: '6px' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ background: '#064e3b', color: '#a7f3d0', padding: '10px 14px', borderRadius: '6px' }}>
          {successMsg}
        </div>
      )}

      {/* Live Agent Control Header */}
      {liveMetrics && (
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '8px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontWeight: 600, color: '#60a5fa' }}>🟢 Connected to Local Serving Microservice: </span>
            <code style={{ color: '#cbd5e1' }}>{deployment.endpoint_url}</code>
            <span style={{ marginLeft: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
              ({liveMetrics.total_requests} in-memory requests buffered)
            </span>
          </div>
          <button
            onClick={handleSyncLiveSnapshotToCloud}
            disabled={syncingCloud}
            className="btn-primary"
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            {syncingCloud ? 'Syncing...' : '☁️ Send Aggregate Snapshot to Cloud'}
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div
        className="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <div className="card" style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Inferences</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
            {currentTelemetry?.total_requests ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Throughput: {currentTelemetry?.throughput_rps?.toFixed(2) ?? '0.00'} req/s
          </div>
        </div>

        <div className="card" style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Latency (p50 / p95)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
            {currentTelemetry?.latency?.p50_ms != null
              ? `${currentTelemetry.latency.p50_ms.toFixed(1)}ms`
              : currentTelemetry?.latency_p50_ms != null
              ? `${currentTelemetry.latency_p50_ms.toFixed(1)}ms`
              : '0.0ms'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            p95:{' '}
            {currentTelemetry?.latency?.p95_ms != null
              ? `${currentTelemetry.latency.p95_ms.toFixed(1)}ms`
              : currentTelemetry?.latency_p95_ms != null
              ? `${currentTelemetry.latency_p95_ms.toFixed(1)}ms`
              : '0.0ms'}{' '}
            | p99:{' '}
            {currentTelemetry?.latency?.p99_ms != null
              ? `${currentTelemetry.latency.p99_ms.toFixed(1)}ms`
              : currentTelemetry?.latency_p99_ms != null
              ? `${currentTelemetry.latency_p99_ms.toFixed(1)}ms`
              : '0.0ms'}
          </div>
        </div>

        <div className="card" style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Error Rate</div>
          <div
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: (currentTelemetry?.error_rate ?? 0) > 0.05 ? '#ef4444' : '#10b981',
              marginTop: '4px',
            }}
          >
            {((currentTelemetry?.error_rate ?? 0) * 100).toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Total Errors: {currentTelemetry?.error_count ?? 0}
          </div>
        </div>

        <div className="card" style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Dataset Drift</div>
          <div
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color:
                currentTelemetry?.data_drift?.dataset_drift_detected || currentTelemetry?.data_drift_detected
                  ? '#f59e0b'
                  : '#10b981',
              marginTop: '4px',
            }}
          >
            {currentTelemetry?.data_drift?.drift_share != null
              ? `${(currentTelemetry.data_drift.drift_share * 100).toFixed(0)}%`
              : currentTelemetry?.data_drift_score != null
              ? `${(currentTelemetry.data_drift_score * 100).toFixed(0)}%`
              : '0%'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {currentTelemetry?.data_drift?.dataset_drift_detected || currentTelemetry?.data_drift_detected
              ? '⚠️ Drift Detected'
              : '✅ Stable'}
          </div>
        </div>

        <div className="card" style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
            Ground Truth Metric ({deployment.primary_metric})
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
            {currentTelemetry?.performance?.metrics?.[deployment.primary_metric] != null
              ? currentTelemetry.performance.metrics[deployment.primary_metric].toFixed(4)
              : currentTelemetry?.metrics?.[deployment.primary_metric] != null
              ? currentTelemetry.metrics[deployment.primary_metric].toFixed(4)
              : 'Pending GT'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Samples:{' '}
            {currentTelemetry?.performance?.sample_count ??
              (currentTelemetry?.metrics?.[deployment.primary_metric] ? 'Available' : 'None')}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
        <button
          className={`btn-secondary ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
          style={{
            background: activeSubTab === 'overview' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            borderColor: activeSubTab === 'overview' ? '#3b82f6' : '#334155',
            color: activeSubTab === 'overview' ? '#60a5fa' : '#94a3b8',
          }}
        >
          📈 Overview & Distribution
        </button>
        <button
          className={`btn-secondary ${activeSubTab === 'drift' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('drift')}
          style={{
            background: activeSubTab === 'drift' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            borderColor: activeSubTab === 'drift' ? '#3b82f6' : '#334155',
            color: activeSubTab === 'drift' ? '#60a5fa' : '#94a3b8',
          }}
        >
          🔬 Feature Drift Analysis
        </button>
        <button
          className={`btn-secondary ${activeSubTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('alerts')}
          style={{
            background: activeSubTab === 'alerts' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            borderColor: activeSubTab === 'alerts' ? '#3b82f6' : '#334155',
            color: activeSubTab === 'alerts' ? '#60a5fa' : '#94a3b8',
          }}
        >
          🚨 Alerts ({alerts.filter((a) => !a.is_resolved).length} Active)
        </button>
        <button
          className={`btn-secondary ${activeSubTab === 'ground_truth' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('ground_truth')}
          style={{
            background: activeSubTab === 'ground_truth' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            borderColor: activeSubTab === 'ground_truth' ? '#3b82f6' : '#334155',
            color: activeSubTab === 'ground_truth' ? '#60a5fa' : '#94a3b8',
          }}
        >
          🎯 Ground Truth Ingestion
        </button>
      </div>

      {/* TAB 1: OVERVIEW & DISTRIBUTION */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ background: '#1e293b', padding: '18px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
              Prediction Distribution
            </h3>
            {currentTelemetry?.prediction_distribution?.class_counts ? (
              <div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
                  Classification Frequencies & Proportions:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(currentTelemetry.prediction_distribution.class_counts).map(
                    ([cls, count]) => {
                      const countNum = Number(count)
                      const total = currentTelemetry.prediction_distribution.total_predictions || 1
                      const pct = ((countNum / total) * 100).toFixed(1)
                      return (
                        <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ width: '80px', color: '#e2e8f0', fontSize: '0.9rem' }}>
                            Class {cls}:
                          </span>
                          <div
                            style={{
                              flex: 1,
                              background: '#334155',
                              height: '18px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                background: '#3b82f6',
                                height: '100%',
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>
                          <span style={{ width: '120px', color: '#94a3b8', fontSize: '0.85rem' }}>
                            {countNum} ({pct}%)
                          </span>
                        </div>
                      )
                    },
                  )}
                </div>
              </div>
            ) : currentTelemetry?.prediction_distribution?.quantiles ? (
              <div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
                  Regression Quantile Distribution:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                  {Object.entries(currentTelemetry.prediction_distribution.quantiles).map(
                    ([q, val]) => (
                      <div key={q} style={{ background: '#0f172a', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Q ({q})</div>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{Number(val).toFixed(3)}</div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                No prediction distribution data recorded yet. Send live inferences via the Test Console to populate.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FEATURE DRIFT ANALYSIS */}
      {activeSubTab === 'drift' && (
        <div className="card" style={{ background: '#1e293b', padding: '18px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
            Feature-Level Drift Diagnostics
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 16px 0' }}>
            Compares live inference feature distributions against baseline training reference using Kolmogorov-Smirnov test (numerical) and Population Stability Index (PSI).
          </p>

          {(currentTelemetry?.feature_drifts || []).length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Feature</th>
                    <th style={{ padding: '8px 12px' }}>Type</th>
                    <th style={{ padding: '8px 12px' }}>Method</th>
                    <th style={{ padding: '8px 12px' }}>Statistic</th>
                    <th style={{ padding: '8px 12px' }}>P-Value</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Baseline vs Live</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentTelemetry.feature_drifts as FeatureDriftItem[]).map((fd, idx) => {
                    const isCritical = fd.severity === 'critical'
                    const isWarning = fd.severity === 'warning'
                    const badgeBg = isCritical
                      ? 'rgba(239, 68, 68, 0.2)'
                      : isWarning
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(16, 185, 129, 0.2)'
                    const badgeColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981'

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>
                          {fd.feature_name}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{fd.dtype}</td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{fd.method}</td>
                        <td style={{ padding: '8px 12px', color: '#f8fafc' }}>
                          {fd.statistic?.toFixed(4)}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                          {fd.p_value != null ? fd.p_value.toFixed(4) : 'N/A'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              background: badgeBg,
                              color: badgeColor,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                            }}
                          >
                            {isCritical ? '🔴 CRITICAL' : isWarning ? '🟡 MODERATE' : '🟢 STABLE'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.8rem' }}>
                          Base Mean: {fd.baseline_stats?.mean != null ? Number(fd.baseline_stats.mean).toFixed(2) : '-'} | Live Mean:{' '}
                          {fd.current_stats?.mean != null ? Number(fd.current_stats.mean).toFixed(2) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
              No feature drift metrics computed yet. Inferences must be logged locally to evaluate against baseline.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ALERTS & RESOLUTION */}
      {activeSubTab === 'alerts' && (
        <div className="card" style={{ background: '#1e293b', padding: '18px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>
              Monitoring Alerts
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#94a3b8', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={unresolvedOnly}
                onChange={(e) => setUnresolvedOnly(e.target.checked)}
              />
              Show Unresolved Only
            </label>
          </div>

          {alerts.length === 0 ? (
            <div style={{ color: '#10b981', padding: '12px 0', fontSize: '0.9rem' }}>
              ✅ No active alerts for this deployment. System is healthy.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {alerts.map((al) => {
                const isCrit = al.severity === 'critical'
                const borderCol = isCrit ? '#ef4444' : al.severity === 'warning' ? '#f59e0b' : '#3b82f6'
                return (
                  <div
                    key={al.id}
                    style={{
                      background: '#0f172a',
                      borderLeft: `4px solid ${borderCol}`,
                      borderRadius: '4px',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: isCrit ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: borderCol,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '3px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {al.severity}
                        </span>
                        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>
                          {al.alert_type}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {new Date(al.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '4px' }}>
                        {al.message}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                        Metric: <code>{al.metric_name}</code> | Threshold: {al.threshold} | Current: {al.current_value}
                      </div>
                    </div>

                    <div>
                      {al.is_resolved ? (
                        <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
                          ✓ Resolved
                        </span>
                      ) : (
                        <button
                          onClick={() => setResolvingAlertId(al.id)}
                          className="btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Resolve Modal Dialog */}
          {resolvingAlertId && (
            <div
              style={{
                marginTop: '16px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '14px',
              }}
            >
              <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
                Resolve Alert
              </div>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Add resolution or investigation notes (optional)..."
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: '#fff',
                  padding: '8px',
                  fontSize: '0.85rem',
                  minHeight: '60px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => handleResolveAlert(resolvingAlertId)}
                  disabled={resolving}
                  className="btn-primary"
                  style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                >
                  {resolving ? 'Resolving...' : 'Confirm Resolution'}
                </button>
                <button
                  onClick={() => setResolvingAlertId(null)}
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GROUND TRUTH INGESTION */}
      {activeSubTab === 'ground_truth' && (
        <div className="card" style={{ background: '#1e293b', padding: '18px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
            Ground Truth Label Ingestion & Evaluation
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 16px 0' }}>
            Submit ground truth labels for observed inferences to calculate true performance metrics (accuracy, F1, ROC-AUC, or RMSE) inside the client data plane.
          </p>

          <form onSubmit={handleSubmitGroundTruth} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Single Request ID
                </label>
                <input
                  type="text"
                  value={gtRequestId}
                  onChange={(e) => setGtRequestId(e.target.value)}
                  placeholder="e.g. req-12345"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '8px',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Actual Label / Ground Truth Value
                </label>
                <input
                  type="text"
                  value={gtActualValue}
                  onChange={(e) => setGtActualValue(e.target.value)}
                  placeholder="e.g. 1 or 0 or continuous float"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '8px',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                Or Batch Ground Truth Submissions (JSON Array):
              </label>
              <textarea
                value={gtBatchJson}
                onChange={(e) => setGtBatchJson(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: '#38bdf8',
                  fontFamily: 'monospace',
                  padding: '8px',
                  fontSize: '0.85rem',
                  minHeight: '80px',
                }}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={gtSubmitting}
                className="btn-primary"
                style={{ fontSize: '0.85rem', padding: '8px 18px' }}
              >
                {gtSubmitting ? 'Evaluating...' : '🎯 Submit & Evaluate Performance'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
