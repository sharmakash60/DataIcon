import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import type { BusinessRequirement, MLProblemType, ProblemFormulation, Project, RequirementStatus } from './types'

interface Props {
  project: Project
  onBack: () => void
}

const SAMPLE_PROMPTS = [
  'We want to identify customers who are likely to churn within the next 30 days.',
  'Forecast expected sales revenue for our e-commerce store over the next 12 weeks.',
  'Classify incoming customer support tickets into billing, technical, or account category.',
]

export default function RequirementsView({ project, onBack }: Props) {
  const { activeOrg } = useAuth()
  const orgId = activeOrg?.organization_id

  const [description, setDescription] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Current active requirement
  const [activeReq, setActiveReq] = useState<BusinessRequirement | null>(null)
  const [history, setHistory] = useState<BusinessRequirement[]>([])
  const [formulations, setFormulations] = useState<ProblemFormulation[]>([])

  // Editable form state
  const [businessObjective, setBusinessObjective] = useState('')
  const [predictionObjective, setPredictionObjective] = useState('')
  const [targetName, setTargetName] = useState('')
  const [horizon, setHorizon] = useState('')
  const [problemType, setProblemType] = useState<MLProblemType>('binary_classification')
  const [primaryMetric, setPrimaryMetric] = useState('recall')
  const [secondaryMetrics, setSecondaryMetrics] = useState<string[]>([])
  const [constraints, setConstraints] = useState<string[]>([])
  const [newConstraint, setNewConstraint] = useState('')
  const [positiveClass, setPositiveClass] = useState('')
  const [costFp, setCostFp] = useState('')
  const [costFn, setCostFn] = useState('')
  const [expectedFrequency, setExpectedFrequency] = useState('Daily batch')
  const [businessPriority, setBusinessPriority] = useState('Minimize false negatives')
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [newAssumption, setNewAssumption] = useState('')
  const [missingRequirements, setMissingRequirements] = useState<string[]>([])
  const [reviewNotes, setReviewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Quick-add missing requirement state
  const [missingFieldInput, setMissingFieldInput] = useState('')
  const [selectedMissingField, setSelectedMissingField] = useState<string>('')

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  const canEdit = ['owner', 'admin', 'data_scientist'].includes(activeOrg?.role || '')

  const populateForm = (req: BusinessRequirement) => {
    setActiveReq(req)
    setBusinessObjective(req.business_objective || '')
    setPredictionObjective(req.prediction_objective || req.ml_objective || '')
    setTargetName(req.target_name || req.target || '')
    setHorizon(req.prediction_horizon || '')
    setProblemType(req.ml_problem_type || req.candidate_problem_type || 'binary_classification')
    setPrimaryMetric(req.primary_metric || 'recall')
    setSecondaryMetrics(req.secondary_metrics || [])
    setConstraints(req.business_constraints || [])
    setPositiveClass(req.suggested_positive_class || '')
    setCostFp(req.cost_of_false_positives || '')
    setCostFn(req.cost_of_false_negatives || '')
    setExpectedFrequency(req.expected_prediction_frequency || 'Daily batch')
    setBusinessPriority(req.business_priority || 'Minimize false negatives')
    setAssumptions(req.assumptions || [])
    setMissingRequirements(req.missing_requirements || [])
    setReviewNotes(req.review_notes || '')
  }

  const loadRequirementsAndFormulations = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const [items, formList] = await Promise.all([
        api.getRequirements(orgId, project.id),
        api.getFormulations(orgId, project.id).catch(() => []),
      ])
      setHistory(items)
      setFormulations(formList)
      if (items.length > 0 && !activeReq) {
        populateForm(items[0])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load requirements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequirementsAndFormulations()
  }, [orgId, project.id])

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !description.trim()) return

    setExtracting(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const extracted = await api.extractRequirements(orgId, project.id, description.trim())
      setSuccessMsg('Requirements successfully extracted! Please review and refine the formulation below.')
      populateForm(extracted)
      setHistory((prev) => [extracted, ...prev])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async (statusToSet: RequirementStatus) => {
    if (!orgId || !activeReq) return

    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    const payload = {
      business_objective: businessObjective.trim(),
      prediction_objective: predictionObjective.trim(),
      ml_objective: predictionObjective.trim(),
      target_name: targetName.trim(),
      target: targetName.trim(),
      prediction_horizon: horizon.trim() || null,
      ml_problem_type: problemType,
      candidate_problem_type: problemType,
      primary_metric: primaryMetric.trim(),
      secondary_metrics: secondaryMetrics,
      business_constraints: constraints,
      cost_of_false_positives: costFp.trim() || null,
      cost_of_false_negatives: costFn.trim() || null,
      expected_prediction_frequency: expectedFrequency.trim() || null,
      business_priority: businessPriority.trim() || null,
      suggested_positive_class: positiveClass.trim() || null,
      assumptions: assumptions,
      missing_requirements: missingRequirements,
      status: statusToSet,
      review_notes: reviewNotes.trim() || null,
    }

    try {
      if (statusToSet === 'approved') {
        // First update/save formulation state
        await api.updateRequirement(orgId, project.id, activeReq.id, payload)
        // Then call confirm endpoint to lock versioned Problem Formulation object
        const confirmRes = await api.confirmRequirement(
          orgId,
          project.id,
          activeReq.id,
          reviewNotes.trim() || 'Approved problem formulation',
        )
        populateForm(confirmRes.requirement)
        setHistory((prev) => prev.map((item) => (item.id === confirmRes.requirement.id ? confirmRes.requirement : item)))
        setFormulations((prev) => [confirmRes.formulation, ...prev.filter((f) => f.id !== confirmRes.formulation.id)])
        setSuccessMsg(
          `✓ Problem Formulation confirmed and versioned as Version ${confirmRes.formulation.version}! Ready for model training.`,
        )
      } else {
        const updated = await api.updateRequirement(orgId, project.id, activeReq.id, payload)
        populateForm(updated)
        setHistory((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        setSuccessMsg(
          statusToSet === 'reviewed'
            ? 'Formulation marked as reviewed by operator.'
            : 'Draft formulation changes saved successfully.',
        )
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async () => {
    if (!orgId || !activeReq || !rejectionReason.trim()) return

    setSaving(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const rejected = await api.rejectRequirement(orgId, project.id, activeReq.id, rejectionReason.trim())
      populateForm(rejected)
      setHistory((prev) => prev.map((item) => (item.id === rejected.id ? rejected : item)))
      setShowRejectModal(false)
      setRejectionReason('')
      setSuccessMsg('Requirement formulation has been marked as REJECTED.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rejection failed')
    } finally {
      setSaving(false)
    }
  }

  const addConstraint = () => {
    if (newConstraint.trim()) {
      setConstraints([...constraints, newConstraint.trim()])
      setNewConstraint('')
    }
  }

  const removeConstraint = (index: number) => {
    setConstraints(constraints.filter((_, i) => i !== index))
  }

  const addAssumption = () => {
    if (newAssumption.trim()) {
      setAssumptions([...assumptions, newAssumption.trim()])
      setNewAssumption('')
    }
  }

  const removeAssumption = (index: number) => {
    setAssumptions(assumptions.filter((_, i) => i !== index))
  }

  const handleAddMissingRequirement = () => {
    if (!selectedMissingField || !missingFieldInput.trim()) return

    if (selectedMissingField === 'target') {
      setTargetName(missingFieldInput.trim())
    } else if (selectedMissingField === 'prediction_horizon') {
      setHorizon(missingFieldInput.trim())
    } else if (selectedMissingField === 'cost_tradeoffs') {
      setCostFn(`Loss: ${missingFieldInput.trim()}`)
    } else if (selectedMissingField === 'expected_prediction_frequency') {
      setExpectedFrequency(missingFieldInput.trim())
    }

    setMissingRequirements(missingRequirements.filter((r) => r !== selectedMissingField))
    setSelectedMissingField('')
    setMissingFieldInput('')
  }

  return (
    <div className="requirements-view">
      {/* Top Header */}
      <div className="view-header">
        <div className="view-header-title">
          <button type="button" className="btn-secondary btn-sm" onClick={onBack} id="back-to-projects-btn">
            ← Back to Projects
          </button>
          <h2>{project.name} &mdash; Business Understanding &amp; ML Formulation</h2>
          <span className={`badge-classification ${project.classification}`}>
            {project.classification}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {successMsg && <div className="alert alert-success" role="status">{successMsg}</div>}

      {/* Section 1: Describe Business Problem */}
      <div className="card prompt-card">
        <h3>1. Describe Business Problem</h3>
        <p className="card-subtext">
          Describe your business problem in natural language. Our engine extracts structured ML objectives,
          target variables, metrics, and business constraints without ever executing code autonomously.
        </p>

        {/* Suggestion Chips */}
        <div className="prompt-chips">
          <span className="chips-label">Examples:</span>
          {SAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="chip-btn"
              onClick={() => setDescription(prompt)}
            >
              &ldquo;{prompt}&rdquo;
            </button>
          ))}
        </div>

        <form onSubmit={handleExtract} className="prompt-form">
          <textarea
            className="prompt-textarea"
            id="business-problem-input"
            rows={3}
            placeholder="e.g. Predict which customers are likely to churn within the next 30 days."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={extracting || !canEdit}
          />
          <div className="prompt-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              🔒 Validated through strict Pydantic schemas. Zero autonomous ML execution.
            </span>
            <button
              type="submit"
              className="btn-primary"
              id="extract-requirements-btn"
              disabled={extracting || !description.trim() || !canEdit}
            >
              {extracting ? 'Extracting with AI Engine...' : '✨ Extract ML Requirements'}
            </button>
          </div>
        </form>
      </div>

      {/* Section 2: Review and Edit Form */}
      {activeReq && (
        <div className="card formulation-card" id="formulation-review-card">
          <div className="formulation-header">
            <div>
              <h3>2. Review &amp; Refine Problem Formulation</h3>
              <p className="card-subtext">
                Verify and edit the extracted parameters. The formulation must be explicitly approved
                by a human operator before any experiments or models can be trained.
              </p>
            </div>
            <div className="status-container">
              <span className="status-label">Status:</span>
              <span className={`status-badge status-${activeReq.status}`}>
                {activeReq.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Prompt-Style Clean Summary Card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Extracted Formulation Summary
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>Business objective:</span>
                <strong style={{ color: '#0f172a' }}>{businessObjective || 'Not set'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>ML problem:</span>
                <span style={{ color: '#829F80', fontWeight: 600 }}>{problemType.replace('_', ' ')}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>Target:</span>
                <code style={{ background: '#edf4ec', border: '1px solid #c4d7c2', padding: '2px 6px', borderRadius: '4px', color: '#274125' }}>
                  {targetName || 'unspecified'}
                </code>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>Prediction horizon:</span>
                <strong style={{ color: '#0f172a' }}>{horizon || 'None'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>Primary metric:</span>
                <strong style={{ color: '#059669' }}>{primaryMetric.toUpperCase()}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>Business priority:</span>
                <strong style={{ color: '#d97706' }}>{businessPriority || 'Balanced'}</strong>
              </div>
            </div>
          </div>

          {/* Missing Requirements Alert & Quick-Add Drawer */}
          {missingRequirements && missingRequirements.length > 0 && (
            <div style={{ background: '#451a03', border: '1px solid #b45309', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fde68a', fontWeight: 600 }}>
                <span>⚠️ Missing Business Requirements Detected</span>
              </div>
              <p style={{ margin: '6px 0 12px 0', fontSize: '0.85rem', color: '#fef3c7' }}>
                The AI engine identified missing requirements that were not in your prompt. Never silently assume missing requirements &mdash; please provide the details below:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {missingRequirements.map((req) => (
                  <span
                    key={req}
                    style={{
                      background: '#78350f',
                      border: '1px solid #f59e0b',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.8rem',
                      color: '#fef08a',
                    }}
                  >
                    + Missing: {req.replace('_', ' ')}
                  </span>
                ))}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                  <select
                    style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                    value={selectedMissingField}
                    onChange={(e) => setSelectedMissingField(e.target.value)}
                  >
                    <option value="">-- Select requirement to add --</option>
                    {missingRequirements.map((r) => (
                      <option key={r} value={r}>Add {r.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="input-field"
                    style={{ flex: 1 }}
                    placeholder="Enter missing requirement value..."
                    value={missingFieldInput}
                    onChange={(e) => setMissingFieldInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddMissingRequirement}
                    disabled={!selectedMissingField || !missingFieldInput.trim()}
                  >
                    Add Missing Information
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Explicit Assumptions Panel */}
          <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem' }}>💡</span>
                <h4 style={{ margin: 0, color: '#c7d2fe', fontSize: '0.95rem' }}>Explicit AI &amp; Domain Assumptions</h4>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#a5b4fc' }}>Explicit assumptions are visible and fully editable</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#e0e7ff', fontSize: '0.85rem' }}>
              {assumptions.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '6px' }}>
                  <span>{item}</span>
                  {canEdit && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', marginLeft: '8px', fontSize: '0.8rem' }}
                      onClick={() => removeAssumption(idx)}
                    >
                      &times; remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input
                  type="text"
                  className="input-field"
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  placeholder="Document new business assumption (e.g. Ground truth available in CRM)..."
                  value={newAssumption}
                  onChange={(e) => setNewAssumption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addAssumption()
                    }
                  }}
                />
                <button type="button" className="btn-secondary btn-sm" onClick={addAssumption}>
                  + Add Assumption
                </button>
              </div>
            )}
          </div>

          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="business-obj-field">Business Objective</label>
              <textarea
                id="business-obj-field"
                className="input-field"
                rows={2}
                value={businessObjective}
                onChange={(e) => setBusinessObjective(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="prediction-obj-field">ML Objective</label>
              <textarea
                id="prediction-obj-field"
                className="input-field"
                rows={2}
                value={predictionObjective}
                onChange={(e) => setPredictionObjective(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="form-group">
              <label htmlFor="target-name-field">Target Column / Concept</label>
              <input
                id="target-name-field"
                type="text"
                className="input-field"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="form-group">
              <label htmlFor="horizon-field">Prediction Horizon</label>
              <input
                id="horizon-field"
                type="text"
                className="input-field"
                placeholder="e.g. 30 days"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="form-group">
              <label htmlFor="problem-type-field">Candidate Problem Type</label>
              <select
                id="problem-type-field"
                className="input-field"
                value={problemType}
                onChange={(e) => setProblemType(e.target.value as MLProblemType)}
                disabled={!canEdit}
              >
                <option value="binary_classification">Binary Classification</option>
                <option value="multiclass_classification">Multiclass Classification</option>
                <option value="regression">Regression</option>
                <option value="time_series_forecasting">Time Series Forecasting</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="primary-metric-field">Primary Optimization Metric</label>
              <select
                id="primary-metric-field"
                className="input-field"
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value)}
                disabled={!canEdit}
              >
                {problemType === 'regression' ? (
                  <>
                    <option value="rmse">RMSE (Root Mean Squared Error)</option>
                    <option value="mae">MAE (Mean Absolute Error)</option>
                    <option value="r2">R² Score</option>
                    <option value="mape">MAPE</option>
                  </>
                ) : problemType === 'multiclass_classification' ? (
                  <>
                    <option value="log_loss">Log Loss (Cross-Entropy)</option>
                    <option value="accuracy">Accuracy</option>
                    <option value="f1_macro">F1 Macro</option>
                  </>
                ) : (
                  <>
                    <option value="recall">Recall (Minimize False Negatives)</option>
                    <option value="roc_auc">ROC-AUC (Discriminative Ranking)</option>
                    <option value="pr_auc">PR-AUC (Imbalanced Precision-Recall)</option>
                    <option value="f1">F1 Score (Balanced harmonic mean)</option>
                    <option value="precision">Precision (Minimize False Positives)</option>
                    <option value="log_loss">Log Loss</option>
                  </>
                )}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="business-priority-field">Business Priority</label>
              <input
                id="business-priority-field"
                type="text"
                className="input-field"
                placeholder="e.g. Minimize false negatives (High Recall)"
                value={businessPriority}
                onChange={(e) => setBusinessPriority(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="form-group">
              <label htmlFor="expected-freq-field">Expected Prediction Frequency</label>
              <select
                id="expected-freq-field"
                className="input-field"
                value={expectedFrequency}
                onChange={(e) => setExpectedFrequency(e.target.value)}
                disabled={!canEdit}
              >
                <option value="Daily batch">Daily batch</option>
                <option value="Real-time API (<250ms)">Real-time API (&lt;250ms)</option>
                <option value="Weekly batch">Weekly batch</option>
                <option value="Monthly batch">Monthly batch</option>
                <option value="Hourly batch">Hourly batch</option>
                <option value="On-demand">On-demand</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="cost-fp-field">Cost of False Positives</label>
              <input
                id="cost-fp-field"
                type="text"
                className="input-field"
                placeholder="e.g. Unnecessary discount voucher ($25) or customer fatigue"
                value={costFp}
                onChange={(e) => setCostFp(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="form-group">
              <label htmlFor="cost-fn-field">Cost of False Negatives</label>
              <input
                id="cost-fn-field"
                type="text"
                className="input-field"
                placeholder="e.g. Loss of customer lifetime value ($500+ ARR)"
                value={costFn}
                onChange={(e) => setCostFn(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            {problemType === 'binary_classification' && (
              <div className="form-group">
                <label htmlFor="positive-class-field">Suggested Positive Class Label</label>
                <input
                  id="positive-class-field"
                  type="text"
                  className="input-field"
                  placeholder="e.g. churned"
                  value={positiveClass}
                  onChange={(e) => setPositiveClass(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="secondary-metrics-field">Secondary Metrics</label>
              <input
                id="secondary-metrics-field"
                type="text"
                className="input-field"
                value={secondaryMetrics.join(', ')}
                onChange={(e) =>
                  setSecondaryMetrics(
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                disabled={!canEdit}
              />
            </div>

            <div className="form-group full-width">
              <label>Business Constraints</label>
              <ul className="constraints-list">
                {constraints.map((c, idx) => (
                  <li key={c} className="constraint-item">
                    <span>{c}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="btn-link text-danger"
                        onClick={() => removeConstraint(idx)}
                      >
                        &times; Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="add-constraint-row">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Add operational constraint (e.g. Max latency < 100ms)..."
                    value={newConstraint}
                    onChange={(e) => setNewConstraint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addConstraint()
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={addConstraint}>
                    + Add
                  </button>
                </div>
              )}
            </div>

            <div className="form-group full-width">
              <label htmlFor="review-notes-field">Operator Review Notes</label>
              <textarea
                id="review-notes-field"
                className="input-field"
                rows={2}
                placeholder="Document any stakeholder consultations or reasoning behind metric changes..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {canEdit && (
            <div className="formulation-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                className="btn-danger"
                id="reject-formulation-btn"
                disabled={saving}
                onClick={() => setShowRejectModal(true)}
              >
                ✕ Reject Formulation
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="save-draft-btn"
                disabled={saving}
                onClick={() => handleSave('draft')}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="mark-reviewed-btn"
                disabled={saving}
                onClick={() => handleSave('reviewed')}
              >
                Mark as Reviewed
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                id="approve-formulation-btn"
                disabled={saving}
                onClick={() => handleSave('approved')}
              >
                ✓ Approve Problem Formulation
              </button>
            </div>
          )}
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Reject Requirement Formulation</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Document the business reason for rejecting this formulation. This will be preserved in the audit log.
            </p>
            <textarea
              className="input-field"
              rows={3}
              placeholder="e.g. Unrealistic business timeline, target not feasible with existing data..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={saving || !rejectionReason.trim()}
                onClick={handleReject}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Versioned Problem Formulations History */}
      {formulations.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#f8fafc' }}>Confirmed Problem Formulations</h4>
              <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                Versioned, immutable specifications approved for model development.
              </p>
            </div>
            <span className="badge-classification internal">{formulations.length} Versions</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {formulations.map((f) => (
              <div
                key={f.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        background: '#829F80',
                        color: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      v{f.version}
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{f.target}</strong>
                    <span style={{ color: '#567354', fontSize: '0.85rem', fontWeight: 600 }}>({f.candidate_problem_type})</span>
                    <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>Metric: {f.primary_metric}</span>
                  </div>
                  <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.85rem' }}>
                    {f.business_objective}
                  </p>
                  {f.cost_of_false_negatives && (
                    <p style={{ margin: '4px 0 0 0', color: '#d97706', fontSize: '0.75rem', fontWeight: 500 }}>
                      Priority: {f.business_priority || 'Standard'} &bull; FN Cost: {f.cost_of_false_negatives}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="status-badge status-approved" style={{ fontSize: '0.75rem' }}>ACTIVE</span>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                    {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="card history-card" style={{ marginTop: '24px' }}>
          <h4>Requirement Draft History</h4>
          <div className="history-list">
            {history.map((h) => (
              <div
                key={h.id}
                className={`history-item ${activeReq?.id === h.id ? 'active' : ''}`}
                onClick={() => populateForm(h)}
              >
                <div className="history-info">
                  <strong>{h.target_name || h.target}</strong> &mdash; {h.ml_problem_type || h.candidate_problem_type}
                  <span className="history-date">
                    {new Date(h.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className={`status-badge status-${h.status}`}>{h.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
