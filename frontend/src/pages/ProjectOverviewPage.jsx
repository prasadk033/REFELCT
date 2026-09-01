import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, listSources, uploadSource, deleteSource, analyzeBrief, listCards, getBriefStatus, listActivities } from '../api.js'
import ProjectShell from '../components/ProjectShell.jsx'

function formatRelativeTime(dateString) {
  if (!dateString) return 'Recently'
  const date = new Date(dateString)
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
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Share Dialog
  const [showShareModal, setShowShareModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Analysis Blocking & Progress
  const [analyzing, setAnalyzing] = useState(false)
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

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function loadProjectData() {
    setLoading(true)
    try {
      const [p, s, c, a] = await Promise.all([
        getProject(projectId),
        listSources(projectId).catch(() => []),
        listCards(projectId).catch(() => []),
        listActivities(projectId, 10).catch(() => []),
      ])
      setProject(p)
      setSources(s || [])
      setCards(c || [])
      setActivities(a || [])
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

          if (statusRes.status === 'completed') {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setAnalyzing(false)
            
            // Reload updated project data
            const [freshCards, freshProj] = await Promise.all([
              listCards(projectId),
              getProject(projectId),
              loadProjectData()
            ])
            
            const qCount = freshCards.filter(c => c.card_type === 'QUESTION').length
            const cCount = freshCards.filter(c => c.card_type === 'CONFLICT' || c.card_type === 'TENSION').length
            
            setAnalysisSummary({
              totalCards: freshCards.length,
              questions: qCount,
              conflicts: cCount,
              documents: sources.map(s => s.file_name).join(', ')
            })
            setShowCompleteModal(true)
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

  // Real Counts & Pending Analysis Analysis Checks
  const totalCards = cards.length
  const questionCount = cards.filter(c => c.card_type === 'QUESTION').length
  const conflictCount = cards.filter(c => c.card_type === 'CONFLICT' || c.card_type === 'TENSION').length
  const actionCount = cards.filter(c => c.card_type === 'ACTION').length

  // Check which sources are analysed vs pending
  const isSourceAnalysed = (s) => {
    return s.processing_status === 'completed' || cards.some(c => c.source_id === s.id || (c.source_document && c.source_document.toLowerCase().includes(s.file_name.toLowerCase())))
  }

  const pendingSources = sources.filter(s => s.processing_status !== 'failed' && !isSourceAnalysed(s))
  const allAnalysed = sources.length > 0 && pendingSources.length === 0 && totalCards > 0

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
          accept=".pdf,.docx,.txt,.zip"
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
                Upload project documents and analyse information to generate Brief Cards.
              </p>
            </div>

            {/* 4 Stat Counters */}
            <div className="pov-stats-row">
              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{totalCards}</strong>
                <span className="pov-stat-label">Brief Cards<br />Generated</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{questionCount}</strong>
                <span className="pov-stat-label">Questions<br />Identified</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{conflictCount}</strong>
                <span className="pov-stat-label">Conflicts<br />Detected</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{actionCount}</strong>
                <span className="pov-stat-label">Actions<br />Pending</span>
              </div>
            </div>

            {/* Analyse Action Row */}
            <div className="pov-analyse-action-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="pov-btn-analyse"
                onClick={handleRunAnalysis}
                disabled={analyzing}
              >
                <span className="pov-sparkle">✦</span>
                <span>
                  {analyzing
                    ? 'Analysing Documents...'
                    : pendingSources.length > 0
                    ? `Analyse New Information (${pendingSources.length} pending)`
                    : allAnalysed
                    ? '✓ Analysis Complete (View Brief)'
                    : 'Analyse Project Information'}
                </span>
              </button>

              {allAnalysed && (
                <button
                  className="bui-btn bui-btn-primary"
                  onClick={() => navigate(`/projects/${projectId}/brief`)}
                  style={{ padding: '9px 20px', fontSize: '13px', fontWeight: 600 }}
                >
                  View Brief Workspace →
                </button>
              )}

              <span className="pov-analyse-subtext">
                {pendingSources.length > 0
                  ? `${pendingSources.length} new document(s) uploaded and ready for analysis.`
                  : allAnalysed
                  ? `All ${sources.length} documents analysed. Cards are up to date.`
                  : 'AI will extract and structure key information.'}
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

        {/* SECTION 2: Project Sources */}
        <section className="pov-sources-section">
          <div className="pov-sources-header">
            <div>
              <h2 className="pov-section-title">Project Sources</h2>
              <p className="pov-sources-desc">All project documents and information sources.</p>
            </div>

            <div className="pov-sources-actions">
              <button
                className="pov-btn-add-doc"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || analyzing}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>{uploading ? 'Uploading...' : 'Add Documents'}</span>
              </button>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="pov-empty-sources">
              <p>No documents uploaded yet.</p>
              <button className="pov-btn-add-doc" onClick={() => fileInputRef.current?.click()}>
                + Upload Client Brief / PDF
              </button>
            </div>
          ) : (
            <div className="pov-sources-table-wrap">
              <table className="pov-sources-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Uploaded On</th>
                    <th>Analysis Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, idx) => {
                    const analysed = isSourceAnalysed(s)
                    const isFailed = s.processing_status === 'failed'

                    return (
                      <tr key={s.id || idx}>
                        <td className="td-name">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" width="14" height="14" className="pov-doc-icon">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span>{s.file_name || s.filename || s.name}</span>
                        </td>
                        <td className="td-type">{(s.file_type || 'PDF').toUpperCase()}</td>
                        <td className="td-date">
                          {s.upload_timestamp || s.created_at ? new Date(s.upload_timestamp || s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}
                        </td>
                        <td className="td-ver">
                          {analysed ? (
                            <span className="pov-version-badge ready" style={{ background: '#052e16', color: '#4ade80', border: '1px solid #166534', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                              ✓ Analysed
                            </span>
                          ) : isFailed ? (
                            <span className="pov-version-badge" style={{ background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                              ✕ Failed
                            </span>
                          ) : (
                            <span className="pov-version-badge" style={{ background: '#172554', color: '#60a5fa', border: '1px solid #1e40af', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                              ⏳ Pending Analysis
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="bui-btn bui-btn-outline"
                            style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#334155' }}
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
        </section>

        {/* SECTION 3: Bottom Split Grid: Recent Activity & Getting Started */}
        <section className="pov-bottom-grid">
          
          {/* Recent Activity */}
          <div className="pov-box">
            <h3 className="pov-box-title">Recent Activity</h3>
            {activities.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                No recent activity recorded for this project yet.
              </div>
            ) : (
              <div className="pov-timeline">
                {activities.map(act => (
                  <div key={act.id} className="pov-timeline-item">
                    <div className="pov-tl-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      </svg>
                    </div>
                    <div className="pov-tl-content">
                      <strong>{act.title}</strong>
                      <p>{act.description || act.title}</p>
                    </div>
                    <span className="pov-tl-time">{formatRelativeTime(act.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Getting Started Checklist */}
          <div className="pov-box">
            <h3 className="pov-box-title">Getting Started</h3>
            <div className="pov-checklist">
              
              <div
                className="pov-check-item clickable"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={`pov-circle ${sources.length > 0 ? 'done' : ''}`}>
                  {sources.length > 0 && '✓'}
                </div>
                <span>Upload project documents</span>
              </div>

              <div
                className="pov-check-item clickable"
                onClick={handleRunAnalysis}
              >
                <div className={`pov-circle ${totalCards > 0 ? 'done' : ''}`}>
                  {totalCards > 0 && '✓'}
                </div>
                <span>Analyse project information</span>
              </div>

              <div
                className="pov-check-item clickable"
                onClick={() => {
                  if (totalCards > 0) {
                    navigate(`/projects/${projectId}/brief`)
                  } else {
                    showToast('Please analyse project documents first to generate Brief Cards.')
                  }
                }}
              >
                <div className={`pov-circle ${totalCards > 0 ? 'done' : ''}`}>
                  {totalCards > 0 && '✓'}
                </div>
                <span>Review Brief Cards</span>
              </div>

              <div className="pov-check-item">
                <div className="pov-circle" />
                <span>Collaborate with team</span>
              </div>

            </div>
          </div>

        </section>

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
          <div className="bui-modal-overlay" style={{ background: 'rgba(5, 7, 12, 0.88)', backdropFilter: 'blur(6px)', zIndex: 1000 }}>
            <div className="bui-modal" style={{ maxWidth: '500px', textAlign: 'center', padding: '36px 28px' }}>
              <div style={{ marginBottom: '20px' }}>
                <span className="bui-spinner" style={{ width: '40px', height: '40px', borderWidth: '3px', margin: '0 auto' }} />
              </div>
              <h2 style={{ fontSize: '20px', color: '#f8fafc', marginBottom: '8px' }}>
                Analysing Project Information
              </h2>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>
                Virtual Architect agents are parsing documents, extracting image text, and synthesising Brief Cards.
              </p>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 18px', textAlign: 'left', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="pov-sparkle" style={{ color: '#38bdf8' }}>✦</span>
                  <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>{analysisStep}</span>
                </div>
              </div>

              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Workspace access is locked until candidate Brief Cards are generated.
              </span>
            </div>
          </div>
        )}

        {/* ANALYSIS COMPLETE SUCCESS MODAL */}
        {showCompleteModal && (
          <div className="bui-modal-overlay" style={{ background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', textAlign: 'center', padding: '32px 28px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#052e16', border: '1px solid #166534', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '22px' }}>
                ✓
              </div>
              
              <h2 style={{ fontSize: '22px', color: '#f8fafc', marginBottom: '8px' }}>
                Analysis Complete
              </h2>
              
              <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px', lineHeight: 1.5 }}>
                Project information has been analysed and the Brief Cards have been generated successfully.
              </p>

              {analysisSummary && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '28px' }}>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#f8fafc', display: 'block' }}>{analysisSummary.totalCards}</strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Brief Cards</span>
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#f8fafc', display: 'block' }}>{analysisSummary.questions}</strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Questions</span>
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#f8fafc', display: 'block' }}>{analysisSummary.conflicts}</strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Conflicts</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  onClick={() => setShowCompleteModal(false)}
                >
                  Stay on Overview
                </button>
                <button
                  type="button"
                  className="bui-btn bui-btn-primary"
                  onClick={() => navigate(`/projects/${projectId}/brief`)}
                  style={{ padding: '10px 28px', fontWeight: 600 }}
                >
                  View Brief →
                </button>
              </div>
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

