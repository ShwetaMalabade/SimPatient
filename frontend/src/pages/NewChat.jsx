// frontend/src/pages/NewChat.jsx - FIXED
import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../lib/api'

export default function NewChat() {
  const navigate = useNavigate()
  const { token } = useAuth()

  useEffect(() => {
    // Safety check - if no token, redirect to login
    if (!token) {
      console.warn('⚠️ No token found, redirecting to login')
      navigate('/login', { replace: true })
      return
    }

    let mounted = true
    ;(async () => {
      try {
        // Create new thread with auto-title (Patient #N)
        const res = await api.post('/threads', {})
        if (!mounted) return
        navigate(`/${res.data.id}`, { replace: true })
      } catch (e) {
        console.error('❌ Failed to create thread:', e)
        
        // If unauthorized, redirect to login
        if (e.response?.status === 401) {
          console.warn('⚠️ Unauthorized - redirecting to login')
          navigate('/login', { replace: true })
        } else {
          // Other errors - go back to home
          navigate('/', { replace: true })
        }
      }
    })()
    return () => { mounted = false }
  }, [navigate, token])

  return (
    <div className="h-screen w-screen flex items-center justify-center text-slate-600">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p>Creating session…</p>
      </div>
    </div>
  )
}