import { useAuth } from '../contexts/AuthContext.jsx'

export default function AiHealthBanner() {
  const { aiStatus, aiDismissed, dismissAiNotice } = useAuth()

  if (!aiStatus?.slow || aiDismissed) {
    return null
  }

  return (
    <div
      style={{
        background: '#fffbeb',
        borderBottom: '1px solid #fef08a',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12.5px',
        color: '#92400e',
        lineHeight: 1.4,
        zIndex: 50,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '15px', lineHeight: 1 }}>⏳</span>
        <span>
          <strong>Notice:</strong> {aiStatus.message || 'AI services are temporarily slow due to high demand. Please try again after some time.'}
        </span>
      </div>
      <button
        type="button"
        onClick={dismissAiNotice}
        style={{
          background: 'none',
          border: 'none',
          color: '#b45309',
          fontSize: '18px',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '2px 8px',
          opacity: 0.8
        }}
        title="Dismiss Notice"
      >
        &times;
      </button>
    </div>
  )
}
