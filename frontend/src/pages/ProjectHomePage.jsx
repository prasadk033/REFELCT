import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getProject, listSources, uploadSource, analyzeBrief, getBriefStatus } from '../api.js'

export default function ProjectHomePage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [project, setProject] = useState(null)
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [projectId])

  // Poll for processing status
  useEffect(() => {
    if (!analyzing) return
    const timer = setInterval(async () => {
      try {
        const status = await getBriefStatus(projectId)
        setProcessingStatus(status)
        if (status.status === 'completed') {
          setAnalyzing(false)
          loadData()
        } else if (status.status === 'failed') {
          setAnalyzing(false)
          setError(`Analysis failed: ${status.error || 'Unknown error'}`)
        }
      } catch { /* ignore polling errors */ }
    }, 2000)
    return () => clearInterval(timer)
  }, [analyzing, projectId])

  async function loadData() {
    setLoading(true)
    try {
      const [proj, srcs] = await Promise.all([
        getProject(projectId),
        listSources(projectId),
      ])
      setProject(proj)
      setSources(srcs)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadSource(projectId, file)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleAnalyze() {
    setError(null)
    setAnalyzing(true)
    try {
      const status = await analyzeBrief(projectId)
      setProcessingStatus(status)
    } catch (err) {
      setError(err.message)
      setAnalyzing(false)
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" /> Loading project...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="page-loading">
        <p>Project not found</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    )
  }

  const workspaces = [
    { id: 'brief', label: 'Brief', active: true, desc: 'Project goals, vision and key objectives' },
    { id: 'program', label: 'Program', active: false, desc: 'Functional requirements and spaces' },
    { id: 'context', label: 'Context', active: false, desc: 'Site, environment and surroundings' },
    { id: 'focus', label: 'Focus', active: false, desc: 'Key challenges and opportunities' },
  ]

  const statusSteps = [
    { key: 'queued', label: 'Queued' },
    { key: 'parsing', label: 'Parsing Documents' },
    { key: 'extracting_images', label: 'Extracting Image Information' },
    { key: 'processing_brief', label: 'Processing Brief' },
    { key: 'generating_cards', label: 'Generating Cards' },
    { key: 'completed', label: 'Ready for Review' },
  ]

  function getStepIndex(status) {
    const idx = statusSteps.findIndex(s => s.key === status)
    return idx >= 0 ? idx : 0
  }

  return (
    <div className="project-home-page">
      {/* Header */}
      <header className="proj-header">
        <div className="proj-header-left">
          <button className="btn-back" onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <svg className="logo-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span className="proj-brand">REFLECT</span>
        </div>
        <div className="proj-header-right">
          <div className="avatar-sm">{user?.name?.[0] || 'U'}</div>
        </div>
      </header>

      <main className="proj-main">
        {/* Project Info */}
        <div className="proj-info-section">
          <div className="proj-info-top">
            <div>
              <div className="proj-type-badge">{project.project_type}</div>
              <h1 className="proj-title">{project.name}</h1>
              {project.location && <p className="proj-location">📍 {project.location}</p>}
              {project.client && <p className="proj-client">👤 {project.client}</p>}
            </div>
            <div className="proj-quick-stats">
              <div className="quick-stat">
                <span className="quick-stat-num">{sources.length}</span>
                <span className="quick-stat-label">Sources</span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat-num">{project.brief_version || '—'}</span>
                <span className="quick-stat-label">Brief Version</span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat-num">{project.card_count}</span>
                <span className="quick-stat-label">Cards</span>
              </div>
            </div>
          </div>
        </div>

        <div className="proj-content-grid">
          {/* Sources Section */}
          <section className="proj-section sources-section">
            <div className="section-header">
              <h2>Source Documents</h2>
              <label className="btn-secondary upload-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {uploading ? 'Uploading...' : 'Add Document'}
                <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleFileUpload} disabled={uploading} hidden />
              </label>
            </div>

            {sources.length === 0 ? (
              <div className="empty-sources">
                <p>No documents uploaded yet. Add source documents to begin analysis.</p>
              </div>
            ) : (
              <div className="sources-list">
                {sources.map(s => (
                  <div key={s.id} className="source-item">
                    <div className="source-icon">
                      {s.file_type === 'pdf' ? '📕' : s.file_type === 'docx' || s.file_type === 'doc' ? '📘' : '📄'}
                    </div>
                    <div className="source-info">
                      <span className="source-name">{s.file_name}</span>
                      <span className="source-meta">
                        {s.file_type.toUpperCase()} · {s.file_size ? `${(s.file_size / 1024).toFixed(1)} KB` : ''} · {new Date(s.upload_timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`source-status status-${s.processing_status}`}>
                      {s.processing_status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {sources.length > 0 && (
              <button
                className="btn-primary analyze-btn"
                onClick={handleAnalyze}
                disabled={analyzing || sources.length === 0}
              >
                {analyzing ? (
                  <>
                    <span className="spinner-sm" />
                    {processingStatus?.current_step || 'Processing...'}
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    {project.brief_version ? 'Re-Analyse Brief' : 'Analyse Brief'}
                  </>
                )}
              </button>
            )}

            {/* Processing Progress */}
            {analyzing && processingStatus && (
              <div className="processing-progress">
                {statusSteps.map((step, idx) => {
                  const currentIdx = getStepIndex(processingStatus.status)
                  const isDone = idx < currentIdx
                  const isCurrent = idx === currentIdx
                  return (
                    <div key={step.key} className={`progress-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                      <div className="step-indicator">
                        {isDone ? '✓' : isCurrent ? <span className="spinner-xs" /> : (idx + 1)}
                      </div>
                      <span className="step-label">{step.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Workspaces Section */}
          <section className="proj-section workspaces-section">
            <h2>Workspaces</h2>
            <div className="workspaces-grid">
              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  className={`workspace-card ${ws.active ? 'active' : 'locked'}`}
                  onClick={() => ws.active && project.brief_version && navigate(`/projects/${projectId}/brief`)}
                >
                  <div className="workspace-card-header">
                    <h3>{ws.label}</h3>
                    {!ws.active && <span className="locked-badge">Coming Soon</span>}
                    {ws.active && project.brief_version && <span className="active-badge">V{project.brief_version}</span>}
                  </div>
                  <p>{ws.desc}</p>
                  {ws.active && !project.brief_version && (
                    <span className="workspace-hint">Upload and analyse documents to begin</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {error && <div className="error-banner">{error}</div>}
      </main>
    </div>
  )
}
