import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import GlobalShell from '../components/GlobalShell.jsx'

export default function SettingsPage() {
  const { user, logout } = useAuth()

  const [notifications, setNotifications] = useState({
    analysisAlerts: true,
    emailSummary: false,
    cardStatusUpdates: true,
  })

  const [preferences, setPreferences] = useState({
    defaultView: 'grid', // 'grid' | 'list'
    autoExpandEvidence: true,
    theme: localStorage.getItem('reflect-theme') || 'light',
  })

  const [savedToast, setSavedToast] = useState(false)

  function handleSave(e) {
    e.preventDefault()
    
    // Persist and apply theme
    if (preferences.theme === 'light' || preferences.theme === 'dark') {
      localStorage.setItem('reflect-theme', preferences.theme)
      document.documentElement.setAttribute('data-theme', preferences.theme)
    }

    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 3000)
  }

  function handleThemeChange(newTheme) {
    setPreferences(prev => ({ ...prev, theme: newTheme }))
    localStorage.setItem('reflect-theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <GlobalShell>
      <div className="gov-container" style={{ maxWidth: '840px', margin: '0 auto', paddingBottom: '60px' }}>
        
        {/* Header */}
        <header className="gov-header" style={{ marginBottom: '28px' }}>
          <div className="gov-header-left">
            <h1 className="gov-greeting">Settings & Preferences</h1>
            <p className="gov-subtitle">Manage your profile, connected account, and studio preferences.</p>
          </div>
        </header>

        {savedToast && (
          <div className="bui-toast">
            Settings saved successfully
          </div>
        )}

        <form onSubmit={handleSave}>
          {/* Section 1: Profile & Account */}
          <section className="pov-box" style={{ marginBottom: '20px' }}>
            <h3 className="pov-box-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <circle cx="12" cy="7" r="4" />
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              </svg>
              Profile & Account
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 0', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <div className="g-avatar" style={{ width: '56px', height: '56px', fontSize: '20px' }}>
                {user?.picture ? <img src={user.picture} alt="Avatar" /> : <span>{user?.name?.[0] || 'A'}</span>}
              </div>
              <div>
                <strong style={{ fontSize: '16px', display: 'block', color: 'var(--text-main, #0f172a)' }}>{user?.name || 'Architect'}</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>{user?.email || 'architect@reflect.local'}</span>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="bui-form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  defaultValue={user?.name || 'Architect'}
                  readOnly
                  className="bui-input"
                  style={{ cursor: 'not-allowed', opacity: 0.8 }}
                />
              </div>
              <div className="bui-form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  defaultValue={user?.email || 'architect@reflect.local'}
                  readOnly
                  className="bui-input"
                  style={{ cursor: 'not-allowed', opacity: 0.8 }}
                />
              </div>
            </div>
          </section>

          {/* Section 2: Connected Google Account */}
          <section className="pov-box" style={{ marginBottom: '20px' }}>
            <h3 className="pov-box-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Connected Google Account
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-main, #0f172a)' }}>Google Authentication</strong>
                  <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#166534', padding: '2px 8px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    Connected
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                  Signed in via Google OAuth for single-click access and document analysis security.
                </p>
              </div>
              <button
                type="button"
                className="bui-btn bui-btn-outline"
                style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={logout}
              >
                Sign Out
              </button>
            </div>
          </section>

          {/* Section 3: Notification Preferences */}
          <section className="pov-box" style={{ marginBottom: '20px' }}>
            <h3 className="pov-box-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Notification Preferences
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-main, #0f172a)' }}>Analysis Completion Alerts</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>Show in-app banner and modal immediately when Brief cards are synthesized</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.analysisAlerts}
                  onChange={e => setNotifications({ ...notifications, analysisAlerts: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-main, #0f172a)' }}>Card Review Changes</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>Notify when cards are accepted or updated</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.cardStatusUpdates}
                  onChange={e => setNotifications({ ...notifications, cardStatusUpdates: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-main, #0f172a)' }}>Daily Project Digest</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>Receive an email summary of unresolved questions and conflicts</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.emailSummary}
                  onChange={e => setNotifications({ ...notifications, emailSummary: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
              </label>
            </div>
          </section>

          {/* Section 4: Application & Workspace Preferences */}
          <section className="pov-box" style={{ marginBottom: '28px' }}>
            <h3 className="pov-box-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Application Preferences
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
              <div className="bui-form-group">
                <label>Default Card View</label>
                <select
                  value={preferences.defaultView}
                  onChange={e => setPreferences({ ...preferences, defaultView: e.target.value })}
                >
                  <option value="grid">Grid View</option>
                  <option value="list">List View</option>
                </select>
              </div>

              <div className="bui-form-group">
                <label>Theme</label>
                <select
                  value={preferences.theme}
                  onChange={e => handleThemeChange(e.target.value)}
                >
                  <option value="light">Light Theme</option>
                  <option value="dark">Dark Theme</option>
                </select>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="submit" className="bui-btn bui-btn-primary" style={{ padding: '10px 24px' }}>
              Save Changes
            </button>
          </div>
        </form>

      </div>
    </GlobalShell>
  )
}
