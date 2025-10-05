// frontend/src/pages/ChatLayout.jsx - FIXED VERSION
import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { api, setAuthToken } from '../lib/api.js'
import Sidebar from '../ui/Sidebar.jsx'
import ChatArea from '../ui/ChatArea.jsx'
import { useParams, useNavigate } from 'react-router-dom'

export default function ChatLayout() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const { threadId } = useParams() // Get threadId from URL
  const [threads, setThreads] = useState([])
  const [activeMeta, setActiveMeta] = useState(null)

  useEffect(() => {
    setAuthToken(token)
    fetchThreads()
  }, [token])

  // Fetch thread metadata when threadId changes
  useEffect(() => {
    if (!threadId) {
      setActiveMeta(null)
      return
    }
    
    // Fetch the specific thread metadata
    api.get(`/threads/${threadId}`)
      .then(r => setActiveMeta(r.data))
      .catch(err => {
        console.error('Failed to load thread:', err)
        // If thread doesn't exist, redirect to new chat
        navigate('/newchat', { replace: true })
      })
  }, [threadId, navigate])

  async function fetchThreads() {
    try {
      const res = await api.get('/threads')
      setThreads(res.data)
    } catch (err) {
      console.error('Failed to fetch threads:', err)
    }
  }

  async function newChat() {
    try {
      const res = await api.post('/threads', { title: 'New Patient Session' })
      setThreads([res.data, ...threads])
      navigate(`/${res.data.id}`)
    } catch (err) {
      console.error('Failed to create thread:', err)
    }
  }

  function onThreadUpdated(updated) {
    setThreads(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
    if (threadId === updated.id) {
      setActiveMeta(m => ({ ...(m || {}), ...updated }))
    }
  }

  return (
    <div className="h-screen w-screen flex">
      <Sidebar
        user={user}
        threads={threads}
        activeId={threadId} // Use threadId from URL
        onNewChat={newChat}
      />
      <ChatArea
        key={threadId || 'empty'}
        threadId={threadId}
        meta={activeMeta}
        onEnded={(payload) => {
          onThreadUpdated(payload.thread)
          fetchThreads() // Refresh thread list
        }}
        onThreadEmptyNew={newChat}
      />
    </div>
  )
}