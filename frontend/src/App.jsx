import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import GlobalOverviewPage from './pages/GlobalOverviewPage.jsx'
import ProjectOverviewPage from './pages/ProjectOverviewPage.jsx'
import BriefPage from './pages/BriefPage.jsx'
import ExtractionReviewPage from './pages/ExtractionReviewPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

function HomeRoute() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="brief-ui-loading">
        <span className="bui-spinner" />
      </div>
    )
  }
  return isAuthenticated ? <GlobalOverviewPage /> : <LandingPage />
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="brief-ui-loading">
        <span className="bui-spinner" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/overview" element={<ProtectedRoute><GlobalOverviewPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectOverviewPage /></ProtectedRoute>} />
      <Route path="/projects/:projectId/extract" element={<ProtectedRoute><ExtractionReviewPage /></ProtectedRoute>} />
      <Route path="/projects/:projectId/brief" element={<ProtectedRoute><BriefPage /></ProtectedRoute>} />
      <Route path="/brief" element={<ProtectedRoute><BriefPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
