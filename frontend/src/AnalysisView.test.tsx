import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnalysisView } from './AnalysisView'

// Mock useAuth
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', display_name: 'Dr. Jane Doe', email: 'jane@acme.org' },
    activeOrg: { organization_id: 'org-1', organization_name: 'Acme Health Analytics' },
    hasPermission: () => true,
  }),
}))

describe('AnalysisView Component', () => {
  it('renders TrafficTrace SaaS analytics dashboard with KPI sparklines and charts by default', () => {
    render(<AnalysisView />)

    expect(screen.getByText(/All models & sites/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Telemetry & Charts/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /The Vector Computer/i })).toBeInTheDocument()

    // Top KPI cards
    expect(screen.getByText('Predictions')).toBeInTheDocument()
    expect(screen.getAllByText('21.3K').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Sessions').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('18.5K')).toBeInTheDocument()
    expect(screen.getByText('Avg. session duration')).toBeInTheDocument()
    expect(screen.getByText('4m 41s')).toBeInTheDocument()

    // Chart titles
    expect(screen.getByText(/Users & Inferences/i)).toBeInTheDocument()
    expect(screen.getByText(/Users by source/i)).toBeInTheDocument()
    expect(screen.getByText(/Sessions by country/i)).toBeInTheDocument()
    expect(screen.getByText(/United States Enclave/i)).toBeInTheDocument()

    // Floating action banner
    expect(screen.getByText(/Start a Model Optimization Brief/i)).toBeInTheDocument()
  })

  it('switches to The Vector Computer hardware cybernetic console when tab is clicked', () => {
    render(<AnalysisView />)

    const hardwareTab = screen.getByRole('tab', { name: /The Vector Computer/i })
    fireEvent.click(hardwareTab)

    expect(screen.getByRole('heading', { name: /THE VECTOR/i })).toBeInTheDocument()
    expect(screen.getByText(/The only compute platform your vector retrieval stack needs/i)).toBeInTheDocument()
    expect(screen.getByText(/KNOWLEDGE BASE/i)).toBeInTheDocument()
    expect(screen.getByText(/ACCEPTED ANSWERS/i)).toBeInTheDocument()
    expect(screen.getByText(/VECTOR DATABASE/i)).toBeInTheDocument()
    expect(screen.getByText(/HARDWARE ACCELERATE/i)).toBeInTheDocument()
  })

  it('triggers hardware vector inference pulse when action button is clicked', () => {
    render(<AnalysisView />)

    const runBtn = screen.getByRole('button', { name: /Run Inference/i })
    fireEvent.click(runBtn)

    expect(screen.getByRole('status')).toHaveTextContent(/Vector Compute Core executed inference batch/i)
  })

  it('dismisses the floating model optimization brief banner', () => {
    render(<AnalysisView />)

    const closeBtn = screen.getByRole('button', { name: /Dismiss banner/i })
    fireEvent.click(closeBtn)

    expect(screen.queryByText(/Start a Model Optimization Brief/i)).not.toBeInTheDocument()
  })

  it('renders motion presets toolbar and toggles spring physics presets', () => {
    render(<AnalysisView />)

    expect(screen.getByText(/Consistent, customisable motion/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'SNAP' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'UI' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'GENTLE' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'LIVELY' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AMBIENT' })).toBeInTheDocument()

    // Default is AMBIENT (K 43, C 13)
    expect(screen.getByText(/AMBIENT K 43 - C 13/i)).toBeInTheDocument()

    // Switch to LIVELY (K 622, C 17)
    fireEvent.click(screen.getByRole('tab', { name: 'LIVELY' }))
    expect(screen.getByText(/LIVELY K 622 - C 17/i)).toBeInTheDocument()

    // Switch to SNAP (K 1218, C 70)
    fireEvent.click(screen.getByRole('tab', { name: 'SNAP' }))
    expect(screen.getByText(/SNAP K 1218 - C 70/i)).toBeInTheDocument()
  })
})
