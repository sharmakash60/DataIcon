export type DeploymentType = 'local' | 'docker'
export type DeploymentStatus = 'pending_approval' | 'active' | 'stopped' | 'rolled_back'

export interface FeatureSchemaField {
  name: string
  dtype: string
  nullable?: boolean
  example?: any
}

export interface DeploymentSummary {
  id: string
  organization_id: string
  project_id: string
  experiment_id: string
  name: string
  model_name: string
  model_version: string
  deployment_type: DeploymentType
  endpoint_url: string
  prediction_path: string
  status: DeploymentStatus
  problem_type: string
  target_name: string
  primary_metric: string
  created_at: string
  approved_at: string | null
}

export interface DeploymentDetail extends DeploymentSummary {
  input_schema: FeatureSchemaField[]
  notes: string | null
  auth_configured: boolean
  approved_by_user_id: string | null
  created_by_user_id: string | null
  updated_at: string
}

export interface DeploymentListResponse {
  items: DeploymentSummary[]
  total: number
}

export interface CreateDeploymentPayload {
  name: string
  deployment_type: DeploymentType
  endpoint_url?: string
  prediction_path?: string
  notes?: string
  auto_approve?: boolean
}

export interface PredictionPayload {
  features: Record<string, any> | Array<Record<string, any>>
  request_id?: string
}

export interface PredictionResponse {
  prediction_id: string
  model_name: string
  model_version: string
  predictions: any[]
  probabilities?: Array<Record<string, number>>
  latency_ms: number
  warnings?: string[]
}
