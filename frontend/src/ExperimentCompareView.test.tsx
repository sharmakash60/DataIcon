import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import ExperimentCompareView from './ExperimentCompareView'
import type { Experiment, ExperimentComparisonResponse } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      compareExperiments: vi.fn(),
      updateExperimentDecision: vi.fn(),
    },
  }
})

const mockExp1: Experiment = {
  id: 'exp-001',
  organization_id: 'org-123',
  project_id: 'proj-456',
  name: 'XGBoost Churn Tuned',
  dataset_version: 'v1.4-prod',
  dataset_fingerprint: 'sha256:abc12345',
  problem_formulation: { objective: 'Churn reduction' },
  preprocessing_config: { imputation: 'median', encoding: 'target' },
  feature_config: { features: ['tenure', 'monthly_charges', 'contract'] },
  model: 'XGBoost Classifier',
  hyperparameters: { n_estimators: 150, max_depth: 6, learning_rate: 0.05 },
  validation_strategy: '5-fold StratifiedKFold',
  metrics: { roc_auc: 0.9124, f1: 0.8412, accuracy: 0.8845, precision: 0.825, recall: 0.858 },
  training_duration: 18.4,
  environment_info: { execution_plane: 'Client Data Plane', python: '3.12' },
  random_seed: 42,
  model_artifact_reference: null,
  status: 'completed',
  problem_type: 'classification',
  target_name: 'churn',
  primary_metric: 'roc_auc',
  best_model_name: 'XGBoost Classifier',
  best_score: 0.9124,
  baseline_score: 0.7200,
  n_samples: 1000,
  n_features: 15,
  total_execution_time_seconds: 18.4,
  metadata: {},
  decision: 'candidate',
  mean_cv_score: 0.9124,
  std_cv_score: 0.0084,
  cv_scores: [0.908, 0.915, 0.911, 0.920, 0.908],
  inference_latency_ms: 1.25,
  memory_usage_mb: 28.6,
  model_complexity: {
    tier: 'High (Boosted Trees)',
    parameter_count: 19200,
    architecture: 'Sequential Boosted Decision Trees',
    summary: '150 boosting rounds (max depth 6)',
    interpretable_native: false,
    tree_count: 150,
    max_depth: 6,
  },
  explainability: {
    available: true,
    status: 'Available (SHAP + Permutation)',
    methods: ['Global SHAP', 'Permutation Feature Importance'],
  },
  visualizations: {
    confusion_matrix: {
      matrix: [[710, 40], [35, 215]],
      labels: ['Negative (0)', 'Positive (1)'],
      tn: 710,
      fp: 40,
      fn: 35,
      tp: 215,
      tn_pct: 71.0,
      fp_pct: 4.0,
      fn_pct: 3.5,
      tp_pct: 21.5,
      fpr: 0.0533,
      fnr: 0.14,
      precision: 0.8431,
      recall: 0.86,
    },
    roc_curve: {
      auc: 0.9124,
      points: [
        { fpr: 0.0, tpr: 0.0, threshold: 1.0 },
        { fpr: 0.05, tpr: 0.65, threshold: 0.85 },
        { fpr: 0.15, tpr: 0.88, threshold: 0.60 },
        { fpr: 1.0, tpr: 1.0, threshold: 0.0 },
      ],
    },
    pr_curve: {
      auc: 0.8512,
      baseline_prevalence: 0.25,
      points: [
        { recall: 0.0, precision: 1.0, threshold: 1.0 },
        { recall: 0.7, precision: 0.86, threshold: 0.65 },
        { recall: 1.0, precision: 0.25, threshold: 0.0 },
      ],
    },
  },
  composite_utility_score: {
    score: 88.6,
    max_score: 100.0,
    formula: 'Score = (0.50 × MetricScore) + (0.20 × CVStability) + (0.15 × LatencyEfficiency) + (0.15 × ModelSimplicity)',
    explanation: 'Transparent multi-criteria index mathematically composed of: 50% primary metric effectiveness, 20% cross-validation stability, 15% latency adherence, and 15% model parsimony.',
    weights: {
      metric_score: 0.50,
      cv_stability: 0.20,
      latency_efficiency: 0.15,
      model_simplicity: 0.15,
    },
    components: {
      metric_score: { raw_value: 0.9124, normalized: 91.2, contribution: 45.6, metric_name: 'roc_auc' },
      cv_stability: { raw_std: 0.0084, normalized: 94.5, contribution: 18.9, stability_tier: 'High' },
      latency_efficiency: { raw_ms: 1.25, normalized: 95.0, contribution: 14.25, sla_threshold_ms: 50.0 },
      model_simplicity: { raw_param_count: 19200, normalized: 65.0, contribution: 9.75, complexity_tier: 'High (Boosted Trees)' },
    },
  },
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:30:00Z',
}

