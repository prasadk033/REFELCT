import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="lp-container">
      {/* Top Header / Navigation Bar */}
      <header className="lp-navbar">
        <div className="lp-nav-inner">
          <div className="lp-brand" onClick={() => navigate('/')}>
            <div className="lp-logo-badge">R</div>
            <span className="lp-brand-name">Reflect</span>
          </div>

          <nav className="lp-nav-links">
            <a href="#product" className="lp-nav-link">Product</a>
            <a href="#how-it-works" className="lp-nav-link">How it Works</a>
            <a href="#for-architects" className="lp-nav-link">For Architects</a>
            <a href="#security" className="lp-nav-link">Security</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
            <a href="#contact" className="lp-nav-link">Contact</a>
          </nav>

          <div className="lp-nav-actions">
            <button className="lp-btn-signin" onClick={() => navigate('/login')}>Sign in</button>
            <button className="lp-btn-get-started" onClick={() => navigate('/login')}>Get Started</button>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="lp-hero-section">
        <div className="lp-hero-grid">
          
          {/* Left Column: Headlines, Value Props, Get Started CTA */}
          <div className="lp-hero-left">
            <h1 className="lp-headline">
              Think deeper.<br />
              Design better.
            </h1>

            <p className="lp-subheadline">
              Reflect is the AI-assisted architecture thinking app that helps you analyse project information, structure knowledge, and make confident architectural decisions.
            </p>

            {/* 3 Core Value Props */}
            <div className="lp-value-props">
              <div className="lp-value-prop-item">
                <div className="lp-prop-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div className="lp-prop-text">
                  <strong>Structure Knowledge</strong>
                  <p>Turn complex project information into clear, connected knowledge.</p>
                </div>
              </div>

              <div className="lp-value-prop-item">
                <div className="lp-prop-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M12 2a5 5 0 0 1 5 5c0 1.25-.46 2.4-1.22 3.28A6.5 6.5 0 0 1 20 16a4 4 0 0 1-4 4h-2a2 2 0 0 1-2-2v-3" />
                    <path d="M12 2a5 5 0 0 0-5 5c0 1.25.46 2.4 1.22 3.28A6.5 6.5 0 0 0 4 16a4 4 0 0 0 4 4h2a2 2 0 0 0 2-2v-3" />
                  </svg>
                </div>
                <div className="lp-prop-text">
                  <strong>AI-Assisted</strong>
                  <p>AI helps you analyse, organise and surface what matters most.</p>
                </div>
              </div>

              <div className="lp-value-prop-item">
                <div className="lp-prop-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <div className="lp-prop-text">
                  <strong>Architect in Control</strong>
                  <p>You remain the decision maker. AI is an assisting capability, not an authority.</p>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="lp-cta-row">
              <button className="lp-btn-get-started-hero" onClick={() => navigate('/login')}>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Get Started with Google</span>
              </button>

              <button className="lp-btn-learn-more" onClick={() => navigate('/login')}>
                <span>Learn More</span>
                <span className="lp-arrow">→</span>
              </button>
            </div>

            <div className="lp-security-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Secure, private and built for architects.</span>
            </div>
          </div>

          {/* Right Column: Architectural Hand-Drawn Sketch Illustration */}
          <div className="lp-hero-right">
            <div className="lp-sketch-card">
              <img
                src="/hero-sketch.jpg"
                alt="Architectural Modern Villa Concept Sketch"
                className="lp-hero-img"
              />
            </div>
          </div>

        </div>
      </main>

      {/* Bottom Section: Feature Row */}
      <section className="lp-features-section">
        <h2 className="lp-features-heading">Everything you need to think architecturally</h2>

        <div className="lp-features-grid">
          
          <div className="lp-feature-card">
            <div className="lp-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="lp-feature-title">Upload & Analyse</h3>
            <p className="lp-feature-desc">Upload project documents and let Reflect analyse and extract key information.</p>
          </div>

          <div className="lp-feature-card">
            <div className="lp-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="13" y2="16" />
              </svg>
            </div>
            <h3 className="lp-feature-title">Structured Brief</h3>
            <p className="lp-feature-desc">Convert information into meaningful Brief Cards with source and evidence.</p>
          </div>

          <div className="lp-feature-card">
            <div className="lp-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="lp-feature-title">Surface Questions</h3>
            <p className="lp-feature-desc">AI identifies questions, conflicts and missing information for you.</p>
          </div>

          <div className="lp-feature-card">
            <div className="lp-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <h3 className="lp-feature-title">Architect Review</h3>
            <p className="lp-feature-desc">Review, edit, accept or reject AI suggestions. You stay in control.</p>
          </div>

          <div className="lp-feature-card">
            <div className="lp-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <h3 className="lp-feature-title">Traceable Knowledge</h3>
            <p className="lp-feature-desc">Every piece of knowledge is traceable to its source and evidence.</p>
          </div>

        </div>

        <div className="lp-footer-trust">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Your data is private and secure. We never use your data to train models.</span>
        </div>
      </section>
    </div>
  )
}
