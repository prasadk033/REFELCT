import React from 'react'
import { getProgressStep } from '../utils/estimate.js'

export default function GeneratingProgressModal({
  estimate,
  elapsedSeconds = 0,
  serverStep = null,
  projectName = 'Project'
}) {
  const estSeconds = estimate?.estimatedSeconds || 30
  const progressPercent = Math.min(95, Math.max(8, Math.round((elapsedSeconds / estSeconds) * 90)))
  const remainingSeconds = Math.max(1, Math.round(estSeconds - elapsedSeconds))
  const stepText = serverStep && serverStep !== 'Initiating analysis...' && serverStep !== 'Initiating multi-agent analysis...' && serverStep !== 'Initiating Brief analysis pipeline...'
    ? serverStep
    : getProgressStep(progressPercent)

  let remainingDisplay = `${remainingSeconds}s`
  if (remainingSeconds >= 60) {
    const rm = Math.floor(remainingSeconds / 60)
    const rs = remainingSeconds % 60
    remainingDisplay = rs > 0 ? `${rm}m ${rs}s` : `${rm}m`
  }

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
          boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* Animated Icon */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: '#eff6ff',
            border: '2px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            color: '#2563eb',
            fontSize: '24px'
          }}>
            ✦
          </div>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '6px', letterSpacing: '-0.02em' }}>
          Generating Project Brief Cards
        </h2>

        <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '22px', lineHeight: 1.45 }}>
          Analyzing approved sources for <strong style={{ color: '#0f172a' }}>{projectName}</strong>:
          <br />
          <span style={{ color: '#2563eb', fontWeight: 600 }}>
            {estimate?.docCount || 1} Document{estimate?.docCount > 1 ? 's' : ''} • ~{estimate?.totalPages || 1} Pages • {estimate?.totalChars?.toLocaleString() || '0'} characters
          </span>
        </p>

        {/* Time Metrics Grid */}
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
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Estimated</span>
            <strong style={{ fontSize: '15px', color: '#0f172a', display: 'block', marginTop: '2px' }}>
              ~{estimate?.formattedTime || '35s'}
            </strong>
          </div>
          <div style={{ borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Elapsed</span>
            <strong style={{ fontSize: '15px', color: '#2563eb', display: 'block', marginTop: '2px' }}>
              {Math.round(elapsedSeconds)}s
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Remaining</span>
            <strong style={{ fontSize: '15px', color: '#059669', display: 'block', marginTop: '2px' }}>
              ~{remainingDisplay}
            </strong>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
              Analysis Progress
            </span>
            <span style={{
              fontSize: '12px',
              fontWeight: 800,
              color: '#2563eb',
              background: '#eff6ff',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px solid #bfdbfe'
            }}>
              {progressPercent}%
            </span>
          </div>

          {/* Progress Bar Track */}
          <div style={{
            width: '100%',
            height: '10px',
            background: '#f1f5f9',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            position: 'relative'
          }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)',
                borderRadius: '6px',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 12px rgba(37, 99, 235, 0.4)'
              }}
            />
          </div>
        </div>

        {/* Dynamic Step Display */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 16px',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span className="bui-spinner-inline" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: '#2563eb', borderTopColor: 'transparent' }} />
          <span style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 600, lineHeight: 1.4 }}>
            {stepText}
          </span>
        </div>

        <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '16px', marginBottom: 0 }}>
          Information is verified and structured into actionable Brief Cards for your review.
        </p>
      </div>
    </div>
  )
}
