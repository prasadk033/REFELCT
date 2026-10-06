import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getProject,
  getProgramSummary,
  listProgramItems,
  createProgramItem,
  updateProgramItem,
  deleteProgramItem,
  generateProgram,
  listProgramQuestions,
  createProgramQuestion,
  updateProgramQuestion,
  deleteProgramQuestion,
  getBriefSourcesForItem,
  listPublishedProgramVersions,
  getPublishedProgramVersion,
  publishProgram,
  listPublishedBriefVersions
} from '../api.js'
import ProjectShell from '../components/ProjectShell.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'

export default function ProgramPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [project, setProject] = useState(null)
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [questions, setQuestions] = useState([])
  const [publishedVersions, setPublishedVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Versioning & Mode State
  // selectedView: 'working' | 'published'
  const [selectedView, setSelectedView] = useState('working')
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [publishedVersionData, setPublishedVersionData] = useState(null)

  // Filter & Search State
  const [activeTab, setActiveTab] = useState('items') // 'items' | 'questions'
  const [typeFilter, setTypeFilter] = useState('ALL') // ALL, SPACE, REQUIREMENT, FUNCTION
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL, PROPOSED, UNDER_REVIEW, APPROVED
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'

  // Generation & Publishing State
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState('')
  const [showGenModal, setShowGenModal] = useState(true)
  const [genElapsedSeconds, setGenElapsedSeconds] = useState(0)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showPublishSuccessModal, setShowPublishSuccessModal] = useState(null) // { version_number, item_count }

  // Modal & Drawer State
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedItemDetail, setSelectedItemDetail] = useState(null)
  const [itemBriefSources, setItemBriefSources] = useState([])
  const [loadingBriefSources, setLoadingBriefSources] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false)
  const [newQuestionForm, setNewQuestionForm] = useState({ question: '', reason: '', program_item_id: '' })
  const [isSavingQuestion, setIsSavingQuestion] = useState(false)

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    type: 'SPACE',
    requirement: '',
    function: '',
    quantity: 1,
    capacity: '',
    area: '',
    unit: 'm²',
    key_considerations: '',
    notes: '',
    status: 'PROPOSED',
  })

  // Answering Questions State
  const [answeringQId, setAnsweringQId] = useState(null)
  const [answerInput, setAnswerInput] = useState('')

  function showToastMsg(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  // Initial Load
  useEffect(() => {
    if (!projectId) return
    loadData()
  }, [projectId])

  // Handle URL query trigger for generation (e.g. from Brief Publish handoff)
  useEffect(() => {
    if (searchParams.get('generate') === 'true' && summary && !isGenerating) {
      const sourceBriefVersionId = searchParams.get('sourceBriefVersionId')
      // Remove query param to prevent re-triggering
      setSearchParams({}, { replace: true })
      handleStartGeneration(sourceBriefVersionId)
    }
  }, [searchParams, summary])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [projData, sumData, itemsData, qData, pubVersions] = await Promise.all([
        getProject(projectId),
        getProgramSummary(projectId).catch(() => null),
        listProgramItems(projectId).catch(() => []),
        listProgramQuestions(projectId).catch(() => []),
        listPublishedProgramVersions(projectId, 5).catch(() => []),
      ])
      setProject(projData)
      setSummary(sumData)
      setItems(itemsData || [])
      setQuestions(qData || [])
      setPublishedVersions(pubVersions || [])
    } catch (err) {
      setError(err.message || 'Failed to load program data')
    } finally {
      setLoading(false)
    }
  }

  // Switch between working draft and published version
  async function handleSelectVersion(target) {
    if (target === 'working') {
      setSelectedView('working')
      setSelectedVersionId(null)
      setPublishedVersionData(null)
      // Refresh working items, summary, and questions
      const [working, sum, q] = await Promise.all([
        listProgramItems(projectId).catch(() => []),
        getProgramSummary(projectId).catch(() => null),
        listProgramQuestions(projectId).catch(() => []),
      ])
      setItems(working || [])
      setSummary(sum)
      setQuestions(q || [])
    } else {
      setSelectedView('published')
      setSelectedVersionId(target)
      try {
        const pub = await getPublishedProgramVersion(projectId, target)
        setPublishedVersionData(pub)
        setItems(pub.items || [])
      } catch (err) {
        showToastMsg(`Failed to load published version: ${err.message}`)
      }
    }
  }

  // Generation Trigger & Polling
  async function handleStartGeneration(briefVersionId = null) {
    if (selectedView !== 'working') {
      setError('Program generation only updates the working draft. Switch to Working Draft first.')
      return
    }
    setIsGenerating(true)
    setShowGenModal(true)
    setGenElapsedSeconds(0)
    setGenerationStep('Reviewing approved Brief cards...')

    let timerInterval = null
    let stepInterval = null
    let pollInterval = null

    function cleanup() {
      if (timerInterval) clearInterval(timerInterval)
      if (stepInterval) clearInterval(stepInterval)
      if (pollInterval) clearInterval(pollInterval)
    }

    try {
      await generateProgram(projectId, briefVersionId)
      showToastMsg('Program synthesis started...')

      // Increment elapsed seconds timer
      timerInterval = setInterval(() => {
        setGenElapsedSeconds(s => s + 1)
      }, 1000)

      // Friendly casual steps (no technical model names)
      const steps = [
        'Reviewing approved Brief cards...',
        'Synthesizing spatial requirements and dimensions...',
        'Formulating functional criteria and considerations...',
        'Identifying clarification questions...',
        'Structuring Program items and requirements...'
      ]
      let stepIdx = 0
      stepInterval = setInterval(() => {
        stepIdx = (stepIdx + 1) % steps.length
        setGenerationStep(steps[stepIdx])
      }, 2500)

      // Poll summary & items (up to 180s)
      const pollStart = Date.now()
      pollInterval = setInterval(async () => {
        try {
          const [updatedSum, updatedItems, updatedQ] = await Promise.all([
            getProgramSummary(projectId),
            listProgramItems(projectId),
            listProgramQuestions(projectId),
          ])

          const genStatus = updatedSum?.generation_status?.status

          if (genStatus === 'completed' || (updatedItems && updatedItems.length > 0)) {
            cleanup()
            setSummary(updatedSum)
            setItems(updatedItems || [])
            setQuestions(updatedQ || [])
            setIsGenerating(false)
            setSelectedView('working')
            showToastMsg(`✓ Program synthesized successfully! ${updatedItems?.length || 0} items created.`)
          } else if (genStatus === 'failed') {
            cleanup()
            setIsGenerating(false)
            const rawErr = updatedSum?.generation_status?.error || 'Generation encountered an error'
            setError(`Program synthesis failed: ${rawErr}`)
            showToastMsg('✕ Program synthesis failed')
          } else if (Date.now() - pollStart > 180000) {
            cleanup()
            setIsGenerating(false)
            showToastMsg('Program synthesis is running in the background. Your items will appear shortly.')
          }
        } catch (e) {
          // ignore transient errors during poll
        }
      }, 2000)
    } catch (err) {
      cleanup()
      setIsGenerating(false)
      setError(err.message || 'Failed to start program generation')
    }
  }

  // Publish Program
  async function handlePublishProgram() {
    setIsPublishing(true)
    try {
      const res = await publishProgram(projectId)
      setShowPublishSuccessModal({
        version_number: res.version_number,
        item_count: res.item_count,
        source_brief_version_number: res.source_brief_version_number,
      })
      // Refresh published versions list and summary
      const [pubVersions, updatedSum] = await Promise.all([
        listPublishedProgramVersions(projectId, 5),
        getProgramSummary(projectId),
      ])
      setPublishedVersions(pubVersions || [])
      setSummary(updatedSum)
    } catch (err) {
      setError(err.message || 'Failed to publish Program')
    } finally {
      setIsPublishing(false)
    }
  }

  // Item Detail Drawer
  async function openItemDetail(item) {
    setSelectedItemDetail(item)
    if (item.id && item.source_brief_card_ids && item.source_brief_card_ids.length > 0) {
      setLoadingBriefSources(true)
      try {
        const sources = await getBriefSourcesForItem(item.id, selectedVersionId)
        setItemBriefSources(sources || [])
      } catch (e) {
        setItemBriefSources([])
      } finally {
        setLoadingBriefSources(false)
      }
    } else {
      setItemBriefSources([])
    }
  }

  // Open Add Modal
  function handleOpenAddModal() {
    setFormData({
      name: '',
      type: 'SPACE',
      requirement: '',
      function: '',
      quantity: 1,
      capacity: '',
      area: '',
      unit: 'm²',
      key_considerations: '',
      notes: '',
      status: 'PROPOSED',
    })
    setShowAddModal(true)
  }

  // Open Edit Modal
  function handleOpenEditModal(item, e) {
    if (e) e.stopPropagation()
    setEditingItem(item)
    setFormData({
      name: item.name || '',
      type: item.type || 'SPACE',
      requirement: item.requirement || '',
      function: item.function || '',
      quantity: item.quantity || 1,
      capacity: item.capacity || '',
      area: item.area || '',
      unit: item.unit || 'm²',
      key_considerations: Array.isArray(item.key_considerations)
        ? item.key_considerations.join(', ')
        : (item.key_considerations || ''),
      notes: item.notes || '',
      status: item.status || 'PROPOSED',
    })
  }

  // Submit Add / Edit
  async function handleSubmitItem(e) {
    e.preventDefault()
    if (selectedView !== 'working') {
      setError('Published versions are read-only and cannot be modified.')
      return
    }
    if (!formData.name.trim()) return

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      requirement: formData.requirement.trim() || null,
      function: formData.function.trim() || null,
      quantity: formData.quantity ? parseInt(formData.quantity, 10) : 1,
      capacity: formData.capacity.trim() || null,
      area: formData.area ? parseFloat(formData.area) : null,
      unit: formData.unit.trim() || 'm²',
      key_considerations: formData.key_considerations
        ? formData.key_considerations.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      notes: formData.notes.trim() || null,
      status: formData.status,
    }

    try {
      if (editingItem) {
        const updated = await updateProgramItem(editingItem.id, payload)
        setItems(prev => prev.map(it => it.id === editingItem.id ? updated : it))
        showToastMsg(`Updated ${updated.program_item_code || updated.name}`)
        setEditingItem(null)
        if (selectedItemDetail?.id === editingItem.id) {
          setSelectedItemDetail(updated)
        }
      } else {
        const created = await createProgramItem(projectId, payload)
        setItems(prev => [...prev, created])
        showToastMsg(`Created ${created.program_item_code || created.name}`)
        setShowAddModal(false)
      }
      // Refresh summary
      const updatedSum = await getProgramSummary(projectId)
      setSummary(updatedSum)
    } catch (err) {
      setError(err.message || 'Failed to save program item')
    }
  }

  // Delete Item (uses custom ConfirmModal)
  function handleDeleteItem(item, e) {
    if (e) e.stopPropagation()
    if (selectedView !== 'working') {
      setError('Published versions are read-only and cannot be modified.')
      return
    }
    const label = item.program_item_code || item.name || 'Program Item'
    setConfirmModal({
      title: `Delete ${label}?`,
      message: `Are you sure you want to delete "${label}"? This will permanently remove it from the working draft.`,
      confirmLabel: 'Delete Item',
      cancelLabel: 'Keep Item',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await deleteProgramItem(item.id)
          setItems(prev => prev.filter(it => it.id !== item.id))
          showToastMsg(`✓ Deleted ${label}`)
          if (selectedItemDetail?.id === item.id) setSelectedItemDetail(null)
          const updatedSum = await getProgramSummary(projectId)
          setSummary(updatedSum)
        } catch (err) {
          setError(err.message || 'Failed to delete item')
        }
      }
    })
  }

  // Answer AI Question
  async function handleAnswerQuestion(qId) {
    if (selectedView !== 'working') {
      setError('Published versions are read-only and cannot be modified.')
      return
    }
    if (!answerInput.trim()) return
    try {
      const updated = await updateProgramQuestion(qId, {
        status: 'ANSWERED',
        answer: answerInput.trim()
      })
      setQuestions(prev => prev.map(q => q.id === qId ? updated : q))
      setAnsweringQId(null)
      setAnswerInput('')
      showToastMsg('Question answered')
      const updatedSum = await getProgramSummary(projectId)
      setSummary(updatedSum)
    } catch (err) {
      setError(err.message || 'Failed to update question')
    }
  }

  // Dismiss AI Question (uses custom ConfirmModal)
  function handleDismissQuestion(qId) {
    if (selectedView !== 'working') {
      setError('Published versions are read-only and cannot be modified.')
      return
    }
    setConfirmModal({
      title: 'Dismiss Question?',
      message: 'Are you sure you want to dismiss this clarification question?',
      confirmLabel: 'Dismiss',
      cancelLabel: 'Cancel',
      confirmStyle: 'warning',
      onConfirm: async () => {
        try {
          const updated = await updateProgramQuestion(qId, { status: 'DISMISSED' })
          setQuestions(prev => prev.map(q => q.id === qId ? updated : q))
          showToastMsg('Question dismissed')
          const updatedSum = await getProgramSummary(projectId)
          setSummary(updatedSum)
        } catch (err) {
          setError(err.message || 'Failed to dismiss question')
        }
      }
    })
  }

  // Delete Question (uses custom ConfirmModal)
  function handleDeleteQuestion(qId) {
    if (selectedView !== 'working') {
      setError('Published versions are read-only and cannot be modified.')
      return
    }
    setConfirmModal({
      title: 'Delete Question?',
      message: 'Are you sure you want to permanently delete this clarification question?',
      confirmLabel: 'Delete Question',
      cancelLabel: 'Cancel',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await deleteProgramQuestion(qId)
          setQuestions(prev => prev.filter(q => q.id !== qId))
          showToastMsg('✓ Question deleted')
          const updatedSum = await getProgramSummary(projectId)
          setSummary(updatedSum)
        } catch (err) {
          setError(err.message || 'Failed to delete question')
        }
      }
    })
  }

  // Create Manual Question
  async function handleCreateQuestion(e) {
    e.preventDefault()
    if (!newQuestionForm.question.trim()) return
    setIsSavingQuestion(true)
    try {
      const created = await createProgramQuestion(projectId, {
        question: newQuestionForm.question.trim(),
        reason: newQuestionForm.reason.trim() || 'Architect inquiry',
        program_item_id: newQuestionForm.program_item_id || null,
      })
      setQuestions(prev => [created, ...prev])
      setShowAddQuestionModal(false)
      setNewQuestionForm({ question: '', reason: '', program_item_id: '' })
      showToastMsg('✓ Clarification question added')
      const updatedSum = await getProgramSummary(projectId)
      setSummary(updatedSum)
    } catch (err) {
      setError(err.message || 'Failed to create clarification question')
    } finally {
      setIsSavingQuestion(false)
    }
  }

  // Filtered Items Computation
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      if (typeFilter !== 'ALL' && (it.type || '').toUpperCase() !== typeFilter) return false
      if (statusFilter !== 'ALL' && (it.status || '').toUpperCase() !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const codeMatch = (it.program_item_code || '').toLowerCase().includes(q)
        const nameMatch = (it.name || '').toLowerCase().includes(q)
        const reqMatch = (it.requirement || '').toLowerCase().includes(q)
        const funcMatch = (it.function || '').toLowerCase().includes(q)
        const notesMatch = (it.notes || '').toLowerCase().includes(q)
        if (!codeMatch && !nameMatch && !reqMatch && !funcMatch && !notesMatch) return false
      }
      return true
    })
  }, [items, typeFilter, statusFilter, searchQuery])

  // Filtered Questions
  const openQuestions = useMemo(() => {
    return questions.filter(q => q.status === 'OPEN')
  }, [questions])

  const isWorkingView = selectedView === 'working'
  const isPublishedView = selectedView === 'published'

  // Type Badges Helper
  function getTypeBadge(type) {
    const t = (type || '').toUpperCase()
    if (t === 'SPACE') {
      return <span className="prog-badge prog-badge-space">SPACE</span>
    }
    if (t === 'REQUIREMENT') {
      return <span className="prog-badge prog-badge-req">REQUIREMENT</span>
    }
    if (t === 'FUNCTION') {
      return <span className="prog-badge prog-badge-func">FUNCTION</span>
    }
    return <span className="prog-badge prog-badge-other">{t || 'OTHER'}</span>
  }

  // Status Badges Helper
  function getStatusBadge(status) {
    const s = (status || '').toUpperCase()
    if (s === 'APPROVED') {
      return <span className="prog-status-badge prog-status-approved">✓ Approved</span>
    }
    if (s === 'UNDER_REVIEW') {
      return <span className="prog-status-badge prog-status-review">⚠️ Under Review</span>
    }
    return <span className="prog-status-badge prog-status-proposed">○ Proposed</span>
  }

  return (
    <ProjectShell project={project}>
      <div className="prog-page-root">

        {/* Toast Notification */}
        {toast && (
          <div className="prog-toast">
            <span>{toast}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="prog-alert prog-alert-error">
            <span>{error}</span>
            <button className="prog-alert-close" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* ── Main Header ──────────────────────────────────────────────────────── */}
        <header className="prog-header">
          <div className="prog-header-left">
            <div className="prog-breadcrumb" onClick={() => navigate(`/projects/${projectId}`)}>
              <span>← {project?.name || 'Project Overview'}</span>
              <span className="prog-bc-sep">&gt;</span>
              <span className="prog-bc-active">Program</span>
            </div>

            <div className="prog-title-row">
              <h1 className="prog-title">
                {isWorkingView
                  ? 'Program (Working Draft)'
                  : `Program V${publishedVersionData?.version_number || ''}`}
              </h1>

              {isWorkingView ? (
                <div className="prog-pill prog-pill-working">
                  <span className="prog-pill-dot" />
                  <span>Working Draft · Editable</span>
                </div>
              ) : (
                <div className="prog-pill prog-pill-locked">
                  <span>🔒 Published · Read-only</span>
                </div>
              )}
            </div>

            <div className="prog-subtitle-row">
              {isWorkingView ? (
                <span>
                  {summary?.source_brief_version
                    ? `Based on published Brief V${summary.source_brief_version.version_number} (${summary.source_brief_version.card_count} cards)`
                    : summary?.can_generate
                    ? 'Published Brief available for Program generation.'
                    : 'A Brief must be published before generating the Program.'}
                </span>
              ) : (
                <span>
                  Published {publishedVersionData?.published_at ? new Date(publishedVersionData.published_at).toLocaleDateString() : ''}
                  {publishedVersionData?.source_brief_version_number && ` · Source: Brief V${publishedVersionData.source_brief_version_number}`}
                  {publishedVersionData?.previous_program_version_id && ` · Previous: Program V${publishedVersionData.previous_program_version_id}`}
                </span>
              )}
            </div>
          </div>

          <div className="prog-header-right">
            {/* Version Selector Dropdown */}
            <div className="prog-version-selector-wrap">
              <label className="prog-vlabel">Version:</label>
              <select
                className="prog-version-select"
                value={isWorkingView ? 'working' : selectedVersionId || 'working'}
                onChange={(e) => handleSelectVersion(e.target.value)}
              >
                <option value="working">
                  Current Draft {summary?.has_unpublished_changes ? '● (Unpublished Changes)' : ''}
                </option>
                {publishedVersions.map(v => (
                  <option key={v.id} value={v.id}>
                    Published V{v.version_number} ({v.item_count} items)
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons (Publish Program at top right corner) */}
            {isWorkingView ? (
              <div className="prog-header-actions">
                <button
                  className="prog-btn prog-btn-outline"
                  onClick={handleOpenAddModal}
                  disabled={isGenerating || isPublishing}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add Item</span>
                </button>

                {/* Only show Generate Program if no items exist yet */}
                {items.length === 0 && (
                  <button
                    className="prog-btn prog-btn-secondary"
                    onClick={() => handleStartGeneration()}
                    disabled={isGenerating || !summary?.can_generate}
                    title={!summary?.can_generate ? 'Publish a Brief first to generate Program' : ''}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>Generate Program</span>
                  </button>
                )}

                {/* Publish Program positioned at the top right corner */}
                <button
                  className="prog-btn prog-btn-primary"
                  onClick={handlePublishProgram}
                  disabled={isPublishing || isGenerating || !summary?.has_unpublished_changes || items.length === 0}
                  title={!summary?.has_unpublished_changes ? 'No unpublished changes to publish' : ''}
                  style={{ fontWeight: 700 }}
                >
                  {isPublishing ? 'Publishing...' : 'Publish Program'}
                </button>
              </div>
            ) : (
              <div className="prog-header-actions">
                <button
                  className="prog-btn prog-btn-primary"
                  onClick={() => handleSelectVersion('working')}
                >
                  <span>Return to Current Draft →</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Published Read-Only Warning Banner ─────────────────────────────────── */}
        {isPublishedView && (
          <div className="prog-banner-readonly">
            <span className="prog-banner-icon">🔒</span>
            <div>
              <strong>Viewing Immutable Snapshot: Program V{publishedVersionData?.version_number}</strong>
              <p>This published version cannot be edited or modified. To make updates, return to the Current Draft.</p>
            </div>
            <button
              className="prog-btn prog-btn-sm prog-btn-outline"
              onClick={() => handleSelectVersion('working')}
            >
              Switch to Draft
            </button>
          </div>
        )}

        {/* ── Centered Program Generation In-Progress Modal ──────────────────────── */}
        {isGenerating && showGenModal && (
          <div
            className="prog-modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(5, 7, 12, 0.75)',
              backdropFilter: 'blur(6px)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              className="prog-modal"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '480px',
                width: '90%',
                background: '#ffffff',
                borderRadius: '16px',
                padding: '36px 30px',
                textAlign: 'center',
                boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
                border: '1px solid #e2e8f0',
              }}
            >
              {/* Circular Animated Badge */}
              <div style={{ marginBottom: '18px' }}>
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: '#eff6ff',
                    border: '2px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                    color: '#2563eb',
                    fontSize: '24px',
                  }}
                >
                  <span className="prog-gen-spinner-inline" />
                </div>
              </div>

              <h2
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#0f172a',
                  marginBottom: '8px',
                  letterSpacing: '-0.02em',
                }}
              >
                Synthesizing Architectural Program
              </h2>

              <p
                style={{
                  fontSize: '13px',
                  color: '#64748b',
                  marginBottom: '24px',
                  lineHeight: 1.5,
                }}
              >
                Translating approved Brief requirements into spaces, functions, and criteria for{' '}
                <strong style={{ color: '#0f172a' }}>{project?.name || 'this project'}</strong>
              </p>

              {/* Progress Step Banner */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '20px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: '#2563eb',
                    marginBottom: '4px',
                  }}
                >
                  {generationStep}
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Elapsed: {genElapsedSeconds}s • Please keep this window open
                </div>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: '#e2e8f0',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                    borderRadius: '999px',
                    width: `${Math.min(95, Math.max(10, Math.round((genElapsedSeconds / 120) * 90)))}%`,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="prog-btn prog-btn-outline"
                  onClick={() => setShowGenModal(false)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    color: '#64748b',
                    borderColor: '#cbd5e1',
                  }}
                >
                  Run in Background
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Background Floating Pill (when modal is dismissed) ────────────────── */}
        {isGenerating && !showGenModal && (
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: '#ffffff',
              border: '1px solid #bfdbfe',
              boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.2)',
              borderRadius: '12px',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 1000,
            }}
          >
            <span className="prog-gen-spinner-inline" style={{ width: '16px', height: '16px' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                Synthesizing Program ({genElapsedSeconds}s)
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {generationStep}
              </div>
            </div>
            <button
              onClick={() => setShowGenModal(true)}
              style={{
                background: '#eff6ff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              View
            </button>
          </div>
        )}

        {/* ── Metrics Summary Bar ──────────────────────────────────────────────── */}
        <section className="prog-metrics-bar">
          <div className="prog-metric-card">
            <span className="prog-metric-label">Total Items</span>
            <span className="prog-metric-value">{items.length}</span>
          </div>
          <div className="prog-metric-card">
            <span className="prog-metric-label">Spaces</span>
            <span className="prog-metric-value prog-color-space">
              {items.filter(i => (i.type || '').toUpperCase() === 'SPACE').length}
            </span>
          </div>
          <div className="prog-metric-card">
            <span className="prog-metric-label">Requirements</span>
            <span className="prog-metric-value prog-color-req">
              {items.filter(i => (i.type || '').toUpperCase() === 'REQUIREMENT').length}
            </span>
          </div>
          <div className="prog-metric-card">
            <span className="prog-metric-label">Functions</span>
            <span className="prog-metric-value prog-color-func">
              {items.filter(i => (i.type || '').toUpperCase() === 'FUNCTION').length}
            </span>
          </div>
          <div className="prog-metric-card">
            <span className="prog-metric-label">Under Review</span>
            <span className="prog-metric-value prog-color-review">
              {items.filter(i => (i.status || '').toUpperCase() === 'UNDER_REVIEW').length}
            </span>
          </div>
          <div
            className={`prog-metric-card prog-metric-clickable ${openQuestions.length > 0 ? 'has-questions' : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            <span className="prog-metric-label">AI Questions</span>
            <span className="prog-metric-value prog-color-questions">
              {openQuestions.length}
            </span>
          </div>
        </section>

        {/* ── Main Tab Navigation: Program Items vs AI Questions ────────────────── */}
        <div className="prog-tabs-bar">
          <button
            className={`prog-tab-btn ${activeTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            Program Items <span className="prog-tab-count">{items.length}</span>
          </button>
          <button
            className={`prog-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            AI Clarifications & Questions{' '}
            {openQuestions.length > 0 && (
              <span className="prog-tab-count prog-tab-count-alert">{openQuestions.length}</span>
            )}
          </button>
        </div>

        {/* ── TAB 1: PROGRAM ITEMS ──────────────────────────────────────────────── */}
        {activeTab === 'items' && (
          <div className="prog-items-container">
            {/* Toolbar Filters */}
            <div className="prog-toolbar">
              <div className="prog-toolbar-left">
                {/* Search */}
                <div className="prog-search-box">
                  <span className="prog-search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by code, name, requirement..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button className="prog-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                  )}
                </div>

                {/* Filter by Type */}
                <select
                  className="prog-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="ALL">All Types</option>
                  <option value="SPACE">Spaces</option>
                  <option value="REQUIREMENT">Requirements</option>
                  <option value="FUNCTION">Functions</option>
                </select>

                {/* Filter by Status */}
                <select
                  className="prog-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PROPOSED">Proposed</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="APPROVED">Approved</option>
                </select>
              </div>

              <div className="prog-toolbar-right">
                <span className="prog-item-counter">
                  Showing {filteredItems.length} of {items.length} items
                </span>

                {/* View Mode Toggle */}
                <div className="prog-view-toggle">
                  <button
                    className={`prog-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                    onClick={() => setViewMode('table')}
                    title="Table View"
                  >
                    ☰ Table
                  </button>
                  <button
                    className={`prog-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                    onClick={() => setViewMode('cards')}
                    title="Card View"
                  >
                    ⊞ Cards
                  </button>
                </div>
              </div>
            </div>

            {/* Empty State */}
            {filteredItems.length === 0 && (
              <div className="prog-empty-state">
                <div className="prog-empty-icon">📋</div>
                <h3>{items.length === 0 ? 'No Program Items Yet' : 'No Matching Program Items'}</h3>
                <p>
                  {items.length === 0
                    ? isWorkingView
                      ? summary?.can_generate
                        ? 'Click "Generate Program" to create structured spatial and functional requirements from your published Brief.'
                        : 'To get started, first publish a Brief version in the Brief workspace.'
                      : 'This published version contains no program items.'
                    : 'Try clearing your search query or filters to see all items.'}
                </p>
                {items.length === 0 && isWorkingView && (
                  <div className="prog-empty-actions">
                    {summary?.can_generate && (
                      <button
                        className="prog-btn prog-btn-primary"
                        onClick={() => handleStartGeneration()}
                        disabled={isGenerating}
                      >
                        Generate Program from Brief
                      </button>
                    )}
                    <button
                      className="prog-btn prog-btn-outline"
                      onClick={handleOpenAddModal}
                    >
                      + Add Manual Item
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Table View ──────────────────────────────────────────────────── */}
            {filteredItems.length > 0 && viewMode === 'table' && (
              <div className="prog-table-wrapper">
                <table className="prog-table">
                  <thead>
                    <tr>
                      <th style={{ width: '95px', whiteSpace: 'nowrap' }}>Code</th>
                      <th style={{ minWidth: '180px' }}>Name</th>
                      <th style={{ width: '120px' }}>Type</th>
                      <th>Requirement / Function</th>
                      <th style={{ width: '100px' }}>Area</th>
                      <th style={{ width: '90px' }}>Capacity</th>
                      <th style={{ width: '120px' }}>Status</th>
                      <th style={{ width: '100px' }}>Brief Cards</th>
                      {isWorkingView && <th style={{ width: '90px' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <tr
                        key={item.id}
                        className={`prog-table-row ${selectedItemDetail?.id === item.id ? 'selected' : ''}`}
                        onClick={() => openItemDetail(item)}
                      >
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="prog-code-pill">{item.program_item_code || '—'}</span>
                        </td>
                        <td>
                          <div className="prog-item-name-cell">
                            <span className="prog-item-name">{item.name}</span>
                            {item.quantity && item.quantity > 1 && (
                              <span className="prog-qty-pill">Qty: {item.quantity}</span>
                            )}
                          </div>
                        </td>
                        <td>{getTypeBadge(item.type)}</td>
                        <td>
                          <div className="prog-req-cell">
                            {item.requirement || item.function || item.notes || (
                              <span className="prog-text-muted">No description</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {item.area ? (
                            <span className="prog-area-text">
                              {item.area} {item.unit || 'm²'}
                            </span>
                          ) : (
                            <span className="prog-text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {item.capacity ? (
                            <span className="prog-capacity-text">{item.capacity}</span>
                          ) : (
                            <span className="prog-text-muted">—</span>
                          )}
                        </td>
                        <td>{getStatusBadge(item.status)}</td>
                        <td>
                          {item.source_brief_card_ids && item.source_brief_card_ids.length > 0 ? (
                            <span className="prog-brief-source-pill">
                              📎 {item.source_brief_card_ids.length} Cards
                            </span>
                          ) : (
                            <span className="prog-text-muted">—</span>
                          )}
                        </td>
                        {isWorkingView && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="prog-action-buttons">
                              <button
                                className="prog-action-btn"
                                onClick={(e) => handleOpenEditModal(item, e)}
                                title="Edit Item"
                              >
                                ✎
                              </button>
                              <button
                                className="prog-action-btn prog-action-del"
                                onClick={(e) => handleDeleteItem(item, e)}
                                title="Delete Item"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Cards View ──────────────────────────────────────────────────── */}
            {filteredItems.length > 0 && viewMode === 'cards' && (
              <div className="prog-cards-grid">
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={`prog-card-item ${selectedItemDetail?.id === item.id ? 'selected' : ''}`}
                    onClick={() => openItemDetail(item)}
                  >
                    <div className="prog-card-top">
                      <span className="prog-code-pill">{item.program_item_code || '—'}</span>
                      {getTypeBadge(item.type)}
                      {getStatusBadge(item.status)}
                    </div>

                    <h4 className="prog-card-title">{item.name}</h4>

                    {item.requirement && (
                      <p className="prog-card-desc">{item.requirement}</p>
                    )}
                    {item.function && (
                      <p className="prog-card-func"><strong>Function:</strong> {item.function}</p>
                    )}

                    <div className="prog-card-specs">
                      {item.area && (
                        <span className="prog-spec-item">
                          📐 {item.area} {item.unit || 'm²'}
                        </span>
                      )}
                      {item.capacity && (
                        <span className="prog-spec-item">
                          👥 {item.capacity}
                        </span>
                      )}
                      {item.quantity && item.quantity > 1 && (
                        <span className="prog-spec-item">
                          🔢 Qty: {item.quantity}
                        </span>
                      )}
                    </div>

                    <div className="prog-card-footer">
                      {item.source_brief_card_ids && item.source_brief_card_ids.length > 0 ? (
                        <span className="prog-brief-source-pill">
                          📎 {item.source_brief_card_ids.length} Brief Cards
                        </span>
                      ) : (
                        <span />
                      )}

                      {isWorkingView && (
                        <div className="prog-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="prog-action-btn"
                            onClick={(e) => handleOpenEditModal(item, e)}
                            title="Edit"
                          >
                            ✎
                          </button>
                          <button
                            className="prog-action-btn prog-action-del"
                            onClick={(e) => handleDeleteItem(item, e)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: AI QUESTIONS & CLARIFICATIONS ──────────────────────────────── */}
        {activeTab === 'questions' && (
          <div className="prog-questions-container">
            <div className="prog-questions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2>AI Clarification Questions ({questions.length})</h2>
                <p>
                  Questions identified by AI analysis and project architects to resolve ambiguities, missing areas, or operational criteria.
                </p>
              </div>
              {isWorkingView && (
                <button
                  type="button"
                  className="prog-btn prog-btn-primary"
                  onClick={() => setShowAddQuestionModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>+</span> Add Clarification Question
                </button>
              )}
            </div>

            {questions.length === 0 ? (
              <div className="prog-empty-state" style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', margin: '20px 0' }}>
                <div className="prog-empty-icon" style={{ fontSize: '32px', marginBottom: '12px' }}>💡</div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>No Clarification Questions Yet</h3>
                <p style={{ maxWidth: '480px', margin: '0 auto 20px auto', color: '#64748b', fontSize: '13.5px', lineHeight: 1.5 }}>
                  The AI identified no open questions for this dataset, or questions have been answered. You can add new clarification inquiries for the client or team anytime.
                </p>
                {isWorkingView && (
                  <button
                    type="button"
                    className="prog-btn prog-btn-primary"
                    onClick={() => setShowAddQuestionModal(true)}
                  >
                    + Add Clarification Question
                  </button>
                )}
              </div>
            ) : (
              <div className="prog-questions-grid">
                {questions.map(q => (
                  <div
                    key={q.id}
                    className={`prog-question-card ${q.status.toLowerCase()}`}
                  >
                    <div className="prog-q-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={`prog-q-status ${q.status.toLowerCase()}`}>
                          {q.status}
                        </span>
                        {q.program_item_id && (
                          <span className="prog-q-item-ref">
                            Linked to: {items.find(i => i.id === q.program_item_id)?.name || 'Program Item'}
                          </span>
                        )}
                      </div>
                      {isWorkingView && (
                        <button
                          type="button"
                          className="prog-action-btn prog-action-del"
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Delete Question"
                          style={{ width: '28px', height: '28px' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <h4 className="prog-q-text">{q.question}</h4>

                    {q.reason && (
                      <p className="prog-q-reason">
                        <strong>Architectural Context:</strong> {q.reason}
                      </p>
                    )}

                    {q.answer && (
                      <div className="prog-q-answer-box">
                        <strong>Architect's Answer:</strong>
                        <p>{q.answer}</p>
                      </div>
                    )}

                    {isWorkingView && q.status === 'OPEN' && (
                      <div className="prog-q-actions">
                        {answeringQId === q.id ? (
                          <div className="prog-q-answer-form">
                            <textarea
                              rows={3}
                              placeholder="Enter architectural answer or specification..."
                              value={answerInput}
                              onChange={(e) => setAnswerInput(e.target.value)}
                            />
                            <div className="prog-q-form-btns">
                              <button
                                className="prog-btn prog-btn-sm prog-btn-primary"
                                onClick={() => handleAnswerQuestion(q.id)}
                              >
                                Save Answer
                              </button>
                              <button
                                className="prog-btn prog-btn-sm prog-btn-outline"
                                onClick={() => {
                                  setAnsweringQId(null)
                                  setAnswerInput('')
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="prog-q-btn-group">
                            <button
                              className="prog-btn prog-btn-sm prog-btn-secondary"
                              onClick={() => {
                                setAnsweringQId(q.id)
                                setAnswerInput('')
                              }}
                            >
                              Answer Question
                            </button>
                            <button
                              className="prog-btn prog-btn-sm prog-btn-outline"
                              onClick={() => handleDismissQuestion(q.id)}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Item Detail Drawer (Slide-Over) ─────────────────────────────────── */}
        {selectedItemDetail && (
          <aside className="prog-detail-drawer">
            <div className="prog-drawer-header">
              <div className="prog-drawer-header-left">
                <span className="prog-code-pill">{selectedItemDetail.program_item_code}</span>
                {getTypeBadge(selectedItemDetail.type)}
                {getStatusBadge(selectedItemDetail.status)}
              </div>
              <button
                className="prog-drawer-close"
                onClick={() => setSelectedItemDetail(null)}
              >
                ✕
              </button>
            </div>

            <div className="prog-drawer-body">
              <h2 className="prog-drawer-title">{selectedItemDetail.name}</h2>

              {/* Spatial / Quantitative Specs */}
              <div className="prog-drawer-specs-grid">
                <div className="prog-dspec-box">
                  <span className="prog-dspec-lbl">Quantity</span>
                  <span className="prog-dspec-val">{selectedItemDetail.quantity || 1}</span>
                </div>
                <div className="prog-dspec-box">
                  <span className="prog-dspec-lbl">Area</span>
                  <span className="prog-dspec-val">
                    {selectedItemDetail.area ? `${selectedItemDetail.area} ${selectedItemDetail.unit || 'm²'}` : '—'}
                  </span>
                </div>
                <div className="prog-dspec-box">
                  <span className="prog-dspec-lbl">Capacity</span>
                  <span className="prog-dspec-val">{selectedItemDetail.capacity || '—'}</span>
                </div>
              </div>

              {/* Requirement Section */}
              <div className="prog-drawer-section">
                <h3>Requirement Specification</h3>
                <p>{selectedItemDetail.requirement || 'No specific requirement text specified.'}</p>
              </div>

              {/* Function Section */}
              {selectedItemDetail.function && (
                <div className="prog-drawer-section">
                  <h3>Intended Function</h3>
                  <p>{selectedItemDetail.function}</p>
                </div>
              )}

              {/* Key Considerations */}
              {selectedItemDetail.key_considerations && selectedItemDetail.key_considerations.length > 0 && (
                <div className="prog-drawer-section">
                  <h3>Key Considerations</h3>
                  <ul className="prog-drawer-list">
                    {selectedItemDetail.key_considerations.map((kc, idx) => (
                      <li key={idx}>{kc}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Notes */}
              {selectedItemDetail.notes && (
                <div className="prog-drawer-section">
                  <h3>Notes</h3>
                  <p>{selectedItemDetail.notes}</p>
                </div>
              )}

              {/* Source Brief Cards Provenance */}
              <div className="prog-drawer-section">
                <h3>Source Brief Cards ({selectedItemDetail.source_brief_card_ids?.length || 0})</h3>
                {loadingBriefSources ? (
                  <p className="prog-text-muted">Loading source Brief Cards...</p>
                ) : itemBriefSources.length > 0 ? (
                  <div className="prog-drawer-cards-list">
                    {itemBriefSources.map(sc => (
                      <div key={sc.id} className="prog-source-card-snippet">
                        <div className="prog-sc-top">
                          <span className="prog-sc-type">{sc.card_type}</span>
                          <span className="prog-sc-doc">{sc.source_document || 'Architect Direct Input'}</span>
                        </div>
                        <h4 className="prog-sc-title">{sc.title}</h4>
                        <p className="prog-sc-content">{sc.content}</p>
                      </div>
                    ))}
                  </div>
                ) : selectedItemDetail.source_brief_card_ids?.length > 0 ? (
                  <p className="prog-text-muted">
                    Referenced Card IDs: {selectedItemDetail.source_brief_card_ids.join(', ')}
                  </p>
                ) : (
                  <p className="prog-text-muted">No explicit Brief Cards linked.</p>
                )}
              </div>
            </div>

            {isWorkingView && (
              <div className="prog-drawer-footer">
                <button
                  className="prog-btn prog-btn-primary"
                  onClick={() => handleOpenEditModal(selectedItemDetail)}
                >
                  Edit Item
                </button>
                <button
                  className="prog-btn prog-btn-danger"
                  onClick={(e) => handleDeleteItem(selectedItemDetail, e)}
                >
                  Delete Item
                </button>
              </div>
            )}
          </aside>
        )}

        {/* ── Add / Edit Item Modal ───────────────────────────────────────────── */}
        {(showAddModal || editingItem) && (
          <div className="prog-modal-overlay" onClick={() => { setShowAddModal(false); setEditingItem(null); }}>
            <div className="prog-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="prog-modal-header">
                <h2>{editingItem ? `Edit ${editingItem.program_item_code || 'Item'}` : 'Add Program Item'}</h2>
                <button className="prog-modal-close" onClick={() => { setShowAddModal(false); setEditingItem(null); }}>✕</button>
              </div>

              <form onSubmit={handleSubmitItem} className="prog-modal-form">
                <div className="prog-form-row">
                  <div className="prog-form-group flex-2">
                    <label>Item Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Master Bedroom, Loading Bay, Acoustic Isolation"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="prog-form-group flex-1">
                    <label>Type *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="SPACE">SPACE</option>
                      <option value="REQUIREMENT">REQUIREMENT</option>
                      <option value="FUNCTION">FUNCTION</option>
                    </select>
                  </div>
                </div>

                <div className="prog-form-group">
                  <label>Requirement Description</label>
                  <textarea
                    rows={2}
                    placeholder="Specific architectural requirement..."
                    value={formData.requirement}
                    onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
                  />
                </div>

                <div className="prog-form-group">
                  <label>Intended Function</label>
                  <textarea
                    rows={2}
                    placeholder="Functional use and operational characteristics..."
                    value={formData.function}
                    onChange={(e) => setFormData({ ...formData, function: e.target.value })}
                  />
                </div>

                <div className="prog-form-row">
                  <div className="prog-form-group flex-1">
                    <label>Area</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 45"
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    />
                  </div>
                  <div className="prog-form-group flex-1">
                    <label>Unit</label>
                    <input
                      type="text"
                      placeholder="m² or sq ft"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    />
                  </div>
                  <div className="prog-form-group flex-1">
                    <label>Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    />
                  </div>
                  <div className="prog-form-group flex-1">
                    <label>Capacity</label>
                    <input
                      type="text"
                      placeholder="e.g. 30 people"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    />
                  </div>
                </div>

                <div className="prog-form-group">
                  <label>Key Considerations (comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. Daylight required, Heavy floor loading, Sound attenuation"
                    value={formData.key_considerations}
                    onChange={(e) => setFormData({ ...formData, key_considerations: e.target.value })}
                  />
                </div>

                <div className="prog-form-row">
                  <div className="prog-form-group flex-2">
                    <label>Notes</label>
                    <input
                      type="text"
                      placeholder="Additional remarks..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                  <div className="prog-form-group flex-1">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="PROPOSED">Proposed</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="APPROVED">Approved</option>
                    </select>
                  </div>
                </div>

                <div className="prog-modal-actions">
                  <button
                    type="button"
                    className="prog-btn prog-btn-outline"
                    onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="prog-btn prog-btn-primary">
                    {editingItem ? 'Save Changes' : 'Create Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Publish Success Modal (Exact specification) ───────────────────────── */}
        {showPublishSuccessModal && (
          <div className="prog-modal-overlay">
            <div className="prog-publish-modal-card">
              <div className="prog-pub-icon-box">✓</div>
              <h2 className="prog-pub-title">Program Published Successfully</h2>
              <p className="prog-pub-message">
                Program V{showPublishSuccessModal.version_number} has been published successfully.
              </p>
              <p className="prog-pub-submessage">
                {showPublishSuccessModal.item_count} Program Items are now part of the published program.
              </p>
              <div className="prog-pub-actions">
                <button
                  className="prog-btn prog-btn-primary"
                  onClick={() => setShowPublishSuccessModal(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Clarification Question Modal ───────────────────────────────────── */}
        {showAddQuestionModal && (
          <div
            className="bui-modal-overlay"
            onClick={() => !isSavingQuestion && setShowAddQuestionModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(5px)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              className="bui-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '520px',
                width: '92%',
                background: '#ffffff',
                borderRadius: '14px',
                padding: '28px 26px',
                color: '#0f172a',
                boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
                border: '1px solid #e2e8f0',
                textAlign: 'left',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  Add Clarification Question
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddQuestionModal(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateQuestion}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Clarification Question <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                    placeholder="e.g. What are the specific clearance dimensions and acoustic ratings for this space?"
                    value={newQuestionForm.question}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, question: e.target.value })}
                    required
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Architectural Context / Reason
                  </label>
                  <input
                    type="text"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                    placeholder="e.g. Required to determine HVAC load and structural constraints"
                    value={newQuestionForm.reason}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, reason: e.target.value })}
                  />
                </div>

                <div style={{ marginBottom: '22px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Linked Program Item (Optional)
                  </label>
                  <select
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      background: '#fff',
                    }}
                    value={newQuestionForm.program_item_id}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, program_item_id: e.target.value })}
                  >
                    <option value="">-- General Project Question (No Specific Item) --</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.program_item_code ? `${it.program_item_code} - ` : ''}{it.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="prog-btn prog-btn-outline"
                    onClick={() => setShowAddQuestionModal(false)}
                    disabled={isSavingQuestion}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="prog-btn prog-btn-primary"
                    disabled={isSavingQuestion || !newQuestionForm.question.trim()}
                  >
                    {isSavingQuestion ? 'Saving...' : 'Add Question'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Custom Confirmation Modal (Replaces browser window.confirm) ─────────── */}
        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            message={confirmModal.message}
            confirmLabel={confirmModal.confirmLabel || 'Confirm'}
            cancelLabel={confirmModal.cancelLabel || 'Cancel'}
            confirmStyle={confirmModal.confirmStyle || 'danger'}
            loading={confirmModal.loading}
            onCancel={() => setConfirmModal(null)}
            onConfirm={async () => {
              if (confirmModal.onConfirm) {
                await confirmModal.onConfirm()
              }
              setConfirmModal(null)
            }}
          />
        )}

      </div>
    </ProjectShell>
  )
}
