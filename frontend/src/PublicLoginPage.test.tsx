import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import PublicLoginPage from './PublicLoginPage'

describe('PublicLoginPage Component', () => {
  it('renders senior UI/UX enclave header and security pillars', () => {
    const onNavigateHome = vi.fn()
    const onNavigateServices = vi.fn()

    render(
      <AuthProvider>
        <PublicLoginPage
          onNavigateHome={onNavigateHome}
          onNavigateServices={onNavigateServices}
        />
      </AuthProvider>
    )

    expect(screen.getByText(/control plane enclave/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sign in to your private ai enclave/i })).toBeInTheDocument()
    expect(screen.getByText(/zero-knowledge execution/i)).toBeInTheDocument()
    expect(screen.getByText(/cryptographic audit ledger/i)).toBeInTheDocument()
    expect(screen.getByText(/quick test credentials/i)).toBeInTheDocument()
  })

  it('navigates back to home and services when buttons are clicked', () => {
    const onNavigateHome = vi.fn()
    const onNavigateServices = vi.fn()

    render(
      <AuthProvider>
        <PublicLoginPage
          onNavigateHome={onNavigateHome}
          onNavigateServices={onNavigateServices}
        />
      </AuthProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /architecture & services/i }))
    expect(onNavigateServices).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /← back to homepage/i }))
    expect(onNavigateHome).toHaveBeenCalledTimes(1)
  })

  it('renders quick demo role buttons that can be selected', () => {
    render(
      <AuthProvider>
        <PublicLoginPage
          onNavigateHome={vi.fn()}
          onNavigateServices={vi.fn()}
        />
      </AuthProvider>
    )

    const scientistBtn = screen.getByRole('button', { name: /data scientist/i })
    expect(scientistBtn).toBeInTheDocument()
    fireEvent.click(scientistBtn)
    expect(scientistBtn).toHaveClass('active')
  })
})
