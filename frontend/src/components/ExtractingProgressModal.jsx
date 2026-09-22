import React from 'react'

export default function ExtractingProgressModal({
  documentName = 'Document',
  docsCompleted = 0,
  docCount = 1,
  serverStep = '',
  totalPages = 20,
  estimatedSeconds = 35,
  elapsedSeconds = 0,
  onRunInBackground = null,
  onCancel = null
}) {
  const estSeconds = Math.max(10, estimatedSeconds)
  const safeDocCount = Math.max(1, docCount)
  const safeDocsCompleted = Math.max(0, Math.min(safeDocCount, docsCompleted))

  // Calculate progress strictly bounded by completed docs and elapsed time
  const docBasePercent = (safeDocsCompleted / safeDocCount) * 100
  const nextDocIncrement = (1 / safeDocCount) * 100 * Math.min(0.9, (elapsedSeconds % 15) / 15)
  const progressPercent = Math.min(98, Math.max(safeDocsCompleted > 0 ? Math.round(docBasePercent) : 5, Math.round(docBasePercent + nextDocIncrement)))
  const remainingSeconds = Math.max(1, Math.round(estSeconds - elapsedSeconds))

  const stepText = serverStep || `Processing documents... (${safeDocsCompleted} / ${safeDocCount} Documents Completed)`

  return (
    <div className="bui-modal-overlay" style={{ background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(6px)', zIndex: 1000 }}>
      <div
        className="bui-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '520px',
          textAlign: 'center',
          padding: '36px 32px',
          background: '#ffffff',
          borderRadius: '16px',
          color: '#0f172a',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* Animated Icon */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#f8fafc',
            border: '2px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            color: '#0f172a',
            fontSize: '22px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
          }}>
            📄
          </div>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Extracting Data & Review
        </h2>

        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.45 }}>
          {serverStep ? (
            <span style={{ color: '#0f172a', fontWeight: 600 }}>{serverStep}</span>
          ) : (
            <>
              Analyzing <strong style={{ color: '#0f172a' }}>{documentName}</strong>
              {safeDocCount > 1 && ` and ${safeDocCount - 1} other source(s)`}
            </>
          )}
        </p>

        {/* Live Progress Pill: Strictly Completed Count */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: '20px',
          padding: '6px 14px',
          marginBottom: '20px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#334155'
        }}>
          <span>Documents: <strong style={{ color: '#2563eb' }}>[{safeDocsCompleted} / {safeDocCount} Completed]</strong></span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={{ color: '#0f172a' }}>{progressPercent}%</span>
        </div>

        {/* Time Metrics */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <div>
            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Estimated</span>
            <strong style={{ fontSize: '15px', color: '#0f172a', display: 'block', marginTop: '2px' }}>
              ~{estSeconds}s
            </strong>
          </div>
          <div style={{ borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Elapsed</span>
            <strong style={{ fontSize: '15px', color: '#2563eb', display: 'block', marginTop: '2px' }}>
              {Math.round(elapsedSeconds)}s
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Remaining</span>
            <strong style={{ fontSize: '15px', color: '#059669', display: 'block', marginTop: '2px' }}>
              ~{remainingSeconds}s
            </strong>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{
          width: '100%',
          height: '9px',
          background: '#e2e8f0',
          borderRadius: '6px',
          overflow: 'hidden',
          marginBottom: '16px'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: 'linear-gradient(90deg, #0f172a 0%, #2563eb 100%)',
            borderRadius: '6px',
            transition: 'width 0.6s ease'
          }} />
        </div>

        {/* Step Status with Spinner */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '12.5px',
          fontWeight: 600,
          color: '#334155',
          textAlign: 'left'
        }}>
          <span className="bui-spinner-inline" style={{ width: '14px', height: '14px', borderWidth: '2px', borderColor: '#0f172a', borderTopColor: 'transparent', flexShrink: 0 }} />
          <span>{stepText}</span>
        </div>

        {/* Actions: Run in Background & Cancel */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginTop: '20px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {onRunInBackground && (
            <button
              type="button"
              className="bui-btn bui-btn-outline"
              style={{
                padding: '8px 18px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#2563eb',
                borderColor: '#93c5fd',
                background: '#eff6ff',
                borderRadius: '8px'
              }}
              onClick={onRunInBackground}
              title="Continue extracting in background while you browse"
            >
              ⚙ Run in Background
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              className="bui-btn"
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#ef4444',
                background: '#ffffff',
                border: '1px solid #fecaca',
                borderRadius: '8px'
              }}
              onClick={onCancel}
              title="Cancel the extraction task"
            >
              ✕ Cancel Task
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
