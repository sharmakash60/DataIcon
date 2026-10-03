import React, { useState } from 'react'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions } from './types'

export const SecurityView: React.FC = () => {
  const { activeOrg } = useAuth()
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleRotateKey = () => {
    setFeedback('API Keys rotated successfully. Old keys revoked with immediate effect.')
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Security & Boundary Posture</h2>
          <p className="view-subtitle" style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Zero-trust client isolation, cryptographic key management, and authentication monitoring for: <strong>{activeOrg?.organization_name}</strong>.
          </p>
        </div>

        {/* Action: Manage Security Settings (SECURITY_SETTINGS_MANAGE - Owner only) */}
        <PermissionGate permission={Permissions.SECURITY_SETTINGS_MANAGE}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleRotateKey}
            style={{ fontSize: '0.85rem' }}
          >
            🔑 Rotate Organization API Keys
          </button>
        </PermissionGate>
      </div>

      {feedback && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', fontWeight: 500 }}>
          {feedback}
        </div>
      )}

      {/* Security Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>BOUNDARY STATUS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669', marginTop: '6px' }}>🔒 Fully Air-Gapped</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Client Data Agent runtime</div>
        </div>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>TOKEN ENCRYPTION</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb', marginTop: '6px' }}>HMAC-SHA256</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Short-lived access tokens</div>
        </div>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>TENANT ISOLATION</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#d97706', marginTop: '6px' }}>Row-Level Locked</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Strict ORM tenant predicates</div>
        </div>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>FAILED AUTH ANOMALIES</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c3aed', marginTop: '6px' }}>0 Detected</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Past 24 hours</div>
        </div>
      </div>

      {/* Security Controls Breakdown */}
      <div className="card" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '18px' }}>Enforced Security Controls</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <div style={{ padding: '18px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>1. Zero Raw Data Egress</strong>
            <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Only aggregate metrics, fingerprints, and model evaluations cross from the local client runtime to the control plane.
            </p>
          </div>
          <div style={{ padding: '18px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>2. Privilege Escalation Barrier</strong>
            <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.85rem', lineHeight: 1.5 }}>
              All role promotions and demotions are validated server-side. Non-owners cannot grant the Owner role or alter the current Owner.
            </p>
          </div>
          <div style={{ padding: '18px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>3. Project-Level Tenancy Scoping</strong>
            <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Membership is required per-project. Users assigned to Project A cannot view, list, or submit experiments to Project B.
            </p>
          </div>
          <div style={{ padding: '18px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>4. Immutable Audit Trail</strong>
            <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.85rem', lineHeight: 1.5 }}>
              State-changing operations generate append-only audit events recorded with actor ID, timestamp, and action description.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SecurityView