const mockExp2: Experiment = {
  id: 'exp-002',
  organization_id: 'org-123',
  project_id: 'proj-456',
  name: 'Logistic Regression Baseline',
  dataset_version: 'v1.4-prod',
  dataset_fingerprint: 'sha256:abc12345',
  problem_formulation: { objective: 'Churn reduction' },
  preprocessing_config: { imputation: 'median', encoding: 'onehot' },
  feature_config: { features: ['tenure', 'monthly_charges', 'contract'] },
  model: 'Logistic Regression',
  hyperparameters: { C: 1.0, penalty: 'l2' },
  validation_strategy: '5-fold StratifiedKFold',
  metrics: { roc_auc: 0.7812, f1: 0.6950, accuracy: 0.7620, precision: 0.710, recall: 0.680 },
  training_duration: 3.2,
  environment_info: { execution_plane: 'Client Data Plane', python: '3.12' },
  random_seed: 42,
  model_artifact_reference: null,
  status: 'completed',
  problem_type: 'classification',
  target_name: 'churn',
  primary_metric: 'roc_auc',
  best_model_name: 'Logistic Regression',
  best_score: 0.7812,
  baseline_score: 0.7200,
  n_samples: 1000,
  n_features: 15,
  total_execution_time_seconds: 3.2,
  metadata: {},
  decision: 'rejected',
  mean_cv_score: 0.7812,
  std_cv_score: 0.0150,
  cv_scores: [0.775, 0.784, 0.779, 0.791, 0.777],
  inference_latency_ms: 0.12,
  memory_usage_mb: 8.4,
  model_complexity: {
    tier: 'Low (Linear)',
    parameter_count: 14,
    architecture: 'Generalized Linear Model',
    summary: '13 linear coefficients + 1 intercept',
    interpretable_native: true,
    tree_count: 0,
    max_depth: 1,
  },
  explainability: {
    available: true,
    status: 'Available (Coefficients)',
    methods: ['Model Coefficients'],
  },
  visualizations: {
    confusion_matrix: {
      matrix: [[680, 70], [80, 170]],
      labels: ['Negative (0)', 'Positive (1)'],
      tn: 680,
      fp: 70,
      fn: 80,
      tp: 170,
      tn_pct: 68.0,
      fp_pct: 7.0,
      fn_pct: 8.0,
      tp_pct: 17.0,
      fpr: 0.0933,
      fnr: 0.32,
      precision: 0.7083,
      recall: 0.68,
    },
    roc_curve: {
      auc: 0.7812,
      points: [
        { fpr: 0.0, tpr: 0.0, threshold: 1.0 },
        { fpr: 0.15, tpr: 0.50, threshold: 0.70 },
        { fpr: 0.35, tpr: 0.75, threshold: 0.45 },
        { fpr: 1.0, tpr: 1.0, threshold: 0.0 },
      ],
    },
    pr_curve: {
      auc: 0.6950,
      baseline_prevalence: 0.25,
      points: [
        { recall: 0.0, precision: 1.0, threshold: 1.0 },
        { recall: 0.6, precision: 0.65, threshold: 0.50 },
        { recall: 1.0, precision: 0.25, threshold: 0.0 },
      ],
    },
  },
  composite_utility_score: {
    score: 72.4,
    max_score: 100.0,
    formula: 'Score = (0.50 × MetricScore) + (0.20 × CVStability) + (0.15 × LatencyEfficiency) + (0.15 × ModelSimplicity)',
    explanation: 'Transparent multi-criteria index mathematically composed of: 50% primary metric effectiveness, 20% cross-validation stability, 15% latency adherence, and 15% model parsimony.',
    weights: {
      metric_score: 0.50,
      cv_stability: 0.20,
      latency_efficiency: 0.15,
      model_simplicity: 0.15,
    },
    components: {
      metric_score: { raw_value: 0.7812, normalized: 78.1, contribution: 39.05, metric_name: 'roc_auc' },
      cv_stability: { raw_std: 0.0150, normalized: 88.0, contribution: 17.6, stability_tier: 'High' },
      latency_efficiency: { raw_ms: 0.12, normalized: 99.0, contribution: 14.85, sla_threshold_ms: 50.0 },
      model_simplicity: { raw_param_count: 14, normalized: 95.0, contribution: 14.25, complexity_tier: 'Low (Linear)' },
    },
  },
  created_at: '2026-09-28T09:00:00Z',
  updated_at: '2026-09-28T09:15:00Z',
}

