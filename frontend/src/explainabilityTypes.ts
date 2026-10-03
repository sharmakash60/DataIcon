// ExplainabilityView Types

export interface FeatureDistribution {
  min: number
  p25?: number | null
  median?: number | null
  p75?: number | null
  max: number
  mean?: number | null
  std?: number | null
  histogram?: Array<{ bin: string; count: number }> | null
  source: 'model_derived'
}

export interface FeatureImportanceEntry {
  feature_name: string
  importance_value: number
  importance_rank: number
  std_error: number | null
  method: string
  direction?: string | null // "+", "-", "non-linear", "mixed"
  distribution?: FeatureDistribution | null
  source: 'model_derived'
}

export interface SHAPSummaryPoint {
  feature_name: string
  sample_index: number
  feature_value: number
  feature_value_normalized: number
  shap_value: number
  source: 'model_derived'
}

export interface SHAPSummaryPlot {
  features: string[]
  points: SHAPSummaryPoint[]
  source: 'model_derived'
}

export interface SHAPDependencePoint {
  feature_value: number
  shap_value: number
  interaction_feature_value?: number | null
  sample_index?: number | null
  source: 'model_derived'
}

export interface SHAPDependencePlot {
  feature_name: string
  interaction_feature?: string | null
  points: SHAPDependencePoint[]
  source: 'model_derived'
}

export interface PartialDependencePlot {
  feature_name: string
  grid_values: number[]
  average_predictions: number[]
  ice_lines?: number[][] | null
  target_name?: string | null
  source: 'model_derived'
}

export interface GlobalSHAP {
  method: string
  features: FeatureImportanceEntry[]
  n_samples_used: number
  baseline_value: number | null
  summary_plot?: SHAPSummaryPlot | null
  dependence_plots?: SHAPDependencePlot[] | null
  source: 'model_derived'
}

export interface PermutationImportance {
  features: FeatureImportanceEntry[]
  metric_used: string
  n_repeats: number
  n_samples_evaluated: number
  source: 'model_derived'
}

export interface LocalSHAPFeature {
  feature_name: string
  shap_value: number
  feature_value?: any
  source: 'model_derived'
}

export interface LocalSHAPFactor {
  feature_name: string
  shap_value: number
  feature_value?: any
  impact_magnitude: number
  effect: 'increases_prediction' | 'decreases_prediction'
  source: 'model_derived'
}

export interface LocalExplanation {
  sample_index: number
  prediction: number
  probability?: number | null
  predicted_class: string | null
  base_value: number
  feature_contributions: LocalSHAPFeature[]
  feature_values?: Record<string, any> | null
  top_factors_increasing?: LocalSHAPFactor[]
  top_factors_decreasing?: LocalSHAPFactor[]
  source: 'model_derived'
}

export interface WhatIfScenarioRequest {
  sample_index?: number | null
  baseline_features?: Record<string, any>
  modified_features: Record<string, any>
}

export interface WhatIfFeatureShift {
  feature_name: string
  original_value: any
  new_value: any
  estimated_impact: number
  direction: 'increases_prediction' | 'decreases_prediction' | 'neutral'
}

export interface WhatIfScenarioResponse {
  baseline_prediction: number
  scenario_prediction: number
  delta: number
  baseline_probability: number | null
  scenario_probability: number | null
  feature_shifts: WhatIfFeatureShift[]
  top_factors_increasing: LocalSHAPFactor[]
  top_factors_decreasing: LocalSHAPFactor[]
  disclaimer: string
  method: string
  source: 'model_derived'
}

export interface ConfusionMatrixCell {
  predicted_label: string
  actual_label: string
  count: number
  rate: number
  source: 'model_derived'
}

export interface ErrorSegment {
  feature_name: string
  segment_label: string
  n_samples: number
  error_rate: number
  primary_metric_value: number
  delta_from_overall: number
  source: 'model_derived'
}

export interface ResidualStats {
  mean_residual: number
  std_residual: number
  mae: number
  rmse: number
  max_error: number
  source: 'model_derived'
}

export interface ErrorAnalysis {
  problem_type: string
  overall_error_rate: number | null
  overall_metric_value: number
  confusion_matrix: ConfusionMatrixCell[] | null
  residual_stats: ResidualStats | null
  worst_segments: ErrorSegment[]
  best_segments: ErrorSegment[]
  source: 'model_derived'
}

export interface AINarrative {
  global_importance_narrative: string
  error_analysis_narrative: string
  business_context_narrative: string
  source: 'ai_generated'
  model_used: string
  generated_at: string
  warning: string
}

export interface UserAssumption {
  key: string
  value: string
  source: 'user_assumption'
}

export interface ExplainabilityReport {
  id: string
  organization_id: string
  project_id: string
  experiment_id: string
  experiment_run_id: string | null
  schema_version: string
  model_name: string
  problem_type: string
  target_name: string
  primary_metric: string
  primary_metric_value: number
  n_eval_samples: number
  explained_at: string
  global_shap: GlobalSHAP | null
  permutation_importance: PermutationImportance | null
  shap_summary?: SHAPSummaryPlot | null
  shap_dependence?: SHAPDependencePlot[] | null
  partial_dependence?: PartialDependencePlot[] | null
  local_explanations: LocalExplanation[]
  error_analysis: ErrorAnalysis | null
  ai_narrative: AINarrative | null
  ai_narrative_warning: string
  user_assumptions: UserAssumption[]
  provenance_verified: boolean
  created_at: string
  updated_at: string
}
