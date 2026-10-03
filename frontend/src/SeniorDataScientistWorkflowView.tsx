import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import type { Project } from './types'
import type {
  ProjectWorkflowOut,
  WorkflowExecutionMode,
  WorkflowStage,
  WorkflowStageStatus,
} from './workflowTypes'

interface SeniorDataScientistWorkflowViewProps {
  project: Project
  onBack: () => void
}

export default function SeniorDataScientistWorkflowView({
  project,
  onBack,
}: SeniorDataScientistWorkflowViewProps) {
  const { activeOrg } = useAuth()
  const orgId = activeOrg?.organization_id || project.organization_id

  const [workflow, setWorkflow] = useState<ProjectWorkflowOut | null>(null)
  const [selectedStageKey, setSelectedStageKey] = useState<string>('business_understanding')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Override Form State
  const [overrideDecision, setOverrideDecision] = useState<'accepted' | 'overridden' | 'rejected'>('overridden')
  const [overrideRecommendation, setOverrideRecommendation] = useState<string>('')
  const [overrideNotes, setOverrideNotes] = useState<string>('')
  const [customParamsJson, setCustomParamsJson] = useState<string>('{}')
  const [showOverrideForm, setShowOverrideForm] = useState<boolean>(false)

  const loadWorkflow = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getProjectWorkflow(orgId, project.id)
      setWorkflow(data)
      if (data.current_stage_key) {
        setSelectedStageKey(data.current_stage_key)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project workflow')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkflow()
  }, [orgId, project.id])

  const handleModeChange = async (newMode: WorkflowExecutionMode) => {
    if (!orgId) return
    setActionLoading(true)
    setActionSuccess(null)
    setError(null)
    try {
      const updated = await api.updateWorkflowMode(orgId, project.id, newMode)
      setWorkflow(updated)
      setActionSuccess(`Workflow execution mode updated to ${newMode.toUpperCase()} Mode.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update workflow mode')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStageOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !selectedStage) return
    setActionLoading(true)
    setError(null)
    setActionSuccess(null)

    let parsedParams = {}
    try {
      parsedParams = customParamsJson.trim() ? JSON.parse(customParamsJson) : {}
    } catch {
      setError('Custom parameters must be valid JSON.')
      setActionLoading(false)
      return
    }

    try {
      const updated = await api.overrideWorkflowStage(orgId, project.id, selectedStage.stage_key, {
        decision: overrideDecision,
        overridden_recommendation: overrideRecommendation.trim() || undefined,
        custom_parameters: parsedParams,
        user_decision_notes: overrideNotes.trim() || undefined,
        status: overrideDecision === 'rejected' ? 'blocked' : 'completed',
      })
      setWorkflow(updated)
      setShowOverrideForm(false)
      setActionSuccess(`Stage '${selectedStage.title}' decision recorded as ${overrideDecision.toUpperCase()}.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record stage decision override')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAdvanceStage = async () => {
    if (!orgId || !selectedStage) return
    setActionLoading(true)
    setError(null)
    setActionSuccess(null)
    try {
      const updated = await api.advanceWorkflowStage(orgId, project.id, selectedStage.stage_key)
      setWorkflow(updated)
      if (updated.current_stage_key) {
        setSelectedStageKey(updated.current_stage_key)
      }
      setActionSuccess(`Stage '${selectedStage.title}' advanced successfully.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to advance workflow stage')
    } finally {
      setActionLoading(false)
    }
  }

  const stages = workflow?.stages || []
  const selectedStage: WorkflowStage | undefined =
    stages.find((s) => s.stage_key === selectedStageKey) || stages[0]

  const getStatusBadge = (status: WorkflowStageStatus) => {
    switch (status) {
      case 'completed':
        return <span className="status-badge status-completed" id={`status-${status}`}>✓ Completed</span>
      case 'running':
        return <span className="status-badge status-running" id={`status-${status}`}>● Running</span>
      case 'needs_review':
        return <span className="status-badge status-needs-review" id={`status-${status}`}>⚠ Needs Review</span>
      case 'blocked':
        return <span className="status-badge status-blocked" id={`status-${status}`}>✕ Blocked</span>
      case 'not_started':
      default:
        return <span className="status-badge status-not-started" id={`status-${status}`}>○ Not Started</span>
    }
  }

  const getModeDescription = (mode: WorkflowExecutionMode) => {
    switch (mode) {
      case 'automatic':
        return 'Autonomous pipeline progression using rigorous defaults. Execution pauses only on hard blockers or security gates.'
      case 'assisted':
        return 'AI acts as a peer advisor with reasoning, loss suggestions, and metric advice. Practitioner approves or edits each stage.'
      case 'manual':
        return 'Full practitioner command. Automated heuristics are deferred; parameter entries and stage runs require explicit triggers.'
    }
  }

  return (
    <div className="sds-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Breadcrumb & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <button
              className="btn-secondary btn-sm"
              id="btn-back-to-projects"
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              &larr; Back to Projects
            </button>
            <span style={{ color: '#64748b' }}>/</span>
            <span style={{ color: '#829F80', fontWeight: 600 }}>{project.name}</span>
            <span className="badge" style={{ background: '#f2f6f1', color: '#385036', border: '1px solid #dbe5da' }}>
              {project.classification}
            </span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            🧑‍🔬 Senior Data Scientist Mode
          </h2>
          <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.95rem' }}>
            Structured 15-stage Data Science workflow timeline with verifiable telemetry, AI rationale, and practitioner overrides.
          </p>
        </div>

        {/* Execution Mode Selector */}
        <div className="card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #dbe5da', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: '#576856', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Execution Mode:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['automatic', 'assisted', 'manual'] as WorkflowExecutionMode[]).map((mode) => (
                <button
                  key={mode}
                  id={`mode-btn-${mode}`}
                  disabled={actionLoading}
                  onClick={() => handleModeChange(mode)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: workflow?.execution_mode === mode ? '#829F80' : '#f8faf7',
                    color: workflow?.execution_mode === mode ? '#ffffff' : '#475569',
                    border: workflow?.execution_mode === mode ? '1px solid #718d6f' : '1px solid #dbe5da',
                  }}
                >
                  {mode === 'automatic' && '⚡ Automatic'}
                  {mode === 'assisted' && '🤝 Assisted'}
                  {mode === 'manual' && '🛠️ Manual/Advanced'}
                </button>
              ))}
            </div>
          </div>
          {workflow && (
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px', maxWidth: '380px' }}>
              {getModeDescription(workflow.execution_mode)}
            </div>
          )}
        </div>
      </div>

      {/* Provenance & Integrity Principle Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(90deg, #f8faf7 0%, #edf4ec 100%)',
          border: '1px solid #c4d7c2',
          borderLeft: '4px solid #829F80',
          borderRadius: '10px',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '1.4rem' }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>
              Strict Provenance Separation & Metric Integrity Contract
            </div>
            <div style={{ color: '#475569', fontSize: '0.85rem' }}>
              AI-generated reasoning is strictly segregated from measured experiment telemetry. The AI never fabricates metrics.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="provenance-badge-empirical">
            📊 [EMPIRICALLY MEASURED]
          </span>
          <span className="provenance-badge-ai">
            🤖 [AI RATIONALE]
          </span>
          <span className="provenance-badge-user">
            👤 [USER DECISION]
          </span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="auth-error-banner" role="alert" style={{ margin: 0 }}>
          <span>{error}</span>
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          style={{
            padding: '12px 18px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '8px',
            color: '#047857',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          ✓ {actionSuccess}
        </div>
      )}

      {/* Timeline Status Metrics Overview */}
      {workflow && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}
        >
          <div className="card" style={{ padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Completed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
              {workflow.summary.completed}
            </div>
          </div>
          <div className="card" style={{ padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Running</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#829F80', marginTop: '4px' }}>
              {workflow.summary.running}
            </div>
          </div>
          <div className="card" style={{ padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Needs Review</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>
              {workflow.summary.needs_review}
            </div>
          </div>
          <div className="card" style={{ padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Blocked</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
              {workflow.summary.blocked}
            </div>
          </div>
          <div className="card" style={{ padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Not Started</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#64748b', marginTop: '4px' }}>
              {workflow.summary.not_started}
            </div>
          </div>
        </div>
      )}

      {loading && !workflow ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
          Loading Senior Data Scientist Workflow Timeline…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* LEFT: 15-Stage Interactive Workflow Timeline */}
          <div
            className="card"
            style={{
              padding: '16px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '820px',
              overflowY: 'auto',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px', padding: '0 8px' }}>
              15-Stage Workflow Timeline
            </div>
            {stages.map((stage) => {
              const isSelected = stage.stage_key === selectedStageKey
              return (
                <button
                  key={stage.stage_key}
                  id={`timeline-stage-${stage.stage_key}`}
                  onClick={() => {
                    setSelectedStageKey(stage.stage_key)
                    setShowOverrideForm(false)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '4px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: isSelected ? '#edf4ec' : '#ffffff',
                    border: isSelected ? '1px solid #829F80' : '1px solid #f1f5f9',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    width: '100%',
                    boxShadow: isSelected ? '0 1px 3px rgba(130, 159, 128, 0.2)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#233422' : '#0f172a' }}>
                      {stage.stage_index}. {stage.title}
                    </span>
                    {getStatusBadge(stage.status)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>{stage.category}</span>
                    {stage.is_overridden && (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>[Overridden]</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* RIGHT: Selected Stage Deep-Dive Inspection Panel */}
          {selectedStage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Stage Header Card */}
              <div
                className="card"
                style={{
                  padding: '20px 24px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        background: '#829F80',
                        color: '#fff',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                      }}
                    >
                      Stage {selectedStage.stage_index} of 15
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{selectedStage.category}</span>
                    {getStatusBadge(selectedStage.status)}
                  </div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '8px 0 4px 0' }}>
                    {selectedStage.title}
                  </h3>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    className="btn-secondary btn-sm"
                    id="btn-override-stage"
                    onClick={() => {
                      setOverrideDecision(selectedStage.user_decisions?.decision === 'pending' ? 'overridden' : (selectedStage.user_decisions?.decision || 'overridden'))
                      setOverrideRecommendation(selectedStage.user_decisions?.overridden_recommendation || '')
                      setOverrideNotes(selectedStage.user_decisions?.user_decision_notes || '')
                      setCustomParamsJson(JSON.stringify(selectedStage.user_decisions?.custom_parameters || {}, null, 2))
                      setShowOverrideForm(!showOverrideForm)
                    }}
                    style={{ borderColor: '#fde68a', color: '#b45309', background: '#fffbeb' }}
                  >
                    ✏️ Manual Override / Decision
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    id="btn-advance-stage"
                    disabled={actionLoading}
                    onClick={handleAdvanceStage}
                  >
                    Confirm & Advance Stage &rarr;
                  </button>
                </div>
              </div>

              {/* Interactive Override Form (When Open) */}
              {showOverrideForm && (
                <div
                  className="card"
                  style={{
                    padding: '20px',
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: '12px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 style={{ margin: 0, color: '#92400e', fontSize: '1.1rem' }}>
                      🧑‍💻 Practitioner Decision & Manual Override
                    </h4>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setShowOverrideForm(false)}
                      style={{ padding: '2px 8px' }}
                    >
                      ✕ Cancel
                    </button>
                  </div>
                  <form onSubmit={handleStageOverride} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '6px', fontWeight: 600 }}>
                        Decision Type:
                      </label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {(['accepted', 'overridden', 'rejected'] as const).map((dec) => (
                          <label key={dec} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b', fontSize: '0.9rem', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="overrideDecision"
                              value={dec}
                              checked={overrideDecision === dec}
                              onChange={(e) => setOverrideDecision(e.target.value as any)}
                            />
                            {dec === 'accepted' && 'Accept AI Recommendation'}
                            {dec === 'overridden' && 'Override with Custom Rationale'}
                            {dec === 'rejected' && 'Reject / Block Stage'}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '6px', fontWeight: 600 }}>
                        Custom Recommendation / Instructions:
                      </label>
                      <textarea
                        rows={2}
                        id="override-recommendation-input"
                        placeholder="e.g. Enforce custom decision threshold 0.38 to reduce false negative customer attrition..."
                        value={overrideRecommendation}
                        onChange={(e) => setOverrideRecommendation(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '6px', fontWeight: 600 }}>
                        Custom Parameters (JSON):
                      </label>
                      <textarea
                        rows={3}
                        id="override-custom-params-input"
                        placeholder='{"custom_hurdle_threshold": 0.68, "n_splits": 10}'
                        value={customParamsJson}
                        onChange={(e) => setCustomParamsJson(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontFamily: 'monospace' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '6px', fontWeight: 600 }}>
                        Practitioner Decision Notes (Audit Trail):
                      </label>
                      <input
                        type="text"
                        id="override-notes-input"
                        placeholder="Justification recorded to audit log for compliance..."
                        value={overrideNotes}
                        onChange={(e) => setOverrideNotes(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="submit"
                        className="btn-primary"
                        id="btn-save-override"
                        disabled={actionLoading}
                        style={{ background: '#d97706', borderColor: '#b45309', color: '#ffffff', fontWeight: 700 }}
                      >
                        Save Practitioner Override
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* SECTION 1: What was analyzed */}
              <div
                className="card"
                style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🔍</span>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>What Was Analyzed</h4>
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedStage.what_was_analyzed.map((item, idx) => (
                    <li key={idx} style={{ fontSize: '0.92rem' }}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* SECTION 2: Evidence */}
              <div
                className="card"
                style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📊</span>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Evidence (Empirical Telemetry)</h4>
                  </div>
                  <span className="provenance-badge-empirical">
                    [EMPIRICALLY MEASURED]
                  </span>
                </div>

                {selectedStage.evidence.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No empirical telemetry recorded yet. Awaiting execution or dataset link.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {selectedStage.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 16px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                          {ev.label}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', marginTop: '4px', wordBreak: 'break-word' }}>
                          {typeof ev.value === 'object' ? JSON.stringify(ev.value) : String(ev.value)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                          Source: {ev.source}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 3: Findings */}
              <div
                className="card"
                style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📈</span>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Findings (Empirical Outcomes)</h4>
                  </div>
                  <span className="provenance-badge-empirical">
                    [EMPIRICALLY MEASURED]
                  </span>
                </div>

                {selectedStage.findings.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No measured findings yet for this stage.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedStage.findings.map((f, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 16px',
                          background: '#f0fdf4',
                          border: '1px solid #dcfce7',
                          borderLeft: '3px solid #10b981',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#065f46', fontSize: '0.95rem' }}>
                          {f.title}
                        </div>
                        <div style={{ color: '#1e293b', fontSize: '0.9rem', marginTop: '4px' }}>
                          {f.description}
                        </div>
                        {f.measured_fact && (
                          <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '6px', fontFamily: 'monospace' }}>
                            Fact: {f.measured_fact}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 4: Recommendations */}
              <div
                className="card"
                style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🤖</span>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Recommendations (AI Peer Guidance)</h4>
                  </div>
                  <span className="provenance-badge-ai">
                    [AI RATIONALE]
                  </span>
                </div>

                {selectedStage.recommendations.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No pending AI recommendations for this stage.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedStage.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 16px',
                          background: '#faf5ff',
                          border: '1px solid #f3e8ff',
                          borderLeft: '3px solid #8b5cf6',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#6b21a8', fontSize: '0.95rem' }}>
                          {rec.title}
                        </div>
                        <div style={{ color: '#334155', fontSize: '0.9rem', marginTop: '4px' }}>
                          {rec.rationale}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#567354', marginTop: '6px', fontWeight: 600 }}>
                          Suggested Action: {rec.suggested_action}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 5: User Decisions */}
              <div
                className="card"
                style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>👤</span>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>User Decisions & Overrides</h4>
                  </div>
                  <span className="provenance-badge-user">
                    [USER DECISION]
                  </span>
                </div>

                <div
                  style={{
                    padding: '14px 18px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: selectedStage.is_overridden ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Status: </span>
                      <strong style={{ color: selectedStage.is_overridden ? '#b45309' : '#0f172a' }}>
                        {selectedStage.user_decisions?.decision?.toUpperCase() || 'PENDING REVIEW'}
                      </strong>
                    </div>
                    {selectedStage.user_decisions?.updated_at && (
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Decided {new Date(selectedStage.user_decisions.updated_at).toLocaleString()}
                        {selectedStage.user_decisions.decided_by_email && ` by ${selectedStage.user_decisions.decided_by_email}`}
                      </span>
                    )}
                  </div>

                  {selectedStage.user_decisions?.overridden_recommendation && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Overridden Recommendation:</div>
                      <div style={{ color: '#1e293b', fontSize: '0.9rem', marginTop: '2px' }}>
                        {selectedStage.user_decisions.overridden_recommendation}
                      </div>
                    </div>
                  )}

                  {selectedStage.user_decisions?.custom_parameters &&
                    Object.keys(selectedStage.user_decisions.custom_parameters).length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Custom Parameters:</div>
                        <pre style={{ margin: '4px 0 0 0', padding: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.8rem', color: '#0f172a' }}>
                          {JSON.stringify(selectedStage.user_decisions.custom_parameters, null, 2)}
                        </pre>
                      </div>
                    )}

                  {selectedStage.user_decisions?.user_decision_notes && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Decision Notes:</div>
                      <div style={{ color: '#334155', fontSize: '0.85rem', fontStyle: 'italic', marginTop: '2px' }}>
                        "{selectedStage.user_decisions.user_decision_notes}"
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
