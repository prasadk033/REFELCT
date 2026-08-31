import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getProject, getCurrentBrief, getBriefVersions, getBriefById,
  getBriefSummary, listCards, createCard, updateCard, deleteCard,
  acceptCard, rejectCard,
} from '../api.js'

const BRIEF_SECTIONS = [
  { key: 'project_metadata', label: 'Project Metadata' },
  { key: 'what_we_have_received', label: 'What We Have Received' },
  { key: 'what_the_brief_says', label: 'What the Brief Says' },
  { key: 'what_seems_to_matter_underneath', label: 'What Seems to Matter Underneath' },
  { key: 'what_the_brief_treats_as_non_negotiable', label: 'What the Brief Treats as Non-Negotiable' },
  { key: 'tensions_worth_surfacing', label: 'Tensions Worth Surfacing' },
  { key: 'what_we_need_to_ask_find_out_and_study', label: 'What We Need to Ask, Find Out, and Study' },
  { key: 'a_note_on_this_brief', label: 'A Note on This Brief' },
]

const CARD_TYPES = ['FACT', 'REQUIREMENT', 'QUESTION', 'CONFLICT', 'ACTION', 'CLARIFICATION']
const CARD_TYPE_COLORS = {
  FACT: '#3b82f6',
  REQUIREMENT: '#8b5cf6',
  QUESTION: '#f59e0b',
  CONFLICT: '#ef4444',
  ACTION: '#10b981',
  CLARIFICATION: '#06b6d4',
}

