import React from 'react'

export default function ExtractingProgressModal({
  documentName = 'Document',
  docCount = 1,
  estimatedSeconds = 25,
  elapsedSeconds = 0,
}) {
  const estSeconds = Math.max(8, estimatedSeconds)
  const progressPercent = Math.min(95, Math.max(10, Math.round((elapsedSeconds / estSeconds) * 92)))
  const remainingSeconds = Math.max(1, Math.round(estSeconds - elapsedSeconds))

  let stepText = 'Reading document structure & pages...'
  if (progressPercent >= 30 && progressPercent < 60) {
    stepText = 'Extracting spatial parameters, schedules & data...'
  } else if (progressPercent >= 60 && progressPercent < 85) {
    stepText = 'Structuring architectural observations & context...'
  } else if (progressPercent >= 85) {
    stepText = 'Finalizing extraction for review...'
  }

  return (
    <div className="bui-modal-overlay" style={{ background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(6px)', zIndex: 1000 }}>
      <div
        className="bui-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '500px',
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

        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '22px', lineHeight: 1.45 }}>
          Analyzing <strong style={{ color: '#0f172a' }}>{documentName}</strong>
          {docCount > 1 && ` and ${docCount - 1} other source(s)`}
          <br />
          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
            This might take a moment while document pages and observations are structured.
          </span>
        </p>

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
          height: '8px',
          background: '#e2e8f0',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '16px'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: 'linear-gradient(90deg, #0f172a 0%, #2563eb 100%)',
            borderRadius: '4px',
            transition: 'width 0.6s ease'
          }} />
        </div>

        {/* Step Status with Spinner */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12.5px',
          fontWeight: 600,
          color: '#334155'
        }}>
          <span className="bui-spinner-inline" style={{ width: '14px', height: '14px', borderWidth: '2px', borderColor: '#0f172a', borderTopColor: 'transparent' }} />
          <span>{stepText}</span>
        </div>
      </div>
    </div>
  )
}
