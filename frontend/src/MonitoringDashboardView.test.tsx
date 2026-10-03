import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { MonitoringDashboardView } from './MonitoringDashboardView'
import type { DeploymentDetail } from './deploymentTypes'
import type {
  MonitoringAlert,
  MonitoringAlertListResponse,
  MonitoringSnapshot,
  MonitoringSnapshotListResponse,
} from './monitoringTypes'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMonitoringSnapshots: vi.fn(),
      getMonitoringAlerts: vi.fn(),
      resolveMonitoringAlert: vi.fn(),
      ingestMonitoringSnapshot: vi.fn(),
      getLocalMonitoringMetrics: vi.fn(),
      submitGroundTruthDirectly: vi.fn(),
    },
  }
})

const mockDeployment: DeploymentDetail = {
  id: 'dep-999',
  organization_id: 'org-111',
  project_id: 'proj-222',
  experiment_id: 'exp-333',
  name: 'Fraud Detection Inference Server',
  model_name: 'XGBoost',
  model_version: 'v1.0.0',
  deployment_type: 'local',
  endpoint_url: 'http://localhost:8080',
  prediction_path: '/predict',
  status: 'active',
  problem_type: 'classification',
  target_name: 'is_fraud',
  primary_metric: 'roc_auc',
  input_schema: [
    { name: 'amount', dtype: 'numeric' },
    { name: 'hour', dtype: 'numeric' },
  ],
  notes: 'Client isolated data plane inference',
  auth_configured: false,
  approved_by_user_id: 'user-001',
  created_by_user_id: 'user-001',
  created_at: '2026-09-26T12:00:00Z',
  updated_at: '2026-09-26T12:00:00Z',
  approved_at: '2026-09-26T12:00:00Z',
}

const mockSnapshot: MonitoringSnapshot = {
  id: 'snap-001',
  organization_id: 'org-111',
  project_id: 'proj-222',
  deployment_id: 'dep-999',
  period_start: '2026-09-26T10:00:00Z',
  period_end: '2026-09-26T11:00:00Z',
  total_requests: 120,
  throughput_rps: 3.5,
  error_count: 1,
  error_rate: 0.0083,
  latency_p50_ms: 11.2,
  latency_p95_ms: 28.4,
  latency_p99_ms: 45.0,
  data_drift_score: 0.50,
  data_drift_detected: true,
  metrics: { roc_auc: 0.892 },
  prediction_distribution: {
    total_predictions: 120,
    class_counts: { '0': 114, '1': 6 },
    class_proportions: { '0': 0.95, '1': 0.05 },
  },
  feature_drifts: [
    {
      feature_name: 'amount',
      dtype: 'numerical',
      method: 'ks_test',
      statistic: 0.31,
      p_value: 0.001,
      drift_detected: true,
      severity: 'critical',
      baseline_stats: { mean: 150.0 },
      current_stats: { mean: 420.0 },
    },
    {
      feature_name: 'hour',
      dtype: 'numerical',
      method: 'ks_test',
      statistic: 0.04,
      p_value: 0.85,
      drift_detected: false,
      severity: 'none',
      baseline_stats: { mean: 14.2 },
      current_stats: { mean: 14.5 },
    },
  ],
  created_at: '2026-09-26T11:00:05Z',
}

const mockAlerts: MonitoringAlert[] = [
  {
    id: 'alt-001',
    organization_id: 'org-111',
    project_id: 'proj-222',
    deployment_id: 'dep-999',
    snapshot_id: 'snap-001',
    alert_type: 'feature_drift',
    severity: 'critical',
    message: "Critical drift detected in feature 'amount' (p-value: 0.0010)",
    feature_name: 'amount',
    metric_name: 'ks_statistic',
    threshold: 0.05,
    current_value: 0.31,
    is_resolved: false,
    created_at: '2026-09-26T11:00:05Z',
  },
]