export default function BriefPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [brief, setBrief] = useState(null)
  const [versions, setVersions] = useState([])
  const [summary, setSummary] = useState(null)
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('brief')
  const [activeSection, setActiveSection] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [cardFilter, setCardFilter] = useState('all')
  const [showVersions, setShowVersions] = useState(false)
  const [error, setError] = useState(null)

  // New card form
  const [newCard, setNewCard] = useState({ card_type: 'FACT', title: '', content: '', evidence: '' })

  useEffect(() => { loadAll() }, [projectId])

  async function loadAll() {
    setLoading(true)
    try {
      const [proj, briefData, vers, sum, cardsData] = await Promise.all([
        getProject(projectId),
        getCurrentBrief(projectId).catch(() => null),
        getBriefVersions(projectId).catch(() => []),
        getBriefSummary(projectId).catch(() => null),
        listCards(projectId).catch(() => []),
      ])
      setProject(proj)
      setBrief(briefData)
      setVersions(vers)
      setSummary(sum)
      setCards(cardsData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadVersion(versionId) {
    try {
      const briefData = await getBriefById(projectId, versionId)
      setBrief(briefData)
      setShowVersions(false)
    } catch (err) { setError(err.message) }
  }

  async function handleAcceptCard(cardId) {
    try {
      const updated = await acceptCard(cardId)
      setCards(cards.map(c => c.id === cardId ? updated : c))
      if (selectedCard?.id === cardId) setSelectedCard(updated)
    } catch (err) { setError(err.message) }
  }

  async function handleRejectCard(cardId) {
    try {
      const updated = await rejectCard(cardId)
      setCards(cards.map(c => c.id === cardId ? updated : c))
      if (selectedCard?.id === cardId) setSelectedCard(updated)
    } catch (err) { setError(err.message) }
  }

  async function handleDeleteCard(cardId) {
    try {
      await deleteCard(cardId)
      setCards(cards.filter(c => c.id !== cardId))
      if (selectedCard?.id === cardId) setSelectedCard(null)
    } catch (err) { setError(err.message) }
  }

  async function handleCreateCard() {
    if (!newCard.title || !newCard.content) return
    try {
      const created = await createCard(projectId, newCard)
      setCards([created, ...cards])
      setNewCard({ card_type: 'FACT', title: '', content: '', evidence: '' })
      setShowCreateCard(false)
    } catch (err) { setError(err.message) }
  }

  async function handleSaveEdit() {
    if (!editingCard) return
    try {
      const updated = await updateCard(editingCard.id, {
        title: editingCard.title,
        content: editingCard.content,
        evidence: editingCard.evidence,
        card_type: editingCard.card_type,
      })
      setCards(cards.map(c => c.id === updated.id ? updated : c))
      setSelectedCard(updated)
      setEditingCard(null)
    } catch (err) { setError(err.message) }
  }

  const filteredCards = cards.filter(c => {
    if (cardFilter === 'all') return true
    if (cardFilter === 'provisional') return c.status === 'provisional'
    if (cardFilter === 'accepted') return c.status === 'accepted'
    if (cardFilter === 'rejected') return c.status === 'rejected'
    return c.card_type === cardFilter
  })

  function renderMetadata(meta) {
    if (!meta || typeof meta !== 'object') return <p className="brief-text">Not provided</p>
    return (
      <div className="metadata-grid">
        {Object.entries(meta).map(([k, v]) => (
          <div key={k} className="metadata-row">
            <span className="metadata-key">{k.replace(/_/g, ' ')}</span>
            <span className="metadata-val">{v || 'Not provided'}</span>
          </div>
        ))}
      </div>
    )
  }

  function renderSectionContent(key, content) {
    if (key === 'project_metadata') return renderMetadata(content)
    if (!content) return <p className="brief-text empty">No information available for this section.</p>
    if (typeof content === 'string') {
      return <div className="brief-text">{content.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div>
    }
    return <pre className="brief-text">{JSON.stringify(content, null, 2)}</pre>
  }

  if (loading) {
    return <div className="page-loading"><span className="spinner" /> Loading brief...</div>
  }

  return (
    <div className="brief-page">
      {/* Top Bar */}
      <header className="brief-header">
        <div className="brief-header-left">
          <button className="btn-back" onClick={() => navigate(`/projects/${projectId}`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="brief-header-info">
            <span className="brief-header-type">{project?.project_type}</span>
            <h2 className="brief-header-name">{project?.name}</h2>
          </div>
        </div>
        <div className="brief-header-right">
          {brief && (
            <button className="btn-version" onClick={() => setShowVersions(!showVersions)}>
              Brief V{brief.version}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Version Dropdown */}
      {showVersions && (
        <div className="version-dropdown">
          {versions.map(v => (
            <div
              key={v.id}
              className={`version-item ${brief?.id === v.id ? 'active' : ''}`}
              onClick={() => handleLoadVersion(v.id)}
            >
              <div className="version-item-header">
                <strong>Brief V{v.version}</strong>
                <span className={`version-status status-${v.status}`}>{v.status}</span>
              </div>
              <span className="version-date">{new Date(v.created_at).toLocaleDateString()}</span>
              <span className="version-sources">{v.source_names?.join(', ') || 'No sources'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="brief-layout">
        {/* Sidebar */}
        <aside className="brief-sidebar">
          {/* Summary Stats */}
          {summary && (
            <div className="brief-summary-stats">
              <div className="summary-stat"><span className="stat-num">{summary.total_cards}</span><span className="stat-lbl">Cards</span></div>
              <div className="summary-stat"><span className="stat-num">{summary.ai_questions}</span><span className="stat-lbl">Questions</span></div>
              <div className="summary-stat"><span className="stat-num">{summary.conflicts}</span><span className="stat-lbl">Conflicts</span></div>
            </div>
          )}

          {/* Tab Toggle */}
          <div className="brief-tabs">
            <button className={`tab-btn ${activeTab === 'brief' ? 'active' : ''}`} onClick={() => setActiveTab('brief')}>Brief</button>
            <button className={`tab-btn ${activeTab === 'cards' ? 'active' : ''}`} onClick={() => setActiveTab('cards')}>Cards</button>
          </div>

          {/* Brief Sections Nav */}
          {activeTab === 'brief' && (
            <nav className="brief-sections-nav">
              {BRIEF_SECTIONS.map(s => (
                <button
                  key={s.key}
                  className={`section-nav-btn ${activeSection === s.key ? 'active' : ''}`}
                  onClick={() => setActiveSection(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          )}

          {/* Card Filters */}
          {activeTab === 'cards' && (
            <div className="card-filters">
              <button className={`filter-btn ${cardFilter === 'all' ? 'active' : ''}`} onClick={() => setCardFilter('all')}>All ({cards.length})</button>
              <button className={`filter-btn ${cardFilter === 'provisional' ? 'active' : ''}`} onClick={() => setCardFilter('provisional')}>Provisional</button>
              <button className={`filter-btn ${cardFilter === 'accepted' ? 'active' : ''}`} onClick={() => setCardFilter('accepted')}>Accepted</button>
              <button className={`filter-btn ${cardFilter === 'rejected' ? 'active' : ''}`} onClick={() => setCardFilter('rejected')}>Rejected</button>
              <hr className="filter-divider" />
              {CARD_TYPES.map(t => (
                <button key={t} className={`filter-btn ${cardFilter === t ? 'active' : ''}`} onClick={() => setCardFilter(t)}>
                  <span className="filter-dot" style={{ background: CARD_TYPE_COLORS[t] }} />
                  {t}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <div className="brief-content">
          {activeTab === 'brief' && (
            <div className="brief-document">
              {!brief ? (
                <div className="brief-empty">
                  <h3>No Brief Available</h3>
                  <p>Go to the project home to upload documents and analyse the brief.</p>
                  <button className="btn-primary" onClick={() => navigate(`/projects/${projectId}`)}>Go to Project</button>
                </div>
              ) : (
                <>
                  {BRIEF_SECTIONS.map(section => (
                    <div
                      key={section.key}
                      id={`section-${section.key}`}
                      className={`brief-section ${activeSection === section.key ? 'highlighted' : ''}`}
                    >
                      <h3 className="brief-section-title">{section.label}</h3>
                      {renderSectionContent(section.key, brief.content?.[section.key])}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'cards' && (
            <div className="cards-view">
              <div className="cards-toolbar">
                <span className="cards-count">{filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''}</span>
                <button className="btn-secondary" onClick={() => setShowCreateCard(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create Card
                </button>
              </div>

              {/* Create Card Form */}
              {showCreateCard && (
                <div className="create-card-form">
                  <h4>Create New Card</h4>
                  <select value={newCard.card_type} onChange={e => setNewCard({ ...newCard, card_type: e.target.value })}>
                    {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input placeholder="Title" value={newCard.title} onChange={e => setNewCard({ ...newCard, title: e.target.value })} />
                  <textarea placeholder="Content" value={newCard.content} onChange={e => setNewCard({ ...newCard, content: e.target.value })} rows={3} />
                  <input placeholder="Evidence (optional)" value={newCard.evidence} onChange={e => setNewCard({ ...newCard, evidence: e.target.value })} />
                  <div className="form-actions">
                    <button className="btn-primary" onClick={handleCreateCard} disabled={!newCard.title || !newCard.content}>Create</button>
                    <button className="btn-text" onClick={() => setShowCreateCard(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="cards-grid">
                {filteredCards.map(card => (
                  <div
                    key={card.id}
                    className={`brief-card ${selectedCard?.id === card.id ? 'selected' : ''} status-${card.status}`}
                    onClick={() => { setSelectedCard(card); setEditingCard(null) }}
                  >
                    <div className="brief-card-top">
                      <span className="card-type-badge" style={{ background: CARD_TYPE_COLORS[card.card_type] + '20', color: CARD_TYPE_COLORS[card.card_type] }}>
                        {card.card_type}
                      </span>
                      <span className={`card-status-badge status-${card.status}`}>{card.status}</span>
                    </div>
                    <h4 className="brief-card-title">{card.title}</h4>
                    <p className="brief-card-preview">{card.content.length > 120 ? card.content.substring(0, 120) + '...' : card.content}</p>
                    <div className="brief-card-footer">
                      <span className="card-author">{card.created_by === 'AI' ? '🤖 AI' : '👤 Architect'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedCard && (
          <aside className="brief-detail-panel">
            <div className="detail-panel-content">
              <div className="detail-panel-header">
                <span className="eyebrow">CARD DETAIL</span>
                <button className="close-btn" onClick={() => { setSelectedCard(null); setEditingCard(null) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {editingCard ? (
                <div className="card-edit-form">
                  <select value={editingCard.card_type} onChange={e => setEditingCard({ ...editingCard, card_type: e.target.value })}>
                    {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input value={editingCard.title} onChange={e => setEditingCard({ ...editingCard, title: e.target.value })} />
                  <textarea value={editingCard.content} onChange={e => setEditingCard({ ...editingCard, content: e.target.value })} rows={6} />
                  <input placeholder="Evidence" value={editingCard.evidence || ''} onChange={e => setEditingCard({ ...editingCard, evidence: e.target.value })} />
                  <div className="form-actions">
                    <button className="btn-primary" onClick={handleSaveEdit}>Save</button>
                    <button className="btn-text" onClick={() => setEditingCard(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="detail-card-type" style={{ background: CARD_TYPE_COLORS[selectedCard.card_type] + '20', color: CARD_TYPE_COLORS[selectedCard.card_type] }}>
                    {selectedCard.card_type}
                  </div>
                  <h3 className="detail-title">{selectedCard.title}</h3>

                  <div className="detail-meta">
                    <div className="meta-row"><span className="meta-key">Status</span><span className={`meta-value status-${selectedCard.status}`}>{selectedCard.status}</span></div>
                    <div className="meta-row"><span className="meta-key">Created by</span><span className="meta-value">{selectedCard.created_by === 'AI' ? '🤖 AI Generated' : '👤 Architect'}</span></div>
                    <div className="meta-row"><span className="meta-key">Section</span><span className="meta-value">{selectedCard.section || 'General'}</span></div>
                  </div>

                  <div className="detail-section">
                    <h4>Content</h4>
                    <p>{selectedCard.content}</p>
                  </div>

                  {selectedCard.evidence && (
                    <div className="detail-section">
                      <h4>Evidence</h4>
                      <p className="evidence-text">{selectedCard.evidence}</p>
                    </div>
                  )}

                  <div className="detail-actions">
                    {selectedCard.status === 'provisional' && (
                      <>
                        <button className="btn-accept" onClick={() => handleAcceptCard(selectedCard.id)}>✓ Accept</button>
                        <button className="btn-reject" onClick={() => handleRejectCard(selectedCard.id)}>✕ Reject</button>
                      </>
                    )}
                    <button className="btn-secondary" onClick={() => setEditingCard({ ...selectedCard })}>Edit</button>
                    <button className="btn-danger" onClick={() => handleDeleteCard(selectedCard.id)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {error && <div className="error-banner floating">{error} <button onClick={() => setError(null)}>✕</button></div>}
    </div>
  )
}
