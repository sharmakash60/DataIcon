export type AlertType =
  | 'feature_drift'
  | 'data_drift'
  | 'performance_drop'
  | 'latency_spike'
  | 'error_spike'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface LatencySummary {
  mean_ms: number
  min_ms: number
  max_ms: number
  p50_ms: number
  p90_ms: number
  p95_ms: number
  p99_ms: number
}

export interface PredictionDistribution {
  total_predictions: number
  class_counts?: Record<string, number>
  class_proportions?: Record<string, number>
  quantiles?: Record<string, number>
  mean?: number
  std?: number
}

export interface FeatureDriftItem {
  feature_name: string
  dtype: string
  method: string
  statistic: number
  p_value?: number | null
  drift_detected: boolean
  severity: 'none' | 'warning' | 'critical'
  baseline_stats: Record<string, any>
  current_stats: Record<string, any>
}

export interface DataDriftSummary {
  drifted_features_count: number
  total_features_count: number
  drift_share: number
  dataset_drift_detected: boolean
  method: string
}

export interface PerformanceMetrics {
  sample_count: number
  metrics: Record<string, number>
  evaluated_at: string
}

export interface MonitoringAlert {
  id: string
  organization_id: string
  project_id: string
  deployment_id: string
  snapshot_id?: string | null
  alert_type: AlertType
  severity: AlertSeverity
  message: string
  feature_name?: string | null
  metric_name: string
  threshold: number
  current_value: number
  is_resolved: boolean
  resolved_at?: string | null
  resolved_by_user_id?: string | null
  created_at: string
}

export interface MonitoringSnapshot {
  id: string
  organization_id: string
  project_id: string
  deployment_id: string
  period_start: string
  period_end: string
  total_requests: number
  throughput_rps: number
  error_count: number
  error_rate: number
  latency_p50_ms: number
  latency_p95_ms: number
  latency_p99_ms: number
  data_drift_score: number
  data_drift_detected: boolean
  metrics: Record<string, number>
  prediction_distribution: PredictionDistribution
  feature_drifts: FeatureDriftItem[]
  created_at: string
}

export interface MonitoringSnapshotListResponse {
  items: MonitoringSnapshot[]
  total: number
}

export interface MonitoringAlertListResponse {
  items: MonitoringAlert[]
  total: number
}

export interface GroundTruthSubmission {
  request_id: string
  actual: any
}

export interface GroundTruthPayload {
  submissions: GroundTruthSubmission[]
}
