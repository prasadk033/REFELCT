import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { listProjects } from '../api.js'

export default function GlobalShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [sidebarProjects, setSidebarProjects] = useState([])

  const currentPath = location.pathname

  useEffect(() => {
    loadSidebarProjects()
  }, [])

  async function loadSidebarProjects() {
    try {
      const data = await listProjects()
      setSidebarProjects(data || [])
    } catch (err) {
      console.error('Failed to load sidebar projects:', err)
    }
  }

  return (
    <div className="g-shell">
      {/* Global Sidebar */}
      <aside className="g-sidebar">
        {/* Brand */}
        <div className="g-sidebar-brand" onClick={() => navigate('/overview')}>
          <div className="g-logo-icon">R</div>
          <span className="g-brand-name">Reflect</span>
        </div>

        {/* Global Navigation */}
        <nav className="g-nav-menu">
          <button
            className={`g-nav-item ${currentPath === '/' || currentPath === '/overview' ? 'active' : ''}`}
            onClick={() => navigate('/overview')}
          >
            <span className="g-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <span className="g-nav-text">Overview</span>
          </button>

          <button
            className={`g-nav-item ${currentPath === '/settings' ? 'active' : ''}`}
            onClick={() => navigate('/settings')}
          >
            <span className="g-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            <span className="g-nav-text">Settings</span>
          </button>
        </nav>

        {/* Dynamic Sidebar Projects Section */}
        <div className="g-sidebar-projects-section">
          <div className="g-sidebar-section-header">
            <span className="g-sidebar-section-title">Projects</span>
            <span className="g-sidebar-projects-count">{sidebarProjects.length}</span>
          </div>

          <div className="g-sidebar-projects-list">
            {sidebarProjects.length === 0 ? (
              <span className="g-sidebar-empty">No projects yet</span>
            ) : (
              sidebarProjects.map(p => {
                const isActive = currentPath.includes(p.id)
                return (
                  <button
                    key={p.id}
                    className={`g-sidebar-project-item ${isActive ? 'active' : ''}`}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    title={p.name}
                  >
                    <span className="g-sidebar-proj-dot" />
                    <span className="g-sidebar-proj-name">{p.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Plan Widget */}
        <div className="g-plan-widget">
          <div className="g-plan-header">
            <span className="g-plan-title">Reflect Studio</span>
            <span className="g-plan-sparkle">✦</span>
          </div>
          <p className="g-plan-desc">Virtual Architect Pro</p>
        </div>

        {/* User / Sign out */}
        <div className="g-sidebar-footer">
          <div className="g-user-info">
            <div className="g-avatar">
              {user?.picture ? <img src={user.picture} alt="Avatar" /> : <span>{user?.name?.[0] || 'A'}</span>}
            </div>
            <div className="g-user-text">
              <span className="g-user-name" title={user?.name || user?.email}>{user?.name || 'Architect'}</span>
              <span className="g-user-role">Studio</span>
            </div>
            <button className="g-signout-btn" onClick={logout} title="Sign Out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Global Content Area */}
      <main className="g-main">
        {children}
      </main>
    </div>
  )
}

