// src/ui/ChatArea.jsx
import React, { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import {
  SendHorizontal,
  ActivitySquare,
  ShieldCheck,
  Mic,
  MicOff,
  FileText,
  PhoneOff,
  AlertCircle
} from 'lucide-react'
import FeedbackCard from './FeedbackCard.jsx'
import { useSpeech, useTTS, requestMicPermission } from '../hooks/useSpeech.js'
import { useVUMeter } from '../hooks/useVUMeter.js'

export default function ChatArea({ threadId, meta, onEnded, onThreadEmptyNew }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('open')
  const [feedback, setFeedback] = useState(null)
  const [interimNote, setInterimNote] = useState('')
  const [voiceMode, setVoiceMode] = useState(false)
  const [sttError, setSttError] = useState('')

  const scrollRef = useRef(null)
  const lastSpokenIdRef = useRef(null)
  const idleTimerRef = useRef(null)

  // ---- Speech to Text (pause-to-send) ----
  const { supported: sttSupported, listening, interim, start, stop } = useSpeech({
    onFinalText: (finalText) => { if (finalText) sendText(finalText) },
    onInterimText: (txt) => setInterimNote(txt),
    silenceMs: 3500,
    onError: (e) => setSttError(e?.message || 'Speech error')
  })
  useEffect(() => { setInterimNote(interim) }, [interim])

  // ---- Text to Speech (patient talks) ----
  const { speak, cancel: cancelTTS, speaking } = useTTS({
    onEnd: () => { if (voiceMode && status === 'open') safeStartMic() }
  })

  // ---- VU meter for the big orb ----
  const { level } = useVUMeter(voiceMode && listening)

  // ---- Load data ----
  useEffect(() => { if (!threadId) return; fetchMetaAndMessages() }, [threadId])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])
  useEffect(() => {
    if (meta) { setTitle(meta.title); setStatus(meta.status); if (meta.status === 'closed') loadFeedback() }
  }, [meta])

  // Speak the latest patient message; then auto-resume mic
  useEffect(() => {
    const lastPatient = [...messages].filter(m => m.role === 'patient').slice(-1)[0]
    if (lastPatient && lastPatient.id !== lastSpokenIdRef.current) {
      try { stop() } catch {}
      speak(lastPatient.content)
      lastSpokenIdRef.current = lastPatient.id
      resetIdleTimer()
    }
  }, [messages])

  function resetIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      if (voiceMode && !listening && !speaking) setVoiceMode(false)
    }, 20000) // 20s idle → close voice overlay
  }

  async function fetchMetaAndMessages() {
    const t = await api.get(`/threads/${threadId}`)
    setTitle(t.data.title); setStatus(t.data.status)
    const res = await api.get(`/threads/${threadId}/messages`)
    setMessages(res.data)
    if (t.data.status === 'closed') loadFeedback()
  }

  async function loadFeedback() {
    try { const res = await api.get(`/threads/${threadId}/feedback`); setFeedback(res.data) }
    catch { setFeedback(null) }
  }

  async function sendText(text) {
    if (!text || status === 'closed') return
    const content = text.trim(); if (!content) return
    // optimistic doctor msg
    setMessages(m => [...m, { id: 'tmp-u-' + Date.now(), role: 'doctor', content, created_at: new Date().toISOString() }])
    const res = await api.post(`/threads/${threadId}/messages`, { role: 'doctor', content })
    setMessages(res.data)
    resetIdleTimer()
  }

  async function send() { await sendText(input); setInput('') }

  async function endDiagnosis() {
    const ok = confirm("End this session and generate feedback? You won't be able to send more messages.")
    if (!ok) return
    const res = await api.post(`/threads/${threadId}/end`, {})
    onEnded?.(res.data)
    setStatus('closed')
    await loadFeedback()
    try { stop() } catch {}
    cancelTTS()
    setVoiceMode(false)
  }

  function downloadTranscript() {
    const lines = messages.map(m => `${m.role === 'doctor' ? 'Doctor' : 'Patient'}: ${m.content}`)
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${(title || 'Session').replace(/\s+/g, '_')}_transcript.txt`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  // IMPORTANT: keep start() synchronous to preserve user-gesture
  function safeStartMic() {
    requestMicPermission() // do NOT await; keeps the gesture chain
    start()                // triggers onstart if allowed
  }
  function startVoice()  {
    if (!sttSupported || status === 'closed') return
    setSttError('')
    setVoiceMode(true)
    safeStartMic()
    resetIdleTimer()
  }
  function endVoice() {
    setVoiceMode(false)
    try { stop() } catch {}
    cancelTTS()
  }

  if (!threadId) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-4">
            <ActivitySquare className="w-8 h-8 text-brand-700" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Start a New Patient Session</h2>
          <p className="text-sm text-slate-600 mb-6">
            Create a new chat to practice doctor–patient conversations. Your previous sessions appear on the left.
          </p>
          <button
            onClick={onThreadEmptyNew}
            className="rounded-2xl px-5 py-2 bg-brand-600 text-white hover:bg-brand-700 shadow-soft"
          >
            + New Chat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 h-full flex flex-col">
      {/* Title bar */}
      <div className="px-6 py-3 border-b border-slate-200 bg-white/70 backdrop-blur-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={downloadTranscript} className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Transcript
          </button>
        </div>
        <div className="flex items-center gap-2">
          {sttSupported ? (
            <button
              disabled={status === 'closed'}
              onClick={() => (voiceMode ? endVoice() : startVoice())}
              className={`h-9 px-3 rounded-xl border flex items-center gap-2 ${voiceMode ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}
              title={voiceMode ? 'End voice session' : 'Start voice session'}
            >
              {voiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span className="text-xs">{voiceMode ? 'Voice on' : 'Voice'}</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-500 border border-slate-200 rounded-lg px-2 py-1">No mic</span>
          )}
          {status === 'open' ? (
            <button onClick={endDiagnosis} className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-black flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" /> End Diagnosis
            </button>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">Read-only</span>
          )}
        </div>
      </div>

      {/* Messages (always visible, even when closed) */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-4">
        {feedback && <div className="mb-4"><FeedbackCard data={feedback} /></div>}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} created_at={m.created_at} />
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder={status === 'closed' ? "This session is read-only." : "Speak or type…"}
            disabled={status === 'closed' || voiceMode}
            className="flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-slate-50"
          />
          <button
            onClick={send}
            className="rounded-2xl px-4 py-3 bg-brand-600 text-white hover:bg-brand-700 shadow-soft flex items-center gap-2 disabled:opacity-50"
            disabled={!input.trim() || status === 'closed' || voiceMode}
          >
            <SendHorizontal className="w-4 h-4" />
            Send
          </button>
        </div>
        {status === 'closed' && <p className="text-[10px] text-slate-500 text-center mt-2">Session ended—start a New Chat to continue.</p>}
      </div>

      {/* Voice overlay (big orb + Talk/Pause + X) */}
      {voiceMode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40">
          <div className="relative flex flex-col items-center gap-6">
            <div
              className="w-36 h-36 rounded-full bg-gradient-to-br from-brand-200 to-brand-500 shadow-2xl transition-transform"
              style={{ transform: `scale(${1 + (listening ? level : 0) * 0.6})` }}
            />
            {listening && interimNote && (
              <div className="text-sm text-white/85 max-w-[70vw] text-center">“{interimNote}”</div>
            )}
            <div className="flex items-center gap-4">
              <button
                onClick={() => (listening ? stop() : safeStartMic())}
                className="h-11 px-5 rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center gap-2"
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {listening ? 'Pause' : 'Talk'}
              </button>
              <button
                onClick={() => setVoiceMode(false)}
                className="h-11 w-11 rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center"
                title="End voice session"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
            <div className="text-[11px] text-white/70">
              {speaking ? 'Patient speaking…' : listening ? 'Listening… pause to send' : 'Paused'}
            </div>
            {sttError && (
              <div className="text-[11px] text-red-300 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {sttError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ role, content, created_at }) {
  const isDoctor = role === 'doctor'
  return (
    <div className={`flex ${isDoctor ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-soft ${isDoctor ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200'}`}>
        <div className="text-xs opacity-70 mb-1">{isDoctor ? 'Doctor' : 'Patient'}</div>
        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        <div className="text-[10px] opacity-50 mt-1">{new Date(created_at).toLocaleTimeString()}</div>
      </div>
    </div>
  )
}
