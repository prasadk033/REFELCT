import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import ProjectShell from '../components/ProjectShell.jsx'
import ContextCard from '../components/ContextCard.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import {
  getProject,
  getProjectContext,
  generateProjectContext,
  getContextStatus,
  cancelContextJob,
  modifyContextCard,
  addContextCardNote,
  updateContextCardPriority,
  deleteContextCard,
  createManualContextCard,
  confirmSplitContextCard,
  confirmContextLocation,
} from '../api.js'

/**
 * Sentence-based manual splitting parser.
 * Splits on ., ?, ! and newlines while respecting abbreviations, decimals, and URLs.
 */
function parseSentences(text) {
  if (!text || typeof text !== 'string') return []
  const cleaned = text.trim()
  if (!cleaned) return []

  // Protect URLs, decimals (e.g. 17.430), and common abbreviations
  const placeholders = []
  let masked = cleaned
    .replace(/https?:\/\/\S+/gi, m => {
      placeholders.push(m)
      return `__PH_${placeholders.length - 1}__`
    })
    .replace(/\b(\d+)\.(\d+)/g, (_, a, b) => {
      placeholders.push(`${a}.${b}`)
      return `__PH_${placeholders.length - 1}__`
    })
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|No|Nos|sq|approx|e\.g|i\.e|etc|vs|Rs)\./gi, m => {
      placeholders.push(m)
      return `__PH_${placeholders.length - 1}__`
    })

  // Split by sentence-ending punctuation followed by whitespace, or line breaks
  const rawParts = masked
    .split(/(?<=[.!?])\s+|\n+/)
    .map(p => p.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)

  return rawParts.map(part =>
    part.replace(/__PH_(\d+)__/g, (_, idx) => placeholders[Number(idx)] || '')
  )
}

const KS_META = {
  cultural_context: { icon: '🏛', subtitle: 'Place, people, practices and meaning' },
  climate: { icon: '☀', subtitle: 'Climate conditions and implications' },
  site_analysis: { icon: '⛰', subtitle: 'Site characteristics and constraints' },
  neighbourhood: { icon: '🏙', subtitle: 'Surrounding context and local character' },
  environmental_context: { icon: '🌿', subtitle: 'Ecology, landscape and natural systems' },
  infrastructure: { icon: '🔌', subtitle: 'Utilities and supporting systems' },
  mobility_access: { icon: '🛣', subtitle: 'Movement, access and connectivity' },
  regulatory: { icon: '📜', subtitle: 'Planning, zoning and regulatory context' },
}

