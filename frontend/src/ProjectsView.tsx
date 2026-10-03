import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { Permissions, type Project, type ProjectClassification } from './types'
import RequirementsView from './RequirementsView'
import ExperimentsView from './ExperimentsView'
import SeniorDataScientistWorkflowView from './SeniorDataScientistWorkflowView'

export default function ProjectsView() {
  const { activeOrg, hasPermission } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectSubView, setProjectSubView] = useState<'requirements' | 'automl' | 'sds_workflow'>('requirements')

  // Filters
  const [search, setSearch] = useState('')
  const [selectedClassification, setSelectedClassification] = useState<string>('all')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [classification, setClassification] = useState<ProjectClassification>('internal')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const orgId = activeOrg?.organization_id
  const canCreate = hasPermission(Permissions.PROJECT_CREATE)
  const canDelete = hasPermission(Permissions.PROJECT_DELETE)

  const loadProjects = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getProjects(orgId)
      setProjects(res.items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [orgId])

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
      await api.createProject(orgId, name.trim(), purpose.trim(), classification)
      setName('')
      setPurpose('')
      setClassification('internal')
      setShowModal(false)
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
          <h2>Projects</h2>
          <p className="view-subtitle">
            Manage organization ML initiatives, formulations, and governance bounds.
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
          {filtered.map((proj) => (
            <article className="project-card" key={proj.id}>
              <div className="project-card-header">
                <div className="title-area">
                  <h3 className="project-title">{proj.name}</h3>
                  <div className="badges-row">
                    <span className={`classification-badge ${proj.classification}`}>
                      {proj.classification}
                    </span>
                    <span className={`status-badge ${proj.status}`}>
                      {proj.status}
                    </span>
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
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      {showModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="modal-title">Create New Project</h3>
              <button
                className="btn-close"
                aria-label="Close dialog"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="auth-error-banner" role="alert">
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="modal-form">
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

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
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
                  {creating ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
