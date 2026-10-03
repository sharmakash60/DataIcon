import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import ExplainabilityView from './ExplainabilityView'
import type { ExplainabilityReport } from './explainabilityTypes'
import type { Project } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      getExplainabilityReports: vi.fn(),
      getExplainabilityReport: vi.fn(),
      generateAINarrative: vi.fn(),
      updateUserAssumptions: vi.fn(),
      runWhatIfAnalysis: vi.fn(),
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

const mockReport: ExplainabilityReport = {
  id: 'rep-001',
  organization_id: 'org-456',
  project_id: 'proj-123',
  experiment_id: 'exp-001',
  experiment_run_id: 'run-001',
  schema_version: 'explainability/v1',
  model_name: 'RandomForestClassifier',
  problem_type: 'binary_classification',
  target_name: 'is_fraud',
  primary_metric: 'roc_auc',
  primary_metric_value: 0.9421,
  n_eval_samples: 500,
  explained_at: '2026-09-26T12:30:00Z',
  global_shap: {
    method: 'shap_global',
    features: [
      {
        feature_name: 'transaction_amount',
        importance_value: 0.45,
        importance_rank: 1,
        std_error: 0.02,
        method: 'shap_global',
        direction: '+',
        distribution: {
          min: 5.0,
          p25: 50.0,
          median: 120.0,
          p75: 350.0,
          max: 5000.0,
          mean: 210.0,
          std: 180.0,
          source: 'model_derived',
        },
        source: 'model_derived',
      },
      {
        feature_name: 'tenure_months',
        importance_value: 0.28,
        importance_rank: 2,
        std_error: 0.01,
        method: 'shap_global',
        direction: '-',
        distribution: {
          min: 1.0,
          p25: 8.0,
          median: 18.0,
          p75: 36.0,
          max: 72.0,
          mean: 24.0,
          std: 15.0,
          source: 'model_derived',
        },
        source: 'model_derived',
      },
    ],
    n_samples_used: 100,
    baseline_value: 0.05,
    source: 'model_derived',
  },
  shap_dependence: [
    {
      feature_name: 'tenure_months',
      interaction_feature: 'transaction_amount',
      points: [
        { feature_value: 8.0, shap_value: 0.22, source: 'model_derived' },
        { feature_value: 24.0, shap_value: -0.15, source: 'model_derived' },
      ],
      source: 'model_derived',
    },
  ],
  partial_dependence: [
    {
      feature_name: 'tenure_months',
      grid_values: [0.0, 12.0, 24.0, 36.0],
      average_predictions: [0.65, 0.45, 0.25, 0.12],
      target_name: 'is_fraud',
      source: 'model_derived',
    },
  ],
  permutation_importance: {
    features: [
      {
        feature_name: 'transaction_amount',
        importance_value: 0.12,
        importance_rank: 1,
        std_error: 0.005,
        method: 'permutation',
        source: 'model_derived',
      },
    ],
    metric_used: 'roc_auc',
    n_repeats: 5,
    n_samples_evaluated: 500,
    source: 'model_derived',
  },
  local_explanations: [
    {
      sample_index: 42,
      prediction: 0.88,
      probability: 0.88,
      predicted_class: 'fraud',
      base_value: 0.05,
      feature_values: { transaction_amount: 1500, tenure_months: 8 },
      feature_contributions: [
        {
          feature_name: 'transaction_amount',
          shap_value: 0.65,
          feature_value: 1500,
          source: 'model_derived',
        },
        {
          feature_name: 'tenure_months',
          shap_value: -0.15,
          feature_value: 8,
          source: 'model_derived',
        },
      ],
      top_factors_increasing: [
        {
          feature_name: 'transaction_amount',
          shap_value: 0.65,
          feature_value: 1500,
          impact_magnitude: 0.65,
          effect: 'increases_prediction',
          source: 'model_derived',
        },
      ],
      top_factors_decreasing: [
        {
          feature_name: 'tenure_months',
          shap_value: -0.15,
          feature_value: 8,
          impact_magnitude: 0.15,
          effect: 'decreases_prediction',
          source: 'model_derived',
        },
      ],
      source: 'model_derived',
    },
  ],
  error_analysis: {
    problem_type: 'binary_classification',
    overall_error_rate: 0.06,
    overall_metric_value: 0.9421,
    confusion_matrix: [
      { predicted_label: '0', actual_label: '0', count: 450, rate: 0.9, source: 'model_derived' },
      { predicted_label: '1', actual_label: '1', count: 40, rate: 0.08, source: 'model_derived' },
      { predicted_label: '1', actual_label: '0', count: 10, rate: 0.02, source: 'model_derived' },
    ],
    residual_stats: null,
    worst_segments: [
      {
        feature_name: 'transaction_amount',
        segment_label: '> 5000',
        n_samples: 30,
        error_rate: 0.25,
        primary_metric_value: 0.75,
        delta_from_overall: 0.19,
        source: 'model_derived',
      },
    ],
    best_segments: [],
    source: 'model_derived',
  },
  ai_narrative: {
    global_importance_narrative: 'Transaction amount is the strongest risk driver.',
    error_analysis_narrative: 'High transaction amounts show higher false alarm rates.',
    business_context_narrative: 'Fits expected commercial fraud patterns.',
    source: 'ai_generated',
    model_used: 'gpt-4o',
    generated_at: '2026-09-26T12:35:00Z',
    warning: 'AI-generated interpretations cannot alter model facts.',
  },
  ai_narrative_warning: 'AI-generated narratives are qualitative interpretations. They cannot override numeric model facts.',
  user_assumptions: [
    {
      key: 'Minimum Threshold',
      value: 'Transactions over $1000 require manual review',
      source: 'user_assumption',
    },
  ],
  provenance_verified: true,
  created_at: '2026-09-26T12:30:00Z',
  updated_at: '2026-09-26T12:35:00Z',
}

