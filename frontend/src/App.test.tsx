import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const healthy = { status: 'ready', checks: { postgresql: 'ok', redis: 'ok', migrations: 'ok' } }
const response = (data: unknown, status = 200) => Promise.resolve({ status, json: async () => data })

describe('environment status', () => {
  it('shows successful dependency checks returned by the backend', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response(healthy)))
    render(<App />)
    expect(await screen.findByText('All services ready')).toBeInTheDocument()
    expect(screen.getAllByText('Ready')).toHaveLength(3)
  })
  it('shows an unhealthy dependency on a 503 without claiming everything is ready', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response({ ...healthy, status: 'not_ready', checks: { ...healthy.checks, redis: 'error' } }, 503)))
    render(<App />)
    expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByText('All services ready')).not.toBeInTheDocument()
  })
  it('recovers from a connection failure when retried', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => response(healthy)))
    render(<App />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /check again/i }))
    expect(await screen.findByText('All services ready')).toBeInTheDocument()
  })
  it('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response({ status: 'ready' })))
    render(<App />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('All services ready')).not.toBeInTheDocument()
  })
})
