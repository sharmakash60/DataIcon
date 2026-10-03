import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import RequirementsView from './RequirementsView'
import type { BusinessRequirement, ProblemFormulation, Project } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      getRequirements: vi.fn(),
      getFormulations: vi.fn(),
      extractRequirements: vi.fn(),
      updateRequirement: vi.fn(),
      confirmRequirement: vi.fn(),
      rejectRequirement: vi.fn(),
    },
  }
})

const mockProject: Project = {
  id: 'proj-123',
  organization_id: 'org-456',
  name: 'Customer Churn AI',
  purpose: 'Retain high-value customers',
  classification: 'internal',
  status: 'active',
  owner_user_id: 'user-001',
  created_at: '2026-09-26T12:00:00Z',
  updated_at: '2026-09-26T12:00:00Z',
}

const mockRequirement: BusinessRequirement = {
  id: 'req-001',
  project_id: 'proj-123',
  organization_id: 'org-456',
  created_by_user_id: 'user-001',
  natural_language_input: 'We want to identify customers who are likely to churn within the next 30 days.',
  business_objective: 'Reduce customer churn and increase retention.',
  prediction_objective: 'Predict customer churn within 30 days.',
  target_name: 'churn',
  prediction_horizon: '30 days',
  ml_problem_type: 'binary_classification',
  primary_metric: 'recall',
  secondary_metrics: ['roc_auc', 'f1', 'precision'],
  business_constraints: ['High precision required to avoid wasting retention discounts'],
  cost_of_false_positives: 'Cost of unnecessary $25 retention discount voucher',
  cost_of_false_negatives: 'Permanent loss of customer lifetime value ($500+ ARR)',
  expected_prediction_frequency: 'Daily batch',
  business_priority: 'Minimize false negatives (High Recall)',
  suggested_positive_class: 'churned',
  confidence_score: 0.95,
  assumptions: [
    'Assumed prediction horizon is 30 days based on monthly billing cycle',
    'Assumed daily transaction and event logs are accessible',
  ],
  missing_requirements: ['cost_tradeoffs'],
  status: 'draft',
  review_notes: null,
  reviewed_by_user_id: null,
  reviewed_at: null,
  created_at: '2026-09-26T12:05:00Z',
  updated_at: '2026-09-26T12:05:00Z',
}

const mockFormulation: ProblemFormulation = {
  id: 'form-001',
  version: 1,
  organization_id: 'org-456',
  project_id: 'proj-123',
  requirement_id: 'req-001',
  business_objective: 'Reduce customer churn and increase retention.',
  ml_objective: 'Predict customer churn within 30 days.',
  target: 'churn',
  prediction_horizon: '30 days',
  candidate_problem_type: 'binary_classification',
  primary_metric: 'recall',
  secondary_metrics: ['roc_auc', 'f1'],
  business_constraints: ['Max latency < 200ms'],
  cost_of_false_positives: 'Cost of unnecessary $25 discount voucher',
  cost_of_false_negatives: 'Loss of $500 ARR',
  expected_prediction_frequency: 'Daily batch',
  business_priority: 'Minimize false negatives',
  assumptions: ['Daily data refreshed'],
  status: 'active',
  confirmed_by_user_id: 'user-001',
  confirmed_at: '2026-09-26T12:10:00Z',
  created_at: '2026-09-26T12:10:00Z',
  updated_at: '2026-09-26T12:10:00Z',
}

