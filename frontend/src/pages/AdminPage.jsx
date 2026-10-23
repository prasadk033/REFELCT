import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getAdminOverview,
  getAdminUsers,
  updateAdminUserRole,
  getAdminProjects,
  getAdminJobs,
  dismissAdminJob,
  getAdminHealth,
  getAdminAuditLogs,
  getAdminProjectDetails,
  updateAdminProject,
  deleteAdminProject,
  deleteAdminUser,
  getAdminPermissions,
  assignAdminPermission,
  revokeAdminPermission,
  getAdminLogins
} from '../api.js'

export default function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperAdmin = (user?.email || '').toLowerCase() === 'prasad.k@datai2i.com' || (user?.email || '').toLowerCase() === 'prasad@datai2i.com'

  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'users' | 'projects' | 'permissions' | 'logins' | 'jobs' | 'health' | 'audit'
  
  // Data state
  const [overviewData, setOverviewData] = useState(null)
  const [usersList, setUsersList] = useState([])
  const [projectsList, setProjectsList] = useState([])
  const [jobsList, setJobsList] = useState([])
  const [healthData, setHealthData] = useState(null)
  const [auditLogsData, setAuditLogsData] = useState({ logs: [], total: 0 })
  const [permissionsList, setPermissionsList] = useState([])
  const [loginsData, setLoginsData] = useState({ logins: [], total: 0 })
  
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

  // Project Sorting & Filters
  const [projectSort, setProjectSort] = useState('newest')
  const [projectProgressionFilter, setProjectProgressionFilter] = useState('all')
  const [projectPermFilter, setProjectPermFilter] = useState('all')

  // Edit Project Modal
  const [editingProject, setEditingProject] = useState(null)
  const [editFormData, setEditFormData] = useState({ name: '', project_type: '', client: '', location: '', description: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete Project Modal
  const [deletingProject, setDeletingProject] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingLoading, setDeletingLoading] = useState(false)

  // Delete User Modal (Super Admin Only)
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteUserConfirmEmail, setDeleteUserConfirmEmail] = useState('')
  const [deletingUserLoading, setDeletingUserLoading] = useState(false)

  // Permission Assignment Form State (Super Admin)
  const [permTargetAdminId, setPermTargetAdminId] = useState('')
  const [permTargetProjectId, setPermTargetProjectId] = useState('')
  const [permCanRead, setPermCanRead] = useState(true)
  const [permCanEdit, setPermCanEdit] = useState(false)
  const [permCanDelete, setPermCanDelete] = useState(false)
  const [savingPerm, setSavingPerm] = useState(false)

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
        const data = await getAdminProjects({
          search: searchQuery,
          sort_by: projectSort,
          progression: projectProgressionFilter,
          permission_filter: projectPermFilter
        })
        setProjectsList(data || [])
      } else if (activeTab === 'permissions') {
        const [perms, users, projs] = await Promise.all([
          getAdminPermissions(),
          getAdminUsers(),
          getAdminProjects({ sort_by: 'name_asc' })
        ])
        setPermissionsList(perms || [])
        setUsersList(users || [])
        setProjectsList(projs || [])
      } else if (activeTab === 'logins') {
        const data = await getAdminLogins()
        setLoginsData(data || { logins: [], total: 0 })
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
  }, [activeTab, jobFilter, auditFilter, searchQuery, projectSort, projectProgressionFilter, projectPermFilter])

  // Initial tab load & tab switch
  useEffect(() => {
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

  // Handle Role Promotion/Demotion (Super Admin Only)
  async function handleToggleAdminRole(targetUser) {
    if (!targetUser) return
    const nextRole = !targetUser.is_admin
    const confirmMsg = nextRole
      ? `Promote ${targetUser.email} to Tech Admin?\nThey will have access to administrative dashboards (system health, live queue, logins, and audit logs).`
      : `Revoke Tech Admin privileges from ${targetUser.email}?`

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

  // Handle User Deletion (Super Admin Only)
  function handleOpenDeleteUserModal(u) {
    setDeletingUser(u)
    setDeleteUserConfirmEmail('')
  }

  async function handleConfirmDeleteUser() {
    if (!deletingUser) return
    if (deleteUserConfirmEmail.trim().toLowerCase() !== deletingUser.email.trim().toLowerCase()) return
    setDeletingUserLoading(true)
    setError(null)
    try {
      const res = await deleteAdminUser(deletingUser.id)
      setSuccessNotice(res.message || 'User and all associated data permanently deleted from database.')
      setTimeout(() => setSuccessNotice(null), 4000)
      setDeletingUser(null)
      loadSectionData(true)
    } catch (err) {
      setError(err.message || 'Failed to delete user from database.')
    } finally {
      setDeletingUserLoading(false)
    }
  }

  // Handle Dismissing / Aborting Stale Jobs
  async function handleDismissJob(jobId) {
    if (!jobId) return
    if (!window.confirm('Mark this interrupted/stale job as failed? It will be cleared from the running queue.')) return
    try {
      await dismissAdminJob(jobId)
      setSuccessNotice('Job marked as interrupted/failed and cleared from active queue.')
      setTimeout(() => setSuccessNotice(null), 4000)
      loadSectionData(true)
    } catch (err) {
      setError(err.message || 'Failed to dismiss job.')
    }
  }

  // ── Project Action Handlers ──
  function handleOpenEditModal(p) {
    setEditingProject(p)
    setEditFormData({
      name: p.name || '',
      project_type: p.project_type || '',
      client: p.client === '—' ? '' : (p.client || ''),
      location: p.location === '—' ? '' : (p.location || ''),
      description: p.description || ''
    })
  }

  async function handleSaveProjectEdit(e) {
    if (e) e.preventDefault()
    if (!editingProject) return
    setSavingEdit(true)
    setError(null)
    try {
      const res = await updateAdminProject(editingProject.id, editFormData)
      setSuccessNotice(res.message || 'Project updated successfully.')
      setTimeout(() => setSuccessNotice(null), 4000)
      setEditingProject(null)
      loadSectionData(true)
    } catch (err) {
      setError(err.message || 'Failed to update project. Permissions may have changed.')
      setEditingProject(null)
      loadSectionData(true)
    } finally {
      setSavingEdit(false)
    }
  }

  function handleOpenDeleteModal(p) {
    setDeletingProject(p)
    setDeleteConfirmText('')
  }

  async function handleConfirmDelete() {
    if (!deletingProject) return
    if (deleteConfirmText.trim() !== deletingProject.name.trim()) return
    setDeletingLoading(true)
    setError(null)
    try {
      const res = await deleteAdminProject(deletingProject.id)
      setSuccessNotice(res.message || 'Project deleted successfully.')
      setTimeout(() => setSuccessNotice(null), 4000)
      setDeletingProject(null)
      loadSectionData(true)
    } catch (err) {
      setError(err.message || 'Failed to delete project. Permissions may have changed.')
      setDeletingProject(null)
      loadSectionData(true)
    } finally {
      setDeletingLoading(false)
    }
  }

  // ── Permissions Handlers (Super Admin Only) ──
  async function handleAssignPermission(e) {
    if (e) e.preventDefault()
    if (!permTargetAdminId || !permTargetProjectId) {
      setError('Please select both an administrator and a target project.')
      return
    }
    setSavingPerm(true)
    setError(null)
    try {
      const res = await assignAdminPermission(
        permTargetAdminId,
        permTargetProjectId,
        permCanRead,
        permCanEdit,
        permCanDelete
      )
      setSuccessNotice(res.message || 'Permission granted successfully.')
      setTimeout(() => setSuccessNotice(null), 4000)
      loadSectionData(true)
    } catch (err) {
      setError(err.message || 'Failed to assign permission.')
    } finally {
      setSavingPerm(false)
    }
  }

  async function handleRevokePermission(permId) {
    if (!permId) return
    if (!window.confirm('Revoke all delegated permissions for this administrator on this project?')) return
    setError(null)
    try {
      const res = await revokeAdminPermission(permId)
      setSuccessNotice(res.message || 'Permission revoked successfully.')
      setTimeout(() => setSuccessNotice(null), 4000)
      loadSectionData(true)
    } catch (err) {
      setError(err.message || 'Failed to revoke permission.')
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
              ...(isSuperAdmin ? [{
                id: 'permissions',
                label: 'Permissions',
                badge: 'Super Admin',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )
              }] : []),
              {
                id: 'logins',
                label: 'Login Telemetry',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
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
                      <th style={{ padding: '11px 16px', fontWeight: 600, textAlign: 'right' }}>
                        {isSuperAdmin ? 'Administrator Actions' : 'Role Status'}
                      </th>
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
                              {u.is_generating ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#2563eb'
                                }}>
                                  <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: '#3b82f6',
                                    animation: 'pulse 1.5s infinite'
                                  }} />
                                  Generating AI...
                                </span>
                              ) : (
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
                              )}
                            </td>

                            {/* Last Activity */}
                            <td style={{ padding: '13px 16px', color: '#64748b', fontSize: '12px' }}>
                              {formatDate(u.last_activity)}
                            </td>

                            {/* Admin Action Toggle / User Deletion (Super Admin Only) */}
                            <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                              {u.is_root_admin ? (
                                <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                  Super Admin (Root)
                                </span>
                              ) : isSuperAdmin ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    onClick={() => handleToggleAdminRole(u)}
                                    disabled={isUpdating}
                                    style={{
                                      background: u.is_admin ? '#fff7ed' : '#f0fdf4',
                                      border: `1px solid ${u.is_admin ? '#fed7aa' : '#bbf7d0'}`,
                                      color: u.is_admin ? '#c2410c' : '#16a34a',
                                      borderRadius: '6px',
                                      padding: '5px 10px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      transition: 'all 0.1s ease'
                                    }}
                                  >
                                    {isUpdating ? 'Updating...' : u.is_admin ? 'Revoke Tech Admin' : 'Make Tech Admin'}
                                  </button>

                                  <button
                                    onClick={() => handleOpenDeleteUserModal(u)}
                                    title="Permanently delete user from database"
                                    style={{
                                      background: '#fef2f2',
                                      border: '1px solid #fecaca',
                                      color: '#dc2626',
                                      borderRadius: '6px',
                                      padding: '5px 10px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      transition: 'all 0.1s ease'
                                    }}
                                  >
                                    Delete User
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                                  {u.is_admin ? 'Tech Admin' : 'User'}
                                </span>
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
          {/* TAB 3: PROJECTS (Enhanced with Search, Sort, Filters, Actions)   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'projects' && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    Projects Administration
                  </h2>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Track project creation dates, owners, artifacts, progression, and delegated RBAC permissions.
                  </p>
                </div>

                {isSuperAdmin && (
                  <button
                    onClick={() => setActiveTab('permissions')}
                    style={{
                      background: '#4f46e5',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '7px',
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Manage Permissions →
                  </button>
                )}
              </div>

              {/* Enhanced Toolbar: Search, Sort & Filters */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
                  {/* Search */}
                  <div style={{ position: 'relative', minWidth: '220px' }}>
                    <input
                      type="text"
                      placeholder="Search name, client, owner..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12.5px',
                        color: '#0f172a',
                        outline: 'none',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Sort By */}
                  <select
                    value={projectSort}
                    onChange={(e) => setProjectSort(e.target.value)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: '#334155',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="newest">Sort: Newest First</option>
                    <option value="oldest">Sort: Oldest First</option>
                    <option value="updated_desc">Sort: Recently Updated</option>
                    <option value="updated_asc">Sort: Least Recently Updated</option>
                    <option value="name_asc">Sort: Name (A-Z)</option>
                    <option value="name_desc">Sort: Name (Z-A)</option>
                  </select>

                  {/* Progression Filter */}
                  <select
                    value={projectProgressionFilter}
                    onChange={(e) => setProjectProgressionFilter(e.target.value)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: '#334155',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="all">Workflow: All Stages</option>
                    <option value="Draft">Draft</option>
                    <option value="Sources Uploaded">Sources Uploaded</option>
                    <option value="Brief Review">Brief Review</option>
                    <option value="Brief Published">Brief Published</option>
                    <option value="Program in Progress">Program in Progress</option>
                    <option value="Program Published">Program Published</option>
                  </select>

                  {/* Permission Filter */}
                  <select
                    value={projectPermFilter}
                    onChange={(e) => setProjectPermFilter(e.target.value)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: '#334155',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="all">Access: All Projects</option>
                    <option value="permitted_only">Permitted (View Access)</option>
                    <option value="editable_only">Editable</option>
                    <option value="deletable_only">Deletable</option>
                    <option value="my_projects">My Owned Projects</option>
                  </select>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Showing <strong style={{ color: '#0f172a' }}>{projectsList.length}</strong> projects
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
                      <th style={{ padding: '11px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectsList.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                          No projects matching the selected search or filter criteria.
                        </td>
                      </tr>
                    ) : (
                      projectsList.map(p => {
                        const perms = p.effective_permissions || {}
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '13px 16px' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                              <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                                <span>{p.project_type}</span>
                                {p.client && p.client !== '—' && <span>• {p.client}</span>}
                                {p.location && p.location !== '—' && (
                                  <span style={{ color: '#0369a1', fontWeight: 500 }}>
                                    • 📍 {p.location}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '13px 16px' }}>
                              <div style={{ fontWeight: 500, color: '#334155' }}>
                                {p.owner_name}
                                {perms.is_owner && (
                                  <span style={{
                                    marginLeft: '6px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '2px 5px',
                                    borderRadius: '4px',
                                    background: '#ecfdf5',
                                    color: '#059669'
                                  }}>
                                    YOU
                                  </span>
                                )}
                              </div>
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
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {/* READ / VIEW ACTION */}
                                {perms.can_read ? (
                                  <button
                                    onClick={() => navigate(`/projects/${p.id}`)}
                                    title="Open Project Workspace"
                                    style={{
                                      background: '#f8fafc',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '6px',
                                      padding: '5px 9px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      color: '#2563eb',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    View →
                                  </button>
                                ) : null}

                                {/* EDIT ACTION (Tech Admins with delegated edit rights only; Super Admin has no edit per policy) */}
                                {perms.can_edit && !isSuperAdmin ? (
                                  <button
                                    onClick={() => handleOpenEditModal(p)}
                                    title="Edit Project Metadata"
                                    style={{
                                      background: '#fffbeb',
                                      border: '1px solid #fde68a',
                                      borderRadius: '6px',
                                      padding: '5px 9px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      color: '#b45309',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Edit
                                  </button>
                                ) : null}

                                {/* DELETE ACTION */}
                                {perms.can_delete ? (
                                  <button
                                    onClick={() => handleOpenDeleteModal(p)}
                                    title="Permanently Delete Project"
                                    style={{
                                      background: '#fef2f2',
                                      border: '1px solid #fecaca',
                                      borderRadius: '6px',
                                      padding: '5px 9px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      color: '#dc2626',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}

                                {/* ISOLATED BADGE */}
                                {!perms.can_read && !perms.can_edit && !perms.can_delete && (
                                  <span
                                    title="Tenant Isolated: Private to project owner. No delegated permissions granted."
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: '#94a3b8',
                                      background: '#f1f5f9',
                                      padding: '3px 8px',
                                      borderRadius: '5px'
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    Isolated
                                  </span>
                                )}
                              </div>
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
          {/* TAB 3B: PERMISSIONS MANAGEMENT (Super Admin Only)               */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'permissions' && isSuperAdmin && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ marginBottom: '22px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                  Role-Based Permissions Management
                </h2>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                  Super Admin controls which administrative actions (READ, EDIT, DELETE) each Admin can perform on specific client projects.
                </p>
              </div>

              {/* Grant Form Card */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '18px 20px',
                marginBottom: '24px'
              }}>
                <h3 style={{ fontSize: '13.5px', fontWeight: 700, margin: '0 0 12px', color: '#0f172a' }}>
                  Grant or Update Project Permission
                </h3>

                <form onSubmit={handleAssignPermission} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                    {/* Admin User Selector */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                        Tech Administrator
                      </label>
                      <select
                        value={permTargetAdminId}
                        onChange={(e) => setPermTargetAdminId(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          outline: 'none'
                        }}
                      >
                        <option value="">Select a Tech Admin...</option>
                        {usersList.filter(u => u.is_admin && !u.is_root_admin && (u.email || '').toLowerCase() !== 'prasad.k@datai2i.com' && (u.email || '').toLowerCase() !== 'prasad@datai2i.com').map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                      {usersList.filter(u => u.is_admin && !u.is_root_admin && (u.email || '').toLowerCase() !== 'prasad.k@datai2i.com' && (u.email || '').toLowerCase() !== 'prasad@datai2i.com').length === 0 && (
                        <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px' }}>
                          No Tech Admins found. Promote a user in the Users tab first.
                        </div>
                      )}
                    </div>

                    {/* Target Project Selector */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                        Target Project
                      </label>
                      <select
                        value={permTargetProjectId}
                        onChange={(e) => setPermTargetProjectId(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          outline: 'none'
                        }}
                      >
                        <option value="">Select a Project...</option>
                        {projectsList.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Owner: {p.owner_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Permission Checkboxes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', paddingTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={permCanRead}
                        onChange={(e) => {
                          const val = e.target.checked
                          setPermCanRead(val)
                          if (!val) {
                            setPermCanEdit(false)
                            setPermCanDelete(false)
                          }
                        }}
                      />
                      <span>READ (View project details)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={permCanEdit}
                        onChange={(e) => {
                          const val = e.target.checked
                          setPermCanEdit(val)
                          if (val) setPermCanRead(true)
                        }}
                      />
                      <span>EDIT (Update project metadata)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={permCanDelete}
                        onChange={(e) => {
                          const val = e.target.checked
                          setPermCanDelete(val)
                          if (val) setPermCanRead(true)
                        }}
                      />
                      <span>DELETE (Safely delete project)</span>
                    </label>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={savingPerm}
                      style={{
                        background: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 16px',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {savingPerm ? 'Saving...' : 'Grant / Update Permissions'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Existing Permissions Table */}
              <h3 style={{ fontSize: '13.5px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
                Active Delegated Permissions ({permissionsList.length})
              </h3>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Administrator</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Project</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Privileges</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Last Updated</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissionsList.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                          No delegated permissions assigned yet.
                        </td>
                      </tr>
                    ) : (
                      permissionsList.map(perm => (
                        <tr key={perm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{perm.admin_name}</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b' }}>{perm.admin_email}</div>
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#334155' }}>{perm.project_name}</div>
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ display: 'inline-flex', gap: '5px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: perm.can_read ? '#dbeafe' : '#f1f5f9',
                                color: perm.can_read ? '#1d4ed8' : '#94a3b8'
                              }}>
                                READ
                              </span>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: perm.can_edit ? '#fef3c7' : '#f1f5f9',
                                color: perm.can_edit ? '#b45309' : '#94a3b8'
                              }}>
                                EDIT
                              </span>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: perm.can_delete ? '#fee2e2' : '#f1f5f9',
                                color: perm.can_delete ? '#b91c1c' : '#94a3b8'
                              }}>
                                DELETE
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: '12px', color: '#64748b' }}>
                            {formatDate(perm.updated_at || perm.created_at)}
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleRevokePermission(perm.id)}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                padding: '4px 9px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                color: '#dc2626',
                                cursor: 'pointer'
                              }}
                            >
                              Revoke
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
          {/* TAB 3C: SECURITY & LOGIN TELEMETRY                              */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'logins' && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                  User Login & Security Telemetry
                </h2>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                  Audit log of authentication attempts, trusted IP addresses, and user-agent information observed by the backend proxy.
                </p>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Timestamp</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>User / Email</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Observed IP</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Location</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '11px 16px', fontWeight: 600 }}>Client User-Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!loginsData.logins || loginsData.logins.length === 0) ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                          No login events recorded yet.
                        </td>
                      </tr>
                    ) : (
                      loginsData.logins.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {formatDate(item.created_at)}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                            {item.email}
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#334155' }}>
                            {item.ip_address}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: '#475569' }}>
                            {item.country && item.country !== 'Unknown' && item.country !== 'Internal'
                              ? `${item.city && item.city !== 'Unknown' ? item.city + ', ' : ''}${item.country}`
                              : (item.country === 'Localhost' || item.country === 'Private Network' || item.city === 'Internal')
                              ? `${item.country || 'Private Network'} (${item.city || 'Internal'})`
                              : 'Unknown / Approximate'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: item.status === 'success' ? '#ecfdf5' : '#fef2f2',
                              color: item.status === 'success' ? '#059669' : '#dc2626'
                            }}>
                              {item.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '11px', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.user_agent}>
                            {item.user_agent || '—'}
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
          {/* EDIT PROJECT MODAL                                              */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {editingProject && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              backdropFilter: 'blur(2px)'
            }}>
              <div style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                width: '480px',
                maxWidth: '90vw',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Edit Project
                  </h3>
                  <button
                    onClick={() => setEditingProject(null)}
                    style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveProjectEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '13px',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Project Type *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.project_type}
                      onChange={(e) => setEditFormData({ ...editFormData, project_type: e.target.value })}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '13px',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Client
                      </label>
                      <input
                        type="text"
                        value={editFormData.client}
                        onChange={(e) => setEditFormData({ ...editFormData, client: e.target.value })}
                        style={{
                          width: '100%',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          fontSize: '13px',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Location
                      </label>
                      <input
                        type="text"
                        value={editFormData.location}
                        onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                        style={{
                          width: '100%',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          fontSize: '13px',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Description
                    </label>
                    <textarea
                      rows="3"
                      value={editFormData.description}
                      onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '13px',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setEditingProject(null)}
                      style={{
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 14px',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      style={{
                        background: '#0f172a',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 16px',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      {savingEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* DELETE PROJECT CONFIRMATION MODAL                               */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {deletingProject && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              backdropFilter: 'blur(2px)'
            }}>
              <div style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #fee2e2',
                width: '460px',
                maxWidth: '90vw',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#dc2626'
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#991b1b' }}>
                      Delete Project
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                      Permanent deletion of project and associated artifacts
                    </p>
                  </div>
                </div>

                <div style={{
                  background: '#fff5f5',
                  border: '1px solid #fed7d7',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                  color: '#742a2a',
                  lineHeight: 1.5,
                  marginBottom: '16px'
                }}>
                  This action <strong>cannot be undone</strong>. It will cancel ongoing AI extractions and permanently delete all sources, Brief cards, Program items, published versions, and MinIO storage files for:
                  <div style={{ marginTop: '6px', fontWeight: 700, color: '#991b1b' }}>
                    "{deletingProject.name}"
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Type the project name to confirm:
                  </label>
                  <input
                    type="text"
                    placeholder={deletingProject.name}
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '13px',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setDeletingProject(null)}
                    style={{
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteConfirmText.trim() !== deletingProject.name.trim() || deletingLoading}
                    onClick={handleConfirmDelete}
                    style={{
                      background: deleteConfirmText.trim() === deletingProject.name.trim() ? '#dc2626' : '#fca5a5',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 16px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: '#ffffff',
                      cursor: deleteConfirmText.trim() === deletingProject.name.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {deletingLoading ? 'Deleting...' : 'Permanently Delete Project'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Delete User Confirmation Modal (Super Admin Only) ── */}
          {deletingUser && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px'
            }}>
              <div style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #fee2e2',
                width: '480px',
                maxWidth: '90vw',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#dc2626'
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#991b1b' }}>
                      Delete User from Database
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                      Permanent deletion of account, projects, artifacts and telemetry
                    </p>
                  </div>
                </div>

                <div style={{
                  background: '#fff5f5',
                  border: '1px solid #fed7d7',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                  color: '#742a2a',
                  lineHeight: 1.5,
                  marginBottom: '16px'
                }}>
                  This action <strong>cannot be undone</strong>. It will cancel ongoing AI extractions and permanently delete from the database:
                  <div style={{ marginTop: '6px', fontWeight: 700, color: '#991b1b' }}>
                    {deletingUser.name} ({deletingUser.email})
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '11.5px', color: '#b91c1c' }}>
                    {deletingUser.projects_count} project(s), Brief cards, Program items, storage files, and logs will be permanently erased.
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Type the user email to confirm:
                  </label>
                  <input
                    type="text"
                    placeholder={deletingUser.email}
                    value={deleteUserConfirmEmail}
                    onChange={(e) => setDeleteUserConfirmEmail(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '13px',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setDeletingUser(null)}
                    style={{
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteUserConfirmEmail.trim().toLowerCase() !== deletingUser.email.trim().toLowerCase() || deletingUserLoading}
                    onClick={handleConfirmDeleteUser}
                    style={{
                      background: deleteUserConfirmEmail.trim().toLowerCase() === deletingUser.email.trim().toLowerCase() ? '#dc2626' : '#fca5a5',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 16px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: '#ffffff',
                      cursor: deleteUserConfirmEmail.trim().toLowerCase() === deletingUser.email.trim().toLowerCase() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {deletingUserLoading ? 'Deleting...' : 'Permanently Delete User'}
                  </button>
                </div>
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
                              background: job.is_stale || job.status === 'interrupted' 
                                ? '#fffbeb' 
                                : job.status === 'completed' 
                                  ? '#ecfdf5' 
                                  : job.status === 'failed' 
                                    ? '#fef2f2' 
                                    : '#eff6ff',
                              color: job.is_stale || job.status === 'interrupted'
                                ? '#b45309'
                                : job.status === 'completed' 
                                  ? '#065f46' 
                                  : job.status === 'failed' 
                                    ? '#991b1b' 
                                    : '#1d4ed8'
                            }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: job.is_stale || job.status === 'interrupted'
                                  ? '#f59e0b'
                                  : job.status === 'completed' 
                                    ? '#10b981' 
                                    : job.status === 'failed' 
                                      ? '#ef4444' 
                                      : '#3b82f6',
                                animation: job.is_active ? 'pulse 1.5s infinite' : 'none'
                              }} />
                              {job.is_stale || job.status === 'interrupted' ? 'Interrupted (Stale)' : job.status}
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
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {(job.is_stale || job.status === 'interrupted') && (
                                <button
                                  onClick={() => handleDismissJob(job.id)}
                                  style={{
                                    background: '#fef3c7',
                                    border: '1px solid #fde68a',
                                    color: '#92400e',
                                    borderRadius: '5px',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                  title="Job was interrupted by past server restart. Click to clear."
                                >
                                  Clear Job
                                </button>
                              )}
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
                              ) : !job.is_stale && (
                                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                  {job.cards_generated ? `${job.cards_generated} cards` : 'OK'}
                                </span>
                              )}
                            </div>
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
