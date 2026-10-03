import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import ExperimentsView from './ExperimentsView'
import type { Experiment, ExperimentDetail, Project } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      getExperiments: vi.fn(),
      getExperiment: vi.fn(),
      getLeaderboard: vi.fn(),
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

const mockExperiment: Experiment = {
  id: 'exp-001',
  organization_id: 'org-456',
  project_id: 'proj-123',
  name: 'Fraud Detection Benchmark V1',
  // EMS metadata fields
  dataset_version: 'v1.0',
  dataset_fingerprint: 'abc123',
  problem_formulation: {},
  preprocessing_config: {},
  feature_config: {},
  model: 'Random Forest',
  hyperparameters: { n_estimators: 100 },
  validation_strategy: '5-fold StratifiedKFold',
  metrics: { roc_auc: 0.9421 },
  training_duration: 14.5,
  environment_info: { python: '3.11' },
  random_seed: 42,
  model_artifact_reference: null,
  // Summary fields
  problem_type: 'binary_classification',
  target_name: 'is_fraud',
  primary_metric: 'roc_auc',
  status: 'completed',
  best_model_name: 'Random Forest',
  best_score: 0.9421,
  baseline_score: 0.5000,
  n_samples: 1000,
  n_features: 10,
  total_execution_time_seconds: 14.5,
  metadata: {},
  created_at: '2026-09-26T13:00:00Z',
  updated_at: '2026-09-26T13:00:00Z',
}

const mockExperimentDetail: ExperimentDetail = {
  ...mockExperiment,
  runs: [
    {
      id: 'run-001',
      experiment_id: 'exp-001',
      model_name: 'Random Forest',
      algorithm_key: 'random_forest_classifier',
      is_baseline: false,
      rank: 1,
      mean_cv_score: 0.9421,
      std_cv_score: 0.012,
      training_time_seconds: 2.3,
      inference_latency_ms: 1.4,
      hyperparameters: { n_estimators: 100 },
      metrics: { roc_auc: 0.9421, f1: 0.88, accuracy: 0.93 },
      cv_scores: [0.93, 0.95, 0.94, 0.945, 0.945],
      status: 'completed',
      created_at: '2026-09-26T13:00:00Z',
    },
    {
      id: 'run-002',
      experiment_id: 'exp-001',
      model_name: 'XGBoost',
      algorithm_key: 'xgboost_classifier',
      is_baseline: false,
      rank: 2,
      mean_cv_score: 0.9315,
      std_cv_score: 0.015,
      training_time_seconds: 1.8,
      inference_latency_ms: 0.9,
      hyperparameters: { max_depth: 6 },
      metrics: { roc_auc: 0.9315, f1: 0.86, accuracy: 0.91 },
      cv_scores: [0.92, 0.94, 0.93, 0.935, 0.932],
      status: 'completed',
      created_at: '2026-09-26T13:00:00Z',
    },
    {
      id: 'run-003',
      experiment_id: 'exp-001',
      model_name: 'Baseline (Dummy)',
      algorithm_key: 'baseline',
      is_baseline: true,
      rank: 3,
      mean_cv_score: 0.5000,
      std_cv_score: 0.0,
      training_time_seconds: 0.1,
      inference_latency_ms: 0.2,
      hyperparameters: {},
      metrics: { roc_auc: 0.5000, f1: 0.0, accuracy: 0.70 },
      cv_scores: [0.5, 0.5, 0.5, 0.5, 0.5],
      status: 'completed',
      created_at: '2026-09-26T13:00:00Z',
    },
  ],
  trials: [
    {
      id: 'trial-001',
      experiment_id: 'exp-001',
      trial_number: 1,
      model_name: 'Random Forest',
      parameters: { n_estimators: 150, max_depth: 8 },
      score: 0.9421,
      state: 'COMPLETE',
      duration_seconds: 1.2,
      created_at: '2026-09-26T13:00:00Z',
    },
  ],
  workflow_stages: [
    { stage_number: 1, stage_name: 'Business Requirement', summary: 'Target is_fraud, maximize ROC-AUC' },
    { stage_number: 2, stage_name: 'Problem Formulation', summary: 'Binary classification formulation' },
    { stage_number: 3, stage_name: 'Dataset Profile', summary: '1000 rows, 10 features, 0 nulls' },
    { stage_number: 4, stage_name: 'Baseline', summary: 'Baseline Dummy score 0.5000' },
    { stage_number: 5, stage_name: 'Candidate Models', summary: '6 candidate algorithms initialized' },
    { stage_number: 6, stage_name: 'Preprocessing', summary: 'Identifiers pruned, median imputation' },
    { stage_number: 7, stage_name: 'Cross Validation', summary: '5-fold StratifiedKFold' },
    { stage_number: 8, stage_name: 'Hyperparameter Optimization', summary: 'Optuna tuning completed' },
    { stage_number: 9, stage_name: 'Evaluation', summary: 'Leaderboard ranked on ROC-AUC' },
    { stage_number: 10, stage_name: 'Error Analysis', summary: 'Confusion matrix inspected' },
    { stage_number: 11, stage_name: 'Business Constraints', summary: 'Latency SLA verified' },
    { stage_number: 12, stage_name: 'Model Recommendation', summary: 'Random Forest selected' },
  ],
  recommendation: {
    recommended_model_name: 'Random Forest',
    algorithm_key: 'random_forest',
    primary_metric: 'roc_auc',
    measured_score: 0.9421,
    baseline_score: 0.5000,
    score_lift_percentage: 88.4,
    inference_latency_ms: 1.4,
    within_latency_sla: true,
    empirical_rationale: "Model 'Random Forest' is recommended based on verified empirical validation results. Selection confirmed by multi-criteria evaluation without relying on Accuracy alone.",
  },
}

