import React, { useEffect, useState } from 'react'
import { api } from './api'
import AuditView from './AuditView'
import { useAuth } from './AuthContext'
import { DatasetsView } from './DatasetsView'
import { ModelsView } from './ModelsView'
import { GovernanceView } from './GovernanceView'
import { SecurityView } from './SecurityView'
import { AgentActivityView } from './AgentActivityView'
import { BillingView } from './BillingView'
import { SettingsView } from './SettingsView'
import { AnalysisView } from './AnalysisView'
import { ReportsView } from './ReportsView'
import ProjectsView from './ProjectsView'
import ExperimentsView from './ExperimentsView'
import ExplainabilityView from './ExplainabilityView'
import DeploymentView from './DeploymentView'
import { MonitoringDashboardView } from './MonitoringDashboardView'
import { RoleDashboardView } from './RoleDashboardView'
import SystemHealthView from './SystemHealthView'
import TeamView from './TeamView'
import { getAuthorizedNavigation, type NavItemConfig } from './navigationConfig'
import { type Project } from './types'
import type { DeploymentDetail } from './deploymentTypes'
import { DaTaIconEmblem } from './DaTaIconLogo'

function MonitoringHubView({ orgId, project }: { orgId: string; project: Project | null }) {
  const [deployment, setDeployment] = useState<DeploymentDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDeps() {
      if (!project) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await api.getDeployments(orgId, project.id)
        if (res.items && res.items.length > 0) {
          const detail = await api.getDeployment(orgId, project.id, res.items[0].id)
          setDeployment(detail)
        } else {
          setDeployment(null)
        }
      } catch {
        setDeployment(null)
      } finally {
        setLoading(false)
      }
    }
    loadDeps()
  }, [orgId, project])

  if (!project) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No projects available for monitoring.</div>
  }

  if (loading) {
    return <div className="loading-state">Loading deployment monitoring telemetry...</div>
  }

  if (!deployment) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <h3 style={{ color: '#f8fafc' }}>No Active Deployments Found</h3>
        <p style={{ marginTop: '8px', color: '#94a3b8' }}>
          Monitoring telemetry activates once an approved model deployment is serving traffic.
        </p>
      </div>
    )
  }

  return (
    <MonitoringDashboardView
      orgId={orgId}
      projectId={project.id}
      deployment={deployment}
    />
  )
}

