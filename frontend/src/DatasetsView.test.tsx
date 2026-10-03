import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DatasetsView } from './DatasetsView'
import { api } from './api'

vi.mock('./api', () => ({
  api: {
    getProjects: vi.fn(),
  },
}))

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    activeOrg: {
      organization_id: 'org-test-123',
      organization_name: 'DataPilot Demo Org',
      role: 'data_scientist',
      permissions: ['DATASET_VIEW', 'DATASET_CONNECT', 'DATASET_PROFILE', 'DATASET_DELETE'],
    },
    hasPermission: () => true,
  }),
}))

describe('DatasetsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getProjects).mockResolvedValue({
      items: [
        {
          id: 'proj-01',
          organization_id: 'org-test-123',
          name: 'Churn Detection Project',
          classification: 'confidential',
          status: 'active',
          owner_user_id: 'user-1',
          purpose: 'Model customer churn probability',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    })
  })

  it('renders Datasets Catalog and provides BOTH Connect Data Source and Upload Dataset File options', async () => {
    render(<DatasetsView />)

    await waitFor(() => {
      expect(screen.getByText('Datasets Catalog')).toBeInTheDocument()
    })

    // Both buttons must be rendered and visible
    expect(screen.getByRole('button', { name: /connect data source/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload dataset file/i })).toBeInTheDocument()
  })

  it('opens and closes the Connect Data Source modal', async () => {
    render(<DatasetsView />)

    await waitFor(() => {
      expect(screen.getByText('Datasets Catalog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /connect data source/i }))
    expect(screen.getByRole('heading', { name: /connect data source/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/connector type/i)).toBeInTheDocument()

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('heading', { name: /connect data source/i })).not.toBeInTheDocument()
  })

  it('opens the Direct File Upload modal and allows 1-click test sample dataset upload', async () => {
    render(<DatasetsView />)

    await waitFor(() => {
      expect(screen.getByText('Datasets Catalog')).toBeInTheDocument()
    })

    // Open upload modal
    fireEvent.click(screen.getByRole('button', { name: /upload dataset file/i }))
    expect(screen.getByRole('heading', { name: /direct dataset file upload/i })).toBeInTheDocument()

    // Click quick test sample
    const sampleBtn = screen.getByRole('button', { name: /telecom churn/i })
    expect(sampleBtn).toBeInTheDocument()
    fireEvent.click(sampleBtn)

    // Form should populate with parsed details
    expect(screen.getByDisplayValue(/telecom customer churn sample/i)).toBeInTheDocument()
    expect(screen.getByText(/rows parsed/i)).toBeInTheDocument()

    // Submit upload
    fireEvent.click(screen.getByRole('button', { name: /upload & register dataset/i }))

    // Verification: modal closes and feedback appears
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /direct dataset file upload/i })).not.toBeInTheDocument()
      expect(screen.getByText(/uploaded, verified, and fingerprinted/i)).toBeInTheDocument()
    })
  })
})
