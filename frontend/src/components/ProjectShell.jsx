import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import AiHealthBanner from './AiHealthBanner.jsx'
import TopHeader from './TopHeader.jsx'

export default function ProjectShell({ children, project }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  const projectId = project?.id
  const isBrief = location.pathname.includes('/brief')
  const isOverview = !isBrief

  return (
    <div className="p-shell">
      {/* Project-Specific Sidebar */}
      <aside className="p-sidebar">
        {/* Brand */}
        <div className="p-sidebar-brand" onClick={() => navigate('/')}>
          <div className="p-logo-icon">R</div>
          <span className="p-brand-name">Reflect</span>
        </div>

        {/* Project Header Widget */}
        <div className="p-sidebar-project-box" onClick={() => projectId && navigate(`/projects/${projectId}`)}>
          <div className="p-project-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" />
            </svg>
          </div>
          <div className="p-project-meta">
            <div className="p-project-title-row">
              <span className="p-project-title" title={project?.name}>{project?.name || 'Jubilee Hills Residence'}</span>
              <span className="p-project-arrow">▾</span>
            </div>
            <span className="p-project-sub">{project?.project_type || 'Premium Residential Project'}</span>
          </div>
        </div>

        {/* Project Navigation Menu */}
        <nav className="p-nav-menu">
          <button
            className={`p-nav-item ${isOverview ? 'active' : ''}`}
            onClick={() => projectId && navigate(`/projects/${projectId}`)}
          >
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <span className="p-nav-text">Project Overview</span>
          </button>

          <button
            className={`p-nav-item ${isBrief ? 'active' : ''} ${!project?.card_count ? 'disabled' : ''}`}
            onClick={() => project?.card_count > 0 && navigate(`/projects/${projectId}/brief`)}
            title={!project?.card_count ? "Workspace locked until Brief Cards are generated" : ""}
            style={!project?.card_count ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="13" y2="16" />
              </svg>
            </span>
            <span className="p-nav-text">Brief</span>
          </button>

          {/* Placeholders for future workspaces */}
          <button className="p-nav-item locked" title="Future Workspace">
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </span>
            <span className="p-nav-text">Program</span>
          </button>

          <button className="p-nav-item locked" title="Future Workspace">
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              </svg>
            </span>
            <span className="p-nav-text">Context</span>
          </button>

          <button className="p-nav-item locked" title="Future Workspace">
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
            </span>
            <span className="p-nav-text">Focus</span>
          </button>

          <button className="p-nav-item locked" title="Future Workspace">
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span className="p-nav-text">Problem Frame</span>
          </button>

          <button className="p-nav-item locked" title="Future Workspace">
            <span className="p-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </span>
            <span className="p-nav-text">Design Intent</span>
          </button>
        </nav>

        {/* Project Sidebar Footer with version & sign out */}
        <div className="p-sidebar-footer" style={{ borderTop: 'none', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Reflect v1.0.0</span>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              color: '#ef4444',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 6px',
              borderRadius: '4px'
            }}
            title="Sign out of account"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="p-main">
        <TopHeader breadcrumbs={[
          { label: 'Projects', path: '/overview' },
          { label: project?.name || 'Loading...', path: `/projects/${projectId}` },
          ...(isBrief ? [{ label: 'Brief Workspace' }] : [])
        ]} />
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <AiHealthBanner />
          {children}
        </div>
      </main>
    </div>
  )
}
