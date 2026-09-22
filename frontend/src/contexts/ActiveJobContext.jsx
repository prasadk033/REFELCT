import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { getUnacknowledgedJobs, acknowledgeJobNotification } from '../api.js'

const ActiveJobContext = createContext(null)

export function ActiveJobProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [globalNotification, setGlobalNotification] = useState(null)
  const acknowledgedSetRef = useRef(new Set())
  const pollTimerRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      return
    }

    async function checkJobs() {
      try {
        const jobs = await getUnacknowledgedJobs()
        if (Array.isArray(jobs) && jobs.length > 0) {
          for (const job of jobs) {
            if (acknowledgedSetRef.current.has(job.id)) continue

            // Mark as acknowledged locally immediately to prevent race conditions
            acknowledgedSetRef.current.add(job.id)
            
            // Persist acknowledgment to backend (enforcing authenticated ownership)
            acknowledgeJobNotification(job.id).catch(err => {
              console.warn('Failed to persist job notification acknowledgment:', err)
            })

            // Derive target version if available in step or default to clean title
            const vMatch = (job.current_step || '').match(/Version\s+(\d+)/i) || (job.current_step || '').match(/V(\d+)/i)
            const verStr = vMatch ? `Version ${vMatch[1]}` : 'Background task'

            const isExtraction = (job.current_step || '').toLowerCase().includes('extract') || !(job.cards_generated)
            const isSuccess = job.status === 'completed'
            const isPartial = job.status === 'partial'

            let title = ''
            let message = ''
            let isAiDown = false

            const rawErr = job.error || ''
            if (rawErr.includes('AI services') || rawErr.includes('unavailable') || rawErr.includes('timed out') || rawErr.includes('503') || rawErr.includes('low')) {
              isAiDown = true
            }

            if (isSuccess) {
              title = `${verStr} Completed`
              message = isExtraction
                ? `${verStr} extraction completed successfully for "${job.project_name || 'Project'}".`
                : `${verStr} generation completed successfully for "${job.project_name || 'Project'}".`
            } else if (isPartial) {
              title = `${verStr} Incomplete`
              message = isAiDown
                ? 'AI services are temporarily unavailable. Please try again later.'
                : (job.error || `Partial extraction completed for "${job.project_name || 'Project'}".`)
            } else {
              title = `${verStr} Failed`
              message = isAiDown
                ? 'AI services are temporarily unavailable. Please try again later.'
                : (job.error || `Task failed for "${job.project_name || 'Project'}".`)
            }

            setGlobalNotification({
              id: job.id,
              projectId: job.project_id,
              projectName: job.project_name,
              title,
              message,
              type: isSuccess ? 'success' : (isPartial ? 'warning' : 'error')
            })

            // Process one notification at a time
            break
          }
        }
      } catch (err) {
        // Silent error for global background poller
      }
    }

    // Initial check on mount
    checkJobs()

    // Poll every 5 seconds
    pollTimerRef.current = setInterval(checkJobs, 5000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [isAuthenticated])

  function dismissNotification() {
    setGlobalNotification(null)
  }

  function handleViewProject(projectId) {
    dismissNotification()
    if (projectId) {
      navigate(`/projects/${projectId}`)
    }
  }

  return (
    <ActiveJobContext.Provider value={{ globalNotification, dismissNotification }}>
      {children}

      {/* Global Notification Banner */}
      {globalNotification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 9999,
          maxWidth: '420px',
          background: '#ffffff',
          borderRadius: '12px',
          border: `1.5px solid ${globalNotification.type === 'success' ? '#86efac' : (globalNotification.type === 'warning' ? '#fde047' : '#fca5a5')}`,
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          animation: 'fadeInSlide 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>
                {globalNotification.type === 'success' ? '✓' : (globalNotification.type === 'warning' ? '⚠' : '✕')}
              </span>
              <strong style={{
                fontSize: '14px',
                color: globalNotification.type === 'success' ? '#15803d' : (globalNotification.type === 'warning' ? '#a16207' : '#b91c1c')
              }}>
                {globalNotification.title}
              </strong>
            </div>
            <button
              onClick={dismissNotification}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer', padding: '0 4px' }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>
            {globalNotification.message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              onClick={() => handleViewProject(globalNotification.projectId)}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              View Project →
            </button>
          </div>
        </div>
      )}
    </ActiveJobContext.Provider>
  )
}

export function useActiveJob() {
  return useContext(ActiveJobContext)
}
