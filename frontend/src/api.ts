import type {
  AuditEvent,
  AuthResponse,
  BusinessRequirement,
  Experiment,
  ExperimentComparisonResponse,
  ExperimentDetail,
  ExperimentRun,
  Health,
  Member,
  PaginatedResponse,
  Project,
  ProjectClassification,
  ProjectMember,
  Role,
  DataHealthAssessment,
  ProblemFormulation,
} from './types'
import type {
  ExplainabilityReport,
  WhatIfScenarioRequest,
  WhatIfScenarioResponse,
} from './explainabilityTypes'
import type { GenerateReportRequest, SeniorReportDetail, SeniorReportSummary } from './reportTypes'
import type {
  CreateDeploymentPayload,
  DeploymentDetail,
  DeploymentListResponse,
  DeploymentSummary,
  PredictionPayload,
  PredictionResponse,
} from './deploymentTypes'
import type {
  GroundTruthSubmission,
  MonitoringAlert,
  MonitoringAlertListResponse,
  MonitoringSnapshot,
  MonitoringSnapshotListResponse,
} from './monitoringTypes'
import type {
  ProjectWorkflowOut,
  StageOverrideRequest,
  WorkflowExecutionMode,
} from './workflowTypes'

const TOKEN_KEY = 'datapilot_access_token'
const REFRESH_KEY = 'datapilot_refresh_token'
const ACTIVE_ORG_KEY = 'datapilot_active_org'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function getStoredActiveOrgId(): string | null {
  return localStorage.getItem(ACTIVE_ORG_KEY)
}

export function setStoredActiveOrgId(orgId: string): void {
  localStorage.setItem(ACTIVE_ORG_KEY, orgId)
}

export function storeAuthTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(ACTIVE_ORG_KEY)
}

export async function parseHealthResponse(response: Response): Promise<Health> {
  if (response.status !== 200 && response.status !== 503) {
    throw new Error('Unavailable')
  }
  const data = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    !['ready', 'not_ready'].includes(data.status ?? '') ||
    !data.checks ||
    !['postgresql', 'redis', 'migrations'].every((key) =>
      ['ok', 'error'].includes(data.checks[key]),
    ) ||
    (data.status === 'ready' && Object.values(data.checks).some((v) => v !== 'ok'))
  ) {
    throw new Error('Invalid health response')
  }
  return data as Health
}

