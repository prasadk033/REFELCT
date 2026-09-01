import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  listProjects, getProject,
  listCards, createCard, updateCard, deleteCard,
  acceptCard, rejectCard, listSources, uploadSource
} from '../api.js'
import ProjectShell from '../components/ProjectShell.jsx'

const CARD_TYPES = [
  'Goal',
  'Requirement',
  'Design Preference',
  'Constraint',
  'Fact',
  'Information',
  'Question',
  'Conflict',
  'Action'
]

function getCardIcon(type = '') {
  const t = type.toLowerCase()
  if (t.includes('goal') || t.includes('community')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }
  if (t.includes('space') || t.includes('flex')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    )
  }
  if (t.includes('light') || t.includes('preference')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
      </svg>
    )
  }
  if (t.includes('sustain') || t.includes('green')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </svg>
    )
  }
  if (t.includes('secur') || t.includes('privacy')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  }
  if (t.includes('budget') || t.includes('cost')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
  const t = type.toUpperCase()
  if (t === 'GOAL') return 'Goal'
  if (t === 'REQUIREMENT') return 'Requirement'
  if (t === 'DESIGN PREFERENCE' || t === 'PREFERENCE') return 'Design Preference'
  if (t === 'CONSTRAINT') return 'Constraint'
  if (t === 'FACT' || t === 'INFORMATION') return 'Fact'
  if (t === 'QUESTION') return 'Question'
  if (t === 'CONFLICT' || t === 'TENSION') return 'Conflict'
  if (t === 'ACTION') return 'Action'
  return type || 'Requirement'
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
  const [activeTab, setActiveTab] = useState('Cards') // 'Cards', 'Questions', 'Conflicts'
  const [selectedDocFilter, setSelectedDocFilter] = useState('ALL') // 'ALL' or specific file_name
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [typeFilter, setTypeFilter] = useState('All Types')
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'list'

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
    const list = sources.map((s, idx) => ({
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
      const type = (card.card_type || '').toUpperCase()

      // Tab filter
      if (activeTab === 'Questions' && type !== 'QUESTION') return false
      if (activeTab === 'Conflicts' && type !== 'CONFLICT' && type !== 'TENSION') return false
      if (activeTab === 'Cards' && (type === 'QUESTION' || type === 'CONFLICT' || type === 'TENSION')) return false

      // Document filter (matches pure document filename)
      if (selectedDocFilter !== 'ALL') {
        const cleanCardDoc = getCleanDocName(card.source_document).toLowerCase()
        const targetFilter = selectedDocFilter.toLowerCase()
        if (cleanCardDoc !== targetFilter && !cleanCardDoc.includes(targetFilter)) return false
      }

      // Status filter
      if (statusFilter !== 'All Status') {
        const s = normalizeDisplayStatus(card.status)
        if (s.toLowerCase() !== statusFilter.toLowerCase()) return false
      }

      // Type filter (only in Cards tab)
      if (activeTab === 'Cards' && typeFilter !== 'All Types') {
        const t = normalizeDisplayType(card.card_type)
        if (t.toLowerCase() !== typeFilter.toLowerCase()) return false
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
  }, [cards, activeTab, selectedDocFilter, statusFilter, typeFilter, searchQuery])

  // Summary Metrics (Strictly dynamic)
  const totalCount = cards.length
  const acceptedCount = cards.filter(c => (c.status || '').toLowerCase() === 'accepted').length
  const reviewCount = cards.filter(c => !c.status || (c.status || '').toLowerCase() === 'provisional' || (c.status || '').toLowerCase() === 'under review').length
  const editedCount = cards.filter(c => (c.status || '').toLowerCase() === 'edited').length
  const rejectedCount = cards.filter(c => (c.status || '').toLowerCase() === 'rejected').length

  const questionCardsCount = cards.filter(c => (c.card_type || '').toUpperCase() === 'QUESTION').length
  const conflictCardsCount = cards.filter(c => (c.card_type || '').toUpperCase() === 'CONFLICT' || (c.card_type || '').toUpperCase() === 'TENSION').length

  // Types breakdown
  const typeCounts = useMemo(() => {
    const counts = { 'Goal': 0, 'Requirement': 0, 'Design Preference': 0, 'Constraint': 0, 'Fact': 0, 'Action': 0 }
    cards.forEach(c => {
      const t = normalizeDisplayType(c.card_type)
      if (counts[t] !== undefined) counts[t]++
      else counts['Requirement']++
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
            <button className="bpage-btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>{uploading ? 'Uploading...' : 'Add Document'}</span>
            </button>

            <button className="bpage-btn-outline" onClick={() => setShowAddCard(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Card</span>
            </button>
          </div>
        </header>

        {/* Category Tabs: Cards, Questions, Conflicts */}
        <div className="bpage-tabs-bar">
          <button
            className={`bpage-tab-btn ${activeTab === 'Cards' ? 'active' : ''}`}
            onClick={() => setActiveTab('Cards')}
          >
            Cards <span className="bpage-tab-count">{totalCount - questionCardsCount - conflictCardsCount}</span>
          </button>
          <button
            className={`bpage-tab-btn ${activeTab === 'Questions' ? 'active' : ''}`}
            onClick={() => setActiveTab('Questions')}
          >
            Questions <span className="bpage-tab-count">{questionCardsCount}</span>
          </button>
          <button
            className={`bpage-tab-btn ${activeTab === 'Conflicts' ? 'active' : ''}`}
            onClick={() => setActiveTab('Conflicts')}
          >
            Conflicts <span className="bpage-tab-count">{conflictCardsCount}</span>
          </button>
        </div>

        {/* Document-Wise Filter Bar (Clean pure documents without sub-page splitting) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', padding: '12px 0', borderBottom: '1px solid #1e293b', marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginRight: '4px', whiteSpace: 'nowrap' }}>
            SOURCE DOCUMENT:
          </span>

          <button
            className={`bui-btn ${selectedDocFilter === 'ALL' ? 'bui-btn-primary' : 'bui-btn-outline'}`}
            onClick={() => setSelectedDocFilter('ALL')}
            style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '16px' }}
          >
            All Documents ({cards.length})
          </button>

          {documentList.map(doc => {
            const count = docCounts[doc.fileName] || 0
            const isSelected = selectedDocFilter === doc.fileName
            return (
              <button
                key={doc.fileName}
                className={`bui-btn ${isSelected ? 'bui-btn-primary' : 'bui-btn-outline'}`}
                onClick={() => setSelectedDocFilter(doc.fileName)}
                style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                title={doc.fileName}
              >
                <span>📄 {doc.label}</span>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>({count})</span>
              </button>
            )
          })}
        </div>

        {/* Main 2-Column Content Layout */}
        <div className="bpage-main-layout">
          
          {/* Left Area (72%): Toolbar, Cards Grid, Pagination */}
          <div className="bpage-cards-area">
            
            {/* Filter Toolbar */}
            <div className="bpage-toolbar">
              <div className="bpage-toolbar-left">
                
                {/* Search */}
                <div className="bpage-search-box">
                  <input
                    type="text"
                    placeholder="Search cards, evidence, text..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" width="14" height="14">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
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

                {/* Types Dropdown (only in Cards tab) */}
                {activeTab === 'Cards' && (
                  <div className="bpage-select-wrap">
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                      <option value="All Types">All Types</option>
                      <option value="Goal">Goal</option>
                      <option value="Requirement">Requirement</option>
                      <option value="Design Preference">Design Preference</option>
                      <option value="Constraint">Constraint</option>
                      <option value="Fact">Fact</option>
                      <option value="Action">Action</option>
                    </select>
                  </div>
                )}

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

                  return (
                    <div key={card.id || idx} className="bcard-item">
                      
                      {/* Card Header: Icon, Title, Type, Status Pill */}
                      <div className="bcard-header">
                        <div className="bcard-header-left">
                          <div className="bcard-type-icon">
                            {getCardIcon(card.card_type || card.title)}
                          </div>
                          <div className="bcard-titles">
                            <h3 className="bcard-title">{card.title || card.content?.slice(0, 28)}</h3>
                            <span className="bcard-type-sub">{displayType}</span>
                          </div>
                        </div>

                        <span className={`bcard-status-pill ${statusClass}`}>
                          {displayStatus}
                        </span>
                      </div>

                      {/* Card Content Statement */}
                      <div className="bcard-body">
                        <p className="bcard-content-text">{card.content}</p>
                      </div>

                      {/* Source Document Badge */}
                      <div className="bcard-source-row">
                        <div className="bcard-source-left">
                          <span className="bcard-meta-lbl">Source</span>
                          <span className="bcard-source-doc" title={cleanDoc}>
                            {cleanDoc}
                          </span>
                        </div>
                      </div>

                      {/* Evidence Quote */}
                      <div className="bcard-evidence-block">
                        <span className="bcard-meta-lbl">Evidence / Reference</span>
                        <p className="bcard-evidence-quote">
                          "{card.evidence && card.evidence !== 'Not provided' ? card.evidence : 'Not clear / Not provided'}"
                        </p>
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

          {/* Right Sidebar (28%): Dynamic Brief Summary, Sources, Card Types, Quick Actions */}
          <aside className="bpage-sidebar-right">
            
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

            {/* Widget 3: Card Types */}
            <div className="bwidget-card">
              <div className="bwidget-header">
                <h3 className="bwidget-title">Taxonomy Breakdown</h3>
              </div>

              <div className="bwidget-rows">
                <div className="bwidget-row">
                  <span className="bwidget-lbl">Goal</span>
                  <strong className="bwidget-val">{typeCounts['Goal'] || 0}</strong>
                </div>
                <div className="bwidget-row">
                  <span className="bwidget-lbl">Requirement</span>
                  <strong className="bwidget-val">{typeCounts['Requirement'] || 0}</strong>
                </div>
                <div className="bwidget-row">
                  <span className="bwidget-lbl">Design Preference</span>
                  <strong className="bwidget-val">{typeCounts['Design Preference'] || 0}</strong>
                </div>
                <div className="bwidget-row">
                  <span className="bwidget-lbl">Constraint</span>
                  <strong className="bwidget-val">{typeCounts['Constraint'] || 0}</strong>
                </div>
                <div className="bwidget-row">
                  <span className="bwidget-lbl">Fact</span>
                  <strong className="bwidget-val">{typeCounts['Fact'] || 0}</strong>
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
