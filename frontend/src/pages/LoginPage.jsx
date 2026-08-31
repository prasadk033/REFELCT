import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function LoginPage() {
  const { loginWithGoogle, loginDev, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/', { replace: true })
    return null
  }

  async function handleGoogleSuccess(response) {
    setLoading(true)
    setError(null)
    try {
      await loginWithGoogle(response.credential)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDevLogin() {
    setLoading(true)
    setError(null)
    try {
      await loginDev()
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <svg className="login-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <h1>REFLECT</h1>
          <p className="login-subtitle">Architect Thinking App</p>
        </div>

        <div className="login-card">
          <h2>Sign In</h2>
          <p className="login-desc">Sign in to access your architectural projects</p>

          {googleClientId ? (
            <div className="google-signin-wrapper">
              <button
                className="btn-google"
                onClick={() => {
                  if (window.google && window.google.accounts) {
                    window.google.accounts.id.initialize({
                      client_id: googleClientId,
                      callback: handleGoogleSuccess,
                    })
                    window.google.accounts.id.prompt()
                  } else {
                    setError('Google Sign-In not loaded. Please refresh the page.')
                  }
                }}
                disabled={loading}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {loading ? 'Signing in...' : 'Sign in with Google'}
              </button>
            </div>
          ) : (
            <div className="dev-login-wrapper">
              <p className="dev-notice">
                Google OAuth not configured. Using development login.
              </p>
              <button
                className="btn-dev-login"
                onClick={handleDevLogin}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Continue as Developer'}
              </button>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
        </div>

        <p className="login-footer-text">
          AI-assisted architectural thinking and decision support
        </p>
      </div>
    </div>
  )
}
