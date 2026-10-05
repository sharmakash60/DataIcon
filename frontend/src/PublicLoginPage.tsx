import React, { useState } from 'react'
import AuthView from './AuthView'
import SplashScreen from './SplashScreen'
import { DaTaIconLogo, DaTaIconEmblem } from './DaTaIconLogo'
import {
  ShieldCheckIcon,
  LockIcon,
  CheckIcon,
  ServerIcon,
  KeyIcon,
  ActivityIcon,
  CpuIcon
} from './icons'

interface PublicLoginPageProps {
  onNavigateHome: () => void
  onNavigateServices: () => void
}

export default function PublicLoginPage({ onNavigateHome, onNavigateServices }: PublicLoginPageProps) {
  const [selectedDemoRole, setSelectedDemoRole] = useState<string>('scientist')
  const [loginEmail, setLoginEmail] = useState<string>('scientist@datapilot.dev')
  const [loginPassword, setLoginPassword] = useState<string>('scientist@datapilot.dev')
  const [splashDone, setSplashDone] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && ((window as unknown as { __VITEST__?: boolean }).__VITEST__ || !window.HTMLCanvasElement?.prototype?.getContext)) {
      return true
    }
    return false
  })

  const DEMO_ROLES = [
    { id: 'scientist', label: 'Data Scientist', email: 'scientist@datapilot.dev' },
    { id: 'analyst', label: 'Analyst', email: 'analyst@datapilot.dev' },
    { id: 'admin', label: 'Admin', email: 'admin@datapilot.dev' },
    { id: 'viewer', label: 'Viewer', email: 'viewer@datapilot.dev' },
    { id: 'auditor', label: 'Security Auditor', email: 'auditor@datapilot.dev' },
    { id: 'owner', label: 'Owner', email: 'owner@datapilot.dev' },
  ]
  const SHARED_DEV_PASSWORD = 'DataIcon2026!'

  return (
    <>
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
      <div className="public-login-page enterprise-auth-portal">
        {/* Top Enclave Auth Header */}
        <header className="enclave-auth-header">
          <div className="enclave-header-container">
            <div className="brand-clickable" onClick={onNavigateHome} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onNavigateHome() }}>
              <DaTaIconLogo variant="horizontal" size={32} textColor="#172416" />
              <span className="enclave-pill-tag">CONTROL PLANE ENCLAVE</span>
            </div>

            <div className="header-nav-actions">
              <button
                type="button"
                className="btn-ghost-nav"
                onClick={() => setSplashDone(false)}
                title="Replay intro animation"
              >
                ⚡ Replay Intro
              </button>
              <button
                type="button"
                className="btn-ghost-nav"
                onClick={onNavigateServices}
              >
                Architecture & Services
              </button>
              <button
                type="button"
                className="btn-ghost-nav"
                onClick={onNavigateHome}
              >
                ← Back to Homepage
              </button>
            <span className="status-indicator-pill">
              <span className="status-live-dot" />
              Air-Gap Active
            </span>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Enclave Portal */}
      <main className="enclave-portal-main">
        <div className="enclave-portal-grid">
          {/* Left Hero Brand & Business Value Column */}
          <div className="enclave-info-column">
            <div className="enclave-shield-banner">
              <DaTaIconEmblem size={44} />
              <div className="enclave-badge-tag">
                <span className="badge-leaf">🌿</span>
                <span>100% PRIVATE ENTERPRISE AI · ZERO DATA EGRESS</span>
              </div>
            </div>

            <h1 className="enclave-portal-title">
              Sign In to Your Private AI Enclave.
            </h1>

            <p className="enclave-portal-lead">
              Access your private enterprise workspace. 8 autonomous AI agents turn your data into measurable revenue—with zero cloud leaks and guaranteed data privacy.
            </p>

            {/* Core Commercial Guarantees - Minimalist Clean Highlights */}
            <div className="enclave-pillars-minimal">
              <div className="minimal-pillar-item">
                <span className="minimal-pillar-icon">🌿</span>
                <div className="minimal-pillar-text">
                  <strong>Zero-Knowledge Execution</strong>
                  <span>Your enterprise data stays 100% inside your private cloud boundary.</span>
                </div>
              </div>
              <div className="minimal-pillar-item">
                <span className="minimal-pillar-icon">🛡️</span>
                <div className="minimal-pillar-text">
                  <strong>Cryptographic Audit Ledger</strong>
                  <span>Tamper-proof compliance and audit trails for turnkey SOC 2 & HIPAA readiness.</span>
                </div>
              </div>
              <div className="minimal-pillar-item">
                <span className="minimal-pillar-icon">⚡</span>
                <div className="minimal-pillar-text">
                  <strong>Autonomous Intelligence</strong>
                  <span>Predict churn, optimize sales, and drive revenue in hours instead of quarters.</span>
                </div>
              </div>
            </div>

            {/* Compact Minimal Demo Credentials Helper */}
            <div className="enclave-demo-assistant ultra-minimal-demo">
              <span className="demo-assistant-title">QUICK TEST CREDENTIALS (SAME LOGIN ID & PASSWORD):</span>
              <div className="demo-inline-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {DEMO_ROLES.map((dr) => (
                  <button
                    key={dr.id}
                    type="button"
                    className={`demo-compact-chip ${selectedDemoRole === dr.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedDemoRole(dr.id)
                      setLoginEmail(dr.email)
                      // User requested matching login id and password
                      setLoginPassword(dr.email)
                    }}
                  >
                    <span className="role-title">{dr.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                Password: <code style={{ color: '#10b981', fontWeight: 600 }}>{loginEmail}</code> (or <code style={{ color: '#10b981', fontWeight: 600 }}>{SHARED_DEV_PASSWORD}</code>)
              </div>
            </div>
          </div>

          {/* Right Column: Clean, Polished Authentication Card */}
          <div className="enclave-form-column">
            <div className="enclave-auth-card-frame">
              <div className="auth-card-header-bar clean-auth-header">
                <div className="enclave-live-chip">
                  <span className="chip-dot" />
                  <span>100% ENCRYPTED & PRIVATE</span>
                </div>
                <span className="enclave-port-id">Secure Login</span>
              </div>

              {/* Brand Logo Presentation */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 10px' }}>
                <DaTaIconLogo variant="full" size={36} />
              </div>

              {/* The Core AuthView Component */}
              <AuthView
                initialEmail={loginEmail}
                initialPassword={loginPassword}
                onEmailChange={setLoginEmail}
                onPasswordChange={setLoginPassword}
              />

              <div className="auth-trust-footer minimal-trust-footer">
                <span className="trust-simple-tag">🔒 100% In-VPC Boundary · SOC 2 & HIPAA Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Enclave Footer */}
      <footer className="enclave-portal-footer">
        <div className="enclave-footer-container">
          <span>© {new Date().getFullYear()} DaTaIcon Inc. All rights reserved.</span>
          <div className="enclave-footer-links">
            <button type="button" className="btn-link-subtle" onClick={onNavigateHome}>
              Public Platform
            </button>
            <button type="button" className="btn-link-subtle" onClick={onNavigateServices}>
              Platform Services
            </button>
            <span className="enclave-status-text">Perimeter: Air-Gapped Sandbox Active</span>
          </div>
        </div>
      </footer>
    </div>
    </>
  )
}