export async function fetchHealth(): Promise<Health> {
  const response = await fetch('/api/v1/health/ready', { cache: 'no-store' })
  return parseHealthResponse(response)
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')

  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response = await fetch(path, { ...options, headers })

  // Attempt refresh on 401
  if (response.status === 401 && getStoredRefreshToken()) {
    const refreshToken = getStoredRefreshToken()
    try {
      const refreshRes = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json()
        storeAuthTokens(refreshData.access_token, refreshData.refresh_token)
        headers.set('Authorization', `Bearer ${refreshData.access_token}`)
        response = await fetch(path, { ...options, headers })
      } else {
        clearStoredAuth()
      }
    } catch {
      clearStoredAuth()
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`
    try {
      const errorJson = await response.json()
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message
      } else if (errorJson.detail) {
        errorMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail)
      }
    } catch {
      // Use fallback error message
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<T>
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiRequest<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    storeAuthTokens(res.access_token, res.refresh_token)
    if (res.organizations.length > 0) {
      setStoredActiveOrgId(res.organizations[0].organization_id)
    }
    return res
  },

  async register(
    email: string,
    password: string,
    displayName: string,
    organizationName: string,
  ): Promise<AuthResponse> {
    const res = await apiRequest<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        display_name: displayName,
        organization_name: organizationName,
      }),
    })
    storeAuthTokens(res.access_token, res.refresh_token)
    if (res.organizations.length > 0) {
      setStoredActiveOrgId(res.organizations[0].organization_id)
    }
    return res
  },

  async logout(): Promise<void> {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      clearStoredAuth()
    }
  },

  async getMe(): Promise<{ user: AuthResponse['user']; organizations: AuthResponse['organizations'] }> {
    return apiRequest('/api/v1/auth/me')
  },

  // Projects
  async getProjects(orgId: string): Promise<PaginatedResponse<Project>> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects?limit=50`)
  },

  async createProject(
    orgId: string,
    name: string,
    purpose?: string,
    classification?: ProjectClassification,
  ): Promise<Project> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        purpose: purpose || null,
        classification: classification || 'internal',
      }),
    })
  },

  async updateProject(
    orgId: string,
    projectId: string,
    updates: { name?: string; purpose?: string; classification?: ProjectClassification },
  ): Promise<Project> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  },

  async deleteProject(orgId: string, projectId: string): Promise<void> {
    await apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}`, {
      method: 'DELETE',
    })
  },

  // Members
  async getMembers(orgId: string): Promise<Member[]> {
    return apiRequest(`/api/v1/organizations/${orgId}/members`)
  },

  async addMember(orgId: string, email: string, role: Role): Promise<Member> {
    return apiRequest(`/api/v1/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    })
  },

  async updateMemberRole(orgId: string, memberId: string, role: Role): Promise<Member> {
    return apiRequest(`/api/v1/organizations/${orgId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  async removeMember(orgId: string, memberId: string): Promise<void> {
    await apiRequest(`/api/v1/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    })
  },

  // Project Members
  async getProjectMembers(orgId: string, projectId: string): Promise<ProjectMember[]> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/members`)
  },

  async assignProjectMember(
    orgId: string,
    projectId: string,
    userId: string,
    role: string = 'contributor',
  ): Promise<ProjectMember> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    })
  },

  async removeProjectMember(orgId: string, projectId: string, userId: string): Promise<void> {
    await apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    })
  },

  // Audit
  async getAuditEvents(orgId: string): Promise<PaginatedResponse<AuditEvent>> {
    return apiRequest(`/api/v1/organizations/${orgId}/audit-events?limit=50`)
  },

  // Business Requirements Engine & Problem Formulation
  async extractRequirements(
    orgId: string,
    projectId: string,
    problemDescription: string,
    strictTarget?: boolean,
  ): Promise<BusinessRequirement> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/requirements/extract`,
      {
        method: 'POST',
        body: JSON.stringify({
          problem_description: problemDescription,
          strict_target: !!strictTarget,
        }),
      },
    )
  },

  async getRequirements(orgId: string, projectId: string): Promise<BusinessRequirement[]> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/requirements`)
  },

  async getRequirement(orgId: string, projectId: string, reqId: string): Promise<BusinessRequirement> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/requirements/${reqId}`)
  },

  async updateRequirement(
    orgId: string,
    projectId: string,
    reqId: string,
    payload: Partial<BusinessRequirement>,
  ): Promise<BusinessRequirement> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/requirements/${reqId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    )
  },

  async confirmRequirement(
    orgId: string,
    projectId: string,
    reqId: string,
    reviewNotes?: string,
  ): Promise<{ requirement: BusinessRequirement; formulation: ProblemFormulation }> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/requirements/${reqId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ review_notes: reviewNotes || null }),
      },
    )
  },

  async rejectRequirement(
    orgId: string,
    projectId: string,
    reqId: string,
    reason: string,
  ): Promise<BusinessRequirement> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/requirements/${reqId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    )
  },

  async getFormulations(orgId: string, projectId: string): Promise<ProblemFormulation[]> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/formulations`)
  },

  async getFormulation(orgId: string, projectId: string, formulationId: string): Promise<ProblemFormulation> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/formulations/${formulationId}`)
  },

  // AutoML Experiments
  async getExperiments(orgId: string, projectId: string): Promise<PaginatedResponse<Experiment>> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/experiments?limit=50`)
  },

  async getExperiment(orgId: string, projectId: string, experimentId: string): Promise<ExperimentDetail> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}`)
  },

  async getLeaderboard(orgId: string, projectId: string, experimentId: string): Promise<ExperimentRun[]> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/leaderboard`)
  },

  async compareExperiments(
    orgId: string,
    projectId: string,
    experimentIds: string[],
  ): Promise<ExperimentComparisonResponse> {
    const ids = experimentIds.join(',')
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/compare?experiment_ids=${encodeURIComponent(ids)}`,
    )
  },

  async updateExperimentDecision(
    orgId: string,
    projectId: string,
    experimentId: string,
    decision: 'candidate' | 'approved' | 'rejected',
    notes?: string,
  ): Promise<Experiment> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/decision`,
      {
        method: 'PATCH',
        body: JSON.stringify({ decision, notes: notes ?? '' }),
      },
    )
  },

  // Explainability Endpoints
  async getExplainabilityReports(
    orgId: string,
    projectId: string,
    experimentId: string,
  ): Promise<ExplainabilityReport[]> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/explainability`,
    )
  },

  async getExplainabilityReport(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
  ): Promise<ExplainabilityReport> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/explainability/${reportId}`,
    )
  },

  async generateAINarrative(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
    payload: {
      user_context?: string
      user_assumptions?: Array<{ key: string; value: string; source: 'user_assumption' }>
    },
  ): Promise<ExplainabilityReport> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/explainability/${reportId}/narrative`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async updateUserAssumptions(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
    assumptions: Array<{ key: string; value: string; source: 'user_assumption' }>,
  ): Promise<ExplainabilityReport> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/explainability/${reportId}/assumptions`,
      {
        method: 'PUT',
        body: JSON.stringify(assumptions),
      },
    )
  },

  async runWhatIfAnalysis(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
    payload: WhatIfScenarioRequest,
  ): Promise<WhatIfScenarioResponse> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/explainability/${reportId}/what-if`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  // Senior Data Scientist Reports
  async getSeniorReports(
    orgId: string,
    projectId: string,
    experimentId: string,
  ): Promise<SeniorReportSummary[]> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/reports`,
    )
  },

  async getSeniorReport(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
  ): Promise<SeniorReportDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/reports/${reportId}`,
    )
  },

  async generateSeniorReport(
    orgId: string,
    projectId: string,
    experimentId: string,
    payload: GenerateReportRequest,
  ): Promise<SeniorReportDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/reports`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async downloadSeniorReportMarkdown(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
  ): Promise<string> {
    const token = getStoredToken()
    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/reports/${reportId}/markdown`,
      { headers },
    )
    if (!res.ok) throw new Error('Failed to download markdown report')
    return res.text()
  },

  async downloadSeniorReportHtml(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
  ): Promise<string> {
    const token = getStoredToken()
    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/reports/${reportId}/html`,
      { headers },
    )
    if (!res.ok) throw new Error('Failed to download HTML report')
    return res.text()
  },

  async downloadSeniorReportPdf(
    orgId: string,
    projectId: string,
    experimentId: string,
    reportId: string,
  ): Promise<Blob> {
    const token = getStoredToken()
    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/reports/${reportId}/pdf`,
      { headers },
    )
    if (!res.ok) throw new Error('Failed to download PDF report')
    return res.blob()
  },

  async getDeployments(orgId: string, projectId: string): Promise<DeploymentListResponse> {
    return apiRequest(`/api/v1/organizations/${orgId}/projects/${projectId}/deployments`)
  },

  async getExperimentDeployments(
    orgId: string,
    projectId: string,
    experimentId: string,
  ): Promise<DeploymentListResponse> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/deployments`,
    )
  },

  async getDeployment(
    orgId: string,
    projectId: string,
    deploymentId: string,
  ): Promise<DeploymentDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}`,
    )
  },

  async createDeployment(
    orgId: string,
    projectId: string,
    experimentId: string,
    payload: CreateDeploymentPayload,
  ): Promise<DeploymentDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/${experimentId}/deployments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async approveDeployment(
    orgId: string,
    projectId: string,
    deploymentId: string,
    notes?: string,
  ): Promise<DeploymentDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      },
    )
  },

  async rollbackDeployment(
    orgId: string,
    projectId: string,
    deploymentId: string,
    reason?: string,
  ): Promise<DeploymentDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/rollback`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    )
  },

  async stopDeployment(
    orgId: string,
    projectId: string,
    deploymentId: string,
    reason?: string,
  ): Promise<DeploymentDetail> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/stop`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    )
  },

  async predictDirectly(
    endpointUrl: string,
    predictionPath: string = '/predict',
    payload: PredictionPayload,
    apiKey?: string,
  ): Promise<PredictionResponse> {
    // DIRECT INFERENCE: Calls local serving endpoint inside client boundary.
    // Zero raw prediction data touches the cloud control plane.
    const cleanBase = endpointUrl.replace(/\/+$/, '')
    const cleanPath = predictionPath.startsWith('/') ? predictionPath : `/${predictionPath}`
    const fullUrl = `${cleanBase}${cleanPath}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers['X-API-Key'] = apiKey
    }

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      let msg = `Prediction failed with HTTP ${res.status}`
      try {
        const errJson = await res.json()
        if (errJson.detail) msg = errJson.detail
      } catch {
        // use default message
      }
      throw new Error(msg)
    }

    return res.json()
  },

  async getMonitoringSnapshots(
    orgId: string,
    projectId: string,
    deploymentId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<MonitoringSnapshotListResponse> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/monitoring/metrics?limit=${limit}&offset=${offset}`,
    )
  },

  async getMonitoringAlerts(
    orgId: string,
    projectId: string,
    deploymentId: string,
    options?: { unresolvedOnly?: boolean; severity?: string; alertType?: string; limit?: number; offset?: number },
  ): Promise<MonitoringAlertListResponse> {
    const params = new URLSearchParams()
    if (options?.unresolvedOnly !== undefined) params.set('unresolved_only', String(options.unresolvedOnly))
    if (options?.severity) params.set('severity', options.severity)
    if (options?.alertType) params.set('alert_type', options.alertType)
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))

    const query = params.toString() ? `?${params.toString()}` : ''
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/monitoring/alerts${query}`,
    )
  },

  async resolveMonitoringAlert(
    orgId: string,
    projectId: string,
    deploymentId: string,
    alertId: string,
    notes?: string,
  ): Promise<MonitoringAlert> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/monitoring/alerts/${alertId}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      },
    )
  },

  async ingestMonitoringSnapshot(
    orgId: string,
    projectId: string,
    deploymentId: string,
    snapshot: any,
  ): Promise<MonitoringSnapshot> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/deployments/${deploymentId}/monitoring/metrics`,
      {
        method: 'POST',
        body: JSON.stringify(snapshot),
      },
    )
  },

  async getLocalMonitoringMetrics(
    endpointUrl: string,
    apiKey?: string,
  ): Promise<any> {
    const cleanBase = endpointUrl.replace(/\/+$/, '')
    const fullUrl = `${cleanBase}/monitoring/metrics`
    const headers: Record<string, string> = {}
    if (apiKey) headers['X-API-Key'] = apiKey

    const res = await fetch(fullUrl, { headers })
    if (!res.ok) {
      throw new Error(`Failed to fetch local monitoring metrics (HTTP ${res.status})`)
    }
    return res.json()
  },

  async submitGroundTruthDirectly(
    endpointUrl: string,
    submissions: GroundTruthSubmission[],
    apiKey?: string,
  ): Promise<{ status: string; processed_count: number; matched_count: number }> {
    const cleanBase = endpointUrl.replace(/\/+$/, '')
    const fullUrl = `${cleanBase}/monitoring/ground-truth`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) headers['X-API-Key'] = apiKey

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ submissions }),
    })
    if (!res.ok) {
      let msg = `Ground truth submission failed with HTTP ${res.status}`
      try {
        const errJson = await res.json()
        if (errJson.detail) msg = errJson.detail
      } catch {
        // default msg
      }
      throw new Error(msg)
    }
    return res.json()
  },

  async getDatasetHealth(
    orgId: string,
    projectId: string,
    datasetId: string,
    targetColumn?: string,
    datetimeColumn?: string,
  ): Promise<DataHealthAssessment> {
    const params = new URLSearchParams()
    if (targetColumn) params.set('target_column', targetColumn)
    if (datetimeColumn) params.set('datetime_column', datetimeColumn)
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/datasets/${datasetId}/health${query}`,
    )
  },

  async analyzeDatasetHealth(
    orgId: string,
    projectId: string,
    datasetId: string,
    payload?: { target_column?: string; datetime_column?: string },
  ): Promise<DataHealthAssessment> {
    return apiRequest(
      `/api/v1/organizations/${orgId}/projects/${projectId}/datasets/${datasetId}/health/analyze`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      },
    )
  },

  // Experiments & AutoML Engine
  async runExperimentWorkflow(
    orgId: string,
    projectId: string,
    payload: {
      name: string
      dataset_version?: string
      benchmark_name?: string
      target_column?: string
      problem_type?: string
      primary_metric?: string
      business_requirements?: Record<string, unknown>
      enable_optuna?: boolean
      optuna_trials?: number
      n_splits?: number
      random_seed?: number
    },
  ): Promise<ExperimentDetail> {
    return apiRequest<ExperimentDetail>(
      `/api/v1/organizations/${orgId}/projects/${projectId}/experiments/run`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async getProjectWorkflow(orgId: string, projectId: string): Promise<ProjectWorkflowOut> {
    return apiRequest<ProjectWorkflowOut>(
      `/api/v1/organizations/${orgId}/projects/${projectId}/workflow`,
    )
  },

  async updateWorkflowMode(
    orgId: string,
    projectId: string,
    mode: WorkflowExecutionMode,
  ): Promise<ProjectWorkflowOut> {
    return apiRequest<ProjectWorkflowOut>(
      `/api/v1/organizations/${orgId}/projects/${projectId}/workflow/mode`,
      {
        method: 'PATCH',
        body: JSON.stringify({ execution_mode: mode }),
      },
    )
  },

  async overrideWorkflowStage(
    orgId: string,
    projectId: string,
    stageKey: string,
    payload: StageOverrideRequest,
  ): Promise<ProjectWorkflowOut> {
    return apiRequest<ProjectWorkflowOut>(
      `/api/v1/organizations/${orgId}/projects/${projectId}/workflow/stages/${stageKey}/override`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async advanceWorkflowStage(
    orgId: string,
    projectId: string,
    stageKey: string,
  ): Promise<ProjectWorkflowOut> {
    return apiRequest<ProjectWorkflowOut>(
      `/api/v1/organizations/${orgId}/projects/${projectId}/workflow/stages/${stageKey}/advance`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    )
  },
}





