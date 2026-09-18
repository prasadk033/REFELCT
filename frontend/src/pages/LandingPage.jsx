import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/* ─── Shared Nav ─────────────────────────────────────────────────── */
function Navbar({ activeSection, navigate }) {
  const links = [
    { id: 'product',       label: 'Product' },
    { id: 'how-it-works',  label: 'How It Works' },
    { id: 'for-architects',label: 'For Architects' },
    { id: 'contact',       label: 'Contact' },
  ]
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#ffffff', borderBottom: '1px solid #e5e7eb',
      padding: '0 48px'
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.05em', lineHeight: 1 }}>R</span>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>Reflect</span>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 32 }}>
          {links.map(l => (
            <a
              key={l.id}
              href={`#${l.id}`}
              style={{
                fontSize: 13.5, fontWeight: activeSection === l.id ? 700 : 500,
                color: activeSection === l.id ? '#000' : '#6b7280',
                textDecoration: 'none',
                borderBottom: activeSection === l.id ? '2px solid #000' : '2px solid transparent',
                paddingBottom: 4,
                transition: 'all 0.12s'
              }}
            >{l.label}</a>
          ))}
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Sign in
          </button>
          <button onClick={() => navigate('/login')} style={{
            background: '#000', color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            Get Started
          </button>
        </div>
      </div>
    </header>
  )
}

/* ─── Section 1: PRODUCT ─────────────────────────────────────────── */
function ProductSection({ navigate }) {
  const features = [
    { icon: '📄', title: 'Structure Knowledge',    desc: 'Extract and organise information from drawings, reports, briefs and other documents.' },
    { icon: '🗂️', title: 'Generate Brief Cards',  desc: 'Turn complex information into clear, reviewable cards with sources and evidence.' },
    { icon: '⚙️', title: 'Develop the Program',   desc: 'Identify spaces, function and requirements based on accepted brief knowledge.' },
    { icon: '🔭', title: 'See the Bigger Picture', desc: 'Visualise relationships, zones and dependencies across your project.' },
    { icon: '🧑‍💼', title: 'Architect in Control', desc: 'Review, edit and refine every step. You decide what is accepted.' },
    { icon: '📚', title: 'Build Project Knowledge',desc: 'Create a structured, versioned knowledge base for the life of your project.' },
  ]

  return (
    <section id="product" style={{ padding: '56px 48px 64px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Label */}
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 20 }}>
        PRODUCT
      </p>

      {/* Hero 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center', marginBottom: 72 }}>
        {/* Left */}
        <div>
          <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: '#000', marginBottom: 18 }}>
            Turn project information into architectural insight.
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65, marginBottom: 32, maxWidth: 440 }}>
            Reflect is an AI-assisted architecture thinking app that helps you analyse project information, structure knowledge, and make confident architectural decisions.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#000', color: '#fff', border: 'none',
                borderRadius: 6, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Get Started with Google
            </button>
            <button
              onClick={() => { document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fff', color: '#000', border: '1px solid #d1d5db',
                borderRadius: 6, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              See How It Works →
            </button>
          </div>
        </div>

        {/* Right – sketch + handwritten label */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', top: -10, right: 20, zIndex: 2,
            fontFamily: 'cursive', fontSize: 22, color: '#000',
            transform: 'rotate(3deg)', lineHeight: 1.2, textAlign: 'right'
          }}>
            Ideas<br/>into<br/><span style={{ fontStyle: 'italic' }}>Spaces</span>
          </div>
          <img
            src="/hero-sketch.jpg"
            alt="Architectural Modern Villa Concept Sketch"
            style={{ width: '100%', height: 340, objectFit: 'cover', borderRadius: 10, display: 'block' }}
          />
        </div>
      </div>

      {/* Key Features */}
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 20 }}>
        KEY FEATURES
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 64 }}>
        {features.map((f, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '16px 16px', border: '1px solid #e5e7eb', borderRadius: 10,
            background: '#fafafa', transition: 'border-color 0.12s'
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#9ca3af'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
          >
            <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#000', marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Thinking Partner CTA */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 40,
        alignItems: 'center', border: '1.5px solid #e5e7eb', borderRadius: 14,
        overflow: 'hidden', background: '#fff'
      }}>
        <img
          src="/hero-sketch.jpg"
          alt="Thinking partner"
          style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block', filter: 'grayscale(30%)' }}
        />
        <div style={{ padding: '32px 32px 32px 0' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 12 }}>
            DESIGNED FOR REAL PROJECTS
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#000', marginBottom: 14 }}>
            More than a tool.<br />A thinking partner.
          </h2>
          <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.65, marginBottom: 24 }}>
            Reflect helps you focus on what matters: people, places and possibilities. By giving structure to information, it creates space for deeper thinking and better design.
          </p>
          <button onClick={() => navigate('/login')} style={{
            background: '#fff', color: '#000', border: '1.5px solid #000',
            borderRadius: 6, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            Start a Project →
          </button>
        </div>
      </div>
    </section>
  )
}

