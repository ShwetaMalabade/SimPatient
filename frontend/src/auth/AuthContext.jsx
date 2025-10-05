// frontend/src/auth/AuthContext.jsx - FIXED
import React, { createContext, useEffect, useState } from 'react'
import { setAuthToken } from '../lib/api.js'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem('user') || 'null')
  )

  // ✅ Set token on axios instance whenever token changes
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
      setAuthToken(token) // 🔑 AUTO-SET TOKEN ON API CLIENT
    } else {
      localStorage.removeItem('token')
      setAuthToken(null) // Clear token from API client
    }
  }, [token])

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      localStorage.removeItem('user')
    }
  }, [user])

  const logout = () => {
    setToken(null)
    setUser(null)
    setAuthToken(null) // Clear token from API client on logout
  }

  return (
    <AuthContext.Provider value={{ token, setToken, user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}