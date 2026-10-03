import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import SeniorDataScientistWorkflowView from './SeniorDataScientistWorkflowView'
import type { Project } from './types'
import type { ProjectWorkflowOut } from './workflowTypes'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      getProjectWorkflow: vi.fn(),
      updateWorkflowMode: vi.fn(),
      overrideWorkflowStage: vi.fn(),
      advanceWorkflowStage: vi.fn(),
    },
  }
})

const mockProject: Project = {
  id: 'proj-sds-001',
  organization_id: 'org-test-123',
  name: 'Customer Retention Initiative',
  purpose: 'Identify and mitigate churn risk',
  classification: 'internal',
  status: 'active',
  owner_user_id: 'user-001',
  created_at: '2026-09-29T10:00:00Z',
  updated_at: '2026-09-29T10:00:00Z',
}

const mockWorkflowData: ProjectWorkflowOut = {
  project_id: 'proj-sds-001',
  organization_id: 'org-test-123',
  project_name: 'Customer Retention Initiative',
  execution_mode: 'assisted',
  current_stage_key: 'business_understanding',
  current_stage_index: 1,
  summary: {
    completed: 1,
    running: 0,
    needs_review: 2,
    blocked: 0,
    not_started: 12,
  },
  updated_at: '2026-09-29T12:00:00Z',
  stages: [
    {
      stage_key: 'business_understanding',
      stage_index: 1,
      title: 'Business Understanding',
      category: 'Strategy & Scoping',
      status: 'completed',
      what_was_analyzed: [
        'Commercial objective definition and success threshold',
        'Cost asymmetry: False Positives vs False Negatives',
      ],
      evidence: [
        {
          label: 'Business Objective',
          value: 'Reduce customer churn by identifying at-risk accounts',
          source: 'BusinessRequirement',
          provenance: 'empirically_measured',
          badge: '[EMPIRICALLY MEASURED]',
        },
      ],
      findings: [
        {
          title: 'Scope Formulated',
          description: 'Target defined as churn; prediction horizon 30 days.',
          measured_fact: 'Target: churn',
          provenance: 'empirically_measured',
          badge: '[EMPIRICALLY MEASURED]',
        },
      ],
      recommendations: [
        {
          title: 'Metric Alignment Strategy',
          rationale: 'Prioritize Recall over Precision to minimize missed churners.',
          suggested_action: 'Configure primary metric as Recall.',
          provenance: 'ai_generated',
          badge: '[AI RATIONALE]',
        },
      ],
      user_decisions: {
        decision: 'accepted',
        overridden_recommendation: null,
        custom_parameters: {},
        user_decision_notes: 'Aligned with retention strategy.',
        updated_at: '2026-09-29T11:00:00Z',
        decided_by_email: 'lead_ds@datapilot.io',
        provenance: 'user_override',
        badge: '[USER DECISION]',
      },
      is_overridden: false,
      can_advance: true,
      blockers: [],
    },
    {
      stage_key: 'data_understanding',
      stage_index: 2,
      title: 'Data Understanding',
      category: 'Data Hygiene',
      status: 'needs_review',
      what_was_analyzed: ['Dataset schema and volume screening'],
      evidence: [
        {
          label: 'Sample Count',
          value: '7,043 rows',
          source: 'Dataset Profile',
          provenance: 'empirically_measured',
          badge: '[EMPIRICALLY MEASURED]',
        },
      ],
      findings: [
        {
          title: 'Dimensions Verified',
          description: 'Verified 7,043 records across 21 columns.',
          provenance: 'empirically_measured',
          badge: '[EMPIRICALLY MEASURED]',
        },
      ],
      recommendations: [
        {
          title: 'Data Validation',
          rationale: 'Check for missingness in TotalCharges feature.',
          suggested_action: 'Proceed to Data Quality hygiene.',
          provenance: 'ai_generated',
          badge: '[AI RATIONALE]',
        },
      ],
      user_decisions: {
        decision: 'pending',
        custom_parameters: {},
        provenance: 'user_override',
        badge: '[USER DECISION]',
      },
      is_overridden: false,
      can_advance: true,
      blockers: [],
    },
    { stage_key: 'data_quality', stage_index: 3, title: 'Data Quality', category: 'Data Hygiene', status: 'not_started', what_was_analyzed: ['Missing value audits'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'exploratory_analysis', stage_index: 4, title: 'Exploratory Analysis', category: 'Data Hygiene', status: 'not_started', what_was_analyzed: ['Correlation vectors'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'problem_formulation', stage_index: 5, title: 'Problem Formulation', category: 'Strategy & Scoping', status: 'not_started', what_was_analyzed: ['ML task formalization'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'feature_engineering', stage_index: 6, title: 'Feature Engineering', category: 'Modeling & Validation', status: 'not_started', what_was_analyzed: ['Transformers and encoders'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'baseline', stage_index: 7, title: 'Baseline', category: 'Modeling & Validation', status: 'needs_review', what_was_analyzed: ['Dummy majority classifier'], evidence: [{ label: 'Baseline Score', value: '0.5200', source: 'Baseline Run', provenance: 'empirically_measured', badge: '[EMPIRICALLY MEASURED]' }], findings: [{ title: 'Floor established', description: 'Majority baseline scored 0.5200.', provenance: 'empirically_measured', badge: '[EMPIRICALLY MEASURED]' }], recommendations: [{ title: 'Hurdle Threshold', rationale: 'Require +15% hurdle over baseline.', suggested_action: 'Set minimum hurdle to 0.60.', provenance: 'ai_generated', badge: '[AI RATIONALE]' }], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: true, blockers: [] },
    { stage_key: 'candidate_models', stage_index: 8, title: 'Candidate Models', category: 'Modeling & Validation', status: 'not_started', what_was_analyzed: ['Model families benchmark'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'cross_validation', stage_index: 9, title: 'Cross Validation', category: 'Modeling & Validation', status: 'not_started', what_was_analyzed: ['Fold variance'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'hyperparameter_optimization', stage_index: 10, title: 'Hyperparameter Optimization', category: 'Modeling & Validation', status: 'not_started', what_was_analyzed: ['Optuna trials'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'error_analysis', stage_index: 11, title: 'Error Analysis', category: 'Diagnostics & Explainability', status: 'not_started', what_was_analyzed: ['Confusion matrix FP/FN breakdown'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'explainability', stage_index: 12, title: 'Explainability', category: 'Diagnostics & Explainability', status: 'not_started', what_was_analyzed: ['Global SHAP summary'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'model_selection', stage_index: 13, title: 'Model Selection', category: 'Diagnostics & Explainability', status: 'not_started', what_was_analyzed: ['Pareto trade-offs'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'deployment', stage_index: 14, title: 'Deployment', category: 'Production Governance', status: 'not_started', what_was_analyzed: ['Endpoint serving declaration'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
    { stage_key: 'monitoring', stage_index: 15, title: 'Monitoring', category: 'Production Governance', status: 'not_started', what_was_analyzed: ['Inference latency & feature drift'], evidence: [], findings: [], recommendations: [], user_decisions: { decision: 'pending', custom_parameters: {}, provenance: 'user_override', badge: '[USER DECISION]' }, is_overridden: false, can_advance: false, blockers: [] },
  ],
}

describe('SeniorDataScientistWorkflowView Component', () => {
  const mockOnBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('datapilot_access_token', 'mock-token')
    vi.mocked(api.getMe).mockResolvedValue({
      id: 'user-001',
      email: 'lead_ds@datapilot.io',
      display_name: 'Lead Data Scientist',
      is_active: true,
      role: 'data_scientist',
      organization_id: 'org-test-123',
      permissions: ['PROJECT_VIEW', 'PROJECT_UPDATE'],
      organizations: [
        {
          organization_id: 'org-test-123',
          organization_name: 'Acme AI Corp',
          role: 'data_scientist',
          permissions: ['PROJECT_VIEW', 'PROJECT_UPDATE'],
        },
      ],
    } as any)

    vi.mocked(api.getProjectWorkflow).mockResolvedValue(mockWorkflowData)
  })

  it('renders all 15 stages in the timeline and displays provenance badges', async () => {
    render(
      <AuthProvider>
        <SeniorDataScientistWorkflowView project={mockProject} onBack={mockOnBack} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('🧑‍🔬 Senior Data Scientist Mode')).toBeInTheDocument()
    })

    // Verify all 15 stages are rendered
    expect(screen.getByText('1. Business Understanding')).toBeInTheDocument()
    expect(screen.getByText('2. Data Understanding')).toBeInTheDocument()
    expect(screen.getByText('3. Data Quality')).toBeInTheDocument()
    expect(screen.getByText('4. Exploratory Analysis')).toBeInTheDocument()
    expect(screen.getByText('5. Problem Formulation')).toBeInTheDocument()
    expect(screen.getByText('6. Feature Engineering')).toBeInTheDocument()
    expect(screen.getByText('7. Baseline')).toBeInTheDocument()
    expect(screen.getByText('8. Candidate Models')).toBeInTheDocument()
    expect(screen.getByText('9. Cross Validation')).toBeInTheDocument()
    expect(screen.getByText('10. Hyperparameter Optimization')).toBeInTheDocument()
    expect(screen.getByText('11. Error Analysis')).toBeInTheDocument()
    expect(screen.getByText('12. Explainability')).toBeInTheDocument()
    expect(screen.getByText('13. Model Selection')).toBeInTheDocument()
    expect(screen.getByText('14. Deployment')).toBeInTheDocument()
    expect(screen.getByText('15. Monitoring')).toBeInTheDocument()

    // Verify provenance banners & badges
    expect(screen.getAllByText(/\[EMPIRICALLY MEASURED\]/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\[AI RATIONALE\]/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\[USER DECISION\]/).length).toBeGreaterThan(0)

    // Verify 5 inspection sections
    expect(screen.getByText('What Was Analyzed')).toBeInTheDocument()
    expect(screen.getByText('Evidence (Empirical Telemetry)')).toBeInTheDocument()
    expect(screen.getByText('Findings (Empirical Outcomes)')).toBeInTheDocument()
    expect(screen.getByText('Recommendations (AI Peer Guidance)')).toBeInTheDocument()
    expect(screen.getByText('User Decisions & Overrides')).toBeInTheDocument()
  })

  it('supports switching between Automatic, Assisted, and Manual execution modes', async () => {
    const updatedAuto = { ...mockWorkflowData, execution_mode: 'automatic' as const }
    vi.mocked(api.updateWorkflowMode).mockResolvedValue(updatedAuto)

    render(
      <AuthProvider>
        <SeniorDataScientistWorkflowView project={mockProject} onBack={mockOnBack} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('🧑‍🔬 Senior Data Scientist Mode')).toBeInTheDocument()
    })

    const autoBtn = screen.getByRole('button', { name: /Automatic/i })
    fireEvent.click(autoBtn)

    await waitFor(() => {
      expect(api.updateWorkflowMode).toHaveBeenCalledWith('org-test-123', 'proj-sds-001', 'automatic')
    })
  })

  it('allows clicking different timeline stages to inspect details', async () => {
    render(
      <AuthProvider>
        <SeniorDataScientistWorkflowView project={mockProject} onBack={mockOnBack} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('1. Business Understanding')).toBeInTheDocument()
    })

    // Click on Stage 7. Baseline
    const baselineTimelineBtn = screen.getByText('7. Baseline')
    fireEvent.click(baselineTimelineBtn)

    await waitFor(() => {
      expect(screen.getByText('Stage 7 of 15')).toBeInTheDocument()
      expect(screen.getByText('0.5200')).toBeInTheDocument() // baseline score
      expect(screen.getByText('Hurdle Threshold')).toBeInTheDocument()
    })
  })

  it('allows practitioner manual override with custom recommendation and parameters', async () => {
    const overriddenWorkflow = {
      ...mockWorkflowData,
      stages: mockWorkflowData.stages.map((s) =>
        s.stage_key === 'business_understanding'
          ? {
              ...s,
              is_overridden: true,
              user_decisions: {
                decision: 'overridden' as const,
                overridden_recommendation: 'Prioritize Precision over Recall for regulatory compliance',
                custom_parameters: { threshold: 0.65 },
                user_decision_notes: 'Approved by Model Risk Committee',
                provenance: 'user_override' as const,
                badge: '[USER DECISION]',
              },
            }
          : s,
      ),
    }

    vi.mocked(api.overrideWorkflowStage).mockResolvedValue(overriddenWorkflow)

    render(
      <AuthProvider>
        <SeniorDataScientistWorkflowView project={mockProject} onBack={mockOnBack} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('1. Business Understanding')).toBeInTheDocument()
    })

    // Open override form
    const overrideBtn = screen.getByRole('button', { name: /Manual Override \/ Decision/i })
    fireEvent.click(overrideBtn)

    expect(screen.getByText('🧑‍💻 Practitioner Decision & Manual Override')).toBeInTheDocument()

    const overrideRadio = screen.getByLabelText(/Override with Custom Rationale/i)
    fireEvent.click(overrideRadio)

    const recInput = screen.getByPlaceholderText(/e.g. Enforce custom decision threshold/i)
    fireEvent.change(recInput, { target: { value: 'Prioritize Precision over Recall for regulatory compliance' } })

    const notesInput = screen.getByPlaceholderText(/Justification recorded to audit log/i)
    fireEvent.change(notesInput, { target: { value: 'Approved by Model Risk Committee' } })

    const saveBtn = screen.getByRole('button', { name: /Save Practitioner Override/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(api.overrideWorkflowStage).toHaveBeenCalledWith(
        'org-test-123',
        'proj-sds-001',
        'business_understanding',
        expect.objectContaining({
          decision: 'overridden',
          overridden_recommendation: 'Prioritize Precision over Recall for regulatory compliance',
          user_decision_notes: 'Approved by Model Risk Committee',
        }),
      )
    })
  })

  it('allows advancing workflow stages', async () => {
    const advancedWorkflow = {
      ...mockWorkflowData,
      current_stage_key: 'data_understanding',
      current_stage_index: 2,
    }
    vi.mocked(api.advanceWorkflowStage).mockResolvedValue(advancedWorkflow)

    render(
      <AuthProvider>
        <SeniorDataScientistWorkflowView project={mockProject} onBack={mockOnBack} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('1. Business Understanding')).toBeInTheDocument()
    })

    const advanceBtn = screen.getByRole('button', { name: /Confirm & Advance Stage/i })
    fireEvent.click(advanceBtn)

    await waitFor(() => {
      expect(api.advanceWorkflowStage).toHaveBeenCalledWith(
        'org-test-123',
        'proj-sds-001',
        'business_understanding',
      )
    })
  })
})
