export type Check = 'ok' | 'error'

export type Health = {
  status: 'ready' | 'not_ready'
  checks: { postgresql: Check; redis: Check; migrations: Check }
}

export type Role = 'owner' | 'admin' | 'data_scientist' | 'analyst' | 'viewer' | 'security_auditor'

export type User = {
  id: string
  email: string
  display_name: string
  status: string
  created_at: string
}

export type OrganizationMembership = {
  organization_id: string
  organization_name: string
  role: Role
  status: string
  permissions?: string[]
}

export type AuthResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
  organizations: OrganizationMembership[]
}

export type ProjectClassification = 'internal' | 'confidential' | 'restricted'
export type ProjectStatus = 'active' | 'archived'

export type Project = {
  id: string
  organization_id: string
  name: string
  purpose: string | null
  classification: ProjectClassification
  status: ProjectStatus
  owner_user_id: string | null
  created_at: string
  updated_at: string
}

export type Member = {
  id: string
  user_id: string
  email: string
  display_name: string
  role: Role
  status: string
  created_at: string
  last_activity_at?: string | null
  project_ids?: string[]
  project_names?: string[]
}

export type ProjectMember = {
  id: string
  project_id: string
  user_id: string
  email: string
  display_name: string
  role: string
  created_at: string
}

export const Permissions = {
  ORGANIZATION_VIEW: 'ORGANIZATION_VIEW',
  ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  ORGANIZATION_DELETE: 'ORGANIZATION_DELETE',
  MEMBERS_VIEW: 'MEMBERS_VIEW',
  MEMBERS_INVITE: 'MEMBERS_INVITE',
  MEMBERS_UPDATE: 'MEMBERS_UPDATE',
  MEMBERS_REMOVE: 'MEMBERS_REMOVE',
  ROLES_VIEW: 'ROLES_VIEW',
  ROLES_MANAGE: 'ROLES_MANAGE',
  PROJECT_VIEW: 'PROJECT_VIEW',
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  DATASET_VIEW: 'DATASET_VIEW',
  DATASET_CONNECT: 'DATASET_CONNECT',
  DATASET_PROFILE: 'DATASET_PROFILE',
  DATASET_DELETE: 'DATASET_DELETE',
  DATASET_EXPORT: 'DATASET_EXPORT',
  EXPERIMENT_VIEW: 'EXPERIMENT_VIEW',
  EXPERIMENT_CREATE: 'EXPERIMENT_CREATE',
  EXPERIMENT_RUN: 'EXPERIMENT_RUN',
  EXPERIMENT_CANCEL: 'EXPERIMENT_CANCEL',
  EXPERIMENT_DELETE: 'EXPERIMENT_DELETE',
  MODEL_VIEW: 'MODEL_VIEW',
  MODEL_CREATE: 'MODEL_CREATE',
  MODEL_APPROVE: 'MODEL_APPROVE',
  MODEL_DEPLOY: 'MODEL_DEPLOY',
  MODEL_DELETE: 'MODEL_DELETE',
  REPORT_VIEW: 'REPORT_VIEW',
  REPORT_CREATE: 'REPORT_CREATE',
  REPORT_EXPORT: 'REPORT_EXPORT',
  REPORT_DELETE: 'REPORT_DELETE',
  DEPLOYMENT_VIEW: 'DEPLOYMENT_VIEW',
  DEPLOYMENT_CREATE: 'DEPLOYMENT_CREATE',
  DEPLOYMENT_UPDATE: 'DEPLOYMENT_UPDATE',
  DEPLOYMENT_DELETE: 'DEPLOYMENT_DELETE',
  MONITORING_VIEW: 'MONITORING_VIEW',
  MONITORING_CONFIGURE: 'MONITORING_CONFIGURE',
  GOVERNANCE_VIEW: 'GOVERNANCE_VIEW',
  GOVERNANCE_MANAGE: 'GOVERNANCE_MANAGE',
  AUDIT_LOG_VIEW: 'AUDIT_LOG_VIEW',
  SECURITY_SETTINGS_MANAGE: 'SECURITY_SETTINGS_MANAGE',
  BILLING_VIEW: 'BILLING_VIEW',
  BILLING_MANAGE: 'BILLING_MANAGE',
  AGENT_VIEW: 'AGENT_VIEW',
  AGENT_REGISTER: 'AGENT_REGISTER',
  AGENT_MANAGE: 'AGENT_MANAGE',
} as const

