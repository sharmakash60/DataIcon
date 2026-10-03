import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Brain3DAnimation, { DATAPILOT_AGENTS, ENTERPRISE_AGENTS } from './Brain3DAnimation'

describe('Brain3DAnimation component', () => {
  it('renders the 3D stage, canvas, and control buttons', () => {
    render(<Brain3DAnimation />)

    expect(screen.getByLabelText(/3D Interactive Neural Architecture Visualizer/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /DaTaIcon Platform Purpose/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Enterprise AI Team/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pause 3D rotation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset rotation angle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pulse/i })).toBeInTheDocument()
  })

  it('renders all default DataPilot platform agent badges', () => {
    render(<Brain3DAnimation />)

    DATAPILOT_AGENTS.forEach((agent) => {
      expect(screen.getByText(agent.title)).toBeInTheDocument()
      expect(screen.getByText(agent.role)).toBeInTheDocument()
      expect(screen.getByText(agent.number)).toBeInTheDocument()
    })
  })

  it('switches to Enterprise AI Team preset and displays corresponding agents', () => {
    render(<Brain3DAnimation />)

    const enterpriseTab = screen.getByRole('tab', { name: /Enterprise AI Team/i })
    fireEvent.click(enterpriseTab)

    ENTERPRISE_AGENTS.forEach((agent) => {
      expect(screen.getByText(agent.title)).toBeInTheDocument()
      expect(screen.getByText(agent.role)).toBeInTheDocument()
    })
  })

  it('opens and closes agent detail modal when an agent badge is clicked', () => {
    render(<Brain3DAnimation />)

    const strategyBadge = screen.getByRole('button', { name: /01 STRATEGY - AI Data Strategist/i })
    fireEvent.click(strategyBadge)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Key Platform Capabilities:/i)).toBeInTheDocument()
    expect(screen.getByText(/Problem Formulation/i)).toBeInTheDocument()

    const closeBtn = screen.getByRole('button', { name: /Close details/i })
    fireEvent.click(closeBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toggles 3D rotation state when pause/play button is clicked', () => {
    render(<Brain3DAnimation />)

    const pauseBtn = screen.getByRole('button', { name: /Pause 3D rotation/i })
    fireEvent.click(pauseBtn)

    expect(screen.getByRole('button', { name: /Play 3D rotation/i })).toBeInTheDocument()

    const playBtn = screen.getByRole('button', { name: /Play 3D rotation/i })
    fireEvent.click(playBtn)

    expect(screen.getByRole('button', { name: /Pause 3D rotation/i })).toBeInTheDocument()
  })

  it('allows switching between 3D animation modes (Brain, Privacy Shield, Matrix)', () => {
    render(<Brain3DAnimation />)

    const privacyTab = screen.getByRole('tab', { name: /Privacy Shield/i })
    const matrixTab = screen.getByRole('tab', { name: /Synaptic Matrix/i })
    const brainTab = screen.getByRole('tab', { name: /3D Brain/i })

    expect(brainTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(privacyTab)
    expect(privacyTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(matrixTab)
    expect(matrixTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(brainTab)
    expect(brainTab).toHaveAttribute('aria-selected', 'true')
  })
})
