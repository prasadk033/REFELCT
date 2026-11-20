import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getUnacknowledgedJobs, acknowledgeJobNotification } from '../api.js'

export default function TopHeader({ breadcrumbs = [] }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const dropdownRef = useRef(null)
  const notifRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dropdownRef, notifRef])

  useEffect(() => {
    let isMounted = true
    async function fetchNotifs() {
      try {
        const jobs = await getUnacknowledgedJobs()
        if (isMounted && Array.isArray(jobs)) {
          setNotifications(jobs)
        }
      } catch (err) {
        // Silently ignore notification fetch errors
      }
    }

    fetchNotifs()
    const interval = setInterval(fetchNotifs, 30000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  async function handleAcknowledge(jobId, e) {
    if (e) e.stopPropagation()
    try {
      await acknowledgeJobNotification(jobId)
      setNotifications(prev => prev.filter(j => j.id !== jobId))
    } catch (err) {
      console.warn('Failed to acknowledge notification:', err)
    }
  }

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('reflect-theme') || 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('reflect-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const userEmail = (user?.email || '').trim().toLowerCase()
  const isUserAdmin = Boolean(
    user?.is_admin ||
    userEmail === 'prasad.k@datai2i.com'
  )

  return (
    <header className="top-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
      <div className="th-breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <span
              className={`th-crumb ${crumb.path ? 'clickable' : ''} ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}
              onClick={() => crumb.path && navigate(crumb.path)}
            >
              {crumb.label}
            </span>
            {idx < breadcrumbs.length - 1 && <span className="th-separator">/</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="th-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, width: 'auto', marginLeft: 'auto' }}>
        {isUserAdmin && (
          <button
            onClick={() => navigate('/admin')}
            title="Open Admin Console"
            style={{
              background: '#e0e7ff',
              color: '#4338ca',
              border: '1px solid #c7d2fe',
              borderRadius: '6px',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>Admin Console</span>
          </button>
        )}

        <button
          className="th-icon-btn"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          onClick={toggleTheme}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '32px', height: '32px', cursor: 'pointer' }}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
        <div className="th-notif-wrap" ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="th-icon-btn"
            title="Notifications"
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '32px', height: '32px', cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {notifications.length > 0 && (
              <span className="th-badge" style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                background: '#ef4444',
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '50%',
                minWidth: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px'
              }}>
                {notifications.length}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="th-dropdown" style={{ width: '320px', right: 0, padding: '12px', maxHeight: '400px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '8px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-main, #0f172a)' }}>Notifications</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>{notifications.length} pending</span>
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '12.5px' }}>
                  No new notifications
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        handleAcknowledge(n.id)
                        if (n.project_id) navigate(`/projects/${n.project_id}`)
                        setNotifDropdownOpen(false)
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '12px' }}>{n.project_name || 'Project'}</strong>
                        <button
                          type="button"
                          onClick={(e) => handleAcknowledge(n.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '14px',
                            lineHeight: 1,
                            padding: '0 2px'
                          }}
                          title="Dismiss notification"
                        >
                          ✕
                        </button>
                      </div>
                      <div style={{ color: n.status === 'failed' ? '#dc2626' : 'var(--text-muted, #64748b)', fontSize: '11.5px', marginBottom: '4px' }}>
                        {n.error || n.current_step || (n.status === 'completed' ? 'Processing completed' : n.status)}
                      </div>
                      {n.cards_generated > 0 && (
                        <div style={{ color: '#2563eb', fontWeight: 600, fontSize: '11px' }}>
                          ✦ {n.cards_generated} Cards generated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="th-profile-wrap" ref={dropdownRef} style={{ position: 'relative', flexShrink: 0, marginLeft: '4px' }}>
          <button
            className="th-profile-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#0f172a',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '13px',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0
            }}
            title={user?.name || "Account Profile"}
          >
            {user?.picture ? <img src={user.picture} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <span>{user?.name?.[0]?.toUpperCase() || 'A'}</span>}
          </button>

          {dropdownOpen && (
            <div className="th-dropdown">
              <div className="th-dropdown-header">
                <div className="th-dropdown-avatar">
                  {user?.picture ? <img src={user.picture} alt="Avatar" /> : <span>{user?.name?.[0] || 'A'}</span>}
                </div>
                <div className="th-dropdown-userinfo">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div className="th-dropdown-name">{user?.name || 'Architect'}</div>
                    {isUserAdmin && (
                      <span style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: '#e0e7ff',
                        color: '#4338ca',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        letterSpacing: '0.04em'
                      }}>
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="th-dropdown-email">{user?.email || 'architect@studio.com'}</div>
                </div>
              </div>

              <div className="th-dropdown-divider"></div>

              {isUserAdmin && (
                <>
                  <button
                    className="th-dropdown-item"
                    onClick={() => { setDropdownOpen(false); navigate('/admin'); }}
                    style={{ color: '#4f46e5', fontWeight: 600, background: '#f5f3ff' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                    Admin Console
                  </button>
                  <div className="th-dropdown-divider"></div>
                </>
              )}

              <button className="th-dropdown-item" onClick={() => { setDropdownOpen(false); navigate('/settings'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Account Settings
              </button>

              <div className="th-dropdown-divider"></div>

              <button className="th-dropdown-item" onClick={logout} style={{ color: '#ef4444' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
