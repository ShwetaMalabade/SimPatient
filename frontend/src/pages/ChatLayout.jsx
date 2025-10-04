import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { api, setAuthToken } from '../lib/api.js'
import Sidebar from '../ui/Sidebar.jsx'
import ChatArea from '../ui/ChatArea.jsx'

export default function ChatLayout() {
  const { token, user } = useAuth()
  const [threads, setThreads] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [activeMeta, setActiveMeta] = useState(null)

  useEffect(() => {
    setAuthToken(token)
    fetchThreads()
  }, [token])

  async function fetchThreads() {
    const res = await api.get('/threads')
    setThreads(res.data)
    if (!activeId && res.data.length > 0) {
      setActiveId(res.data[0].id)
    }
  }

  useEffect(() => {
    if (!activeId) { setActiveMeta(null); return }
    api.get(`/threads/${activeId}`).then(r => setActiveMeta(r.data))
  }, [activeId])

  async function newChat() {
    const res = await api.post('/threads', { title: 'New Patient Session' })
    setThreads([res.data, ...threads])
    setActiveId(res.data.id)
    setActiveMeta(res.data)
  }

  function onThreadUpdated(updated) {
    setThreads(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
    if (activeId === updated.id) setActiveMeta(m => ({ ...(m || {}), ...updated }))
  }

  return (
    <div className="h-screen w-screen flex">
      <Sidebar
        user={user}
        threads={threads}
        activeId={activeId}
        setActiveId={setActiveId}
        onNewChat={newChat}
      />
      <ChatArea
        key={activeId || 'empty'}
        threadId={activeId}
        meta={activeMeta}
        onEnded={(payload) => onThreadUpdated(payload.thread)}
        onThreadEmptyNew={newChat}
      />
    </div>
  )
}
