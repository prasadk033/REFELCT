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

  // Check if serverStep has real page-level progress from backend (e.g., "Page 7 of 25")
  const pageMatch = serverStep?.match(/Page\s+(\d+)\s+of\s+(\d+)/i)
  const curPage = pageMatch ? parseInt(pageMatch[1], 10) : 0
  const totPages = pageMatch ? parseInt(pageMatch[2], 10) : 0
  const hasPageProgress = curPage > 0 && totPages > 0

  // Progress percentage is strictly backend-driven
  let progressPercent = 0
  if (hasPageProgress) {
    if (safeDocCount > 1) {
      const docPortion = (safeDocsCompleted / safeDocCount) * 100
      const pagePortion = (1 / safeDocCount) * (curPage / totPages) * 100
      progressPercent = Math.min(100, Math.round(docPortion + pagePortion))
    } else {
      progressPercent = Math.min(100, Math.round((curPage / totPages) * 100))
    }
  } else {
    const docBasePercent = (safeDocsCompleted / safeDocCount) * 100
    progressPercent = Math.min(100, Math.max(safeDocsCompleted > 0 ? Math.round(docBasePercent) : 5, Math.round(docBasePercent)))
  }

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

        {/* Live Progress Pill: Page-level and Document-level */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: '20px',
          padding: '6px 14px',
          marginBottom: '20px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#334155'
        }}>
          {hasPageProgress ? (
            <>
              <span>Page: <strong style={{ color: '#2563eb' }}>[{curPage} / {totPages} Processed]</strong></span>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <span style={{ color: '#0f172a' }}>{progressPercent}%</span>
              {safeDocCount > 1 && (
                <>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span style={{ color: '#64748b' }}>Docs: {safeDocsCompleted} / {safeDocCount}</span>
                </>
              )}
            </>
          ) : (
            <>
              <span>Documents: <strong style={{ color: '#2563eb' }}>[{safeDocsCompleted} / {safeDocCount} Completed]</strong></span>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <span style={{ color: '#0f172a' }}>{progressPercent}%</span>
            </>
          )}
        </div>

        {/* Timing Information */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Elapsed Time</span>
            <strong style={{ fontSize: '15px', color: '#2563eb', display: 'block', marginTop: '2px' }}>
              {Math.round(elapsedSeconds)}s
            </strong>
          </div>
          <div style={{ textAlign: 'right', maxWidth: '65%' }}>
            <span style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
              Processing may take several minutes depending on document length and AI service response time.
            </span>
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