describe('ExplainabilityView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('datapilot_access_token', 'fake-jwt')
    localStorage.setItem('datapilot_active_org', 'org-456')

    vi.mocked(api.getMe).mockResolvedValue({
      user: {
        id: 'user-001',
        email: 'analyst@biotech.org',
        display_name: 'Lead Analyst',
        status: 'active',
        created_at: '2026-09-26T10:00:00Z',
      },
      organizations: [
        {
          organization_id: 'org-456',
          organization_name: 'BioTech Labs',
          role: 'data_scientist',
          status: 'active',
        },
      ],
    })

    vi.mocked(api.getExplainabilityReports).mockResolvedValue([mockReport])
    vi.mocked(api.runWhatIfAnalysis).mockResolvedValue({
      baseline_prediction: 0.88,
      scenario_prediction: 0.42,
      delta: -0.46,
      baseline_probability: 0.88,
      scenario_probability: 0.42,
      feature_shifts: [
        {
          feature_name: 'tenure_months',
          original_value: 8,
          new_value: 24,
          estimated_impact: -0.46,
          direction: 'decreases_prediction',
        },
      ],
      top_factors_increasing: [],
      top_factors_decreasing: [],
      disclaimer:
        '⚠️ MODEL SENSITIVITY / SCENARIO ANALYSIS — NOT CAUSAL EVIDENCE: This simulation projects model output variations based on statistical correlations in the trained model distribution. It does NOT establish causal inference or guarantee that an intervention in the real world will produce this outcome.',
      method: 'partial_dependence_interpolation',
      source: 'model_derived',
    })
  })

  it('renders tripartite provenance legend and model report metadata', async () => {
    render(
      <AuthProvider>
        <ExplainabilityView
          project={mockProject}
          experimentId="exp-001"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('RandomForestClassifier')).toBeInTheDocument()
    })

    // Check tripartite provenance badges in legend
    expect(screen.getByText(/Client-Side Provenance Verified/i)).toBeInTheDocument()
    expect(screen.getByText(/Authoritative:/i)).toBeInTheDocument()
    expect(screen.getByText(/Qualitative \/ Advisory:/i)).toBeInTheDocument()
    expect(screen.getByText(/Domain Context:/i)).toBeInTheDocument()

    // Check report header
    expect(screen.getByText('RandomForestClassifier')).toBeInTheDocument()
    expect(screen.getByText('transaction_amount')).toBeInTheDocument()
    expect(screen.getByText(/Increases \(\+\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Decreases \(−\)/i)).toBeInTheDocument()
  })

  it('navigates between SHAP, permutation, local sample, error analysis, and AI narrative tabs', async () => {
    render(
      <AuthProvider>
        <ExplainabilityView
          project={mockProject}
          experimentId="exp-001"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('RandomForestClassifier')).toBeInTheDocument()
    })

    // 1. Switch to Permutation Importance tab
    fireEvent.click(screen.getByRole('button', { name: /Permutation Importance/i }))
    expect(screen.getByText(/Permutation Feature Importance/i)).toBeInTheDocument()

    // 2. Switch to Local Explanations tab and check Prediction, Probability, Top factors
    fireEvent.click(screen.getByRole('button', { name: /Local Sample Explanations/i }))
    expect(screen.getByText(/Sample-Level Waterfall Explanations/i)).toBeInTheDocument()
    expect(screen.getByText(/Sample #42/i)).toBeInTheDocument()
    expect(screen.getByText(/Top Factors Increasing Prediction/i)).toBeInTheDocument()
    expect(screen.getByText(/Top Factors Decreasing Prediction/i)).toBeInTheDocument()

    // 3. Switch to Error Analysis tab
    fireEvent.click(screen.getByRole('button', { name: /Error & Subgroup Analysis/i }))
    expect(screen.getByText(/Confusion Matrix Breakdown/i)).toBeInTheDocument()
    expect(screen.getByText(/Highest Error Slices/i)).toBeInTheDocument()

    // 4. Switch to AI Narrative tab
    fireEvent.click(screen.getByRole('button', { name: /AI Narrative & Assumptions/i }))
    expect(screen.getByText(/Strict Provenance & Anti-Fabrication Guarantee:/i)).toBeInTheDocument()
    expect(screen.getByText(/Transaction amount is the strongest risk driver/i)).toBeInTheDocument()
    expect(screen.getByText(/Minimum Threshold/i)).toBeInTheDocument()
  })

  it('executes What-If scenario analysis and prominently displays the non-causal disclaimer', async () => {
    render(
      <AuthProvider>
        <ExplainabilityView
          project={mockProject}
          experimentId="exp-001"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('RandomForestClassifier')).toBeInTheDocument()
    })

    // Switch to What-If Scenario Analysis tab
    fireEvent.click(screen.getByRole('button', { name: /What-If Scenario Analysis/i }))

    // Verify non-causal disclaimer is displayed
    expect(
      screen.getByText(/Model Sensitivity \/ Scenario Analysis — NOT Causal Evidence/i),
    ).toBeInTheDocument()

    // Click Simulate Prediction Impact
    fireEvent.click(screen.getByRole('button', { name: /Simulate Prediction Impact/i }))

    await waitFor(() => {
      expect(api.runWhatIfAnalysis).toHaveBeenCalled()
      expect(screen.getByText(/Scenario Sensitivity Outcome/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/NET PREDICTION DELTA/i)).toBeInTheDocument()
    expect(screen.getAllByText(/-0.4600/i).length).toBeGreaterThan(0)
  })

  it('navigates to SHAP Summary, SHAP Dependence, and Partial Dependence tabs', async () => {
    render(
      <AuthProvider>
        <ExplainabilityView
          project={mockProject}
          experimentId="exp-001"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('RandomForestClassifier')).toBeInTheDocument()
    })

    // 1. SHAP Summary Plot
    fireEvent.click(screen.getByRole('button', { name: /SHAP Summary Plot/i }))
    expect(screen.getByText(/SHAP Beeswarm Summary Plot/i)).toBeInTheDocument()

    // 2. SHAP Dependence Plot
    fireEvent.click(screen.getByRole('button', { name: /SHAP Dependence/i }))
    expect(screen.getByText(/SHAP Dependence Analysis/i)).toBeInTheDocument()

    // 3. Partial Dependence (PDP)
    fireEvent.click(screen.getByRole('button', { name: /Partial Dependence \(PDP\)/i }))
    expect(screen.getByText(/Partial Dependence Curves \(PDP & ICE\)/i)).toBeInTheDocument()
  })
})
