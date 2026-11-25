import { useState } from 'react'

const REGISTER_STYLES = {
  DOCUMENTED: { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', label: 'Documented' },
  PATTERN: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe', label: 'Regional Pattern' },
  UNKNOWN: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Learn Locally' },
  MIXED: { bg: '#f5f3ff', color: '#5b21b6', border: '#ddd6fe', label: 'Mixed Register' },
}

const PRIORITY_STYLES = {
  high: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'High' },
  medium: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'Medium' },
  low: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Low' },
}

export default function ContextCard({
  card,
  busy = false,
  isUpdatingThisCard = false,
  isSplittingThisCard = false,
  splitSentences = [],
  splitSelectedIndices = [],
  onToggleSplitSentence,
  onCancelSplit,
  onConfirmSplit,
  onOpenDetail,
  onModify,
  onSplit,
  onAddNote,
  onSetPriority,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(false)
  const reg = REGISTER_STYLES[card.research_register] || REGISTER_STYLES.DOCUMENTED
  const prio = card.priority ? PRIORITY_STYLES[card.priority] : null
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
        {verifiedImages.length > 0 && !isSplittingThisCard && (
          <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <img
              src={verifiedImages[0].image_url}
              alt={verifiedImages[0].image_caption || card.title}
              style={{ width: '100%', height: '125px', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* Top Meta Row: Register + Priority + Version/Sources + More Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
            {prio && (
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: prio.bg,
                  color: prio.color,
                  border: `1px solid ${prio.border}`,
                }}
              >
                ⚑ {prio.label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted, #64748b)' }}>
              v{card.version} · {(card.sources || []).length} src
            </span>
            {!isSplittingThisCard && (
              <button
                type="button"
                onClick={() => onOpenDetail?.(card)}
                title="View full card, sources & notes"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #64748b)', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
              >
                •••
              </button>
            )}
          </div>
        </div>

        {/* Title + Split Mode Pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <h3
            onClick={() => !isSplittingThisCard && onOpenDetail?.(card)}
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-main, #0f172a)',
              cursor: isSplittingThisCard ? 'default' : 'pointer',
            }}
          >
            {card.title}
          </h3>
          {isSplittingThisCard && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '8px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', whiteSpace: 'nowrap' }}>
              ✂ Split Mode
            </span>
          )}
        </div>

        {/* Body Content: Either Inline Sentence Checkboxes (Split Mode) OR Normal Expandable Content */}
        {isSplittingThisCard ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {splitSentences.map((sent, idx) => {
              const checked = splitSelectedIndices.includes(idx)
              return (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '9px 11px',
                    borderRadius: '8px',
                    border: checked ? '1px solid #c4b5fd' : '1px solid var(--border-color, #e2e8f0)',
                    background: checked ? '#f5f3ff' : 'var(--bg-subtle, #f8fafc)',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    lineHeight: 1.45,
                    color: 'var(--text-main, #1e293b)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleSplitSentence?.(idx)}
                    style={{ marginTop: '3px', accentColor: '#6d28d9' }}
                  />
                  <span>{sent}</span>
                </label>
              )
            })}
          </div>
        ) : (
          <>
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
          </>
        )}

        {(card.architect_notes || []).length > 0 && !isSplittingThisCard && (
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

      {/* Footer Row */}
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

        {isSplittingThisCard ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => onCancelSplit?.()}
              className="bui-btn bui-btn-outline"
              style={{ fontSize: '11.5px', padding: '4px 10px' }}
            >
              × Cancel Split
            </button>
            <button
              type="button"
              disabled={splitSelectedIndices.length === 0}
              onClick={() => onConfirmSplit?.()}
              style={{
                background: '#6d28d9',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 11px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: splitSelectedIndices.length === 0 ? 'not-allowed' : 'pointer',
                opacity: splitSelectedIndices.length === 0 ? 0.55 : 1,
              }}
            >
              Extract Selected ({splitSelectedIndices.length}) →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSplit?.(card)}
              title="Manually split sentences into smaller cards"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11.5px',
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="M12 3v6M12 9l-5 5M12 9l5 5M5 19v-5h5M19 19v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Split</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onModify?.(card)}
              title="Edit / Modify card with AI"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11.5px',
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Edit</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAddNote?.(card)}
              title="Add Architect Note"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--text-main, #334155)',
                opacity: busy ? 0.45 : 1,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSetPriority?.(card)}
              title="Set Priority (High / Medium / Low)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid transparent',
                background: 'transparent',
                color: prio ? prio.color : 'var(--text-main, #334155)',
                opacity: busy ? 0.45 : 1,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="4" y1="22" x2="4" y2="15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete?.(card)}
              title="Delete Card"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid transparent',
                background: 'transparent',
                color: busy ? '#94a3b8' : '#ef4444',
                opacity: busy ? 0.45 : 1,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="10" y1="11" x2="10" y2="17" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="14" y1="11" x2="14" y2="17" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