const mockComparisonResponse: ExperimentComparisonResponse = {
  experiments: [mockExp1, mockExp2],
  metric_comparisons: [
    {
      metric_name: 'roc_auc',
      values: { 'exp-001': 0.9124, 'exp-002': 0.7812 },
      best_experiment_id: 'exp-001',
      best_value: 0.9124,
      direction: 'higher_is_better',
    },
    {
      metric_name: 'f1',
      values: { 'exp-001': 0.8412, 'exp-002': 0.6950 },
      best_experiment_id: 'exp-001',
      best_value: 0.8412,
      direction: 'higher_is_better',
    },
    {
      metric_name: 'accuracy',
      values: { 'exp-001': 0.8845, 'exp-002': 0.7620 },
      best_experiment_id: 'exp-001',
      best_value: 0.8845,
      direction: 'higher_is_better',
    },
  ],
  hyperparameter_differences: {
    n_estimators: { 'exp-001': 150, 'exp-002': null },
    max_depth: { 'exp-001': 6, 'exp-002': null },
    C: { 'exp-001': null, 'exp-002': 1.0 },
  },
  dataset_consistency: {
    dataset_version_match: true,
    fingerprint_match: true,
    feature_count_match: true,
    feature_alignment: 'Strict match (3 common features)',
  },
  recommendation_summary: {
    recommended_experiment_id: 'exp-001',
    recommended_model_name: 'XGBoost Classifier',
    primary_metric: 'roc_auc',
    score: 0.9124,
    baseline_score: 0.7200,
    lift_percentage: 26.72,
    composite_score: 88.6,
    latency_ms: 1.25,
    within_sla: true,
    decision: 'candidate',
    empirical_rationale: "Model 'XGBoost Classifier' is recommended based on verifiable empirical results. It achieves ROC_AUC of 0.9124 (+26.7% vs baseline 0.7200), composite utility score of 88.6/100, and inference latency of 1.25ms (within 50ms SLA target).",
  },
  model_summaries: [],
}

