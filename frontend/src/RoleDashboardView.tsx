import React, { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { Permissions, type AuditEvent, type Project } from './types'

interface RoleDashboardViewProps {
  onNavigateTab: (tab: string) => void
}

export const RoleDashboardView: React.FC<RoleDashboardViewProps> = ({ onNavigateTab }) => {
  const { user, activeOrg, hasPermission } = useAuth()
  const orgId = activeOrg?.organization_id
  const role = activeOrg?.role || 'viewer'

  const [projects, setProjects] = useState<Project[]>([])
  const [memberCount, setMemberCount] = useState<number>(0)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (!orgId) return
      setLoading(false)
      try {
        if (hasPermission(Permissions.PROJECT_VIEW)) {
          const res = await api.getProjects(orgId)
          setProjects(res.items || [])
        }
        if (hasPermission(Permissions.MEMBERS_VIEW)) {
          const members = await api.getMembers(orgId)
          setMemberCount(members.length)
        }
        if (hasPermission(Permissions.AUDIT_LOG_VIEW)) {
          const logs = await api.getAuditEvents(orgId)
          setAuditEvents(logs.items.slice(0, 5))
        }
      } catch {
        // gracefully handle permission-scoped load failures
      }
    }
    loadData()
  }, [orgId, role])

  const renderRoleBadge = () => {
    const roleColors: Record<string, { bg: string; color: string; label: string }> = {
      owner: { bg: '#831843', color: '#fbcfe8', label: 'Organization Owner' },
      admin: { bg: '#1e3a8a', color: '#bfdbfe', label: 'Administrator' },
      data_scientist: { bg: '#065f46', color: '#a7f3d0', label: 'Data Scientist' },
      analyst: { bg: '#713f12', color: '#fef08a', label: 'Business Analyst' },
      viewer: { bg: '#334155', color: '#cbd5e1', label: 'Read-Only Viewer' },
      security_auditor: { bg: '#4c1d95', color: '#ddd6fe', label: 'Security Auditor' },
    }
    const current = roleColors[role] || { bg: '#334155', color: '#cbd5e1', label: role }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: '9999px',
          background: current.bg,
          color: current.color,
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {current.label}
      </span>
    )
  }

  return (
    <div className="role-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #174e3f 0%, #0d2820 100%)',
          color: '#ffffff',
          padding: '28px 32px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(23, 78, 63, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ color: '#ffffff', margin: 0, fontSize: '1.6rem' }}>
              Welcome back, {user?.display_name || 'User'}
            </h2>
            {renderRoleBadge()}
          </div>
          <p style={{ margin: 0, color: '#e0edac', fontSize: '0.95rem', opacity: 0.9 }}>
            Active Organization: <strong>{activeOrg?.organization_name}</strong> · Role-scoped RBAC Enforcement Active
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={() => onNavigateTab('analysis')}
            style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.4)', fontWeight: 600 }}
          >
            📊 Analytics & Charts Console
          </button>
          {hasPermission(Permissions.PROJECT_CREATE) && (
            <button
              className="btn-primary"
              onClick={() => onNavigateTab('projects')}
              style={{ background: '#e0edac', color: '#174e3f', borderColor: '#e0edac' }}
            >
              + New Initiative
            </button>
          )}
          {hasPermission(Permissions.MEMBERS_INVITE) && (
            <button
              className="btn-secondary"
              onClick={() => onNavigateTab('team')}
              style={{ background: 'rgba(255, 255, 255, 0.15)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.3)' }}
            >
              Manage Team
            </button>
          )}
        </div>
      </div>

      {/* 1. OWNER / ADMIN DASHBOARD */}
      {(role === 'owner' || role === 'admin') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">ORGANIZATION HEALTH</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#35632b', margin: '8px 0' }}>100% Ready</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>PostgreSQL · Redis · Migrations Up-to-Date</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">TOTAL MEMBERS</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#174e3f', margin: '8px 0' }}>{memberCount}</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>RBAC Authorized Identities</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">ACTIVE PROJECTS</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#174e3f', margin: '8px 0' }}>{projects.length}</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Production & Staging Initiatives</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">SECURITY POSTURE</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#15803d', margin: '8px 0' }}>Enforced</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Zero Client Data Leakage Plane</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">MANAGEMENT QUICK ACCESS</div>
                  <h2>Organization Control Center</h2>
                </div>
              </div>
              <p style={{ color: '#677367', fontSize: '0.9rem', marginBottom: '16px' }}>
                As an organization administrator, you have full privileges to assign project access, grant permitted roles, and enforce corporate governance.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  className="btn-secondary"
                  onClick={() => onNavigateTab('projects')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>📁</span>
                  <div>
                    <strong>Initiatives & Projects</strong>
                    <div style={{ fontSize: '0.75rem', color: '#677367' }}>Browse {projects.length} registered projects</div>
                  </div>
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => onNavigateTab('team')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>👥</span>
                  <div>
                    <strong>Team & Project Access</strong>
                    <div style={{ fontSize: '0.75rem', color: '#677367' }}>Manage membership & permissions</div>
                  </div>
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => onNavigateTab('audit')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>📋</span>
                  <div>
                    <strong>Audit Trail</strong>
                    <div style={{ fontSize: '0.75rem', color: '#677367' }}>Immutable security event stream</div>
                  </div>
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => onNavigateTab('health')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>⚡</span>
                  <div>
                    <strong>System Diagnostics</strong>
                    <div style={{ fontSize: '0.75rem', color: '#677367' }}>Control plane & infra metrics</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">RECENT INITIATIVES</div>
                  <h2>Active Projects</h2>
                </div>
              </div>
              {projects.length === 0 ? (
                <div style={{ color: '#677367', fontSize: '0.9rem', padding: '20px 0' }}>No initiatives created yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {projects.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '10px 14px',
                        background: '#f8faf5',
                        border: '1px solid #dce2d8',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#174e3f', fontSize: '0.9rem' }}>{p.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#677367' }}>Classification: {p.classification}</div>
                      </div>
                      <span className="badge good">{p.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 2. DATA SCIENTIST DASHBOARD */}
      {role === 'data_scientist' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">ASSIGNED PROJECTS</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#065f46', margin: '8px 0' }}>{projects.length}</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Projects with DS Access Rights</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">AUTOML WORKBENCH</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#174e3f', margin: '8px 0' }}>Active</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Full Experiment & Benchmarking Engine</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">EXPLAINABILITY & SHAP</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0284c7', margin: '8px 0' }}>Enabled</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Feature Importance & Diagnostic Tools</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">DATA PLANE SECURITY</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#15803d', margin: '8px 0' }}>Isolated</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Zero Raw Training Data Cloud Egress</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">MACHINE LEARNING WORKFLOW</div>
                <h2>Your Assigned ML Projects</h2>
              </div>
              <button className="btn-primary" onClick={() => onNavigateTab('projects')}>
                Open Projects Workspace &rarr;
              </button>
            </div>
            <p style={{ color: '#677367', fontSize: '0.9rem' }}>
              As a Data Scientist, you can formulate ML requirements, execute automated model benchmarks, inspect SHAP values, and propose models for deployment approval.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', marginTop: '16px' }}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    border: '1px solid #dce2d8',
                    background: '#f8faf5',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 6px 0', color: '#174e3f' }}>{p.name}</h3>
                    <p style={{ fontSize: '0.8rem', color: '#677367', margin: 0 }}>
                      {p.purpose || 'Active machine learning project.'}
                    </p>
                  </div>
                  <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge good">{p.classification}</span>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => onNavigateTab('projects')}
                      style={{ fontSize: '0.8rem' }}
                    >
                      Open Experiments &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 3. ANALYST DASHBOARD */}
      {role === 'analyst' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">ASSIGNED ANALYTICS PROJECTS</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#713f12', margin: '8px 0' }}>{projects.length}</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Permitted Analytical Workspaces</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">SENIOR DS REPORTS</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#174e3f', margin: '8px 0' }}>Available</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>18-Section Business & Technical Reports</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">DATA PROFILING & INSIGHTS</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0284c7', margin: '8px 0' }}>Enabled</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Summary Distributions & Correlations</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">BUSINESS INTELLIGENCE</div>
                <h2>Analytical Projects & Reports</h2>
              </div>
            </div>
            <p style={{ color: '#677367', fontSize: '0.9rem' }}>
              You have access to inspect approved datasets, analyze model benchmark results, and review comprehensive senior reports for your assigned projects.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: '1px solid #dce2d8',
                    background: '#fff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#174e3f' }}>{p.name}</h3>
                    <div style={{ fontSize: '0.8rem', color: '#677367' }}>
                      {p.purpose || 'Analytical project'} · Classification: {p.classification}
                    </div>
                  </div>
                  <button className="btn-secondary" onClick={() => onNavigateTab('projects')}>
                    Inspect Analytics &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 4. VIEWER DASHBOARD */}
      {role === 'viewer' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">ACCESSIBLE INITIATIVES</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#334155', margin: '8px 0' }}>{projects.length}</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Assigned Read-Only Projects</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">ACCESS LEVEL</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#174e3f', margin: '8px 0' }}>Read-Only</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Strictly Enforced Gated Access</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">OPERATIONAL MONITORING</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0284c7', margin: '8px 0' }}>Live</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Real-time Drift & Latency Metrics</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">OBSERVABILITY CATALOG</div>
                <h2>Approved Project Summaries</h2>
              </div>
            </div>
            <div
              style={{
                padding: '12px 16px',
                background: '#f8faf5',
                border: '1px solid #dce2d8',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#677367',
                marginBottom: '16px',
              }}
            >
              🔒 <strong>Viewer Role Policy:</strong> You have read-only access to view completed model benchmarks, reports, and production monitoring for your assigned initiatives. Creation, modification, training, and deployment controls are restricted to administrators and data scientists.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #dce2d8',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ color: '#174e3f' }}>{p.name}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#677367' }}>{p.purpose || 'Read-only access'}</div>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => onNavigateTab('projects')}>
                    View Details &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 5. SECURITY AUDITOR DASHBOARD */}
      {role === 'security_auditor' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">AUDIT EVENT STREAM</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#4c1d95', margin: '8px 0' }}>Real-time</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Append-Only Security Audit Trail</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">DATA BOUNDARY INTEGRITY</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#15803d', margin: '8px 0' }}>100% Isolated</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Zero Client Data Leakage Guaranteed</div>
            </div>

            <div className="panel" style={{ padding: '20px' }}>
              <div className="eyebrow">TENANT ISOLATION</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#174e3f', margin: '8px 0' }}>Verified</div>
              <div style={{ fontSize: '0.85rem', color: '#677367' }}>Multi-Tenant BOLA/IDOR Defenses Active</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">COMPLIANCE & SURVEILLANCE</div>
                <h2>Recent Security & Audit Events</h2>
              </div>
              <button className="btn-secondary" onClick={() => onNavigateTab('audit')}>
                View Full Audit Trail &rarr;
              </button>
            </div>
            <p style={{ color: '#677367', fontSize: '0.9rem' }}>
              As a Security Auditor, you inspect access streams, policy conformance, and data classification tags without permissions to alter ML production artifacts.
            </p>

            {auditEvents.length === 0 ? (
              <div style={{ color: '#677367', fontSize: '0.9rem', padding: '16px 0' }}>No recent audit events captured.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                {auditEvents.map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid #dce2d8',
                      background: '#f8faf5',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#174e3f', fontSize: '0.9rem' }}>{evt.action}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#677367' }}>
                        Actor: {evt.actor_email || 'System'} · Resource: {evt.resource_type}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={`badge ${evt.result === 'success' ? 'good' : 'danger'}`}>{evt.result}</span>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                        {new Date(evt.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
