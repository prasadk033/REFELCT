import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/* ── Shared wrapper: full-width section → centred inner ─────────── */
const W = { maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 40px', boxSizing: 'border-box' }

/* ─── Navbar ─────────────────────────────────────────────────────── */
function Navbar({ navigate }) {
  const links = [
    { id: 'product',        label: 'Product' },
    { id: 'how-it-works',   label: 'How It Works' },
    { id: 'for-architects', label: 'For Architects' },
    { id: 'contact',        label: 'Contact' },
  ]
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#fff', borderBottom: '1px solid #e5e7eb',
      width: '100%'
    }}>
      <div style={{ ...W, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.05em' }}>R</span>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>Reflect</span>
        </div>
        <nav style={{ display: 'flex', gap: 32 }}>
          {links.map(l => (
            <a key={l.id} href={`#${l.id}`} style={{
              fontSize: 13.5, fontWeight: 500, color: '#6b7280',
              textDecoration: 'none', transition: 'color 0.12s'
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#000'}
              onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
            >{l.label}</a>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>Sign in</button>
          <button onClick={() => navigate('/login')} style={{ background: '#000', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Get Started</button>
        </div>
      </div>
    </header>
  )
}

/* ─── Section 1: PRODUCT ─────────────────────────────────────────── */
function ProductSection({ navigate }) {
  const features = [
    { emoji: '📄', color: '#e0f2fe', title: 'Structure Knowledge',     desc: 'Extract and organise information from drawings, reports, briefs and other documents.' },
    { emoji: '🗂️', color: '#fef9c3', title: 'Generate Brief Cards',    desc: 'Turn complex information into clear, reviewable cards with sources and evidence.' },
    { emoji: '⚙️', color: '#f3e8ff', title: 'Develop the Program',     desc: 'Identify spaces, function and requirements based on accepted brief knowledge.' },
    { emoji: '🔭', color: '#d1fae5', title: 'See the Bigger Picture',  desc: 'Visualise relationships, zones and dependencies across your project.' },
    { emoji: '👤', color: '#ffe4e6', title: 'Architect in Control',    desc: 'Review, edit and refine every step. You decide what is accepted.' },
    { emoji: '📚', color: '#fce7f3', title: 'Build Project Knowledge', desc: 'Create a structured, versioned knowledge base for the life of your project.' },
  ]

  return (
    <section id="product" style={{ width: '100%', padding: '60px 0 72px' }}>
      <div style={W}>

        {/* Label */}
        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 22 }}>PRODUCT</p>

        {/* Hero 2-col */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 52, alignItems: 'center', marginBottom: 72 }}>

          {/* Left text */}
          <div>
            <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.09, letterSpacing: '-0.03em', color: '#000', marginBottom: 20 }}>
              Turn project information into architectural insight.
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7, marginBottom: 32, maxWidth: 420 }}>
              Reflect is an AI-assisted architecture thinking app that helps you analyse project information, structure knowledge, and make confident architectural decisions.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/login')} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#000', color: '#fff', border: 'none',
                borderRadius: 7, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer'
              }}>
                <svg viewBox="0 0 24 24" width="15" height="15"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                Get Started with Google
              </button>
              <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fff', color: '#000', border: '1.5px solid #d1d5db',
                borderRadius: 7, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer'
              }}>
                See How It Works →
              </button>
            </div>
          </div>

          {/* Right – sketch image with label badge OUTSIDE the image, cleanly positioned */}
          <div style={{ position: 'relative' }}>
            {/* "Ideas into Spaces" badge – top-right corner OUTSIDE the image, above it */}
            <div style={{
              position: 'absolute',
              top: -36,
              right: 0,
              background: 'transparent',
              fontFamily: '"Comic Sans MS", "Segoe Script", cursive',
              fontSize: 19,
              color: '#111',
              lineHeight: 1.3,
              textAlign: 'right',
              pointerEvents: 'none',
              zIndex: 2,
              transform: 'rotate(3deg)',
              textShadow: 'none'
            }}>
              Ideas<br />into<br /><em style={{ fontStyle: 'italic', textDecoration: 'underline', textUnderlineOffset: 3 }}>Spaces</em>
            </div>
            <img
              src="/hero-sketch.jpg"
              alt="Architectural Modern Villa Concept Sketch"
              style={{ width: '100%', height: 360, objectFit: 'cover', borderRadius: 12, display: 'block', border: '1px solid #e5e7eb' }}
            />
          </div>
        </div>

        {/* Key Features */}
        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 18 }}>KEY FEATURES</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 64 }}>
          {features.map((f, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '16px 16px', border: '1px solid #e5e7eb', borderRadius: 10,
              background: '#fff', cursor: 'default',
              transition: 'border-color 0.15s, box-shadow 0.15s'
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {f.emoji}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Thinking Partner CTA */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1.1fr', alignItems: 'stretch',
          border: '1.5px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', background: '#fff'
        }}>
          <img src="/hero-sketch.jpg" alt="Thinking partner" style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }} />
          <div style={{ padding: '36px 36px 36px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 12 }}>DESIGNED FOR REAL PROJECTS</p>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#000', marginBottom: 14 }}>
              More than a tool.<br />A thinking partner.
            </h2>
            <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.7, marginBottom: 24 }}>
              Reflect helps you focus on what matters: people, places and possibilities. By giving structure to information, it creates space for deeper thinking and better design.
            </p>
            <button onClick={() => navigate('/login')} style={{
              alignSelf: 'flex-start', background: '#fff', color: '#000', border: '1.5px solid #000',
              borderRadius: 7, padding: '9px 22px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer'
            }}>Start a Project →</button>
          </div>
        </div>

      </div>
    </section>
  )
}

