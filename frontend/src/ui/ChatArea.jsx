// src/ui/ChatArea.jsx - FULLY WORKING VERSION
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../lib/api.js'
import { API_BASE } from '../lib/config.js'
import {
  SendHorizontal,
  ActivitySquare,
  ShieldCheck,
  Mic,
  MicOff,
  FileText,
  PhoneOff
} from 'lucide-react'
import FeedbackCard from './FeedbackCard.jsx'
import { useSpeech } from '../hooks/useSpeech.js'
import { useVUMeter } from '../hooks/useVUMeter.js'

export default function ChatArea({ threadId, meta, onEnded, onThreadEmptyNew }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('open')
  const [feedback, setFeedback] = useState(null)
  const [voiceMode, setVoiceMode] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)

  const scrollRef = useRef(null)
  const lastSpokenIdRef = useRef(null)
  const audioRef = useRef(null)
  const tokenRef = useRef(localStorage.getItem('token'))
  const voiceModeRef = useRef(false)

  // Sync voiceMode ref
  useEffect(() => {
    voiceModeRef.current = voiceMode
    console.log('Voice mode changed:', voiceMode)
  }, [voiceMode])

  // Speech recognition
  const { supported: sttSupported, listening, interim, start, stop } = useSpeech({
    silenceMs: 3500
  })

  const { level } = useVUMeter(voiceMode && listening)

  // Final text handler - MUST be stable reference
  const handleFinalText = useCallback((text) => {
    console.log('🎯 handleFinalText called with:', text)
    console.log('   voiceModeRef.current:', voiceModeRef.current)
    
    if (!voiceModeRef.current) {
      console.log('   ❌ Voice mode is OFF, ignoring')
      return
    }
    
    if (!text) {
      console.log('   ❌ Empty text, ignoring')
      return
    }
    
    console.log('   ✅ Sending message...')
    sendText(text)
  }, []) // No dependencies - stable reference

  useEffect(() => {
    if (!threadId) return
    fetchMetaAndMessages()
  }, [threadId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (meta) {
      setTitle(meta.title)
      setStatus(meta.status)
      if (meta.status === 'closed') loadFeedback()
    }
  }, [meta])

  // Play patient audio when new message arrives
  useEffect(() => {
    if (!voiceModeRef.current) {
      console.log('⏭️ Voice mode OFF, not playing audio')
      return
    }

    console.log('🔍 Checking messages for patient response...', messages.length)
    
    const patientMessages = messages.filter(m => m.role === 'patient')
    console.log('   Patient messages:', patientMessages.length)
    
    if (patientMessages.length === 0) {
      console.log('   No patient messages yet')
      return
    }
    
    const lastPatient = patientMessages[patientMessages.length - 1]
    
    if (lastPatient.id === lastSpokenIdRef.current) {
      console.log('   Already played:', lastPatient.id)
      return
    }
    
    console.log('   🎤 NEW PATIENT MESSAGE! Playing:', lastPatient.id)
    lastSpokenIdRef.current = lastPatient.id
    playPatientAudio(lastPatient.id)
  }, [messages])

  async function playPatientAudio(messageId) {
    try {
      console.log('🔊 Fetching audio for message:', messageId)
      
      if (listening) {
        console.log('⏸️ Stopping mic')
        stop()
      }

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      setAudioPlaying(true)

      const response = await fetch(`${API_BASE}/messages/${messageId}/speech`, {
        headers: { 'Authorization': `Bearer ${tokenRef.current}` }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const audioBlob = await response.blob()
      console.log('📦 Got audio blob:', audioBlob.size, 'bytes')
      
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        console.log('🎵 Audio finished')
        setAudioPlaying(false)
        URL.revokeObjectURL(audioUrl)
        audioRef.current = null

        if (voiceModeRef.current && status === 'open') {
          console.log('🎤 Resuming mic...')
          setTimeout(() => {
            if (voiceModeRef.current) {
              start({ onFinalText: handleFinalText })
            }
          }, 1000)
        }
      }

      audio.onerror = (e) => {
        console.error('❌ Audio error:', e)
        setAudioPlaying(false)
        URL.revokeObjectURL(audioUrl)
        audioRef.current = null
        
        if (voiceModeRef.current && status === 'open') {
          setTimeout(() => start({ onFinalText: handleFinalText }), 500)
        }
      }

      console.log('▶️ Playing audio...')
      await audio.play()
      
    } catch (err) {
      console.error('❌ Playback error:', err)
      setAudioPlaying(false)
      
      if (voiceModeRef.current && status === 'open') {
        setTimeout(() => start({ onFinalText: handleFinalText }), 500)
      }
    }
  }

  async function fetchMetaAndMessages() {
    try {
      const t = await api.get(`/threads/${threadId}`)
      setTitle(t.data.title)
      setStatus(t.data.status)
      
      const res = await api.get(`/threads/${threadId}/messages`)
      console.log('📥 Loaded messages:', res.data.length)
      setMessages(res.data)
      
      if (t.data.status === 'closed') loadFeedback()
    } catch (err) {
      console.error('❌ Load error:', err)
    }
  }

  async function loadFeedback() {
    try {
      const res = await api.get(`/threads/${threadId}/feedback`)
      setFeedback(res.data)
    } catch {
      setFeedback(null)
    }
  }

  async function sendText(text) {
    if (!text || status === 'closed') {
      console.log('❌ Cannot send:', { text, status })
      return
    }
    
    const content = text.trim()
    if (!content) {
      console.log('❌ Empty content')
      return
    }

    console.log('📤 Sending:', content)

    try {
      const res = await api.post(`/threads/${threadId}/messages`, {
        role: 'doctor',
        content
      })
      
      console.log('✅ Response received:', res.data.length, 'messages')
      setMessages(res.data)
      
    } catch (err) {
      console.error('❌ Send failed:', err)
      alert('Failed to send message: ' + err.message)
    }
  }

  async function send() {
    await sendText(input)
    setInput('')
  }

  async function endDiagnosis() {
    const ok = confirm("End this session and generate feedback?")
    if (!ok) return

    const res = await api.post(`/threads/${threadId}/end`, {})
    onEnded?.(res.data)
    setStatus('closed')
    await loadFeedback()

    if (voiceMode) endVoice()
  }

  function downloadTranscript() {
    console.log('📄 Downloading transcript...')
    const lines = messages.map(m => {
      const role = m.role === 'doctor' ? 'Doctor' : 'Patient'
      const time = new Date(m.created_at).toLocaleTimeString()
      return `[${time}] ${role}: ${m.content}`
    })
    
    const header = `MediSim Transcript - ${title}\nGenerated: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n`
    const content = header + lines.join('\n\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'Session').replace(/\s+/g, '_')}_transcript.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    
    console.log('✅ Downloaded')
  }

  function startVoice() {
    if (!sttSupported || status === 'closed') return

    console.log('🎙️ STARTING VOICE MODE')
    setVoiceMode(true)
    lastSpokenIdRef.current = null
    
    setTimeout(() => {
      console.log('🎤 Starting mic with callback...')
      start({ onFinalText: handleFinalText })
    }, 300)
  }

  function endVoice() {
    console.log('🔇 ENDING VOICE MODE')
    setVoiceMode(false)
    stop()

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setAudioPlaying(false)
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
            Practice doctor–patient conversations with AI voice.
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
      <div className="px-6 py-3 border-b border-slate-200 bg-white/70 backdrop-blur-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={downloadTranscript}
            className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5" /> Transcript
          </button>
        </div>
        <div className="flex items-center gap-2">
          {sttSupported ? (
            <button
              disabled={status === 'closed'}
              onClick={() => (voiceMode ? endVoice() : startVoice())}
              className={`h-9 px-3 rounded-xl border flex items-center gap-2 transition-all ${
                voiceMode 
                  ? 'border-green-400 bg-green-50 shadow-md' 
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              {voiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span className="text-xs font-medium">
                {voiceMode ? 'Voice On' : 'Voice'}
              </span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-500 border border-slate-200 rounded-lg px-2 py-1">
              No mic
            </span>
          )}
          {status === 'open' ? (
            <button
              onClick={endDiagnosis}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-black flex items-center gap-2"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> End Diagnosis
            </button>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
              Read-only
            </span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-4">
        {feedback && <div className="mb-4"><FeedbackCard data={feedback} /></div>}
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-8">
            <p>No messages yet. Start speaking or typing!</p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} created_at={m.created_at} />
        ))}
      </div>

      <div className="p-4 border-t border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={status === 'closed' ? 'Read-only' : voiceMode ? 'Voice mode active...' : 'Type your message…'}
            disabled={status === 'closed' || voiceMode}
            className="flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500"
          />
          <button
            onClick={send}
            className="rounded-2xl px-4 py-3 bg-brand-600 text-white hover:bg-brand-700 shadow-soft flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!input.trim() || status === 'closed' || voiceMode}
          >
            <SendHorizontal className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>

      {voiceMode && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-8">
            <div
              className={`w-48 h-48 rounded-full transition-all duration-300 ${
                audioPlaying
                  ? 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-2xl shadow-blue-500/50 animate-pulse'
                  : listening
                  ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-2xl shadow-green-500/50'
                  : 'bg-gradient-to-br from-gray-400 to-gray-600'
              }`}
              style={{
                transform: `scale(${1 + (listening ? level * 0.4 : 0)})`,
              }}
            />

            {interim && !audioPlaying && (
              <div className="text-xl text-white max-w-[85vw] text-center bg-black/50 px-8 py-4 rounded-2xl">
                "{interim}"
              </div>
            )}

            <div className="text-white text-xl font-semibold">
              {audioPlaying ? (
                <span className="flex items-center gap-3">
                  <span className="w-4 h-4 bg-blue-400 rounded-full animate-pulse"></span>
                  Patient speaking...
                </span>
              ) : listening ? (
                <span className="flex items-center gap-3">
                  <span className="w-4 h-4 bg-green-400 rounded-full animate-pulse"></span>
                  Listening... (pause 3.5s)
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <span className="w-4 h-4 bg-gray-400 rounded-full"></span>
                  Starting...
                </span>
              )}
            </div>

            <button
              onClick={endVoice}
              className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center gap-3 font-semibold text-lg transition-all hover:scale-105"
            >
              <PhoneOff className="w-6 h-6" />
              End Voice
            </button>

            <div className="text-sm text-gray-400 text-center">
              <p>💬 Messages: {messages.length}</p>
              <p className="mt-1">🎤 Gemini AI + ElevenLabs Voice</p>
            </div>
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
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-soft ${
          isDoctor 
            ? 'bg-brand-600 text-white' 
            : 'bg-white border border-slate-200'
        }`}
      >
        <div className="text-xs opacity-70 mb-1">
          {isDoctor ? 'Doctor (You)' : 'Patient (AI)'}
        </div>
        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        <div className="text-[10px] opacity-50 mt-1">
          {new Date(created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}