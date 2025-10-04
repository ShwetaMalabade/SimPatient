// src/hooks/useSpeech.js
import { useEffect, useRef, useState } from 'react'

// Prime mic permission in the SAME click as start(); do NOT await this.
export function requestMicPermission() {
  if (!navigator?.mediaDevices?.getUserMedia) return Promise.resolve()
  return navigator.mediaDevices.getUserMedia({ audio: true })
    .then(s => { s.getTracks().forEach(t => t.stop()) })
    .catch(() => {}) // ignore; SpeechRecognition.start() will still error if blocked
}

export function useSpeech({
  onFinalText,     // (text) => void (final OR silence-flush)
  onInterimText,   // (text) => void
  onStart,         // () => void
  onEnd,           // () => void
  onError,         // (err) => void
  lang = 'en-US',
  silenceMs = 3500,
} = {}) {
  const recRef = useRef(null)
  const timerRef = useRef(null)
  const interimRef = useRef('')
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')

  useEffect(() => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Rec) { setSupported(false); return }
    setSupported(true)

    const rec = new Rec()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    const resetSilenceTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const flush = (interimRef.current || '').trim()
        if (flush && onFinalText) onFinalText(flush) // send whatever we heard on pause
        try { rec.stop() } catch {}
      }, silenceMs)
    }

    rec.onstart = () => { setListening(true); onStart && onStart(); resetSilenceTimer() }

    rec.onresult = (evt) => {
      resetSilenceTimer()
      let iText = ''
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const r = evt.results[i]
        if (r.isFinal) {
          const finalText = r[0].transcript.trim()
          interimRef.current = ''
          setInterim('')
          if (finalText && onFinalText) onFinalText(finalText)
        } else {
          iText += r[0].transcript
        }
      }
      interimRef.current = iText
      setInterim(iText)
      onInterimText && onInterimText(iText)
    }

    rec.onerror = (e) => { onError && onError(e) }

    rec.onend = () => {
      setListening(false)
      interimRef.current = ''
      setInterim('')
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      onEnd && onEnd()
    }

    recRef.current = rec
    return () => {
      try { rec.abort() } catch {}
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [lang, silenceMs, onFinalText, onInterimText, onStart, onEnd, onError])

  // IMPORTANT: synchronous start to preserve user-gesture chain
  function start() { try { recRef.current?.start() } catch (e) { onError && onError(e) } }
  function stop()  { try { recRef.current?.stop()  } catch (e) { onError && onError(e) } }

  return { supported, listening, interim, start, stop }
}

// Text-to-Speech hook
export function useTTS({ lang = 'en-US', rate = 1, pitch = 1, onEnd } = {}) {
  const [speaking, setSpeaking] = useState(false)
  const speak = (text) => {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang; u.rate = rate; u.pitch = pitch
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); onEnd && onEnd() }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }
  const cancel = () => { try { window.speechSynthesis.cancel() } catch {} ; setSpeaking(false) }
  return { speak, cancel, speaking }
}
