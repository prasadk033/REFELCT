import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import ProjectShell from '../components/ProjectShell.jsx'
import ContextCard from '../components/ContextCard.jsx'
import {
  getProject,
  getProjectContext,
  generateProjectContext,
  getContextStatus,
  cancelContextJob,
  modifyContextCard,
  addContextCardNote,
  updateContextCardTags,
  deleteContextCard,
} from '../api.js'

export default function ContextPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [knowledgeSets, setKnowledgeSets] = useState([])
  const [activeSet, setActiveSet] = useState('cultural_context')
  const [latestRun, setLatestRun] = useState(null)
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  const [localKnowledge, setLocalKnowledge] = useState('')
  const [runningJob, setRunningJob] = useState(false)
  const [jobStep, setJobStep] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)

  const [modifyModalCard, setModifyModalCard] = useState(null)
  const [modifyInstruction, setModifyInstruction] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    loadAll()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [projectId])

  async function loadAll() {
    setLoading(true)
    try {
      const [proj, ctx] = await Promise.all([
        getProject(projectId),
        getProjectContext(projectId, activeSet),
      ])
      setProject(proj)
      setKnowledgeSets(ctx.knowledge_sets || [])
      setLatestRun(ctx.latest_run || null)
      setCards(ctx.cards || [])

      const job = ctx.latest_job
      if (job && (job.status === 'queued' || job.status === 'running')) {
        setRunningJob(true)
        setJobStep(job.current_step || 'Researching Cultural Context...')
        startPolling()
      }
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const st = await getContextStatus(projectId)
        if (st.current_step) setJobStep(st.current_step)
        if (st.status === 'completed' || st.status === 'failed' || st.status === 'cancelled') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setRunningJob(false)
          if (st.status === 'failed') {
            setErrorMsg(st.error || 'Context research failed.')
          }
          const ctx = await getProjectContext(projectId, activeSet)
          setLatestRun(ctx.latest_run || null)
          setCards(ctx.cards || [])
        }
      } catch (e) {
        console.warn('Context status poll error:', e)
      }
    }, 2000)
  }

  async function handleGenerate() {
    setErrorMsg(null)
    setRunningJob(true)
    setJobStep('Submitting to Context Master...')
    try {
      await generateProjectContext(projectId, activeSet, {
        architect_local_knowledge: localKnowledge.trim() || null,
      })
      startPolling()
    } catch (err) {
      setRunningJob(false)
      setErrorMsg(err.message)
    }
  }

  async function handleCancel() {
    try {
      await cancelContextJob(projectId)
      if (pollRef.current) clearInterval(pollRef.current)
      setRunningJob(false)
      setJobStep('')
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  async function handleSubmitModify(e) {
    e.preventDefault()
    if (!modifyModalCard || !modifyInstruction.trim()) return
    setErrorMsg(null)
    const targetCardId = modifyModalCard.id
    setModifyModalCard(null)
    setRunningJob(true)
    setJobStep(`Modifying '${modifyModalCard.title}'...`)
    try {
      await modifyContextCard(projectId, targetCardId, {
        instruction: modifyInstruction.trim(),
        architect_local_knowledge: localKnowledge.trim() || null,
      })
      setModifyInstruction('')
      startPolling()
    } catch (err) {
      setRunningJob(false)
      setErrorMsg(err.message)
    }
  }

  async function handleAddNote(cardId, note) {
    const updated = await addContextCardNote(projectId, cardId, note)
    setCards(prev => prev.map(c => (c.id === cardId ? updated : c)))
  }

  async function handleUpdateTags(cardId, tags) {
    const updated = await updateContextCardTags(projectId, cardId, tags)
    setCards(prev => prev.map(c => (c.id === cardId ? updated : c)))
  }

  async function handleDeleteCard(card) {
    await deleteContextCard(projectId, card.id)
    setCards(prev => prev.filter(c => c.id !== card.id))
  }

  return (
    <ProjectShell project={project} isTaskRunning={runningJob}>
      <div className="pov-container" style={{ maxWidth: '1120px', margin: '0 auto', padding: '24px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div>
            <h1 className="pov-project-name" style={{ margin: '0 0 6px 0' }}>Context Knowledge System</h1>
            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-muted, #64748b)' }}>
              Evidence-backed architectural context research orchestrated by Context Master (Phase 1: Cultural Context).
            </p>
          </div>
          <button
            type="button"
            className="bui-btn bui-btn-primary"
            disabled={runningJob}
            onClick={handleGenerate}
            style={{ padding: '10px 18px', fontWeight: 600 }}
          >
            {runningJob ? 'Researching...' : cards.length > 0 ? '↻ Re-run Cultural Context' : '✦ Generate Cultural Context'}
          </button>
        </header>

        {/* Knowledge Set Selector (Phase 1: Cultural Context enabled, 7 locked) */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {knowledgeSets.map(ks => (
            <button
              key={ks.id}
              type="button"
              disabled={!ks.enabled}
              onClick={() => ks.enabled && setActiveSet(ks.id)}
              title={ks.enabled ? ks.description : `${ks.name} — Coming in Phase 2`}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid',
                borderColor: activeSet === ks.id ? '#2563eb' : 'var(--border-color, #cbd5e1)',
                background: activeSet === ks.id ? '#2563eb' : 'var(--bg-surface, #ffffff)',
                color: activeSet === ks.id ? '#ffffff' : ks.enabled ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #94a3b8)',
                opacity: ks.enabled ? 1 : 0.6,
                cursor: ks.enabled ? 'pointer' : 'not-allowed',
              }}
            >
              {ks.name}{!ks.enabled ? ' (Phase 2)' : ''}
            </button>
          ))}
        </div>

        {/* Running Banner */}
        {runningJob && (
          <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '10px', padding: '14px 18px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="bui-spinner-inline" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>{jobStep || 'Running Cultural Context research...'}</span>
            </div>
            <button type="button" className="bui-btn bui-btn-outline" onClick={handleCancel} style={{ color: '#ef4444', borderColor: '#fecaca', fontSize: '12px', padding: '5px 12px' }}>
              ⏹ Cancel
            </button>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {errorMsg}
          </div>
        )}

        {/* Architect Local Knowledge Input */}
        <section className="pov-box" style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
            Architect&apos;s Local Knowledge (Optional — given authoritative precedence &amp; attributed)
          </label>
          <textarea
            rows={2}
            value={localKnowledge}
            onChange={e => setLocalKnowledge(e.target.value)}
            placeholder="Share site observations, local crafts, neighbourhood history, or notes you observed on the ground..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px' }}
          />
        </section>

        {/* Resolved Location Summary */}
        {latestRun?.resolved_location && (
          <section className="pov-box" style={{ padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '20px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <strong>Resolved Location:</strong>{' '}
                {latestRun.resolved_location.location_description || project?.location || 'Unspecified'}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8' }}>
                Confidence: {latestRun.location_confidence || 'UNKNOWN'} · Attempts: {latestRun.attempt_count}/3
              </span>
            </div>
          </section>
        )}

        {/* Cards List */}
        {loading ? (
          <div className="brief-ui-loading"><span className="bui-spinner" /></div>
        ) : cards.length === 0 ? (
          <div className="pov-box" style={{ padding: '36px', textAlign: 'center', borderRadius: '12px', border: '1px dashed var(--border-color, #cbd5e1)' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>No Cultural Context Cards generated yet.</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>
              Click &ldquo;Generate Cultural Context&rdquo; above to run location resolution and the 7-part architectural reading.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {cards.map(card => (
              <ContextCard
                key={card.id}
                card={card}
                busy={runningJob}
                onModify={c => {
                  setModifyModalCard(c)
                  setModifyInstruction('')
                }}
                onAddNote={handleAddNote}
                onUpdateTags={handleUpdateTags}
                onDelete={handleDeleteCard}
              />
            ))}
          </div>
        )}

        {/* Single-Card Modification Modal (Mode B) */}
        {modifyModalCard && (
          <div className="bui-modal-overlay" onClick={() => setModifyModalCard(null)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', padding: '24px' }}>
              <h3 style={{ margin: '0 0 8px 0' }}>Modify Card: {modifyModalCard.title}</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', margin: '0 0 14px 0' }}>
                Only this card will be researched and updated. Valid original content is preserved unless correction is requested.
              </p>
              <form onSubmit={handleSubmitModify}>
                <textarea
                  rows={4}
                  required
                  value={modifyInstruction}
                  onChange={e => setModifyInstruction(e.target.value)}
                  placeholder="Describe the clarification, correction, or additional local research needed..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px', marginBottom: '14px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setModifyModalCard(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="bui-btn bui-btn-primary">
                    Run Targeted Research
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProjectShell>
  )
}
