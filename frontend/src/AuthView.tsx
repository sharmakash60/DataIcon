import React, { useState } from 'react'
import { useAuth } from './AuthContext'

export default function AuthView() {
  const { login, register } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      if (isRegister) {
        if (!displayName.trim()) throw new Error('Please enter your name.')
        if (!orgName.trim()) throw new Error('Please enter an organization name.')
        if (password.length < 8) throw new Error('Password must be at least 8 characters.')
        await register(email, password, displayName, orgName)
      } else {
        await login(email, password)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2>{isRegister ? 'Create an account' : 'Welcome back'}</h2>
        <p className="auth-subtitle">
          {isRegister
            ? 'Set up your organization and control-plane credentials.'
            : 'Sign in to access your projects and datasets.'}
        </p>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert">
          <span className="error-icon" aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {isRegister && (
          <>
            <div className="form-group">
              <label htmlFor="reg-name">Full name</label>
              <input
                id="reg-name"
                type="text"
                required
                placeholder="Dr. Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reg-org">Organization name</label>
              <input
                id="reg-org"
                type="text"
                required
                placeholder="Acme Health Analytics"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={submitting}
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label htmlFor="auth-email">Work email</label>
          <input
            id="auth-email"
            type="email"
            required
            placeholder="scientist@acme.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            required
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
          {isRegister && (
            <p className="field-hint">
              Minimum 8 characters with at least one number or symbol.
            </p>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary auth-submit-btn"
          id="auth-submit-btn"
          disabled={submitting}
        >
          {submitting
            ? 'Authenticating…'
            : isRegister
            ? 'Register organization & start'
            : 'Sign in'}
        </button>
      </form>

      <div className="auth-switch">
        <span>
          {isRegister ? 'Already registered?' : 'Need to set up a new workspace?'}
        </span>
        <button
          type="button"
          className="btn-link"
          id="toggle-auth-mode-btn"
          onClick={() => {
            setIsRegister(!isRegister)
            setError(null)
          }}
          disabled={submitting}
        >
          {isRegister ? 'Sign in instead' : 'Create an organization'}
        </button>
      </div>
    </div>
  )
}
