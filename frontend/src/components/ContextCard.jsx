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
  onOpenDetail,
  onModify,
  onAddNote,
  onAddTag,
  onRemoveTag,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(false)
  const reg = REGISTER_STYLES[card.research_register] || REGISTER_STYLES.DOCUMENTED
  const verifiedImages = (card.images || []).filter(img => img.verified || img.is_architect_upload)

  if (isUpdatingThisCard) {
    return (
      <article
        className="pov-box"
        style={{
          padding: '24px 20px',
          borderRadius: '12px',
          border: '1.5px solid #c4b5fd',
          background: 'var(--bg-surface, #ffffff)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '230px',
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
        border: '1px solid var(--border-color, #e2e8f0)',
        background: 'var(--bg-surface, #ffffff)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div>
        {/* Optional Validated Web Image Banner */}
        {verifiedImages.length > 0 && (
          <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <img
              src={verifiedImages[0].image_url}
              alt={verifiedImages[0].image_caption || card.title}
              style={{ width: '100%', height: '125px', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* Title & Register */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span
            style={{
              fontSize: '10.5px',
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
            v{card.version} · {(card.sources || []).length} src
          </span>
        </div>

        <h3
          onClick={() => onOpenDetail?.(card)}
          style={{
            margin: '0 0 6px 0',
            fontSize: '15.5px',
            fontWeight: 700,
            color: 'var(--text-main, #0f172a)',
            cursor: 'pointer',
          }}
        >
          {card.title}
        </h3>

        {/* Concise Content Preview */}
        <div
          style={{
            fontSize: '12.5px',
            lineHeight: 1.55,
            color: 'var(--text-muted, #475569)',
            whiteSpace: 'pre-wrap',
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {card.content}
        </div>
        {card.content && card.content.length > 180 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 0 0 0',
              color: '#5b21b6',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Show less' : 'Read full card →'}
          </button>
        )}

        {/* Tags */}
        {(card.tags || []).length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
            {card.tags.map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
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

        {/* Architect Notes Count */}
        {(card.architect_notes || []).length > 0 && (
          <div
            onClick={() => onOpenDetail?.(card)}
            style={{
              marginTop: '8px',
              fontSize: '11.5px',
              color: '#1d4ed8',
              background: '#eff6ff',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            📝 {card.architect_notes.length} Architect Note{card.architect_notes.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Bottom Action Bar (Modify | Add Note | Add Tag | Delete) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '6px',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-color, #e2e8f0)',
        }}
      >
        <button
          type="button"
          className="bui-btn bui-btn-outline"
          disabled={busy}
          onClick={() => onModify?.(card)}
          style={{
            fontSize: '11px',
            padding: '5px 4px',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          ✎ Modify
        </button>
        <button
          type="button"
          className="bui-btn bui-btn-outline"
          disabled={busy}
          onClick={() => onAddNote?.(card)}
          style={{
            fontSize: '11px',
            padding: '5px 4px',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          📝 Note
        </button>
        <button
          type="button"
          className="bui-btn bui-btn-outline"
          disabled={busy}
          onClick={() => onAddTag?.(card)}
          style={{
            fontSize: '11px',
            padding: '5px 4px',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          🏷 Tag
        </button>
        <button
          type="button"
          className="bui-btn bui-btn-outline"
          disabled={busy}
          onClick={() => onDelete?.(card)}
          style={{
            fontSize: '11px',
            padding: '5px 4px',
            color: busy ? '#94a3b8' : '#dc2626',
            borderColor: busy ? '#e2e8f0' : '#fecaca',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          🗑 Delete
        </button>
      </div>
    </article>
  )
}
