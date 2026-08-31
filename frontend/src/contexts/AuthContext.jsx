import { createContext, useContext, useState, useEffect } from 'react'
import { loginWithGoogle, loginDev, getCurrentUser } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('reflect_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      const stored = localStorage.getItem('reflect_user')
      if (stored) {
        try { setUser(JSON.parse(stored)) } catch { /* ignore */ }
      }
    }
    setLoading(false)
  }, [])

  async function handleGoogleLogin(googleToken) {
    const data = await loginWithGoogle(googleToken)
    localStorage.setItem('reflect_token', data.access_token)
    localStorage.setItem('reflect_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    return data
  }

  async function handleDevLogin() {
    const data = await loginDev()
    localStorage.setItem('reflect_token', data.access_token)
    localStorage.setItem('reflect_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    return data
  }

  function logout() {
    localStorage.removeItem('reflect_token')
    localStorage.removeItem('reflect_user')
    setToken(null)
    setUser(null)
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
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
