import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import type { AuditEvent } from './types'

export default function AuditView() {
  const { activeOrg } = useAuth()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const orgId = activeOrg?.organization_id

  const loadAudit = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getAuditEvents(orgId)
      setEvents(res.items)
      setTotal(res.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudit()
  }, [orgId])

  return (
    <div className="audit-container">
      <div className="view-header">
        <div>
          <h2>Security & Governance Audit Trail</h2>
          <p className="view-subtitle">
            Immutable, append-only security logs for {activeOrg?.organization_name}.
          </p>
        </div>
        <button className="btn-secondary" onClick={loadAudit} disabled={loading}>
          Refresh Log
        </button>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert">
          <span>{error}</span>
          <button className="btn-link" onClick={loadAudit}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading audit logs…</div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">📋</span>
          <h3>No audit events recorded</h3>
          <p>State-changing actions and authentication events will appear here automatically.</p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-meta">Total recorded events: <strong>{total}</strong></div>
          <table className="data-table" aria-label="Audit Events Log">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Resource</th>
                <th>Result</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="timestamp">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span className="action-tag">{e.action}</span>
                  </td>
                  <td>
                    <span className="actor-text">{e.actor_email || 'System'}</span>
                  </td>
                  <td>
                    <span className="resource-text">
                      {e.resource_type} {e.resource_id ? `(${e.resource_id.slice(0, 8)}…)` : ''}
                    </span>
                  </td>
                  <td>
                    <span className={`result-badge ${e.result}`}>{e.result}</span>
                  </td>
                  <td className="details-cell">
                    <code>{e.details || '-'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
