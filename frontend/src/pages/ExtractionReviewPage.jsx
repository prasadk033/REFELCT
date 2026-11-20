import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getProject,
  listSources,
  reparseSource,
  updateSourceContent,
  approveSource,
  approveAllSources,
  analyzeBrief,
  cancelBrief,
  getBriefStatus,
  listCards,
  checkAiHealth,
  extractSources
} from '../api.js'
import TopHeader from '../components/TopHeader.jsx'
import AiHealthBanner from '../components/AiHealthBanner.jsx'
import GeneratingProgressModal from '../components/GeneratingProgressModal.jsx'
import ExtractingProgressModal from '../components/ExtractingProgressModal.jsx'
import { calculateBriefEstimate } from '../utils/estimate.js'

export default function ExtractionReviewPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const targetSourceId = searchParams.get('sourceId')
  const initialBatchParam = searchParams.get('batch')

  const [activeBatchTab, setActiveBatchTab] = useState(() => {
    if (initialBatchParam === '0') return 'batch-0'
    if (initialBatchParam === '1') return 'batch-1'
    if (initialBatchParam === 'pending') return 'pending'
    if (initialBatchParam && initialBatchParam.startsWith('batch-')) return initialBatchParam
    return 'all'
  })

  const [project, setProject] = useState(null)
  const [sources, setSources] = useState([])
  const [selectedSourceId, setSelectedSourceId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [isSaved, setIsSaved] = useState(true)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  // Analysis Blocking & Progress States
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStep, setAnalysisStep] = useState('Initiating Brief analysis...')
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [analysisSummary, setAnalysisSummary] = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  const [analyzingSeconds, setAnalyzingSeconds] = useState(0)
  const [analysisEstimate, setAnalysisEstimate] = useState(null)
  const pollIntervalRef = useRef(null)

  const [toastMsg, setToastMsg] = useState(null)
  const [aiFallbackModalOpen, setAiFallbackModalOpen] = useState(false)
  const [aiFallbackErrorMsg, setAiFallbackErrorMsg] = useState('It might take some time, AI services are temporarily low.')

  const [extractModalOpen, setExtractModalOpen] = useState(false)
  const [extractDocName, setExtractDocName] = useState('')
  const [extractDocCount, setExtractDocCount] = useState(1)
  const [extractTotalPages, setExtractTotalPages] = useState(1)
  const [extractEstSeconds, setExtractEstSeconds] = useState(10)
  const [extractElapsedSeconds, setExtractElapsedSeconds] = useState(0)
  const extractTimerRef = useRef(null)
  const [isWaitingForAi, setIsWaitingForAi] = useState(false)
  const waitAiIntervalRef = useRef(null)

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  function handleWaitForAiAndResume() {
    setIsWaitingForAi(true)
    showToast('Checking AI service availability...')

    checkAiHealth().then(res => {
      if (res?.healthy) {
        setIsWaitingForAi(false)
        setAiFallbackModalOpen(false)
        showToast('🟢 AI Service online! Resuming extraction from checkpoint...')
        handleReparseSingle()
      } else {
        if (waitAiIntervalRef.current) clearInterval(waitAiIntervalRef.current)
        waitAiIntervalRef.current = setInterval(async () => {
          try {
            const h = await checkAiHealth()
            if (h?.healthy) {
              clearInterval(waitAiIntervalRef.current)
              waitAiIntervalRef.current = null
              setIsWaitingForAi(false)
              setAiFallbackModalOpen(false)
              showToast('🟢 AI Service reconnected! Resuming extraction from checkpoint...')
              handleReparseSingle()
            }
          } catch (e) {}
        }, 5000)
      }
    }).catch(() => {
      if (waitAiIntervalRef.current) clearInterval(waitAiIntervalRef.current)
      waitAiIntervalRef.current = setInterval(async () => {
        try {
          const h = await checkAiHealth()
          if (h?.healthy) {
            clearInterval(waitAiIntervalRef.current)
            waitAiIntervalRef.current = null
            setIsWaitingForAi(false)
            setAiFallbackModalOpen(false)
            showToast('🟢 AI Service reconnected! Resuming extraction from checkpoint...')
            handleReparseSingle()
          }
        } catch (e) {}
      }, 5000)
    })
  }

  function formatFileSize(bytes) {
    if (!bytes) return ''
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
    return Math.round(bytes / 1024) + ' KB'
  }

  async function loadData() {
    try {
      setLoading(true)
      const [projData, sourcesData] = await Promise.all([
        getProject(projectId),
        listSources(projectId)
      ])
      setProject(projData)
      const allSrc = sourcesData || []
      setSources(allSrc)

      if (allSrc.length > 0) {
        let current = null
        if (targetSourceId) {
          current = allSrc.find(s => s.id === targetSourceId)
        }
        if (!current && initialBatchParam) {
          if (initialBatchParam === 'pending') {
            current = allSrc.find(s => s.version === null || s.version === undefined)
          } else {
            const vNum = parseInt(initialBatchParam, 10)
            current = allSrc.find(s => s.version === vNum)
          }
        }
        if (!current) {
          const pendingList = allSrc.filter(s => s.version === null || s.version === undefined)
          const candidateList = pendingList.length > 0 ? pendingList : allSrc
          current = candidateList.find(s => s.id === selectedSourceId) || candidateList[0]
        }
        if (current) {
          setSelectedSourceId(current.id)
          setEditingText(current.extracted_text || '')
          setIsSaved(true)
          if (initialBatchParam) {
            const bKey = current.version === 0 ? 'batch-0' : (current.version === 1 ? 'batch-1' : (current.version !== null && current.version !== undefined ? `batch-${current.version}` : 'pending'))
            setActiveBatchTab(bKey)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load extraction review data:', err)
      showToast('Error loading documents: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (waitAiIntervalRef.current) clearInterval(waitAiIntervalRef.current)
    }
  }, [projectId])

  // Poll for background extraction status
  useEffect(() => {
    let interval = null
    const isExtracting = sources.some(s => s.processing_status === 'extracting')
    
    if (isExtracting || reparsing) {
      interval = setInterval(async () => {
        try {
          const updatedSources = await listSources(projectId)
          if (Array.isArray(updatedSources) && updatedSources.length > 0) {
            setSources(updatedSources)
            
            const stillExtracting = updatedSources.some(s => s.processing_status === 'extracting')
            if (!stillExtracting) {
              setReparsing(false)
              if (extractModalOpen) setExtractModalOpen(false)
              // find selected to update text
              const updatedSelected = updatedSources.find(s => s.id === selectedSourceId)
              if (updatedSelected) {
                if (updatedSelected.extracted_text) {
                  setEditingText(updatedSelected.extracted_text)
                  setIsSaved(true)
                }
                if (updatedSelected.processing_status === 'paused' || updatedSelected.processing_status === 'failed') {
                  const hasPartial = Boolean(updatedSelected.extracted_text && updatedSelected.extracted_text.trim())
                  setAiFallbackErrorMsg(
                    hasPartial
                      ? `AI service was interrupted. Extraction was paused and all progress (${updatedSelected.extracted_text.length.toLocaleString()} characters) is safely saved.`
                      : (updatedSelected.processing_error || "AI service is temporarily unavailable. Please try again later.")
                  )
                  setAiFallbackModalOpen(true)
                }
              }
            }
          }
        } catch (e) {
          console.warn("Polling error:", e)
        }
      }, 2000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [sources, reparsing, projectId, selectedSourceId, extractModalOpen])

  const selectedSource = sources.find(s => s.id === selectedSourceId)

  function handleSelectSource(source) {
    setSelectedSourceId(source.id)
    setEditingText(source.extracted_text || '')
    setIsSaved(true)
  }

  async function handleSaveContent() {
    if (!selectedSource) return
    try {
      setActionLoading(true)
      const updated = await updateSourceContent(projectId, selectedSource.id, editingText)
      setSources(prev => prev.map(s => s.id === updated.id ? { ...s, extracted_text: updated.extracted_text } : s))
      setIsSaved(true)
      showToast('Extracted text saved successfully')
    } catch (err) {
      showToast('Failed to save edits: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleApproveSingle() {
    if (!selectedSource) return
    try {
      setActionLoading(true)
      if (!isSaved) {
        await updateSourceContent(projectId, selectedSource.id, editingText)
      }
      const approved = await approveSource(projectId, selectedSource.id)
      setSources(prev => prev.map(s => s.id === approved.id ? approved : s))
      setIsSaved(true)
      showToast(`✓ ${approved.file_name} approved!`)
    } catch (err) {
      showToast('Failed to approve source: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResumeAllPending() {
    try {
      setActionLoading(true)
      showToast('Starting batch extraction for remaining documents...')
      await extractSources(projectId)
      loadData()
    } catch (err) {
      if (err.status === 503 || err.message?.includes('AI services')) {
        setAiFallbackErrorMsg("AI services are temporarily offline. Waiting for service to reconnect.")
        setAiFallbackModalOpen(true)
      } else {
        showToast('Batch extraction notice: ' + err.message)
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReparseSingle() {
    if (!selectedSource) return
    try {
      setActionLoading(true)
      setReparsing(true)
      
      const ext = selectedSource.file_name?.split('.').pop()?.toLowerCase() || ''
      const isImg = selectedSource.file_type?.startsWith('image') || ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)
      let totalP = 1
      if (!isImg) {
        const pm = (selectedSource.file_name || '').match(/(\d+)\s*pages?/i)
        if (pm) totalP = parseInt(pm[1], 10)
        else if (selectedSource.file_size && selectedSource.file_size > 500000) totalP = Math.max(2, Math.round(selectedSource.file_size / (120 * 1024)))
        else totalP = 20
      }
      const estSec = isImg ? 8 : Math.max(25, totalP * 2)

      setExtractDocName(selectedSource.file_name || 'Document')
      setExtractDocCount(1)
      setExtractTotalPages(totalP)
      setExtractEstSeconds(estSec)
      setExtractElapsedSeconds(0)
      setExtractModalOpen(true)

      if (extractTimerRef.current) clearInterval(extractTimerRef.current)
      extractTimerRef.current = setInterval(() => {
        setExtractElapsedSeconds(s => s + 1)
      }, 1000)

      const reparsed = await reparseSource(projectId, selectedSource.id)
      setSources(prev => prev.map(s => s.id === reparsed.id ? reparsed : s))
      // DO NOT set editing text or show toast here, let the polling handle it when status changes
    } catch (err) {
      if (err.message?.includes('AI services') || err.status === 503) {
        setAiFallbackErrorMsg("It might take some time, AI services are temporarily low.")
        setAiFallbackModalOpen(true)
      } else {
        showToast('Extraction failed: ' + err.message)
      }
      setExtractModalOpen(false)
      setActionLoading(false)
      setReparsing(false)
      listSources(projectId).then(res => {
        if (Array.isArray(res) && res.length > 0) setSources(res)
      }).catch(() => {})
    } finally {
      if (extractTimerRef.current) {
        clearInterval(extractTimerRef.current)
        extractTimerRef.current = null
      }
      setActionLoading(false)
    }
  }

  async function handleApproveAll() {
    try {
      setActionLoading(true)
      const allApproved = await approveAllSources(projectId)
      setSources(allApproved)
      setIsSaved(true)
      showToast('✓ All sources approved successfully!')
    } catch (err) {
      showToast('Approve all failed: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAnalyseAll() {
    try {
      const docsToProcess = pendingSources.length > 0 ? pendingSources : sources
      const estimate = calculateBriefEstimate(docsToProcess)
      setAnalysisEstimate(estimate)

      setAnalyzing(true)
      setAnalysisError(null)
      setAnalyzingSeconds(0)
      setAnalysisStep('Initiating Brief analysis pipeline...')
      
      await analyzeBrief(projectId)

      // Start polling status with 1-second ticks
      pollIntervalRef.current = setInterval(async () => {
        setAnalyzingSeconds(s => s + 1)
        try {
          const statusRes = await getBriefStatus(projectId)
          const step = statusRes.current_step || statusRes.status
          if (step) setAnalysisStep(step)

          if (statusRes.status === 'completed' || statusRes.current_step === 'Ready for Review') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            
            // Fetch generated cards count strictly from this document generation run
            const docCardsCount = typeof statusRes.cards_generated === 'number'
              ? statusRes.cards_generated
              : 0
            const qCount = typeof statusRes.questions_count === 'number'
              ? statusRes.questions_count
              : 0
            const cCount = typeof statusRes.conflicts_count === 'number'
              ? statusRes.conflicts_count
              : 0
            
            setAnalysisSummary({
              totalCards: docCardsCount,
              questions: qCount,
              conflicts: cCount
            })
            setAnalyzing(false)
            setShowCompleteModal(true)
            showToast(`✦ ${docCardsCount} Cards generated for "${project?.name || 'Project'}"!`)
          } else if (statusRes.status === 'failed') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setAnalyzing(false)
            const rawErr = statusRes.error || statusRes.error_message || ''
            const isAiUnavailable = !rawErr || rawErr.includes('AI services') || rawErr.includes('unavailable') || rawErr.includes('timed out') || rawErr.includes('503') || rawErr.includes('low')
            setAnalysisError(isAiUnavailable ? 'AI services are temporarily unavailable. Please try again later.' : rawErr)
            loadData().catch(() => {})
          }
        } catch (pollErr) {
          console.warn('Poll error:', pollErr)
        }
      }, 1500)

    } catch (err) {
      setAnalyzing(false)
      const isAiUnavailable = err.message?.includes('AI services') || err.message?.includes('unavailable') || err.status === 503
      setAnalysisError(isAiUnavailable ? 'AI services are temporarily unavailable. Please try again later.' : err.message)
    }
  }

  async function handleCancelAnalysis() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    try {
      await cancelBrief(projectId)
      showToast('Brief generation cancelled.')
    } catch (err) {
      console.warn('Cancel error:', err)
    } finally {
      setAnalyzing(false)
      loadData().catch(() => {})
    }
  }

  // Batch separation for Extraction Review (BUG-006)
  const batchMap = new Map()
  sources.forEach(s => {
    let batchKey = 'pending'
    let batchLabel = 'Pending Review (Current Batch)'
    let shortLabel = 'Pending'
    let batchOrder = -1

    if (s.version === 0) {
      batchKey = 'batch-0'
      batchLabel = 'Batch 1 (Initial Brief)'
      shortLabel = 'Batch 1'
      batchOrder = 0
    } else if (s.version === 1) {
      batchKey = 'batch-1'
      batchLabel = 'Batch 2 (Addendum)'
      shortLabel = 'Batch 2'
      batchOrder = 1
    } else if (typeof s.version === 'number') {
      batchKey = `batch-${s.version}`
      batchLabel = `Batch ${s.version + 1}`
      shortLabel = `Batch ${s.version + 1}`
      batchOrder = s.version
    }

    if (!batchMap.has(batchKey)) {
      batchMap.set(batchKey, { key: batchKey, label: batchLabel, shortLabel, order: batchOrder, sources: [] })
    }
    batchMap.get(batchKey).sources.push(s)
  })

  const sortedBatches = Array.from(batchMap.values()).sort((a, b) => a.order - b.order)
  const visibleBatches = activeBatchTab === 'all'
    ? sortedBatches
    : sortedBatches.filter(b => b.key === activeBatchTab)

  // Focus on pending sources if any, otherwise all sources
  const pendingSources = sources.filter(s => s.version === null || s.version === undefined)
  const displaySources = pendingSources.length > 0 ? pendingSources : sources

  const documentSources = displaySources.filter(s => s.file_type !== 'image' && !['jpg', 'jpeg', 'png', 'webp'].includes(s.file_type?.toLowerCase()))
  const imageSources = displaySources.filter(s => s.file_type === 'image' || ['jpg', 'jpeg', 'png', 'webp'].includes(s.file_type?.toLowerCase()))
  const allApproved = displaySources.length > 0 && displaySources.every(s => (s.approval_status === 'approved' || s.processing_status === 'approved' || s.processing_status === 'completed') && Boolean(s.extracted_text && s.extracted_text.trim()))

  if (loading) {
    return (
      <div className="extract-page-container">
        <div className="brief-ui-loading">
          <span className="bui-spinner" />
          <p>Loading project sources...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="extract-page-container">
      <AiHealthBanner />
      {toastMsg && <div className="extract-toast-banner">{toastMsg}</div>}

      {/* Top Header */}
      <TopHeader breadcrumbs={[
        { label: 'Projects', path: '/overview' },
        { label: project?.name || 'Project', path: `/projects/${projectId}` },
        { label: 'Sources', path: `/projects/${projectId}` },
        { label: selectedSource?.file_name || 'Extraction', path: null }
      ]} />
      
      {/* Optional Top action bar for approve all */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className="extract-approved-count" style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
            {displaySources.filter(s => (s.approval_status === 'approved' || s.processing_status === 'approved') && Boolean(s.extracted_text && s.extracted_text.trim())).length} of {displaySources.length} Sources Approved
          </span>
          {pendingSources.some(s => s.processing_status === 'paused' || s.processing_status === 'uploaded' || !s.extracted_text) && (
            <button
              type="button"
              className="bui-btn"
              onClick={handleResumeAllPending}
              disabled={actionLoading || reparsing}
              style={{
                background: '#065f46',
                color: '#ffffff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: (actionLoading || reparsing) ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Resume extraction for all remaining unextracted or paused documents with a single click"
            >
              <span>▶</span>
              <span>Resume Batch Extraction ({pendingSources.filter(s => s.processing_status === 'paused' || s.processing_status === 'uploaded' || !s.extracted_text).length})</span>
            </button>
          )}

          {pendingSources.length > 0 ? (
            (() => {
              const isAnyExtracting = reparsing || pendingSources.some(s => s.processing_status === 'extracting')
              const hasUnextracted = pendingSources.some(s => !s.extracted_text || !s.extracted_text.trim())
              return (
                <button
                  className="extract-btn-approve-all"
                  onClick={handleApproveAll}
                  disabled={actionLoading || allApproved || hasUnextracted || isAnyExtracting}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    background: (hasUnextracted || isAnyExtracting) ? '#94a3b8' : '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: (actionLoading || allApproved || hasUnextracted || isAnyExtracting) ? 'not-allowed' : 'pointer'
                  }}
                  title={isAnyExtracting ? "Extraction is currently running" : hasUnextracted ? "All sources must be extracted before you can approve all" : "Approve all extracted sources"}
                >
                  {isAnyExtracting ? 'Extracting in Progress...' : hasUnextracted ? `Approve All (${pendingSources.length} - Extract First)` : `Approve All (${pendingSources.length})`}
                </button>
              )
            })()
          ) : (
            <button
              className="extract-btn-approve-all"
              disabled
              style={{ padding: '6px 14px', fontSize: '12px', background: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: '6px', fontWeight: 600 }}
            >
              All Approved
            </button>
          )}
        </div>
      </div>

      {/* Split Workspace */}
      <div className="extract-split-layout">
        
        {/* Left Sidebar: Categorized Sources */}
        <aside className="extract-sidebar">
          <div className="extract-sidebar-header">
            <h3>{pendingSources.length > 0 ? `Pending Sources (${displaySources.length})` : `All Project Sources (${displaySources.length})`}</h3>
            <p>{pendingSources.length > 0 ? 'Select a source to review and approve its extracted text.' : 'All project documents are finalized and synthesized into Brief Cards.'}</p>
          </div>

          {sortedBatches.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="bui-btn"
                onClick={() => setActiveBatchTab('all')}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: activeBatchTab === 'all' ? '#2563eb' : '#cbd5e1',
                  background: activeBatchTab === 'all' ? '#2563eb' : '#ffffff',
                  color: activeBatchTab === 'all' ? '#ffffff' : '#475569',
                  cursor: 'pointer'
                }}
              >
                All Batches ({sources.length})
              </button>
              {sortedBatches.map(b => (
                <button
                  key={b.key}
                  type="button"
                  className="bui-btn"
                  onClick={() => {
                    setActiveBatchTab(b.key)
                    if (b.sources.length > 0 && !b.sources.some(s => s.id === selectedSourceId)) {
                      handleSelectSource(b.sources[0])
                    }
                  }}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: activeBatchTab === b.key ? '#2563eb' : '#cbd5e1',
                    background: activeBatchTab === b.key ? '#2563eb' : '#ffffff',
                    color: activeBatchTab === b.key ? '#ffffff' : '#475569',
                    cursor: 'pointer'
                  }}
                >
                  {b.shortLabel} ({b.sources.length})
                </button>
              ))}
            </div>
          )}

          <div className="extract-sidebar-groups">
            {visibleBatches.map(batch => (
              <div key={batch.key} className="extract-batch-section" style={{ marginBottom: '18px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  background: batch.key === 'pending' ? '#eff6ff' : '#f8fafc',
                  borderLeft: batch.key === 'pending' ? '3px solid #2563eb' : '3px solid #94a3b8',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}>
                  <strong style={{ fontSize: '11.5px', color: batch.key === 'pending' ? '#1d4ed8' : '#334155', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {batch.label}
                  </strong>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: batch.key === 'pending' ? '#dbeafe' : '#e2e8f0',
                    color: batch.key === 'pending' ? '#1e40af' : '#475569'
                  }}>
                    {batch.sources.length} {batch.sources.length === 1 ? 'file' : 'files'}
                  </span>
                </div>

                <div className="extract-source-list">
                  {batch.sources.map((item, idx) => {
                    const hasExtractedText = Boolean(item.extracted_text && item.extracted_text.trim())
                    const isApproved = (item.approval_status === 'approved' || item.processing_status === 'approved' || item.processing_status === 'completed') && hasExtractedText
                    const isSelected = item.id === selectedSourceId
                    const isImg = item.file_type === 'image' || ['jpg', 'jpeg', 'png', 'webp'].includes(item.file_type?.toLowerCase())
                    return (
                      <button
                        key={item.id}
                        className={`extract-source-item ${isSelected ? 'active' : ''} ${isApproved ? 'approved' : 'pending'}`}
                        onClick={() => handleSelectSource(item)}
                      >
                        <div className="extract-item-status-icon">
                          {isApproved ? '✓' : '○'}
                        </div>
                        <div className="extract-item-info">
                          <span className="extract-item-num" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{isImg ? '🖼️ Image' : '📄 Doc'} {idx + 1}</span>
                            <span style={{ fontSize: '9.5px', color: '#64748b', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>
                              {batch.shortLabel}
                            </span>
                          </span>
                          <span className="extract-item-name" title={item.file_name}>{item.file_name}</span>
                        </div>
                        {isApproved ? (
                          <span className="extract-badge-approved">Approved</span>
                        ) : !hasExtractedText ? (
                          <span className="extract-badge-pending" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.processing_status === 'failed' ? 'Failed' : 'Needs Extraction'}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {sources.length === 0 && (
              <div className="extract-empty-sources">
                <p>No documents uploaded yet.</p>
                <button className="extract-btn-sec" onClick={() => navigate(`/projects/${projectId}`)}>
                  Upload Files
                </button>
              </div>
            )}
          </div>

          {sources.length > 0 && (
            pendingSources.length > 0 ? (
              <div className="extract-sidebar-footer" style={{ padding: '20px', borderTop: '1px solid #e2e8f0', marginTop: 'auto' }}>
                <button
                  className={`extract-btn-analyse-all ${allApproved ? 'ready' : 'disabled'}`}
                  onClick={handleAnalyseAll}
                  disabled={actionLoading || analyzing || !allApproved}
                  style={{ width: '100%', padding: '12px', fontSize: '14px', borderRadius: '8px' }}
                >
                  {analyzing ? 'Launching Analysis...' : 'Generate Brief'}
                </button>
                {!allApproved && (
                  <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: '8px', textAlign: 'center', lineHeight: 1.4 }}>
                    {displaySources.some(s => !s.extracted_text || !s.extracted_text.trim())
                      ? 'Extract all documents and approve them to unlock brief generation'
                      : 'Approve all sources to unlock'}
                  </p>
                )}
              </div>
            ) : (
              <div className="extract-sidebar-footer" style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', marginTop: 'auto', background: '#f8fafc' }}>
                <button
                  type="button"
                  className="bui-btn"
                  onClick={() => navigate(`/projects/${projectId}/brief`)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>✓ Brief Ready — View Brief →</span>
                </button>
                <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: '8px', textAlign: 'center', lineHeight: 1.4 }}>
                  All sources are finalized. To generate a new Brief Version, add new documents in Project Overview.
                </p>
              </div>
            )
          )}
        </aside>

        {/* Main Content Area: Single Selected Source Inspection & Editor */}
        <main className="extract-main-content">
          {activeBatchTab !== 'all' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 20px',
              background: '#eff6ff',
              borderBottom: '1px solid #bfdbfe',
              fontSize: '12px',
              color: '#1e40af'
            }}>
              <span>Filtering extraction review to: <strong>{sortedBatches.find(b => b.key === activeBatchTab)?.label}</strong></span>
              <button
                type="button"
                onClick={() => setActiveBatchTab('all')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  textDecoration: 'underline'
                }}
              >
                View All Batches
              </button>
            </div>
          )}

          {selectedSource ? (
            <div className="extract-card-view">
              
              {/* Header Info */}
              <div className="extract-detail-header">
                <div className="extract-detail-title-row">
                  <div>
                    <span className="extract-detail-type-tag">
                      {selectedSource.file_type === 'image' ? 'IMAGE SOURCE' : 'DOCUMENT SOURCE'}
                    </span>
                    <h2 className="extract-detail-filename">{selectedSource.file_name}</h2>
                  </div>
                  
                  <div className="extract-detail-actions">
                    {selectedSource.file_type !== 'virtual/osm' && selectedSource.version == null && (
                      <button
                        className="extract-btn-action-reparse"
                        onClick={handleReparseSingle}
                        disabled={actionLoading || reparsing || selectedSource?.processing_status === 'extracting'}
                        title={selectedSource?.processing_status === 'paused' ? "Resume extraction for this document" : "Re-extract text from scratch"}
                      >
                        {reparsing || selectedSource?.processing_status === 'extracting'
                          ? '↻ Extracting...'
                          : selectedSource?.processing_status === 'paused'
                            ? '▶ Continue Extraction'
                            : '↻ Reparse'}
                      </button>
                    )}
                    
                    {!isSaved && selectedSource.file_type !== 'virtual/osm' && selectedSource.version == null && (
                      <button
                        className="extract-btn-action-save"
                        onClick={handleSaveContent}
                        disabled={actionLoading || reparsing || selectedSource?.processing_status === 'extracting'}
                      >
                        💾 Save Edits
                      </button>
                    )}

                    {(() => {
                      const hasExtractedText = Boolean(selectedSource.extracted_text && selectedSource.extracted_text.trim())
                      const isVersioned = selectedSource.version != null
                      const isExtracting = reparsing || selectedSource?.processing_status === 'extracting'
                      return (
                        <button
                          className={`extract-btn-action-approve ${selectedSource.approval_status === 'approved' ? 'approved' : ''}`}
                          onClick={handleApproveSingle}
                          disabled={actionLoading || !hasExtractedText || isVersioned || isExtracting}
                          style={{
                            cursor: (!hasExtractedText || isVersioned || isExtracting) ? 'not-allowed' : 'pointer',
                            opacity: (!hasExtractedText || isVersioned || isExtracting) ? 0.6 : 1
                          }}
                          title={isVersioned ? "Cannot modify an approved document that is already part of a synthesized version" : isExtracting ? "Extraction is currently running" : !hasExtractedText ? "Cannot approve source before data has been extracted" : ""}
                        >
                          {selectedSource.approval_status === 'approved' ? '✓ Approved' : isExtracting ? 'Extracting...' : hasExtractedText ? 'Approve Source' : 'Needs Extraction'}
                        </button>
                      )
                    })()}
                  </div>
                </div>

                <div className="extract-meta-bar">
                  <span className="extract-meta-pill">
                    Status: <strong>
                      {selectedSource.approval_status === 'approved' || selectedSource.processing_status === 'approved'
                        ? '✓ Approved'
                        : selectedSource.processing_status === 'extracting'
                          ? '↻ Extracting'
                          : selectedSource.processing_status === 'paused'
                            ? '⏸ Paused (Progress Saved)'
                            : '○ Ready for Review'}
                    </strong>
                  </span>
                  <span className="extract-meta-pill">
                    Type: <strong>{(selectedSource.file_type || 'PDF').toUpperCase()}</strong>
                  </span>
                  {selectedSource.file_size && (
                    <span className="extract-meta-pill">
                      Size: <strong>{formatFileSize(selectedSource.file_size)}</strong>
                    </span>
                  )}
                  <span className="extract-meta-pill">
                    Character Count: <strong>{editingText?.length || 0}</strong>
                  </span>
                </div>
              </div>

              {/* Editor Workspace */}
              <div className="extract-editor-wrapper">
                <div className="extract-editor-label-row">
                  <label htmlFor="extract-textarea">
                    {selectedSource.file_type === 'virtual/osm' 
                      ? "Site Analysis Facts"
                      : "Extracted Information"}
                    <span className="extract-editor-hint">
                      {selectedSource.file_type === 'virtual/osm'
                        ? " (Generated from OpenStreetMap, read-only)"
                        : " (Directly editable by architect before final analysis)"}
                    </span>
                  </label>
                  {!isSaved && <span className="extract-unsaved-badge">● Unsaved Changes</span>}
                </div>

                {selectedSource.file_type === 'virtual/osm' ? (
                  <div
                    className="extract-content-textarea"
                    style={{
                      height: 'auto',
                      minHeight: '400px',
                      overflowY: 'auto',
                      backgroundColor: '#f8fafc',
                      whiteSpace: 'pre-wrap',
                      padding: '16px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      color: '#1e293b'
                    }}
                  >
                    {editingText || 'No site analysis data available.'}
                  </div>
                ) : (
                  <textarea
                    id="extract-textarea"
                    className="extract-content-textarea"
                    value={editingText}
                    onChange={(e) => {
                      setEditingText(e.target.value)
                      setIsSaved(false)
                    }}
                    disabled={reparsing || selectedSource.version != null}
                    placeholder={selectedSource.version != null ? "Extracted text is locked because it is part of a completed version." : "Extracted text will appear here. You can clean or edit the text directly before approving."}
                    rows={20}
                  />
                )}
              </div>

            </div>
          ) : (
            <div className="extract-no-selection">
              <p>Select a document from the left sidebar to review its extracted text.</p>
            </div>
          )}
        </main>

      </div>

      {/* DYNAMIC ANALYSIS IN-PROGRESS MODAL */}
      {analyzing && (
        <GeneratingProgressModal
          estimate={analysisEstimate}
          elapsedSeconds={analyzingSeconds}
          serverStep={analysisStep}
          projectName={project?.name || 'Project'}
          onRunInBackground={() => {
            sessionStorage.setItem(`reflect_analyzing_${projectId}`, 'true')
            const stepToSave = analysisStep || 'Generating Brief Cards for Document Batch 1'
            sessionStorage.setItem(`reflect_analysis_step_${projectId}`, stepToSave)
            if (analysisEstimate) {
              sessionStorage.setItem(`reflect_analysis_estimate_${projectId}`, JSON.stringify(analysisEstimate))
            }
            setAnalyzing(false)
            navigate(`/projects/${projectId}`, {
              state: {
                backgroundAnalysis: true,
                analysisEstimate,
                analyzingSeconds,
                analysisStep: stepToSave
              }
            })
          }}
          onCancel={handleCancelAnalysis}
        />
      )}


      {/* ANALYSIS ERROR MODAL */}
      {analysisError && (
        <div className="bui-modal-overlay" onClick={() => setAnalysisError(null)} style={{ background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center', padding: '32px 28px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '24px' }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#991b1b', marginBottom: '8px' }}>
              Generation Failed
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '22px', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {(analysisError || '').replace(/from LLM across any chunks\.?/i, '').replace(/from LLM\.?/i, '').trim()}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="bui-btn"
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setAnalysisError(null)}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="bui-btn"
                style={{ background: '#0f172a', color: '#ffffff', border: '1px solid #0f172a', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => { setAnalysisError(null); handleAnalyseAll(); }}
              >
                Generate Brief Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS COMPLETE SUCCESS MODAL */}
      {showCompleteModal && (
        <div className="bui-modal-overlay" style={{ background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center', padding: '32px 28px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '22px' }}>
              ✓
            </div>
            
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Analysis Complete
            </h2>
            
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
              Project information for <strong>{project?.name || 'this project'}</strong> has been analyzed and candidate Brief Cards have been generated.
            </p>

            {analysisSummary && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <div>
                  <strong style={{ fontSize: '20px', color: '#0f172a', display: 'block' }}>{analysisSummary.totalCards}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Cards Generated</span>
                </div>
                <div>
                  <strong style={{ fontSize: '20px', color: '#0f172a', display: 'block' }}>{analysisSummary.questions}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Questions</span>
                </div>
                <div>
                  <strong style={{ fontSize: '20px', color: '#0f172a', display: 'block' }}>{analysisSummary.conflicts}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Conflicts</span>
                </div>
              </div>
            )}

            <button
              style={{
                width: '100%',
                background: '#000000',
                color: '#ffffff',
                border: '1px solid #000000',
                padding: '12px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onClick={() => {
                setShowCompleteModal(false)
                navigate(`/projects/${projectId}/brief`)
              }}
            >
              Open Brief Workspace →
            </button>
          </div>
        </div>
      )}

      {/* AI SERVICE TEMPORARILY INTERRUPTED / PAUSED MODAL */}
      {aiFallbackModalOpen && (
        <div className="bui-modal-overlay" onClick={() => { if (!isWaitingForAi) setAiFallbackModalOpen(false) }} style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1100 }}>
          <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '90%', background: '#ffffff', borderRadius: '14px', padding: '28px 30px', color: '#0f172a', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '26px' }}>
              ⚠️
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              AI Service Temporarily Interrupted
            </h3>
            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.55, marginBottom: '22px' }}>
              {selectedSource?.extracted_text?.trim()
                ? `Extraction paused. All progress (${selectedSource.extracted_text.length.toLocaleString()} characters) is safely saved. How would you like to proceed?`
                : (aiFallbackErrorMsg || "The AI inference service is temporarily unreachable.")}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Option 1: Wait for AI & Resume from Checkpoint */}
              <button
                type="button"
                className="bui-btn"
                style={{
                  background: isWaitingForAi ? '#f1f5f9' : '#0f172a',
                  color: isWaitingForAi ? '#64748b' : '#ffffff',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isWaitingForAi ? 'not-allowed' : 'pointer',
                  border: isWaitingForAi ? '1px solid #cbd5e1' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                disabled={isWaitingForAi}
                onClick={handleWaitForAiAndResume}
              >
                {isWaitingForAi ? (
                  <>
                    <span className="bui-spinner-inline" style={{ width: '13px', height: '13px', borderWidth: '2px', borderColor: '#64748b', borderTopColor: 'transparent' }} />
                    Waiting for AI service to reconnect...
                  </>
                ) : (
                  '▶ Wait for AI & Resume from Checkpoint'
                )}
              </button>

              {/* Option 2: Move with Present Extracted Data */}
              {Boolean(selectedSource?.extracted_text?.trim()) && (
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#059669',
                    borderColor: '#a7f3d0',
                    background: '#ecfdf5',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                  onClick={async () => {
                    setAiFallbackModalOpen(false)
                    setIsWaitingForAi(false)
                    await handleApproveSingle()
                  }}
                >
                  ✓ Move with Present Extracted Data ({selectedSource.extracted_text.length.toLocaleString()} chars)
                </button>
              )}

              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  marginTop: '4px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
                onClick={() => {
                  setAiFallbackModalOpen(false)
                  setIsWaitingForAi(false)
                  loadData().catch(() => {})
                }}
              >
                Dismiss & Review in Editor
              </button>
            </div>
          </div>
        </div>
      )}

      {extractModalOpen && (
        <ExtractingProgressModal
          documentName={extractDocName}
          docsCompleted={0}
          docCount={extractDocCount || 1}
          serverStep={`Reparsing ${extractDocName}...`}
          totalPages={extractTotalPages}
          estimatedSeconds={extractEstSeconds}
          elapsedSeconds={extractElapsedSeconds}
          onRunInBackground={() => {
            sessionStorage.setItem(`reflect_extracting_${projectId}`, 'true')
            const stepToSave = `Reparsing ${extractDocName}...`
            sessionStorage.setItem(`reflect_extract_step_${projectId}`, stepToSave)
            setExtractModalOpen(false)
            navigate(`/projects/${projectId}`, {
              state: {
                backgroundExtraction: true,
                extractDocName,
                extractDocsCompleted: 0,
                extractDocCount: extractDocCount || 1,
                extractServerStep: stepToSave,
                extractElapsedSeconds,
                extractEstSeconds,
                extractTotalPages
              }
            })
          }}
        />
      )}

    </div>
  )
}
