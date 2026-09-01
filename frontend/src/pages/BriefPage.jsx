import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  listProjects, getProject,
  listCards, createCard, updateCard, deleteCard,
  acceptCard, rejectCard, listSources, uploadSource
} from '../api.js'
import ProjectShell from '../components/ProjectShell.jsx'

const CARD_TYPES = [
  'Fact',
  'Requirement',
  'Question',
  'Conflict',
  'Other',
  'Action',
  'Clarification'
]

function getCardIcon(type = '') {
  const t = (type || '').toLowerCase()
  if (t.includes('fact') || t.includes('info')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    )
  }
  if (t.includes('require')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    )
  }
  if (t.includes('question')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }
  if (t.includes('conflict') || t.includes('tension')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }
  if (t.includes('action')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  }
  if (t.includes('clarif')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  )
}

function normalizeDisplayType(type = '') {
  const t = (type || '').toUpperCase().trim()
  if (t === 'FACT' || t === 'INFORMATION') return 'Fact'
  if (t === 'REQUIREMENT') return 'Requirement'
  if (t === 'QUESTION') return 'Question'
  if (t === 'CONFLICT' || t === 'TENSION') return 'Conflict'
  if (t === 'OTHER') return 'Other'
  if (t === 'ACTION') return 'Action'
  if (t === 'CLARIFICATION') return 'Clarification'
  if (t === 'GOAL') return 'Goal'
  if (t === 'DESIGN PREFERENCE' || t === 'PREFERENCE') return 'Design Preference'
  if (t === 'CONSTRAINT') return 'Constraint'
  return type || 'Other'
}

function normalizeDisplayStatus(status = '') {
  const s = (status || '').toLowerCase()
  if (s === 'accepted') return 'Accepted'
  if (s === 'edited') return 'Edited'
  if (s === 'rejected') return 'Rejected'
  return 'Provisional'
}

function getCleanDocName(raw = '') {
  if (!raw) return 'Architect Direct Input'
  return raw.split(' (')[0].trim() || 'Architect Direct Input'
}

// Guard against cards with truly garbage content only — don't over-filter
function cleanCardContent(content = '') {
  if (!content) return 'No content available for this card.'
  const c = content.trim()
  // Only block truly garbage patterns (raw JSON, pure file name echo, empty)
  const isGarbage = (
    (c.startsWith('{') && c.endsWith('}')) ||
    (c.startsWith('[') && c.endsWith(']')) ||
    c.toLowerCase().startsWith('document:') ||
    c.toLowerCase().startsWith('[source document name:') ||
    c.toLowerCase().startsWith('brief overview context:') ||
    c.toLowerCase().startsWith('[note:') ||
    c.length < 12
  )
  if (isGarbage) {
    return 'This card needs re-analysis. Run Analyse again from the Project Overview to generate a meaningful summary.'
  }
  return c
}

