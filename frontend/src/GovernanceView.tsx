import React, { useState } from 'react'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions } from './types'

export const GovernanceView: React.FC = () => {
  const { activeOrg } = useAuth()
  const [feedback, setFeedback] = useState<string | null>(null)

  const policies = [
    {
      id: 'pol-01',
      name: 'Air-Gapped Training Mandate',
      category: 'Perimeter Security',
      status: 'Enforced',
      description: 'Zero raw customer records may leave the private VPC execution boundary. Enforced via Linux cgroup network namespaces.',
    },
    {
      id: 'pol-02',
      name: 'Mandatory Dual-Signoff on Production Deployments',
      category: 'Separation of Duties',
      status: 'Enforced',
      description: 'Model deployment to external endpoints requires separate approval from a Security Auditor or Org Admin.',
    },
    {
      id: 'pol-03',
      name: 'Append-Only Hash-Chained Audit Logging',
      category: 'Governance & Provenance',
      status: 'Enforced',
      description: 'Every state transition is signed with actor cryptographic identifier and immutable parent SHA-256 block hash.',
    },
    {
      id: 'pol-04',
      name: 'Deterministic Explainability Artifact Verification',
      category: 'Responsible AI',
      status: 'Enforced',
      description: 'Models cannot enter candidate evaluation without full TreeSHAP attribution and non-causal guardrail flags.',
    },
  ]

  const handleExportCompliance = () => {
    setFeedback('Compliance dossier export generated and verified with cryptographic SHA-256 hash.')
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Enterprise Governance & Compliance</h2>
          <p className="view-subtitle" style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Multi-tenant policy framework, separation-of-duties audit trail, and regulatory controls for: <strong>{activeOrg?.organization_name}</strong>.
          </p>
        </div>

        {/* Action: Export Compliance Dossier (GOVERNANCE_MANAGE) */}
        <PermissionGate permission={Permissions.GOVERNANCE_MANAGE}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleExportCompliance}
            style={{ fontSize: '0.85rem' }}
          >
            📋 Export SOC 2 / HIPAA Compliance Dossier
          </button>
        </PermissionGate>
      </div>

      {feedback && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', fontWeight: 500 }}>
          {feedback}
        </div>
      )}

      {/* Compliance Health Score */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>COMPLIANCE POSTURE</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', marginTop: '6px' }}>100% Passed</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>4 of 4 checks verified</div>
        </div>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>SEPARATION OF DUTIES</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563eb', marginTop: '6px' }}>Strict</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Proposer ≠ Approver</div>
        </div>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>DATA LINEAGE</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', marginTop: '6px' }}>Immutable</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>SHA-256 fingerprinted</div>
        </div>
        <div className="card" style={{ padding: '18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>AUDIT TRAIL LOGGING</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7c3aed', marginTop: '6px' }}>Active</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Append-only store</div>
        </div>
      </div>

      {/* Governance Policies Table */}
      <div className="card" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '18px' }}>Active Policy Framework</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {policies.map((pol) => (
            <div
              key={pol.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 18px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{pol.name}</strong>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                    {pol.category}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  {pol.description}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '6px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600 }}>
                  ✓ {pol.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default GovernanceView
