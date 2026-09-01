import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function LoginPage() {
  const { loginWithGoogle, loginDev, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, loading, navigate])

  async function handleGoogleSuccess(credentialResponse) {
    try {
      setError(null)
      await loginWithGoogle(credentialResponse.credential)
      navigate('/')
    } catch (err) {
      console.error('Login failed:', err)
      setError(err.message || 'Google sign-in failed. Please try again.')
    }
  }

  async function handleDevLogin() {
    try {
      setError(null)
      await loginDev()
      navigate('/')
    } catch (err) {
      console.error('Dev login failed:', err)
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="auth-page-container">
      
      {/* Top Brand Bar */}
      <header className="auth-top-bar">
        <div className="auth-brand" onClick={() => navigate('/')}>
          <div className="auth-brand-logo">R</div>
          <span className="auth-brand-name">Reflect</span>
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="auth-split-layout">
        
        {/* Left Hero Graphic & Typography */}
        <div className="auth-left-panel">
          <div className="auth-sketch-bg" />
          <div className="auth-left-content">
            <div className="auth-tagline-group">
              <h1 className="auth-main-title">Reflect</h1>
              <h2 className="auth-sub-title">Architect Thinking App</h2>
              <div className="auth-accent-dash" />
              <p className="auth-description">
                AI-assisted platform to help architects analyze project information, structure knowledge, and make confident architectural decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="auth-right-panel">
          <div className="auth-card">
            
            <h2 className="auth-card-title">Welcome back</h2>
            <p className="auth-card-subtitle">Sign in to continue to Reflect</p>

            <div className="auth-divider">
              <span className="auth-divider-text">or</span>
            </div>

            {/* Google Login Component */}
            <div className="auth-google-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in was cancelled or failed')}
                text="continue_with"
                shape="rectangular"
                theme="outline"
                size="large"
                width="300"
              />
            </div>

            {/* Dev Login Fallback Option */}
            <div className="auth-dev-login-option">
              <button className="auth-dev-btn" onClick={handleDevLogin}>
                Quick Studio Sign-in (Dev Access)
              </button>
            </div>

            {error && <div className="auth-error-msg">{error}</div>}

            {/* Footnote & Permissions */}
            <div className="auth-card-footnote">
              <div className="auth-lock-line">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>We never access your Google data without permission.</span>
              </div>
              <p className="auth-terms-line">
                By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* Bottom Footer */}
      <footer className="auth-footer">
        <div className="auth-footer-left">
          <span>© 2026 Reflect. All rights reserved.</span>
        </div>
        <div className="auth-footer-right">
          <a href="#terms">Terms of Service</a>
          <span className="auth-footer-sep">|</span>
          <a href="#privacy">Privacy Policy</a>
          <span className="auth-footer-sep">|</span>
          <a href="#support">Support</a>
        </div>
      </footer>

    </div>
  )
}
