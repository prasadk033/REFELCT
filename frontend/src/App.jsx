import { useState, useEffect } from 'react'
import Upload from './components/Upload.jsx'
import Progress from './components/Progress.jsx'
import Result from './components/Result.jsx'
import { getResult } from './api.js'

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [status, setStatus] = useState('empty') // empty, processing, completed
  const [activeWorkspace, setActiveWorkspace] = useState('overview')
  const [reportData, setReportData] = useState(null)

  const icons = {
    overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
    brief: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
    program: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
    context: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>,
    focus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>,
    problem_frame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>,
    design_intent: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>
  }

  const workspaces = [
    { id: 'overview', label: 'Overview', desc: 'Project dashboard' },
    { id: 'brief', label: 'Brief', desc: 'Project goals, vision and key objectives' },
    { id: 'program', label: 'Program', desc: 'Functional requirements and spaces' },
    { id: 'context', label: 'Context', desc: 'Site, environment and surroundings' },
    { id: 'focus', label: 'Focus', desc: 'Key challenges and opportunities' },
    { id: 'problem_frame', label: 'Problem Frame', desc: 'Defined problems and design criteria' },
    { id: 'design_intent', label: 'Design Intent', desc: 'Core design intent and aspirations' },
  ]

  useEffect(() => {
    if (status === 'completed' && sessionId) {
      getResult(sessionId).then(setReportData).catch(console.error)
    }
  }, [status, sessionId])

  function handleAnalysisStarted(id) {
    setSessionId(id)
    setStatus('processing')
  }

  function handleAnalysisComplete() {
    setStatus('completed')
  }

  function handleAnalysisError() {
    setSessionId(null)
    setStatus('empty')
  }

  const getInsightCount = (wsId) => {
    if (!reportData || !reportData[wsId]) return 0;
    return reportData[wsId].length;
  }

  return (
    <div className="layout">
      {/* Left Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          REFLECT
        </div>

        <div className="sidebar-project-selector">
          <div className="project-selector-btn">
            <div className="project-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            </div>
            <div className="project-info">
              <span className="label">CURRENT PROJECT</span>
              <span className="name">Active Workspace</span>
            </div>
            <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>

        <nav className="workspace-nav">
          <ul>
            {workspaces.map(ws => {
              const isDisabled = ws.id !== 'overview' && status !== 'completed';
              return (
                <li key={ws.id}>
                  <button
                    className={`nav-btn ${activeWorkspace === ws.id ? 'active' : ''}`}
                    onClick={() => setActiveWorkspace(ws.id)}
                    disabled={isDisabled}
                  >
                    <span className="nav-icon">{icons[ws.id]}</span>
                    {ws.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">AM</div>
            <div className="user-info">
              <span className="name">Arjun Mehta</span>
              <span className="studio">Studio KKAA</span>
            </div>
            <svg className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-wrapper">
        <header className="top-header">
          <h2 className="header-title">{workspaces.find(w => w.id === activeWorkspace)?.label}</h2>
          <div className="header-actions">
            <div className="search-bar">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" placeholder="Search across project..." />
              <span className="shortcut">⌘K</span>
            </div>
            <button className="icon-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            </button>
          </div>
        </header>

        <main className="content-area">
          {activeWorkspace === 'overview' && (
            <div className="overview-dashboard">
              
              {status === 'processing' && (
                <div className="progress-section">
                  <Progress 
                    sessionId={sessionId} 
                    onComplete={handleAnalysisComplete} 
                    onReset={handleAnalysisError} 
                  />
                </div>
              )}

              {status === 'empty' && (
                <div className="upload-section">
                  <Upload onStarted={handleAnalysisStarted} />
                </div>
              )}

              <div className="thinking-areas">
                <h3>Thinking Areas</h3>
                <div className="areas-grid">
                  {workspaces.filter(w => w.id !== 'overview').map(ws => (
                    <div 
                      key={ws.id} 
                      className={`area-card ${status === 'completed' ? 'clickable' : 'disabled'}`}
                      onClick={() => { if (status === 'completed') setActiveWorkspace(ws.id) }}
                    >
                      <div className="area-icon">{icons[ws.id]}</div>
                      <h4>{ws.label}</h4>
                      <p>{ws.desc}</p>
                      
                      <div className="area-footer">
                        <span className="insight-count">
                          {status === 'completed' && reportData ? `${getInsightCount(ws.id)} Insights` : '0 Insights'}
                        </span>
                        <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {activeWorkspace !== 'overview' && status === 'completed' && (
            <Result 
              sessionId={sessionId} 
              activeWorkspace={activeWorkspace}
              reportData={reportData}
            />
          )}
        </main>
      </div>
    </div>
  )
}
