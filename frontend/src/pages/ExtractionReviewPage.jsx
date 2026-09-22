import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getProject,
  listSources,
  reparseSource,
  updateSourceContent,
  approveSource,
  approveAllSources,
  analyzeBrief,
  getBriefStatus,
  listCards
} from '../api.js'
import TopHeader from '../components/TopHeader.jsx'
import AiHealthBanner from '../components/AiHealthBanner.jsx'
import GeneratingProgressModal from '../components/GeneratingProgressModal.jsx'
import ExtractingProgressModal from '../components/ExtractingProgressModal.jsx'
import { calculateBriefEstimate } from '../utils/estimate.js'

export default function ExtractionReviewPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

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

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
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
        const pendingList = allSrc.filter(s => s.version === null || s.version === undefined)
        const candidateList = pendingList.length > 0 ? pendingList : allSrc
        const current = candidateList.find(s => s.id === selectedSourceId) || candidateList[0]
        setSelectedSourceId(current.id)
        setEditingText(current.extracted_text || '')
        setIsSaved(true)
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
    }
  }, [projectId])

  // Poll for background extraction status
  useEffect(() => {
    let interval = null
    const isExtracting = sources.some(s => s.processing_status === 'extracting')
    
    if (isExtracting || reparsing) {
      interval = setInterval(async () => {
        try {
          const res = await getProject(projectId)
          setSources(res.sources || [])
          
          const stillExtracting = (res.sources || []).some(s => s.processing_status === 'extracting')
          if (!stillExtracting) {
            setReparsing(false)
            if (extractModalOpen) setExtractModalOpen(false)
            // find selected to update text
            const updatedSelected = (res.sources || []).find(s => s.id === selectedSourceId)
            if (updatedSelected && updatedSelected.extracted_text) {
              setEditingText(updatedSelected.extracted_text)
              setIsSaved(true)
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


  // Categorize sources: Focus on the current pending batch if pending documents exist
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
          {pendingSources.length > 0 ? (
            (() => {
              const hasUnextracted = pendingSources.some(s => !s.extracted_text || !s.extracted_text.trim())
              return (
                <button
                  className="extract-btn-approve-all"
                  onClick={handleApproveAll}
                  disabled={actionLoading || allApproved || hasUnextracted}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    background: hasUnextracted ? '#94a3b8' : '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: (actionLoading || allApproved || hasUnextracted) ? 'not-allowed' : 'pointer'
                  }}
                  title={hasUnextracted ? "All sources must be extracted before you can approve all" : "Approve all extracted sources"}
                >
                  {hasUnextracted ? `Approve All (${pendingSources.length} - Extract First)` : `Approve All (${pendingSources.length})`}
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

          <div className="extract-sidebar-groups">
            {/* Documents Group */}
            {documentSources.length > 0 && (
              <div className="extract-group-block">
                <div className="extract-group-title">
                  <span className="extract-group-icon">📄</span>
                  <span>Documents ({documentSources.length})</span>
                </div>
                <div className="extract-source-list">
                  {documentSources.map((doc, idx) => {
                    const isApproved = doc.approval_status === 'approved' || doc.processing_status === 'approved' || doc.processing_status === 'completed'
                    const isSelected = doc.id === selectedSourceId
                    return (
                      <button
                        key={doc.id}
                        className={`extract-source-item ${isSelected ? 'active' : ''} ${isApproved ? 'approved' : 'pending'}`}
                        onClick={() => handleSelectSource(doc)}
                      >
                        <div className="extract-item-status-icon">
                          {isApproved ? '✓' : '○'}
                        </div>
                        <div className="extract-item-info">
                          <span className="extract-item-num">Document {idx + 1}</span>
                          <span className="extract-item-name" title={doc.file_name}>{doc.file_name}</span>
                        </div>
                        {isApproved && <span className="extract-badge-approved">Approved</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Images Group */}
            {imageSources.length > 0 && (
              <div className="extract-group-block">
                <div className="extract-group-title">
                  <span className="extract-group-icon">🖼️</span>
                  <span>Images / Visuals ({imageSources.length})</span>
                </div>
                <div className="extract-source-list">
                  {imageSources.map((img, idx) => {
                    const isApproved = img.approval_status === 'approved' || img.processing_status === 'approved' || img.processing_status === 'completed'
                    const isSelected = img.id === selectedSourceId
                    return (
                      <button
                        key={img.id}
                        className={`extract-source-item ${isSelected ? 'active' : ''} ${isApproved ? 'approved' : 'pending'}`}
                        onClick={() => handleSelectSource(img)}
                      >
                        <div className="extract-item-status-icon">
                          {isApproved ? '✓' : '○'}
                        </div>
                        <div className="extract-item-info">
                          <span className="extract-item-num">Image {idx + 1}</span>
                          <span className="extract-item-name" title={img.file_name}>{img.file_name}</span>
                        </div>
                        {isApproved && <span className="extract-badge-approved">Approved</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

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
                {!allApproved && <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>Approve all sources to unlock</p>}
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
                    <button
                      className="extract-btn-action-reparse"
                      onClick={handleReparseSingle}
                      disabled={actionLoading || reparsing || selectedSource?.processing_status === 'extracting'}
                      title="Re-extract raw text from file"
                    >
                      {reparsing || selectedSource?.processing_status === 'extracting' ? '↻ Extracting...' : '↻ Reparse'}
                    </button>
                    
                    {!isSaved && (
                      <button
                        className="extract-btn-action-save"
                        onClick={handleSaveContent}
                        disabled={actionLoading}
                      >
                        💾 Save Edits
                      </button>
                    )}

                    {(() => {
                      const hasExtractedText = Boolean(selectedSource.extracted_text && selectedSource.extracted_text.trim())
                      return (
                        <button
                          className={`extract-btn-action-approve ${selectedSource.approval_status === 'approved' ? 'approved' : ''}`}
                          onClick={handleApproveSingle}
                          disabled={actionLoading || !hasExtractedText}
                          style={{
                            cursor: !hasExtractedText ? 'not-allowed' : 'pointer',
                            opacity: !hasExtractedText ? 0.6 : 1
                          }}
                          title={!hasExtractedText ? "Cannot approve source before data has been extracted" : ""}
                        >
                          {selectedSource.approval_status === 'approved' ? '✓ Approved' : hasExtractedText ? 'Approve Source' : 'Needs Extraction'}
                        </button>
                      )
                    })()}
                  </div>
                </div>

                <div className="extract-meta-bar">
                  <span className="extract-meta-pill">
                    Status: <strong>{selectedSource.approval_status === 'approved' || selectedSource.processing_status === 'approved' ? '✓ Approved' : selectedSource.processing_status === 'extracting' ? '↻ Extracting' : '○ Ready for Review'}</strong>
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
                    Extracted Information <span className="extract-editor-hint">(Directly editable by architect before final analysis)</span>
                  </label>
                  {!isSaved && <span className="extract-unsaved-badge">● Unsaved Changes</span>}
                </div>

                <textarea
                  id="extract-textarea"
                  className="extract-content-textarea"
                  value={editingText}
                  onChange={(e) => {
                    setEditingText(e.target.value)
                    setIsSaved(false)
                  }}
                  disabled={reparsing}
                  placeholder="Extracted text will appear here. You can clean or edit the text directly before approving."
                  rows={20}
                />
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
            setAnalyzing(false)
            navigate(`/projects/${projectId}`)
          }}
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
              {analysisError}
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

      {/* AI SERVICES TEMPORARILY LOW FALLBACK MODAL */}
      {aiFallbackModalOpen && (
        <div className="bui-modal-overlay" onClick={() => setAiFallbackModalOpen(false)} style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1100 }}>
          <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', width: '90%', background: '#ffffff', borderRadius: '12px', padding: '24px 28px', color: '#0f172a', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '24px' }}>
              ⚠️
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              AI Service Notice
            </h3>
            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.55, marginBottom: '22px' }}>
              {aiFallbackErrorMsg || "It might take some time, AI services are temporarily low."}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="bui-btn bui-btn-outline"
                style={{ padding: '8px 18px', fontSize: '12.5px', color: '#64748b', borderColor: '#cbd5e1' }}
                onClick={() => setAiFallbackModalOpen(false)}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="bui-btn"
                style={{ background: '#2563eb', color: '#ffffff', padding: '8px 20px', borderRadius: '6px', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '12.5px' }}
                onClick={() => {
                  setAiFallbackModalOpen(false)
                  handleReparseSingle()
                }}
              >
                Try Again
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
            setExtractModalOpen(false)
            navigate(`/projects/${projectId}`)
          }}
        />
      )}

    </div>
  )
}
