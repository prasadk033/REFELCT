import { useEffect, useState } from 'react'
import { getStatus } from '../api.js'

const POLL_INTERVAL_MS = 2000

/**
 * Progress view — polls GET /status/{session_id} every 2s.
 * Calls onComplete() when status === "completed".
 * Calls onReset() if the user aborts.
 */
export default function Progress({ sessionId, onComplete, onReset }) {
  const [status, setStatus] = useState('queued')
  const [currentStep, setCurrentStep] = useState('Queued')
  const [error, setError] = useState(null)

  useEffect(() => {
    let timer

    async function poll() {
      try {
        const data = await getStatus(sessionId)
        setStatus(data.status)
        setCurrentStep(data.current_step || '')

        if (data.status === 'completed') {
          onComplete()
          return
        }

        if (data.status === 'failed') {
          setError(data.error || 'An unknown error occurred.')
          return
        }

        // Keep polling
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        setError(err.message)
      }
    }

    poll()
    return () => clearTimeout(timer)
  }, [sessionId, onComplete])

  return (
    <div>
      <div className={`status-badge ${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>

      {status !== 'failed' && (
        <p className="current-step">
          {(status === 'processing' || status === 'queued') && (
            <span className="spinner" aria-hidden="true" />
          )}
          {currentStep}
        </p>
      )}

      {error && (
        <>
          <p className="error-msg">
            ⚠ {error}
          </p>
          <button className="btn" onClick={onReset} style={{ marginTop: 16 }}>
            Try Again
          </button>
        </>
      )}
    </div>
  )
}