describe('RequirementsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('datapilot_access_token', 'mock-token')
    localStorage.setItem('datapilot_active_org', 'org-456')

    vi.mocked(api.getMe).mockResolvedValue({
      user: {
        id: 'user-001',
        email: 'ds@example.com',
        display_name: 'Data Scientist',
        status: 'active',
        created_at: '2026-09-26T12:00:00Z',
      },
      organizations: [
        {
          organization_id: 'org-456',
          organization_name: 'Acme Corp',
          role: 'data_scientist',
          status: 'active',
        },
      ],
    })
    vi.mocked(api.getFormulations).mockResolvedValue([])
  })

  it('renders formulation interface and sample prompts', async () => {
    vi.mocked(api.getRequirements).mockResolvedValueOnce([])

    render(
      <AuthProvider>
        <RequirementsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Customer Churn AI/i)).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText(/Predict which customers are likely to churn/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Extract ML Requirements/i })).toBeInTheDocument()
  })

  it('extracts requirements on submission and displays editable formulation and summary', async () => {
    vi.mocked(api.getRequirements).mockResolvedValueOnce([])
    vi.mocked(api.extractRequirements).mockResolvedValueOnce(mockRequirement)

    render(
      <AuthProvider>
        <RequirementsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Predict which customers are likely to churn/i)).not.toBeDisabled()
    })

    const textarea = screen.getByPlaceholderText(/Predict which customers are likely to churn/i)
    fireEvent.change(textarea, {
      target: { value: 'We want to identify customers who are likely to churn within the next 30 days.' },
    })

    const submitBtn = screen.getByRole('button', { name: /Extract ML Requirements/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(api.extractRequirements).toHaveBeenCalledWith(
        'org-456',
        'proj-123',
        'We want to identify customers who are likely to churn within the next 30 days.'
      )
    })

    // Verify formulation form is populated and editable
    await waitFor(() => {
      expect(screen.getByLabelText(/Business Objective/i)).toHaveValue(
        'Reduce customer churn and increase retention.'
      )
      expect(screen.getByLabelText(/Target Column \/ Concept/i)).toHaveValue('churn')
      expect(screen.getByLabelText(/Prediction Horizon/i)).toHaveValue('30 days')
      expect(screen.getByLabelText(/Primary Optimization Metric/i)).toHaveValue('recall')
      expect(screen.getByLabelText(/Cost of False Positives/i)).toHaveValue(
        'Cost of unnecessary $25 retention discount voucher'
      )
      expect(screen.getByLabelText(/Cost of False Negatives/i)).toHaveValue(
        'Permanent loss of customer lifetime value ($500+ ARR)'
      )
    })

    // Verify summary card contains required elements
    expect(screen.getByText(/Extracted Formulation Summary/i)).toBeInTheDocument()
    expect(screen.getAllByText(/binary classification/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows explicit assumptions and missing requirements alert', async () => {
    vi.mocked(api.getRequirements).mockResolvedValueOnce([mockRequirement])

    render(
      <AuthProvider>
        <RequirementsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Explicit AI & Domain Assumptions/i)).toBeInTheDocument()
      expect(screen.getByText(/Assumed prediction horizon is 30 days/i)).toBeInTheDocument()
    })

    // Missing requirements alert
    expect(screen.getByText(/Missing Business Requirements Detected/i)).toBeInTheDocument()
    expect(screen.getByText(/\+ Missing: cost tradeoffs/i)).toBeInTheDocument()
  })

  it('allows user to edit extracted requirements and approve, creating versioned Problem Formulation', async () => {
    vi.mocked(api.getRequirements).mockResolvedValueOnce([mockRequirement])
    vi.mocked(api.updateRequirement).mockResolvedValueOnce({
      ...mockRequirement,
      target_name: 'is_churned_30d',
    })
    vi.mocked(api.confirmRequirement).mockResolvedValueOnce({
      requirement: {
        ...mockRequirement,
        target_name: 'is_churned_30d',
        status: 'approved',
      },
      formulation: {
        ...mockFormulation,
        version: 1,
        target: 'is_churned_30d',
      },
    })

    render(
      <AuthProvider>
        <RequirementsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/Target Column \/ Concept/i)).toHaveValue('churn')
    })

    // Edit target
    const targetInput = screen.getByLabelText(/Target Column \/ Concept/i)
    fireEvent.change(targetInput, { target: { value: 'is_churned_30d' } })

    // Approve requirement
    const approveBtn = screen.getByRole('button', { name: /Approve Problem Formulation/i })
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(api.updateRequirement).toHaveBeenCalledWith(
        'org-456',
        'proj-123',
        'req-001',
        expect.objectContaining({
          target_name: 'is_churned_30d',
          status: 'approved',
        })
      )
      expect(api.confirmRequirement).toHaveBeenCalledWith(
        'org-456',
        'proj-123',
        'req-001',
        expect.any(String)
      )
    })

    // Verify success banner contains Version 1 confirmation
    await waitFor(() => {
      expect(screen.getByText(/confirmed and versioned as Version 1/i)).toBeInTheDocument()
    })
  })

  it('allows user to reject a formulation with a documented reason', async () => {
    vi.mocked(api.getRequirements).mockResolvedValueOnce([mockRequirement])
    vi.mocked(api.rejectRequirement).mockResolvedValueOnce({
      ...mockRequirement,
      status: 'rejected',
      review_notes: 'Rejected: Infeasible timeline',
    })

    render(
      <AuthProvider>
        <RequirementsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reject Formulation/i })).toBeInTheDocument()
    })

    // Open reject modal
    fireEvent.click(screen.getByRole('button', { name: /Reject Formulation/i }))

    expect(screen.getByText(/Document the business reason for rejecting/i)).toBeInTheDocument()

    const reasonInput = screen.getByPlaceholderText(/Unrealistic business timeline/i)
    fireEvent.change(reasonInput, { target: { value: 'Infeasible timeline for training' } })

    const confirmRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i })
    fireEvent.click(confirmRejectBtn)

    await waitFor(() => {
      expect(api.rejectRequirement).toHaveBeenCalledWith(
        'org-456',
        'proj-123',
        'req-001',
        'Infeasible timeline for training'
      )
    })
  })
})
