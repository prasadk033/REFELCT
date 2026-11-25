import { useState } from 'react'

const REGISTER_STYLES = {
  DOCUMENTED: { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', label: 'Documented' },
  PATTERN: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe', label: 'Regional Pattern' },
  UNKNOWN: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Learn Locally' },
  MIXED: { bg: '#f5f3ff', color: '#5b21b6', border: '#ddd6fe', label: 'Mixed Register' },
}

export default function ContextCard({
  card,
  busy = false,
  onModify,
  onAddNote,
  onUpdateTags,
  onDelete,
}) {
  const [showSources, setShowSources] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const reg = REGISTER_STYLES[card.research_register] || REGISTER_STYLES.DOCUMENTED
  const verifiedImages = (card.images || []).filter(img => img.verified || img.is_architect_upload)

  async function handleAddNote(e) {
    e.preventDefault()
    if (!noteInput.trim()) return
    setSavingNote(true)
    try {
      await onAddNote(card.id, noteInput.trim())
      setNoteInput('')
    } finally {
      setSavingNote(false)
    }
  }

  async function handleAddTag(e) {
    e.preventDefault()
    if (!tagInput.trim()) return
    const nextTags = [...(card.tags || []), tagInput.trim()]
    await onUpdateTags(card.id, nextTags)
    setTagInput('')
  }

  async function handleRemoveTag(tagToRemove) {
    const nextTags = (card.tags || []).filter(t => t !== tagToRemove)
    await onUpdateTags(card.id, nextTags)
  }

  return (
    <article
      className="pov-box"
      style={{
        padding: '20px 22px',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #e2e8f0)',
        background: 'var(--bg-surface, #ffffff)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {card.display_order}. {card.knowledge_set_name}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: reg.bg,
                color: reg.color,
                border: `1px solid ${reg.border}`,
              }}
            >
              {reg.label}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
              v{card.version}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
            {card.title}
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="bui-btn bui-btn-outline"
            disabled={busy}
            onClick={() => onModify(card)}
            style={{ fontSize: '12px', padding: '5px 12px', cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            ✦ Modify with AI
          </button>
          <button
            type="button"
            className="bui-btn bui-btn-outline"
            disabled={busy}
            onClick={() => onDelete(card)}
            style={{ fontSize: '12px', padding: '5px 10px', color: '#ef4444', borderColor: '#fecaca', cursor: busy ? 'not-allowed' : 'pointer' }}
            title="Delete card"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--text-main, #1e293b)', whiteSpace: 'pre-wrap' }}>
        {card.content}
      </div>

      {/* Validated Images */}
      {verifiedImages.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginTop: '4px' }}>
          {verifiedImages.map(img => (
            <div
              key={img.id}
              style={{
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'var(--bg-subtle, #f8fafc)',
              }}
            >
              <img
                src={img.image_url}
                alt={img.image_caption || card.title}
                style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ padding: '8px 10px', fontSize: '11.5px', color: 'var(--text-muted, #475569)' }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{img.image_caption || img.source_title}</div>
                {img.source_page_url && (
                  <a href={img.source_page_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '11px' }}>
                    Source Reference ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Traceable Sources */}
      {(card.sources || []).length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '10px' }}>
          <button
            type="button"
            onClick={() => setShowSources(!showSources)}
            style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            {showSources ? '▾ Hide' : '▸ Show'} Sources & Evidence ({card.sources.length})
          </button>
          {showSources && (
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '12.5px', color: 'var(--text-muted, #475569)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {card.sources.map(src => (
                <li key={src.id}>
                  <strong>{src.title}</strong>
                  {src.author_or_org ? ` — ${src.author_or_org}` : ''}
                  {src.published_date ? ` (${src.published_date})` : ''}
                  {src.url && (
                    <>
                      {' '}
                      <a href={src.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                        [Link ↗]
                      </a>
                    </>
                  )}
                  {src.supported_claim && <div style={{ fontSize: '11.5px', opacity: 0.9 }}>{src.supported_claim}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tags & Architect Notes (Direct Persistence, No AI Call) */}
      <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {(card.tags || []).map(tag => (
            <span
              key={tag}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--bg-subtle, #f1f5f9)',
                color: 'var(--text-main, #334155)',
                border: '1px solid var(--border-color, #cbd5e1)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              #{tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, fontSize: '11px' }}
              >
                ×
              </button>
            </span>
          ))}
          <form onSubmit={handleAddTag} style={{ display: 'inline-flex', gap: '4px' }}>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="+ Add tag"
              style={{ fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100px' }}
            />
          </form>
        </div>

        {(card.architect_notes || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {card.architect_notes.map(n => (
              <div key={n.id} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', borderLeft: '3px solid #2563eb' }}>
                <strong>Architect Note:</strong> {n.text}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder="Add architect field note (saved directly without AI)..."
            style={{ flex: 1, fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
          />
          <button type="submit" className="bui-btn bui-btn-outline" disabled={savingNote || !noteInput.trim()} style={{ fontSize: '12px', padding: '5px 12px' }}>
            {savingNote ? 'Saving...' : 'Add Note'}
          </button>
        </form>
      </div>
    </article>
  )
}
