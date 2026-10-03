import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { Permissions, type Member, type Project, type Role } from './types'

export default function TeamView() {
  const { activeOrg, user, hasPermission } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Add member modal
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('data_scientist')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Change Role Modal
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [newRole, setNewRole] = useState<Role>('data_scientist')
  const [roleUpdating, setRoleUpdating] = useState(false)

  // Project Assignment Modal
  const [assignMember, setAssignMember] = useState<Member | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [assigningProject, setAssigningProject] = useState(false)

  const orgId = activeOrg?.organization_id
  const canInvite = hasPermission(Permissions.MEMBERS_INVITE)
  const canUpdateMember = hasPermission(Permissions.MEMBERS_UPDATE)
  const canRemoveMember = hasPermission(Permissions.MEMBERS_REMOVE)
  const canManageProjects = hasPermission(Permissions.PROJECT_UPDATE)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMembers(orgId)
      setMembers(data)
      if (hasPermission(Permissions.PROJECT_VIEW)) {
        const projs = await api.getProjects(orgId)
        setProjects(projs.items || [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load team data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId) return
    setSubmitting(true)
    setFormError(null)

    try {
      await api.addMember(orgId, email.trim().toLowerCase(), role)
      setEmail('')
      setRole('data_scientist')
      setShowModal(false)
      setActionSuccess('Member successfully invited/added to organization.')
      await loadData()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !selectedMember) return
    setRoleUpdating(true)
    setFormError(null)

    try {
      await api.updateMemberRole(orgId, selectedMember.id, newRole)
      setSelectedMember(null)
      setActionSuccess(`Role updated to ${newRole.replace('_', ' ')} for ${selectedMember.display_name}.`)
      await loadData()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update member role')
    } finally {
      setRoleUpdating(false)
    }
  }

  const handleRemoveMember = async (m: Member) => {
    if (!orgId) return
    if (!confirm(`Are you sure you want to remove ${m.display_name} (${m.email}) from this organization?`)) return
    try {
      await api.removeMember(orgId, m.id)
      setActionSuccess(`Removed ${m.display_name} from organization.`)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleAssignProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !assignMember || !selectedProjectId) return
    setAssigningProject(true)
    setFormError(null)

    try {
      await api.assignProjectMember(orgId, selectedProjectId, assignMember.user_id, 'contributor')
      setActionSuccess(`Assigned ${assignMember.display_name} to project.`)
      setSelectedProjectId('')
      setAssignMember(null)
      await loadData()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to assign project')
    } finally {
      setAssigningProject(false)
    }
  }

  const handleRemoveProjectAccess = async (projectId: string, member: Member) => {
    if (!orgId) return
    if (!confirm(`Remove project access for ${member.display_name}?`)) return
    try {
      await api.removeProjectMember(orgId, projectId, member.user_id)
      setActionSuccess(`Removed project access for ${member.display_name}.`)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove project access')
    }
  }

  return (
    <div className="team-container">
      <div className="view-header">
        <div>
          <h2>Organization Members & RBAC Control</h2>
          <p className="view-subtitle">
            Manage authenticated identities, assign project-level access, and govern permissions for {activeOrg?.organization_name}.
          </p>
        </div>
        {canInvite && (
          <button className="btn-primary" id="add-member-btn" onClick={() => { setFormError(null); setShowModal(true) }}>
            + Invite Member
          </button>
        )}
      </div>

      {actionSuccess && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '8px', color: '#065f46', marginBottom: '16px' }}>
          ✅ {actionSuccess}
        </div>
      )}

      {error && (
        <div className="auth-error-banner" role="alert">
          <span>{error}</span>
          <button className="btn-link" onClick={loadData}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading members…</div>
      ) : (
        <div className="table-card">
          <table className="data-table" aria-label="Organization Members">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Project Access</th>
                <th>Status</th>
                <th>Last Activity</th>
                {(canUpdateMember || canRemoveMember || canManageProjects) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === user?.id
                const isOwner = m.role === 'owner'
                const isOrgAdminOrOwner = m.role === 'owner' || m.role === 'admin'

                return (
                  <tr key={m.id}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar">{m.display_name.charAt(0).toUpperCase()}</span>
                        <strong>{m.display_name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="user-email">{m.email}</span>
                    </td>
                    <td>
                      <span className={`role-badge ${m.role}`}>{m.role.replace('_', ' ')}</span>
                    </td>
                    <td>
                      {isOrgAdminOrOwner ? (
                        <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>
                          🌐 All Projects (Org Wide)
                        </span>
                      ) : m.project_names && m.project_names.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {m.project_names.map((name, idx) => (
                            <span
                              key={idx}
                              style={{
                                background: '#e0edac',
                                color: '#174e3f',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                          No assigned projects
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="status-indicator">
                        <span className="dot ok" />
                        {m.status}
                      </span>
                    </td>
                    <td className="timestamp">
                      {m.last_activity_at ? new Date(m.last_activity_at).toLocaleString() : new Date(m.created_at).toLocaleDateString()}
                    </td>
                    {(canUpdateMember || canRemoveMember || canManageProjects) && (
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {canUpdateMember && (
                            <button
                              className="btn-secondary btn-sm"
                              disabled={isSelf || (isOwner && activeOrg?.role !== 'owner')}
                              title={isSelf ? 'Cannot modify your own role' : 'Change Role'}
                              onClick={() => {
                                setSelectedMember(m)
                                setNewRole(m.role)
                                setFormError(null)
                              }}
                            >
                              Role
                            </button>
                          )}

                          {canManageProjects && !isOrgAdminOrOwner && (
                            <button
                              className="btn-secondary btn-sm"
                              title="Assign to Project"
                              onClick={() => {
                                setAssignMember(m)
                                setSelectedProjectId(projects[0]?.id || '')
                                setFormError(null)
                              }}
                            >
                              + Project
                            </button>
                          )}

                          {canRemoveMember && (
                            <button
                              className="btn-icon danger"
                              disabled={isSelf || isOwner}
                              title={isSelf ? 'Cannot remove yourself' : isOwner ? 'Owner cannot be removed' : 'Remove Member'}
                              aria-label={`Remove ${m.display_name}`}
                              onClick={() => handleRemoveMember(m)}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Role Permissions Reference */}
      <div className="rbac-matrix-card">
        <h3>Predefined Roles & Separation of Duties</h3>
        <div className="matrix-grid">
          <div className="matrix-item">
            <strong>Owner</strong>
            <p>Full organization control, member/role management, project governance, billing, security, and model approval.</p>
          </div>
          <div className="matrix-item">
            <strong>Admin</strong>
            <p>Organization administration, inviting/removing users, project lifecycle management, deployment oversight.</p>
          </div>
          <div className="matrix-item">
            <strong>Data Scientist</strong>
            <p>ML experiment runs, model training, SHAP explainability, dataset profiling for assigned projects.</p>
          </div>
          <div className="matrix-item">
            <strong>Analyst</strong>
            <p>Read-only dataset access, evaluation results, analytics reporting, and model performance comparisons.</p>
          </div>
          <div className="matrix-item">
            <strong>Viewer</strong>
            <p>Strictly read-only access to approved projects, benchmarks, senior reports, and live monitoring.</p>
          </div>
          <div className="matrix-item">
            <strong>Security Auditor</strong>
            <p>Compliance surveillance, data classification audits, zero-data-leakage verification, and audit trail stream.</p>
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-member-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="add-member-title">Invite / Add Organization Member</h3>
              <button className="btn-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {formError && (
              <div className="auth-error-banner" role="alert">
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddMember} className="modal-form">
              <div className="form-group">
                <label htmlFor="member-email">Registered User Email *</label>
                <input
                  id="member-email"
                  type="email"
                  required
                  placeholder="colleague@acme.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
                <p className="field-hint">User must already have an account on DaTaIcon.</p>
              </div>

              <div className="form-group">
                <label htmlFor="member-role">Assigned Role</label>
                <select
                  id="member-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  disabled={submitting}
                >
                  <option value="data_scientist">Data Scientist</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="security_auditor">Security Auditor</option>
                  {activeOrg?.role === 'owner' && <option value="owner">Owner</option>}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  id="submit-add-member"
                  disabled={submitting}
                >
                  {submitting ? 'Adding…' : 'Invite Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {selectedMember && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="change-role-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="change-role-title">Change Member Role: {selectedMember.display_name}</h3>
              <button className="btn-close" onClick={() => setSelectedMember(null)}>✕</button>
            </div>

            {formError && (
              <div className="auth-error-banner" role="alert">
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateRole} className="modal-form">
              <div className="form-group">
                <label htmlFor="update-role-select">Select New Role</label>
                <select
                  id="update-role-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  disabled={roleUpdating}
                >
                  <option value="data_scientist">Data Scientist</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="security_auditor">Security Auditor</option>
                  {activeOrg?.role === 'owner' && <option value="owner">Owner</option>}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedMember(null)}
                  disabled={roleUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={roleUpdating}
                >
                  {roleUpdating ? 'Updating…' : 'Save Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Project Modal */}
      {assignMember && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="assign-project-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="assign-project-title">Assign Project: {assignMember.display_name}</h3>
              <button className="btn-close" onClick={() => setAssignMember(null)}>✕</button>
            </div>

            {formError && (
              <div className="auth-error-banner" role="alert">
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAssignProject} className="modal-form">
              <div className="form-group">
                <label htmlFor="assign-project-select">Select Initiative / Project</label>
                {projects.length === 0 ? (
                  <p style={{ color: '#677367' }}>No projects available in this organization.</p>
                ) : (
                  <select
                    id="assign-project-select"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={assigningProject}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.classification})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAssignMember(null)}
                  disabled={assigningProject}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={assigningProject || projects.length === 0}
                >
                  {assigningProject ? 'Assigning…' : 'Assign Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
