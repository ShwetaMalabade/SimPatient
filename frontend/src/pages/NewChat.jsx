import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function NewChat() {
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // create with auto-title (Patient #N)
        const res = await api.post('/threads', {})
        if (!mounted) return
        navigate(`/${res.data.id}`, { replace: true })
      } catch (e) {
        console.error(e)
        // If creation fails, send back to root (will redirect to /newchat anyway)
        navigate('/', { replace: true })
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  return (
    <div className="h-screen w-screen flex items-center justify-center text-slate-600">
      Creating session…
    </div>
  )
}
