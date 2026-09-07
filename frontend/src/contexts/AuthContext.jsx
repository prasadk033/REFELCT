import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loginWithGoogle, loginDev, getCurrentUser, checkAiHealth } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('reflect_token'))
  const [loading, setLoading] = useState(true)
  const [aiStatus, setAiStatus] = useState({ slow: false, message: '' })
  const [aiDismissed, setAiDismissed] = useState(false)

  const verifyAiHealth = useCallback(async () => {
    try {
      const res = await checkAiHealth()
      if (res && res.slow) {
        setAiStatus({
          slow: true,
          message: res.message || 'AI services are temporarily slow due to high demand. Please try again after some time.'
        })
      } else {
        setAiStatus({ slow: false, message: '' })
      }
    } catch {
      // Silently fail on network glitches
    }
  }, [])

  useEffect(() => {
    if (token) {
      const stored = localStorage.getItem('reflect_user')
      if (stored) {
        try { setUser(JSON.parse(stored)) } catch { /* ignore */ }
      }
      verifyAiHealth()
    }
    setLoading(false)
  }, [token, verifyAiHealth])

  async function handleGoogleLogin(googleToken) {
    const data = await loginWithGoogle(googleToken)
    localStorage.setItem('reflect_token', data.access_token)
    localStorage.setItem('reflect_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    verifyAiHealth()
    return data
  }

  async function handleDevLogin() {
    const data = await loginDev()
    localStorage.setItem('reflect_token', data.access_token)
    localStorage.setItem('reflect_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    verifyAiHealth()
    return data
  }

  function logout() {
    localStorage.removeItem('reflect_token')
    localStorage.removeItem('reflect_user')
    setToken(null)
    setUser(null)
  }

  function dismissAiNotice() {
    setAiDismissed(true)
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    aiStatus,
    aiDismissed,
    dismissAiNotice,
    verifyAiHealth,
    loginWithGoogle: handleGoogleLogin,
    loginDev: handleDevLogin,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