export default function DashboardShell() {
  const { user, organizations, activeOrg, setActiveOrgId, logout, hasPermission } = useAuth()
  const orgId = activeOrg?.organization_id
  const role = activeOrg?.role || 'viewer'

  const navItems = getAuthorizedNavigation(role, hasPermission)
  const [activeTab, setActiveTab] = useState<string>('dashboard')
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  // Load organization projects for hub selectors
  useEffect(() => {
    async function loadProjects() {
      if (!orgId) return
      try {
        const res = await api.getProjects(orgId)
        setProjects(res.items || [])
        if (res.items && res.items.length > 0 && !selectedProjectId) {
          setSelectedProjectId(res.items[0].id)
        }
      } catch {
        // gracefully handle load failures
      }
    }
    loadProjects()
  }, [orgId, role])

  // Ensure activeTab is always one of the authorized items
  useEffect(() => {
    const isCurrentTabAuthorized = navItems.some((item) => item.id === activeTab)
    if (!isCurrentTabAuthorized && navItems.length > 0) {
      setActiveTab(navItems[0].id)
    }
  }, [role, navItems])

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null

  return (
    <div className="dashboard-layout">
      {/* Top Navigation Bar */}
      <header className="dashboard-header">
        <div className="header-left">
          <a className="brand" href="/" aria-label="DaTaIcon home" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <DaTaIconEmblem size={34} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="brand-text" style={{ color: '#172416', letterSpacing: '-0.3px', lineHeight: 1.1 }}>DaTaIcon</span>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', color: '#829F80', textTransform: 'uppercase' }}>Since 2026</span>
            </div>
          </a>

          {/* Organization Switcher Dropdown */}
          {organizations.length > 0 && (
            <div className="org-switcher">
              <button
                type="button"
                className="org-switcher-btn"
                id="org-switcher-button"
                onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                aria-expanded={orgDropdownOpen}
              >
                <span className="org-icon">🏢</span>
                <span className="org-name">{activeOrg?.organization_name || 'Select Org'}</span>
                <span className="org-role-tag">{activeOrg?.role.replace('_', ' ')}</span>
                <span className="chevron-icon">▾</span>
              </button>

              {orgDropdownOpen && (
                <div className="org-dropdown-menu" role="menu">
                  <div className="dropdown-label">Organizations</div>
                  {organizations.map((org) => (
                    <button
                      key={org.organization_id}
                      type="button"
                      className={`dropdown-item ${
                        org.organization_id === activeOrg?.organization_id ? 'active' : ''
                      }`}
                      onClick={() => {
                        setActiveOrgId(org.organization_id)
                        setOrgDropdownOpen(false)
                      }}
                    >
                      <div className="dropdown-item-title">{org.organization_name}</div>
                      <span className="dropdown-item-role">{org.role.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="header-right">
          <span className="environment">LOCAL DEVELOPMENT</span>
          <div className="user-profile-menu">
            <div className="user-info">
              <span className="user-name">{user?.display_name}</span>
              <span className="user-email">{user?.email}</span>
            </div>
            <button
              className="btn-secondary logout-btn"
              id="logout-btn"
              onClick={() => logout()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar + Content */}
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav className="sidebar-nav" aria-label="Dashboard Navigation">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                id={`nav-${item.id}-tab`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}

            <div className="nav-separator" />

            <button
              className={`nav-item ${activeTab === 'health' ? 'active' : ''}`}
              id="nav-health-tab"
              onClick={() => setActiveTab('health')}
            >
              <span className="nav-icon">⚡</span>
              <span>System Health</span>
            </button>

            {/* Bottom Enterprise Edition Badge (TrafficTrace Style) */}
            <div className="sidebar-pro-card">
              <div className="pro-icon-box">🎁</div>
              <strong className="pro-card-title">Enterprise Enclave</strong>
              <p className="pro-card-desc">Zero-knowledge customer runtime boundary active.</p>
              <span className="pro-status-badge">SOC-2 / HIPAA Verified</span>
            </div>
          </nav>
        </aside>

        <main className="dashboard-main">
          {/* Dashboard / Organization Overview */}
          {activeTab === 'dashboard' && (
            <RoleDashboardView onNavigateTab={(tab) => setActiveTab(tab)} />
          )}

          {/* Members (TeamView) */}
          {activeTab === 'members' && <TeamView />}

          {/* Projects / Accessible Projects */}
          {activeTab === 'projects' && <ProjectsView />}

          {/* Datasets */}
          {activeTab === 'datasets' && <DatasetsView />}

          {/* Experiments */}
          {activeTab === 'experiments' && (
            currentProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {projects.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Select Project:</span>
                    <select
                      value={currentProject.id}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.classification})</option>
                      ))}
                    </select>
                  </div>
                )}
                <ExperimentsView project={currentProject} onBack={() => setActiveTab('projects')} />
              </div>
            ) : (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                No projects found. Create a project to view experiments.
              </div>
            )
          )}

          {/* Models */}
          {activeTab === 'models' && <ModelsView />}

          {/* Deployments */}
          {activeTab === 'deployments' && (
            currentProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {projects.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Select Project:</span>
                    <select
                      value={currentProject.id}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.classification})</option>
                      ))}
                    </select>
                  </div>
                )}
                <DeploymentView
                  project={currentProject}
                  experimentId="default"
                  onBack={() => setActiveTab('projects')}
                />
              </div>
            ) : (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                No projects found. Create a project to manage deployments.
              </div>
            )
          )}

          {/* Monitoring */}
          {activeTab === 'monitoring' && orgId && (
            <MonitoringHubView orgId={orgId} project={currentProject} />
          )}

          {/* Explainability */}
          {activeTab === 'explainability' && (
            currentProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {projects.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Select Project:</span>
                    <select
                      value={currentProject.id}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.classification})</option>
                      ))}
                    </select>
                  </div>
                )}
                <ExplainabilityView
                  project={currentProject}
                  experimentId="default"
                  onBack={() => setActiveTab('experiments')}
                />
              </div>
            ) : (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                No projects found.
              </div>
            )
          )}

          {/* Analysis */}
          {activeTab === 'analysis' && <AnalysisView />}

          {/* Reports / Approved Reports / Security Reports */}
          {activeTab === 'reports' && (
            <ReportsView
              title={
                role === 'security_auditor'
                  ? 'Security & Governance Reports'
                  : role === 'viewer'
                  ? 'Approved Reports'
                  : 'Senior Data Scientist Reports'
              }
              subtitle={
                role === 'security_auditor'
                  ? 'Compliance filings, model risk tier determinations, and boundary audit summaries.'
                  : role === 'viewer'
                  ? 'Read-only catalog of finalized and approved machine learning reports.'
                  : '18-section executive and technical model evaluations.'
              }
            />
          )}

          {/* Governance */}
          {activeTab === 'governance' && <GovernanceView />}

          {/* Security */}
          {activeTab === 'security' && <SecurityView />}

          {/* Audit Logs */}
          {activeTab === 'audit' && <AuditView />}

          {/* Agent Activity */}
          {activeTab === 'agents' && <AgentActivityView />}

          {/* Billing */}
          {activeTab === 'billing' && <BillingView />}

          {/* Settings */}
          {activeTab === 'settings' && <SettingsView />}

          {/* System Health */}
          {activeTab === 'health' && (
            <div className="health-tab-content">
              <SystemHealthView />
            </div>
          )}
        </main>
      </div>

      <footer className="dashboard-footer">
        <span>DaTaIcon / Phase 1 Control Plane</span>
        <span>React · FastAPI · PostgreSQL · Redis · Centralized RBAC</span>
      </footer>
    </div>
  )
}
