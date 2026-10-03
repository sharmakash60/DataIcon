import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import AuthView from './AuthView'

describe('AuthView component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders sign in form by default and toggles to register', () => {
    render(
      <AuthProvider>
        <AuthView />
      </AuthProvider>
    )

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()

    // Toggle to registration
    const toggleBtn = screen.getByRole('button', { name: /create an organization/i })
    fireEvent.click(toggleBtn)

    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register organization/i })).toBeInTheDocument()
  })

  it('shows error if password is less than 8 characters during registration', async () => {
    render(
      <AuthProvider>
        <AuthView />
      </AuthProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /create an organization/i }))
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Alice Smith' } })
    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Acme Corp' } })
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'alice@acme.org' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'short' } })

    fireEvent.click(screen.getByRole('button', { name: /register organization/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
  })
})
