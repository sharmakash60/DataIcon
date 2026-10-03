import React, { useState } from 'react'
import { useAuth } from './AuthContext'
import { PermissionGate } from './PermissionGate'
import { Permissions } from './types'

export const BillingView: React.FC = () => {
  const { activeOrg } = useAuth()
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleManage = () => {
    setFeedback('Stripe billing portal session initialized for Organization Owner.')
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Billing & Resource Quotas</h2>
          <p className="view-subtitle" style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Subscription tier, compute allocation, and invoice history for: <strong>{activeOrg?.organization_name}</strong>.
          </p>
        </div>

        {/* Action: Manage Billing (BILLING_MANAGE - Owner only) */}
        <PermissionGate permission={Permissions.BILLING_MANAGE}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleManage}
            style={{ fontSize: '0.85rem' }}
          >
            💳 Manage Subscription & Payment
          </button>
        </PermissionGate>
      </div>

      {feedback && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', fontWeight: 500 }}>
          {feedback}
        </div>
      )}

      {/* Plan Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div className="card" style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>CURRENT PLAN</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>
            Enterprise Dedicated
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '8px', marginBottom: 0, lineHeight: 1.5 }}>
            Unlimited seats, on-premise Client Data Agent air-gapped runtimes, SOC 2 compliance.
          </p>
        </div>

        <div className="card" style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>MONTHLY USAGE</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#059669', marginTop: '6px' }}>
            $1,480.00 <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>/ month</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '8px', marginBottom: 0, lineHeight: 1.5 }}>
            Next billing renewal: <strong>October 15, 2026</strong> via Corporate Invoicing.
          </p>
        </div>

        <div className="card" style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b' }}>COMPUTE CONCURRENCY</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#d97706', marginTop: '6px' }}>
            16 vCPUs / 64 GB
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '8px', marginBottom: 0, lineHeight: 1.5 }}>
            Dedicated local training worker processes allocation.
          </p>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="card" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>Recent Invoices</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', background: '#f8fafc' }}>
              <th style={{ padding: '12px 14px', fontWeight: 600 }}>INVOICE ID</th>
              <th style={{ padding: '12px 14px', fontWeight: 600 }}>BILLING PERIOD</th>
              <th style={{ padding: '12px 14px', fontWeight: 600 }}>AMOUNT</th>
              <th style={{ padding: '12px 14px', fontWeight: 600 }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '14px', color: '#2563eb', fontWeight: 600 }}>INV-2026-09-01</td>
              <td style={{ padding: '14px', color: '#475569' }}>Sep 01, 2026 - Sep 30, 2026</td>
              <td style={{ padding: '14px', color: '#0f172a', fontWeight: 600 }}>$1,480.00</td>
              <td style={{ padding: '14px' }}>
                <span style={{ padding: '3px 10px', borderRadius: '4px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600, fontSize: '0.8rem' }}>
                  Paid
                </span>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '14px', color: '#2563eb', fontWeight: 600 }}>INV-2026-08-01</td>
              <td style={{ padding: '14px', color: '#475569' }}>Aug 01, 2026 - Aug 31, 2026</td>
              <td style={{ padding: '14px', color: '#0f172a', fontWeight: 600 }}>$1,480.00</td>
              <td style={{ padding: '14px' }}>
                <span style={{ padding: '3px 10px', borderRadius: '4px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600, fontSize: '0.8rem' }}>
                  Paid
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default BillingView