export type AuditEvent = {
  id: string
  organization_id: string | null
  actor_id: string | null
  actor_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  result: string
  source_ip: string | null
  details: string | null
  created_at: string
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type MLProblemType = 'binary_classification' | 'multiclass_classification' | 'regression' | 'time_series_forecasting'
export type RequirementStatus = 'draft' | 'reviewed' | 'approved' | 'rejected'

export type BusinessRequirement = {
  id: string
  organization_id: string
  project_id: string
  created_by_user_id: string
  natural_language_input: string
  business_objective: string
  ml_objective?: string
  prediction_objective: string
  target?: string
  target_name: string
  prediction_horizon: string | null
  candidate_problem_type?: MLProblemType
  ml_problem_type: MLProblemType
  primary_metric: string
  secondary_metrics: string[]
  business_constraints: string[]
  cost_of_false_positives?: string | null
  cost_of_false_negatives?: string | null
  expected_prediction_frequency?: string | null
  business_priority?: string | null
  suggested_positive_class: string | null
  confidence_score: number
  assumptions: string[]
  missing_requirements?: string[]
  status: RequirementStatus
  review_notes: string | null
  reviewed_by_user_id: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type ProblemFormulation = {
  id: string
  version: number
  organization_id: string
  project_id: string
  requirement_id: string | null
  business_objective: string
  ml_objective: string
  target: string
  prediction_horizon: string | null
  candidate_problem_type: string
  primary_metric: string
  secondary_metrics: string[]
  business_constraints: string[]
  cost_of_false_positives: string | null
  cost_of_false_negatives: string | null
  expected_prediction_frequency: string | null
  business_priority: string | null
  assumptions: string[]
  status: string
  confirmed_by_user_id: string | null
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

export type ExperimentRun = {
  id: string
  experiment_id: string
  model_name: string
  algorithm_key: string
  is_baseline: boolean
  rank: number | null
  mean_cv_score: number
  std_cv_score: number
  training_time_seconds: number
  inference_latency_ms: number
  hyperparameters: Record<string, unknown>
  metrics: Record<string, number>
  cv_scores: number[]
  status: string
  created_at: string
}

export type ExperimentTrial = {
  id: string
  experiment_id: string
  trial_number: number
  model_name: string
  parameters: Record<string, unknown>
  score: number
  state: string
  duration_seconds: number
  created_at: string
}

export type Experiment = {
  id: string
  organization_id: string
  project_id: string
  name: string
  // EMS metadata fields
  dataset_version: string
  dataset_fingerprint: string
  problem_formulation: Record<string, unknown>
  preprocessing_config: Record<string, unknown>
  feature_config: Record<string, unknown>
  model: string
  hyperparameters: Record<string, unknown>
  validation_strategy: string
  metrics: Record<string, number>
  training_duration: number
  environment_info: Record<string, unknown>
  random_seed: number
  model_artifact_reference: string | null
  // Compatibility / summary fields
  problem_type: string
  target_name: string
  primary_metric: string
  status: string
  best_model_name: string | null
  best_score: number | null
  baseline_score: number | null
  n_samples: number | null
  n_features: number | null
  total_execution_time_seconds: number | null
  decision?: 'candidate' | 'approved' | 'rejected'
  decision_notes?: string | null
  decision_by?: string | null
  decision_at?: string | null
  mean_cv_score?: number | null
  std_cv_score?: number | null
  cv_scores?: number[]
  inference_latency_ms?: number | null
  memory_usage_mb?: number | null
  model_complexity?: {
    tier: string
    parameter_count: number
    architecture: string
    summary: string
    interpretable_native: boolean
    tree_count?: number
    max_depth?: number
  }
  explainability?: {
    available: boolean
    status: string
    methods: string[]
  }
  visualizations?: {
    confusion_matrix?: {
      matrix: number[][]
      labels: string[]
      tn: number
      fp: number
      fn: number
      tp: number
      tn_pct: number
      fp_pct: number
      fn_pct: number
      tp_pct: number
      fpr: number
      fnr: number
      precision: number
      recall: number
    }
    roc_curve?: {
      auc: number
      points: Array<{ fpr: number; tpr: number; threshold: number }>
    }
    pr_curve?: {
      auc: number
      baseline_prevalence: number
      points: Array<{ recall: number; precision: number; threshold: number }>
    }
    residual_analysis?: {
      mean_residual: number
      std_residual: number
      median_abs_error: number
      p95_error: number
      max_error: number
      scatter: Array<{ predicted: number; residual: number }>
      histogram: Array<{ bin_center: number; range_label: string; count: number }>
    }
  }
  composite_utility_score?: {
    score: number
    max_score: number
    formula: string
    explanation: string
    weights: {
      metric_score: number
      cv_stability: number
      latency_efficiency: number
      model_simplicity: number
    }
    components: {
      metric_score: { raw_value: number; normalized: number; contribution: number; metric_name: string }
      cv_stability: { raw_std: number; normalized: number; contribution: number; stability_tier: string }
      latency_efficiency: { raw_ms: number; normalized: number; contribution: number; sla_threshold_ms: number }
      model_simplicity: { raw_param_count: number; normalized: number; contribution: number; complexity_tier: string }
    }
  }
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ExperimentDetail = Experiment & {
  runs: ExperimentRun[]
  trials: ExperimentTrial[]
  workflow_stages?: Array<{ stage_number: number; stage_name: string; [key: string]: unknown }>
  recommendation?: Record<string, unknown>
}

export type MetricComparison = {
  metric_name: string
  values: Record<string, number | null>
  best_experiment_id: string | null
  best_value: number | null
  direction: 'higher_is_better' | 'lower_is_better'
}

export type ExperimentComparisonResponse = {
  experiments: Experiment[]
  metric_comparisons: MetricComparison[]
  hyperparameter_differences: Record<string, Record<string, unknown>>
  dataset_consistency: Record<string, unknown>
  recommendation_summary?: {
    recommended_experiment_id: string
    recommended_model_name: string
    primary_metric: string
    score: number
    baseline_score: number
    lift_percentage: number
    composite_score: number
    latency_ms: number | null
    within_sla: boolean
    decision: 'candidate' | 'approved' | 'rejected'
    empirical_rationale: string
  } | null
  model_summaries?: Array<Record<string, unknown>>
}

// =========================================================================
// Data Health Center Types
// =========================================================================

export type HealthIssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface DataHealthIssue {
  id: string
  title: string
  category: string
  severity: HealthIssueSeverity
  column: string | null
  evidence: string
  explanation: string
  potential_impact: string
  recommended_action: string
}

export interface ScoreDeduction {
  issue_id: string
  title: string
  category: string
  severity: string
  points_deducted: number
  reason: string
}

export interface HealthScoreInfo {
  overall_score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  base_score: number
  total_issues_count: number
  deductions: ScoreDeduction[]
  methodology: {
    base_score: number
    penalties: Record<string, string>
    formula: string
  }
}

export interface DatasetOverviewInfo {
  rows: number
  columns: number
  memory_usage_bytes: number
  memory_usage_formatted: string
  numerical_columns: string[]
  categorical_columns: string[]
  datetime_columns: string[]
  boolean_columns: string[]
  text_columns: string[]
  column_types: Record<string, string>
}

export interface CompletenessInfo {
  total_missing_values: number
  overall_missing_percentage: number
  columns_with_missing: Array<{
    column: string
    missing_count: number
    missing_percentage: number
  }>
  missing_patterns: Array<{
    pattern_id: string
    description: string
    columns_involved: string[]
    affected_rows: number
    cooccurrence_ratio: number
  }>
}

export interface DuplicatesInfo {
  duplicate_rows_count: number
  duplicate_rows_percentage: number
  duplicate_identifiers: Array<{
    column: string
    duplicate_key_count: number
    sample_duplicates: string[]
  }>
  potential_near_duplicates_count: number
}

export interface ValidityInfo {
  invalid_values: Array<{
    column: string
    issue_type: string
    count: number
    description: string
  }>
  impossible_values: Array<{
    column: string
    rule_violated: string
    count: number
    description: string
  }>
  type_inconsistencies: Array<{
    column: string
    issue_type: string
    count: number
    description: string
  }>
  unexpected_ranges: Array<{
    column: string
    expected_range: string
    actual_min: number
    actual_max: number
    count_outside: number
  }>
}

export interface FeatureQualityInfo {
  constant_features: Array<{ column: string; value: string | null }>
  near_constant_features: Array<{
    column: string
    dominant_value: string
    dominant_ratio: number
  }>
  high_cardinality_features: Array<{
    column: string
    unique_count: number
    cardinality_ratio: number
  }>
  unique_identifiers: Array<{
    column: string
    unique_count: number
    is_sequential: boolean
  }>
  suspicious_features: Array<{ column: string; reason: string }>
}

export interface OutlierColumnInfo {
  column: string
  outlier_count: number
  outlier_percentage: number
  method: string
  lower_bound: number
  upper_bound: number
  min: number
  q25: number
  median: number
  q75: number
  max: number
}

export interface OutlierAnalysisInfo {
  columns: OutlierColumnInfo[]
}

export interface CorrelationMatrixEntry {
  column_a: string
  column_b: string
  pearson_r: number
}

export interface SuspiciousRelationship {
  feature_a: string
  feature_b: string
  pearson_r: number
  relationship_type: string
  severity: string
}

export interface CorrelationAnalysisInfo {
  matrix: CorrelationMatrixEntry[]
  suspicious_relationships: SuspiciousRelationship[]
}

export interface TargetAnalysisInfo {
  target_name: string
  problem_type: string
  distribution?: Array<{ class_label: string; count: number; ratio: number }>
  class_imbalance?: {
    is_imbalanced: boolean
    majority_ratio: number
    imbalance_ratio: string
  }
  statistics?: {
    mean: number
    std: number
    min: number
    max: number
  }
  total_samples: number
  relationship_with_important_features?: Array<{
    feature: string
    type: string
    correlation_with_target: number
    abs_correlation: number
  }>
}

export interface LeakageInfo {
  target_leakage: Array<{
    feature: string
    correlation_with_target: number
    explanation: string
    recommended_action: string
  }>
  identifier_leakage: Array<{
    feature: string
    unique_ratio: number
    risk_level: string
    recommended_action: string
  }>
  temporal_leakage: Array<{
    column: string
    future_timestamps_count: number
    explanation: string
    recommended_action: string
  }>
  post_outcome_features: Array<{
    feature: string
    evidence: string
    explanation: string
    recommended_action: string
  }>
  train_test_contamination: Array<{
    identifier_column: string
    overlapping_entities_count: number
    overlap_ratio_in_test: number
    sample_overlapping_ids: string[]
  }>
}

export interface DataHealthAssessment {
  dataset_id: string
  dataset_alias: string
  target_column?: string | null
  datetime_column?: string | null
  analyzed_at: string
  overview: DatasetOverviewInfo
  completeness: CompletenessInfo
  duplicates: DuplicatesInfo
  validity: ValidityInfo
  feature_quality: FeatureQualityInfo
  outliers: OutlierAnalysisInfo
  correlations: CorrelationAnalysisInfo
  target_analysis?: TargetAnalysisInfo | null
  leakage: LeakageInfo
  health_score: HealthScoreInfo
  issues: DataHealthIssue[]
}