export default function BriefPage() {
  const { projectId: routeProjectId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [activeProjectId, setActiveProjectId] = useState(routeProjectId || null)
  const [project, setProject] = useState(null)
  const [cards, setCards] = useState([])
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState('All Cards') // 'All Cards', 'Pending', 'Accepted', 'Rejected'
  const [selectedDocFilter, setSelectedDocFilter] = useState('ALL') // 'ALL' or specific file_name
  const [selectedVersionFilter, setSelectedVersionFilter] = useState('ALL') // 'ALL' or number
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [typeFilter, setTypeFilter] = useState('All Types')
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'list'

  // Card Inspector
  const [selectedCard, setSelectedCard] = useState(null)

  // Modals & Card menus
  const [showAddCard, setShowAddCard] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [activeMenuCardId, setActiveMenuCardId] = useState(null)


  const [newCard, setNewCard] = useState({
    title: '',
    content: '',
    card_type: 'Requirement',
    source_document: '',
    evidence: '',
  })

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    initWorkspace()
  }, [routeProjectId])

  async function initWorkspace() {
    setLoading(true)
    try {
      let currentId = routeProjectId
      if (!currentId) {
        const pList = await listProjects()
        if (pList && pList.length > 0) {
          currentId = pList[0].id
        }
      }

      if (currentId) {
        setActiveProjectId(currentId)
        const [p, c, s] = await Promise.all([
          getProject(currentId),
          listCards(currentId).catch(() => []),
          listSources(currentId).catch(() => []),
        ])
        setProject(p)
        setCards(c || [])
        setSources(s || [])
      }
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !activeProjectId) return
    setUploading(true)
    try {
      await uploadSource(activeProjectId, file)
      showToast(`Uploaded ${file.name}. You can analyse it from Project Overview.`)
      const [s, c] = await Promise.all([
        listSources(activeProjectId),
        listCards(activeProjectId),
      ])
      setSources(s || [])
      setCards(c || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleStatusChange(cardId, newStatus) {
    try {
      if (newStatus === 'accepted') {
        await acceptCard(cardId)
      } else if (newStatus === 'rejected') {
        await rejectCard(cardId)
      } else {
        await updateCard(cardId, { status: newStatus })
      }
      setCards(cards.map(c => c.id === cardId ? { ...c, status: newStatus } : c))
      setActiveMenuCardId(null)
      showToast(`Card marked as ${newStatus}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteCard(cardId) {
    try {
      await deleteCard(cardId)
      setCards(cards.filter(c => c.id !== cardId))
      setActiveMenuCardId(null)
      showToast('Card deleted')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCreateNewCard(e) {
    e.preventDefault()
    if (!newCard.content.trim()) return
    try {
      const created = await createCard(activeProjectId, {
        title: newCard.title.trim() || newCard.content.slice(0, 30),
        content: newCard.content.trim(),
        card_type: newCard.card_type.toUpperCase(),
        source_document: newCard.source_document.trim() || 'Architect Direct Input',
        evidence: newCard.evidence.trim() || 'Manual Input',
        status: 'accepted'
      })
      setCards([created, ...cards])
      setShowAddCard(false)
      setNewCard({ title: '', content: '', card_type: 'Requirement', source_document: '', evidence: '' })
      showToast('Brief Card created and accepted!')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveEditedCard(e) {
    e.preventDefault()
    if (!editingCard) return
    try {
      const updated = await updateCard(editingCard.id, {
        title: editingCard.title,
        content: editingCard.content,
        card_type: editingCard.card_type.toUpperCase(),
        evidence: editingCard.evidence,
        status: 'edited'
      })
      setCards(cards.map(c => c.id === updated.id ? updated : c))
      setEditingCard(null)
      showToast('Card updated successfully')
    } catch (err) {
      setError(err.message)
    }
  }

  // Pure Document List derived from project sources
  const documentList = useMemo(() => {
    const approvedSources = sources.filter(s => s.approval_status === 'approved')
    const list = approvedSources.map((s, idx) => ({
      id: s.id,
      fileName: s.file_name,
      label: `Document ${idx + 1}: ${s.file_name}`,
      shortLabel: s.file_name,
    }))

    const hasManual = cards.some(c => {
      const clean = getCleanDocName(c.source_document)
      return !sources.some(s => s.file_name.toLowerCase() === clean.toLowerCase())
    })
    if (hasManual) {
      list.push({
        id: 'manual',
        fileName: 'Architect Direct Input',
        label: 'Architect Direct Input',
        shortLabel: 'Manual Input'
      })
    }
    return list
  }, [sources, cards])

  // Count cards per pure document
  const docCounts = useMemo(() => {
    const map = {}
    documentList.forEach(d => {
      map[d.fileName] = 0
    })
    cards.forEach(c => {
      const clean = getCleanDocName(c.source_document)
      const matched = documentList.find(d =>
        d.fileName.toLowerCase() === clean.toLowerCase() ||
        clean.toLowerCase().includes(d.fileName.toLowerCase())
      )
      if (matched) {
        map[matched.fileName] = (map[matched.fileName] || 0) + 1
      } else {
        map[clean] = (map[clean] || 0) + 1
      }
    })
    return map
  }, [documentList, cards])

  // Filtered Cards Computation
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const status = (card.status || 'provisional').toLowerCase()

      // Tab filter by status
      if (activeTab === 'Pending') {
        const isPending = status === 'provisional' || status === 'under review' || status === ''
        if (!isPending) return false
      } else if (activeTab === 'Accepted') {
        if (status !== 'accepted' && status !== 'edited') return false
      } else if (activeTab === 'Rejected') {
        if (status !== 'rejected') return false
      }
      // 'All Cards' shows everything

      // Document filter (matches pure document filename)
      if (selectedDocFilter !== 'ALL') {
        const cleanCardDoc = getCleanDocName(card.source_document).toLowerCase()
        const targetFilter = selectedDocFilter.toLowerCase()
        if (cleanCardDoc !== targetFilter && !cleanCardDoc.includes(targetFilter)) return false
      }

      // Status filter dropdown
      if (statusFilter !== 'All Status') {
        const s = normalizeDisplayStatus(card.status)
        if (s.toLowerCase() !== statusFilter.toLowerCase()) return false
      }

      // Type filter dropdown
      if (typeFilter !== 'All Types') {
        const t = normalizeDisplayType(card.card_type)
        if (t.toLowerCase() !== typeFilter.toLowerCase()) return false
      }

      // Version filter
      if (selectedVersionFilter !== 'ALL') {
        if (Number(card.version ?? 0) !== Number(selectedVersionFilter)) return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (card.title || '').toLowerCase().includes(q)
        const matchContent = (card.content || '').toLowerCase().includes(q)
        const matchSource = (card.source_document || '').toLowerCase().includes(q)
        const matchEvidence = (card.evidence || '').toLowerCase().includes(q)
        if (!matchTitle && !matchContent && !matchSource && !matchEvidence) return false
      }

      return true
    })
  }, [cards, activeTab, selectedDocFilter, selectedVersionFilter, statusFilter, typeFilter, searchQuery])

  // Summary Metrics (Strictly dynamic)
  const totalCount = cards.length
  const acceptedCount = cards.filter(c => (c.status || '').toLowerCase() === 'accepted').length
  const reviewCount = cards.filter(c => !c.status || (c.status || '').toLowerCase() === 'provisional' || (c.status || '').toLowerCase() === 'under review').length
  const editedCount = cards.filter(c => (c.status || '').toLowerCase() === 'edited').length
  const rejectedCount = cards.filter(c => (c.status || '').toLowerCase() === 'rejected').length

  const questionCardsCount = cards.filter(c => (c.card_type || '').toUpperCase() === 'QUESTION').length
  const conflictCardsCount = cards.filter(c => (c.card_type || '').toUpperCase() === 'CONFLICT' || (c.card_type || '').toUpperCase() === 'TENSION').length

  // Available Versions (0, 1, 2...)
  const availableVersions = useMemo(() => {
    const set = new Set(cards.map(c => c.version !== null && c.version !== undefined ? Number(c.version) : 0))
    return Array.from(set).sort((a, b) => a - b)
  }, [cards])

  // Types breakdown
  const typeCounts = useMemo(() => {
    const counts = { 'Fact': 0, 'Requirement': 0, 'Question': 0, 'Conflict': 0, 'Other': 0, 'Action': 0, 'Clarification': 0 }
    cards.forEach(c => {
      const t = normalizeDisplayType(c.card_type)
      if (counts[t] !== undefined) counts[t]++
      else counts['Other']++
    })
    return counts
  }, [cards])

  return (
    <ProjectShell project={project}>
      <div className="bpage-root" onClick={() => setActiveMenuCardId(null)}>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          accept=".pdf,.docx,.txt,.zip"
        />

        {/* Top Header Row */}
        <header className="bpage-header">
          <div className="bpage-header-left">
            <div className="bpage-breadcrumb" onClick={() => navigate(`/projects/${activeProjectId}`)}>
              <span>← {project?.name || 'Project Overview'}</span>
              <span className="bpage-bc-sep">&gt;</span>
              <span className="bpage-bc-active">Brief</span>
            </div>

            <div className="bpage-title-row">
              <h1 className="bpage-title">Brief (Working Draft)</h1>
              <div className="bpage-draft-pill">
                <span>Working Draft</span>
              </div>
            </div>
            <p className="bpage-subtitle">Document-wise architectural requirements, questions, and conflict analysis.</p>
          </div>

          <div className="bpage-header-right">
            <button className="bpage-btn-outline" onClick={() => setShowAddCard(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Card</span>
            </button>
          </div>
        </header>

        {/* Status Tabs: All Cards, Pending, Accepted, Rejected */}
        <div className="bpage-tabs-bar">
          <button
            className={`bpage-tab-btn ${activeTab === 'All Cards' ? 'active' : ''}`}
            onClick={() => setActiveTab('All Cards')}
          >
            All Cards <span className="bpage-tab-count">{totalCount}</span>
          </button>
          <button
            className={`bpage-tab-btn ${activeTab === 'Pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('Pending')}
          >
            Pending <span className="bpage-tab-count">{reviewCount}</span>
          </button>
          <button
            className={`bpage-tab-btn ${activeTab === 'Accepted' ? 'active' : ''}`}
            onClick={() => setActiveTab('Accepted')}
          >
            Accepted <span className="bpage-tab-count">{acceptedCount + editedCount}</span>
          </button>
          <button
            className={`bpage-tab-btn ${activeTab === 'Rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('Rejected')}
          >
            Rejected <span className="bpage-tab-count">{rejectedCount}</span>
          </button>
        </div>

        {/* Main 2-Column Content Layout */}
        <div className="bpage-main-layout" style={{ overflowX: 'hidden', width: '100%' }}>

          {/* Left Area: Toolbar, Cards Grid, Pagination */}
          <div className="bpage-cards-area" style={{ minWidth: 0 }}>

            {/* Filter Toolbar */}
            <div className="bpage-toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <div className="bpage-toolbar-left" style={{ flexWrap: 'wrap', gap: '8px' }}>

                {/* Search */}
                <div className="bpage-search-box" style={{ width: '160px' }}>
                  <input
                    type="text"
                    placeholder="Search cards..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" width="14" height="14">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>

                {/* Version Dropdown */}
                {availableVersions.length > 1 && (
                  <div className="bpage-select-wrap">
                    <select
                      value={selectedVersionFilter}
                      onChange={e => setSelectedVersionFilter(e.target.value)}
                      style={{ fontWeight: 600 }}
                    >
                      <option value="ALL">All Versions ({cards.length})</option>
                      {availableVersions.map(v => (
                        <option key={v} value={v}>
                          Version {v} ({cards.filter(c => Number(c.version ?? 0) === v).length})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Source Document Dropdown */}
                <div className="bpage-select-wrap" style={{ maxWidth: '220px' }}>
                  <select
                    value={selectedDocFilter}
                    onChange={e => setSelectedDocFilter(e.target.value)}
                    style={{ textOverflow: 'ellipsis', fontWeight: 500 }}
                  >
                    <option value="ALL">All Sources ({cards.length})</option>
                    {documentList.map(doc => {
                      const count = docCounts[doc.fileName] || 0
                      return (
                        <option key={doc.fileName} value={doc.fileName}>
                          {doc.label} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Status Dropdown */}
                <div className="bpage-select-wrap">
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="All Status">All Status</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Provisional">Provisional / Under Review</option>
                    <option value="Edited">Edited</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                {/* Types Dropdown */}
                <div className="bpage-select-wrap">
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="All Types">All Types</option>
                    {CARD_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="bpage-toolbar-right">
                <div className="bpage-view-toggle">
                  <button
                    className={`bpage-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid View"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button
                    className={`bpage-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="List View"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Cards Header Count & Source Indicator */}
            <div className="bpage-count-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{filteredCards.length} {activeTab} shown</span>
              {selectedDocFilter !== 'ALL' && (
                <span style={{ color: '#38bdf8', fontSize: '12px' }}>Filtered by {selectedDocFilter}</span>
              )}
            </div>

            {/* Cards Grid */}
            {filteredCards.length === 0 ? (
              <div className="bpage-empty-cards">
                <p>No items found for current selection.</p>
                <div className="bpage-empty-btns">
                  <button className="bpage-btn-outline" onClick={() => fileInputRef.current?.click()}>
                    + Upload Document
                  </button>
                  <button className="bpage-btn-outline" onClick={() => setShowAddCard(true)}>
                    + Add Card Manually
                  </button>
                </div>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'bpage-grid' : 'bpage-list-wrap'}>
                {filteredCards.map((card, idx) => {
                  const displayType = normalizeDisplayType(card.card_type)
                  const displayStatus = normalizeDisplayStatus(card.status)
                  const statusClass = displayStatus.toLowerCase().replace(' ', '-')
                  const isMenuOpen = activeMenuCardId === card.id
                  const cleanDoc = getCleanDocName(card.source_document)

                  const isSelectedCard = selectedCard?.id === card.id

                  return (
                    <div
                      key={card.id || idx}
                      className={`bcard-item ${isSelectedCard ? 'active' : ''}`}
                      onClick={() => setSelectedCard(card)}
                      style={{
                        cursor: 'pointer',
                        borderColor: isSelectedCard ? '#000000' : undefined,
                        boxShadow: isSelectedCard ? '0 0 0 2px #000000' : undefined,
                        transition: 'all 0.15s'
                      }}
                    >

                      {/* Card Header: Icon, Title, Type, Version, Status Pill */}
                      <div className="bcard-header">
                        <div className="bcard-header-left">
                          <div className="bcard-type-icon">
                            {getCardIcon(card.card_type || card.title)}
                          </div>
                          <div className="bcard-titles">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <h3 className="bcard-title">{card.title || card.content?.slice(0, 28)}</h3>
                              <span className="bui-badge-version">V{card.version !== null && card.version !== undefined ? card.version : 0}</span>
                              {card.created_by === 'ARCHITECT' && (
                                <span className="bui-badge-architect">Architect Input</span>
                              )}
                            </div>
                            <span className="bcard-type-sub">{displayType}</span>
                          </div>
                        </div>

                        <span className={`bcard-status-pill ${statusClass}`}>
                          {displayStatus}
                        </span>
                      </div>

                      {/* Card Content Statement (Concise 3-line Preview) */}
                      <div className="bcard-body">
                        <p
                          className="bcard-content-text"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.45,
                            margin: 0
                          }}
                        >
                          {cleanCardContent(card.content)}
                        </p>
                      </div>

                      {/* Source Document Badge */}
                      <div className="bcard-source-row" style={{ marginTop: '10px' }}>
                        <div className="bcard-source-left">
                          <span className="bcard-meta-lbl">Source</span>
                          <span className="bcard-source-doc" title={cleanDoc}>
                            {cleanDoc}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                          Inspect →
                        </span>
                      </div>


                      {/* Card Footer Actions */}
                      <div className="bcard-footer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {displayStatus === 'Accepted' ? (
                            <>
                              <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#052e16', padding: '3px 8px', borderRadius: '6px', border: '1px solid #166534' }}>
                                ✓ Accepted
                              </span>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                onClick={() => setEditingCard(card)}
                                title="Edit Card"
                              >
                                ✎ Edit
                              </button>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px', color: '#ef4444' }}
                                onClick={() => handleStatusChange(card.id, 'rejected')}
                                title="Reject Card"
                              >
                                ✕
                              </button>
                            </>
                          ) : displayStatus === 'Rejected' ? (
                            <>
                              <span style={{ fontSize: '11px', color: '#f87171', background: '#450a0a', padding: '3px 8px', borderRadius: '6px', border: '1px solid #7f1d1d' }}>
                                ✕ Rejected
                              </span>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px', color: '#4ade80' }}
                                onClick={() => handleStatusChange(card.id, 'accepted')}
                                title="Restore and Accept"
                              >
                                ↺ Restore
                              </button>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px', color: '#ef4444' }}
                                onClick={() => handleDeleteCard(card.id)}
                                title="Delete Card"
                              >
                                🗑
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px', color: '#4ade80', borderColor: '#166534' }}
                                onClick={() => handleStatusChange(card.id, 'accepted')}
                                title="Accept into Project Knowledge"
                              >
                                ✓ Accept
                              </button>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                onClick={() => setEditingCard(card)}
                                title="Edit Card"
                              >
                                ✎ Edit
                              </button>
                              <button
                                className="bui-btn bui-btn-outline"
                                style={{ fontSize: '11px', padding: '4px 8px', color: '#ef4444' }}
                                onClick={() => handleStatusChange(card.id, 'rejected')}
                                title="Reject Card"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>

                        <div className="bcard-action-menu-wrap" onClick={e => e.stopPropagation()}>
                          <button
                            className="bcard-btn-status-dropdown"
                            onClick={() => setActiveMenuCardId(isMenuOpen ? null : card.id)}
                          >
                            <span>⋮</span>
                          </button>

                          {isMenuOpen && (
                            <div className="bcard-dropdown-list">
                              {displayStatus !== 'Accepted' && (
                                <button className="bcard-dd-item" onClick={() => handleStatusChange(card.id, 'accepted')}>
                                  ✓ Accept (Authoritative)
                                </button>
                              )}
                              <button className="bcard-dd-item" onClick={() => setEditingCard(card)}>
                                ✎ Edit Details
                              </button>
                              {displayStatus !== 'Provisional' && (
                                <button className="bcard-dd-item" onClick={() => handleStatusChange(card.id, 'under review')}>
                                  ⏳ Move to Review
                                </button>
                              )}
                              {displayStatus !== 'Rejected' && (
                                <button className="bcard-dd-item item-reject" onClick={() => handleStatusChange(card.id, 'rejected')}>
                                  ✕ Reject
                                </button>
                              )}
                              <div className="bcard-dd-sep" />
                              <button className="bcard-dd-item item-delete" onClick={() => handleDeleteCard(card.id)}>
                                🗑 Delete Card
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  )
                })}

                {/* Add New Card Box */}
                {viewMode === 'grid' && (
                  <div className="bcard-add-box" onClick={() => setShowAddCard(true)}>
                    <div className="bcard-add-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </div>
                    <h4 className="bcard-add-title">Add Card Manually</h4>
                    <p className="bcard-add-desc">Add custom requirements, project parameters, or meeting notes.</p>
                    <button className="bcard-btn-add" onClick={e => { e.stopPropagation(); setShowAddCard(true) }}>
                      Add Card
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* Bottom Pagination */}
            <div className="bpage-pagination">
              <span className="bpage-pg-showing">Showing {filteredCards.length} of {totalCount} total items</span>
            </div>

          </div>

          {/* Right Sidebar (28%): Dynamic Brief Summary, Sources, or Card Inspector */}
          <aside className="bpage-sidebar-right">

            {/* Card Inspector (Shown when a card is selected) */}
            {selectedCard ? (
              <div className="bwidget-card" style={{ border: '1.5px solid #000000', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', background: '#ffffff' }}>
                <div className="bwidget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span className="bui-badge-version">V{selectedCard.version !== null && selectedCard.version !== undefined ? selectedCard.version : 0}</span>
                      <span className="bcard-type-sub" style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>
                        {normalizeDisplayType(selectedCard.card_type)}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                      {selectedCard.title || 'Brief Card'}
                    </h3>
                  </div>
                  <button
                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', color: '#64748b', cursor: 'pointer', fontSize: '12px', padding: '3px 7px' }}
                    onClick={() => setSelectedCard(null)}
                    title="Close Inspector"
                  >
                    ✕
                  </button>
                </div>

                {/* Status Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Review Status:</span>
                  <span className={`bcard-status-pill ${normalizeDisplayStatus(selectedCard.status).toLowerCase().replace(' ', '-')}`}>
                    {normalizeDisplayStatus(selectedCard.status)}
                  </span>
                </div>

                {/* Full Parameter / Requirement Content */}
                <div style={{ marginBottom: '16px' }}>
                  <span className="bcard-meta-lbl" style={{ display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                    {normalizeDisplayType(selectedCard.card_type)} Details
                  </span>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#0f172a', lineHeight: 1.5, maxHeight: '180px', overflowY: 'auto' }}>
                    {cleanCardContent(selectedCard.content)}
                  </div>
                </div>

                {/* Source Document Provenance */}
                <div style={{ marginBottom: '14px' }}>
                  <span className="bcard-meta-lbl" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                    Source Provenance
                  </span>
                  <span style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 600, display: 'block' }}>
                    📄 {getCleanDocName(selectedCard.source_document)}
                  </span>
                </div>

                {/* Direct Verbatim Evidence */}
                <div style={{ marginBottom: '16px' }}>
                  <span className="bcard-meta-lbl" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                    Verbatim Document Quote
                  </span>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '3px solid #000000', borderRadius: '4px', padding: '10px 12px', fontSize: '12px', color: '#334155', fontStyle: 'italic', lineHeight: 1.45 }}>
                    "{selectedCard.evidence && selectedCard.evidence !== 'Not provided' ? selectedCard.evidence : 'Not clear / Not provided in source document'}"
                  </div>
                </div>

                {/* AI Recommendation */}
                {selectedCard.ai_suggestion && (
                  <div style={{ marginBottom: '18px' }}>
                    <span className="bcard-meta-lbl" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                      AI Architect Recommendation
                    </span>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#166534', lineHeight: 1.4 }}>
                      ✦ {selectedCard.ai_suggestion}
                    </div>
                  </div>
                )}

                {/* Inspector Actions */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', gap: '8px' }}>
                  <button
                    style={{ flex: 1, background: '#000000', color: '#ffffff', border: '1px solid #000000', padding: '9px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => handleStatusChange(selectedCard.id, 'accepted')}
                  >
                    ✓ Accept
                  </button>
                  <button
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', padding: '9px 14px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setEditingCard(selectedCard)}
                  >
                    ✎ Edit
                  </button>
                  <button
                    style={{ background: '#ffffff', border: '1px solid #fecaca', color: '#dc2626', padding: '9px 12px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => handleStatusChange(selectedCard.id, 'rejected')}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Widget 1: Brief Summary */}
                <div className="bwidget-card">
                  <div className="bwidget-header">
                    <h3 className="bwidget-title">Brief Knowledge</h3>
                  </div>

                  <div className="bwidget-rows">
                    <div className="bwidget-row">
                      <span className="bwidget-lbl">Total Items</span>
                      <strong className="bwidget-val">{totalCount}</strong>
                    </div>
                    <div className="bwidget-row">
                      <span className="bwidget-lbl">Accepted Knowledge</span>
                      <strong className="bwidget-val val-green">{acceptedCount}</strong>
                    </div>
                    <div className="bwidget-row">
                      <span className="bwidget-lbl">Provisional / Review</span>
                      <strong className="bwidget-val val-blue">{reviewCount}</strong>
                    </div>
                    <div className="bwidget-row">
                      <span className="bwidget-lbl">Edited</span>
                      <strong className="bwidget-val val-amber">{editedCount}</strong>
                    </div>
                    <div className="bwidget-row">
                      <span className="bwidget-lbl">Rejected</span>
                      <strong className="bwidget-val val-red">{rejectedCount}</strong>
                    </div>
                  </div>
                </div>
              </>
            )}


            {/* Widget 2: Sources Breakdown */}
            <div className="bwidget-card">
              <div className="bwidget-header">
                <h3 className="bwidget-title">Project Sources</h3>
              </div>

              <div className="bwidget-sources-list">
                {documentList.length > 0 ? (
                  documentList.map(doc => {
                    const count = docCounts[doc.fileName] || 0
                    return (
                      <div
                        key={doc.fileName}
                        className="bwidget-source-item"
                        onClick={() => setSelectedDocFilter(doc.fileName)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="bwidget-src-name" title={doc.fileName}>{doc.label}</span>
                        <span className="bwidget-src-count">{count}</span>
                      </div>
                    )
                  })
                ) : (
                  <div style={{ padding: '10px 0', fontSize: '12px', color: '#64748b' }}>
                    No source documents uploaded yet.
                  </div>
                )}
                <div className="bwidget-src-footer">
                  <span className="bwidget-view-link" onClick={() => navigate(`/projects/${activeProjectId}`)}>
                    Manage sources →
                  </span>
                </div>
              </div>
            </div>



            {/* Widget 4: Quick Actions */}
            <div className="bwidget-card">
              <h3 className="bwidget-title mb-10">Quick Actions</h3>
              <div className="bwidget-actions-list">
                <button className="bwidget-action-btn" onClick={() => setShowAddCard(true)}>
                  <span>+</span>
                  <span>Add Card Manually</span>
                </button>
                <button className="bwidget-action-btn" onClick={() => navigate(`/projects/${activeProjectId}`)}>
                  <span>←</span>
                  <span>Back to Project Hub</span>
                </button>
              </div>
            </div>

          </aside>

        </div>

        {/* CREATE CARD MODAL */}
        {showAddCard && (
          <div className="bui-modal-overlay" onClick={() => setShowAddCard(false)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()}>
              <div className="bui-modal-header">
                <h2>Add Brief Card</h2>
                <button className="bui-close-btn" onClick={() => setShowAddCard(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateNewCard} className="bui-modal-form">
                <div className="bui-form-group">
                  <label>Card Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Natural Light & Courtyard Integration"
                    value={newCard.title}
                    onChange={e => setNewCard({ ...newCard, title: e.target.value })}
                  />
                </div>

                <div className="bui-form-group">
                  <label>Card Type</label>
                  <select
                    value={newCard.card_type}
                    onChange={e => setNewCard({ ...newCard, card_type: e.target.value })}
                  >
                    {CARD_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="bui-form-group">
                  <label>Content / Brief Statement *</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Maximise natural light in all primary spaces..."
                    value={newCard.content}
                    onChange={e => setNewCard({ ...newCard, content: e.target.value })}
                    required
                  />
                </div>

                <div className="bui-form-group">
                  <label>Source Document Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. Client Brief.pdf"
                    value={newCard.source_document}
                    onChange={e => setNewCard({ ...newCard, source_document: e.target.value })}
                  />
                </div>

                <div className="bui-form-group">
                  <label>Evidence / Citation Quote</label>
                  <input
                    type="text"
                    placeholder="e.g. Page 4, Section 2.1"
                    value={newCard.evidence}
                    onChange={e => setNewCard({ ...newCard, evidence: e.target.value })}
                  />
                </div>

                <div className="bui-modal-actions">
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setShowAddCard(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="bui-btn bui-btn-primary" disabled={!newCard.content.trim()}>
                    Create Card
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDIT CARD MODAL */}
        {editingCard && (
          <div className="bui-modal-overlay" onClick={() => setEditingCard(null)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()}>
              <div className="bui-modal-header">
                <h2>Edit Brief Card</h2>
                <button className="bui-close-btn" onClick={() => setEditingCard(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveEditedCard} className="bui-modal-form">
                <div className="bui-form-group">
                  <label>Card Title</label>
                  <input
                    type="text"
                    value={editingCard.title}
                    onChange={e => setEditingCard({ ...editingCard, title: e.target.value })}
                  />
                </div>

                <div className="bui-form-group">
                  <label>Card Type</label>
                  <select
                    value={normalizeDisplayType(editingCard.card_type)}
                    onChange={e => setEditingCard({ ...editingCard, card_type: e.target.value })}
                  >
                    {CARD_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="bui-form-group">
                  <label>Content / Brief Statement *</label>
                  <textarea
                    rows={4}
                    value={editingCard.content}
                    onChange={e => setEditingCard({ ...editingCard, content: e.target.value })}
                    required
                  />
                </div>

                <div className="bui-form-group">
                  <label>Evidence / Citation Quote</label>
                  <input
                    type="text"
                    value={editingCard.evidence || ''}
                    onChange={e => setEditingCard({ ...editingCard, evidence: e.target.value })}
                  />
                </div>

                <div className="bui-modal-actions">
                  <button type="button" className="bui-btn bui-btn-outline" onClick={() => setEditingCard(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="bui-btn bui-btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="bui-toast">
            <span>✓ {toast}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bui-toast-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

      </div>
    </ProjectShell>
  )
}
