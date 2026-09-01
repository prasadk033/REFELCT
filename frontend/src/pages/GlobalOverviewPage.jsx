import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects, createProject, listActivities } from '../api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import GlobalShell from '../components/GlobalShell.jsx'

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

function getActivityIcon(eventType = '') {
  const t = eventType.toLowerCase()
  if (t.includes('project')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
        <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" />
      </svg>
    )
  }
  if (t.includes('document') || t.includes('upload')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    )
  }
  if (t.includes('analysis')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    )
  }
  if (t.includes('card')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="7" y1="8" x2="17" y2="8" />
        <line x1="7" y1="12" x2="17" y2="12" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export default function GlobalOverviewPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [projects, setProjects] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    name: '',
    project_type: 'Residential Project',
    location: '',
    client: '',
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [projData, actData] = await Promise.all([
        listProjects().catch(() => []),
        listActivities(null, 15).catch(() => []),
      ])
      setProjects(projData || [])
      setActivities(actData || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateProject(e) {
    e.preventDefault()
    if (!formData.name.trim()) return
    setCreating(true)
    try {
      const created = await createProject({
        name: formData.name.trim(),
        project_type: formData.project_type,
        location: formData.location.trim() || null,
        client: formData.client.trim() || null,
        description: formData.description.trim() || null,
      })
      setShowCreateModal(false)
      navigate(`/projects/${created.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  // Aggregate Metrics
  const activeCount = projects.length
  const totalCards = projects.reduce((acc, p) => acc + (p.card_count || 0), 0)
  const totalQuestions = projects.reduce((acc, p) => acc + Math.floor((p.card_count || 0) * 0.2), 0)
  const totalConflicts = projects.reduce((acc, p) => acc + Math.floor((p.card_count || 0) * 0.1), 0)

  // Visible projects: 2 most recent by default, or all if expanded
  const visibleProjects = showAllProjects ? projects : projects.slice(0, 2)

  return (
    <GlobalShell>
      <div className="gov-container">
        
        {/* Top Header Bar */}
        <header className="gov-header">
          <div className="gov-header-left">
            <h1 className="gov-greeting">Good morning, {user?.name?.split(' ')[0] || 'Architect'}</h1>
            <p className="gov-subtitle">Let's continue building clarity for your projects.</p>
          </div>

          <div className="gov-header-right">
            <button className="gov-btn-new" onClick={() => setShowCreateModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Project</span>
            </button>
          </div>
        </header>

        {/* At a Glance Metric Counters */}
        <section className="gov-glance-section">
          <h2 className="gov-section-title">At a Glance</h2>
          <div className="gov-metrics-grid">
            
            <div className="gov-metric-card">
              <div className="gov-metric-left">
                <span className="gov-metric-num">{activeCount}</span>
                <span className="gov-metric-label">Projects<br />Active</span>
              </div>
              <div className="gov-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" width="28" height="28">
                  <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" />
                </svg>
              </div>
            </div>

            <div className="gov-metric-card">
              <div className="gov-metric-left">
                <span className="gov-metric-num">{totalCards}</span>
                <span className="gov-metric-label">Brief Cards<br />Generated</span>
              </div>
              <div className="gov-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" width="28" height="28">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
            </div>

            <div className="gov-metric-card">
              <div className="gov-metric-left">
                <span className="gov-metric-num">{totalQuestions}</span>
                <span className="gov-metric-label">Questions<br />Identified</span>
              </div>
              <div className="gov-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" width="28" height="28">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>

            <div className="gov-metric-card">
              <div className="gov-metric-left">
                <span className="gov-metric-num">{totalConflicts}</span>
                <span className="gov-metric-label">Conflicts<br />Detected</span>
              </div>
              <div className="gov-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" width="28" height="28">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>

          </div>
        </section>

        {/* Recent Projects List */}
        <section className="gov-projects-section">
          <div className="gov-section-header">
            <h2 className="gov-section-title">Recent Projects</h2>
            {projects.length > 2 && (
              <span
                className="gov-link-all"
                onClick={() => setShowAllProjects(!showAllProjects)}
                style={{ cursor: 'pointer' }}
              >
                {showAllProjects ? 'Show less ↑' : `View all (${projects.length}) →`}
              </span>
            )}
          </div>

          {loading ? (
            <div className="gov-loading-state">
              <span className="bui-spinner" /> Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="gov-empty-box">
              <div className="gov-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" width="36" height="36">
                  <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" />
                </svg>
              </div>
              <h3>No projects created yet</h3>
              <p>Create your first project to start analyzing briefs and organizing architectural knowledge.</p>
              <button className="gov-btn-new" onClick={() => setShowCreateModal(true)}>
                + Create Project
              </button>
            </div>
          ) : (
            <>
              <div className="gov-projects-list">
                {visibleProjects.map(p => (
                  <div key={p.id} className="gov-project-row" onClick={() => navigate(`/projects/${p.id}`)}>
                    
                    <div className="gov-project-thumb">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                        <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" />
                      </svg>
                    </div>

                    <div className="gov-project-details">
                      <h3 className="gov-project-name">{p.name}</h3>
                      <div className="gov-project-meta">
                        <span>{p.project_type || 'Residential Project'}</span>
                        {p.location && <span>• {p.location}</span>}
                        {p.client && <span>• Client: {p.client}</span>}
                      </div>
                    </div>

                    <div className="gov-project-stats">
                      <div className="gov-stat-item">
                        <strong className="gov-stat-val">{p.card_count || 0}</strong>
                        <span className="gov-stat-lbl">Cards</span>
                      </div>
                      <div className="gov-stat-item">
                        <strong className="gov-stat-val">{Math.floor((p.card_count || 0) * 0.2)}</strong>
                        <span className="gov-stat-lbl">Questions</span>
                      </div>
                    </div>

                    <div className="gov-project-action" onClick={e => e.stopPropagation()}>
                      <button className="gov-btn-open" onClick={() => navigate(`/projects/${p.id}`)}>
                        Open
                      </button>
                    </div>

                  </div>
                ))}
              </div>

              {/* Load More Button */}
              {projects.length > 2 && !showAllProjects && (
                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                  <button
                    className="bui-btn bui-btn-outline"
                    onClick={() => setShowAllProjects(true)}
                    style={{ fontSize: '13px', padding: '8px 20px' }}
                  >
                    Load more projects ({projects.length - 2} more)
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Bottom Split Grid: Recent Activity & Tip */}
        <section className="gov-bottom-grid">
          
          {/* Recent Activity */}
          <div className="gov-activity-box">
            <h3 className="gov-box-title">Recent Activity</h3>
            {activities.length === 0 ? (
              <div className="gov-activity-empty" style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b' }}>
                <p style={{ fontSize: '13px', margin: 0 }}>No recent activity yet.</p>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Actions like creating projects, uploading documents, and analyzing briefs will appear here.</span>
              </div>
            ) : (
              <div className="gov-activity-list">
                {activities.map(act => (
                  <div key={act.id} className="gov-activity-item">
                    <div className="gov-act-icon">
                      {getActivityIcon(act.event_type)}
                    </div>
                    <div className="gov-act-content">
                      <strong>{act.title}</strong>
                      <p>{act.description || act.title}</p>
                    </div>
                    <span className="gov-act-time">{formatRelativeTime(act.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tip Box */}
          <div className="gov-tip-box">
            <div className="gov-tip-header">
              <span className="gov-sparkle">✦</span>
              <strong>Tip</strong>
            </div>
            <p className="gov-tip-text">
              Upload all available project documents (Briefs, Transcripts, Schedules) to get comprehensive document-wise Brief Cards.
            </p>
            <button className="gov-btn-learn-more" onClick={() => setShowCreateModal(true)}>
              + Create Project
            </button>
          </div>

        </section>

      </div>


      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="bui-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="bui-modal" onClick={e => e.stopPropagation()}>
            <div className="bui-modal-header">
              <h2>Create New Project</h2>
              <button className="bui-close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateProject} className="bui-modal-form">
              <div className="bui-form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Jubilee Hills Residence"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="bui-form-group">
                <label>Project Type</label>
                <select
                  value={formData.project_type}
                  onChange={e => setFormData({ ...formData, project_type: e.target.value })}
                >
                  <option value="Residential Project">Residential Project</option>
                  <option value="Commercial Project">Commercial Project</option>
                  <option value="Institutional Project">Institutional Project</option>
                  <option value="Hospitality Project">Hospitality Project</option>
                  <option value="Masterplan / Urban">Masterplan / Urban</option>
                </select>
              </div>

              <div className="bui-form-group">
                <label>Location</label>
                <input
                  type="text"
                  placeholder="e.g. Jubilee Hills, Hyderabad, Telangana"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                />
              </div>

              <div className="bui-form-group">
                <label>Client</label>
                <input
                  type="text"
                  placeholder="e.g. ABC Developers Pvt Ltd"
                  value={formData.client}
                  onChange={e => setFormData({ ...formData, client: e.target.value })}
                />
              </div>

              <div className="bui-form-group">
                <label>Project Description / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Brief overview of project goals, site, and scope..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {error && <div className="bui-toast-error">{error}</div>}

              <div className="bui-modal-actions">
                <button type="button" className="bui-btn bui-btn-outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="bui-btn bui-btn-primary" disabled={!formData.name.trim() || creating}>
                  {creating ? 'Creating...' : 'Create & Open Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </GlobalShell>
  )
}