describe('ExperimentCompareView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('datapilot_access_token', 'mock-token')
    localStorage.setItem('datapilot_active_org', 'org-123')
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
          organization_id: 'org-123',
          organization_name: 'DataPilot Corp',
          role: 'owner',
          permissions: ['EXPERIMENT_RUN', 'EXPERIMENT_VIEW', 'MODEL_APPROVE', 'MODEL_CREATE'],
          status: 'active',
        },
      ],
    })
    vi.mocked(api.compareExperiments).mockResolvedValue(mockComparisonResponse)
  })

  it('renders side-by-side matrix with all required comparison dimensions', async () => {
    render(
      <AuthProvider>
        <ExperimentCompareView
          orgId="org-123"
          projectId="proj-456"
          experiments={[mockExp1, mockExp2]}
          onClose={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Model & Experiment Comparison Engine')).toBeInTheDocument()
    })

    // 1. Model names and dataset versions
    expect(screen.getAllByText('XGBoost Churn Tuned')).toHaveLength(2) // in selector button and matrix header
    expect(screen.getAllByText('Logistic Regression Baseline')).toHaveLength(2)
    expect(screen.getAllByText('v1.4-prod')).toHaveLength(2)

    // 2. Metrics & CV stability
    expect(screen.getAllByText('0.9124').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.7812').length).toBeGreaterThan(0)
    expect(screen.getByText('± 0.0084')).toBeInTheDocument()
    expect(screen.getByText('± 0.0150')).toBeInTheDocument()

    // 3. Telemetry (latency, memory)
    expect(screen.getByText('1.25 ms')).toBeInTheDocument()
    expect(screen.getByText('0.12 ms')).toBeInTheDocument()
    expect(screen.getByText('28.6 MB')).toBeInTheDocument()
    expect(screen.getByText('8.4 MB')).toBeInTheDocument()

    // 4. Complexity & Explainability
    expect(screen.getByText('High (Boosted Trees)')).toBeInTheDocument()
    expect(screen.getByText('Low (Linear)')).toBeInTheDocument()
    expect(screen.getByText('✓ Available (SHAP + Permutation)')).toBeInTheDocument()

    // 5. Composite Utility Scores & Formula explanation
    expect(screen.getAllByText('88.6').length).toBeGreaterThan(0)
    expect(screen.getAllByText('72.4').length).toBeGreaterThan(0)

    // 6. Empirical Recommendation Banner
    expect(screen.getByText('Empirical Recommendation Based on Objective & SLA')).toBeInTheDocument()
    expect(screen.getByText('XGBoost Classifier')).toBeInTheDocument()
  })

  it('allows switching between analytical sub-tabs', async () => {
    render(
      <AuthProvider>
        <ExperimentCompareView
          orgId="org-123"
          projectId="proj-456"
          experiments={[mockExp1, mockExp2]}
          onClose={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Model & Experiment Comparison Engine')).toBeInTheDocument()
    })

    // Sub-tab 2: Metric Comparison Bar Chart
    fireEvent.click(screen.getByRole('button', { name: /Metric Comparison/i }))
    expect(screen.getByText(/Multi-Metric Side-by-Side Comparison/i)).toBeInTheDocument()

    // Sub-tab 3: CV Stability
    fireEvent.click(screen.getByRole('button', { name: /CV Stability & Variance/i }))
    expect(screen.getByText(/Cross-Validation Fold Stability/i)).toBeInTheDocument()

    // Sub-tab 4: ROC & PR Curves
    fireEvent.click(screen.getByRole('button', { name: /ROC & PR Curves/i }))
    expect(screen.getByText(/Receiver Operating Characteristic/i)).toBeInTheDocument()
    expect(screen.getByText(/Precision-Recall Curve/i)).toBeInTheDocument()

    // Sub-tab 5: Confusion Matrix Diagnostics
    fireEvent.click(screen.getByRole('button', { name: /Confusion Matrix/i }))
    expect(screen.getByText(/Side-by-Side Confusion Matrix/i)).toBeInTheDocument()

    // Sub-tab 6: Configuration Diff
    fireEvent.click(screen.getByRole('button', { name: /Configuration Diff/i }))
    expect(screen.getByText(/Hyperparameter Diffs & Configuration Differences/i)).toBeInTheDocument()
  })

  it('opens formula breakdown modal explaining the mathematical calculation without black-box scores', async () => {
    render(
      <AuthProvider>
        <ExperimentCompareView
          orgId="org-123"
          projectId="proj-456"
          experiments={[mockExp1, mockExp2]}
          onClose={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Model & Experiment Comparison Engine')).toBeInTheDocument()
    })

    // Click on Formula ℹ button
    const formulaBtns = screen.getAllByRole('button', { name: /Formula ℹ/i })
    fireEvent.click(formulaBtns[0])

    // Verify transparent formula calculation breakdown is rendered
    expect(screen.getByText(/Composite Utility Score Breakdown/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Primary Metric Effectiveness/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/CV Stability \(Generalization\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Inference Latency SLA Adherence/i)).toBeInTheDocument()
    expect(screen.getByText(/Model Parsimony & Complexity/i)).toBeInTheDocument()

    // Close formula modal
    fireEvent.click(screen.getByRole('button', { name: /Close Breakdown/i }))
    expect(screen.queryByText(/Composite Utility Score Breakdown/i)).not.toBeInTheDocument()
  })

  it('allows opening configuration inspection modal', async () => {
    render(
      <AuthProvider>
        <ExperimentCompareView
          orgId="org-123"
          projectId="proj-456"
          experiments={[mockExp1, mockExp2]}
          onClose={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Model & Experiment Comparison Engine')).toBeInTheDocument()
    })

    // Click on Inspect Full Config 🔍
    const inspectConfigBtns = screen.getAllByRole('button', { name: /Inspect Full Config 🔍/i })
    fireEvent.click(inspectConfigBtns[0])

    expect(screen.getByText(/Complete Experiment Configuration/i)).toBeInTheDocument()
    expect(screen.getByText(/Preprocessing Pipeline Specification/i)).toBeInTheDocument()

    // Switch to Hyperparameters tab
    fireEvent.click(screen.getByRole('button', { name: /^hyperparameters$/i }))
    expect(screen.getByText(/Estimator Hyperparameters/i)).toBeInTheDocument()

    // Close configuration modal
    fireEvent.click(screen.getByRole('button', { name: /Close Inspector/i }))
    expect(screen.queryByText(/Complete Experiment Configuration/i)).not.toBeInTheDocument()
  })

  it('updates model decision via DecisionUpdateModal', async () => {
    vi.mocked(api.updateExperimentDecision).mockResolvedValue({
      ...mockExp1,
      decision: 'approved',
      decision_notes: 'Empirically superior across all metrics; approved for production.',
    })

    render(
      <AuthProvider>
        <ExperimentCompareView
          orgId="org-123"
          projectId="proj-456"
          experiments={[mockExp1, mockExp2]}
          onClose={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Model & Experiment Comparison Engine')).toBeInTheDocument()
    })

    // Click on Edit ✏️ button for decision
    const editDecisionBtns = screen.getAllByRole('button', { name: /Edit ✏️/i })
    fireEvent.click(editDecisionBtns[0])

    // Decision modal appears
    expect(screen.getByText(/Update Evaluation Decision/i)).toBeInTheDocument()

    // Select 'approved' button
    const approvedBtn = screen.getByRole('button', { name: /approved/i })
    fireEvent.click(approvedBtn)

    // Fill review notes
    const notesInput = screen.getByPlaceholderText(/Document why this model was approved/i)
    fireEvent.change(notesInput, { target: { value: 'Empirically superior across all metrics; approved for production.' } })

    // Save decision
    fireEvent.click(screen.getByRole('button', { name: /Save Decision/i }))

    await waitFor(() => {
      expect(api.updateExperimentDecision).toHaveBeenCalledWith(
        'org-123',
        'proj-456',
        'exp-001',
        'approved',
        'Empirically superior across all metrics; approved for production.',
      )
    })
  })
})
