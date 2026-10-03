import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DataHealthCenterView } from './DataHealthCenterView'
import { api } from './api'
import type { DataHealthAssessment } from './types'

// Mock useAuth hook
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    activeOrg: {
      organization_id: 'org-test-123',
      organization_name: 'Biotech AI Labs',
      role: 'data_scientist',
      permissions: ['DATASET_VIEW', 'DATASET_PROFILE'],
    },
    hasPermission: () => true,
  }),
}))

const mockAssessment: DataHealthAssessment = {
  dataset_id: 'ds-123',
  dataset_alias: 'Clinical Churn Cohort',
  target_column: 'churn',
  datetime_column: 'signup_date',
  analyzed_at: '2026-09-29T10:00:00Z',
  overview: {
    rows: 15000,
    columns: 14,
    memory_usage_bytes: 1048576,
    memory_usage_formatted: '1.05 MB',
    numerical_columns: ['age', 'income', 'monthly_charges', 'tenure'],
    categorical_columns: ['contract_type', 'city'],
    datetime_columns: ['signup_date'],
    boolean_columns: ['has_paperless'],
    text_columns: ['feedback_notes'],
    column_types: { age: 'numerical', city: 'categorical' },
  },
  completeness: {
    total_missing_values: 120,
    overall_missing_percentage: 0.8,
    columns_with_missing: [
      { column: 'income', missing_count: 80, missing_percentage: 0.53 },
      { column: 'city', missing_count: 40, missing_percentage: 0.27 },
    ],
    missing_patterns: [
      {
        pattern_id: 'pat_1',
        description: 'Synchronized missingness in income and city',
        columns_involved: ['income', 'city'],
        affected_rows: 35,
        cooccurrence_ratio: 0.88,
      },
    ],
  },
  duplicates: {
    duplicate_rows_count: 12,
    duplicate_rows_percentage: 0.08,
    duplicate_identifiers: [
      { column: 'customer_id', duplicate_key_count: 2, sample_duplicates: ['CUST-001', 'CUST-002'] },
    ],
    potential_near_duplicates_count: 24,
  },
  validity: {
    invalid_values: [
      { column: 'tenure', issue_type: 'sentinel_placeholder', count: 5, description: 'Contains 5 numeric sentinels (-999)' },
    ],
    impossible_values: [
      { column: 'age', rule_violated: 'Human Age (0 - 125)', count: 2, description: '2 records with age < 0 or > 125' },
    ],
    type_inconsistencies: [],
    unexpected_ranges: [
      { column: 'churn_prob', expected_range: '[0.0, 1.0]', actual_min: -0.1, actual_max: 1.5, count_outside: 4 },
    ],
  },
  feature_quality: {
    constant_features: [{ column: 'active_flag', value: '1' }],
    near_constant_features: [{ column: 'country', dominant_value: 'US', dominant_ratio: 98.5 }],
    high_cardinality_features: [{ column: 'city', unique_count: 85, cardinality_ratio: 0.57 }],
    unique_identifiers: [{ column: 'customer_id', unique_count: 14998, is_sequential: false }],
    suspicious_features: [{ column: 'customer_email', reason: 'Email PII pattern detected' }],
  },
  outliers: {
    columns: [
      {
        column: 'income',
        outlier_count: 45,
        outlier_percentage: 6.2,
        method: "Tukey's IQR Rule (1.5x IQR)",
        lower_bound: 15000,
        upper_bound: 120000,
        min: 10000,
        q25: 35000,
        median: 55000,
        q75: 75000,
        max: 450000,
      },
    ],
  },
  correlations: {
    matrix: [
      { column_a: 'monthly_charges', column_b: 'income', pearson_r: 0.88 },
      { column_a: 'age', column_b: 'tenure', pearson_r: 0.35 },
    ],
    suspicious_relationships: [
      {
        feature_a: 'monthly_charges',
        feature_b: 'income',
        pearson_r: 0.88,
        relationship_type: 'High Collinearity',
        severity: 'medium',
      },
    ],
  },
  target_analysis: {
    target_name: 'churn',
    problem_type: 'binary_classification',
    distribution: [
      { class_label: '0', count: 12000, ratio: 0.8 },
      { class_label: '1', count: 3000, ratio: 0.2 },
    ],
    class_imbalance: {
      is_imbalanced: true,
      majority_ratio: 80.0,
      imbalance_ratio: '80:20',
    },
    total_samples: 15000,
    relationship_with_important_features: [
      { feature: 'monthly_charges', type: 'numerical', correlation_with_target: 0.42, abs_correlation: 0.42 },
    ],
  },
  leakage: {
    target_leakage: [
      {
        feature: 'cancellation_fee',
        correlation_with_target: 0.98,
        explanation: 'Direct target duplicate column',
        recommended_action: 'Drop feature',
      },
    ],
    identifier_leakage: [
      {
        feature: 'customer_id',
        unique_ratio: 0.99,
        risk_level: 'High',
        recommended_action: 'Drop entity IDs from features',
      },
    ],
    temporal_leakage: [
      {
        column: 'signup_date',
        future_timestamps_count: 3,
        explanation: 'Timestamps in year 2038',
        recommended_action: 'Filter to cutoff date',
      },
    ],
    post_outcome_features: [
      {
        feature: 'cancellation_reason',
        evidence: 'Lifecycle marker',
        explanation: 'Populated after churn',
        recommended_action: 'Exclude from training features',
      },
    ],
    train_test_contamination: [
      {
        identifier_column: 'customer_id',
        overlapping_entities_count: 8,
        overlap_ratio_in_test: 0.05,
        sample_overlapping_ids: ['CUST-005', 'CUST-009'],
      },
    ],
  },
  health_score: {
    overall_score: 72,
    grade: 'C',
    base_score: 100,
    total_issues_count: 5,
    deductions: [
      { issue_id: 'iss_001', title: 'Target Leakage', category: 'leakage', severity: 'critical', points_deducted: 15, reason: 'Target duplicate' },
      { issue_id: 'iss_002', title: 'Train/Test Contamination', category: 'leakage', severity: 'critical', points_deducted: 15, reason: 'Split overlap' },
    ],
    methodology: {
      base_score: 100,
      penalties: { critical: '-15 pts', high: '-8 pts', medium: '-4 pts', low: '-2 pts' },
      formula: 'Score = Max(0, 100 - Deductions)',
    },
  },
  issues: [
    {
      id: 'iss_001',
      title: 'Target Leakage in cancellation_fee',
      category: 'leakage',
      severity: 'critical',
      column: 'cancellation_fee',
      evidence: 'Correlation with target is 0.98',
      explanation: 'Feature directly reflects the target outcome.',
      potential_impact: 'Catastrophic model failure in production.',
      recommended_action: 'Drop cancellation_fee immediately.',
    },
    {
      id: 'iss_002',
      title: 'Post-Outcome Feature cancellation_reason',
      category: 'leakage',
      severity: 'critical',
      column: 'cancellation_reason',
      evidence: 'Populated chronologically after churn event.',
      explanation: 'Unseen at prediction time.',
      potential_impact: 'Severe data leakage.',
      recommended_action: 'Exclude from training pipeline.',
    },
    {
      id: 'iss_003',
      title: 'Biologically Impossible Ages',
      category: 'validity',
      severity: 'high',
      column: 'age',
      evidence: '2 records with age < 0 or > 125',
      explanation: 'Data entry typo.',
      potential_impact: 'Distorted risk curve.',
      recommended_action: 'Winsorize or clip age to [0, 100].',
    },
  ],
}

