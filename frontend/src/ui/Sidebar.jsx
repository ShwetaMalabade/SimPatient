import React from 'react'
import { Plus, Stethoscope, LogOut, Lock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'

export default function Sidebar({ user, threads, activeId }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const open = threads.filter(t => t.status === 'open')
  const closed = threads.filter(t => t.status === 'closed')

  return (
    <div className="w-[300px] h-full bg-white/80 border-r border-slate-200 p-3 flex flex-col gap-3">
      {/* Profile */}
      <div className="rounded-2xl p-3 bg-gradient-to-br from-brand-50 to-white border border-brand-100 shadow-soft flex items-center gap-3">
        <img src={user?.picture} className="w-10 h-10 rounded-xl object-cover border border-brand-100" alt="pfp" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{user?.name}</div>
          <div className="text-xs text-slate-600 truncate">{user?.hospital}</div>
        </div>
        <button onClick={logout} className="p-2 rounded-2xl hover:bg-slate-100" title="Sign out">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* New chat → /newchat */}
      <button
        onClick={() => navigate('/newchat')}
        className="flex items-center gap-2 justify-center rounded-2xl border border-slate-200 py-2 hover:bg-slate-50"
      >
        <Plus className="w-4 h-4" />
        <span className="font-medium">New Chat</span>
      </button>

      <Section title="Active Sessions">
        {open.map((t) => (
          <ThreadItem key={t.id} t={t} active={activeId === t.id} onClick={() => navigate(`/${t.id}`)} />
        ))}
        {open.length === 0 && <Empty text="No active sessions" />}
      </Section>

      <Section title="Closed Sessions" small>
        {closed.map((t) => (
          <ThreadItem key={t.id} t={t} active={activeId === t.id} onClick={() => navigate(`/${t.id}`)} closed />
        ))}
        {closed.length === 0 && <Empty text="No closed sessions" />}
      </Section>

      <div className="text-[10px] text-slate-500 text-center">
        <div className="flex items-center justify-center gap-1">
          <Stethoscope className="w-3 h-3" /> MediSim • for training only
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, small }) {
  return (
    <div className="flex-1 overflow-auto space-y-1">
      <div className={`text-[11px] uppercase tracking-wide text-slate-500 mb-1 ${small ? 'mt-1' : 'mt-2'}`}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ text }) {
  return <div className="text-[11px] text-slate-400 pl-1">{text}</div>
}

function ThreadItem({ t, active, onClick, closed }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 border ${active ? 'border-brand-300 bg-brand-50' : 'border-transparent'}`}
      title={t.title}
    >
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium truncate">{t.title}</div>
        {closed && <Lock className="w-3 h-3 text-slate-500" />}
      </div>
      <div className="text-[10px] text-slate-500">
        {closed && t.ended_at ? `Closed ${new Date(t.ended_at).toLocaleString()}` : `Updated ${new Date(t.updated_at).toLocaleString()}`}
      </div>
    </button>
  )
}
