import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PublicServicesPage from './PublicServicesPage'

describe('PublicServicesPage Component', () => {
  it('renders enterprise architecture title and 8 autonomous agents tab', () => {
    const onNavigateHome = vi.fn()
    const onNavigateLogin = vi.fn()

    render(
      <PublicServicesPage
        onNavigateHome={onNavigateHome}
        onNavigateLogin={onNavigateLogin}
      />
    )

    expect(screen.getByRole('heading', { name: /engineered for high-stakes confidential machine learning/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /8 autonomous agents/i })).toBeInTheDocument()
    expect(screen.getAllByText(/strategy & formulation agent/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/air-gapped data agent/i).length).toBeGreaterThan(0)
  })

  it('switches between tabs: agents, perimeter, compliance', () => {
    render(
      <PublicServicesPage
        onNavigateHome={vi.fn()}
        onNavigateLogin={vi.fn()}
      />
    )

    // Switch to perimeter
    fireEvent.click(screen.getByRole('button', { name: /air-gapped security perimeter/i }))
    expect(screen.getByText(/air-gapped confidentiality vs. traditional cloud ai/i)).toBeInTheDocument()

    // Switch to compliance
    fireEvent.click(screen.getByRole('button', { name: /enterprise governance & rbac/i }))
    expect(screen.getByText(/role-based access control \(rbac\)/i)).toBeInTheDocument()
  })

  it('selects an agent to inspect details in the dossier column', () => {
    render(
      <PublicServicesPage
        onNavigateHome={vi.fn()}
        onNavigateLogin={vi.fn()}
      />
    )

    const swarmCard = screen.getByText(/automl & swarm pipeline/i)
    fireEvent.click(swarmCard)
    expect(screen.getAllByText(/bayesian hyperparameter exploration/i).length).toBeGreaterThan(0)
  })
})
