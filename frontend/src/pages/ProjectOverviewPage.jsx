import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, listSources, uploadSource, deleteSource, extractSources, analyzeBrief, listCards, getBriefStatus } from '../api.js'
import ProjectShell from '../components/ProjectShell.jsx'


function formatRelativeTime(dateString) {
  if (!dateString) return 'Recently'
  // Ensure UTC timestamp is properly recognized by appending 'Z' if missing
  const utcString = (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.includes('+'))
    ? `${dateString}Z`
    : dateString
  const date = new Date(utcString)
  const now = new Date()
  const diffSec = Math.floor((now - date) / 1000)

  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function ProjectOverviewPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [project, setProject] = useState(null)
  const [sources, setSources] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Share Dialog
  const [showShareModal, setShowShareModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Upload Source Modal
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('document') // 'document' or 'image'
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileTypeError, setFileTypeError] = useState(null)

  // Analysis Blocking & Progress
  const [analyzing, setAnalyzing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [analysisStep, setAnalysisStep] = useState('Initiating analysis...')
  const [analysisJobId, setAnalysisJobId] = useState(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [analysisSummary, setAnalysisSummary] = useState(null)
  const [analysisError, setAnalysisError] = useState(null)

  const pollIntervalRef = useRef(null)

  useEffect(() => {
    if (projectId) {
      loadProjectData()
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [projectId])

  function handleFileSelected(file) {
    if (!file) return
    setFileTypeError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    
    if (uploadCategory === 'document') {
      const allowed = ['pdf', 'docx', 'doc', 'txt']
      if (!allowed.includes(ext)) {
        setFileTypeError(`Selected file is .${ext}. Please select a PDF, DOCX, DOC, or TXT file for Document sources.`)
        setSelectedFile(null)
        return
      }
    } else {
      const allowed = ['jpg', 'jpeg', 'png', 'webp']
      if (!allowed.includes(ext)) {
        setFileTypeError(`Selected file is .${ext}. Please select a JPG, PNG, or WEBP file for Image sources.`)
        setSelectedFile(null)
        return
      }
    }
    setSelectedFile(file)
  }

  async function handleConfirmUpload() {
    if (!selectedFile) return
    setUploading(true)
    try {
      await uploadSource(projectId, selectedFile)
      showToast(`Source "${selectedFile.name}" added successfully`)
      setShowUploadModal(false)
      setSelectedFile(null)
      setFileTypeError(null)
      await loadProjectData()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }


  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function loadProjectData() {
    setLoading(true)
    try {
      const [p, s, c] = await Promise.all([
        getProject(projectId),
        listSources(projectId).catch(() => []),
        listCards(projectId).catch(() => []),
      ])
      setProject(p)
      setSources(s || [])
      setCards(c || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadSource(projectId, file)
      showToast(`Document "${file.name}" uploaded successfully`)
      await loadProjectData()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRunAnalysis() {
    if (sources.length === 0) {
      showToast('Please upload at least one project document first.')
      if (fileInputRef.current) fileInputRef.current.click()
      return
    }

    if (allAnalysed) {
      showToast('Analysis is already complete. All documents are parsed and up to date.')
      const qCount = cards.filter(c => c.card_type === 'QUESTION').length
      const cCount = cards.filter(c => c.card_type === 'CONFLICT' || c.card_type === 'TENSION').length
      setAnalysisSummary({
        totalCards: cards.length,
        questions: qCount,
        conflicts: cCount,
        documents: sources.map(s => s.file_name).join(', ')
      })
      setShowCompleteModal(true)
      return
    }

    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisStep('Initiating multi-agent analysis...')

    try {
      const job = await analyzeBrief(projectId)
      setAnalysisJobId(job.id)

      // Start polling for status
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await getBriefStatus(projectId)
          if (statusRes.current_step) {
            setAnalysisStep(statusRes.current_step)
          }

          if (statusRes.status === 'completed' || statusRes.current_step === 'Ready for Review') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setAnalyzing(false)
            
            // Reload updated project data
            const [freshCards, freshProj] = await Promise.all([
              listCards(projectId).catch(() => []),
              getProject(projectId).catch(() => null),
              loadProjectData()
            ])
            
            const validCards = freshCards || []
            const qCount = validCards.filter(c => c.card_type === 'QUESTION').length
            const cCount = validCards.filter(c => c.card_type === 'CONFLICT' || c.card_type === 'TENSION').length
            
            setAnalysisSummary({
              totalCards: validCards.length,
              questions: qCount,
              conflicts: cCount,
              documents: sources.map(s => s.file_name).join(', ')
            })
            setShowCompleteModal(true)
            showToast(`✦ Brief Cards generated for "${freshProj?.name || project?.name || 'Project'}"!`)
          } else if (statusRes.status === 'failed') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setAnalyzing(false)
            setAnalysisError(statusRes.error || 'Analysis failed. Please try again.')
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr)
        }
      }, 1500)

    } catch (err) {
      setAnalyzing(false)
      setAnalysisError(err.message)
    }
  }

  function handleCopyShareLink() {
    const shareUrl = `${window.location.origin}/projects/${projectId}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true)
      showToast('Project link copied to clipboard!')
      setTimeout(() => setCopiedLink(false), 3000)
    }).catch(() => {
      showToast('Failed to copy link. Please copy URL manually.')
    })
  }

  async function handleDeleteSource(sourceId, fileName) {
    if (!window.confirm(`Delete document "${fileName}" from project?`)) return
    try {
      await deleteSource(projectId, sourceId)
      showToast(`Document "${fileName}" deleted`)
      await loadProjectData()
    } catch (err) {
      setError(err.message)
    }
  }

  // Real Counts & Status Breakdown
  const totalCards = cards.length
  const pendingCards = cards.filter(c => {
    const s = (c.status || '').toLowerCase()
    return s === 'provisional' || s === 'under review' || s === ''
  }).length
  const acceptedCards = cards.filter(c => (c.status || '').toLowerCase() === 'accepted').length
  const rejectedCards = cards.filter(c => (c.status || '').toLowerCase() === 'rejected').length

  // Version Grouping
  const versionedSources = sources.filter(s => s.version !== null && s.version !== undefined)
  const pendingBatchSources = sources.filter(s => s.version === null || s.version === undefined)

  // Unique completed version numbers sorted (0, 1, 2...)
  const completedVersions = Array.from(new Set(versionedSources.map(s => Number(s.version)))).sort((a, b) => a - b)

  // Check pending status
  const pendingNeedsExtraction = pendingBatchSources.some(s => s.processing_status === 'uploaded' || !s.extracted_text)
  const pendingNeedsReview = pendingBatchSources.length > 0 && !pendingNeedsExtraction && pendingBatchSources.some(s => s.approval_status !== 'approved')
  const hasApprovedPendingReadyForBrief = pendingBatchSources.length > 0 && pendingBatchSources.every(s => s.approval_status === 'approved')
  const isAllBriefed = sources.length > 0 && pendingBatchSources.length === 0 && totalCards > 0

  if (loading && !project) {
    return (
      <ProjectShell project={{ id: projectId }}>
        <div className="brief-ui-loading">
          <span className="bui-spinner" /> Loading project...
        </div>
      </ProjectShell>
    )
  }

  return (
    <ProjectShell project={project}>
      <div className="pov-container">
        
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp"
        />

        {/* Top Bar Header */}
        <header className="pov-top-bar">
          <div className="pov-top-left">
            <div className="pov-title-row">
              <h1 className="pov-title">{project?.name || 'Project Overview'}</h1>
              <span className="pov-badge-active">Active</span>
            </div>
            <p className="pov-subtitle">
              {project?.project_type || 'Residential Project'} • {project?.location || 'Studio Workspace'}
            </p>
          </div>

          <div className="pov-top-right">
            <button className="pov-btn-share" onClick={() => setShowShareModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Share</span>
            </button>
          </div>
        </header>

        {/* SECTION 1: Project Overview Hero Card */}
        <section className="pov-hero-card">
          <div className="pov-hero-content">
            <div className="pov-hero-header">
              <h2 className="pov-section-title">Project Overview</h2>
              <p className="pov-hero-desc">
                Upload project documents, review extracted information, and generate AI Brief Cards.
              </p>
            </div>

            {/* 4 Stat Counters — Total / Pending / Accepted / Rejected */}
            <div className="pov-stats-row">
              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{totalCards}</strong>
                <span className="pov-stat-label">Total<br />Cards</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{pendingCards}</strong>
                <span className="pov-stat-label">Pending<br />Review</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{acceptedCards}</strong>
                <span className="pov-stat-label">Accepted<br />Cards</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{rejectedCards}</strong>
                <span className="pov-stat-label">Rejected<br />Cards</span>
              </div>
            </div>

            {/* Action Row */}
            <div className="pov-analyse-action-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              
              {sources.length === 0 ? (
                /* 1. No documents yet: Add Source CTA */
                <button
                  className="pov-btn-analyse"
                  onClick={() => { setShowUploadModal(true); setSelectedFile(null); setFileTypeError(null); }}
                  disabled={uploading}
                >
                  <span className="pov-sparkle">+</span>
                  <span>Add Project Source</span>
                </button>
              ) : pendingNeedsExtraction ? (
                /* 2. Newly uploaded documents requiring extraction */
                <button
                  className="pov-btn-analyse"
                  onClick={async () => {
                    try {
                      setExtracting(true)
                      await extractSources(projectId)
                      navigate(`/projects/${projectId}/extract`)
                    } catch (err) {
                      showToast('Extraction failed: ' + err.message)
                    } finally {
                      setExtracting(false)
                    }
                  }}
                  disabled={extracting || analyzing}
                >
                  <span className="pov-sparkle">📄</span>
                  <span>
                    {extracting ? 'Extracting Data...' : 'Extract Data & Review'}
                  </span>
                </button>
              ) : pendingNeedsReview ? (
                /* 3. Already extracted documents needing review/approval */
                <button
                  className="pov-btn-analyse"
                  onClick={() => navigate(`/projects/${projectId}/extract`)}
                >
                  <span className="pov-sparkle">✓</span>
                  <span>Review Extracted Data →</span>
                </button>
              ) : hasApprovedPendingReadyForBrief ? (
                /* 4. Pending batch approved: Generate Brief */
                <button
                  className="pov-btn-analyse"
                  onClick={handleRunAnalysis}
                  disabled={analyzing}
                >
                  <span className="pov-sparkle">✦</span>
                  <span>
                    {analyzing ? 'Generating Brief...' : `Generate Brief (${completedVersions.length === 0 ? 'Version 0' : `Version ${completedVersions[completedVersions.length - 1] + 1}`})`}
                  </span>
                </button>
              ) : (
                /* 5. All documents completed: View Brief Workspace */
                <button
                  className="pov-btn-analyse"
                  onClick={() => navigate(`/projects/${projectId}/brief`)}
                >
                  <span>View Brief Workspace →</span>
                </button>
              )}

              <span className="pov-analyse-subtext">
                {sources.length === 0
                  ? 'Upload project documents (PDF, DOCX, TXT) or images to begin.'
                  : pendingNeedsExtraction
                  ? `${pendingBatchSources.length} document(s) uploaded. Extract data and review before generating Brief.`
                  : pendingNeedsReview
                  ? `${pendingBatchSources.length} document(s) extracted. Review and approve before generating Brief.`
                  : hasApprovedPendingReadyForBrief
                  ? `Approved ${pendingBatchSources.length} document(s). Ready to synthesize Brief Cards.`
                  : `All ${sources.length} sources analysed and structured into Brief Cards.`}
              </span>
            </div>
          </div>

          <div className="pov-hero-graphic">
            <img
              src="/hero-sketch.jpg"
              alt="Project Architectural Drawing"
              className="pov-sketch-img"
            />
          </div>
        </section>

        {/* SECTION 2: Project Sources (Grouped by Version Header) */}
        <section className="pov-sources-section">
          <div className="pov-sources-header">
            <div>
              <h2 className="pov-section-title">Project Sources</h2>
              <p className="pov-sources-desc">All project documents and image sources organized by Version.</p>
            </div>

            <div className="pov-sources-actions">
              <button
                className="pov-btn-add-doc"
                onClick={() => { setShowUploadModal(true); setSelectedFile(null); setFileTypeError(null); }}
                disabled={uploading || analyzing}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Source</span>
              </button>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="pov-empty-sources">
              <p>No documents or images uploaded to this project yet.</p>
              <button className="pov-btn-add-doc" onClick={() => { setShowUploadModal(true); setSelectedFile(null); setFileTypeError(null); }}>
                + Add Project Source
              </button>
            </div>
          ) : (
            <div className="pov-sources-version-groups" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Render Completed Version Groups */}
              {completedVersions.map(ver => {
                const groupDocs = versionedSources.filter(s => Number(s.version) === ver)
                return (
                  <div key={`ver-${ver}`} className="pov-version-group-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    
                    {/* Single Version Group Header */}
                    <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#0f172a', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                          Version {ver}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                          {groupDocs.length} Document{groupDocs.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Complete
                      </span>
                    </div>

                    <table className="pov-sources-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Uploaded On</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupDocs.map(s => (
                          <tr key={s.id}>
                            <td className="td-name">
                              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" width="14" height="14" className="pov-doc-icon">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span>{s.file_name}</span>
                            </td>
                            <td className="td-type">{(s.file_type || 'PDF').toUpperCase()}</td>
                            <td className="td-date">
                              {s.upload_timestamp ? new Date(s.upload_timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}
                            </td>
                            <td className="td-ver">
                              <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                ✓ Approved
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                type="button"
                                className="bui-btn bui-btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#0f172a', borderColor: '#cbd5e1' }}
                                onClick={() => navigate(`/projects/${projectId}/extract`)}
                                title="Inspect extracted text"
                              >
                                📄 View
                              </button>
                              <button
                                type="button"
                                className="bui-btn bui-btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#cbd5e1' }}
                                onClick={() => handleDeleteSource(s.id, s.file_name)}
                                title="Delete document"
                              >
                                🗑
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}

              {/* Render Pending Extraction Group (New Documents) */}
              {pendingBatchSources.length > 0 && (
                <div className="pov-version-group-card" style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
                  
                  {/* Single Pending Group Header */}
                  <div style={{ background: '#f8fafc', borderBottom: '1px dashed #cbd5e1', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                        Pending Extraction
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                        {pendingBatchSources.length} New Document{pendingBatchSources.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 600 }}>
                      ○ In Progress
                    </span>
                  </div>

                  <table className="pov-sources-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Uploaded On</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBatchSources.map(s => {
                        const isApproved = s.approval_status === 'approved' || s.processing_status === 'approved'
                        const isExtracted = s.processing_status === 'extracted'
                        const isFailed = s.processing_status === 'failed'

                        return (
                          <tr key={s.id}>
                            <td className="td-name">
                              <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" width="14" height="14" className="pov-doc-icon">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span>{s.file_name}</span>
                            </td>
                            <td className="td-type">{(s.file_type || 'PDF').toUpperCase()}</td>
                            <td className="td-date">
                              {s.upload_timestamp ? new Date(s.upload_timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}
                            </td>
                            <td className="td-ver">
                              {isApproved ? (
                                <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                  ✓ Approved
                                </span>
                              ) : isExtracted ? (
                                <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                  ○ Extracted (Needs Review)
                                </span>
                              ) : isFailed ? (
                                <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                  ✕ Failed
                                </span>
                              ) : (
                                <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                  ○ Pending Extraction
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                type="button"
                                className="bui-btn bui-btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#0f172a', borderColor: '#cbd5e1' }}
                                onClick={() => navigate(`/projects/${projectId}/extract`)}
                                title="Review & Approve"
                              >
                                📄 Review
                              </button>
                              <button
                                type="button"
                                className="bui-btn bui-btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#cbd5e1' }}
                                onClick={() => handleDeleteSource(s.id, s.file_name)}
                                title="Delete document"
                              >
                                🗑
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}
        </section>




        {/* SOURCE UPLOAD MODAL (DOCUMENT VS IMAGE SELECTION) */}
        {showUploadModal && (
          <div className="bui-modal-overlay" onClick={() => setShowUploadModal(false)}>
            <div
              className="bui-modal"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '480px',
                width: '100%',
                background: '#ffffff',
                color: '#0f172a',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                padding: '24px 28px',
                boxSizing: 'border-box'
              }}
            >
              <div className="bui-modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Add Project Source</h2>
                <button className="bui-close-btn" style={{ color: '#64748b' }} onClick={() => setShowUploadModal(false)}>✕</button>
              </div>

              <div>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px', lineHeight: 1.4 }}>
                  Select the source format to ingest. The system will extract and prepare text for your review.
                </p>

                {/* Step 1: Category Selection Tabs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  
                  <button
                    type="button"
                    onClick={() => { setUploadCategory('document'); setSelectedFile(null); setFileTypeError(null); }}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                      background: uploadCategory === 'document' ? '#000000' : '#ffffff',
                      color: uploadCategory === 'document' ? '#ffffff' : '#334155',
                      border: uploadCategory === 'document' ? '1.5px solid #000000' : '1px solid #e2e8f0',
                      boxShadow: uploadCategory === 'document' ? '0 4px 12px rgba(0,0,0,0.12)' : 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <strong style={{ fontSize: '13px', letterSpacing: '-0.01em' }}>Document</strong>
                    <span style={{ fontSize: '11px', opacity: uploadCategory === 'document' ? 0.8 : 0.6 }}>PDF, DOCX, TXT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setUploadCategory('image'); setSelectedFile(null); setFileTypeError(null); }}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                      background: uploadCategory === 'image' ? '#000000' : '#ffffff',
                      color: uploadCategory === 'image' ? '#ffffff' : '#334155',
                      border: uploadCategory === 'image' ? '1.5px solid #000000' : '1px solid #e2e8f0',
                      boxShadow: uploadCategory === 'image' ? '0 4px 12px rgba(0,0,0,0.12)' : 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <strong style={{ fontSize: '13px', letterSpacing: '-0.01em' }}>Image / Visual</strong>
                    <span style={{ fontSize: '11px', opacity: uploadCategory === 'image' ? 0.8 : 0.6 }}>JPG, PNG, WEBP</span>
                  </button>

                </div>

                {/* Step 2: File Selector / Dropzone */}
                <div
                  style={{
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: '8px',
                    padding: '20px 16px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = uploadCategory === 'document' ? '.pdf,.docx,.doc,.txt' : '.jpg,.jpeg,.png,.webp';
                    input.onchange = (e) => handleFileSelected(e.target.files?.[0]);
                    input.click();
                  }}
                >
                  {selectedFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px' }}>
                        ✓ File Selected
                      </span>
                      <strong style={{ fontSize: '13px', color: '#0f172a', wordBreak: 'break-all', marginTop: '2px' }}>
                        {selectedFile.name}
                      </strong>
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {Math.round(selectedFile.size / 1024)} KB • Click to change
                      </span>
                    </div>
                  ) : (
                    <div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.75" width="24" height="24" style={{ margin: '0 auto 6px auto', display: 'block' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                        Click to browse {uploadCategory === 'document' ? 'documents' : 'images'}
                      </strong>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        {uploadCategory === 'document' ? 'Supported: PDF, DOCX, DOC, TXT' : 'Supported: JPG, JPEG, PNG, WEBP'}
                      </span>
                    </div>
                  )}
                </div>

                {fileTypeError && (
                  <div style={{ color: '#b91c1c', fontSize: '12px', marginTop: '10px', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '6px' }}>
                    ⚠ {fileTypeError}
                  </div>
                )}
              </div>

              <div className="bui-modal-actions" style={{ borderTop: '1px solid #f1f5f9', marginTop: '16px', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="bui-btn"
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => { setShowUploadModal(false); setSelectedFile(null); setFileTypeError(null); }}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{
                    background: '#000000',
                    color: '#ffffff',
                    border: '1px solid #000000',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: (!selectedFile || uploading) ? 'not-allowed' : 'pointer',
                    opacity: (!selectedFile || uploading) ? 0.5 : 1,
                    transition: 'all 0.15s'
                  }}
                  onClick={handleConfirmUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload & Save Source'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* SHARE MODAL */}
        {showShareModal && (
          <div className="bui-modal-overlay" onClick={() => setShowShareModal(false)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="bui-modal-header">
                <h2>Share Project</h2>
                <button className="bui-close-btn" onClick={() => setShowShareModal(false)}>✕</button>
              </div>

              <div style={{ padding: '8px 0 20px 0' }}>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                  Share this project link with authorized studio members. Authentication is required to view project details.
                </p>

                <div className="bui-form-group">
                  <label>Project Link</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/projects/${projectId}`}
                      style={{ background: '#090d16', color: '#f8fafc', fontSize: '12px' }}
                    />
                    <button
                      type="button"
                      className="bui-btn bui-btn-primary"
                      onClick={handleCopyShareLink}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {copiedLink ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bui-modal-actions">
                <button type="button" className="bui-btn bui-btn-outline" onClick={() => setShowShareModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ANALYSIS IN-PROGRESS BLOCKING OVERLAY */}
        {analyzing && (
          <div className="bui-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 1000 }}>
            <div className="bui-modal" style={{ maxWidth: '480px', textAlign: 'center', padding: '36px 28px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
              <div style={{ marginBottom: '20px' }}>
                <span className="bui-spinner" style={{ width: '40px', height: '40px', borderWidth: '3px', margin: '0 auto', borderColor: '#0f172a', borderTopColor: 'transparent' }} />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                Generating Project Brief Cards
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
                Analyzing verified project information, extracting architectural parameters, and formulating candidate Brief Cards.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', textAlign: 'left', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="pov-sparkle" style={{ color: '#2563eb', fontWeight: 700 }}>✦</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>{analysisStep}</span>
                </div>
              </div>

              {analysisStep === 'Ready for Review' ? (
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
                    marginTop: '8px',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => navigate(`/projects/${projectId}/brief`)}
                >
                  Open Brief Workspace →
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Please wait — your Brief Workspace will be ready in just a moment.
                  </span>
                  <button
                    type="button"
                    className="bui-btn bui-btn-outline"
                    style={{ marginTop: '12px', fontSize: '11px', padding: '4px 12px', color: '#64748b', borderColor: '#cbd5e1' }}
                    onClick={() => setAnalyzing(false)}
                  >
                    Run in background (Dismiss)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ANALYSIS COMPLETE SUCCESS MODAL */}
        {showCompleteModal && (
          <div className="bui-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center', padding: '32px 28px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '22px' }}>
                ✓
              </div>
              
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                Analysis Complete
              </h2>
              
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
                Project information has been analysed and the Brief Cards have been generated successfully.
              </p>

              {analysisSummary && (
                <div className="pov-summary-counts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
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

        {/* ANALYSIS ERROR MODAL */}
        {analysisError && (
          <div className="bui-modal-overlay" style={{ zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center' }}>
              <div style={{ color: '#ef4444', fontSize: '32px', marginBottom: '12px' }}>⚠</div>
              <h2 style={{ fontSize: '18px', color: '#f8fafc', marginBottom: '8px' }}>Analysis Encountered an Issue</h2>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>{analysisError}</p>
              <div className="bui-modal-actions" style={{ justifyContent: 'center' }}>
                <button className="bui-btn bui-btn-outline" onClick={() => setAnalysisError(null)}>
                  Dismiss
                </button>
                <button className="bui-btn bui-btn-primary" onClick={handleRunAnalysis}>
                  Retry Analysis
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && <div className="bui-toast">{toast}</div>}
        {error && <div className="bui-toast-error">{error}</div>}

      </div>
    </ProjectShell>
  )
}