/* ─── Section 2: HOW IT WORKS ────────────────────────────────────── */
function HowItWorksSection({ navigate }) {
  const steps = [
    {
      num: 1, bg: '#3b82f6', shadow: 'rgba(59,130,246,0.35)',
      label: 'Upload Sources',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      desc: 'Add drawings, reports, briefs and other project documents.'
    },
    {
      num: 2, bg: '#8b5cf6', shadow: 'rgba(139,92,246,0.35)',
      label: 'Extract & Organise',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
      desc: 'AI extracts key information and organises it with sources and evidence.'
    },
    {
      num: 3, bg: '#10b981', shadow: 'rgba(16,185,129,0.35)',
      label: 'Review Brief Cards',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <polyline points="9 11 12 14 22 4"/>
        </svg>
      ),
      desc: 'Review, edit and accept brief cards that represent the verified project knowledge.'
    },
    {
      num: 4, bg: '#f59e0b', shadow: 'rgba(245,158,11,0.35)',
      label: 'Generate the Program',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      ),
      desc: 'Using accepted brief knowledge, Reflect identifies spaces, functions and requirements.'
    },
    {
      num: 5, bg: '#ef4444', shadow: 'rgba(239,68,68,0.35)',
      label: 'Explore & Refine',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
      desc: 'Visualise relationships, identify gaps, and refine your project as it evolves.'
    },
  ]

  const pipeline = [
    { icon: '📂', label: 'Sources',       desc: 'Upload and manage documents' },
    { icon: '📋', label: 'Brief',         desc: 'Key information as cards' },
    { icon: '🏗️', label: 'Program',       desc: 'Spaces and requirements' },
    { icon: '🗺️', label: 'Context',       desc: 'Wider project understanding' },
    { icon: '🎯', label: 'Focus',         desc: 'Set priorities' },
    { icon: '🧠', label: 'Problem Frame', desc: 'Identify challenges' },
    { icon: '✏️', label: 'Design Intent', desc: 'Shape the direction' },
  ]

  return (
    <section id="how-it-works" style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '60px 0 72px', width: '100%' }}>
      <div style={W}>

        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 22 }}>HOW IT WORKS</p>

        {/* Hero row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 52, alignItems: 'center', marginBottom: 60 }}>
          <div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#000', marginBottom: 18 }}>
              From information<br />to insight, step by step.
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7, maxWidth: 400 }}>
              Reflect turns your project documents into structured knowledge, helping you move from information to clear architectural decisions.
            </p>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', top: -30, right: 0,
              fontFamily: '"Comic Sans MS", "Segoe Script", cursive',
              fontSize: 17, color: '#111', lineHeight: 1.35, textAlign: 'right',
              transform: 'rotate(3deg)', zIndex: 2, pointerEvents: 'none'
            }}>
              A clearer<br />path from<br /><em style={{ fontStyle: 'italic' }}>information</em><br />to design.
            </div>
            <img src="/hero-sketch.jpg" alt="Architectural sketch" style={{ width: '100%', height: 240, objectFit: 'cover', borderRadius: 12, border: '1px solid #e5e7eb', display: 'block' }} />
          </div>
        </div>

        {/* ── 5-Step Flow ── vibrant, clean ── */}
        <div style={{
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16,
          padding: '40px 36px', marginBottom: 28
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>

                {/* Step card */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 8px' }}>

                  {/* Numbered circle with glow */}
                  <div style={{
                    width: 50, height: 50, borderRadius: '50%',
                    background: s.bg, color: '#fff',
                    fontWeight: 900, fontSize: 20, letterSpacing: '-0.03em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                    boxShadow: `0 4px 18px ${s.shadow}`
                  }}>
                    {s.num}
                  </div>

                  {/* Icon box */}
                  <div style={{
                    width: 52, height: 52, border: `1.5px solid ${s.bg}22`,
                    borderRadius: 12, background: `${s.bg}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: s.bg, marginBottom: 12
                  }}>
                    {s.icon}
                  </div>

                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.6 }}>{s.desc}</div>
                </div>

                {/* Arrow connector */}
                {i < steps.length - 1 && (
                  <div style={{ fontSize: 18, color: '#d1d5db', paddingTop: 15, flexShrink: 0 }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Connected Workflow pipeline */}
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: '32px 36px' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#000', marginBottom: 8 }}>A connected workflow</h3>
          <p style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 28, lineHeight: 1.65, maxWidth: 520 }}>
            Each workspace builds on the previous one, giving you a clear and structured path from project information to architectural insight.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
            {pipeline.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
                <div style={{ textAlign: 'center', minWidth: 96 }}>
                  <div style={{
                    width: 44, height: 44, border: '1.5px solid #e5e7eb', borderRadius: 10,
                    background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 8px', fontSize: 20
                  }}>{p.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 3 }}>{p.label}</div>
                  <div style={{ fontSize: 10.5, color: '#9ca3af', lineHeight: 1.45 }}>{p.desc}</div>
                </div>
                {i < pipeline.length - 1 && (
                  <div style={{ fontSize: 15, color: '#d1d5db', margin: '14px 2px 0', flexShrink: 0 }}>→</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, flexWrap: 'wrap', gap: 12 }}>
            <button onClick={() => navigate('/login')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#000', color: '#fff', border: 'none',
              borderRadius: 7, padding: '10px 24px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer'
            }}>See It in Action →</button>
            <p style={{ fontFamily: '"Comic Sans MS", cursive', fontSize: 17, color: '#000', textAlign: 'right', margin: 0, transform: 'rotate(1.5deg)' }}>
              Same information.<br /><em>Deeper thinking.</em>
            </p>
          </div>
        </div>

      </div>
    </section>
  )
}

/* ─── Section 3: FOR ARCHITECTS ─────────────────────────────────── */
function ForArchitectsSection({ navigate }) {
  const features = [
    { emoji: '📦', bg: '#e0f2fe', title: 'Organise Complexity',       desc: 'Bring all your project information together in one place.' },
    { emoji: '🧑‍💼', bg: '#fef9c3', title: 'Stay in Control',             desc: 'You review, edit and decide. AI is an assistant, not an authority.' },
    { emoji: '🔍', bg: '#f3e8ff', title: 'Identify the Missing Pieces', desc: 'Surface gaps, conflicts and unanswered questions.' },
    { emoji: '📊', bg: '#d1fae5', title: 'Make Better Decisions',       desc: 'See the bigger picture and understand relationships.' },
    { emoji: '⏱️', bg: '#ffe4e6', title: 'Save Time',                   desc: 'Reduce the time spent searching, organising and cross-checking.' },
    { emoji: '🛤️', bg: '#fce7f3', title: 'Support the Entire Journey',  desc: 'From early project exploration to design intent and beyond.' },
  ]

  const testimonials = [
    { quote: '"Reflect helps me focus on what really matters. It takes the document chaos and turns it into a clear foundation for design."', name: 'Ar. Priya Menon', role: 'Principal Architect' },
    { quote: '"It\'s like having a second brain for the project — always organised, always asking the right questions."', name: 'Ar. Daniel Kim', role: 'Design Director' },
  ]

  return (
    <section id="for-architects" style={{ padding: '60px 0 72px', borderTop: '1px solid #e5e7eb', width: '100%' }}>
      <div style={W}>

        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 22 }}>FOR ARCHITECTS</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 52, alignItems: 'center', marginBottom: 56 }}>
          <div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#000', marginBottom: 18 }}>
              Built for the way<br />you think.
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7, maxWidth: 420 }}>
              Reflect is designed with and for architects — to help you manage complexity, explore possibilities and focus on what matters most: great architecture.
            </p>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', top: -28, right: 0,
              fontFamily: '"Comic Sans MS", cursive',
              fontSize: 18, color: '#111', lineHeight: 1.35, textAlign: 'right',
              transform: 'rotate(2.5deg)', zIndex: 2, pointerEvents: 'none'
            }}>
              More time<br /><em style={{ fontStyle: 'italic' }}>to think.</em>
            </div>
            <img src="/hero-sketch.jpg" alt="Architectural sketch" style={{ width: '100%', height: 260, objectFit: 'cover', borderRadius: 12, border: '1px solid #e5e7eb', display: 'block' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 48 }}>
          {features.map((f, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '18px', border: '1px solid #e5e7eb', borderRadius: 10,
              background: '#fff', transition: 'border-color 0.15s, box-shadow 0.15s'
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.emoji}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {testimonials.map((t, i) => (
            <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px' }}>
              <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.7, marginBottom: 18, fontStyle: 'italic' }}>{t.quote}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🧑‍💼</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#000' }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

/* ─── Section 4: CONTACT ─────────────────────────────────────────── */
function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  const [sent, setSent] = useState(false)

  return (
    <section id="contact" style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '60px 0 80px', width: '100%' }}>
      <div style={W}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 72, alignItems: 'flex-start' }}>

          {/* Left – Form */}
          <div>
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 16 }}>CONTACT</p>
            <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, color: '#000', marginBottom: 14 }}>
              Let's build better<br />architectural thinking.
            </h2>
            <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.7, marginBottom: 32, maxWidth: 400 }}>
              We'd love to hear from you. Whether you have a question, feedback, or want to explore how Reflect can support your work, get in touch.
            </p>

            {sent ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '20px 24px' }}>
                <p style={{ fontWeight: 700, color: '#15803d', margin: 0 }}>✓ Message sent! We'll be in touch within 1–2 business days.</p>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); setSent(true) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Name *',             key: 'name',    placeholder: 'Your name',          type: 'text',  req: true },
                  { label: 'Email *',            key: 'email',   placeholder: 'you@company.com',    type: 'email', req: true },
                  { label: 'Company / Practice', key: 'company', placeholder: 'Your practice name', type: 'text',  req: false },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                    <input required={f.req} type={f.type} placeholder={f.placeholder} value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={e => e.target.style.borderColor = '#000'} onBlur={e => e.target.style.borderColor = '#d1d5db'}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Message *</label>
                  <textarea required placeholder="Tell us how we can help..." value={form.message}
                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={4}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111', background: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = '#000'} onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
                <button type="submit" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#000', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 24px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  Send Message →
                </button>
              </form>
            )}
          </div>

          {/* Right – Info */}
          <div>
            <div style={{ position: 'relative', marginBottom: 30 }}>
              <div style={{ position: 'absolute', top: -26, right: 0, fontFamily: '"Comic Sans MS", cursive', fontSize: 16, color: '#111', lineHeight: 1.35, textAlign: 'right', transform: 'rotate(2deg)', zIndex: 2, pointerEvents: 'none' }}>
                Better<br /><em>Spaces</em><br />Together.
              </div>
              <img src="/hero-sketch.jpg" alt="Architectural sketch" style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb', display: 'block' }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#000', marginBottom: 16 }}>Other ways to reach us</h3>
            {[
              { icon: '✉️', label: 'Email', value: 'hello@reflect.app' },
              { icon: '📍', label: 'Location', value: 'Hyderabad, India' },
              { icon: '💬', label: 'General Enquiries', value: 'We aim to respond within 1–2 business days.' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 2 }}>{r.label}</div>
                  <div style={{ fontSize: 12.5, color: '#6b7280' }}>{r.value}</div>
                </div>
              </div>
            ))}
            <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#000', marginBottom: 6 }}>✦ Interested in early access?</div>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.6 }}>Join our early users and be part of shaping Reflect.</p>
              <button style={{ background: '#fff', color: '#000', border: '1.5px solid #000', borderRadius: 6, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Get Started →</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: '#000', color: '#6b7280', padding: '24px 0' }}>
      <div style={{ ...W, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: 20, color: '#fff', letterSpacing: '-0.05em' }}>R</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Reflect</span>
          <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 12 }}>© 2026</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#4b5563' }}>
          🔒 Your data is private and secure. We never use your data to train models.
        </div>
      </div>
    </footer>
  )
}

/* ─── Root ────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#111', fontFamily: 'Inter, system-ui, sans-serif', overflowX: 'hidden' }}>
      <Navbar navigate={navigate} />
      <ProductSection navigate={navigate} />
      <HowItWorksSection navigate={navigate} />
      <ForArchitectsSection navigate={navigate} />
      <ContactSection />
      <Footer />
    </div>
  )
}
