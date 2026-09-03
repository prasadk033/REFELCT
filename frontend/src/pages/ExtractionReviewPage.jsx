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
  const pollIntervalRef = useRef(null)

  const [toastMsg, setToastMsg] = useState(null)

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
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
      showToast(`Reparsing ${selectedSource.file_name}...`)
      const reparsed = await reparseSource(projectId, selectedSource.id)
      setSources(prev => prev.map(s => s.id === reparsed.id ? reparsed : s))
      setEditingText(reparsed.extracted_text || '')
      setIsSaved(true)
      showToast(`Reparsing complete for ${reparsed.file_name}`)
    } catch (err) {
      showToast('Reparse failed: ' + err.message)
    } finally {
      setActionLoading(false)
      setReparsing(false)
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
      setAnalyzing(true)
      setAnalysisError(null)
      setAnalysisStep('Initiating Brief analysis pipeline...')
      
      await analyzeBrief(projectId)

      // Start polling status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await getBriefStatus(projectId)
          const step = statusRes.current_step || statusRes.status
          if (step) setAnalysisStep(step)

          if (statusRes.status === 'completed' || statusRes.current_step === 'Ready for Review') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            
            // Fetch generated cards summary
            const generatedCards = await listCards(projectId).catch(() => [])
            const questions = generatedCards.filter(c => (c.card_type || '').toUpperCase() === 'QUESTION')
            const conflicts = generatedCards.filter(c => ['CONFLICT', 'TENSION'].includes((c.card_type || '').toUpperCase()))
            
            setAnalysisSummary({
              totalCards: generatedCards.length,
              questions: questions.length,
              conflicts: conflicts.length
            })
            setAnalyzing(false)
            setShowCompleteModal(true)
            showToast(`✦ Brief Cards generated for "${project?.name || 'Project'}"!`)
          } else if (statusRes.status === 'failed') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setAnalyzing(false)
            setAnalysisError(statusRes.error_message || 'Brief analysis failed.')
          }
        } catch (pollErr) {
          console.warn('Poll error:', pollErr)
        }
      }, 1500)

    } catch (err) {
      setAnalyzing(false)
      setAnalysisError(err.message)
    }
  }


  // Categorize sources: Focus on the current pending batch if pending documents exist
  const pendingSources = sources.filter(s => s.version === null || s.version === undefined)
  const displaySources = pendingSources.length > 0 ? pendingSources : sources

  const documentSources = displaySources.filter(s => s.file_type !== 'image' && !['jpg', 'jpeg', 'png', 'webp'].includes(s.file_type?.toLowerCase()))
  const imageSources = displaySources.filter(s => s.file_type === 'image' || ['jpg', 'jpeg', 'png', 'webp'].includes(s.file_type?.toLowerCase()))

  const allApproved = displaySources.length > 0 && displaySources.every(s => s.approval_status === 'approved' || s.processing_status === 'approved' || s.processing_status === 'completed')

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
      {toastMsg && <div className="extract-toast-banner">{toastMsg}</div>}

      {/* Top Header */}
      <header className="extract-top-nav">
        <div className="extract-nav-left">
          {/* Reflect Logo */}
          <div
            onClick={() => navigate('/overview')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textDecoration: 'none', marginRight: '4px' }}
            title="Go to Reflect Overview"
          >
            <div className="p-logo-icon">R</div>
            <span className="p-logo-text" style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.08em', color: '#0f172a' }}>REFLECT</span>
          </div>

          <div className="extract-divider-vert" />

          <button className="extract-back-btn" onClick={() => navigate(`/projects/${projectId}`)}>
            ← Back to Project Overview
          </button>
          
          <div className="extract-divider-vert" />

          <div className="extract-project-title-group">
            <span className="extract-proj-label">Extraction Review</span>
            <h1 className="extract-proj-name">{project?.name || 'Project'}</h1>
          </div>
        </div>

        <div className="extract-nav-right">
          <span className="extract-approved-count">
            {sources.filter(s => s.approval_status === 'approved' || s.processing_status === 'approved').length} of {sources.length} Sources Approved
          </span>
          <button
            className="extract-btn-approve-all"
            onClick={handleApproveAll}
            disabled={actionLoading || allApproved}
          >
            Approve All
          </button>
          <button
            className="bui-btn"
            style={{
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            Project Overview →
          </button>
        </div>
      </header>

      {/* Split Workspace */}
      <div className="extract-split-layout">
        
        {/* Left Sidebar: Categorized Sources */}
        <aside className="extract-sidebar">
          <div className="extract-sidebar-header">
            <h3>{pendingSources.length > 0 ? `Pending Sources (${displaySources.length})` : `Project Sources (${displaySources.length})`}</h3>
            <p>Select a source to review and approve its extracted text.</p>
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
                      disabled={actionLoading || reparsing}
                      title="Re-extract raw text from file"
                    >
                      {reparsing ? '↻ Reparsing...' : '↻ Reparse'}
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

                    <button
                      className={`extract-btn-action-approve ${selectedSource.approval_status === 'approved' ? 'approved' : ''}`}
                      onClick={handleApproveSingle}
                      disabled={actionLoading}
                    >
                      {selectedSource.approval_status === 'approved' ? '✓ Approved' : 'Approve Source'}
                    </button>
                  </div>
                </div>

                <div className="extract-meta-bar">
                  <span className="extract-meta-pill">
                    Status: <strong>{selectedSource.approval_status === 'approved' ? '✓ Approved for Brief Analysis' : '○ Ready for Review'}</strong>
                  </span>
                  <span className="extract-meta-pill">
                    Type: <strong>{selectedSource.file_type?.toUpperCase()}</strong>
                  </span>
                  {selectedSource.file_size && (
                    <span className="extract-meta-pill">
                      Size: <strong>{Math.round(selectedSource.file_size / 1024)} KB</strong>
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

      {/* ANALYSIS IN-PROGRESS BLOCKING OVERLAY */}
      {analyzing && (
        <div className="bui-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '18px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 3s linear infinite' }}>
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>Churning...</span>
          </div>
        </div>
      )}


      {/* ANALYSIS ERROR MODAL */}
      {analysisError && (
        <div className="bui-modal-overlay" onClick={() => setAnalysisError(null)}>
          <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', textAlign: 'center', padding: '32px 24px', background: '#ffffff', borderRadius: '12px', color: '#0f172a' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '22px' }}>
              ⚠
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Analysis Note
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>
              {analysisError}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <button
                className="bui-btn"
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', padding: '8px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setAnalysisError(null)}
              >
                Dismiss
              </button>
              <button
                className="bui-btn"
                style={{ background: '#000000', color: '#ffffff', border: '1px solid #000000', padding: '8px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => { setAnalysisError(null); handleAnalyseAll(); }}
              >
                Retry Analysis
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
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Brief Cards</span>
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

    </div>
  )
}
