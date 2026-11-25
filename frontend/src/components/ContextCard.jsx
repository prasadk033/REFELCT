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
  isUpdatingThisCard = false,
  isSplittingThisCard = false,
  onOpenDetail,
  onModify,
  onSplit,
  onAddNote,
  onAddTag,
  onRemoveTag,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(false)
  const reg = REGISTER_STYLES[card.research_register] || REGISTER_STYLES.DOCUMENTED
  const verifiedImages = (card.images || []).filter(img => img.verified || img.is_architect_upload)
  const contentText = (card.content || '').trim()
  const isLong = contentText.length > 170
  const displayContent = !isLong || expanded ? contentText : `${contentText.slice(0, 170).trimEnd()}...`

  if (isUpdatingThisCard) {
    return (
      <article
        className="pov-box"
        style={{
          padding: '24px 20px',
          borderRadius: '12px',
          border: '1.5px solid #8b5cf6',
          background: 'var(--bg-surface, #ffffff)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '210px',
          gap: '10px',
          textAlign: 'center',
        }}
      >
        <span
          className="bui-spinner-inline"
          style={{ width: '26px', height: '26px', borderWidth: '3px', borderColor: '#ddd6fe', borderTopColor: '#6d28d9' }}
        />
        <strong style={{ fontSize: '14px', color: 'var(--text-main, #0f172a)' }}>
          Re-analyzing this card...
        </strong>
        <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
          Updating with your instruction.
        </span>
      </article>
    )
  }

  return (
    <article
      className="pov-box"
      style={{
        padding: '16px 18px',
        borderRadius: '12px',
        border: isSplittingThisCard ? '1.5px solid #7c3aed' : '1px solid var(--border-color, #e2e8f0)',
        boxShadow: isSplittingThisCard ? '0 0 0 3px rgba(124, 58, 237, 0.1)' : 'none',
        background: 'var(--bg-surface, #ffffff)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div>
        {verifiedImages.length > 0 && (
          <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <img
              src={verifiedImages[0].image_url}
              alt={verifiedImages[0].image_caption || card.title}
              style={{ width: '100%', height: '125px', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* Top Meta Row: Register + Version/Sources + More Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 9px',
              borderRadius: '12px',
              background: reg.bg,
              color: reg.color,
              border: `1px solid ${reg.border}`,
            }}
          >
            {reg.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted, #64748b)' }}>
              v{card.version} · {(card.sources || []).length} src
            </span>
            <button
              type="button"
              onClick={() => onOpenDetail?.(card)}
              title="View full card, sources & notes"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #64748b)', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
            >
              •••
            </button>
          </div>
        </div>

        {/* Title */}
        <h3
          onClick={() => onOpenDetail?.(card)}
          style={{
            margin: '0 0 6px 0',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-main, #0f172a)',
            cursor: 'pointer',
          }}
        >
          {card.title}
        </h3>

        {/* Body Content + Dynamic Show More / Show Less */}
        <div
          style={{
            fontSize: '13px',
            lineHeight: 1.55,
            color: 'var(--text-muted, #475569)',
            whiteSpace: 'pre-wrap',
            height: 'auto',
            overflow: 'visible',
          }}
        >
          {displayContent}
        </div>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            aria-expanded={expanded}
            style={{
              background: 'none',
              border: 'none',
              padding: '5px 0 0 0',
              color: '#6d28d9',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Show less ⌃' : 'Show more ⌄'}
          </button>
        )}

        {/* Tags */}
        {(card.tags || []).length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {card.tags.map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: '#eef2ff',
                  color: '#4338ca',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {tag}
                {!busy && (
                  <button
                    type="button"
                    onClick={() => onRemoveTag?.(card, tag)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 0, fontSize: '11px', lineHeight: 1 }}
                    title="Remove tag"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {(card.architect_notes || []).length > 0 && (
          <div
            onClick={() => onOpenDetail?.(card)}
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: '#1d4ed8',
              background: '#eff6ff',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            💬 {card.architect_notes.length} Architect Note{card.architect_notes.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Footer Row: Aspect Label (left) + Compact Actions (right) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-color, #e2e8f0)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>
          📍 {card.aspect_title || 'Cultural Context'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSplit?.(card)}
            title="Split into smaller cards (AI)"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 9px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: isSplittingThisCard ? '#6d28d9' : 'var(--border-color, #cbd5e1)',
              background: isSplittingThisCard ? '#6d28d9' : 'var(--bg-surface, #ffffff)',
              color: isSplittingThisCard ? '#ffffff' : 'var(--text-main, #334155)',
              opacity: busy ? 0.5 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            ✦ Split
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onModify?.(card)}
            title="Modify card with AI"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 9px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-main, #334155)',
              opacity: busy ? 0.5 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            ✎ Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAddNote?.(card)}
            title="Add Architect Note"
            style={{
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '6px',
              border: '1px solid transparent',
              background: 'transparent',
              color: 'var(--text-muted, #64748b)',
              opacity: busy ? 0.45 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            💬
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAddTag?.(card)}
            title="Add Tag"
            style={{
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '6px',
              border: '1px solid transparent',
              background: 'transparent',
              color: 'var(--text-muted, #64748b)',
              opacity: busy ? 0.45 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            🏷
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete?.(card)}
            title="Delete Card"
            style={{
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '6px',
              border: '1px solid transparent',
              background: 'transparent',
              color: busy ? '#94a3b8' : '#ef4444',
              opacity: busy ? 0.45 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            🗑
          </button>
        </div>
      </div>
    </article>
  )
}
