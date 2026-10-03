import React, { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import SeniorReportView from './SeniorReportView'
import { Permissions, type Project } from './types'
import type { SeniorReportSummary } from './reportTypes'

interface Props {
  title?: string
  subtitle?: string
}

export const ReportsView: React.FC<Props> = ({
  title = 'Reports',
  subtitle = 'Formal senior data scientist reports, executive summaries, and compliance filings.',
}) => {
  const { activeOrg, hasPermission } = useAuth()
  const orgId = activeOrg?.organization_id

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [reports, setReports] = useState<SeniorReportSummary[]>([])
  const [activeReportId, setActiveReportId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInitial() {
      if (!orgId) return
      setLoading(true)
      try {
        const res = await api.getProjects(orgId)
        setProjects(res.items || [])
        if (res.items && res.items.length > 0) {
          setSelectedProject(res.items[0])
        }
      } catch (err) {
        console.error('Failed to load projects for reports:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitial()
  }, [orgId])

  useEffect(() => {
    async function loadReportsForProj() {
      if (!orgId || !selectedProject) return
      try {
        const exps = await api.getExperiments(orgId, selectedProject.id)
        if (exps.items && exps.items.length > 0) {
          const list = await api.getSeniorReports(orgId, selectedProject.id, exps.items[0].id)
          setReports(list)
        } else {
          setReports([])
        }
      } catch (err) {
        console.error('Failed to load reports:', err)
      }
    }
    loadReportsForProj()
  }, [orgId, selectedProject])

  if (activeReportId && selectedProject) {
    return (
      <SeniorReportView
        project={selectedProject}
        experimentId="mock-exp"
        onBack={() => setActiveReportId(null)}
      />
    )
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>{title}</h2>
          <p className="view-subtitle" style={{ color: '#94a3b8', margin: '4px 0 0 0' }}>
            {subtitle}
          </p>
        </div>

        {/* Action: Generate Report (REPORT_CREATE - Viewer cannot see this) */}
        <PermissionGate permission={Permissions.REPORT_CREATE}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setActiveReportId('new-report')}
            style={{ fontSize: '0.85rem' }}
          >
            📄 Generate New Report
          </button>
        </PermissionGate>
      </div>

      {loading ? (
        <div className="loading-state">Loading reports catalog...</div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          No projects found in this organization.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Project selector bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Filter by Project:</span>
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value)
                if (found) setSelectedProject(found)
              }}
              style={{ padding: '8px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.classification})</option>
              ))}
            </select>
          </div>

          {/* Reports Table */}
          <div className="card" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
              Available Reports ({reports.length})
            </h3>
            {reports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b' }}>
                <p>No reports generated yet for this project.</p>
                <PermissionGate permission={Permissions.REPORT_CREATE}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActiveReportId('new-report')}
                    style={{ marginTop: '10px' }}
                  >
                    Generate Initial Report
                  </button>
                </PermissionGate>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', background: '#f8fafc' }}>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>REPORT TITLE</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>VERSION</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>CREATED</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>EXECUTIVE VERDICT</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px', color: '#0f172a', fontWeight: 600 }}>{r.title}</td>
                      <td style={{ padding: '14px', color: '#2563eb' }}>
                        {r.provenance_verified ? 'Verified Provenance' : 'Standard'}
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '4px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600, fontSize: '0.8rem' }}>
                          Approved for Production
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setActiveReportId(r.id)}
                        >
                          View Report &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsView
