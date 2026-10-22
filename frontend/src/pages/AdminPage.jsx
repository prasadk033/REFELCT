import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getAdminOverview,
  getAdminUsers,
  updateAdminUserRole,
  getAdminProjects,
  getAdminJobs,
  getAdminHealth,
  getAdminAuditLogs
} from '../api.js'

export default function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'users' | 'projects' | 'jobs' | 'health' | 'audit'
  
  // Data state
  const [overviewData, setOverviewData] = useState(null)
  const [usersList, setUsersList] = useState([])
  const [projectsList, setProjectsList] = useState([])
  const [jobsList, setJobsList] = useState([])
  const [healthData, setHealthData] = useState(null)
  const [auditLogsData, setAuditLogsData] = useState({ logs: [], total: 0 })
  
  // UI & loading state
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [successNotice, setSuccessNotice] = useState(null)
  const [autoRefreshQueue, setAutoRefreshQueue] = useState(true)
  const [jobFilter, setJobFilter] = useState('all')
  const [auditFilter, setAuditFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState(null)
  const [selectedErrorModal, setSelectedErrorModal] = useState(null)

  // Fetch active section data
  const loadSectionData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      if (activeTab === 'overview') {
        const [overview, jobs] = await Promise.all([
          getAdminOverview(),
          getAdminJobs('', 5)
        ])
        setOverviewData(overview)
        setJobsList(jobs || [])
      } else if (activeTab === 'users') {
        const data = await getAdminUsers()
        setUsersList(data || [])
      } else if (activeTab === 'projects') {
        const data = await getAdminProjects()
        setProjectsList(data || [])
      } else if (activeTab === 'jobs') {
        const filterParam = jobFilter === 'all' ? '' : jobFilter
        const data = await getAdminJobs(filterParam, 50)
        setJobsList(data || [])
      } else if (activeTab === 'health') {
        const data = await getAdminHealth()
        setHealthData(data)
      } else if (activeTab === 'audit') {
        const data = await getAdminAuditLogs(auditFilter, 50, 0)
        setAuditLogsData(data || { logs: [], total: 0 })
      }
    } catch (err) {
      console.error(`Admin error loading ${activeTab}:`, err)
      setError(err.message || 'Failed to fetch data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeTab, jobFilter, auditFilter])

  // Initial tab load & tab switch
  useEffect(() => {
    setSearchQuery('')
    loadSectionData()
  }, [loadSectionData])

  // Live polling for jobs tab when auto-refresh is active
  useEffect(() => {
    if ((activeTab === 'jobs' || activeTab === 'overview') && autoRefreshQueue) {
      const interval = setInterval(() => {
        loadSectionData(true)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [activeTab, autoRefreshQueue, loadSectionData])

  // Handle Role Promotion/Demotion
  async function handleToggleAdminRole(targetUser) {
    if (!targetUser) return
    const nextRole = !targetUser.is_admin
    const confirmMsg = nextRole
      ? `Promote ${targetUser.email} to Admin?\nThey will have full access to view admin metrics and manage settings.`
      : `Revoke Admin privileges from ${targetUser.email}?`

    if (!window.confirm(confirmMsg)) return

    setRoleUpdatingUserId(targetUser.id)
    setError(null)
    try {
      const res = await updateAdminUserRole(targetUser.id, nextRole)
      setSuccessNotice(res.message || 'User role successfully updated.')
      setTimeout(() => setSuccessNotice(null), 4000)
      // Refresh users list
      const updated = await getAdminUsers()
      setUsersList(updated || [])
    } catch (err) {
      setError(err.message || 'Failed to update user role.')
    } finally {
      setRoleUpdatingUserId(null)
    }
  }

  // Format date helper
  const formatDate = (isoString) => {
    if (!isoString) return '—'
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return isoString
    }
  }

  // Format duration helper
  const formatDuration = (seconds) => {
    if (seconds == null) return '—'
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className="admin-console-root" style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg-main, #f8fafc)',
      color: 'var(--text-main, #0f172a)',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      overflow: 'hidden'
    }}>
      {/* ── Left Sidebar (Admin Navigation) ── */}
      <aside style={{
        width: '260px',
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        boxSizing: 'border-box'
      }}>
        {/* Brand & Exit to App */}
        <div style={{
          padding: '20px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div 
            onClick={() => navigate('/overview')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '16px'
            }}>
              R
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', letterSpacing: '-0.01em' }}>
                Reflect
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Admin Workspace</div>
            </div>
          </div>

          <button
            onClick={() => navigate('/overview')}
            title="Return to Main Workspace"
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 8px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            App
          </button>
        </div>

        {/* Primary Overview Button */}
        <div style={{ padding: '16px 14px 6px' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 600,
              background: activeTab === 'overview' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'overview' ? '#ffffff' : '#334155',
              transition: 'all 0.15s ease'
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
            Admin Overview
          </button>
        </div>

        {/* Management Section Nav */}
        <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#94a3b8',
            marginBottom: '8px',
            paddingLeft: '6px'
          }}>
            Management
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {[
              {
                id: 'users',
                label: 'Users',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                )
              },
              {
                id: 'projects',
                label: 'Projects',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                )
              },
              {
                id: 'jobs',
                label: 'AI Processing',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )
              },
              {
                id: 'health',
                label: 'System Health',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                )
              },
              {
                id: 'audit',
                label: 'Audit Logs',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                )
              }
            ].map(item => {
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '11px',
                    width: '100%',
                    padding: '8.5px 12px',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    background: isActive ? '#f1f5f9' : 'transparent',
                    color: isActive ? '#0f172a' : '#475569',
                    textAlign: 'left',
                    transition: 'all 0.12s ease'
                  }}
                >
                  <span style={{ color: isActive ? '#4f46e5' : '#64748b', display: 'flex' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div style={{
          padding: '14px 18px',
          borderTop: '1px solid #f1f5f9',
          fontSize: '11.5px',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>REFLECT — Admin Console</span>
          <span style={{
            display: 'inline-block',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: '#10b981'
          }} title="Admin session active" />
        </div>
      </aside>

      {/* ── Main Administration Area ── */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden'
      }}>
        {/* Top Header */}
        <header style={{
          height: '56px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          flexShrink: 0
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
            <span>Administration</span>
            <span>/</span>
            <span style={{ fontWeight: 600, color: '#0f172a', textTransform: 'capitalize' }}>
              {activeTab === 'jobs' ? 'AI Processing' : activeTab === 'audit' ? 'Audit Logs' : activeTab}
            </span>
          </div>

          {/* Action pills & user avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => loadSectionData(true)}
              disabled={refreshing}
              title="Refresh data"
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '6px 11px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                width="13" 
                height="13"
                style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}
              >
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              paddingLeft: '10px',
              borderLeft: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: '#4f46e5',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '12px'
              }}>
                {user?.picture ? (
                  <img src={user.picture} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                ) : (
                  <span>{user?.name?.[0]?.toUpperCase() || 'A'}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
                  {user?.name || 'Administrator'}
                </span>
                <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                  {user?.email || 'admin'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Main Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 32px 40px',
          boxSizing: 'border-box'
        }}>
          {/* Header Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '24px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ margin: 0, fontSize: '23px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  Admin Dashboard
                </h1>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  background: '#e0e7ff',
                  color: '#4338ca',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4338ca' }} />
                  Admin access
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                Monitor and manage your REFLECT workspace.
              </p>
            </div>
          </div>

          {/* Error & Success Alerts */}
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{error}</span>
              <button 
                onClick={() => setError(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 600 }}
              >
                ✕
              </button>
            </div>
          )}

          {successNotice && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              {successNotice}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 1: OVERVIEW                                                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div>
              {/* Top 4 Metrics Cards (matching concept preview) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                {/* Total Users */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                    <span>Total Users</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '10px 0 6px' }}>
                    {loading ? '—' : overviewData?.total_users ?? 0}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                    <span>{overviewData?.active_users_24h ?? 0} active in last 24h</span>
                  </div>
                </div>

                {/* Total Projects */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                    <span>Total Projects</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '10px 0 6px' }}>
                    {loading ? '—' : overviewData?.total_projects ?? 0}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    Connected workspace metrics
                  </div>
                </div>

                {/* Brief & Program Cards */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                    <span>Brief Cards</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    </svg>
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '10px 0 6px' }}>
                    {loading ? '—' : overviewData?.total_brief_cards ?? 0}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {overviewData?.total_program_items ?? 0} program items generated
                  </div>
                </div>

                {/* AI Service & Jobs */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                    <span>AI Service</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 6px' }}>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: overviewData?.service_health?.status === 'healthy' ? '#10b981' : '#f59e0b'
                    }} />
                    <span style={{ fontSize: '19px', fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                      {overviewData?.service_health?.status || 'Active'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {overviewData?.jobs_summary?.running ?? 0} running, {overviewData?.jobs_summary?.failed ?? 0} failed
                  </div>
                </div>
              </div>

              {/* System Activity Section (matching concept preview) */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                      System activity
                    </h2>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Recent jobs, failures and administrative events
                    </p>
                  </div>

                  <button
                    onClick={() => setActiveTab('jobs')}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#4f46e5',
                      cursor: 'pointer'
                    }}
                  >
                    View All Jobs →
                  </button>
                </div>

                {/* Recent Jobs Preview Table */}
                <div style={{ border: '1px solid #f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Project</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Current Step</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Created</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobsList.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                            No processing jobs recorded yet.
                          </td>
                        </tr>
                      ) : (
                        jobsList.slice(0, 5).map(job => (
                          <tr key={job.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>
                              {job.project_name}
                            </td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '10px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                textTransform: 'capitalize',
                                background: job.status === 'completed' ? '#ecfdf5' : job.status === 'failed' ? '#fef2f2' : '#eff6ff',
                                color: job.status === 'completed' ? '#065f46' : job.status === 'failed' ? '#991b1b' : '#1d4ed8'
                              }}>
                                <span style={{
                                  width: '5px',
                                  height: '5px',
                                  borderRadius: '50%',
                                  background: job.status === 'completed' ? '#10b981' : job.status === 'failed' ? '#ef4444' : '#3b82f6'
                                }} />
                                {job.status}
                              </span>
                            </td>
                            <td style={{ padding: '11px 14px', color: '#475569' }}>
                              {job.current_step || '—'}
                            </td>
                            <td style={{ padding: '11px 14px', color: '#64748b' }}>
                              {formatDate(job.created_at)}
                            </td>
                            <td style={{ padding: '11px 14px', color: '#64748b' }}>
                              {formatDuration(job.duration_seconds)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Access & Audit Quick Link */}
                <div 
                  onClick={() => setActiveTab('audit')}
                  style={{
                    marginTop: '16px',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      background: '#e0e7ff',
                      color: '#4338ca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                        Access and audit monitoring
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                        Review privileged actions and security events.
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '16px', color: '#94a3b8' }}>›</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 2: USERS & ACTIVE SESSIONS                                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    Users & Active Sessions
                  </h2>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Account status, assigned roles, project counts, and administrator privileges.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#0f172a',
                      outline: 'none',
                      width: '180px'
                    }}
                  />
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                    Total: <strong style={{ color: '#0f172a' }}>{usersList.length}</strong> registered users
                  </div>
                </div>
              </div>

              {/* Users Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>User</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Role</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Projects</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Last Activity</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600, textAlign: 'right' }}>Admin Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.filter(u => !searchQuery || u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || u.name?.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                          No users found matching search criteria.
                        </td>
                      </tr>
                    ) : (
                      usersList.filter(u => !searchQuery || u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || u.name?.toLowerCase().includes(searchQuery.toLowerCase())).map(u => {
                        const isUpdating = roleUpdatingUserId === u.id
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {/* User details */}
                            <td style={{ padding: '13px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: '#e2e8f0',
                                  color: '#334155',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  overflow: 'hidden'
                                }}>
                                  {u.picture ? (
                                    <img src={u.picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <span>{u.name?.[0]?.toUpperCase() || 'U'}</span>
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.name || 'User'}</div>
                                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>{u.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Role Badge */}
                            <td style={{ padding: '13px 16px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                background: u.is_root_admin ? '#ede9fe' : (u.is_admin ? '#e0e7ff' : '#f1f5f9'),
                                color: u.is_root_admin ? '#6d28d9' : (u.is_admin ? '#4338ca' : '#475569')
                              }}>
                                {u.role}
                              </span>
                            </td>

                            {/* Projects Owned */}
                            <td style={{ padding: '13px 16px', color: '#334155', fontWeight: 500 }}>
                              {u.projects_count} {u.projects_count === 1 ? 'project' : 'projects'}
                            </td>

                            {/* Status */}
                            <td style={{ padding: '13px 16px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '12px',
                                color: u.is_online ? '#059669' : '#64748b'
                              }}>
                                <span style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: u.is_online ? '#10b981' : '#cbd5e1'
                                }} />
                                {u.is_online ? 'Active now' : 'Offline'}
                              </span>
                            </td>

                            {/* Last Activity */}
                            <td style={{ padding: '13px 16px', color: '#64748b', fontSize: '12px' }}>
                              {formatDate(u.last_activity)}
                            </td>

                            {/* Admin Action Toggle */}
                            <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                              {u.is_root_admin ? (
                                <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                  Root Admin
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleToggleAdminRole(u)}
                                  disabled={isUpdating}
                                  style={{
                                    background: u.is_admin ? '#fef2f2' : '#f0fdf4',
                                    border: `1px solid ${u.is_admin ? '#fecaca' : '#bbf7d0'}`,
                                    color: u.is_admin ? '#dc2626' : '#16a34a',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.1s ease'
                                  }}
                                >
                                  {isUpdating ? 'Updating...' : u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 3: PROJECTS                                                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'projects' && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    Projects Administration
                  </h2>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Track project creation dates, owners, sources, brief cards and published versions.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#0f172a',
                      outline: 'none',
                      width: '180px'
                    }}
                  />
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                    Total: <strong style={{ color: '#0f172a' }}>{projectsList.length}</strong> projects
                  </div>
                </div>
              </div>

              {/* Projects Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Project</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Owner</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Workflow State</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Artifacts</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Versions</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Created</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectsList.filter(p => !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.client?.toLowerCase().includes(searchQuery.toLowerCase()) || p.owner_email?.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                          No projects matching search criteria.
                        </td>
                      </tr>
                    ) : (
                      projectsList.filter(p => !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.client?.toLowerCase().includes(searchQuery.toLowerCase()) || p.owner_email?.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                              {p.project_type} {p.client ? `• ${p.client}` : ''}
                            </div>
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ fontWeight: 500, color: '#334155' }}>{p.owner_name}</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b' }}>{p.owner_email}</div>
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: '#f1f5f9',
                              color: '#334155'
                            }}>
                              {p.progression}
                            </span>
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: '12px', color: '#475569' }}>
                            <div>{p.source_count} sources</div>
                            <div style={{ color: '#64748b' }}>{p.cards_count} brief cards</div>
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: '12px', color: '#64748b' }}>
                            <div>Brief V{p.brief_versions_count}</div>
                            <div>Program V{p.program_versions_count}</div>
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: '12px', color: '#64748b' }}>
                            {formatDate(p.created_at)}
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => navigate(`/projects/${p.id}`)}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '5px 9px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                color: '#4f46e5',
                                cursor: 'pointer'
                              }}
                            >
                              Open →
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 4: AI PROCESSING JOBS                                       */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'jobs' && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    AI Processing Jobs & Live Queue
                  </h2>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Monitoring of Brief and Program generation, active workers, durations and failures.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Auto-refresh toggle */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: '#475569',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}>
                    <input
                      type="checkbox"
                      checked={autoRefreshQueue}
                      onChange={(e) => setAutoRefreshQueue(e.target.checked)}
                      style={{ accentColor: '#4f46e5' }}
                    />
                    Live Poll (5s)
                  </label>

                  {/* Status filter tabs */}
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '6px', padding: '3px' }}>
                    {['all', 'running', 'queued', 'completed', 'failed'].map(st => (
                      <button
                        key={st}
                        onClick={() => setJobFilter(st)}
                        style={{
                          background: jobFilter === st ? '#ffffff' : 'transparent',
                          color: jobFilter === st ? '#0f172a' : '#64748b',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textTransform: 'capitalize'
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Jobs Queue Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Project / User</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Current Step</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Documents</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Duration</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Started</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>Diagnostics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsList.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                          No jobs matching current filter.
                        </td>
                      </tr>
                    ) : (
                      jobsList.map(job => (
                        <tr key={job.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{job.project_name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{job.user_email}</div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '10px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              background: job.status === 'completed' ? '#ecfdf5' : job.status === 'failed' ? '#fef2f2' : '#eff6ff',
                              color: job.status === 'completed' ? '#065f46' : job.status === 'failed' ? '#991b1b' : '#1d4ed8'
                            }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: job.status === 'completed' ? '#10b981' : job.status === 'failed' ? '#ef4444' : '#3b82f6',
                                animation: job.is_active ? 'pulse 1.5s infinite' : 'none'
                              }} />
                              {job.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#334155' }}>
                            {job.current_step || '—'}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.document_names}>
                            {job.document_names || '—'}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#475569', fontWeight: 500 }}>
                            {formatDuration(job.duration_seconds)}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '11.5px' }}>
                            {formatDate(job.created_at)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {job.error ? (
                              <button
                                onClick={() => setSelectedErrorModal(job)}
                                style={{
                                  background: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  color: '#b91c1c',
                                  borderRadius: '5px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                View Error
                              </button>
                            ) : (
                              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                {job.cards_generated ? `${job.cards_generated} cards` : 'OK'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 5: SYSTEM HEALTH                                            */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'health' && (
            <div>
              {/* Overall Banner */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: healthData?.status === 'healthy' ? '#ecfdf5' : '#fffbeb',
                    color: healthData?.status === 'healthy' ? '#059669' : '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                      Overall Infrastructure Status: {healthData?.status === 'healthy' ? 'Operational' : 'Attention Needed'}
                    </h2>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                      Last checked: {formatDate(healthData?.timestamp)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => loadSectionData(true)}
                  disabled={refreshing}
                  style={{
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '8px 16px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {refreshing ? 'Testing...' : 'Run Diagnostics'}
                </button>
              </div>

              {/* Service Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px'
              }}>
                {healthData?.services && Object.entries(healthData.services).map(([key, svc]) => (
                  <div key={key} style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        {key.replace('_', ' ')}
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        background: svc.healthy ? '#ecfdf5' : '#fef2f2',
                        color: svc.healthy ? '#065f46' : '#991b1b'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: svc.healthy ? '#10b981' : '#ef4444' }} />
                        {svc.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '8px' }}>
                      {svc.message}
                    </div>

                    {svc.latency_ms != null && (
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                        Latency: <strong>{svc.latency_ms} ms</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 6: AUDIT LOGS                                               */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'audit' && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    Audit Logs
                  </h2>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    A chronological record of project creation, role changes, sign-ins and system events.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <select
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#334155',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">All Event Types</option>
                    <option value="admin_role_change">Admin Role Changes</option>
                    <option value="project_created">Project Created</option>
                    <option value="brief_published">Brief Published</option>
                    <option value="program_published">Program Published</option>
                  </select>
                </div>
              </div>

              {/* Audit Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Timestamp</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Event Type</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Title</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>User</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Project</th>
                      <th style={{ padding: '11px 14px', fontWeight: 600 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogsData.logs.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                          No audit logs matching selection.
                        </td>
                      </tr>
                    ) : (
                      auditLogsData.logs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '11px 14px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {formatDate(log.created_at)}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: log.event_type.includes('admin') ? '#fee2e2' : '#f1f5f9',
                              color: log.event_type.includes('admin') ? '#b91c1c' : '#475569'
                            }}>
                              {log.event_type}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>
                            {log.title}
                          </td>
                          <td style={{ padding: '11px 14px', color: '#334155' }}>
                            {log.user_email || log.user_name || 'System'}
                          </td>
                          <td style={{ padding: '11px 14px', color: '#64748b' }}>
                            {log.project_name || '—'}
                          </td>
                          <td style={{ padding: '11px 14px', color: '#64748b', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.description}>
                            {log.description || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Error Diagnostics Modal ── */}
      {selectedErrorModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            maxWidth: '600px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#b91c1c' }}>
                Job Error Diagnostics
              </h3>
              <button
                onClick={() => setSelectedErrorModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '12px' }}>
              <strong>Project:</strong> {selectedErrorModal.project_name} | <strong>Job ID:</strong> {selectedErrorModal.id}
            </div>

            <pre style={{
              flex: 1,
              background: '#0f172a',
              color: '#f87171',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              margin: 0
            }}>
              {selectedErrorModal.error || 'No error details recorded.'}
            </pre>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedErrorModal(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
