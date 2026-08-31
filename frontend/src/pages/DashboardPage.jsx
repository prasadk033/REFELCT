import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { listProjects } from '../api.js'
import CreateProjectModal from '../components/CreateProjectModal.jsx'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const data = await listProjects()
      setProjects(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleProjectCreated(project) {
    setShowCreate(false)
    navigate(`/projects/${project.id}`)
  }

  const typeColors = {
    'School Interior': '#3b82f6',
    'Residential Interior': '#10b981',
    'Office Interior': '#8b5cf6',
    'Hospitality Interior': '#f59e0b',
    'Retail Interior': '#ef4444',
    'Healthcare Interior': '#06b6d4',
    'Institutional Building': '#6366f1',
    'Commercial Building': '#ec4899',
  }

  function getTypeColor(type) {
    return typeColors[type] || '#6b7280'
  }

  return (
    <div className="dashboard-page">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span className="dash-brand">REFLECT</span>
        </div>
        <div className="dash-header-right">
          <div className="dash-user">
            <div className="avatar-sm">{user?.name?.[0] || 'U'}</div>
            <span className="dash-user-name">{user?.name || user?.email}</span>
          </div>
          <button className="btn-text" onClick={logout}>Sign Out</button>
        </div>
      </header>

      {/* Main */}
      <main className="dash-main">
        <div className="dash-top-row">
          <div>
            <h1 className="dash-title">Projects</h1>
            <p className="dash-subtitle">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Project
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="dash-loading">
            <span className="spinner" /> Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </div>
            <h3>No projects yet</h3>
            <p>Create your first project to start analysing architectural briefs.</p>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>Create Project</button>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map(p => (
              <div
                key={p.id}
                className="project-card"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="project-card-top">
                  <div className="project-type-badge" style={{ background: getTypeColor(p.project_type) + '18', color: getTypeColor(p.project_type) }}>
                    {p.project_type}
                  </div>
                </div>
                <h3 className="project-card-name">{p.name}</h3>
                {p.location && <p className="project-card-loc">{p.location}</p>}
                <div className="project-card-stats">
                  <span className="stat-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {p.source_count} Source{p.source_count !== 1 ? 's' : ''}
                  </span>
                  {p.brief_version && (
                    <span className="stat-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                      Brief V{p.brief_version}
                    </span>
                  )}
                  <span className="stat-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                    </svg>
                    {p.card_count} Card{p.card_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="project-card-footer">
                  <span className="project-card-date">
                    Updated {new Date(p.updated_at).toLocaleDateString()}
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  )
}
