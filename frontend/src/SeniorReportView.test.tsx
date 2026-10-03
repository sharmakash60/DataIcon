import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AuthProvider } from './AuthContext'
import SeniorReportView from './SeniorReportView'
import type { SeniorReportDetail, SeniorReportSummary } from './reportTypes'
import type { Project } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(),
      getSeniorReports: vi.fn(),
      getSeniorReport: vi.fn(),
      generateSeniorReport: vi.fn(),
      downloadSeniorReportMarkdown: vi.fn(),
      downloadSeniorReportHtml: vi.fn(),
      downloadSeniorReportPdf: vi.fn(),
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

const mockSummary: SeniorReportSummary = {
  id: 'rep-001',
  organization_id: 'org-456',
  project_id: 'proj-123',
  experiment_id: 'exp-001',
  version: 1,
  title: 'Senior Data Scientist Report: Fraud Detection Benchmark (v1)',
  executive_summary: 'Selected production candidate is CatBoost with ROC_AUC = 0.9421',
  has_ai_synthesis: true,
  provenance_verified: true,
  created_at: '2026-09-26T14:00:00Z',
  updated_at: '2026-09-26T14:00:00Z',
}

const mockDetail: SeniorReportDetail = {
  id: 'rep-001',
  organization_id: 'org-456',
  project_id: 'proj-123',
  experiment_id: 'exp-001',
  version: 1,
  title: 'Senior Data Scientist Report: Fraud Detection Benchmark (v1)',
  executive_summary: 'Selected production candidate is CatBoost with ROC_AUC = 0.9421',
  sections: [
    {
      section_number: 1,
      key: 'executive_summary',
      title: '1. Executive Summary',
      verified_facts: { best_model: 'CatBoostClassifier', best_score: 0.9421 },
      content_markdown: '> **[MEASURED RESULT]** ROC_AUC = 0.9421 across 12,500 samples.\n### High-Level Summary\nSelected candidate is CatBoostClassifier with ROC_AUC = 0.9421.',
      source: 'composite',
    },
    {
      section_number: 2,
      key: 'business_understanding',
      title: '2. Business Understanding',
      verified_facts: {},
      content_markdown: '> **[USER-PROVIDED ASSUMPTION]** Predict fraud within 30 days.\n### Business Objectives\nPredict fraud within 30 days.',
      source: 'user_assumption',
    },
    {
      section_number: 3,
      key: 'problem_formulation',
      title: '3. Problem Formulation',
      verified_facts: {},
      content_markdown: '### Mathematical Formulation\nBinary classification target.',
      source: 'measured_result',
    },
    {
      section_number: 10,
      key: 'baseline',
      title: '10. Baseline',
      verified_facts: {},
      content_markdown: '### Baseline Reference\nLogistic Regression ROC_AUC = 0.5210.',
      source: 'measured_result',
    },
    {
      section_number: 15,
      key: 'model_comparison',
      title: '15. Model Comparison',
      verified_facts: {},
      content_markdown: '### Candidate Leaderboard\nCatBoost rank #1 with 0.9421.',
      source: 'measured_result',
    },
    {
      section_number: 17,
      key: 'explainability',
      title: '17. Explainability',
      verified_facts: {},
      content_markdown: '### SHAP Attributions\nTransaction amount is top driver.',
      source: 'measured_result',
    },
    {
      section_number: 21,
      key: 'deployment_recommendation',
      title: '21. Deployment Recommendation',
      verified_facts: {},
      content_markdown: '> **[AI INTERPRETATION]** Canary rollout recommended.\n### Staged Rollout\n10% canary to 100%.',
      source: 'ai_interpretation',
    },
    {
      section_number: 22,
      key: 'monitoring_recommendation',
      title: '22. Monitoring Recommendation',
      verified_facts: {},
      content_markdown: '> **[AI INTERPRETATION]** Monitor PSI > 0.20.\n### Data Drift\nTrack PSI across top features.',
      source: 'ai_interpretation',
    },
    {
      section_number: 23,
      key: 'reproducibility_information',
      title: '23. Reproducibility Information',
      verified_facts: {},
      content_markdown: '> **[MEASURED RESULT]** Random seed: 42.\n### Environment Specs\nPython 3.12.',
      source: 'measured_result',
    },
  ],
  markdown_content: '# Senior Data Scientist Report\n\nExecutive Summary...',
  verified_artifacts: {},
  has_ai_synthesis: true,
  provenance_verified: true,
  created_at: '2026-09-26T14:00:00Z',
  updated_at: '2026-09-26T14:00:00Z',
}

describe('SeniorReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('datapilot_access_token', 'fake-jwt')
    localStorage.setItem('datapilot_active_org', 'org-456')

    vi.mocked(api.getMe).mockResolvedValue({
      user: {
        id: 'user-001',
        email: 'lead_ds@biotech.org',
        display_name: 'Lead Data Scientist',
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

    vi.mocked(api.getSeniorReports).mockResolvedValue([mockSummary])
    vi.mocked(api.getSeniorReport).mockResolvedValue(mockDetail)
  })

  it('renders report document with table of contents and verified guarantee', async () => {
    render(
      <AuthProvider>
        <SeniorReportView
          project={mockProject}
          experimentId="exp-001"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Senior Data Scientist Report Generator')).toBeInTheDocument()
    })

    // Check provenance banner
    expect(screen.getByText(/Senior Data Scientist Integrity & Provenance Guarantee/i)).toBeInTheDocument()
    expect(screen.getByText(/VERIFIED FACT-GROUNDED/i)).toBeInTheDocument()

    // Check report title and sections
    await waitFor(() => {
      expect(screen.getByText('Senior Data Scientist Report: Fraud Detection Benchmark (v1)')).toBeInTheDocument()
    })

    expect(screen.getAllByText('1. Executive Summary').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('2. Business Understanding').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('10. Baseline').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('15. Model Comparison').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('17. Explainability').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('21. Deployment Recommendation').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('22. Monitoring Recommendation').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('23. Reproducibility Information').length).toBeGreaterThanOrEqual(1)

    // Check export buttons (Markdown, HTML, PDF, Print)
    expect(screen.getByRole('button', { name: /Download \.md/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download \.html/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download \.pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Print/i })).toBeInTheDocument()

    // Check version indicator
    expect(screen.getByText('v1')).toBeInTheDocument()
  })

  it('opens generate modal and triggers compilation', async () => {
    render(
      <AuthProvider>
        <SeniorReportView
          project={mockProject}
          experimentId="exp-001"
          onBack={vi.fn()}
        />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Senior Data Scientist Report Generator')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Generate Full Senior Report/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Compiles a comprehensive 23-section technical report/i)).toBeInTheDocument()
  })
})
