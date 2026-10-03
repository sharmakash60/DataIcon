import React, { useState } from 'react'
import { useAuth } from './AuthContext'

interface AgentAction {
  id: string
  tool: string
  purpose: string
  runtimeLocation: string
  durationMs: number
  status: 'completed' | 'running' | 'blocked'
  timestamp: string
}

export const AgentActivityView: React.FC = () => {
  const { activeOrg } = useAuth()
  const [actions] = useState<AgentAction[]>([
    {
      id: 'act-001',
      tool: 'automl_trainer.fit_lightgbm',
      purpose: 'Model training iteration for customer churn prediction',
      runtimeLocation: 'Client Data Plane (Local Process 18960)',
      durationMs: 4210,
      status: 'completed',
      timestamp: '2026-09-29 12:15:32',
    },
    {
      id: 'act-002',
      tool: 'shap_explainer.tree_waterfall',
      purpose: 'Generate local SHAP values for top 100 features',
      runtimeLocation: 'Client Data Plane (Local Process 18960)',
      durationMs: 1840,
      status: 'completed',
      timestamp: '2026-09-29 12:16:04',
    },
    {
      id: 'act-003',
      tool: 'data_profiler.schema_fingerprint',
      purpose: 'Calculate SHA-256 fingerprint on loan default records',
      runtimeLocation: 'Client Data Plane (Local Process 18960)',
      durationMs: 620,
      status: 'completed',
      timestamp: '2026-09-29 12:18:22',
    },
    {
      id: 'act-004',
      tool: 'network_firewall.egress_check',
      purpose: 'Verify raw customer data is contained locally',
      runtimeLocation: 'Boundary Guard Container',
      durationMs: 45,
      status: 'completed',
      timestamp: '2026-09-29 12:20:00',
    },
  ])

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="view-header">
        <h2>Autonomous Agent Activity & Tool Execution Audit</h2>
        <p className="view-subtitle" style={{ color: '#94a3b8', margin: '4px 0 0 0' }}>
          Real-time telemetry of background Data Agent operations running inside client boundary for: <strong>{activeOrg?.organization_name}</strong>.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ACTIVE AGENTS</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>1 Connected</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Client Data Agent (AutoML)</div>
        </div>
        <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL TOOL INVOCATIONS</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>4 Executed</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>All inside local VPC</div>
        </div>
        <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>RAW DATA EGRESS</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>0 Bytes</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Verified air-gapped</div>
        </div>
        <div className="card" style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>CONTAINMENT VIOLATIONS</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a855f7', marginTop: '4px' }}>0 Blocked</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>100% policy pass</div>
        </div>
      </div>

      {/* Activity Table */}
      <div className="card" style={{ padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px' }}>Agent Tool Executions</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
              <th style={{ padding: '12px' }}>TIMESTAMP</th>
              <th style={{ padding: '12px' }}>TOOL / OPERATION</th>
              <th style={{ padding: '12px' }}>PURPOSE</th>
              <th style={{ padding: '12px' }}>RUNTIME LOCATION</th>
              <th style={{ padding: '12px' }}>LATENCY</th>
              <th style={{ padding: '12px' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((act) => (
              <tr key={act.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px', color: '#cbd5e1' }}>{act.timestamp}</td>
                <td style={{ padding: '12px', color: '#38bdf8', fontFamily: 'monospace' }}>{act.tool}</td>
                <td style={{ padding: '12px', color: '#f8fafc' }}>{act.purpose}</td>
                <td style={{ padding: '12px', color: '#94a3b8' }}>{act.runtimeLocation}</td>
                <td style={{ padding: '12px', color: '#cbd5e1' }}>{act.durationMs}ms</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#065f46', color: '#a7f3d0', fontWeight: 600 }}>
                    {act.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AgentActivityView
