/**
 * TypeScript type definitions for Senior Data Scientist Mode Workflow.
 * 
 * Supports 15 structured stages, 5 timeline statuses, 3 execution modes,
 * and strict provenance separation between empirical telemetry, AI reasoning,
 * and user manual decisions.
 */

export type WorkflowExecutionMode = 'automatic' | 'assisted' | 'manual'

export type WorkflowStageStatus = 'completed' | 'running' | 'needs_review' | 'blocked' | 'not_started'

export interface EvidenceItem {
  label: string
  value: any
  source: string
  provenance: 'empirically_measured'
  badge: string
  details?: string | null
}

export interface FindingItem {
  title: string
  description: string
  measured_fact?: string | null
  provenance: 'empirically_measured'
  badge: string
}

export interface RecommendationItem {
  title: string
  rationale: string
  suggested_action: string
  provenance: 'ai_generated'
  badge: string
}

export interface UserDecision {
  decision: 'accepted' | 'overridden' | 'rejected' | 'pending'
  overridden_recommendation?: string | null
  custom_parameters: Record<string, any>
  user_decision_notes?: string | null
  updated_at?: string | null
  decided_by_email?: string | null
  provenance: 'user_override'
  badge: string
}

export interface WorkflowStage {
  stage_key: string
  stage_index: number // 1 to 15
  title: string
  category: string
  status: WorkflowStageStatus
  what_was_analyzed: string[]
  evidence: EvidenceItem[]
  findings: FindingItem[]
  recommendations: RecommendationItem[]
  user_decisions: UserDecision
  is_overridden: boolean
  can_advance: boolean
  blockers: string[]
  artifact_link?: string | null
}

export interface ProjectWorkflowOut {
  project_id: string
  organization_id: string
  project_name: string
  execution_mode: WorkflowExecutionMode
  current_stage_key: string
  current_stage_index: number
  stages: WorkflowStage[]
  summary: {
    completed: number
    running: number
    needs_review: number
    blocked: number
    not_started: number
  }
  updated_at: string
}

export interface StageOverrideRequest {
  decision: 'accepted' | 'overridden' | 'rejected'
  overridden_recommendation?: string | null
  custom_parameters?: Record<string, any>
  user_decision_notes?: string | null
  status?: WorkflowStageStatus | null
}

export interface ModeUpdateRequest {
  execution_mode: WorkflowExecutionMode
}

export interface StageAdvanceRequest {
  target_stage_key?: string | null
}
