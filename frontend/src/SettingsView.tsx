import React, { useState } from 'react'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions } from './types'

export const SettingsView: React.FC = () => {
  const { activeOrg } = useAuth()
  const [orgName, setOrgName] = useState(activeOrg?.organization_name || '')
  const [domainAllowlist, setDomainAllowlist] = useState('acme.org, acme-corp.com')
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState('8')
  const [dataRetentionDays, setDataRetentionDays] = useState('90')
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback('Organization governance configuration saved successfully.')
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="view-header">
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Organization Settings</h2>
        <p className="view-subtitle" style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
          Configure tenant-wide access parameters and governance defaults for: <strong>{activeOrg?.organization_name}</strong>.
        </p>
      </div>

      {feedback && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', fontWeight: 500 }}>
          {feedback}
        </div>
      )}

      <div className="card" style={{ maxWidth: '640px', padding: '28px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="form-group">
            <label style={{ display: 'block', color: '#334155', fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
              Organization Name
            </label>
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'block', color: '#334155', fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
              Allowed Email Domains (Comma-separated)
            </label>
            <input
              type="text"
              value={domainAllowlist}
              onChange={(e) => setDomainAllowlist(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
            />
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
              New member invitations must match approved domain suffixes.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label style={{ display: 'block', color: '#334155', fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
                Session Timeout (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="72"
                value={sessionTimeoutHours}
                onChange={(e) => setSessionTimeoutHours(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
              />
            </div>

            <div className="form-group">
              <label style={{ display: 'block', color: '#334155', fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
                Audit Log Retention (Days)
              </label>
              <input
                type="number"
                min="30"
                max="365"
                value={dataRetentionDays}
                onChange={(e) => setDataRetentionDays(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
              />
            </div>
          </div>

          <PermissionGate permission={Permissions.ORGANIZATION_UPDATE}>
            <div style={{ marginTop: '8px' }}>
              <button type="submit" className="btn-primary" style={{ fontSize: '0.875rem' }}>
                Save Organization Configuration
              </button>
            </div>
          </PermissionGate>
        </form>
      </div>
    </div>
  )
}

export default SettingsView
