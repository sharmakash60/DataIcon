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

  const getInitialTab = (): string => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase()
      const search = window.location.search.toLowerCase()
      const hash = window.location.hash.toLowerCase()
      if (
        path.includes('analysis') ||
        path.includes('analytic') ||
        search.includes('analysis') ||
        search.includes('analytic') ||
        hash.includes('analysis') ||
        hash.includes('analytic')
      ) {
        return 'analysis'
      }
      if (path.includes('health') || search.includes('health') || hash.includes('health')) {
        return 'health'
      }
    }
    return 'dashboard'
  }

  const [activeTab, setActiveTab] = useState<string>(getInitialTab)
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [hubExperiments, setHubExperiments] = useState<any[]>([])
  const [selectedHubExpId, setSelectedHubExpId] = useState<string>('')
  const [loadingHubExps, setLoadingHubExps] = useState(false)

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

  // Load experiments for active hub tabs (deployments, explainability)
  useEffect(() => {
    async function loadHubExps() {
      const activeProjId = selectedProjectId || (projects[0]?.id)
      if (!orgId || !activeProjId) return
      setLoadingHubExps(true)
      try {
        const res = await api.getExperiments(orgId, activeProjId)
        const items = Array.isArray(res) ? res : ((res as any)?.items || [])
        setHubExperiments(items)
        if (items.length > 0) {
          setSelectedHubExpId(items[0].id)
        } else {
          setSelectedHubExpId('')
        }
      } catch {
        setHubExperiments([])
        setSelectedHubExpId('')
      } finally {
        setLoadingHubExps(false)
      }
    }
    if (activeTab === 'deployments' || activeTab === 'explainability') {
      loadHubExps()
    }
  }, [orgId, selectedProjectId, projects, activeTab])

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
          <div className="header-search-pill">
            <span style={{ fontSize: '14px', color: '#94a3b8' }}>🔍</span>
            <input
              type="text"
              placeholder="Search anything..."
              aria-label="Global search"
            />
          </div>

          <button
            type="button"
            className="btn-primary"
            style={{
              borderRadius: '9999px',
              padding: '8px 20px',
              background: '#181c20',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
            onClick={() => setActiveTab('projects')}
          >
            Create
          </button>

          <button
            type="button"
            className="round-icon-btn"
            title="Notifications"
            aria-label="Notifications"
          >
            🔔
          </button>

          <button
            type="button"
            className="round-icon-btn"
            title="Messages & Activity"
            aria-label="Messages & Activity"
            onClick={() => setActiveTab('audit')}
          >
            💬
          </button>

          <div className="user-profile-menu">
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#181c20',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '13px',
                border: '2px solid #e5e7eb',
              }}
            >
              {user?.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}
            </div>
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
              className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`}
              id="nav-analysis-tab"
              onClick={() => setActiveTab('analysis')}
            >
              <span className="nav-icon">📈</span>
              <span>Analytics Console</span>
            </button>

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

            {/* Bottom Capsule Icon Controls (Image 1 Style) */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', justifyContent: 'center' }}>
              <button
                type="button"
                className="round-icon-btn"
                title="Security Stream"
                aria-label="Security Stream"
                style={{ width: '34px', height: '34px', fontSize: '13px' }}
                onClick={() => setActiveTab('audit')}
              >
                💬
              </button>
              <button
                type="button"
                className="round-icon-btn"
                title="Enclave Security Mode"
                aria-label="Enclave Security Mode"
                style={{ width: '34px', height: '34px', fontSize: '13px' }}
              >
                🌙
              </button>
              <button
                type="button"
                className="round-icon-btn"
                title="System Health"
                aria-label="System Health"
                style={{ width: '34px', height: '34px', fontSize: '13px' }}
                onClick={() => setActiveTab('health')}
              >
                ⚡
              </button>
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
          {activeTab === 'projects' && (
            <ProjectsView
              onNavigateTab={(tab, projId) => {
                if (projId) setSelectedProjectId(projId)
                setActiveTab(tab)
              }}
            />
          )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {projects.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Project:</span>
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

                  {hubExperiments.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Experiment:</span>
                      <select
                        value={selectedHubExpId}
                        onChange={(e) => setSelectedHubExpId(e.target.value)}
                        style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                      >
                        {hubExperiments.map((exp) => (
                          <option key={exp.id} value={exp.id}>
                            {exp.name} ({exp.best_model_name || 'Model'} · {exp.primary_metric} {(exp.best_score ?? 0).toFixed(4)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {loadingHubExps ? (
                  <div className="card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading project experiments...
                  </div>
                ) : hubExperiments.length === 0 ? (
                  <div className="card" style={{ padding: '40px 24px', textAlign: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🚀</div>
                    <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '8px' }}>No Experiments Found for This Project</h3>
                    <p style={{ color: '#94a3b8', maxWidth: '540px', margin: '0 auto 20px auto', fontSize: '0.92rem', lineHeight: '1.6' }}>
                      Production model deployments require an empirical AutoML benchmark run. Run an experiment on the <strong>{currentProject.name}</strong> dataset to build and deploy serving bundles.
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setActiveTab('experiments')}
                      style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      ⚡ Go to Experiments Hub
                    </button>
                  </div>
                ) : (
                  <DeploymentView
                    project={currentProject}
                    experimentId={selectedHubExpId || hubExperiments[0].id}
                    onBack={() => setActiveTab('projects')}
                  />
                )}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {projects.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Project:</span>
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

                  {hubExperiments.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Experiment:</span>
                      <select
                        value={selectedHubExpId}
                        onChange={(e) => setSelectedHubExpId(e.target.value)}
                        style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                      >
                        {hubExperiments.map((exp) => (
                          <option key={exp.id} value={exp.id}>
                            {exp.name} ({exp.best_model_name || 'Model'} · {exp.primary_metric} {(exp.best_score ?? 0).toFixed(4)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {loadingHubExps ? (
                  <div className="card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading project experiments...
                  </div>
                ) : hubExperiments.length === 0 ? (
                  <div className="card" style={{ padding: '40px 24px', textAlign: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
                    <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '8px' }}>No Experiments Found for This Project</h3>
                    <p style={{ color: '#94a3b8', maxWidth: '540px', margin: '0 auto 20px auto', fontSize: '0.92rem', lineHeight: '1.6' }}>
                      Model explainability, SHAP feature attributions, and what-if simulations are computed on benchmarked model runs. Run an AutoML experiment on <strong>{currentProject.name}</strong> to inspect predictions.
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setActiveTab('experiments')}
                      style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      ⚡ Go to Experiments Hub
                    </button>
                  </div>
                ) : (
                  <ExplainabilityView
                    project={currentProject}
                    experimentId={selectedHubExpId || hubExperiments[0].id}
                    onBack={() => setActiveTab('experiments')}
                  />
                )}
              </div>
            ) : (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                No projects found.
              </div>
            )
          )}

          {/* Analysis */}
          {activeTab === 'analysis' && (
            <AnalysisView onBack={() => setActiveTab('dashboard')} />
          )}

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