describe('DataHealthCenterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(api, 'getDatasetHealth').mockResolvedValue(mockAssessment)
    vi.spyOn(api, 'analyzeDatasetHealth').mockResolvedValue(mockAssessment)
  })

  it('renders overall health score, grade, and security containment banner', async () => {
    render(
      <DataHealthCenterView
        projectId="proj-123"
        datasetId="ds-123"
        datasetName="Clinical Churn Cohort"
      />
    )

    expect(await screen.findByText('Data Health Center')).toBeInTheDocument()
    expect(screen.getByText('Client Data Plane Isolated')).toBeInTheDocument()
    expect(screen.getByText('Clinical Churn Cohort')).toBeInTheDocument()

    // Health Score
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('Grade C')).toBeInTheDocument()
  })

  it('displays severity breakdown cards with issue counts', async () => {
    render(
      <DataHealthCenterView
        projectId="proj-123"
        datasetId="ds-123"
        datasetName="Clinical Churn Cohort"
      />
    )

    expect(await screen.findByText(/critical issues/i)).toBeInTheDocument()
    expect(screen.getByText(/high issues/i)).toBeInTheDocument()
    expect(screen.getByText(/medium issues/i)).toBeInTheDocument()
    expect(screen.getByText(/low issues/i)).toBeInTheDocument()
  })

  it('navigates through tabs across dimensions (Overview, Completeness, Outliers, Leakage)', async () => {
    render(
      <DataHealthCenterView
        projectId="proj-123"
        datasetId="ds-123"
        datasetName="Clinical Churn Cohort"
      />
    )

    await screen.findByText('Data Health Center')

    // Click Overview Tab
    fireEvent.click(screen.getByRole('button', { name: /1\. Overview/i }))
    expect(screen.getByText('TOTAL ROWS')).toBeInTheDocument()
    expect(screen.getByText('15,000')).toBeInTheDocument()
    expect(screen.getByText('1.05 MB')).toBeInTheDocument()

    // Click Completeness Tab
    fireEvent.click(screen.getByRole('button', { name: /2\. Completeness/i }))
    expect(screen.getByText('TOTAL MISSING CELLS')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()

    // Click Outliers Tab
    fireEvent.click(screen.getByRole('button', { name: /6\. Outliers/i }))
    expect(screen.getByText(/Tukey's IQR Outlier Detection/i)).toBeInTheDocument()
    expect(screen.getByText('45 outliers (6.2%)')).toBeInTheDocument()

    // Click Leakage Tab
    fireEvent.click(screen.getByRole('button', { name: /9\. Leakage Detection/i }))
    expect(screen.getByText(/Target Leakage Features/i)).toBeInTheDocument()
    expect(screen.getByText(/Post-Outcome Features/i)).toBeInTheDocument()
    expect(screen.getByText(/Train\/Test Split Contamination/i)).toBeInTheDocument()
  })

  it('opens issue inspection modal when an issue is selected', async () => {
    render(
      <DataHealthCenterView
        projectId="proj-123"
        datasetId="ds-123"
        datasetName="Clinical Churn Cohort"
      />
    )

    const issueElement = await screen.findByText('Target Leakage in cancellation_fee')
    fireEvent.click(issueElement)

    // Modal opens with all 5 mandatory sections
    expect(await screen.findByText('AFFECTED FEATURE')).toBeInTheDocument()
    expect(screen.getByText('EVIDENCE & TELEMETRY')).toBeInTheDocument()
    expect(screen.getByText('DATA SCIENTIST EXPLANATION')).toBeInTheDocument()
    expect(screen.getByText('POTENTIAL PRODUCTION IMPACT')).toBeInTheDocument()
    expect(screen.getByText('RECOMMENDED ACTION')).toBeInTheDocument()
    expect(screen.getByText('Drop cancellation_fee immediately.')).toBeInTheDocument()

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /close inspection/i }))
    await waitFor(() => {
      expect(screen.queryByText('AFFECTED FEATURE')).not.toBeInTheDocument()
    })
  })

  it('opens transparent scoring methodology modal', async () => {
    render(
      <DataHealthCenterView
        projectId="proj-123"
        datasetId="ds-123"
        datasetName="Clinical Churn Cohort"
      />
    )

    const methodologyBtn = await screen.findByText('Methodology & Deductions')
    fireEvent.click(methodologyBtn)

    expect(await screen.findByText('Transparent Scoring Methodology')).toBeInTheDocument()
    expect(screen.getByText(/Critical \(-15 pts\)/i)).toBeInTheDocument()
    expect(screen.getByText(/High \(-8 pts\)/i)).toBeInTheDocument()
    expect(screen.getAllByText(/-15 pts/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByText('Transparent Scoring Methodology')).not.toBeInTheDocument()
    })
  })

  it('allows triggering re-analysis with custom parameters', async () => {
    render(
      <DataHealthCenterView
        projectId="proj-123"
        datasetId="ds-123"
        datasetName="Clinical Churn Cohort"
      />
    )

    const configBtn = await screen.findByText('⚙️ Target & Parameters')
    fireEvent.click(configBtn)

    expect(screen.getByText(/Target Column \(for leakage/i)).toBeInTheDocument()
    const applyBtn = screen.getByRole('button', { name: /Apply & Analyze/i })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(api.analyzeDatasetHealth).toHaveBeenCalled()
    })
  })
})
