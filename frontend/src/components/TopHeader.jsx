import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function TopHeader({ breadcrumbs = [] }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dropdownRef])

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

  return (
    <header className="top-header">
      <div className="th-breadcrumbs">
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

      <div className="th-actions">
        <button 
          className="th-icon-btn" 
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          onClick={toggleTheme}
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
        <button className="th-icon-btn" title="Notifications" style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span className="th-badge"></span>
        </button>

        <div className="th-profile-wrap" ref={dropdownRef}>
          <button className="th-profile-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
            {user?.picture ? <img src={user.picture} alt="Avatar" /> : <span>{user?.name?.[0] || 'A'}</span>}
          </button>

          {dropdownOpen && (
            <div className="th-dropdown">
              <div className="th-dropdown-header">
                <div className="th-dropdown-avatar">
                  {user?.picture ? <img src={user.picture} alt="Avatar" /> : <span>{user?.name?.[0] || 'A'}</span>}
                </div>
                <div className="th-dropdown-userinfo">
                  <div className="th-dropdown-name">{user?.name || 'Architect'}</div>
                  <div className="th-dropdown-email">{user?.email || 'architect@studio.com'}</div>
                </div>
              </div>
              
              <div className="th-dropdown-divider"></div>
              
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
