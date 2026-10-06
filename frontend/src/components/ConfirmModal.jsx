import React from 'react'

export default function ConfirmModal({
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmStyle = 'danger', // 'danger' | 'primary' | 'warning'
  loading = false,
  onConfirm,
  onCancel,
}) {
  const isDanger = confirmStyle === 'danger'
  const isWarning = confirmStyle === 'warning'

  const iconBg = isDanger ? '#fef2f2' : isWarning ? '#fffbeb' : '#eff6ff'
  const iconBorder = isDanger ? '#fecaca' : isWarning ? '#fde68a' : '#bfdbfe'
  const iconColor = isDanger ? '#dc2626' : isWarning ? '#d97706' : '#2563eb'
  const icon = isDanger ? '🗑' : isWarning ? '⚠️' : 'ℹ️'

  const confirmBg = isDanger ? '#dc2626' : isWarning ? '#d97706' : '#0f172a'
  const confirmShadow = isDanger ? '0 4px 12px rgba(220, 38, 38, 0.25)' : 'none'

  return (
    <div
      className="bui-modal-overlay"
      onClick={() => !loading && onCancel?.()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="bui-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '90%',
          background: '#ffffff',
          borderRadius: '14px',
          padding: '28px 26px',
          color: '#0f172a',
          boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
          border: '1px solid #e2e8f0',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: iconBg,
            border: `1.5px solid ${iconBorder}`,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            fontSize: '22px',
          }}
        >
          {icon}
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
          {title}
        </h3>

        <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 24px 0' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            className="bui-btn bui-btn-outline"
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              borderColor: '#cbd5e1',
              borderRadius: '8px',
              cursor: 'pointer',
              background: '#ffffff',
            }}
            onClick={() => onCancel?.()}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            style={{
              background: confirmBg,
              color: '#ffffff',
              border: 'none',
              padding: '10px 22px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: confirmShadow,
            }}
            onClick={() => onConfirm?.()}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
