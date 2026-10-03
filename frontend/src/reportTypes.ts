// Senior Data Scientist Report Types

export interface ReportSection {
  section_number: number
  key: string
  title: string
  verified_facts: Record<string, unknown>
  content_markdown: string
  source: string // 'measured_result' | 'ai_interpretation' | 'user_assumption' | 'composite'
}

export interface SeniorReportSummary {
  id: string
  organization_id: string
  project_id: string
  experiment_id: string
  version: number
  title: string
  executive_summary: string
  has_ai_synthesis: boolean
  provenance_verified: boolean
  created_at: string
  updated_at: string
}

export interface SeniorReportDetail {
  id: string
  organization_id: string
  project_id: string
  experiment_id: string
  version: number
  title: string
  executive_summary: string
  sections: ReportSection[]
  markdown_content: string
  verified_artifacts: Record<string, unknown>
  has_ai_synthesis: boolean
  provenance_verified: boolean
  created_at: string
  updated_at: string
}

export interface GenerateReportRequest {
  title?: string
  include_ai_synthesis?: boolean
  user_context?: string
}