/* ─── Section 2: HOW IT WORKS ────────────────────────────────────── */
function HowItWorksSection({ navigate }) {
  const steps = [
    { num: 1, color: '#3b82f6', label: 'Upload Sources',       desc: 'Add drawings, reports, briefs and other project documents.' },
    { num: 2, color: '#8b5cf6', label: 'Extract & Organise',   desc: 'AI extracts key information and organises it with sources and evidence.' },
    { num: 3, color: '#10b981', label: 'Review Brief Cards',   desc: 'Review, edit and accept brief cards that represent the verified project knowledge.' },
    { num: 4, color: '#f59e0b', label: 'Generate the Program', desc: 'Using accepted brief knowledge, Reflect identifies spaces, functions and requirements.' },
    { num: 5, color: '#ef4444', label: 'Explore & Refine',     desc: 'Visualise relationships, identify gaps, and refine your project as it evolves.' },
  ]

  const pipeline = ['Sources', 'Brief', 'Program', 'Context', 'Focus', 'Problem Frame', 'Design Intent']
  const pipeDesc = ['Upload and manage documents', 'Key information as cards', 'Spaces and requirements', 'Wider project understanding', 'Set priorities', 'Identify challenges', 'Shape the direction']

  return (
    <section id="how-it-works" style={{ background: '#fafafa', borderTop: '1px solid #e5e7eb', padding: '56px 48px 72px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Label */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 20 }}>
          HOW IT WORKS
        </p>

        {/* Hero row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center', marginBottom: 64 }}>
          <div>
            <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#000', marginBottom: 18 }}>
              From information<br />to insight, step by step.
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65, maxWidth: 420 }}>
              Reflect turns your project documents into structured knowledge, helping you move from information to clear architectural decisions.
            </p>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', top: -8, right: 0,
              fontFamily: 'cursive', fontSize: 18, color: '#000',
              transform: 'rotate(2deg)', lineHeight: 1.3, textAlign: 'right'
            }}>
              A clearer<br />path from<br /><em>information</em><br />to design.
            </div>
            <img
              src="/hero-sketch.jpg"
              alt="Architectural sketch"
              style={{ width: '100%', height: 240, objectFit: 'cover', borderRadius: 10, filter: 'grayscale(20%)' }}
            />
          </div>
        </div>

        {/* 5 Steps */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, alignItems: 'flex-start', marginBottom: 60, position: 'relative' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' }}>
              {/* Step number circle */}
              <div style={{
                width: 42, height: 42, borderRadius: '50%', background: s.color,
                color: '#fff', fontWeight: 800, fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 12, position: 'relative', zIndex: 2,
                boxShadow: `0 0 0 4px #fafafa, 0 0 0 6px ${s.color}22`
              }}>
                {s.num}
              </div>
              {/* Connector arrow (between steps) */}
              {i < steps.length - 1 && (
                <div style={{
                  position: 'absolute', top: 20, left: '75%',
                  fontSize: 16, color: '#d1d5db', zIndex: 1
                }}>→</div>
              )}
              {/* Icon placeholder */}
              <div style={{
                width: 48, height: 48, border: '1.5px solid #e5e7eb', borderRadius: 10,
                background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10, fontSize: 20
              }}>
                {['📤', '✨', '🗂️', '⚙️', '🔍'][i]}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#000', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5, padding: '0 8px' }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Connected Workflow */}
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '32px 36px' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#000', marginBottom: 8 }}>A connected workflow</h3>
          <p style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 28, maxWidth: 520, lineHeight: 1.6 }}>
            Each workspace builds on the previous one, giving you a clear and structured path from project information to architectural insight.
          </p>
          {/* Pipeline */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
            {pipeline.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{
                    width: 40, height: 40, border: '1.5px solid #e5e7eb', borderRadius: 8,
                    background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 8px', fontSize: 18
                  }}>
                    {['📂', '📋', '🏗️', '🗺️', '🎯', '🧠', '✏️'][i]}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 3 }}>{p}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.4 }}>{pipeDesc[i]}</div>
                </div>
                {i < pipeline.length - 1 && (
                  <div style={{ fontSize: 14, color: '#d1d5db', margin: '12px 4px 0', flexShrink: 0 }}>→</div>
                )}
              </div>
            ))}
          </div>

          {/* CTA + quote */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, flexWrap: 'wrap', gap: 16 }}>
            <button onClick={() => navigate('/login')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#000', color: '#fff', border: 'none',
              borderRadius: 6, padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              See It in Action →
            </button>
            <p style={{ fontFamily: 'cursive', fontSize: 18, color: '#000', textAlign: 'right', margin: 0 }}>
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
    { icon: '📦', title: 'Organise Complexity',      desc: 'Bring all your project information together in one place.' },
    { icon: '🧑‍💼', title: 'Stay in Control',          desc: 'You review, edit and decide. AI is an assistant, not an authority.' },
    { icon: '🔍', title: 'Identify the Missing Pieces', desc: 'Surface gaps, conflicts and unanswered questions.' },
    { icon: '📊', title: 'Make Better Decisions',     desc: 'See the bigger picture and understand relationships.' },
    { icon: '⏱️', title: 'Save Time',                 desc: 'Reduce the time spent searching, organising and cross-checking.' },
    { icon: '🛤️', title: 'Support the Entire Journey', desc: 'From early project exploration to design intent and beyond.' },
  ]

  const testimonials = [
    {
      quote: '"Reflect helps me focus on what really matters. It takes the document chaos and turns it into a clear foundation for design."',
      name: 'Ar. Priya Menon', role: 'Principal Architect'
    },
    {
      quote: '"It\'s like having a second brain for the project — always organised, always asking the right questions."',
      name: 'Ar. Daniel Kim', role: 'Design Director'
    }
  ]

  return (
    <section id="for-architects" style={{ padding: '56px 48px 72px', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Label */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 20 }}>
          FOR ARCHITECTS
        </p>

        {/* Hero row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center', marginBottom: 56 }}>
          <div>
            <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#000', marginBottom: 18 }}>
              Built for the way<br />you think.
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65, maxWidth: 420 }}>
              Reflect is designed with and for architects — to help you manage complexity, explore possibilities and focus on what matters most: great architecture.
            </p>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', top: -12, right: 0,
              fontFamily: 'cursive', fontSize: 20, color: '#000',
              transform: 'rotate(2deg)', lineHeight: 1.3, textAlign: 'right'
            }}>
              More time<br /><em>to think.</em>
            </div>
            <img
              src="/hero-sketch.jpg"
              alt="Architectural sketch"
              style={{ width: '100%', height: 260, objectFit: 'cover', borderRadius: 10, filter: 'grayscale(15%)' }}
            />
          </div>
        </div>

        {/* Features 3x2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 56 }}>
          {features.map((f, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '18px', border: '1px solid #e5e7eb', borderRadius: 10,
              background: '#fff', transition: 'border-color 0.12s, box-shadow 0.12s'
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#000', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {testimonials.map((t, i) => (
            <div key={i} style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
              padding: '24px 24px 20px'
            }}>
              <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, marginBottom: 18, fontStyle: 'italic' }}>
                {t.quote}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18
                }}>🧑‍💼</div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#000' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{t.role}</div>
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

  const handleSend = (e) => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <section id="contact" style={{ background: '#fafafa', borderTop: '1px solid #e5e7eb', padding: '56px 48px 80px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 72, alignItems: 'flex-start' }}>

        {/* Left – Form */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 16 }}>
            CONTACT
          </p>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, color: '#000', marginBottom: 14 }}>
            Let's build better<br />architectural thinking.
          </h2>
          <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.65, marginBottom: 32, maxWidth: 400 }}>
            We'd love to hear from you. Whether you have a question, feedback, or want to explore how Reflect can support your work, get in touch.
          </p>

          {sent ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '20px 24px' }}>
              <p style={{ fontWeight: 700, color: '#15803d', margin: 0 }}>✓ Message sent! We'll be in touch within 1–2 business days.</p>
            </div>
          ) : (
            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Name *', key: 'name', placeholder: 'Your name', type: 'text' },
                { label: 'Email *', key: 'email', placeholder: 'you@company.com', type: 'email' },
                { label: 'Company / Practice', key: 'company', placeholder: 'Your practice name', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                  <input
                    required={f.label.includes('*')}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{
                      width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db',
                      borderRadius: 6, fontSize: 13, color: '#111', background: '#fff',
                      outline: 'none', boxSizing: 'border-box',
                      transition: 'border-color 0.12s'
                    }}
                    onFocus={e => e.target.style.borderColor = '#000'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Message *</label>
                <textarea
                  required
                  placeholder="Tell us how we can help..."
                  value={form.message}
                  onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                  rows={4}
                  style={{
                    width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db',
                    borderRadius: 6, fontSize: 13, color: '#111', background: '#fff',
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                    fontFamily: 'inherit', transition: 'border-color 0.12s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#000'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </div>
              <button type="submit" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#000', color: '#fff', border: 'none',
                borderRadius: 6, padding: '11px 24px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                alignSelf: 'flex-start'
              }}>
                Send Message →
              </button>
            </form>
          )}
        </div>

        {/* Right – Info + sketch */}
        <div>
          <div style={{ position: 'relative', marginBottom: 32 }}>
            <div style={{
              position: 'absolute', top: -10, right: 0,
              fontFamily: 'cursive', fontSize: 18, color: '#000',
              transform: 'rotate(2deg)', lineHeight: 1.3, textAlign: 'right', zIndex: 2
            }}>
              Better<br /><em>Spaces</em><br />Together.
            </div>
            <img
              src="/hero-sketch.jpg"
              alt="Architectural sketch"
              style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 10, filter: 'grayscale(15%)' }}
            />
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#000', marginBottom: 16 }}>Other ways to reach us</h3>
          {[
            { icon: '✉️', label: 'Email', value: 'hello@reflect.app' },
            { icon: '📍', label: 'Location', value: 'Hyderabad, India' },
            { icon: '💬', label: 'General Enquiries', value: 'We aim to respond within 1–2 business days.' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 2 }}>{r.label}</div>
                <div style={{ fontSize: 12.5, color: '#6b7280' }}>{r.value}</div>
              </div>
            </div>
          ))}

          <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', marginTop: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#000', marginBottom: 6 }}>✦ Interested in early access?</div>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.55 }}>
              Join our early users and be part of shaping Reflect.
            </p>
            <button style={{
              background: '#fff', color: '#000', border: '1.5px solid #000',
              borderRadius: 6, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer'
            }}>
              Get Started →
            </button>
          </div>
        </div>

      </div>
    </section>
  )
}

/* ─── Page footer ─────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: '#000', color: '#9ca3af', padding: '28px 48px', borderTop: '1px solid #1f2937' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: 20, color: '#fff', letterSpacing: '-0.05em' }}>R</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Reflect</span>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 12 }}>© 2026</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#6b7280', display: 'flex', gap: 4, alignItems: 'center' }}>
          🔒 Your data is private and secure. We never use your data to train models.
        </div>
      </div>
    </footer>
  )
}

/* ─── Root Page ───────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate()
  const [activeSection] = useState('product')

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#111', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar activeSection={activeSection} navigate={navigate} />
      <ProductSection navigate={navigate} />
      <HowItWorksSection navigate={navigate} />
      <ForArchitectsSection navigate={navigate} />
      <ContactSection />
      <Footer />
    </div>
  )
}
