import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import DeploymentView from './DeploymentView'
import type { DeploymentDetail, DeploymentSummary } from './deploymentTypes'
import type { Project } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      getExperimentDeployments: vi.fn(),
      getDeployment: vi.fn(),
      createDeployment: vi.fn(),
      approveDeployment: vi.fn(),
      rollbackDeployment: vi.fn(),
      stopDeployment: vi.fn(),
      predictDirectly: vi.fn(),
    },
  }
})

const mockProject: Project = {
  id: 'proj-123',
  organization_id: 'org-456',
  name: 'Fraud Detection Engine',
  purpose: 'Flag fraudulent transactions',
  classification: 'restricted',
  status: 'active',
  owner_user_id: 'user-001',
  created_at: '2026-09-26T12:00:00Z',
  updated_at: '2026-09-26T12:00:00Z',
}

const mockDeploymentSummary: DeploymentSummary = {
  id: 'dep-001',
  organization_id: 'org-456',
  project_id: 'proj-123',
  experiment_id: 'exp-001',
  name: 'Local Churn Serving Service',
  model_name: 'Random Forest',
  model_version: 'v1.0.0',
  deployment_type: 'local',
  endpoint_url: 'http://localhost:8080',
  prediction_path: '/predict',
  status: 'active',
  problem_type: 'classification',
  target_name: 'churn',
  primary_metric: 'roc_auc',
  created_at: '2026-09-26T12:00:00Z',
  approved_at: '2026-09-26T12:05:00Z',
}

const mockDeploymentDetail: DeploymentDetail = {
  ...mockDeploymentSummary,
  input_schema: [
    { name: 'age', dtype: 'numeric', example: 35 },
    { name: 'account_balance', dtype: 'numeric', example: 12500.5 },
    { name: 'country', dtype: 'categorical', example: 'US' },
  ],
  notes: 'Local serving runtime inside customer network.',
  auth_configured: false,
  approved_by_user_id: 'user-001',
  created_by_user_id: 'user-001',
  updated_at: '2026-09-26T12:05:00Z',
}

describe('DeploymentView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('datapilot_access_token', 'mock-token')
    localStorage.setItem('datapilot_active_org', 'org-456')

    vi.mocked(api.getMe).mockResolvedValue({
      user: {
        id: 'user-001',
        email: 'engineer@datapilot.local',
        display_name: 'Deployment Engineer',
        status: 'active',
        created_at: '2026-09-26T12:00:00Z',
      },
      organizations: [
        {
          organization_id: 'org-456',
          organization_name: 'DataPilot Corp',
          role: 'admin',
          status: 'active',
          permissions: [
            'DEPLOYMENT_VIEW',
            'DEPLOYMENT_CREATE',
            'DEPLOYMENT_UPDATE',
            'MODEL_APPROVE',
          ],
        },
      ],
    })

    vi.mocked(api.getExperimentDeployments).mockResolvedValue({
      items: [mockDeploymentSummary],
      total: 1,
    })
    vi.mocked(api.getDeployment).mockResolvedValue(mockDeploymentDetail)
  })

  it('renders deployment overview, status badge, and privacy guarantees', async () => {
    render(
      <AuthProvider>
        <DeploymentView
          project={mockProject}
          experimentId="exp-001"
          modelName="Random Forest"
          targetName="churn"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Model Deployment & REST Prediction API')).toBeInTheDocument()
      expect(screen.getAllByText(/Local Churn Serving Service/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText('🟢 ACTIVE').length).toBeGreaterThan(0)
      expect(screen.getByText(/Zero Prediction Data Sent to Cloud/i)).toBeInTheDocument()
    })
  })

  it('executes direct local prediction via interactive console (POST /predict)', async () => {
    vi.mocked(api.predictDirectly).mockResolvedValue({
      prediction_id: 'pred-test-999',
      model_name: 'Random Forest',
      model_version: 'v1.0.0',
      predictions: [1],
      probabilities: [{ '0': 0.15, '1': 0.85 }],
      latency_ms: 1.45,
    })

    render(
      <AuthProvider>
        <DeploymentView
          project={mockProject}
          experimentId="exp-001"
          modelName="Random Forest"
          targetName="churn"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('🎮 Test Console (POST /predict)')).toBeInTheDocument()
    })

    // Find and submit the prediction button
    const predictBtn = screen.getByText('🚀 Execute POST /predict')
    fireEvent.click(predictBtn)

    await waitFor(() => {
      expect(api.predictDirectly).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Inference Output')).toBeInTheDocument()
      expect(screen.getByText('⚡ Latency: 1.45 ms')).toBeInTheDocument()
      expect(screen.getByText('Class 1')).toBeInTheDocument()
      expect(screen.getByText('85.0%')).toBeInTheDocument()
    })
  })

  it('renders code integration snippets with curl, python, and node', async () => {
    render(
      <AuthProvider>
        <DeploymentView
          project={mockProject}
          experimentId="exp-001"
          modelName="Random Forest"
          targetName="churn"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('📋 Integration Snippets')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('📋 Integration Snippets'))

    expect(screen.getByText('Python (httpx)')).toBeInTheDocument()
    expect(screen.getByText('Node.js / TypeScript')).toBeInTheDocument()
    expect(screen.getByText(/curl -X POST http:\/\/localhost:8080\/predict/i)).toBeInTheDocument()
  })

  it('renders Docker container packaging instructions', async () => {
    render(
      <AuthProvider>
        <DeploymentView
          project={mockProject}
          experimentId="exp-001"
          modelName="Random Forest"
          targetName="churn"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('🐳 Docker Packaging')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('🐳 Docker Packaging'))

    expect(screen.getByText(/Containerized Air-Gapped Deployment Guide/i)).toBeInTheDocument()
    expect(screen.getByText(/datapilot-agent package-docker/i)).toBeInTheDocument()
    expect(screen.getByText(/docker run -d -p 8080:8080/i)).toBeInTheDocument()
  })

  it('allows lifecycle transitions (rollback / stop)', async () => {
    vi.mocked(api.rollbackDeployment).mockResolvedValue({
      ...mockDeploymentDetail,
      status: 'rolled_back',
    })

    render(
      <AuthProvider>
        <DeploymentView
          project={mockProject}
          experimentId="exp-001"
          modelName="Random Forest"
          targetName="churn"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('⚙️ Lifecycle & Approval')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('⚙️ Lifecycle & Approval'))

    const rollbackBtn = screen.getByText('↩️ Rollback')
    fireEvent.click(rollbackBtn)

    await waitFor(() => {
      expect(api.rollbackDeployment).toHaveBeenCalledTimes(1)
    })
  })
})