describe('MonitoringDashboardView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMonitoringSnapshots).mockResolvedValue({
      items: [mockSnapshot],
      total: 1,
    } as MonitoringSnapshotListResponse)
    vi.mocked(api.getMonitoringAlerts).mockResolvedValue({
      items: mockAlerts,
      total: 1,
    } as MonitoringAlertListResponse)
  })

  it('renders privacy guarantee banner and kpi summary cards', async () => {
    render(
      <MonitoringDashboardView
        orgId="org-111"
        projectId="proj-222"
        deployment={mockDeployment}
      />,
    )

    // Privacy banner check
    expect(screen.getByText('Zero Raw Inference Data Transmitted')).toBeDefined()
    expect(
      screen.getByText(/All feature distributions, KS-tests, PSI calculations, and prediction evaluations run strictly inside the Client Data Plane/),
    ).toBeDefined()

    // KPI values
    await waitFor(() => {
      expect(screen.getByText('120')).toBeDefined() // Inferences
      expect(screen.getByText('11.2ms')).toBeDefined() // Latency p50
      expect(screen.getByText('50%')).toBeDefined() // Dataset drift
      expect(screen.getByText('⚠️ Drift Detected')).toBeDefined()
      expect(screen.getByText('0.8920')).toBeDefined() // Ground truth roc_auc
    })
  })

  it('navigates to feature drift tab and renders statistical breakdown', async () => {
    render(
      <MonitoringDashboardView
        orgId="org-111"
        projectId="proj-222"
        deployment={mockDeployment}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('120')).toBeDefined()
    })

    const driftTabBtn = screen.getByText(/Feature Drift Analysis/)
    fireEvent.click(driftTabBtn)

    expect(screen.getByText('Feature-Level Drift Diagnostics')).toBeDefined()
    expect(screen.getByText('amount')).toBeDefined()
    expect(screen.getByText('🔴 CRITICAL')).toBeDefined()
    expect(screen.getByText('hour')).toBeDefined()
    expect(screen.getByText('🟢 STABLE')).toBeDefined()
  })

  it('navigates to alerts tab and resolves active alert', async () => {
    vi.mocked(api.resolveMonitoringAlert).mockResolvedValue({
      ...mockAlerts[0],
      is_resolved: true,
      resolved_at: '2026-09-26T11:15:00Z',
    })

    render(
      <MonitoringDashboardView
        orgId="org-111"
        projectId="proj-222"
        deployment={mockDeployment}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/Alerts \(1 Active\)/)).toBeDefined()
    })

    const alertsTabBtn = screen.getByText(/Alerts \(1 Active\)/)
    fireEvent.click(alertsTabBtn)

    expect(screen.getByText("Critical drift detected in feature 'amount' (p-value: 0.0010)")).toBeDefined()

    const resolveBtn = screen.getByText('Resolve')
    fireEvent.click(resolveBtn)

    // Fill note and confirm
    const notesInput = screen.getByPlaceholderText(/Add resolution or investigation notes/)
    fireEvent.change(notesInput, { target: { value: 'Verified expected seasonal shift' } })

    const confirmBtn = screen.getByText('Confirm Resolution')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(api.resolveMonitoringAlert).toHaveBeenCalledWith(
        'org-111',
        'proj-222',
        'dep-999',
        'alt-001',
        'Verified expected seasonal shift',
      )
    })
  })

  it('submits ground truth labels to local serving engine', async () => {
    vi.mocked(api.submitGroundTruthDirectly).mockResolvedValue({
      status: 'ok',
      processed_count: 1,
      matched_count: 1,
    })

    render(
      <MonitoringDashboardView
        orgId="org-111"
        projectId="proj-222"
        deployment={mockDeployment}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('120')).toBeDefined()
    })

    const gtTabBtn = screen.getByText(/Ground Truth Ingestion/)
    fireEvent.click(gtTabBtn)

    expect(screen.getByText('Ground Truth Label Ingestion & Evaluation')).toBeDefined()

    const reqIdInput = screen.getByPlaceholderText('e.g. req-12345')
    const actualInput = screen.getByPlaceholderText('e.g. 1 or 0 or continuous float')

    fireEvent.change(reqIdInput, { target: { value: 'req-42' } })
    fireEvent.change(actualInput, { target: { value: '1' } })

    const submitBtn = screen.getByText('🎯 Submit & Evaluate Performance')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(api.submitGroundTruthDirectly).toHaveBeenCalledWith(
        'http://localhost:8080',
        [{ request_id: 'req-42', actual: 1 }],
        undefined,
      )
    })
  })
})