export default function ContextPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [knowledgeSets, setKnowledgeSets] = useState([])
  const [activeSet, setActiveSet] = useState('cultural_context')
  const [viewMode, setViewMode] = useState('hub') // 'hub' (Page 1) | 'cards' (Page 2)
  const [latestRun, setLatestRun] = useState(null)
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  // Research & Progress Modal state
  const [startModalOpen, setStartModalOpen] = useState(false)
  const [localKnowledge, setLocalKnowledge] = useState('')
  const [runningJob, setRunningJob] = useState(false)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [jobStep, setJobStep] = useState('')
  const [jobKind, setJobKind] = useState('initial_research')
  const [targetCardId, setTargetCardId] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [errorMsg, setErrorMsg] = useState(null)

  // Search, Aspect Filter, Priority/Register/Scale Filters, Sort & Layout
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAspectFilter, setActiveAspectFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all') // 'all' | 'high' | 'medium' | 'low' | 'unassigned'
  const [registerFilter, setRegisterFilter] = useState('all')
  const [scaleFilter, setScaleFilter] = useState('all')
  const [layoutMode, setLayoutMode] = useState('grid') // 'grid' | 'list'
  const [detailCard, setDetailCard] = useState(null)
  const [modifyModalCard, setModifyModalCard] = useState(null)
  const [modifyInstruction, setModifyInstruction] = useState('')

  // Manual Sentence Split state (Zero AI)
  const [splitParentCard, setSplitParentCard] = useState(null)
  const [splitSentences, setSplitSentences] = useState([])
  const [splitSelectedIndices, setSplitSelectedIndices] = useState([])
  const [splitCreateMode, setSplitCreateMode] = useState('separate') // 'separate' | 'combined'
  const [splitPriority, setSplitPriority] = useState('') // '' | 'high' | 'medium' | 'low'
  const [splitNote, setSplitNote] = useState('')
  const [splitConfirmLoading, setSplitConfirmLoading] = useState(false)

  const [noteModalCard, setNoteModalCard] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [priorityModalCard, setPriorityModalCard] = useState(null)
  const [selectedCardPriority, setSelectedCardPriority] = useState('')
  const [addCardModalOpen, setAddCardModalOpen] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [newCardContent, setNewCardContent] = useState('')
  const [deleteTargetCard, setDeleteTargetCard] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const pollRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    loadAll()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [projectId])

  useEffect(() => {
    if (runningJob) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [runningJob])

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
      const loadedCards = ctx.cards || []
      setCards(loadedCards)
      if (loadedCards.length > 0) {
        setViewMode('cards')
      }

      const job = ctx.latest_job
      if (job && (job.status === 'queued' || job.status === 'running')) {
        setRunningJob(true)
        setShowProgressModal(false)
        setJobKind(job.job_kind || 'initial_research')
        setTargetCardId(job.target_card_id || null)
        setJobStep(job.current_step || 'Researching Cultural Context...')
        if (job.job_kind === 'card_modification') setViewMode('cards')
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
          setShowProgressModal(false)
          setTargetCardId(null)
          if (st.status === 'failed') {
            setErrorMsg(st.error || 'Context research failed.')
          }
          const ctx = await getProjectContext(projectId, activeSet)
          setLatestRun(ctx.latest_run || null)
          const freshCards = ctx.cards || []
          setCards(freshCards)
          if (freshCards.length > 0) {
            setViewMode('cards')
          }
        }
      } catch (e) {
        console.warn('Context status poll error:', e)
      }
    }, 2000)
  }

  async function handleStartGeneration(e) {
    if (e) e.preventDefault()
    if (runningJob) return
    setStartModalOpen(false)
    setErrorMsg(null)
    setElapsedSeconds(0)
    setJobKind('initial_research')
    setTargetCardId(null)
    setRunningJob(true)
    setShowProgressModal(true)
    setJobStep('Resolving project location and consolidating context...')
    try {
      await generateProjectContext(projectId, activeSet, {
        architect_local_knowledge: localKnowledge.trim() || null,
      })
      startPolling()
    } catch (err) {
      setRunningJob(false)
      setShowProgressModal(false)
      setErrorMsg(err.message)
    }
  }

  async function handleStopOrCancel() {
    try {
      await cancelContextJob(projectId)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      setRunningJob(false)
      setShowProgressModal(false)
      setTargetCardId(null)
      setJobStep('')
    }
  }

  async function handleSubmitModify(e) {
    e.preventDefault()
    if (!modifyModalCard || !modifyInstruction.trim() || runningJob) return
    setErrorMsg(null)
    const targetId = modifyModalCard.id
    const targetTitle = modifyModalCard.title
    setModifyModalCard(null)
    setElapsedSeconds(0)
    setJobKind('card_modification')
    setTargetCardId(targetId)
    setRunningJob(true)
    setShowProgressModal(false) // Page 4 shows inline spinner on the card itself
    setJobStep(`Re-analyzing '${targetTitle}'...`)
    try {
      await modifyContextCard(projectId, targetId, {
        instruction: modifyInstruction.trim(),
        architect_local_knowledge: localKnowledge.trim() || null,
      })
      setModifyInstruction('')
      startPolling()
    } catch (err) {
      setRunningJob(false)
      setTargetCardId(null)
      setErrorMsg(err.message)
    }
  }

  async function handleSaveNote(e) {
    e.preventDefault()
    if (!noteModalCard || !noteText.trim() || runningJob) return
    try {
      const updated = await addContextCardNote(projectId, noteModalCard.id, noteText.trim())
      setCards(prev => prev.map(c => (c.id === noteModalCard.id ? updated : c)))
      setNoteModalCard(null)
      setNoteText('')
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  async function handleSavePriority(card, newPriority) {
    if (runningJob) return
    try {
      const updated = await updateContextCardPriority(projectId, card.id, newPriority || null)
      setCards(prev => prev.map(c => (c.id === card.id ? updated : c)))
      setPriorityModalCard(null)
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  async function handleCreateManualCard(e) {
    e.preventDefault()
    if (!newCardTitle.trim() || !newCardContent.trim() || runningJob) return
    try {
      const created = await createManualContextCard(projectId, activeSet, {
        title: newCardTitle.trim(),
        content: newCardContent.trim(),
      })
      setCards(prev => [...prev, created])
      setAddCardModalOpen(false)
      setNewCardTitle('')
      setNewCardContent('')
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  async function confirmDeleteCard() {
    if (!deleteTargetCard || deleteLoading) return
    setDeleteLoading(true)
    setErrorMsg(null)
    try {
      await deleteContextCard(projectId, deleteTargetCard.id)
      setCards(prev => prev.filter(c => c.id !== deleteTargetCard.id))
      setDeleteTargetCard(null)
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete Context Card.')
    } finally {
      setDeleteLoading(false)
    }
  }

  function handleOpenSplit(card) {
    if (runningJob || splitConfirmLoading) return
    setErrorMsg(null)
    const sentences = parseSentences(card.content || '')
    setSplitParentCard(card)
    setSplitSentences(sentences)
    setSplitSelectedIndices(sentences.length > 0 ? [0] : [])
    setSplitCreateMode('separate')
    setSplitPriority('')
    setSplitNote('')
  }

  function toggleSplitSentence(idx) {
    setSplitSelectedIndices(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    )
  }

  async function handleConfirmSplit() {
    if (!splitParentCard || splitConfirmLoading || splitSelectedIndices.length === 0) return
    setSplitConfirmLoading(true)
    setErrorMsg(null)
    try {
      const selectedCards = splitSelectedIndices.map(idx => ({
        content: splitSentences[idx],
        aspect_key: splitParentCard.sub_aspect_key,
        research_register: splitParentCard.research_register,
        confidence: splitParentCard.confidence,
      }))
      const res = await confirmSplitContextCard(projectId, splitParentCard.id, {
        selected_cards: selectedCards,
        create_mode: splitCreateMode,
        priority: splitPriority || null,
        note: splitNote.trim() || null,
      })
      const created = res.created_cards || []
      if (created.length > 0) {
        setCards(prev => [...prev, ...created])
      }
      setSplitParentCard(null)
      setSplitSentences([])
      setSplitSelectedIndices([])
      setSplitNote('')
    } catch (err) {
      setErrorMsg(err.message || 'Failed to split Context Card.')
    } finally {
      setSplitConfirmLoading(false)
    }
  }

  const aspectCounts = cards.reduce((acc, c) => {
    const k = c.sub_aspect_key || 'place_identity'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const filteredCards = cards
    .filter(c => {
      if (activeAspectFilter !== 'all' && c.sub_aspect_key !== activeAspectFilter) return false
      if (priorityFilter === 'unassigned' && c.priority) return false
      if (['high', 'medium', 'low'].includes(priorityFilter) && c.priority !== priorityFilter) return false
      if (registerFilter !== 'all' && c.research_register !== registerFilter) return false
      if (scaleFilter !== 'all' && !(c.tags || []).some(t => t.toLowerCase() === scaleFilter)) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.content || '').toLowerCase().includes(q) ||
        (c.aspect_title || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))

  return (
    <ProjectShell project={project} isTaskRunning={runningJob}>
      <div className="pov-container" style={{ maxWidth: '1160px', margin: '0 auto', padding: '24px' }}>

        {/* Background Running Banner (when Run in Background was clicked) */}
        {runningJob && !showProgressModal && (
          <div style={{
            background: '#eff6ff',
            border: '1.5px solid #93c5fd',
            borderRadius: '10px',
            padding: '12px 18px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="bui-spinner-inline" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
              <div>
                <strong style={{ fontSize: '13px', color: '#1e40af', display: 'block' }}>
                  {jobKind === 'card_modification' ? 'Updating Context Card in background' : 'Generating Cultural Context in background'} ({elapsedSeconds}s elapsed)
                </strong>
                <span style={{ fontSize: '12px', color: '#3b82f6' }}>{jobStep}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {jobKind !== 'card_modification' && (
                <button
                  type="button"
                  className="bui-btn"
                  onClick={() => setShowProgressModal(true)}
                  style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  View Progress
                </button>
              )}
              <button
                type="button"
                className="bui-btn bui-btn-outline"
                onClick={handleStopOrCancel}
                style={{ color: '#ef4444', borderColor: '#fecaca', background: '#ffffff', fontSize: '12px', padding: '6px 12px' }}
              >
                ⏹ Stop Task
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}

        {loading ? (
          <div className="brief-ui-loading"><span className="bui-spinner" /></div>
        ) : viewMode === 'hub' ? (
          /* ── PAGE 1: CONTEXT – KNOWLEDGE SETS (START) ─────────────────────────────── */
          <div>
            <header style={{ marginBottom: '22px' }}>
              <h1 className="pov-project-name" style={{ margin: '0 0 6px 0' }}>Context</h1>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-muted, #64748b)' }}>
                Build a deeper understanding of the project&apos;s context through eight Knowledge Sets.
              </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
              {knowledgeSets.map(ks => {
                const meta = KS_META[ks.id] || { icon: '📘', subtitle: ks.description }
                const isCultural = ks.id === 'cultural_context'
                const hasGenerated = isCultural && cards.length > 0
                return (
                  <div
                    key={ks.id}
                    className="pov-box"
                    style={{
                      padding: '22px 18px',
                      borderRadius: '12px',
                      border: ks.enabled ? '1.5px solid #8b5cf6' : '1px solid var(--border-color, #e2e8f0)',
                      background: 'var(--bg-surface, #ffffff)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                      opacity: ks.enabled ? 1 : 0.72,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '26px', marginBottom: '10px', color: ks.enabled ? '#5b21b6' : '#64748b' }}>
                        {meta.icon}
                      </div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                        {ks.name}
                      </h3>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: 1.45 }}>
                        {meta.subtitle}
                      </p>
                    </div>

                    {ks.enabled ? (
                      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
                        {hasGenerated ? (
                          <button
                            type="button"
                            disabled={runningJob}
                            onClick={() => setViewMode('cards')}
                            style={{
                              background: '#5b21b6',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px 18px',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: runningJob ? 'not-allowed' : 'pointer',
                              opacity: runningJob ? 0.55 : 1,
                            }}
                          >
                            View Cards ({cards.length}) →
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={runningJob}
                            onClick={() => setStartModalOpen(true)}
                            style={{
                              background: '#5b21b6',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px 22px',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: runningJob ? 'not-allowed' : 'pointer',
                              opacity: runningJob ? 0.55 : 1,
                            }}
                          >
                            ▶ Start
                          </button>
                        )}
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 600,
                          padding: '5px 14px',
                          borderRadius: '8px',
                          background: 'var(--bg-subtle, #f1f5f9)',
                          color: 'var(--text-muted, #64748b)',
                        }}
                      >
                        🔒 Locked
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* ── PAGE 2: KNOWLEDGE SET – CARDS (GENERATED) ────────────────────────────── */
          <div>
            {/* Top Bar */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  disabled={runningJob}
                  onClick={() => setViewMode('hub')}
                  className="bui-btn bui-btn-outline"
                  style={{ padding: '6px 10px', fontSize: '14px', opacity: runningJob ? 0.5 : 1, cursor: runningJob ? 'not-allowed' : 'pointer' }}
                  title="Back to Knowledge Sets"
                >
                  ←
                </button>
                <div>
                  <h1 className="pov-project-name" style={{ margin: 0, fontSize: '20px' }}>Cultural Context</h1>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted, #64748b)' }}>
                    A reading of the place, its building culture, materials, people, history and lived context.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {runningJob && jobKind === 'card_modification' ? (
                  <span style={{ fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '8px', background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe' }}>
                    ↻ Updating 1 card...
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '8px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                    ✓ Completed
                  </span>
                )}
                <button
                  type="button"
                  disabled={runningJob}
                  onClick={() => setAddCardModalOpen(true)}
                  style={{
                    background: '#6d28d9',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: runningJob ? 'not-allowed' : 'pointer',
                    opacity: runningJob ? 0.5 : 1,
                  }}
                >
                  + Add Context Card
                </button>
              </div>
            </header>

            {/* Aspect Lens Filter Pills */}
            {cards.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setActiveAspectFilter('all')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: activeAspectFilter === 'all' ? '#7c3aed' : 'var(--border-color, #e2e8f0)',
                    background: activeAspectFilter === 'all' ? '#f5f3ff' : 'var(--bg-surface, #ffffff)',
                    color: activeAspectFilter === 'all' ? '#5b21b6' : 'var(--text-main, #334155)',
                    cursor: 'pointer',
                  }}
                >
                  All ({cards.length})
                </button>
                {Object.entries(aspectCounts).map(([key, count]) => {
                  const sample = cards.find(c => c.sub_aspect_key === key)
                  const label = sample?.aspect_title || key.replace(/_/g, ' ')
                  const isSel = activeAspectFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveAspectFilter(key)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: isSel ? '#7c3aed' : 'var(--border-color, #e2e8f0)',
                        background: isSel ? '#f5f3ff' : 'var(--bg-surface, #ffffff)',
                        color: isSel ? '#5b21b6' : 'var(--text-main, #334155)',
                        cursor: 'pointer',
                      }}
                    >
                      {label} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Resolved Location Pill / Ambiguity Confirmation Gate */}
            {latestRun?.resolved_location && (
              <div
                className="pov-box"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: ['AMBIGUOUS', 'INSUFFICIENT'].includes(latestRun.location_confidence)
                    ? '1.5px solid #f59e0b'
                    : '1px solid var(--border-color, #e2e8f0)',
                  background: ['AMBIGUOUS', 'INSUFFICIENT'].includes(latestRun.location_confidence)
                    ? '#fffbeb'
                    : 'var(--bg-surface, #ffffff)',
                  marginBottom: '18px',
                  fontSize: '12.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div>
                  <strong>📍 Resolved Location:</strong> {latestRun.resolved_location.location_description || project?.location}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '8px',
                      background: ['AMBIGUOUS', 'INSUFFICIENT'].includes(latestRun.location_confidence) ? '#fef3c7' : '#eff6ff',
                      color: ['AMBIGUOUS', 'INSUFFICIENT'].includes(latestRun.location_confidence) ? '#92400e' : '#1d4ed8',
                    }}
                  >
                    {latestRun.location_confidence} · Attempts: {latestRun.attempt_count}/3
                  </span>
                </div>
                {['AMBIGUOUS', 'INSUFFICIENT'].includes(latestRun.location_confidence) && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const val = e.target.elements.confirmedLoc.value.trim()
                      if (!val || runningJob) return
                      try {
                        await confirmContextLocation(projectId, val)
                        await handleStartGeneration()
                      } catch (err) {
                        setErrorMsg(err.message)
                      }
                    }}
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}
                  >
                    <input
                      name="confirmedLoc"
                      type="text"
                      defaultValue={
                        [
                          latestRun.resolved_location?.locality,
                          latestRun.resolved_location?.city,
                          latestRun.resolved_location?.country,
                        ]
                          .filter(Boolean)
                          .join(', ') || project?.location || ''
                      }
                      placeholder="Confirm exact city, locality, and coordinates..."
                      style={{
                        flex: 1,
                        minWidth: '240px',
                        padding: '7px 11px',
                        borderRadius: '8px',
                        border: '1px solid #f59e0b',
                        fontSize: '12.5px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={runningJob}
                      style={{
                        background: '#d97706',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '7px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: runningJob ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Confirm Location &amp; Research
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Sub-header: Context Cards (N) + Search + Priority/Register/Scale Filters + Grid/List Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: '#4c1d95', borderBottom: '2px solid #6d28d9', paddingBottom: '4px' }}>
                Context Cards ({filteredCards.length})
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={runningJob}
                  placeholder="🔍 Search cards..."
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '12.5px',
                    minWidth: '175px',
                    opacity: runningJob ? 0.6 : 1,
                  }}
                />
                <select
                  value={priorityFilter}
                  onChange={e => setPriorityFilter(e.target.value)}
                  disabled={runningJob}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '12px',
                    background: 'var(--bg-surface, #ffffff)',
                    color: 'var(--text-main, #0f172a)',
                  }}
                >
                  <option value="all">⚑ Priority: All</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="unassigned">Unassigned</option>
                </select>
                <select
                  value={registerFilter}
                  onChange={e => setRegisterFilter(e.target.value)}
                  disabled={runningJob}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '12px',
                    background: 'var(--bg-surface, #ffffff)',
                    color: 'var(--text-main, #0f172a)',
                  }}
                >
                  <option value="all">Register: All</option>
                  <option value="DOCUMENTED">Documented</option>
                  <option value="PATTERN">Regional Pattern</option>
                  <option value="UNKNOWN">Learn Locally</option>
                  <option value="MIXED">Mixed Register</option>
                </select>
                <select
                  value={scaleFilter}
                  onChange={e => setScaleFilter(e.target.value)}
                  disabled={runningJob}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '12px',
                    background: 'var(--bg-surface, #ffffff)',
                    color: 'var(--text-main, #0f172a)',
                  }}
                >
                  <option value="all">Scale: All</option>
                  <option value="site">Site</option>
                  <option value="neighbourhood">Neighbourhood</option>
                  <option value="city">City</option>
                  <option value="region">Region</option>
                </select>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border-color, #cbd5e1)', borderRadius: '8px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('grid')}
                    title="Grid View"
                    style={{
                      padding: '5px 9px',
                      border: 'none',
                      background: layoutMode === 'grid' ? '#f5f3ff' : 'var(--bg-surface, #ffffff)',
                      color: layoutMode === 'grid' ? '#5b21b6' : 'var(--text-muted, #64748b)',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    ⊞
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('list')}
                    title="List View"
                    style={{
                      padding: '5px 9px',
                      border: 'none',
                      borderLeft: '1px solid var(--border-color, #cbd5e1)',
                      background: layoutMode === 'list' ? '#f5f3ff' : 'var(--bg-surface, #ffffff)',
                      color: layoutMode === 'list' ? '#5b21b6' : 'var(--text-muted, #64748b)',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    ☰
                  </button>
                </div>
              </div>
            </div>

            {/* Main Area: Cards Grid/List + Right-Side Manual Split Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: splitParentCard ? 'minmax(0, 1fr) 410px' : '1fr', gap: '18px', alignItems: 'start' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: (layoutMode === 'list' || splitParentCard) ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '16px',
                  alignItems: 'start',
                }}
              >
                {filteredCards.map(card => (
                  <ContextCard
                    key={card.id}
                    card={card}
                    busy={runningJob}
                    isUpdatingThisCard={runningJob && jobKind === 'card_modification' && targetCardId === card.id}
                    isSplittingThisCard={splitParentCard?.id === card.id}
                    splitSentences={splitParentCard?.id === card.id ? splitSentences : []}
                    splitSelectedIndices={splitParentCard?.id === card.id ? splitSelectedIndices : []}
                    onToggleSplitSentence={toggleSplitSentence}
                    onCancelSplit={() => setSplitParentCard(null)}
                    onConfirmSplit={handleConfirmSplit}
                    onOpenDetail={c => setDetailCard(c)}
                    onModify={c => {
                      setModifyModalCard(c)
                      setModifyInstruction('')
                    }}
                    onSplit={handleOpenSplit}
                    onAddNote={c => {
                      setNoteModalCard(c)
                      setNoteText('')
                    }}
                    onSetPriority={c => {
                      setPriorityModalCard(c)
                      setSelectedCardPriority(c.priority || '')
                    }}
                    onDelete={c => !deleteLoading && setDeleteTargetCard(c)}
                  />
                ))}
              </div>

              {/* Right-Side Manual Split Card Panel (Zero AI) */}
              {splitParentCard && (
                <aside
                  className="pov-box"
                  style={{
                    padding: '18px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    background: 'var(--bg-surface, #ffffff)',
                    position: 'sticky',
                    top: '20px',
                    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                      ✂ Split Card (Manual)
                    </h3>
                    <button
                      type="button"
                      disabled={splitConfirmLoading}
                      onClick={() => setSplitParentCard(null)}
                      style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
                    >
                      ×
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '0 0 14px 0' }}>
                    Create new card(s) from the selected content. No AI is used.
                  </p>

                  {/* Selected Points */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '12px', color: 'var(--text-main, #0f172a)' }}>
                      Selected Points ({splitSelectedIndices.length})
                    </strong>
                    {splitSelectedIndices.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSplitSelectedIndices([])}
                        style={{ background: 'none', border: 'none', color: '#6d28d9', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', maxHeight: '150px', overflowY: 'auto' }}>
                    {splitSelectedIndices.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', padding: '8px', border: '1px dashed var(--border-color, #cbd5e1)', borderRadius: '6px' }}>
                        Select one or more sentences on the card to extract.
                      </div>
                    ) : (
                      splitSelectedIndices.map(idx => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '8px',
                            padding: '7px 9px',
                            borderRadius: '6px',
                            background: 'var(--bg-subtle, #f8fafc)',
                            border: '1px solid var(--border-color, #e2e8f0)',
                            fontSize: '11.5px',
                            color: 'var(--text-main, #334155)',
                          }}
                        >
                          <span style={{ lineHeight: 1.4 }}>{splitSentences[idx]}</span>
                          <button
                            type="button"
                            onClick={() => toggleSplitSentence(idx)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Create As: Separate Cards vs One Card */}
                  <strong style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
                    Create As
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: splitCreateMode === 'separate' ? '1.5px solid #6d28d9' : '1px solid var(--border-color, #e2e8f0)',
                        background: splitCreateMode === 'separate' ? '#f5f3ff' : 'var(--bg-surface, #ffffff)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="splitCreateMode"
                        checked={splitCreateMode === 'separate'}
                        onChange={() => setSplitCreateMode('separate')}
                        style={{ marginTop: '3px', accentColor: '#6d28d9' }}
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: '12px' }}>Separate Cards ({splitSelectedIndices.length})</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Create one card for each selected point.</span>
                      </div>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: splitCreateMode === 'combined' ? '1.5px solid #6d28d9' : '1px solid var(--border-color, #e2e8f0)',
                        background: splitCreateMode === 'combined' ? '#f5f3ff' : 'var(--bg-surface, #ffffff)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="splitCreateMode"
                        checked={splitCreateMode === 'combined'}
                        onChange={() => setSplitCreateMode('combined')}
                        style={{ marginTop: '3px', accentColor: '#6d28d9' }}
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: '12px' }}>One Card</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Combine all selected points into a single card.</span>
                      </div>
                    </label>
                  </div>

                  {/* Card Details: Priority + Optional Note */}
                  <strong style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
                    Priority (optional)
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
                    {[
                      { val: '', label: 'None', activeBg: '#334155', activeColor: '#ffffff' },
                      { val: 'high', label: '⚑ High', activeBg: '#b91c1c', activeColor: '#ffffff' },
                      { val: 'medium', label: '⚑ Med', activeBg: '#b45309', activeColor: '#ffffff' },
                      { val: 'low', label: '⚑ Low', activeBg: '#047857', activeColor: '#ffffff' },
                    ].map(opt => (
                      <button
                        key={opt.val || 'none'}
                        type="button"
                        onClick={() => setSplitPriority(opt.val)}
                        style={{
                          padding: '5px 4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          background: splitPriority === opt.val ? opt.activeBg : 'var(--bg-surface, #ffffff)',
                          color: splitPriority === opt.val ? opt.activeColor : 'var(--text-main, #334155)',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                    Note (optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={splitNote}
                    onChange={e => setSplitNote(e.target.value)}
                    placeholder="Add a note for the new card(s)..."
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '12px', marginBottom: '12px' }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      className="bui-btn bui-btn-outline"
                      disabled={splitConfirmLoading}
                      onClick={() => setSplitParentCard(null)}
                      style={{ fontSize: '12px', padding: '7px 14px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={splitConfirmLoading || splitSelectedIndices.length === 0}
                      onClick={handleConfirmSplit}
                      style={{
                        background: '#6d28d9',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '7px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: (splitConfirmLoading || splitSelectedIndices.length === 0) ? 'not-allowed' : 'pointer',
                        opacity: (splitConfirmLoading || splitSelectedIndices.length === 0) ? 0.55 : 1,
                      }}
                    >
                      {splitConfirmLoading
                        ? 'Creating...'
                        : splitCreateMode === 'combined'
                          ? 'Create 1 Card'
                          : `Create ${splitSelectedIndices.length} Card${splitSelectedIndices.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}

        {/* ── START CULTURAL CONTEXT MODAL (Architect Local Knowledge) ───────────────── */}
        {startModalOpen && (
          <div className="bui-modal-overlay" onClick={() => setStartModalOpen(false)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', padding: '24px' }}>
              <h3 style={{ margin: '0 0 6px 0' }}>Start Cultural Context Research</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', margin: '0 0 14px 0' }}>
                REFLECT will resolve your project location from your Brief, Program, and site data, then research local building culture, materials, climate wisdom, and heritage from verified sources.
              </p>
              <form onSubmit={handleStartGeneration}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Architect&apos;s Local Knowledge (Optional — given authoritative precedence)
                </label>
                <textarea
                  rows={3}
                  value={localKnowledge}
                  onChange={e => setLocalKnowledge(e.target.value)}
                  placeholder="Share site observations, local crafts, neighbourhood history, or notes..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px', marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setStartModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" style={{ background: '#5b21b6', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    ▶ Start Research
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MIDDLE PROGRESS MODAL (Run in Background + Stop/Dismiss) ───────────────── */}
        {runningJob && showProgressModal && (
          <div className="bui-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(4px)', zIndex: 9999 }}>
            <div className="bui-modal" style={{ maxWidth: '480px', width: '92%', padding: '28px 26px', textAlign: 'center', borderRadius: '14px' }}>
              <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#f5f3ff', border: '1.5px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                <span className="bui-spinner-inline" style={{ width: '24px', height: '24px', borderWidth: '3px', borderColor: '#ddd6fe', borderTopColor: '#5b21b6' }} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700 }}>
                Researching Cultural Context
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--text-muted, #64748b)' }}>
                {project?.name || 'Project'} · Elapsed: <strong>{elapsedSeconds}s</strong>
              </p>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                {jobStep || 'Analyzing site context and gathering verified local research...'}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  onClick={() => setShowProgressModal(false)}
                  style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, color: '#2563eb', borderColor: '#93c5fd', background: '#eff6ff', borderRadius: '8px' }}
                >
                  ⚙ Run in Background
                </button>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  onClick={handleStopOrCancel}
                  style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, color: '#ef4444', borderColor: '#fecaca', background: '#ffffff', borderRadius: '8px' }}
                >
                  ⏹ Stop &amp; Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PAGE 3: MODIFY CARD MODAL (Mode B) ────────────────────────────────────── */}
        {modifyModalCard && (
          <div className="bui-modal-overlay" onClick={() => setModifyModalCard(null)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h3 style={{ margin: 0 }}>✎ Modify Card</h3>
                <button type="button" onClick={() => setModifyModalCard(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>×</button>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', margin: '0 0 14px 0' }}>
                Provide what you want to clarify, correct or add. This card will be sent to the Cultural Context agent for re-analysis.
              </p>

              <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-subtle, #f8fafc)', marginBottom: '14px' }}>
                <strong style={{ display: 'block', fontSize: '13.5px', marginBottom: '2px' }}>{modifyModalCard.title}</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                  {(modifyModalCard.content || '').slice(0, 140)}...
                </span>
              </div>

              <form onSubmit={handleSubmitModify}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Your instruction <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  maxLength={500}
                  value={modifyInstruction}
                  onChange={e => setModifyInstruction(e.target.value)}
                  placeholder="Describe the clarification, correction, or additional local research needed..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px', marginBottom: '4px' }}
                />
                <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted, #64748b)', marginBottom: '14px' }}>
                  {modifyInstruction.length} / 500
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setModifyModalCard(null)}>
                    Cancel
                  </button>
                  <button type="submit" style={{ background: '#5b21b6', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    ✈ Send to AI
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── CARD DETAIL & SOURCES MODAL ───────────────────────────────────────────── */}
        {detailCard && (
          <div className="bui-modal-overlay" onClick={() => setDetailCard(null)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '82vh', overflowY: 'auto', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0 }}>{detailCard.title}</h3>
                <button type="button" onClick={() => setDetailCard(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ fontSize: '13.5px', lineHeight: 1.65, whiteSpace: 'pre-wrap', marginBottom: '16px' }}>
                {detailCard.content}
              </div>
              {(detailCard.sources || []).length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '12px', marginBottom: '12px' }}>
                  <strong style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>Sources &amp; Evidence</strong>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {detailCard.sources.map(s => (
                      <li key={s.id}>
                        <strong>{s.title}</strong> {s.author_or_org ? `— ${s.author_or_org}` : ''}{' '}
                        {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>[Open ↗]</a>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(detailCard.architect_notes || []).length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '12px' }}>
                  <strong style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>Architect Field Notes</strong>
                  {detailCard.architect_notes.map(n => (
                    <div key={n.id} style={{ fontSize: '12px', padding: '6px 10px', background: '#eff6ff', borderLeft: '3px solid #2563eb', borderRadius: '4px', marginBottom: '6px' }}>
                      {n.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ADD NOTE MODAL (No AI) ────────────────────────────────────────────────── */}
        {noteModalCard && (
          <div className="bui-modal-overlay" onClick={() => setNoteModalCard(null)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', padding: '22px' }}>
              <h3 style={{ margin: '0 0 6px 0' }}>Add Architect Note</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '0 0 12px 0' }}>
                Saved directly to &ldquo;{noteModalCard.title}&rdquo; without triggering AI.
              </p>
              <form onSubmit={handleSaveNote}>
                <textarea
                  rows={3}
                  required
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Enter your site visit or field observation..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px', marginBottom: '12px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setNoteModalCard(null)}>Cancel</button>
                  <button type="submit" className="bui-btn bui-btn-primary">Save Note</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── SET PRIORITY MODAL (No AI) ───────────────────────────────────────────── */}
        {priorityModalCard && (
          <div className="bui-modal-overlay" onClick={() => setPriorityModalCard(null)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '22px' }}>
              <h3 style={{ margin: '0 0 6px 0' }}>Set Card Priority</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '0 0 14px 0' }}>
                Assign manual priority for &ldquo;{priorityModalCard.title}&rdquo; (no AI call).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {[
                  { val: 'high', label: '⚑ High — Critical contextual knowledge', color: '#b91c1c' },
                  { val: 'medium', label: '⚑ Medium — Relevant project understanding', color: '#b45309' },
                  { val: 'low', label: '⚑ Low — Supplementary / optional later', color: '#047857' },
                  { val: '', label: 'No Priority (Unassigned)', color: '#475569' },
                ].map(opt => (
                  <button
                    key={opt.val || 'none'}
                    type="button"
                    onClick={() => handleSavePriority(priorityModalCard, opt.val)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: (priorityModalCard.priority || '') === opt.val ? `1.5px solid ${opt.color}` : '1px solid var(--border-color, #cbd5e1)',
                      background: (priorityModalCard.priority || '') === opt.val ? 'var(--bg-subtle, #f8fafc)' : 'var(--bg-surface, #ffffff)',
                      color: opt.color,
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="bui-btn bui-btn-outline" onClick={() => setPriorityModalCard(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MANUAL ADD CONTEXT CARD MODAL ─────────────────────────────────────────── */}
        {addCardModalOpen && (
          <div className="bui-modal-overlay" onClick={() => setAddCardModalOpen(false)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', padding: '22px' }}>
              <h3 style={{ margin: '0 0 8px 0' }}>Add Context Card</h3>
              <form onSubmit={handleCreateManualCard}>
                <input
                  type="text"
                  required
                  value={newCardTitle}
                  onChange={e => setNewCardTitle(e.target.value)}
                  placeholder="Card Title"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px', marginBottom: '10px' }}
                />
                <textarea
                  rows={4}
                  required
                  value={newCardContent}
                  onChange={e => setNewCardContent(e.target.value)}
                  placeholder="Enter architectural context details..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px', marginBottom: '12px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setAddCardModalOpen(false)}>Cancel</button>
                  <button type="submit" className="bui-btn bui-btn-primary">Create Card</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── DELETE CONTEXT CARD CONFIRMATION DIALOG ───────────────────────────────── */}
        {deleteTargetCard && (
          <ConfirmModal
            title="Delete Context Card"
            message={`Are you sure you want to delete "${deleteTargetCard.title}"? Only this card will be removed; the remaining Cultural Context cards, your other Knowledge Sets, and project data will stay intact.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            confirmStyle="danger"
            loading={deleteLoading}
            onConfirm={confirmDeleteCard}
            onCancel={() => !deleteLoading && setDeleteTargetCard(null)}
          />
        )}
      </div>
    </ProjectShell>
  )
}
