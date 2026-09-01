import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects, createProject } from '../api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import GlobalShell from '../components/GlobalShell.jsx'


export default function GlobalOverviewPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [projectsExpanded, setProjectsExpanded] = useState(true)
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
      const projData = await listProjects().catch(() => [])
      setProjects(projData || [])
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

  // Aggregate Metrics — only from real data
  const activeCount = projects.length
  const totalCards = projects.reduce((acc, p) => acc + (p.card_count || 0), 0)

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
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Project</span>
            </button>
          </div>
        </header>

        {/* At a Glance — only real metrics (no fake Q/Conflicts) */}
        <section className="gov-glance-section">
          <h2 className="gov-section-title">At a Glance</h2>
          <div className="gov-metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>

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
                  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
            </div>

          </div>
        </section>

        {/* Projects Section */}
        <section className="gov-projects-section">
          <div className="gov-section-header">
            <h2 className="gov-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Projects
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>
                {projects.length}
              </span>
            </h2>
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
            <div className="gov-projects-list">
                  {projects.map(p => (
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
                      </div>

                      <div className="gov-project-action" onClick={e => e.stopPropagation()}>
                        <button className="gov-btn-open" onClick={() => navigate(`/projects/${p.id}`)}>
                          Open
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
        </section>

        {/* Tip Box */}
        <section>
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