describe('ExperimentsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('datapilot_access_token', 'mock-token')
    localStorage.setItem('datapilot_active_org', 'org-456')

    vi.mocked(api.getMe).mockResolvedValue({
      user: {
        id: 'user-001',
        email: 'scientist@datapilot.local',
        display_name: 'Data Scientist',
        status: 'active',
        created_at: '2026-09-26T12:00:00Z',
      },
      organizations: [
        {
          organization_id: 'org-456',
          organization_name: 'DataPilot Corp',
          role: 'data_scientist',
          permissions: ['EXPERIMENT_RUN', 'EXPERIMENT_VIEW', 'REPORT_VIEW', 'DEPLOYMENT_CREATE'],
          status: 'active',
        },
      ],
    })
    vi.mocked(api.getExperiments).mockResolvedValue({
      items: [mockExperiment],
      total: 1,
      limit: 50,
      offset: 0,
    })
    vi.mocked(api.getExperiment).mockResolvedValue(mockExperimentDetail)
  })

  it('renders experiment summary and ranked leaderboard table', async () => {
    render(
      <AuthProvider>
        <ExperimentsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('AutoML Experiments & Model Benchmarks')).toBeInTheDocument()
      expect(screen.getAllByText('Fraud Detection Benchmark V1').length).toBeGreaterThan(0)
      expect(screen.getByText('MODELS BENCHMARKED')).toBeInTheDocument()
    })

    // KPI Summary
    expect(screen.getByText('3 models')).toBeInTheDocument()

    // Leaderboard rows
    expect(screen.getAllByText('Random Forest').length).toBeGreaterThan(0)
    expect(screen.getByText('XGBoost')).toBeInTheDocument()
    expect(screen.getByText('Baseline (Dummy)')).toBeInTheDocument()

    // Rank 1 badge
    expect(screen.getByText('🏆 1')).toBeInTheDocument()

    // Privacy badge
    expect(screen.getByText(/Zero Raw Data Leakage/i)).toBeInTheDocument()
  })

  it('renders empirical recommendation card with lift and rationale', async () => {
    render(
      <AuthProvider>
        <ExperimentsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('EMPIRICAL MODEL RECOMMENDATION')).toBeInTheDocument()
      expect(screen.getByText(/\+88.4% vs Baseline/i)).toBeInTheDocument()
      expect(screen.getByText(/SLA Latency OK/i)).toBeInTheDocument()
      expect(screen.getByText(/Selection confirmed by multi-criteria evaluation without relying on Accuracy alone/i)).toBeInTheDocument()
    })
  })

  it('renders 12-Stage Workflow Pipeline tab', async () => {
    render(
      <AuthProvider>
        <ExperimentsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/12-Stage Workflow Pipeline/i)).toBeInTheDocument()
    })

    const stagesTab = screen.getByText(/12-Stage Workflow Pipeline/i)
    fireEvent.click(stagesTab)

    expect(screen.getByText('Sequential 12-Stage Experiment Lifecycle')).toBeInTheDocument()
    expect(screen.getByText('Business Requirement')).toBeInTheDocument()
    expect(screen.getByText('Problem Formulation')).toBeInTheDocument()
    expect(screen.getByText('Dataset Profile')).toBeInTheDocument()
    expect(screen.getByText('Candidate Models')).toBeInTheDocument()
    expect(screen.getByText('Model Recommendation')).toBeInTheDocument()
    expect(screen.getAllByText('✓ VERIFIED').length).toBe(12)
  })

  it('allows toggling between Leaderboard and Optuna Trials tabs', async () => {
    render(
      <AuthProvider>
        <ExperimentsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Optuna Tuning Trials/i)).toBeInTheDocument()
    })

    const trialsTab = screen.getByText(/Optuna Tuning Trials \(1\)/i)
    fireEvent.click(trialsTab)

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
  })

  it('opens launch modal dialog on Run Experiment click', async () => {
    render(
      <AuthProvider>
        <ExperimentsView project={mockProject} onBack={vi.fn()} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('▶️ Run Experiment')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('▶️ Run Experiment'))

    expect(screen.getByText('Launch V1 DataPilot AutoML Experiment')).toBeInTheDocument()
    expect(screen.getByText(/Trains all 6 candidate algorithms across 3-fold cross validation/i)).toBeInTheDocument()
    expect(screen.getByText('▶️ Execute Experiment')).toBeInTheDocument()
  })
})
